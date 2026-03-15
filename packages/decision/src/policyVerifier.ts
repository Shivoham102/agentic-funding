import { init } from "z3-solver";

import {
  DecisionContextSchema,
  DecisionProposalSchema,
  VerifierResultSchema,
  decisionConstants,
  type DecisionContext,
  type DecisionProposal,
  type VerifierResult,
} from "./schemas.js";

type Z3Context = Awaited<ReturnType<typeof loadZ3Context>>;

type NormalizedInputs = {
  context: DecisionContext;
  proposal: DecisionProposal;
  approvedCents: number;
  requestedCents: number;
  deterministicCapCents: number;
  treasuryCapacityCents: number;
  perProposalCapCents: number;
  activeApprovedCents: number;
  categoryExposureCents: number;
  sectorCapCents: number;
  treasurySafetyCapCents: number;
  milestoneAmountsCents: number[];
  deadlineOrdinals: Array<number | null>;
  sumMilestoneCents: number;
};

type CheckDefinition = {
  code: string;
  message: string;
  path?: string;
  constraint: (ctx: Z3Context, normalized: NormalizedInputs) => any;
};

let z3InitPromise: Promise<Awaited<ReturnType<typeof init>>> | null = null;

export async function verifyDecisionPackage(
  contextInput: unknown,
  proposalInput: unknown,
): Promise<VerifierResult> {
  const context = DecisionContextSchema.parse(contextInput);
  const proposal = DecisionProposalSchema.parse(proposalInput);
  const normalized = normalizeInputs(context, proposal);
  const z3 = await loadZ3Context();
  const checks = buildChecks();
  const checkResults = await Promise.all(
    checks.map(async (check) => {
      const solver = new z3.Solver();
      solver.add(check.constraint(z3, normalized));
      const result = await solver.check();
      return {
        code: check.code,
        passed: result === "sat",
        message: check.message,
        path: check.path,
      };
    }),
  );
  const violationCodes = checkResults
    .filter((check) => !check.passed)
    .map((check) => check.code)
    .sort();
  const violationSet = new Set(violationCodes);

  return VerifierResultSchema.parse({
    schema_version: decisionConstants.verifierSchemaVersion,
    passed: violationCodes.length === 0,
    approved_for_execution: violationCodes.length === 0,
    violation_codes: violationCodes,
    violations: checkResults
      .filter((check) => violationSet.has(check.code))
      .map((check) => ({
        code: check.code,
        message: check.message,
        path: check.path,
      })),
    check_results: checkResults.map((check) => ({
      code: check.code,
      passed: check.passed,
      message: check.message,
    })),
  });
}

function buildChecks(): CheckDefinition[] {
  return [
    {
      code: "APPROVED_AMOUNT_NEGATIVE",
      message: "Approved amount must be non-negative.",
      path: "approved_amount",
      constraint: (ctx, input) => ctx.Int.val(input.approvedCents).ge(0),
    },
    {
      code: "APPROVED_EXCEEDS_REQUESTED",
      message: "Approved amount cannot exceed the founder request.",
      path: "approved_amount",
      constraint: (ctx, input) => ctx.Int.val(input.approvedCents).le(input.requestedCents),
    },
    {
      code: "APPROVED_EXCEEDS_DETERMINISTIC_DRAFT",
      message: "Approved amount cannot exceed the deterministic funding draft.",
      path: "approved_amount",
      constraint: (ctx, input) => ctx.Int.val(input.approvedCents).le(input.deterministicCapCents),
    },
    {
      code: "APPROVED_EXCEEDS_TREASURY_CAPACITY",
      message: "Approved amount cannot exceed treasury commitment capacity.",
      path: "approved_amount",
      constraint: (ctx, input) => ctx.Int.val(input.approvedCents).le(input.treasuryCapacityCents),
    },
    {
      code: "APPROVED_EXCEEDS_PER_PROPOSAL_CAP",
      message: "Approved amount exceeds the per-proposal policy cap.",
      path: "approved_amount",
      constraint: (ctx, input) => ctx.Int.val(input.approvedCents).le(input.perProposalCapCents),
    },
    {
      code: "REJECT_MUST_ZERO",
      message: "Reject decisions must set approved_amount to zero.",
      path: "approved_amount",
      constraint: (ctx, input) =>
        input.proposal.decision === "reject"
          ? ctx.Int.val(input.approvedCents).eq(0)
          : ctx.Bool.val(true),
    },
    {
      code: "APPROVED_ZERO_FOR_NON_REJECT",
      message: "Non-reject decisions must approve a positive amount.",
      path: "approved_amount",
      constraint: (ctx, input) =>
        input.proposal.decision !== "reject"
          ? ctx.Int.val(input.approvedCents).gt(0)
          : ctx.Bool.val(true),
    },
    {
      code: "REJECT_MUST_HAVE_NO_MILESTONES",
      message: "Reject decisions must not include milestone releases.",
      path: "milestones",
      constraint: (ctx, input) =>
        input.proposal.decision === "reject"
          ? ctx.Int.val(input.proposal.milestones.length).eq(0)
          : ctx.Bool.val(true),
    },
    {
      code: "MILESTONE_COUNT_OUT_OF_RANGE",
      message: "Approved proposals must have an allowed number of milestones.",
      path: "milestones",
      constraint: (ctx, input) =>
        input.proposal.decision === "reject"
          ? ctx.Bool.val(true)
          : ctx.And(
              ctx.Int.val(input.proposal.milestones.length).ge(input.context.policy.min_milestone_count),
              ctx.Int.val(input.proposal.milestones.length).le(input.context.policy.max_milestone_count),
            ),
    },
    {
      code: "MILESTONE_SUM_MISMATCH",
      message: "Milestone amounts must sum exactly to the approved amount.",
      path: "milestones",
      constraint: (ctx, input) =>
        input.proposal.decision === "reject"
          ? ctx.Int.val(input.sumMilestoneCents).eq(0)
          : ctx.Int.val(input.sumMilestoneCents).eq(input.approvedCents),
    },
    {
      code: "MILESTONE_AMOUNT_NON_POSITIVE",
      message: "All milestone amounts must be strictly positive for approved proposals.",
      path: "milestones",
      constraint: (ctx, input) =>
        input.proposal.decision === "reject"
          ? ctx.Bool.val(true)
          : ctx.And(...input.milestoneAmountsCents.map((amount) => ctx.Int.val(amount).gt(0))),
    },
    {
      code: "MILESTONE_DEADLINE_INVALID",
      message: "Each milestone deadline must be parseable as an ISO date or PnD duration.",
      path: "milestones",
      constraint: (ctx, input) =>
        input.proposal.decision === "reject"
          ? ctx.Bool.val(true)
          : ctx.And(...input.deadlineOrdinals.map((value) => ctx.Bool.val(value !== null))),
    },
    {
      code: "MILESTONE_DEADLINES_NON_MONOTONE",
      message: "Milestone deadlines must be strictly increasing.",
      path: "milestones",
      constraint: (ctx, input) =>
        input.proposal.decision === "reject"
          ? ctx.Bool.val(true)
          : ctx.And(
              ...input.deadlineOrdinals
                .slice(1)
                .map((value, index) =>
                  ctx.Int.val(value ?? 0).gt(ctx.Int.val(input.deadlineOrdinals[index] ?? 0)),
                ),
            ),
    },
    {
      code: "TREASURY_SAFETY_CAP_EXCEEDED",
      message: "Total active approvals plus this package exceed treasury safety capacity.",
      path: "approved_amount",
      constraint: (ctx, input) =>
        input.proposal.decision === "reject"
          ? ctx.Bool.val(true)
          : ctx.Int.val(input.activeApprovedCents + input.approvedCents).le(input.treasurySafetyCapCents),
    },
    {
      code: "HOT_RESERVE_BELOW_MINIMUM",
      message: "Hot reserve must remain above the configured minimum.",
      path: "treasury_snapshot.hot_reserve_usd",
      constraint: (ctx, input) =>
        input.proposal.decision === "reject"
          ? ctx.Bool.val(true)
          : ctx.Int.val(toCents(input.context.treasury_snapshot.hot_reserve_usd)).ge(
              toCents(input.context.treasury_snapshot.min_hot_reserve_usd),
            ),
    },
    {
      code: "SECTOR_EXPOSURE_CAP_EXCEEDED",
      message: "Sector exposure cap would be exceeded by this approval.",
      path: "proposal.category",
      constraint: (ctx, input) =>
        input.proposal.decision === "reject"
          ? ctx.Bool.val(true)
          : ctx.Int.val(input.categoryExposureCents + input.approvedCents).le(input.sectorCapCents),
    },
    {
      code: "HIGH_RISK_REJECT_REQUIRED",
      message: "High-risk proposals below the policy floor must be rejected.",
      path: "decision",
      constraint: (ctx, input) => {
        const mustReject =
          input.context.scorecard.risk_classification === "high" &&
          (input.context.scorecard.overall_score < input.context.policy.high_risk_reject_below_score ||
            input.context.scorecard.confidence < input.context.policy.high_risk_min_confidence);
        return mustReject ? ctx.Bool.val(input.proposal.decision === "reject") : ctx.Bool.val(true);
      },
    },
    {
      code: "HIGH_RISK_FULL_ACCEPT_BLOCKED",
      message: "High-risk proposals cannot use the full accept label.",
      path: "decision",
      constraint: (ctx, input) =>
        input.context.scorecard.risk_classification === "high"
          ? ctx.Bool.val(input.proposal.decision !== "accept")
          : ctx.Bool.val(true),
    },
    {
      code: "ACCEPT_LABEL_REQUIRES_NEAR_FULL_AMOUNT",
      message: "Accept decisions require near-full funding support.",
      path: "decision",
      constraint: (ctx, input) =>
        input.proposal.decision === "accept"
          ? ctx.Int.val(input.approvedCents).ge(Math.round(input.requestedCents * 0.9))
          : ctx.Bool.val(true),
    },
    {
      code: "ACCEPT_REDUCED_MUST_BE_BELOW_REQUESTED",
      message: "accept_reduced decisions must stay below the requested amount.",
      path: "decision",
      constraint: (ctx, input) =>
        input.proposal.decision === "accept_reduced"
          ? ctx.Int.val(input.approvedCents).lt(input.requestedCents)
          : ctx.Bool.val(true),
    },
  ];
}

function normalizeInputs(context: DecisionContext, proposal: DecisionProposal): NormalizedInputs {
  return {
    context,
    proposal,
    approvedCents: toCents(proposal.approved_amount),
    requestedCents: toCents(context.proposal.requested_amount_usd),
    deterministicCapCents: toCents(context.funding_package_draft.recommended_amount_usd),
    treasuryCapacityCents: toCents(context.treasury_snapshot.available_for_new_commitments_usd),
    perProposalCapCents: toCents(context.policy.treasury_total_usd * context.policy.per_proposal_cap_ratio),
    activeApprovedCents: toCents(context.portfolio_context.active_approved_total_usd),
    categoryExposureCents: toCents(
      context.portfolio_context.sector_exposure_usd[context.proposal.category] ?? 0,
    ),
    sectorCapCents: toCents(context.policy.treasury_total_usd * context.policy.sector_exposure_cap_ratio),
    treasurySafetyCapCents: toCents(
      context.policy.treasury_total_usd -
        context.policy.strategic_buffer_usd -
        context.policy.min_hot_reserve_usd,
    ),
    milestoneAmountsCents: proposal.milestones.map((item) => toCents(item.amount)),
    deadlineOrdinals: proposal.milestones.map((item) => parseDeadlineOrdinal(item.deadline)),
    sumMilestoneCents: proposal.milestones.reduce((sum, item) => sum + toCents(item.amount), 0),
  };
}

async function loadZ3Context() {
  if (!z3InitPromise) {
    z3InitPromise = init();
  }
  const { Context } = await z3InitPromise;
  return new Context("decision");
}

function toCents(value: number) {
  return Math.round(value * 100);
}

function parseDeadlineOrdinal(value: string): number | null {
  const normalized = value.trim().toUpperCase();
  const durationMatch = normalized.match(/^P(\d+)D$/);
  if (durationMatch) {
    return Number(durationMatch[1]);
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 86_400_000) : null;
}
