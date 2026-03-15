/**
 * Test: Manual approve (with receipt wait) + SDK create() 
 * This tests the hypothesis that approveAndCreate fails because it doesn't
 * wait for the approve TX receipt before calling doObligation.
 * 
 * This script does a DRY RUN (simulation only) unless --execute is passed.
 */
import { parseArgs } from "util";
import {
  createWalletClient,
  http,
  publicActions,
  parseAbi,
  encodeAbiParameters,
  parseAbiParameters,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { makeClient, contractAddresses } from "alkahest-ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse args
const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: { execute: { type: "boolean", default: false } },
  strict: true,
});

// Load env
const envPath = join(__dirname, "..", ".env");
const env = {};
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      let val = trimmed.slice(idx + 1);
      // Strip inline comments (# ...)
      const commentIdx = val.indexOf("#");
      if (commentIdx !== -1) val = val.slice(0, commentIdx);
      env[trimmed.slice(0, idx).trim()] = val.trim();
    }
  }
}

const rpcUrl = env.BASE_SEPOLIA_RPC_URL;
let privateKey = (env.ORACLE_PRIVATE_KEY || "").replace(/\s+/g, "");
if (privateKey && !privateKey.startsWith("0x")) privateKey = "0x" + privateKey;
console.log("PK length:", privateKey.length, "chars (expected 66 with 0x prefix)");
const tokenAddress = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // USDC on Base Sepolia
const amount = 1000000n; // 1 USDC (6 decimals)

// Load deployment
const deploymentPath = join(__dirname, "deployment-base-sepolia.json");
const deployment = JSON.parse(readFileSync(deploymentPath, "utf-8"));

// Merge addresses
let finalAddresses = {};
const chainName = deployment.network;
if (contractAddresses[chainName]) {
  finalAddresses = { ...contractAddresses[chainName] };
}
if (deployment.addresses) {
  for (const [key, value] of Object.entries(deployment.addresses)) {
    if (value && value !== "") finalAddresses[key] = value;
  }
}

const escrowContract = finalAddresses.erc20EscrowObligation;

console.log("=== Manual Approve + Create Test ===\n");
console.log("Escrow contract:", escrowContract);
console.log("Token (USDC):", tokenAddress);
console.log("Amount:", amount.toString());
console.log("Mode:", args.execute ? "EXECUTE (real TX)" : "DRY RUN (simulation only)");
console.log();

// Create wallet client
const account = privateKeyToAccount(privateKey);
const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(rpcUrl),
}).extend(publicActions);

console.log("Wallet:", account.address);

// Step 1: Check current allowance
const approveAbi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

const currentAllowance = await walletClient.readContract({
  address: tokenAddress,
  abi: approveAbi,
  functionName: "allowance",
  args: [account.address, escrowContract],
});

const balance = await walletClient.readContract({
  address: tokenAddress,
  abi: approveAbi,
  functionName: "balanceOf",
  args: [account.address],
});

console.log("Current USDC allowance (wallet->escrow):", currentAllowance.toString());
console.log("Current USDC balance:", balance.toString());
console.log();

// Step 2: Simulate the doObligation with current allowance
const alkahestClient = makeClient(walletClient, finalAddresses);

// Build the demand (minimal, for testing)
const oracleAddress = account.address; // self as oracle for test
const LLMAbi = parseAbiParameters(
  "(string arbitrationProvider, string arbitrationModel, string arbitrationPrompt, string demand)"
);
const encodedDemand = alkahestClient.arbiters.general.trustedOracle.encodeDemand({
  oracle: oracleAddress,
  data: encodeAbiParameters(LLMAbi, [{
    arbitrationProvider: "OpenAI",
    arbitrationModel: "gpt-4o-mini",
    arbitrationPrompt: "Test prompt",
    demand: "Test demand",
  }]),
});

console.log("--- Step 2: Simulate doObligation with current allowance ---");
try {
  // Try simulateContract to see if the current allowance is sufficient
  const simResult = await walletClient.simulateContract({
    address: escrowContract,
    abi: [{
      type: "function",
      name: "doObligation",
      inputs: [
        {
          name: "data",
          type: "tuple",
          components: [
            { name: "token", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "arbiter", type: "address" },
            { name: "demand", type: "bytes" },
          ],
        },
        { name: "expiration", type: "uint64" },
      ],
      outputs: [{ name: "", type: "bytes32" }],
      stateMutability: "nonpayable",
    }],
    functionName: "doObligation",
    args: [
      {
        token: tokenAddress,
        amount: amount,
        arbiter: finalAddresses.trustedOracleArbiter,
        demand: encodedDemand,
      },
      0n,
    ],
  });
  console.log("✅ Simulation SUCCEEDED with current allowance!");
  console.log("   Result:", simResult.result);
  console.log("   This means the current allowance is sufficient.");
  console.log("   The bug is confirmed: approveAndCreate has a race condition.");
  console.log("   The approve TX hasn't been mined when doObligation is sent.\n");
} catch (err) {
  console.log("❌ Simulation FAILED with current allowance:", err.message?.slice(0, 200));
  console.log();
  
  // Step 3: Try manual approve (reset to 0 first, then set new amount)
  console.log("--- Step 3: Testing manual approve → waitReceipt → simulate doObligation ---");
  
  if (!args.execute) {
    console.log("   [DRY RUN] Would execute:");
    console.log("   1. approve(escrowContract, 0) → wait receipt");
    console.log("   2. approve(escrowContract, amount) → wait receipt");
    console.log("   3. create() via SDK");
    console.log("   Pass --execute to actually run this.");
  } else {
    try {
      // Reset allowance to 0 first (some USDC implementations require this)
      console.log("   Approving 0 first...");
      const resetHash = await walletClient.writeContract({
        address: tokenAddress,
        abi: approveAbi,
        functionName: "approve",
        args: [escrowContract, 0n],
      });
      const resetReceipt = await walletClient.waitForTransactionReceipt({ hash: resetHash });
      console.log("   ✅ Reset approve TX mined. Status:", resetReceipt.status);

      // Now approve the actual amount
      console.log("   Approving", amount.toString(), "...");
      const approveHash = await walletClient.writeContract({
        address: tokenAddress,
        abi: approveAbi,
        functionName: "approve",
        args: [escrowContract, amount],
      });
      const approveReceipt = await walletClient.waitForTransactionReceipt({ hash: approveHash });
      console.log("   ✅ Approve TX mined. Status:", approveReceipt.status);

      // Verify allowance
      const newAllowance = await walletClient.readContract({
        address: tokenAddress,
        abi: approveAbi,
        functionName: "allowance",
        args: [account.address, escrowContract],
      });
      console.log("   New allowance:", newAllowance.toString());

      // Now call create() from SDK (does doObligation without approve)
      console.log("   Calling create() via SDK...");
      const { attested: escrow } = await alkahestClient.erc20.escrow.nonTierable.create(
        { address: tokenAddress, value: amount },
        { arbiter: finalAddresses.trustedOracleArbiter, demand: encodedDemand },
        0n
      );
      console.log("   ✅ Escrow created successfully!");
      console.log("   UID:", escrow.uid);
    } catch (err2) {
      console.log("   ❌ Failed:", err2.message?.slice(0, 300));
    }
  }
}

console.log("\n=== Test Complete ===");
