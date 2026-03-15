#!/usr/bin/env node
/**
 * Deploy ONLY the CommitRevealObligation contract to fill the gap
 * in the existing deployment. Uses the already-deployed EAS and SchemaRegistry.
 *
 * Usage:
 *   node deploy-commit-reveal.js --rpc-url <URL> --private-key <0xKEY>
 */
import { parseArgs } from "util";
import { createWalletClient, http, publicActions, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { writeFileSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { contracts } from "alkahest-ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const NLA_DEPLOYMENTS_PATH = "C:/Users/shivo/AppData/Roaming/npm/node_modules/nla/dist/cli/deployments/base-sepolia.json";
const LOCAL_DEPLOYMENT_PATH = resolve(__dirname, "deployment-base-sepolia.json");

function parseCliArgs() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "rpc-url":     { type: "string" },
      "private-key": { type: "string" },
      help:          { type: "boolean", short: "h" },
    },
    strict: true,
  });
  return values;
}

async function main() {
  const args = parseCliArgs();
  if (args.help) {
    console.log("Usage: node deploy-commit-reveal.js --rpc-url <URL> --private-key <0xKEY>");
    process.exit(0);
  }

  const privateKey = args["private-key"] || process.env.PRIVATE_KEY;
  const rpcUrl = args["rpc-url"] || process.env.RPC_URL;

  if (!privateKey) { console.error("--private-key required"); process.exit(1); }
  if (!rpcUrl) { console.error("--rpc-url required"); process.exit(1); }

  // Load existing deployment to get EAS and SchemaRegistry addresses
  const existing = JSON.parse(readFileSync(LOCAL_DEPLOYMENT_PATH, "utf-8"));
  const eas = existing.addresses.eas;
  const easSchemaRegistry = existing.addresses.easSchemaRegistry;

  if (!eas || !easSchemaRegistry) {
    console.error("Existing deployment missing eas or easSchemaRegistry addresses");
    process.exit(1);
  }

  console.log(`\nDeploying CommitRevealObligation`);
  console.log(`  EAS: ${eas}`);
  console.log(`  SchemaRegistry: ${easSchemaRegistry}`);
  console.log(`  RPC: ${rpcUrl}\n`);

  const account = privateKeyToAccount(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`);
  const client = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(rpcUrl),
  }).extend(publicActions);

  const balance = await client.getBalance({ address: account.address });
  console.log(`  Deployer: ${account.address}`);
  console.log(`  Balance: ${parseFloat(formatEther(balance)).toFixed(4)} ETH\n`);

  if (balance === 0n) {
    console.error("No ETH for gas");
    process.exit(1);
  }

  const CommitReveal = contracts.CommitRevealObligation;
  // Constructor: (eas, schemaRegistry, bondAmount, commitDeadline, slashedBondRecipient)
  // bondAmount: 0 (no bond required for commits)
  // commitDeadline: 300 (5 min window to reveal after commit)
  // slashedBondRecipient: deployer address (receives slashed bonds if any)
  const bondAmount = 0n;
  const commitDeadline = 300n;
  const slashedBondRecipient = account.address;
  console.log("Deploying CommitRevealObligation...");
  console.log(`  bondAmount: ${bondAmount}`);
  console.log(`  commitDeadline: ${commitDeadline}s`);
  console.log(`  slashedBondRecipient: ${slashedBondRecipient}`);
  const hash = await client.deployContract({
    abi: CommitReveal.abi.abi,
    bytecode: CommitReveal.abi.bytecode.object,
    args: [eas, easSchemaRegistry, bondAmount, commitDeadline, slashedBondRecipient],
  });
  console.log(`  TX: ${hash}`);

  const receipt = await client.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) {
    console.error("Deploy failed - no contract address in receipt");
    process.exit(1);
  }
  console.log(`  Deployed at: ${receipt.contractAddress}\n`);

  // Update both deployment files
  existing.addresses.commitRevealObligation = receipt.contractAddress;

  const json = JSON.stringify(existing, null, 2);
  writeFileSync(LOCAL_DEPLOYMENT_PATH, json);
  console.log(`Updated: ${LOCAL_DEPLOYMENT_PATH}`);

  writeFileSync(NLA_DEPLOYMENTS_PATH, json);
  console.log(`Updated: ${NLA_DEPLOYMENTS_PATH}`);

  console.log("\nDone. commitRevealObligation is now available for escrow:fulfill.");
}

main().catch(err => { console.error("Failed:", err); process.exit(1); });
