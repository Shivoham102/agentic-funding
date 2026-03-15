import assert from "node:assert/strict";

import {
  computeBuckets,
  MeteoraVaultClient,
  proposeIdleAllocation,
  RateLimitedHttpClient,
} from "../dist/index.js";

let failures = 0;

await run("computeBuckets partitions protected and idle capital deterministically", async () => {
  const buckets = computeBuckets(
    {
      totalCapitalUsd: 1_000_000,
      minHotReserveUsd: 150_000,
      strategicBufferUsd: 100_000,
      hotReserveWindowDays: 30,
      maxIdleDeploymentRatio: 0.85,
      maxSingleVaultAllocationRatio: 0.6,
    },
    [
      { projectId: "p1", milestoneId: "m1", amountUsd: 50_000, dueInDays: 7 },
      { projectId: "p2", milestoneId: "m2", amountUsd: 80_000, dueInDays: 21 },
      { projectId: "p3", milestoneId: "m3", amountUsd: 200_000, dueInDays: 45 },
    ],
  );

  assert.deepStrictEqual(buckets, {
    totalCapitalUsd: 1_000_000,
    hotReserveUsd: 150_000,
    committedReserveUsd: 200_000,
    idleTreasuryUsd: 550_000,
    strategicBufferUsd: 100_000,
    protectedCapitalUsd: 450_000,
    availableForNewCommitmentsUsd: 550_000,
    unallocatedShortfallUsd: 0,
    hotReserveFloorUsd: 150_000,
    windowedMilestonePayoutUsd: 130_000,
    maxIdleDeploymentRatio: 0.85,
    maxSingleVaultAllocationRatio: 0.6,
  });
});

await run("proposeIdleAllocation respects idle caps and Meteora vault quality", async () => {
  const buckets = computeBuckets(
    {
      totalCapitalUsd: 1_000_000,
      minHotReserveUsd: 150_000,
      strategicBufferUsd: 100_000,
      hotReserveWindowDays: 30,
      maxIdleDeploymentRatio: 0.85,
      maxSingleVaultAllocationRatio: 0.6,
    },
    [
      { projectId: "p1", milestoneId: "m1", amountUsd: 50_000, dueInDays: 7 },
      { projectId: "p2", milestoneId: "m2", amountUsd: 80_000, dueInDays: 21 },
      { projectId: "p3", milestoneId: "m3", amountUsd: 200_000, dueInDays: 45 },
    ],
  );

  const plan = proposeIdleAllocation(buckets, {
    riskOff: false,
    volatilityScore: 20,
    liquidityStressScore: 15,
    withdrawalDemandScore: 10,
    minimumAverageApyPct: 2,
    minimumWithdrawableCoverageRatio: 0.4,
    minimumStrategyCount: 1,
    vaults: [
      {
        tokenSymbol: "USDC",
        tokenMint: "mint-usdc",
        cluster: "devnet",
        withdrawableAmount: 400_000,
        withdrawableUsd: 400_000,
        virtualPrice: 1.02,
        apy: { averagePct: 8, currentPct: 8.5 },
        strategies: [
          { name: "Kamino", safeUtilizationPct: 85, utilizationPct: 60 },
          { name: "Marginfi", safeUtilizationPct: 84, utilizationPct: 64 },
        ],
      },
      {
        tokenSymbol: "SOL",
        tokenMint: "mint-sol",
        cluster: "devnet",
        withdrawableAmount: 300_000,
        withdrawableUsd: 300_000,
        virtualPrice: 1.04,
        apy: { averagePct: 6, currentPct: 6.2 },
        strategies: [{ name: "Sanctum", safeUtilizationPct: 80, utilizationPct: 55 }],
      },
    ],
  });

  assert.equal(plan.allocatableIdleUsd, 464750);
  assert.equal(plan.heldBackIdleUsd, 85250);
  assert.equal(plan.actions.length, 3);
  assert.equal(plan.actions[0].action, "deposit_dynamic_vault");
  assert.equal(plan.actions[0].tokenSymbol, "USDC");
  assert.equal(plan.actions[0].amountUsd, 269752.61);
  assert.equal(plan.actions[1].tokenSymbol, "SOL");
  assert.equal(plan.actions[1].amountUsd, 194997.39);
  assert.equal(plan.actions[2].action, "hold_idle_cash");
  assert.equal(plan.weightedExpectedApyPct, 7.1609);
});

await run("RateLimitedHttpClient serializes DAMM v2 requests under 10 RPS", async () => {
  let now = 0;
  const starts = [];
  const client = new RateLimitedHttpClient({
    clock: () => now,
    sleep: async (ms) => {
      now += ms;
    },
    fetchImpl: async () => {
      starts.push(now);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  await Promise.all([
    client.getJson("https://example.com/a", { service: "damm_v2" }),
    client.getJson("https://example.com/b", { service: "damm_v2" }),
    client.getJson("https://example.com/c", { service: "damm_v2" }),
  ]);

  assert.deepStrictEqual(starts, [0, 100, 200]);
});

await run("MeteoraVaultClient merges SDK withdrawable data with off-chain state and APY", async () => {
  const responses = new Map([
    [
      "https://api.meteora.test/vault_state/mint-usdc",
      {
        vault_address: "vault-1",
        lp_supply: "120",
        virtual_price: "1.0475",
        usd_rate: "1",
        strategies: [
          {
            address: "strategy-1",
            name: "Kamino",
            allocated_usd: "150000",
            liquidity_usd: "200000",
            utilization_rate: "0.52",
            safe_utilization_rate: "0.82",
          },
        ],
      },
    ],
    [
      "https://api.meteora.test/apy_state/mint-usdc",
      {
        current_apy: "7.8",
        average_apy: "6.9",
        strategies: [
          {
            address: "strategy-1",
            current_apy: "8.1",
            average_apy: "7.2",
          },
        ],
      },
    ],
  ]);

  const vaultClient = new MeteoraVaultClient({
    cluster: "devnet",
    dynamicVaultApiBaseUrl: "https://api.meteora.test",
    tokenResolver: async () => ({
      symbol: "USDC",
      address: "mint-usdc",
      decimals: 6,
      name: "USD Coin",
    }),
    vaultFactory: async () => ({
      vaultAddress: "vault-1",
      lpSupply: { toNumber: () => 120 },
      getWithdrawableAmount: async () => ({ toNumber: () => 125.75 }),
    }),
    fetchImpl: async (url) => {
      const payload = responses.get(url);
      if (!payload) {
        return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
      }
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const details = await vaultClient.getVaultDetails("usdc");
  assert.equal(details.tokenMint, "mint-usdc");
  assert.equal(details.withdrawableAmount, 125.75);
  assert.equal(details.virtualPrice, 1.0475);
  assert.equal(details.apy.averagePct, 6.9);
  assert.equal(details.strategies.length, 1);
  assert.equal(details.strategies[0].name, "Kamino");
  assert.equal(details.strategies[0].currentApyPct, 8.1);
  assert.equal(details.strategies[0].safeUtilizationPct, 82);
});

if (failures > 0) {
  process.exitCode = 1;
}

async function run(name, fn) {
  try {
    await fn();
    process.stdout.write(`ok ${name}\n`);
  } catch (error) {
    failures += 1;
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`not ok ${name}\n${message}\n`);
  }
}
