import {
  HeuristicDecisionAgent,
  normalizeDecisionAgentConfig,
  type DecisionAgent,
} from "./decisionAgent.js";
import { GeminiDecisionAgent } from "./geminiDecisionAgent.js";
import { verifyDecisionPackage } from "./policyVerifier.js";
import {
  DecisionContextSchema,
  DecisionReviewSchema,
  type DecisionAgentConfig,
  type DecisionReview,
} from "./schemas.js";

export interface ReviewOptions {
  agentConfig?: Partial<DecisionAgentConfig>;
  agent?: DecisionAgent;
}

export async function reviewDecisionPackage(
  contextInput: unknown,
  options: ReviewOptions = {},
): Promise<DecisionReview> {
  const context = DecisionContextSchema.parse(contextInput);
  const agentConfig = normalizeDecisionAgentConfig(options.agentConfig ?? {});
  const warnings: string[] = [];
  let agent = options.agent ?? buildAgent(agentConfig);
  let agentModeUsed = agent.mode;
  const attempts: DecisionReview["attempts"] = [];
  let previousProposal: DecisionReview["decision_package"] | undefined;
  let violationCodes: string[] = [];

  for (let attempt = 1; attempt <= context.policy.max_revision_attempts; attempt += 1) {
    let proposal;
    try {
      proposal = await agent.propose({
        context,
        attempt,
        previousProposal,
        violationCodes,
      });
    } catch (error) {
      if (agent.mode === "gemini" && agentConfig.allowHeuristicFallback) {
        warnings.push(
          `Gemini decision proposal failed on attempt ${attempt}; fell back to heuristic repair. ${summarizeError(error)}`,
        );
        agent = new HeuristicDecisionAgent("heuristic_fallback");
        agentModeUsed = agent.mode;
        proposal = await agent.propose({
          context,
          attempt,
          previousProposal,
          violationCodes,
        });
      } else {
        throw error;
      }
    }

    const verifierResult = await verifyDecisionPackage(context, proposal);
    attempts.push({
      attempt,
      agent_mode: agent.mode,
      decision_package: proposal,
      verifier_result: verifierResult,
    });

    if (verifierResult.passed) {
      return DecisionReviewSchema.parse({
        schema_version: "decision-review-v1",
        approved_for_execution: true,
        agent_mode_used: agentModeUsed,
        decision_package: proposal,
        verifier_result: verifierResult,
        revision_attempts: attempts.length,
        attempts,
        warnings,
      });
    }

    previousProposal = proposal;
    violationCodes = verifierResult.violation_codes;
  }

  const fallbackProposal = await new HeuristicDecisionAgent("heuristic").propose({
    context,
    attempt: 1,
  });
  const fallbackVerifier = await verifyDecisionPackage(context, fallbackProposal);
  const finalAttempt = attempts[attempts.length - 1];

  return DecisionReviewSchema.parse({
    schema_version: "decision-review-v1",
    approved_for_execution: false,
    agent_mode_used: agentModeUsed,
    decision_package: finalAttempt?.decision_package ?? fallbackProposal,
    verifier_result: finalAttempt?.verifier_result ?? fallbackVerifier,
    revision_attempts: attempts.length,
    attempts,
    warnings,
  });
}

function buildAgent(config: DecisionAgentConfig): DecisionAgent {
  if (config.mode === "heuristic" || config.mode === "heuristic_fallback") {
    return new HeuristicDecisionAgent(config.mode);
  }
  return new GeminiDecisionAgent(config);
}

function summarizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").trim().slice(0, 240);
}
