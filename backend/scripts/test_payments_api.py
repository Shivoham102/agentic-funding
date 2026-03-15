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
        choices=["create-escrow", "fulfill", "arbitrate", "collect", "escrow-status"],
        help="Which endpoint to call",
    )
    parser.add_argument("--project-id", default="000000000000000000000000", help="MongoDB ObjectId (24 hex chars)")
    parser.add_argument("--amount", type=float, default=100.0, help="Amount in USDC (human-readable)")
    parser.add_argument("--demand", default="Release when project shows 30% user growth", help="Natural language condition")
    parser.add_argument("--evidence", default="Project grew from 1000 to 1400 users (40%)", help="Fulfillment evidence")
    parser.add_argument("--base", default=BASE, help=f"API base URL (default {BASE})")
    args = parser.parse_args()

    with httpx.Client(timeout=30.0) as client:
        if args.action == "create-escrow":
            r = client.post(
                f"{args.base}/api/payments/create-escrow",
                json={
                    "project_id": args.project_id,
                    "amount": args.amount,
                    "demand": args.demand,
                },
            )
        elif args.action == "fulfill":
            r = client.post(
                f"{args.base}/api/payments/fulfill",
                json={
                    "project_id": args.project_id,
                    "fulfillment_evidence": args.evidence,
                },
            )
        elif args.action == "arbitrate":
            r = client.post(
                f"{args.base}/api/payments/arbitrate",
                json={"project_id": args.project_id},
            )
        elif args.action == "collect":
            r = client.post(
                f"{args.base}/api/payments/collect",
                json={"project_id": args.project_id},
            )
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
