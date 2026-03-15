#!/usr/bin/env node
/**
 * Custom escrow creation script using approveAndCreate instead of permitAndCreate.
 *
 * This avoids the EIP-2612 permit signature issue with real USDC on Base Sepolia.
 * Based on NLA CLI's create-escrow.js but swaps permitAndCreate → approveAndCreate.
 */
import { parseArgs } from "util";
import {
  createWalletClient,
  http,
  publicActions,
  formatEther,
  encodeAbiParameters,
  parseAbiParameters,
  parseAbi,
} from "viem";
import { privateKeyToAccount, nonceManager } from "viem/accounts";
import { foundry, sepolia, mainnet, baseSepolia } from "viem/chains";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";
import { makeClient, fixtures, contractAddresses } from "alkahest-ts";

// ---------- Inlined utility functions (from NLA CLI utils.js) ----------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the NLA CLI deployments directory
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
    // Try local deployment file first
    const localPath = join(__dirname, `deployment-${currentEnv}.json`);
    // Then try NLA deployments directory
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

// ---------- Inline LLM demand encoding (from NLA's makeLLMClient) ----------

const LLMAbi = parseAbiParameters(
  "(string arbitrationProvider, string arbitrationModel, string arbitrationPrompt, string demand)"
);

function encodeLLMDemand(demand) {
  return encodeAbiParameters(LLMAbi, [demand]);
}

// ---------- CLI ----------

function parseCliArgs() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      demand: { type: "string" },
      amount: { type: "string" },
      token: { type: "string" },
      oracle: { type: "string" },
      "private-key": { type: "string" },
      deployment: { type: "string" },
      "rpc-url": { type: "string" },
      "arbitration-provider": { type: "string" },
      "arbitration-model": { type: "string" },
      "arbitration-prompt": { type: "string" },
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
      console.log("Usage: create-escrow.js --demand <text> --amount <n> --token <addr> --oracle <addr> --private-key <key> [--rpc-url <url>] [--deployment <path>]");
      process.exit(0);
    }

    const demand = args.demand;
    const amount = args.amount;
    const tokenAddress = args.token;
    const oracleAddress = args.oracle;
    const privateKey = args["private-key"] || getPrivateKey();
    const deploymentPath = args.deployment;

    const arbitrationProvider = args["arbitration-provider"] || "OpenAI";
    const arbitrationModel = args["arbitration-model"] || "gpt-4o-mini";
    const arbitrationPrompt =
      args["arbitration-prompt"] ||
      `Evaluate the fulfillment against the demand and decide whether the demand was validly fulfilled

Demand: {{demand}}

Fulfillment: {{obligation}}`;

    // Validate
    if (!demand) { console.error("❌ Error: --demand is required"); process.exit(1); }
    if (!amount) { console.error("❌ Error: --amount is required"); process.exit(1); }
    if (!tokenAddress) { console.error("❌ Error: --token is required"); process.exit(1); }
    if (!oracleAddress) { console.error("❌ Error: --oracle is required"); process.exit(1); }
    if (!privateKey) { console.error("❌ Error: --private-key is required"); process.exit(1); }

    // Load deployment
    let deployment;
    try {
      deployment = loadDeploymentWithDefaults(deploymentPath);
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    }

    const rpcUrl = args["rpc-url"] || deployment.rpcUrl;
    const chain = getChainFromNetwork(deployment.network);

    console.log("🚀 Creating Natural Language Agreement Escrow (approveAndCreate)\n");
    console.log("Configuration:");
    console.log(`  📝 Demand: "${demand}"`);
    console.log(`  💰 Amount: ${amount} tokens`);
    console.log(`  🪙 Token: ${tokenAddress}`);
    console.log(`  ⚖️  Oracle: ${oracleAddress}`);
    console.log(`  🌐 Network: ${deployment.network}`);
    console.log(`  🌐 RPC URL: ${rpcUrl}\n`);

    // Create account and wallet
    const account = privateKeyToAccount(privateKey, { nonceManager });
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    }).extend(publicActions);

    console.log(`✅ User address: ${account.address}\n`);

    // Check ETH balance
    const balance = await walletClient.getBalance({ address: account.address });
    console.log(`💰 ETH balance: ${parseFloat(formatEther(balance)).toFixed(4)} ETH\n`);
    if (balance === 0n) {
      console.error("❌ Error: Account has no ETH for gas.");
      process.exit(1);
    }

    // Create alkahest client
    const client = makeClient(walletClient, deployment.addresses);

    // Check token balance
    const tokenBalance = await walletClient.readContract({
      address: tokenAddress,
      abi: fixtures.MockERC20Permit.abi,
      functionName: "balanceOf",
      args: [account.address],
    });
    console.log(`💰 Token balance: ${tokenBalance.toString()} tokens\n`);

    if (tokenBalance < BigInt(amount)) {
      console.error(
        `❌ Error: Insufficient token balance. You have ${tokenBalance.toString()} but need ${amount}`
      );
      process.exit(1);
    }

    console.log("📋 Creating escrow (manual approve + wait + create)\n");

    // Encode the demand with oracle arbiter
    const arbiter = deployment.addresses.trustedOracleArbiter;
    const encodedDemand = client.arbiters.general.trustedOracle.encodeDemand({
      oracle: oracleAddress,
      data: encodeLLMDemand({
        arbitrationProvider,
        arbitrationModel,
        arbitrationPrompt,
        demand: demand,
      }),
    });

    // Step 1: Manually approve the escrow contract to spend our tokens
    const escrowContract = deployment.addresses.erc20EscrowObligation;
    const approveAbi = parseAbi([
      "function approve(address spender, uint256 amount) returns (bool)",
    ]);
    console.log(`🔑 Approving ${amount} tokens for escrow contract ${escrowContract}...`);
    const approveHash = await walletClient.writeContract({
      address: tokenAddress,
      abi: approveAbi,
      functionName: "approve",
      args: [escrowContract, BigInt(amount)],
    });
    console.log(`   Approve TX: ${approveHash}`);

    // Step 2: Wait for the approval to be mined (critical - avoids race condition)
    console.log("⏳ Waiting for approval to be mined...");
    const approveReceipt = await walletClient.waitForTransactionReceipt({ hash: approveHash });
    console.log(`   ✅ Approval mined in block ${approveReceipt.blockNumber} (status: ${approveReceipt.status})\n`);

    if (approveReceipt.status !== "success") {
      console.error("❌ Approval transaction failed!");
      process.exit(1);
    }

    // Step 3: Verify allowance is set (with retry for RPC read consistency)
    console.log("📦 Verifying allowance...");
    const requiredAmount = BigInt(amount);
    let allowance = 0n;
    for (let attempt = 1; attempt <= 5; attempt++) {
      if (attempt > 1) {
        const delayMs = attempt * 2000;
        console.log(`   Retry ${attempt}/5 after ${delayMs}ms delay...`);
        await new Promise(r => setTimeout(r, delayMs));
      }
      allowance = await walletClient.readContract({
        address: tokenAddress,
        abi: fixtures.MockERC20Permit.abi,
        functionName: "allowance",
        args: [account.address, deployment.addresses.erc20EscrowObligation],
      });
      console.log(`   Allowance: ${allowance.toString()} (need ${amount})`);
      if (allowance >= requiredAmount) break;
    }
    if (allowance < requiredAmount) {
      console.error("❌ Allowance not set after 5 retries - approval may not have propagated");
      process.exit(1);
    }

    const { attested: escrow } =
      await client.erc20.escrow.nonTierable.create(
        {
          address: tokenAddress,
          value: BigInt(amount),
        },
        { arbiter, demand: encodedDemand },
        0n
      );

    console.log("✨ Escrow created successfully!\n");
    console.log("📋 Escrow Details:");
    console.log(`   UID: ${escrow.uid}`);
    console.log(`   Attester: ${escrow.attester}`);
    console.log(`   Recipient: ${escrow.recipient}`);
    console.log("🎯 Next Steps:");
    console.log("1. Someone fulfills the obligation:");
    console.log(`   bun run fulfill-escrow.js \\`);
    console.log(`     --escrow-uid ${escrow.uid} \\`);
    console.log(`     --fulfillment "Your fulfillment text" \\`);
    console.log(`     --oracle ${oracleAddress}`);
    console.log("\n2. The oracle will arbitrate the fulfillment automatically");
    console.log("\n3. If approved, collect the escrow:");
    console.log(`   bun run collect-escrow.js \\`);
    console.log(`     --escrow-uid ${escrow.uid} \\`);
    console.log(`     --fulfillment-uid <fulfillment-uid>`);
  } catch (error) {
    console.error("❌ Failed to create escrow:", error);
    process.exit(1);
  }
}

main();
