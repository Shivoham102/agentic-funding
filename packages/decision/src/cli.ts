import { DecisionAgentConfigSchema, DecisionContextSchema } from "./schemas.js";
import { reviewDecisionPackage } from "./review.js";

interface DecisionCliRequest {
  proposal?: unknown;
  evidence?: unknown;
  scorecard?: unknown;
  fundingPackageDraft?: unknown;
  treasurySnapshot?: unknown;
  portfolioContext?: unknown;
  policy?: unknown;
  agent?: unknown;
}

async function main() {
  try {
    const payload = parsePayload(await readStdin());
    const context = DecisionContextSchema.parse({
      proposal: payload.proposal ?? {},
      evidence: payload.evidence ?? {},
      scorecard: payload.scorecard ?? {},
      funding_package_draft: payload.fundingPackageDraft ?? {},
      treasury_snapshot: payload.treasurySnapshot ?? {},
      portfolio_context: payload.portfolioContext ?? {},
      policy: payload.policy ?? {},
    });
    const review = await reviewDecisionPackage(context, {
      agentConfig: DecisionAgentConfigSchema.parse(payload.agent ?? {}),
    });
    process.stdout.write(JSON.stringify({ ok: true, review }, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(JSON.stringify({ ok: false, error: message }));
    process.exitCode = 1;
  }
}

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function parsePayload(input: string): DecisionCliRequest {
  if (!input.trim()) return {};
  const parsed = JSON.parse(input);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Decision CLI expects a JSON object payload.");
  }
  return parsed as DecisionCliRequest;
}

void main();
