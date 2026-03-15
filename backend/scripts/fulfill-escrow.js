#!/usr/bin/env node
/**
 * Custom escrow fulfillment + arbitration script.
 *
 * 1. Creates a fulfillment attestation via stringObligation
 * 2. Since our wallet IS the oracle, directly calls arbitrate(true)
 *    on TrustedOracleArbiter -- no requestArbitration or oracle server needed.
 */
import { parseArgs } from "util";
import {
  createWalletClient, http, publicActions, formatEther,
} from "viem";
import { privateKeyToAccount, nonceManager } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { makeClient, contractAddresses } from "alkahest-ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const NLA_DEPLOYMENTS_DIR = join(
  process.env.APPDATA || join(process.env.HOME, "AppData", "Roaming"),
  "npm", "node_modules", "nla", "dist", "cli", "deployments"
);

function loadDeployment(deploymentPath) {
  let actualPath = deploymentPath;
  if (!actualPath || !existsSync(actualPath)) {
    const localPath = join(__dirname, "deployment-base-sepolia.json");
    const nlaPath = join(NLA_DEPLOYMENTS_DIR, "base-sepolia.json");
    if (existsSync(localPath)) actualPath = localPath;
    else if (existsSync(nlaPath)) actualPath = nlaPath;
    else throw new Error("No deployment file found");
  }
  const raw = JSON.parse(readFileSync(actualPath, "utf-8"));
  let addresses = {};
  if (contractAddresses[raw.network]) {
    addresses = { ...contractAddresses[raw.network] };
  }
  if (raw.addresses) {
    for (const [k, v] of Object.entries(raw.addresses)) {
      if (v && v !== "") addresses[k] = v;
    }
  }
  return { network: raw.network, chainId: raw.chainId, rpcUrl: raw.rpcUrl, addresses };
}

function parseCliArgs() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "escrow-uid":   { type: "string" },
      "fulfillment":  { type: "string" },
      "oracle":       { type: "string" },
      "private-key":  { type: "string" },
      "deployment":   { type: "string" },
      "rpc-url":      { type: "string" },
      help:           { type: "boolean", short: "h" },
    },
    strict: true,
  });
  return values;
}

async function main() {
  const args = parseCliArgs();
  if (args.help) {
    console.log("Usage: fulfill-escrow.js --escrow-uid <uid> --fulfillment <text> --oracle <addr> --private-key <key> [--rpc-url <url>]");
    process.exit(0);
  }

  const escrowUid = args["escrow-uid"];
  const fulfillment = args["fulfillment"];
  const oracleAddress = args["oracle"];
  const privateKey = args["private-key"] || process.env.PRIVATE_KEY;

  if (!escrowUid) { console.error("--escrow-uid required"); process.exit(1); }
  if (!fulfillment) { console.error("--fulfillment required"); process.exit(1); }
  if (!oracleAddress) { console.error("--oracle required"); process.exit(1); }
  if (!privateKey) { console.error("--private-key required"); process.exit(1); }

  const deployment = loadDeployment(args["deployment"]);
  const rpcUrl = args["rpc-url"] || deployment.rpcUrl;

  console.log("Fulfilling + arbitrating escrow\n");
  console.log(`  Escrow UID: ${escrowUid}`);
  console.log(`  Fulfillment: "${fulfillment}"`);
  console.log(`  Oracle: ${oracleAddress}`);
  console.log(`  RPC: ${rpcUrl}\n`);

  const account = privateKeyToAccount(
    privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`,
    { nonceManager }
  );
  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(rpcUrl),
  }).extend(publicActions);

  console.log(`  Fulfiller/Oracle: ${account.address}`);
  const balance = await walletClient.getBalance({ address: account.address });
  console.log(`  ETH balance: ${parseFloat(formatEther(balance)).toFixed(4)} ETH\n`);

  const client = makeClient(walletClient, deployment.addresses);

  // Step 1: Create fulfillment using stringObligation
  console.log("Step 1: Creating fulfillment (stringObligation)...");
  const { attested: fulfillmentAttestation } = await client.stringObligation.doObligation(
    fulfillment,
    escrowUid
  );
  console.log(`  Fulfillment UID: ${fulfillmentAttestation.uid}`);
  console.log(`  Attester: ${fulfillmentAttestation.attester}\n`);

  // Step 2: As the oracle, directly approve the fulfillment
  // No requestArbitration needed -- our wallet IS the oracle, so we call
  // arbitrate(obligationUid, demand, decision=true) directly.
  console.log("Step 2: Arbitrating (oracle approving fulfillment)...");
  const escrow = await client.getAttestation(escrowUid);
  const decodedEscrow = client.erc20.escrow.nonTierable.decodeObligation(escrow.data);

  // The demand inside trustedOracle is encoded as (oracle, innerData)
  // We need to pass the innerData (the LLM demand) to the arbitrate call
  const trustedOracleDemandData = client.arbiters.general.trustedOracle.decodeDemand(decodedEscrow.demand);
  const innerDemand = trustedOracleDemandData.data;

  const arbHash = await walletClient.writeContract({
    address: deployment.addresses.trustedOracleArbiter,
    abi: [{
      type: "function",
      name: "arbitrate",
      inputs: [
        { name: "obligation", type: "bytes32" },
        { name: "demand", type: "bytes" },
        { name: "decision", type: "bool" },
      ],
      outputs: [],
      stateMutability: "nonpayable",
    }],
    functionName: "arbitrate",
    args: [fulfillmentAttestation.uid, innerDemand, true],
  });
  console.log(`  Arbitration TX: ${arbHash}`);
  await walletClient.waitForTransactionReceipt({ hash: arbHash });
  console.log("  APPROVED\n");

  console.log("Fulfillment + arbitration complete!");
  console.log(`  Fulfillment UID: ${fulfillmentAttestation.uid}`);
  console.log(`\nCollect: node collect-escrow.js --escrow-uid ${escrowUid} --fulfillment-uid ${fulfillmentAttestation.uid}`);
}

main().catch(err => { console.error("Failed to fulfill escrow:", err); process.exit(1); });
