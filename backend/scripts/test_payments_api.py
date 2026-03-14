#!/usr/bin/env python3
"""Manual test script for payment API. Run with backend up: uvicorn main:app --reload --port 8000."""
import argparse
import json
import sys

try:
    import httpx
except ImportError:
    print("Install httpx: pip install httpx")
    sys.exit(1)

BASE = "http://localhost:8000"


def main() -> None:
    parser = argparse.ArgumentParser(description="Test payment API endpoints")
    parser.add_argument(
        "action",
        choices=["process", "release", "oracle-check", "escrow-status"],
        help="Which endpoint to call",
    )
    parser.add_argument("--project-id", default="000000000000000000000000", help="MongoDB ObjectId (24 hex chars)")
    parser.add_argument("--recipient", default="0x742d35Cc6634C0532925a3b844Bc454e4438f44e", help="EVM address for process")
    parser.add_argument("--amount", type=int, default=100_000_000, help="Amount in smallest unit (e.g. 100e6 for 100 USDC)")
    parser.add_argument("--escrow-uid", default="fake-escrow-uid", help="For release: escrow_attestation_uid")
    parser.add_argument("--base", default=BASE, help=f"API base URL (default {BASE})")
    args = parser.parse_args()

    with httpx.Client(timeout=30.0) as client:
        if args.action == "process":
            r = client.post(
                f"{args.base}/api/payments/process",
                json={
                    "project_id": args.project_id,
                    "recipient_address": args.recipient,
                    "amount": args.amount,
                    "arbiter_address": "",
                },
            )
        elif args.action == "release":
            r = client.post(
                f"{args.base}/api/payments/release",
                json={
                    "project_id": args.project_id,
                    "escrow_attestation_uid": args.escrow_uid,
                },
            )
        elif args.action == "oracle-check":
            r = client.post(f"{args.base}/api/payments/oracle/check")
        elif args.action == "escrow-status":
            r = client.get(f"{args.base}/api/payments/escrow/{args.project_id}")
        else:
            print("Unknown action")
            sys.exit(1)

    print(f"Status: {r.status_code}")
    try:
        print(json.dumps(r.json(), indent=2))
    except Exception:
        print(r.text)
    if not r.is_success:
        sys.exit(1)


if __name__ == "__main__":
    main()
