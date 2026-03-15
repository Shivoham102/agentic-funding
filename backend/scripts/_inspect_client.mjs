import { makeClient } from "alkahest-ts";
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const acc = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const wc = createWalletClient({ account: acc, chain: baseSepolia, transport: http("http://localhost:8545") }).extend(publicActions);
const client = makeClient(wc, {});

console.log("stringObligation keys:", Object.keys(client.stringObligation || {}));
console.log("stringObligation.address:", client.stringObligation?.address);
