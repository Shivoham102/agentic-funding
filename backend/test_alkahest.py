"""
Standalone test script for Alkahest SDK on Base Sepolia.
Run: cd backend && python test_alkahest.py

Tests each step of the SDK integration in isolation so you can
identify exactly what works and what doesn't.
"""

import asyncio
import os
import sys


def main():
    print("=" * 60)
    print("Alkahest SDK Integration Test (Base Sepolia)")
    print("=" * 60)

    # Step 0: Load environment
    print("\n[Step 0] Loading environment...")
    try:
        from dotenv import load_dotenv
        load_dotenv()
        print("  OK: .env loaded")
    except ImportError:
        print("  WARN: python-dotenv not installed, using system env vars")

    private_key = os.getenv("ORACLE_PRIVATE_KEY", "")
    rpc_url = os.getenv("BASE_SEPOLIA_RPC_URL", "https://sepolia.base.org")
    wallet_address = os.getenv("ORACLE_WALLET_ADDRESS", "")
    token_address = os.getenv("ESCROW_TOKEN_ADDRESS", "0x036CbD53842c5426634e7929541eC2318f3dCF7e")

    if not private_key:
        print("  FAIL: ORACLE_PRIVATE_KEY not set in .env")
        sys.exit(1)
    print(f"  OK: Private key loaded (starts with {private_key[:6]}...)")
    print(f"  OK: RPC URL = {rpc_url}")
    print(f"  OK: Wallet = {wallet_address or '(not set, will derive)'}")
    print(f"  OK: Token = {token_address}")

    # Step 1: Test imports
    print("\n[Step 1] Testing imports...")

    try:
        from eth_abi import encode
        print("  OK: eth_abi imported")
    except ImportError as e:
        print(f"  FAIL: eth_abi not available: {e}")
        print("  FIX: pip install eth-abi")
        sys.exit(1)

    alkahest_available = False
    try:
        from alkahest_py.alkahest_py import AlkahestClient
        alkahest_available = True
        print("  OK: alkahest_py.alkahest_py.AlkahestClient imported")
    except ImportError as e:
        print(f"  FAIL: alkahest_py not available: {e}")
        print("  FIX: pip install alkahest-py")
        print("  NOTE: This is a Rust/PyO3 package. On Windows you may need:")
        print("        - Visual Studio Build Tools with C++ workload")
        print("        - Or use WSL (Windows Subsystem for Linux)")
    except AttributeError as e:
        print(f"  WARN: alkahest_py imported but AlkahestClient not found: {e}")
        print("  The package version may not export AlkahestClient directly.")
        print("  Checking what's available...")
        try:
            import alkahest_py
            members = [m for m in dir(alkahest_py) if not m.startswith('_')]
            print(f"  Available exports: {members}")
            # Also check the inner module
            try:
                import alkahest_py.alkahest_py as inner
                inner_members = [m for m in dir(inner) if not m.startswith('_')]
                print(f"  Inner module exports: {inner_members}")
            except Exception:
                pass
        except Exception as e2:
            print(f"  Could not inspect module: {e2}")

    # Step 2: Test web3 connection and balances
    print("\n[Step 2] Testing RPC connection and balances...")
    try:
        from web3 import Web3
        w3 = Web3(Web3.HTTPProvider(rpc_url))

        if w3.is_connected():
            print(f"  OK: Connected to RPC")
            chain_id = w3.eth.chain_id
            print(f"  OK: Chain ID = {chain_id} (Base Sepolia = 84532)")
            if chain_id != 84532:
                print(f"  WARN: Expected chain ID 84532 (Base Sepolia), got {chain_id}")
        else:
            print(f"  FAIL: Cannot connect to RPC at {rpc_url}")
            print("  FIX: Get an Alchemy URL from https://alchemy.com")

        # Derive address from private key if not set
        if not wallet_address:
            account = w3.eth.account.from_key(private_key)
            wallet_address = account.address
            print(f"  INFO: Derived wallet address: {wallet_address}")

        # Check ETH balance
        eth_balance = w3.eth.get_balance(wallet_address)
        eth_formatted = w3.from_wei(eth_balance, 'ether')
        print(f"  {'OK' if eth_balance > 0 else 'FAIL'}: ETH balance = {eth_formatted} ETH")
        if eth_balance == 0:
            print("  FIX: Get testnet ETH from https://www.alchemy.com/faucets/base-sepolia")

        # Check USDC balance (ERC20)
        erc20_abi = [
            {
                "inputs": [{"name": "account", "type": "address"}],
                "name": "balanceOf",
                "outputs": [{"name": "", "type": "uint256"}],
                "stateMutability": "view",
                "type": "function",
            },
            {
                "inputs": [],
                "name": "decimals",
                "outputs": [{"name": "", "type": "uint8"}],
                "stateMutability": "view",
                "type": "function",
            },
        ]

        try:
            checksum_token = Web3.to_checksum_address(token_address)
            erc20 = getattr(w3.eth, "contract")(address=checksum_token, abi=erc20_abi)
            token_balance = erc20.functions.balanceOf(
                Web3.to_checksum_address(wallet_address)
            ).call()
            decimals = erc20.functions.decimals().call()
            token_formatted = token_balance / (10 ** decimals)
            print(f"  {'OK' if token_balance > 0 else 'FAIL'}: Token balance = {token_formatted} (raw: {token_balance}, decimals: {decimals})")
            if token_balance == 0:
                print("  FIX: Get test USDC from https://faucet.circle.com/ (select Base Sepolia)")
        except Exception as e:
            print(f"  WARN: Could not check token balance: {e}")

    except ImportError:
        print("  FAIL: web3 not installed")
        print("  FIX: pip install web3")
    except Exception as e:
        print(f"  FAIL: RPC error: {e}")

    # Step 3: Test Alkahest client initialization
    if not alkahest_available:
        print("\n[Step 3] SKIPPED: AlkahestClient not available")
        print("\n[Step 4] SKIPPED: AlkahestClient not available")
        print("\n" + "=" * 60)
        print("RESULT: SDK import failed. Fix alkahest-py installation first.")
        print("=" * 60)
        return

    print("\n[Step 3] Initializing AlkahestClient...")
    client = None

    # Constructor is sync
    try:
        client = AlkahestClient(private_key, rpc_url)
        print("  OK: AlkahestClient created (sync constructor)")
    except Exception as e:
        print(f"  FAIL: Constructor error: {e}")
        import traceback
        traceback.print_exc()

    if client is None:
        print("\n[Step 4] SKIPPED: Client not initialized")
        print("\n" + "=" * 60)
        print("RESULT: Client initialization failed. Check errors above.")
        print("=" * 60)
        return

    # Step 4: Test a simple approve call (tiny amount, safe to repeat)
    print("\n[Step 4] Testing erc20.approve (1 token unit)...")
    try:
        # Check if client has erc20 sub-client
        if not hasattr(client, 'erc20'):
            print(f"  FAIL: Client has no 'erc20' attribute")
            print(f"  Available attributes: {[a for a in dir(client) if not a.startswith('_')]}")
        else:
            print(f"  OK: client.erc20 exists")
            erc20_methods = [m for m in dir(client.erc20) if not m.startswith('_')]
            print(f"  OK: erc20 methods: {erc20_methods}")

            # erc20 methods are async, so wrap in asyncio.run()
            async def _test_approve(c, addr):
                return await c.erc20.approve(
                    {"address": addr, "value": 1},
                    "escrow",
                )

            print("  Sending approve(1 unit) for escrow...")
            result = asyncio.run(_test_approve(client, token_address))
            print(f"  OK: Approve tx result: {result}")
    except Exception as e:
        print(f"  FAIL: {e}")
        import traceback
        traceback.print_exc()

    # Summary
    print("\n" + "=" * 60)
    print("TEST COMPLETE")
    print("=" * 60)
    print("If all steps passed, you can test the full payment flow:")
    print("  curl -X POST http://localhost:8000/api/payments/process \\")
    print('    -H "Content-Type: application/json" \\')
    print('    -d \'{"project_id": "YOUR_ID", "recipient_address": "0x...", "amount": 1000000}\'')


if __name__ == "__main__":
    main()
