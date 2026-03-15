import { createPublicClient, http, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';

const client = createPublicClient({ chain: baseSepolia, transport: http(process.env.RPC_URL) });
const abi = parseAbi(['function allowance(address owner, address spender) view returns (uint256)', 'function balanceOf(address) view returns (uint256)']);

const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const WALLET = '0x5b4b0172eA50c614cFe5a0B2Aa0A671Af33D4Bc3';
const ESCROW = '0x21C12E1a0c1a004fFc9eD25D900F5D79d9731A11';

const allowance = await client.readContract({
    address: USDC, abi, functionName: 'allowance',
    args: [WALLET, ESCROW]
});

const balance = await client.readContract({
    address: USDC, abi, functionName: 'balanceOf',
    args: [WALLET]
});

console.log('Current allowance (wallet -> escrow):', allowance.toString());
console.log('Current USDC balance:', balance.toString());
