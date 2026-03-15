import type { DecisionAgent, DecisionAgentRequest } from "./decisionAgent.js";
import {
  DecisionAgentConfigSchema,
  DecisionContextSchema,
  DecisionProposalSchema,
  type DecisionAgentConfig,
  type DecisionContext,
  type DecisionProposal,
} from "./schemas.js";

export class GeminiDecisionAgent implements DecisionAgent {
  readonly mode = "gemini" as const;
  private static lastStartedAt = 0;
  private static queue: Promise<void> = Promise.resolve();
  private readonly config: DecisionAgentConfig;

  constructor(config: DecisionAgentConfig) {
    this.config = DecisionAgentConfigSchema.parse(config);
  }

  async propose(request: DecisionAgentRequest): Promise<DecisionProposal> {
    const context = DecisionContextSchema.parse(request.context);
    if (!this.config.apiKey) {
      throw new Error("Gemini decision agent is missing an API key.");
    }

    const payload = {
      contents: [{ parts: [{ text: buildPrompt(context, request) }] }],
      generationConfig: {
        temperature: 0,
        topP: 0.05,
        maxOutputTokens: 1536,
        responseMimeType: "application/json",
        responseJsonSchema: responseJsonSchema(),
      },
    };

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        const response = await this.request(payload);
        return DecisionProposalSchema.parse(normalizeProposalPayload(parseResponse(response)));
      } catch (error) {
        lastError = error;
        if (attempt >= this.config.maxRetries) break;
        await sleep(600 * 2 ** attempt);
      }
    }

    throw new Error(`Gemini decision agent failed: ${String(lastError)}`);
  }

  private async request(payload: Record<string, unknown>) {
    const endpoint = `${this.config.baseUrl.replace(/\/$/, "")}/models/${this.config.model}:generateContent`;
    await this.awaitRateLimitSlot();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.config.apiKey ?? "",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Gemini API request failed with HTTP ${response.status}. ${await safeErrorText(response)}`.trim());
      }
      return (await response.json()) as Record<string, unknown>;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async awaitRateLimitSlot() {
    const previous = GeminiDecisionAgent.queue;
    let release!: () => void;
    GeminiDecisionAgent.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const minIntervalMs = Math.max(0, this.config.minRequestIntervalSeconds * 1000);
    const waitMs = Math.max(0, minIntervalMs - (Date.now() - GeminiDecisionAgent.lastStartedAt));
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    GeminiDecisionAgent.lastStartedAt = Date.now();
    release();
  }
}

function buildPrompt(context: DecisionContext, request: DecisionAgentRequest) {
  const compactContext = {
    proposal: context.proposal,
    evidence: context.evidence,
    scorecard: context.scorecard,
    funding_package_draft: context.funding_package_draft,
    treasury_snapshot: context.treasury_snapshot,
    portfolio_context: context.portfolio_context,
    policy: context.policy,
  };

  const revision =
    request.violationCodes && request.violationCodes.length > 0
      ? {
          previous_proposal: request.previousProposal,
          verifier_violations: request.violationCodes,
        }
      : undefined;

  return [
    "You are the AutoVC funding decision agent.",
    "Return only JSON matching the configured schema.",
    "Do not exceed requested funding, deterministic funding draft, treasury capacity, or policy caps.",
    "Use reject when constraints or risk clearly block funding.",
    "Use accept only when near-full funding is justified; otherwise use accept_reduced.",
    "Milestones must sum exactly to approved_amount and deadlines must be strictly increasing.",
    `Context=${JSON.stringify(compactContext)}`,
    revision ? `Revision=${JSON.stringify(revision)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function responseJsonSchema() {
  return {
    type: "object",
    properties: {
      schema_version: { type: "string" },
      decision: { type: "string" },
      approved_amount: { type: "number" },
      milestones: {
        type: "array",
        items: {
          type: "object",
          properties: {
            amount: { type: "number" },
            deliverable_type: { type: "string" },
            verification_method: { type: "string" },
            deadline: { type: "string" },
          },
          required: ["amount", "deliverable_type", "verification_method", "deadline"],
        },
      },
      rationale: { type: "string" },
      score_inputs_used: { type: "array", items: { type: "string" } },
      assumptions: { type: "array", items: { type: "string" } },
      requested_revisions: { type: "array", items: { type: "string" } },
      confidence: { type: "number" },
      uncertainty_flags: { type: "array", items: { type: "string" } },
    },
    required: [
      "decision",
      "approved_amount",
      "milestones",
      "rationale",
      "score_inputs_used",
      "assumptions",
      "confidence",
      "uncertainty_flags",
    ],
  };
}

function parseResponse(payload: Record<string, unknown>) {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const texts: string[] = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const content = (candidate as Record<string, unknown>).content;
    if (!content || typeof content !== "object") continue;
    const parts = (content as Record<string, unknown>).parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      if (part && typeof part === "object") {
        const text = (part as Record<string, unknown>).text;
        if (typeof text === "string" && text.trim()) texts.push(text.trim());
      }
    }
  }

  const joined = texts.join("\n").trim();
  if (!joined) {
    throw new Error("Gemini API returned empty text.");
  }
  const normalized = joined.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(normalized);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Gemini API returned a non-object JSON payload.");
  }
  return parsed as Record<string, unknown>;
}

function normalizeProposalPayload(payload: Record<string, unknown>) {
  return {
    schema_version: "decision-v1",
    decision: typeof payload.decision === "string" ? payload.decision : "reject",
    approved_amount:
      typeof payload.approved_amount === "number"
        ? payload.approved_amount
        : Number(payload.approved_amount ?? 0),
    milestones: Array.isArray(payload.milestones) ? payload.milestones : [],
    rationale:
      typeof payload.rationale === "string" && payload.rationale.trim()
        ? payload.rationale.trim()
        : "Decision rationale unavailable.",
    score_inputs_used: Array.isArray(payload.score_inputs_used) ? payload.score_inputs_used : [],
    assumptions: Array.isArray(payload.assumptions) ? payload.assumptions : [],
    requested_revisions: Array.isArray(payload.requested_revisions)
      ? payload.requested_revisions
      : undefined,
    confidence: typeof payload.confidence === "number" ? payload.confidence : Number(payload.confidence ?? 0),
    uncertainty_flags: Array.isArray(payload.uncertainty_flags) ? payload.uncertainty_flags : [],
  };
}

async function safeErrorText(response: Response) {
  try {
    const payload = (await response.json()) as Record<string, unknown>;
    const error = payload.error;
    if (error && typeof error === "object") {
      const message = (error as Record<string, unknown>).message;
      return typeof message === "string" ? message.slice(0, 240) : "";
    }
    return "";
  } catch {
    try {
      return (await response.text()).slice(0, 240);
    } catch {
      return "";
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
