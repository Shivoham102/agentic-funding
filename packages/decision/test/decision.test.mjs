import assert from "node:assert/strict";

import { HeuristicDecisionAgent, reviewDecisionPackage, verifyDecisionPackage } from "../dist/index.js";

function buildContext() {
  return {
    proposal: {
      proposal_id: "prop_decision_1",
      name: "VectorFlow",
      category: "infrastructure",
      stage: "beta",
      requested_amount_usd: 180000,
      short_description: "Treasury automation for Solana teams.",
      description: "VectorFlow automates treasury controls and milestone-based release workflows.",
      requested_milestones: [
        {
          name: "Beta hardening",
          description: "Ship reliability and admin workflows.",
          target_days: 30,
          requested_release_ratio: 0.2,
        },
        {
          name: "Partner launches",
          description: "Launch design partners and KPI reporting.",
          target_days: 70,
          requested_release_ratio: 0.35,
        },
        {
          name: "General availability",
          description: "Release public product and verification tooling.",
          target_days: 110,
          requested_release_ratio: 0.45,
        },
      ],
    },
    evidence: {
      facts_count: 20,
      sources_count: 7,
      overall_confidence: 0.86,
      thin_evidence_categories: [],
      contradiction_flag_count: 0,
      raw_payload_hash: "bundle-strong",
    },
    scorecard: {
      overall_score: 78.54,
      confidence: 0.84,
      risk_classification: "medium",
      reason_codes: ["HIGH_CONFIDENCE_BASELINE", "MARKET_OPPORTUNITY_STRONG"],
      subscores: {
        team_quality: 76,
        market_opportunity: 83,
        product_feasibility: 79,
        capital_efficiency: 74,
        traction_signals: 72,
        risk_indicators: 63,
      },
    },
    funding_package_draft: {
      recommendation_label: "accept_reduced",
      requested_amount_usd: 180000,
      recommended_amount_usd: 159500,
      treasury_capacity_usd: 500000,
      rationale_codes: ["REDUCED_FUNDING_RECOMMENDED"],
      milestones: [
        {
          index: 1,
          amount_usd: 28750,
          deliverable_type: "beta_release",
          deadline: "P21D",
          verification_method: "deployment_proof",
          rationale_codes: ["INITIAL_RELEASE"],
        },
        {
          index: 2,
          amount_usd: 43000,
          deliverable_type: "feature_release",
          deadline: "P49D",
          verification_method: "repository_activity",
          rationale_codes: [],
        },
        {
          index: 3,
          amount_usd: 39875,
          deliverable_type: "usage_growth",
          deadline: "P84D",
          verification_method: "kpi_evidence",
          rationale_codes: [],
        },
        {
          index: 4,
          amount_usd: 47875,
          deliverable_type: "scale_readiness",
          deadline: "P126D",
          verification_method: "committee_validation",
          rationale_codes: ["FINAL_VERIFICATION_GATE"],
        },
      ],
    },
    treasury_snapshot: {
      total_capital_usd: 1000000,
      min_hot_reserve_usd: 150000,
      hot_reserve_usd: 180000,
      committed_reserve_usd: 120000,
      idle_treasury_usd: 600000,
      strategic_buffer_usd: 100000,
      available_for_new_commitments_usd: 500000,
    },
    portfolio_context: {
      active_approved_total_usd: 320000,
      active_project_count: 4,
      sector_exposure_usd: {
        infrastructure: 140000,
      },
    },
    policy: {
      treasury_total_usd: 1000000,
      strategic_buffer_usd: 100000,
      min_hot_reserve_usd: 150000,
      per_proposal_cap_ratio: 0.2,
      sector_exposure_cap_ratio: 0.35,
      minimum_fundable_score: 60,
      minimum_accept_score: 78,
      minimum_confidence: 0.45,
      high_risk_reject_below_score: 72,
      high_risk_min_confidence: 0.55,
      max_revision_attempts: 3,
      min_milestone_count: 2,
      max_milestone_count: 5,
    },
  };
}

class ScriptedAgent {
  constructor(proposals) {
    this.mode = "heuristic";
    this.proposals = [...proposals];
  }

  async propose() {
    const next = this.proposals.shift();
    if (!next) throw new Error("No more scripted proposals");
    return next;
  }
}

async function testBadDecisionFailsVerification() {
  const context = buildContext();
  const badDecision = {
    decision: "accept",
    approved_amount: 200000,
    milestones: [
      {
        amount: 90000,
        deliverable_type: "beta_release",
        verification_method: "deployment_proof",
        deadline: "P60D",
      },
      {
        amount: 50000,
        deliverable_type: "usage_growth",
        verification_method: "kpi_evidence",
        deadline: "P30D",
      },
    ],
    rationale: "Try to fully fund the proposal for testing.",
    score_inputs_used: ["overall_score"],
    assumptions: [],
    confidence: 0.9,
    uncertainty_flags: [],
  };
  const result = await verifyDecisionPackage(context, badDecision);
  assert.equal(result.passed, false);
  assert(result.violation_codes.includes("APPROVED_EXCEEDS_REQUESTED"));
  assert(result.violation_codes.includes("MILESTONE_SUM_MISMATCH"));
  assert(result.violation_codes.includes("MILESTONE_DEADLINES_NON_MONOTONE"));
}

async function testHeuristicDecisionPassesVerification() {
  const context = buildContext();
  const proposal = await new HeuristicDecisionAgent().propose({ context, attempt: 1 });
  const result = await verifyDecisionPackage(context, proposal);
  assert.equal(result.passed, true);
  assert.equal(proposal.decision, "accept_reduced");
}

async function testRevisionLoopRepairsBadFirstAttempt() {
  const context = buildContext();
  const review = await reviewDecisionPackage(context, {
    agent: new ScriptedAgent([
      {
        decision: "accept",
        approved_amount: 220000,
        milestones: [
          {
            amount: 100000,
            deliverable_type: "beta_release",
            verification_method: "deployment_proof",
            deadline: "P40D",
          },
          {
            amount: 100000,
            deliverable_type: "usage_growth",
            verification_method: "kpi_evidence",
            deadline: "P20D",
          },
        ],
        rationale: "Over-approve on first pass for testing.",
        score_inputs_used: ["overall_score"],
        assumptions: [],
        confidence: 0.7,
        uncertainty_flags: ["treasury_constrained"],
      },
      await new HeuristicDecisionAgent().propose({ context, attempt: 2 }),
    ]),
  });
  assert.equal(review.approved_for_execution, true);
  assert.equal(review.revision_attempts, 2);
  assert.equal(review.attempts[0].verifier_result.passed, false);
  assert.equal(review.attempts[1].verifier_result.passed, true);
}

async function testRejectPassesWhenPortfolioAlreadyExceedsSafetyCap() {
  const context = buildContext();
  context.portfolio_context.active_approved_total_usd = 900000;
  context.portfolio_context.sector_exposure_usd.infrastructure = 500000;
  context.treasury_snapshot.hot_reserve_usd = 120000;

  const proposal = {
    decision: "reject",
    approved_amount: 0,
    milestones: [],
    rationale: "Reject due to portfolio constraints.",
    score_inputs_used: ["overall_score", "treasury_snapshot.available_for_new_commitments_usd"],
    assumptions: [],
    confidence: 0.4,
    uncertainty_flags: ["treasury_constrained"],
  };

  const result = await verifyDecisionPackage(context, proposal);
  assert.equal(result.passed, true);
}

await testBadDecisionFailsVerification();
console.log("ok verifier rejects bad recommendation with explicit violation codes");

await testHeuristicDecisionPassesVerification();
console.log("ok heuristic decision package passes Z3 policy verification");

await testRevisionLoopRepairsBadFirstAttempt();
console.log("ok revision loop accepts a later repaired proposal");

await testRejectPassesWhenPortfolioAlreadyExceedsSafetyCap();
console.log("ok reject packages still verify when they add no new treasury pressure");
