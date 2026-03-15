#!/usr/bin/env node
/**
 * Deploy a MockERC20Permit token to Base Sepolia for testing.
 *
 * The MockERC20Permit constructor mints a large initial supply to the deployer,
 * so no separate mint call is needed.
 *
 * Usage:
 *   bun run backend/scripts/deploy_mock_token.js --rpc-url <URL> --private-key <0xKEY>
 *   bun run backend/scripts/deploy_mock_token.js --rpc-url <URL> --private-key <0xKEY> --name "My Token" --symbol "MTK"
 */

import { parseArgs } from "util";
import { createWalletClient, http, publicActions, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { fixtures } from "alkahest-ts";

// ─── CLI Args ───────────────────────────────────────────────────────────────

function parseCliArgs() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "rpc-url":     { type: "string" },
      "private-key": { type: "string" },
      name:          { type: "string" },
      symbol:        { type: "string" },
      help:          { type: "boolean", short: "h" },
    },
    strict: true,
  });
  return values;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = parseCliArgs();

  if (args.help) {
    console.log(`
Deploy MockERC20Permit token to Base Sepolia

Usage:
  bun run deploy_mock_token.js --rpc-url <URL> --private-key <0xKEY>

Options:
  --rpc-url <url>        RPC endpoint for Base Sepolia
  --private-key <key>    Deployer private key (hex with 0x prefix)
  --name <name>          Token name (default: "Test USDC")
  --symbol <symbol>      Token symbol (default: "tUSDC")
  --help, -h             Show this help
`);
    process.exit(0);
  }

  // ── Validate inputs ────────────────────────────────────────────────────
  const privateKey = args["private-key"] || process.env.PRIVATE_KEY;
  const rpcUrl     = args["rpc-url"]     || process.env.RPC_URL;
  const tokenName  = args.name   || "Test USDC";
  const tokenSymbol = args.symbol || "tUSDC";

  if (!privateKey) {
    console.error("❌ --private-key is required (or set PRIVATE_KEY env var)");
    process.exit(1);
  }
  if (!rpcUrl) {
    console.error("❌ --rpc-url is required (or set RPC_URL env var)");
    process.exit(1);
  }

  // ── Setup client ───────────────────────────────────────────────────────
  const account = privateKeyToAccount(privateKey);
  const client  = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(rpcUrl),
  }).extend(publicActions);

  console.log("🪙  MockERC20Permit Token Deployment\n");
  console.log(`  🌐 Network:  Base Sepolia`);
  console.log(`  📡 RPC URL:  ${rpcUrl}`);
  console.log(`  🔑 Deployer: ${account.address}`);

  const balance = await client.getBalance({ address: account.address });
  const ethBalance = Number(balance) / 1e18;
  console.log(`  💰 Balance:  ${ethBalance.toFixed(4)} ETH\n`);

  if (balance === 0n) {
    console.error("❌ Deployer has no ETH. Fund the account first.");
    process.exit(1);
  }

  // ── Load artifact ──────────────────────────────────────────────────────
  const MockERC20Permit = fixtures.MockERC20Permit;

  // ── Deploy ─────────────────────────────────────────────────────────────
  console.log(`📝 Deploying MockERC20Permit ("${tokenName}", "${tokenSymbol}")...\n`);

  const hash = await client.deployContract({
    abi: MockERC20Permit.abi,
    bytecode: MockERC20Permit.bytecode.object,
    args: [tokenName, tokenSymbol],
  });
  console.log(`   Transaction: ${hash}`);

  const receipt = await client.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) {
    throw new Error("Failed to deploy MockERC20Permit — no contract address in receipt");
  }
  console.log(`   ✅ Deployed at: ${receipt.contractAddress}\n`);

  // ── Verify deployer balance ────────────────────────────────────────────
  const tokenBalance = await client.readContract({
    address: receipt.contractAddress,
    abi: MockERC20Permit.abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  console.log(`   💰 Deployer token balance: ${formatEther(tokenBalance)} ${tokenSymbol}\n`);

  // ── Summary ────────────────────────────────────────────────────────────
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  ✅ MockERC20Permit deployed successfully!                  ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
  console.log(`  Token address: ${receipt.contractAddress}`);
  console.log(`  Token name:    ${tokenName}`);
  console.log(`  Token symbol:  ${tokenSymbol}\n`);
  console.log("🎯 Next step:");
  console.log(`   Update your backend/.env to set:`);
  console.log(`     ESCROW_TOKEN_ADDRESS=${receipt.contractAddress}\n`);
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err);
  process.exit(1);
});
