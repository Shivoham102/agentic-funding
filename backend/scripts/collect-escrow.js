#!/usr/bin/env node
/**
 * Custom escrow collection script.
 *
 * Uses the correct alkahest-ts v0.7.2 SDK API:
 *   client.erc20.escrow.nonTierable.collect(escrowUid, fulfillmentUid)
 */
import { parseArgs } from "util";
import { createWalletClient, http, publicActions, formatEther } from "viem";
import { privateKeyToAccount, nonceManager } from "viem/accounts";
import { foundry, sepolia, mainnet, baseSepolia } from "viem/chains";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";
import { makeClient, contractAddresses } from "alkahest-ts";

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

function getPrivateKey() {
  if (process.env.PRIVATE_KEY) return process.env.PRIVATE_KEY;
  const configPath = join(getNLAConfigDir(), "config.json");
  if (!existsSync(configPath)) return undefined;
  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    return config.privateKey;
  } catch {
    return undefined;
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
      "fulfillment-uid": { type: "string" },
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
      console.log("Usage: collect-escrow.js --escrow-uid <uid> --fulfillment-uid <uid> --private-key <key> [--rpc-url <url>] [--deployment <path>]");
      process.exit(0);
    }

    const escrowUid = args["escrow-uid"];
    const fulfillmentUid = args["fulfillment-uid"];
    const privateKey = args["private-key"] || getPrivateKey();
    const deploymentPath = args.deployment;

    if (!escrowUid) { console.error("❌ Error: --escrow-uid is required"); process.exit(1); }
    if (!fulfillmentUid) { console.error("❌ Error: --fulfillment-uid is required"); process.exit(1); }
    if (!privateKey) { console.error("❌ Error: --private-key is required"); process.exit(1); }

    let deployment;
    try {
      deployment = loadDeploymentWithDefaults(deploymentPath);
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    }

    const rpcUrl = args["rpc-url"] || deployment.rpcUrl;
    const chain = getChainFromNetwork(deployment.network);

    console.log("🚀 Collecting Natural Language Agreement Escrow\n");
    console.log("Configuration:");
    console.log(`  📦 Escrow UID: ${escrowUid}`);
    console.log(`  ✅ Fulfillment UID: ${fulfillmentUid}`);
    console.log(`  🌐 RPC URL: ${rpcUrl}\n`);

    const account = privateKeyToAccount(privateKey, { nonceManager });
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    }).extend(publicActions);

    console.log(`✅ Collector address: ${account.address}\n`);

    const balance = await walletClient.getBalance({ address: account.address });
    console.log(`💰 ETH balance: ${parseFloat(formatEther(balance)).toFixed(4)} ETH\n`);
    if (balance === 0n) {
      console.error("❌ Error: Account has no ETH for gas.");
      process.exit(1);
    }

    const client = makeClient(walletClient, deployment.addresses);

    console.log("💰 Collecting escrow...\n");

    const collectionHash = await client.erc20.escrow.nonTierable.collect(
      escrowUid,
      fulfillmentUid
    );

    console.log("✨ Escrow collected successfully!\n");
    console.log("📋 Transaction Details:");
    console.log(`   Transaction Hash: ${collectionHash}`);
    console.log(
      `   Block Explorer: ${rpcUrl.includes("localhost") ? "Local Anvil" : "View on explorer"}\n`
    );
    console.log("🎉 Success! The escrowed tokens have been transferred to you.");
  } catch (error) {
    console.error("❌ Failed to collect escrow:", error);
    process.exit(1);
  }
}

main();
