#!/usr/bin/env node
/**
 * Simple ERC20 direct transfer using viem.
 * No alkahest/escrow needed - just a standard token transfer.
 */
import { parseArgs } from "util";
import { createWalletClient, http, publicActions, parseAbi } from "viem";
import { privateKeyToAccount, nonceManager } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
]);

function parseCliArgs() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      to: { type: "string" },
      amount: { type: "string" },
      token: { type: "string" },
      "private-key": { type: "string" },
      "rpc-url": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
  });
  return values;
}

async function main() {
  const args = parseCliArgs();

  if (args.help) {
    console.log("Usage: direct-transfer.js --to <addr> --amount <n> --token <addr> --private-key <key> --rpc-url <url>");
    process.exit(0);
  }

  const to = args.to;
  const amount = args.amount;
  const tokenAddress = args.token;
  const privateKey = args["private-key"] || process.env.PRIVATE_KEY;
  const rpcUrl = args["rpc-url"] || "https://sepolia.base.org";

  if (!to) { console.error("Error: --to is required"); process.exit(1); }
  if (!amount) { console.error("Error: --amount is required"); process.exit(1); }
  if (!tokenAddress) { console.error("Error: --token is required"); process.exit(1); }
  if (!privateKey) { console.error("Error: --private-key is required"); process.exit(1); }

  const account = privateKeyToAccount(privateKey, { nonceManager });
  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(rpcUrl),
  }).extend(publicActions);

  // Check balance
  const balance = await walletClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });

  if (balance < BigInt(amount)) {
    console.error(`Insufficient balance: have ${balance}, need ${amount}`);
    process.exit(1);
  }

  // Transfer
  const hash = await walletClient.writeContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [to, BigInt(amount)],
  });

  const receipt = await walletClient.waitForTransactionReceipt({ hash });

  console.log(`Transfer successful!`);
  console.log(`Transaction: ${hash}`);
  console.log(`Status: ${receipt.status}`);
}

main().catch(err => {
  console.error("Transfer failed:", err.message || err);
  process.exit(1);
});
