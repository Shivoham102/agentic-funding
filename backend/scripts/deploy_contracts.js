#!/usr/bin/env node
/**
 * Custom Alkahest Contract Deployment Script
 *
 * Deploys ONLY the contracts needed for escrow functionality on Base Sepolia,
 * intentionally SKIPPING CommitRevealObligation (which has a constructor bug).
 *
 * Usage:
 *   cd backend/scripts && npm install
 *   bun run deploy_contracts.js --network base-sepolia --rpc-url <URL> --private-key <0xKEY>
 *
 * Or with NODE_PATH pointing to NLA's node_modules (skip local npm install):
 *   set NODE_PATH=C:\Users\shivo\AppData\Roaming\npm\node_modules\nla\node_modules
 *   bun run backend/scripts/deploy_contracts.js --network base-sepolia --rpc-url <URL> --private-key <0xKEY>
 */

import { parseArgs } from "util";
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, sepolia, foundry } from "viem/chains";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { fixtures, contracts } from "alkahest-ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// NLA deployments directory (global install)
const NLA_DEPLOYMENTS_DIR = "C:/Users/shivo/AppData/Roaming/npm/node_modules/nla/dist/cli/deployments";

// ─── CLI Args ───────────────────────────────────────────────────────────────

function parseCliArgs() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      network:       { type: "string" },
      "rpc-url":     { type: "string" },
      "private-key": { type: "string" },
      help:          { type: "boolean", short: "h" },
    },
    strict: true,
  });
  return values;
}

// ─── Chain lookup ───────────────────────────────────────────────────────────

function getChain(network) {
  switch (network.toLowerCase()) {
    case "base-sepolia": return baseSepolia;
    case "sepolia":      return sepolia;
    case "localhost":
    case "local":        return foundry;
    default:
      throw new Error(`Unknown network: ${network}. Supported: base-sepolia, sepolia, localhost`);
  }
}

// ─── Deploy helper ──────────────────────────────────────────────────────────

async function deployContract(client, name, abi, bytecode, args = []) {
  console.log(`📝 Deploying ${name}...`);
  const hash = await client.deployContract({
    abi,
    bytecode: bytecode,
    args,
  });
  console.log(`   Transaction: ${hash}`);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) {
    throw new Error(`Failed to deploy ${name} — no contract address in receipt`);
  }
  console.log(`   ✅ Deployed at: ${receipt.contractAddress}\n`);
  return receipt.contractAddress;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = parseCliArgs();

  if (args.help) {
    console.log(`
Custom Alkahest Deploy (escrow-only, no CommitRevealObligation)

Usage:
  bun run deploy_contracts.js --network base-sepolia --rpc-url <URL> --private-key <0xKEY>

Options:
  --network <name>       Network: base-sepolia | sepolia | localhost
  --rpc-url <url>        RPC endpoint
  --private-key <key>    Deployer private key (hex with 0x prefix)
  --help, -h             Show this help
`);
    process.exit(0);
  }

  // ── Validate inputs ────────────────────────────────────────────────────
  const network    = args.network;
  const privateKey = args["private-key"] || process.env.PRIVATE_KEY;
  let   rpcUrl     = args["rpc-url"]     || process.env.RPC_URL;

  if (!network) {
    console.error("❌ --network is required (base-sepolia, sepolia, localhost)");
    process.exit(1);
  }
  if (!privateKey) {
    console.error("❌ --private-key is required (or set PRIVATE_KEY env var)");
    process.exit(1);
  }
  if (!rpcUrl) {
    if (network === "localhost" || network === "local") {
      rpcUrl = "http://localhost:8545";
    } else {
      console.error("❌ --rpc-url is required for non-localhost networks");
      process.exit(1);
    }
  }

  // ── Setup client ───────────────────────────────────────────────────────
  const chain   = getChain(network);
  const account = privateKeyToAccount(privateKey);
  const client  = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  }).extend(publicActions);

  console.log("🚀 Custom Alkahest Deploy — escrow contracts only\n");
  console.log(`  🌐 Network:  ${network}`);
  console.log(`  📡 RPC URL:  ${rpcUrl}`);
  console.log(`  🔑 Deployer: ${account.address}`);

  const balance = await client.getBalance({ address: account.address });
  const ethBalance = Number(balance) / 1e18;
  console.log(`  💰 Balance:  ${ethBalance.toFixed(4)} ETH\n`);

  if (balance === 0n) {
    console.error("❌ Deployer has no ETH. Fund the account first.");
    process.exit(1);
  }

  // ── Load contract artifacts ────────────────────────────────────────────
  console.log("📦 Loading contract artifacts from alkahest-ts...\n");

  const SchemaRegistry         = fixtures.SchemaRegistry;
  const EAS                    = fixtures.EAS;
  const TrustedOracleArbiter   = contracts.TrustedOracleArbiter;
  const ERC20EscrowObligation  = contracts.ERC20EscrowObligation;
  const ERC20PaymentObligation = contracts.ERC20PaymentObligation;
  const ERC20BarterUtils       = contracts.ERC20BarterUtils;

  console.log("✅ Artifacts loaded (CommitRevealObligation intentionally skipped)\n");

  // ── Deploy contracts ───────────────────────────────────────────────────
  const addresses = {};
  const ZERO = "0x0000000000000000000000000000000000000000";

  // 1. EAS Schema Registry (no deps)
  console.log("🏗️  Step 1/6: Core infrastructure\n");
  addresses.easSchemaRegistry = await deployContract(
    client,
    "EAS Schema Registry",
    SchemaRegistry.abi,
    SchemaRegistry.bytecode.object,
  );

  // 2. EAS (depends on SchemaRegistry)
  addresses.eas = await deployContract(
    client,
    "EAS",
    EAS.abi,
    EAS.bytecode.object,
    [addresses.easSchemaRegistry],
  );

  // 3. Trusted Oracle Arbiter (depends on EAS)
  console.log("⚖️  Step 2/6: Arbiter\n");
  addresses.trustedOracleArbiter = await deployContract(
    client,
    "Trusted Oracle Arbiter",
    TrustedOracleArbiter.abi.abi,
    TrustedOracleArbiter.abi.bytecode.object,
    [addresses.eas],
  );

  // 4. ERC20 Escrow Obligation (depends on EAS + SchemaRegistry)
  console.log("📋 Step 3/6: ERC20 Escrow Obligation\n");
  addresses.erc20EscrowObligation = await deployContract(
    client,
    "ERC20 Escrow Obligation",
    ERC20EscrowObligation.abi.abi,
    ERC20EscrowObligation.abi.bytecode.object,
    [addresses.eas, addresses.easSchemaRegistry],
  );

  // 5. ERC20 Payment Obligation (depends on EAS + SchemaRegistry)
  console.log("📋 Step 4/6: ERC20 Payment Obligation\n");
  addresses.erc20PaymentObligation = await deployContract(
    client,
    "ERC20 Payment Obligation",
    ERC20PaymentObligation.abi.abi,
    ERC20PaymentObligation.abi.bytecode.object,
    [addresses.eas, addresses.easSchemaRegistry],
  );

  // 6. ERC20 Barter Utils (depends on EAS + Escrow + Payment; zero for the rest)
  console.log("🔄 Step 5/6: ERC20 Barter Utils\n");
  addresses.erc20BarterUtils = await deployContract(
    client,
    "ERC20 Barter Utils",
    ERC20BarterUtils.abi.abi,
    ERC20BarterUtils.abi.bytecode.object,
    [
      addresses.eas,
      addresses.erc20EscrowObligation,
      addresses.erc20PaymentObligation,
      ZERO, // erc721Escrow (unused)
      ZERO, // erc721Payment (unused)
      ZERO, // erc1155Escrow (unused)
      ZERO, // erc1155Payment (unused)
      ZERO, // tokenBundleEscrow (unused)
      ZERO, // tokenBundlePayment (unused)
      ZERO, // nativeEscrow (unused)
      ZERO, // nativePayment (unused)
    ],
  );

  // ── Build deployment JSON ──────────────────────────────────────────────
  console.log("📄 Step 6/6: Saving deployment addresses\n");

  // Read existing template to preserve all expected keys
  const templatePath = resolve(NLA_DEPLOYMENTS_DIR, "base-sepolia.json");
  let existingAddresses = {};
  try {
    const existing = JSON.parse(readFileSync(templatePath, "utf-8"));
    existingAddresses = existing.addresses || {};
  } catch {
    // template doesn't exist yet — that's fine
  }

  // Merge: start with empty/existing addresses, overwrite with our deployments
  const mergedAddresses = {
    ...existingAddresses,
    eas:                      addresses.eas,
    easSchemaRegistry:        addresses.easSchemaRegistry,
    trustedOracleArbiter:     addresses.trustedOracleArbiter,
    erc20EscrowObligation:    addresses.erc20EscrowObligation,
    erc20PaymentObligation:   addresses.erc20PaymentObligation,
    erc20BarterUtils:         addresses.erc20BarterUtils,
    // CommitRevealObligation intentionally left empty — constructor bug
  };

  const deployment = {
    network:    chain.name || network,
    chainId:    chain.id,
    rpcUrl,
    deployedAt: new Date().toISOString(),
    deployer:   account.address,
    addresses:  mergedAddresses,
  };

  const json = JSON.stringify(deployment, null, 2);

  // Write to NLA deployments directory
  const nlaOutPath = resolve(NLA_DEPLOYMENTS_DIR, "base-sepolia.json");
  if (!existsSync(dirname(nlaOutPath))) {
    mkdirSync(dirname(nlaOutPath), { recursive: true });
  }
  writeFileSync(nlaOutPath, json);
  console.log(`   ✅ NLA deployments: ${nlaOutPath}`);

  // Write local copy
  const localOutPath = resolve(__dirname, "deployment-base-sepolia.json");
  writeFileSync(localOutPath, json);
  console.log(`   ✅ Local copy:      ${localOutPath}`);

  // ── Summary ────────────────────────────────────────────────────────────
  console.log("\n✨ Deployment complete!\n");
  console.log("📋 Deployed Addresses:");
  console.log(`   EAS Schema Registry:        ${addresses.easSchemaRegistry}`);
  console.log(`   EAS:                        ${addresses.eas}`);
  console.log(`   Trusted Oracle Arbiter:     ${addresses.trustedOracleArbiter}`);
  console.log(`   ERC20 Escrow Obligation:    ${addresses.erc20EscrowObligation}`);
  console.log(`   ERC20 Payment Obligation:   ${addresses.erc20PaymentObligation}`);
  console.log(`   ERC20 Barter Utils:         ${addresses.erc20BarterUtils}`);
  console.log("\n⚠️  CommitRevealObligation was SKIPPED (known constructor bug)");
  console.log("\n🎯 Next steps:");
  console.log("   1. Update backend/.env with the new contract addresses if needed");
  console.log("   2. Start the oracle:  nla start-oracle --network base-sepolia --rpc-url <URL> --private-key <KEY>");
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err);
  process.exit(1);
});
