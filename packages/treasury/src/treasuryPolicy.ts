import { z } from "zod";

import type { MeteoraVaultDetails } from "./meteoraVault.js";

export const UpcomingMilestoneSchema = z.object({
  projectId: z.string().min(1),
  milestoneId: z.string().min(1),
  amountUsd: z.number().finite().nonnegative(),
  dueInDays: z.number().finite().nonnegative().optional(),
  dueAt: z.string().datetime().optional(),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
});

export const TreasuryStateSchema = z.object({
  totalCapitalUsd: z.number().finite().nonnegative(),
  minHotReserveUsd: z.number().finite().nonnegative(),
  strategicBufferUsd: z.number().finite().nonnegative(),
  hotReserveWindowDays: z.number().int().min(1).max(365).default(30),
  maxIdleDeploymentRatio: z.number().min(0).max(1).default(0.85),
  maxSingleVaultAllocationRatio: z.number().min(0).max(1).default(0.6),
});

export const BucketsSchema = z.object({
  totalCapitalUsd: z.number().finite().nonnegative(),
  hotReserveUsd: z.number().finite().nonnegative(),
  committedReserveUsd: z.number().finite().nonnegative(),
  idleTreasuryUsd: z.number().finite().nonnegative(),
  strategicBufferUsd: z.number().finite().nonnegative(),
  protectedCapitalUsd: z.number().finite().nonnegative(),
  availableForNewCommitmentsUsd: z.number().finite().nonnegative(),
  unallocatedShortfallUsd: z.number().finite().nonnegative(),
  hotReserveFloorUsd: z.number().finite().nonnegative(),
  windowedMilestonePayoutUsd: z.number().finite().nonnegative(),
  maxIdleDeploymentRatio: z.number().min(0).max(1),
  maxSingleVaultAllocationRatio: z.number().min(0).max(1),
});

export const MarketConditionsSchema = z.object({
  riskOff: z.boolean().default(false),
  volatilityScore: z.number().min(0).max(100).default(30),
  liquidityStressScore: z.number().min(0).max(100).default(20),
  withdrawalDemandScore: z.number().min(0).max(100).default(20),
  minimumAverageApyPct: z.number().finite().nonnegative().default(2),
  minimumWithdrawableCoverageRatio: z.number().min(0).max(1).default(0.4),
  minimumStrategyCount: z.number().int().min(1).default(1),
  vaults: z.array(z.custom<MeteoraVaultDetails>()).default([]),
});

export const AllocationActionSchema = z.object({
  action: z.enum(["deposit_dynamic_vault", "hold_idle_cash"]),
  tokenSymbol: z.string().min(1),
  amountUsd: z.number().finite().nonnegative(),
  expectedApyPct: z.number().finite().nonnegative().optional(),
  rationaleCodes: z.array(z.string().min(1)).default([]),
});

export const AllocationPlanSchema = z.object({
  allocatableIdleUsd: z.number().finite().nonnegative(),
  heldBackIdleUsd: z.number().finite().nonnegative(),
  weightedExpectedApyPct: z.number().finite().nonnegative(),
  actions: z.array(AllocationActionSchema),
  rationaleCodes: z.array(z.string().min(1)).default([]),
});

export type UpcomingMilestone = z.infer<typeof UpcomingMilestoneSchema>;
export type TreasuryState = z.infer<typeof TreasuryStateSchema>;
export type Buckets = z.infer<typeof BucketsSchema>;
export type MarketConditions = z.infer<typeof MarketConditionsSchema>;
export type AllocationPlan = z.infer<typeof AllocationPlanSchema>;

export function computeBuckets(
  treasuryStateInput: unknown,
  upcomingMilestonesInput: unknown,
): Buckets {
  const treasuryState = TreasuryStateSchema.parse(treasuryStateInput);
  const upcomingMilestones = z.array(UpcomingMilestoneSchema).parse(upcomingMilestonesInput);

  const windowedMilestonePayoutUsd = round(
    upcomingMilestones
      .filter((milestone) => resolveDueInDays(milestone) <= treasuryState.hotReserveWindowDays)
      .reduce((sum, milestone) => sum + milestone.amountUsd, 0),
  );
  const committedReserveUsd = round(
    upcomingMilestones
      .filter((milestone) => resolveDueInDays(milestone) > treasuryState.hotReserveWindowDays)
      .reduce((sum, milestone) => sum + milestone.amountUsd, 0),
  );

  const hotReserveUsd = round(Math.max(treasuryState.minHotReserveUsd, windowedMilestonePayoutUsd));
  const protectedCapitalUsd = round(
    hotReserveUsd + committedReserveUsd + treasuryState.strategicBufferUsd,
  );
  const idleTreasuryUsd = round(Math.max(0, treasuryState.totalCapitalUsd - protectedCapitalUsd));
  const unallocatedShortfallUsd = round(
    Math.max(0, protectedCapitalUsd - treasuryState.totalCapitalUsd),
  );

  return BucketsSchema.parse({
    totalCapitalUsd: round(treasuryState.totalCapitalUsd),
    hotReserveUsd,
    committedReserveUsd,
    idleTreasuryUsd,
    strategicBufferUsd: round(treasuryState.strategicBufferUsd),
    protectedCapitalUsd,
    availableForNewCommitmentsUsd: idleTreasuryUsd,
    unallocatedShortfallUsd,
    hotReserveFloorUsd: round(treasuryState.minHotReserveUsd),
    windowedMilestonePayoutUsd,
    maxIdleDeploymentRatio: treasuryState.maxIdleDeploymentRatio,
    maxSingleVaultAllocationRatio: treasuryState.maxSingleVaultAllocationRatio,
  });
}

export function proposeIdleAllocation(
  bucketsInput: unknown,
  marketConditionsInput: unknown,
): AllocationPlan {
  const buckets = BucketsSchema.parse(bucketsInput);
  const marketConditions = MarketConditionsSchema.parse(marketConditionsInput);

  if (buckets.idleTreasuryUsd <= 0 || buckets.unallocatedShortfallUsd > 0) {
    return holdAllIdle(buckets, ["IDLE_CAPITAL_UNAVAILABLE"]);
  }

  const deployableRatio = marketConditions.riskOff
    ? 0
    : clamp(
        1 -
          marketConditions.volatilityScore * 0.004 -
          marketConditions.liquidityStressScore * 0.003 -
          marketConditions.withdrawalDemandScore * 0.003,
        0.15,
        1,
      );
  const allocatableIdleUsd = round(
    Math.min(
      buckets.idleTreasuryUsd * deployableRatio,
      buckets.idleTreasuryUsd * buckets.maxIdleDeploymentRatio,
    ),
  );
  if (allocatableIdleUsd <= 0) {
    return holdAllIdle(buckets, ["RISK_OFF_MARKET"]);
  }

  const eligibleVaults = marketConditions.vaults
    .map((vault) => ({ vault, score: scoreVault(vault, allocatableIdleUsd, marketConditions) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  if (eligibleVaults.length === 0) {
    return holdAllIdle(buckets, ["NO_ELIGIBLE_METEORA_VAULT"]);
  }

  const topVaults = eligibleVaults.slice(0, 2);
  const totalScore = topVaults.reduce((sum, item) => sum + item.score, 0);
  const maxSingleVaultRatio = Math.min(
    1,
    buckets.maxSingleVaultAllocationRatio,
    buckets.idleTreasuryUsd > 0 ? allocatableIdleUsd / buckets.idleTreasuryUsd : 0,
  );

  let remainingUsd = allocatableIdleUsd;
  const actions: AllocationPlan["actions"] = topVaults.map((item, index) => {
    const uncappedRatio = totalScore > 0 ? item.score / totalScore : 0;
    const cappedRatio = Math.min(
      uncappedRatio,
      maxSingleVaultRatio,
    );
    const amountUsd =
      index === topVaults.length - 1 ? round(remainingUsd) : round(allocatableIdleUsd * cappedRatio);
    remainingUsd = round(Math.max(0, remainingUsd - amountUsd));
    return {
      action: "deposit_dynamic_vault" as const,
      tokenSymbol: item.vault.tokenSymbol,
      amountUsd,
      expectedApyPct: round(item.vault.apy.averagePct ?? item.vault.apy.currentPct ?? 0, 4),
      rationaleCodes: buildVaultRationaleCodes(item.vault, item.score),
    };
  });

  const depositedUsd = round(actions.reduce((sum, action) => sum + action.amountUsd, 0));
  const heldBackIdleUsd = round(Math.max(0, buckets.idleTreasuryUsd - depositedUsd));
  if (heldBackIdleUsd > 0) {
    actions.push({
      action: "hold_idle_cash",
      tokenSymbol: "USD",
      amountUsd: heldBackIdleUsd,
      rationaleCodes: ["IDLE_BUFFER_RETAINED"],
    });
  }

  const weightedExpectedApyPct =
    depositedUsd > 0
      ? round(
          actions
            .filter((action) => action.action === "deposit_dynamic_vault")
            .reduce(
              (sum, action) => sum + action.amountUsd * (action.expectedApyPct ?? 0),
              0,
            ) / depositedUsd,
          4,
        )
      : 0;

  return AllocationPlanSchema.parse({
    allocatableIdleUsd: depositedUsd,
    heldBackIdleUsd,
    weightedExpectedApyPct,
    actions,
    rationaleCodes: buildPlanRationaleCodes(marketConditions, topVaults.length, heldBackIdleUsd),
  });
}

function scoreVault(
  vault: MeteoraVaultDetails,
  allocatableIdleUsd: number,
  marketConditions: MarketConditions,
): number {
  const averageApyPct = vault.apy.averagePct ?? vault.apy.currentPct ?? 0;
  const withdrawableUsd = vault.withdrawableUsd ?? 0;
  const strategyCount = vault.strategies.length;
  const withdrawableCoverageRatio = allocatableIdleUsd > 0 ? withdrawableUsd / allocatableIdleUsd : 0;
  const safeUtilizationPct = averageDefined(vault.strategies.map((strategy) => strategy.safeUtilizationPct));
  const utilizationPct = averageDefined(vault.strategies.map((strategy) => strategy.utilizationPct));
  const utilizationHeadroom = clamp((safeUtilizationPct - utilizationPct) / 100, 0, 1);

  if (averageApyPct < marketConditions.minimumAverageApyPct) {
    return 0;
  }
  if (withdrawableCoverageRatio < marketConditions.minimumWithdrawableCoverageRatio) {
    return 0;
  }
  if (strategyCount < marketConditions.minimumStrategyCount) {
    return 0;
  }

  return round(
    averageApyPct * 0.45 +
      clamp(withdrawableCoverageRatio, 0, 2) * 100 * 0.3 +
      clamp(strategyCount / 4, 0, 1) * 100 * 0.15 +
      utilizationHeadroom * 100 * 0.1,
    6,
  );
}

function buildVaultRationaleCodes(vault: MeteoraVaultDetails, score: number): string[] {
  return [
    score >= 50 ? "VAULT_SCORE_STRONG" : "VAULT_SCORE_ACCEPTABLE",
    (vault.apy.averagePct ?? 0) >= 5 ? "APY_ATTRACTIVE" : "APY_MODEST",
    (vault.withdrawableUsd ?? 0) > 0 ? "WITHDRAWABILITY_VERIFIED" : "WITHDRAWABILITY_UNKNOWN",
    vault.strategies.length >= 2 ? "STRATEGY_DIVERSIFIED" : "STRATEGY_CONCENTRATED",
  ];
}

function buildPlanRationaleCodes(
  marketConditions: MarketConditions,
  selectedVaultCount: number,
  heldBackIdleUsd: number,
): string[] {
  const codes = [
    marketConditions.riskOff ? "RISK_OFF_MARKET" : "RISK_MANAGED_IDLE_DEPLOYMENT",
    selectedVaultCount > 1 ? "MULTI_VAULT_DIVERSIFICATION" : "SINGLE_VAULT_ALLOCATION",
  ];
  if (heldBackIdleUsd > 0) {
    codes.push("IDLE_BUFFER_RETAINED");
  }
  if (marketConditions.volatilityScore >= 60) {
    codes.push("VOLATILITY_CAPPED_DEPLOYMENT");
  }
  return codes;
}

function holdAllIdle(buckets: Buckets, rationaleCodes: string[]): AllocationPlan {
  return AllocationPlanSchema.parse({
    allocatableIdleUsd: 0,
    heldBackIdleUsd: round(buckets.idleTreasuryUsd),
    weightedExpectedApyPct: 0,
    actions: [
      {
        action: "hold_idle_cash",
        tokenSymbol: "USD",
        amountUsd: round(buckets.idleTreasuryUsd),
        rationaleCodes,
      },
    ],
    rationaleCodes,
  });
}

function resolveDueInDays(milestone: UpcomingMilestone): number {
  if (typeof milestone.dueInDays === "number" && Number.isFinite(milestone.dueInDays)) {
    return milestone.dueInDays;
  }
  if (!milestone.dueAt) {
    return Number.POSITIVE_INFINITY;
  }
  const now = Date.now();
  const dueAt = Date.parse(milestone.dueAt);
  if (!Number.isFinite(dueAt)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, Math.ceil((dueAt - now) / 86_400_000));
}

function averageDefined(values: Array<number | undefined>): number {
  const numericValues = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numericValues.length === 0) {
    return 0;
  }
  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
}

function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
