#!/usr/bin/env node
/**
 * Custom escrow status check script.
 *
 * Based on NLA CLI's status-escrow.js with imports adapted for local execution.
 */
import { parseArgs } from "util";
import {
  createPublicClient,
  http,
  parseAbiParameters,
  decodeAbiParameters,
} from "viem";
import { foundry, sepolia, mainnet, baseSepolia } from "viem/chains";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";
import { contracts, contractAddresses } from "alkahest-ts";

// ---------- Inlined utility functions ----------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const NLA_DEPLOYMENTS_DIR = join(
  homedir(),
  "AppData",
  "Roaming",
  "npm",
  "node_modules",
  "nla",
  "dist",
  "cli",
  "deployments"
);

function getChainFromNetwork(network) {
  const normalized = network.toLowerCase().replace(/\s+/g, "-");
  switch (normalized) {
    case "localhost":
    case "anvil":
      return foundry;
    case "sepolia":
    case "ethereum-sepolia":
      return sepolia;
    case "base-sepolia":
      return baseSepolia;
    case "mainnet":
    case "ethereum":
      return mainnet;
    default:
      return foundry;
  }
}

function getNLAConfigDir() {
  return join(homedir(), ".nla");
}

function getCurrentEnvironment() {
  const configPath = join(getNLAConfigDir(), "config.json");
  if (!existsSync(configPath)) return "anvil";
  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    return config.environment || "anvil";
  } catch {
    return "anvil";
  }
}

function loadDeploymentWithDefaults(deploymentFilePath) {
  let actualPath = deploymentFilePath;

  if (!actualPath || !existsSync(actualPath)) {
    const currentEnv = getCurrentEnvironment();
    const localPath = join(__dirname, `deployment-${currentEnv}.json`);
    const nlaPath = join(NLA_DEPLOYMENTS_DIR, `${currentEnv}.json`);

    if (existsSync(localPath)) {
      actualPath = localPath;
    } else if (existsSync(nlaPath)) {
      actualPath = nlaPath;
    } else if (!actualPath) {
      throw new Error(
        `No deployment file found for environment: ${currentEnv}`
      );
    } else {
      throw new Error(`Deployment file not found: ${actualPath}`);
    }
  }

  const content = readFileSync(actualPath, "utf-8");
  const deployment = JSON.parse(content);

  let finalAddresses = {};
  const chainName = deployment.network;
  if (contractAddresses[chainName]) {
    finalAddresses = { ...contractAddresses[chainName] };
  }

  if (deployment.addresses && Object.keys(deployment.addresses).length > 0) {
    for (const [key, value] of Object.entries(deployment.addresses)) {
      if (value && value !== "") {
        finalAddresses[key] = value;
      }
    }
  }

  return {
    network: deployment.network,
    chainId: deployment.chainId,
    rpcUrl: deployment.rpcUrl,
    addresses: finalAddresses,
  };
}

// ---------- CLI ----------

function parseCliArgs() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "escrow-uid": { type: "string" },
      "private-key": { type: "string" },
      deployment: { type: "string" },
      "rpc-url": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
  });
  return values;
}

async function main() {
  try {
    const args = parseCliArgs();

    if (args.help) {
      console.log("Usage: status-escrow.js --escrow-uid <uid> [--rpc-url <url>] [--deployment <path>]");
      process.exit(0);
    }

    const escrowUid = args["escrow-uid"];
    const deploymentFile = args["deployment"];

    if (!escrowUid) {
      console.error("❌ Error: --escrow-uid is required");
      process.exit(1);
    }

    console.log("🔍 Checking Escrow Status\n");

    const deployment = loadDeploymentWithDefaults(deploymentFile);
    const addresses = deployment.addresses;

    // Allow RPC URL override via --rpc-url flag
    const rpcUrl = args["rpc-url"] || deployment.rpcUrl;

    console.log("Configuration:");
    console.log(`  📦 Escrow UID: ${escrowUid}`);
    console.log(`  🌐 Network: ${deployment.network}`);
    console.log(`  📡 RPC URL: ${rpcUrl}\n`);

    if (!addresses.eas) {
      console.error("❌ Error: EAS address not found in deployment file.");
      process.exit(1);
    }

    const chain = getChainFromNetwork(deployment.network);
    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    console.log("📋 Fetching escrow details...\n");

    const escrow = await publicClient.readContract({
      address: addresses.eas,
      abi: contracts.IEAS.abi.abi,
      functionName: "getAttestation",
      args: [escrowUid],
    });

    console.log("📦 Escrow Information:");
    console.log(`   UID: ${escrow.uid}`);
    console.log(`   Schema: ${escrow.schema}`);
    console.log(`   Attester: ${escrow.attester}`);
    console.log(`   Recipient: ${escrow.recipient}`);
    console.log(
      `   Revoked: ${escrow.revocationTime > 0n ? "Yes ❌" : "No ✅"}`
    );

    try {
      const llmAbi = parseAbiParameters(
        "(string demand, string arbitrationModel, address arbitrator)"
      );
      const decoded = decodeAbiParameters(llmAbi, escrow.data);
      console.log("\n📝 Escrow Details:");
      console.log(`   Demand: "${decoded[0].demand}"`);
      console.log(`   Model: ${decoded[0].arbitrationModel}`);
      console.log(`   Arbitrator: ${decoded[0].arbitrator}`);
    } catch {
      console.log(`\n📝 Raw Data: ${escrow.data}`);
    }

    console.log("\n🔎 Checking for fulfillments...");

    const filter = await publicClient.createContractEventFilter({
      address: addresses.eas,
      abi: contracts.IEAS.abi.abi,
      eventName: "Attested",
      fromBlock: 0n,
    });
    const events = await publicClient.getFilterLogs({ filter });

    console.log(`   Total events found: ${events.length}`);
    console.log(
      `   Debug - Looking for escrow UID: ${escrowUid.toLowerCase()}`
    );

    events.forEach((event, index) => {
      const refUID = event.args?.refUID;
      console.log(
        `   Event ${index}: refUID = ${refUID ? refUID.toLowerCase() : "null"}, uid = ${event.args?.uid}`
      );
    });

    const fulfillments = events.filter((event) => {
      const refUID = event.args?.refUID;
      return refUID && refUID.toLowerCase() === escrowUid.toLowerCase();
    });

    console.log(`   Fulfillments matching escrow: ${fulfillments.length}`);

    if (fulfillments.length === 0) {
      console.log("   No fulfillments found yet\n");
    } else {
      console.log(`   Found ${fulfillments.length} fulfillment(s):\n`);
      for (const fulfillment of fulfillments) {
        const fulfillmentUid = fulfillment.args?.uid;
        if (!fulfillmentUid) continue;

        const fulfillmentAttestation = await publicClient.readContract({
          address: addresses.eas,
          abi: contracts.IEAS.abi.abi,
          functionName: "getAttestation",
          args: [fulfillmentUid],
        });

        console.log(`   📨 Fulfillment UID: ${fulfillmentUid}`);
        console.log(`      Attester: ${fulfillmentAttestation.attester}`);
        console.log(
          `      Revoked: ${fulfillmentAttestation.revocationTime > 0n ? "Yes ❌" : "No ✅"}`
        );

        try {
          const fulfillmentAbi = parseAbiParameters("(string item)");
          const fulfillmentData = decodeAbiParameters(
            fulfillmentAbi,
            fulfillmentAttestation.data
          );
          console.log(
            `      Fulfillment Text: "${fulfillmentData[0].item}"`
          );
        } catch {
          // Skip if can't decode
        }

        const decisions = events.filter((e) => {
          const refUID = e.args?.refUID;
          return (
            refUID && refUID.toLowerCase() === fulfillmentUid.toLowerCase()
          );
        });

        if (decisions.length > 0) {
          console.log("      ⚖️  Arbitration: Decision recorded");
          for (const decision of decisions) {
            const decisionUid = decision.args?.uid;
            if (!decisionUid) continue;

            const decisionAttestation = await publicClient.readContract({
              address: addresses.eas,
              abi: contracts.IEAS.abi.abi,
              functionName: "getAttestation",
              args: [decisionUid],
            });

            try {
              const decisionAbi = parseAbiParameters("(bool item)");
              const decisionData = decodeAbiParameters(
                decisionAbi,
                decisionAttestation.data
              );
              console.log(
                `      Result: ${decisionData[0].item ? "✅ APPROVED" : "❌ REJECTED"}`
              );
            } catch {
              console.log("      Result: Unknown");
            }
          }
        } else {
          console.log("      ⚖️  Arbitration: Pending...");
        }
        console.log();
      }
    }

    console.log("✨ Status check complete!\n");
  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  }
}

main();
