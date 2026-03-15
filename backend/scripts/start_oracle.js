#!/usr/bin/env node
/**
 * Patched NLA Oracle Startup Script
 *
 * Works around Alchemy free-tier eth_getLogs block-range limitation by
 * intercepting JSON-RPC requests and rewriting "earliest" / "0x0" fromBlock
 * to (currentBlock - 1000).
 *
 * Usage:
 *   bun run backend/scripts/start_oracle.js \
 *     --rpc-url <URL> --private-key <0xKEY> --anthropic-api-key <KEY>
 */

import { parseArgs } from "util";
import { createWalletClient, custom, publicActions, fromHex } from "viem";
import { privateKeyToAccount, nonceManager } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { makeClient, contractAddresses } from "alkahest-ts";
import { readFileSync } from "fs";

// ---------------------------------------------------------------------------
// Dynamic imports from globally-installed NLA package
// ---------------------------------------------------------------------------
// Import both from nla.js directly (index.js re-exports from ./nla without
// the .js extension which breaks Node ESM resolution).
const NLA_NLA_JS = "file:///C:/Users/shivo/AppData/Roaming/npm/node_modules/nla/dist/nla.js";
const { makeLLMClient, ProviderName } = await import(NLA_NLA_JS);

// ---------------------------------------------------------------------------
// Deployment loader  (mirrors NLA loadDeploymentWithDefaults)
// ---------------------------------------------------------------------------
const DEPLOYMENT_PATH =
  "C:/Users/shivo/AppData/Roaming/npm/node_modules/nla/dist/cli/deployments/base-sepolia.json";

function loadDeployment() {
  const raw = JSON.parse(readFileSync(DEPLOYMENT_PATH, "utf-8"));
  // Start with alkahest-ts defaults for the chain, then overlay deployment file
  let addresses = {};
  const chainName = raw.network; // "Base Sepolia"
  if (contractAddresses[chainName]) {
    addresses = { ...contractAddresses[chainName] };
  }
  if (raw.addresses) {
    for (const [key, value] of Object.entries(raw.addresses)) {
      if (value && value !== "") {
        addresses[key] = value;
      }
    }
  }
  return { network: raw.network, chainId: raw.chainId, rpcUrl: raw.rpcUrl, addresses };
}

// ---------------------------------------------------------------------------
// Patched transport – rewrites eth_getLogs fromBlock: "earliest"
// ---------------------------------------------------------------------------
function createPatchedTransport(rpcUrl) {
  let cachedBlockNumber = null;
  let cachedBlockTimestamp = 0;
  const CACHE_TTL_MS = 30_000; // refresh block height every 30 s
  const LOOKBACK = 1000;       // number of blocks to look back
  let rpcId = 1;

  /** Low-level JSON-RPC fetch (no interception). */
  async function rawRpc(method, params) {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
    });
    const json = await res.json();
    if (json.error) throw new Error(`RPC error (${method}): ${json.error.message}`);
    return json.result;
  }

  /** Get a safe fromBlock value (current - LOOKBACK). */
  async function getSafeFromBlock() {
    const now = Date.now();
    if (!cachedBlockNumber || now - cachedBlockTimestamp > CACHE_TTL_MS) {
      const hex = await rawRpc("eth_blockNumber", []);
      cachedBlockNumber = parseInt(hex, 16);
      cachedBlockTimestamp = now;
    }
    return "0x" + Math.max(0, cachedBlockNumber - LOOKBACK).toString(16);
  }

  return custom({
    async request({ method, params }) {
      // Intercept eth_getLogs and rewrite dangerous fromBlock values
      if (method === "eth_getLogs" && params?.[0]) {
        const filter = params[0];
        const fb = filter.fromBlock;
        if (fb === "earliest" || fb === "0x0" || fb === "0x1") {
          const safe = await getSafeFromBlock();
          console.log(
            `[Patch] Rewrote eth_getLogs fromBlock: ${fb} -> ${safe} (block ${parseInt(safe, 16)})`
          );
          filter.fromBlock = safe;
        }
      }
      return rawRpc(method, params ?? []);
    },
  });
}

// ---------------------------------------------------------------------------
// CLI argument parsing  (mirrors NLA oracle)
// ---------------------------------------------------------------------------
function parseCliArgs() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "private-key":        { type: "string" },
      "rpc-url":            { type: "string" },
      "openai-api-key":     { type: "string" },
      "anthropic-api-key":  { type: "string" },
      "openrouter-api-key": { type: "string" },
      "perplexity-api-key": { type: "string" },
      "polling-interval":   { type: "string" },
      "help":               { type: "boolean", short: "h" },
    },
    strict: true,
  });
  return values;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = parseCliArgs();

  if (args.help) {
    console.log("Usage: bun start_oracle.js --rpc-url <URL> --private-key <0xKEY> [options]");
    console.log("  --openai-api-key, --anthropic-api-key, --openrouter-api-key, --perplexity-api-key");
    console.log("  --polling-interval <ms>  (default 5000)");
    process.exit(0);
  }

  // --- Load deployment ---------------------------------------------------
  const deployment = loadDeployment();
  console.log(`✅ Loaded deployment (${deployment.network})\n`);

  // --- Resolve configuration ---------------------------------------------
  const privateKey      = args["private-key"]        || process.env.PRIVATE_KEY;
  const rpcUrl          = args["rpc-url"]            || deployment.rpcUrl;
  const openaiApiKey    = args["openai-api-key"]     || process.env.OPENAI_API_KEY;
  const anthropicApiKey = args["anthropic-api-key"]   || process.env.ANTHROPIC_API_KEY;
  const openrouterApiKey = args["openrouter-api-key"] || process.env.OPENROUTER_API_KEY;
  const perplexityApiKey = args["perplexity-api-key"] || process.env.PERPLEXITY_API_KEY;
  const pollingInterval = parseInt(args["polling-interval"] || "5000");

  if (!rpcUrl) { console.error("❌ --rpc-url is required"); process.exit(1); }
  if (!privateKey) { console.error("❌ --private-key is required"); process.exit(1); }
  if (!openaiApiKey && !anthropicApiKey && !openrouterApiKey) {
    console.error("❌ At least one LLM provider API key is required"); process.exit(1);
  }

  // --- Banner ------------------------------------------------------------
  console.log("🚀 Starting Patched NLA Oracle (eth_getLogs workaround)\n");
  console.log("Configuration:");
  console.log(`  📡 RPC URL: ${rpcUrl}`);
  console.log(`  🔑 Oracle Key: ${privateKey.slice(0, 6)}...${privateKey.slice(-4)}`);
  const providers = [];
  if (openaiApiKey)     providers.push("OpenAI");
  if (anthropicApiKey)  providers.push("Anthropic");
  if (openrouterApiKey) providers.push("OpenRouter");
  console.log(`  🤖 AI Providers: ${providers.join(", ")}`);
  if (perplexityApiKey) console.log("  🔍 Perplexity Search: Enabled");
  console.log(`  ⏱️  Polling Interval: ${pollingInterval}ms\n`);

  // --- Create wallet client with PATCHED transport -----------------------
  const account = privateKeyToAccount(privateKey, { nonceManager });
  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: createPatchedTransport(rpcUrl),
  }).extend(publicActions);

  // --- Create alkahest + LLM client --------------------------------------
  const client = makeClient(walletClient, deployment.addresses);
  console.log(`✅ Oracle initialized with address: ${account.address}\n`);

  const llmClient = client.extend(() => ({
    llm: makeLLMClient([]),
  }));

  // Add all available providers
  if (openaiApiKey) {
    llmClient.llm.addProvider({
      providerName: ProviderName.OpenAI,
      apiKey: openaiApiKey,
      perplexityApiKey,
    });
    console.log("✅ OpenAI provider configured");
  }
  if (anthropicApiKey) {
    llmClient.llm.addProvider({
      providerName: ProviderName.Anthropic,
      apiKey: anthropicApiKey,
      perplexityApiKey,
    });
    console.log("✅ Anthropic provider configured");
  }
  if (openrouterApiKey) {
    llmClient.llm.addProvider({
      providerName: ProviderName.OpenRouter,
      apiKey: openrouterApiKey,
      perplexityApiKey,
    });
    console.log("✅ OpenRouter provider configured");
  }

  console.log("\n🎯 LLM Arbitrator configured and ready");
  console.log("👂 Listening for arbitration requests...\n");

  // --- Start arbitration loop --------------------------------------------
  const { unwatch } = await client.arbiters.general.trustedOracle.arbitrateMany(
    async ({ attestation, demand }) => {
      console.log(`\n📨 New arbitration request received!`);
      console.log(`   Attestation UID: ${attestation.uid}`);
      try {
        const commitRevealData = client.commitReveal.decode(attestation.data);
        const obligationItem = fromHex(commitRevealData.payload, "string");
        console.log(`   Obligation: "${obligationItem}"`);

        const trustedOracleDemandData =
          client.arbiters.general.trustedOracle.decodeDemand(demand);
        const nlaDemandData = llmClient.llm.decodeDemand(trustedOracleDemandData.data);

        console.log(`   Demand: "${nlaDemandData.demand}"`);
        console.log(`   Provider: ${nlaDemandData.arbitrationProvider}`);
        console.log(`   Model: ${nlaDemandData.arbitrationModel}`);

        if (
          !nlaDemandData.demand ||
          !nlaDemandData.arbitrationModel ||
          nlaDemandData.arbitrationModel.includes("\u0000")
        ) {
          console.error("   ❌ Invalid demand data – skipping");
          throw new Error("Invalid demand data – skipping attestation");
        }

        console.log(`   🤔 Arbitrating with ${nlaDemandData.arbitrationProvider}...`);
        const result = await llmClient.llm.arbitrate(nlaDemandData, obligationItem);
        console.log(`   ✨ Arbitration result: ${result ? "✅ APPROVED" : "❌ REJECTED"}`);
        return result;
      } catch (error) {
        console.error("   ❌ Error during arbitration:", error);
        console.error("   Continuing to listen for new requests...\n");
        return false;
      }
    },
    {
      onAfterArbitrate: async (decision) => {
        try {
          console.log("   📝 Arbitration decision recorded on-chain");
          console.log(`   Decision UID: ${decision.attestation.uid}`);
          console.log(
            `   Result: ${decision.decision ? "✅ Fulfilled" : "❌ Not Fulfilled"}\n`
          );
        } catch (error) {
          console.error("   ⚠️  Failed to record on-chain:", error.message);
          console.error("   Continuing to listen for new requests...\n");
        }
      },
      pollingInterval,
    }
  );

  console.log("✨ Patched oracle is now running. Press Ctrl+C to stop.\n");

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\n🛑 Shutting down oracle...");
    unwatch();
    console.log("👋 Oracle stopped gracefully");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep process alive
  await new Promise(() => {});
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
