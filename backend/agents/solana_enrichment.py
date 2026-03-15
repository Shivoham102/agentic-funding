from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import httpx


TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
SOLANA_SYSTEM_PROGRAM_ID = "11111111111111111111111111111111"


class SolanaEnrichmentClient:
    """Collect deterministic wallet features using a configurable Solana analytics provider."""

    def __init__(
        self,
        rpc_url: str,
        commitment: str = "finalized",
        recent_signature_limit: int = 25,
        analytics_provider: str = "rpc_history",
        analytics_signature_limit: int = 100,
        timeout_seconds: float = 20.0,
        max_retries: int = 2,
    ) -> None:
        provider_name = (analytics_provider or "rpc_history").strip().lower()
        provider_cls = {
            "rpc_history": RpcHistoryAnalyticsProvider,
            "rpc_basic": RpcHistoryAnalyticsProvider,
        }.get(provider_name)
        if provider_cls is None:
            raise ValueError(f"Unsupported Solana analytics provider: {analytics_provider}")

        self.rpc_url = rpc_url
        self.commitment = provider_cls.normalize_commitment(commitment)
        self.recent_signature_limit = max(1, int(recent_signature_limit))
        self.analytics_signature_limit = max(self.recent_signature_limit, int(analytics_signature_limit))
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries
        self.provider_name = provider_name
        self.provider = provider_cls(
            rpc_url=rpc_url,
            commitment=self.commitment,
            recent_signature_limit=self.recent_signature_limit,
            analytics_signature_limit=self.analytics_signature_limit,
            timeout_seconds=timeout_seconds,
            max_retries=max_retries,
        )

    async def get_wallet_summary(self, pubkey: str) -> dict[str, Any]:
        enrichment = await self.collect_wallet_enrichment(pubkey)
        return enrichment["summary"]

    def get_derived_signals(self, summary: dict[str, Any]) -> dict[str, Any]:
        return self.provider.get_derived_signals(summary)

    async def collect_wallet_enrichment(self, pubkey: str) -> dict[str, Any]:
        return await self.provider.collect_wallet_enrichment(pubkey)


class RpcHistoryAnalyticsProvider:
    """RPC-backed Solana analytics provider with transaction-history signals."""

    def __init__(
        self,
        rpc_url: str,
        commitment: str = "finalized",
        recent_signature_limit: int = 25,
        analytics_signature_limit: int = 100,
        timeout_seconds: float = 20.0,
        max_retries: int = 2,
    ) -> None:
        self.rpc_url = rpc_url
        self.commitment = self.normalize_commitment(commitment)
        self.recent_signature_limit = max(1, int(recent_signature_limit))
        self.analytics_signature_limit = max(self.recent_signature_limit, int(analytics_signature_limit))
        self.timeout_seconds = timeout_seconds
        self.max_retries = max(0, int(max_retries))

    async def collect_wallet_enrichment(self, pubkey: str) -> dict[str, Any]:
        requested_at = self._now_iso()
        signature_commitment = self.normalize_signature_commitment(self.commitment)
        request_specs = [
            {
                "label": "Solana getBalance",
                "method": "getBalance",
                "params": [pubkey, {"commitment": self.commitment}],
                "request_signature": f"getBalance:{pubkey}:{self.commitment}",
            },
            {
                "label": "Solana getTokenAccountsByOwner",
                "method": "getTokenAccountsByOwner",
                "params": [
                    pubkey,
                    {"programId": TOKEN_PROGRAM_ID},
                    {"encoding": "jsonParsed", "commitment": self.commitment},
                ],
                "request_signature": f"getTokenAccountsByOwner:{pubkey}:{self.commitment}",
            },
            {
                "label": "Solana getSignaturesForAddress",
                "method": "getSignaturesForAddress",
                "params": [
                    pubkey,
                    {
                        "limit": self.analytics_signature_limit,
                        "commitment": signature_commitment,
                    },
                ],
                "request_signature": (
                    f"getSignaturesForAddress:{pubkey}:{signature_commitment}:{self.analytics_signature_limit}"
                ),
            },
        ]

        balance_response, token_accounts_response, signatures_response = await asyncio.gather(
            *[self._rpc_request(spec["method"], spec["params"]) for spec in request_specs],
        )

        all_signatures = self._extract_recent_signatures(signatures_response)
        recent_signatures = all_signatures[: self.recent_signature_limit]
        transaction_summaries = await self._collect_transaction_summaries(pubkey, all_signatures)
        indexed_analytics = self._derive_indexed_analytics(pubkey, transaction_summaries)

        rpc_calls = [
            {
                "label": request_specs[0]["label"],
                "method": request_specs[0]["method"],
                "request_signature": request_specs[0]["request_signature"],
                "observed_at": requested_at,
                "response": balance_response,
            },
            {
                "label": request_specs[1]["label"],
                "method": request_specs[1]["method"],
                "request_signature": request_specs[1]["request_signature"],
                "observed_at": requested_at,
                "response": token_accounts_response,
            },
            {
                "label": request_specs[2]["label"],
                "method": request_specs[2]["method"],
                "request_signature": request_specs[2]["request_signature"],
                "observed_at": requested_at,
                "response": signatures_response,
            },
            {
                "label": "Solana indexed wallet analytics",
                "method": "getTransaction",
                "request_signature": f"getTransaction_batch:{pubkey}:{len(transaction_summaries)}",
                "observed_at": requested_at,
                "response": {
                    "provider": "rpc_history",
                    "wallet": pubkey,
                    "transactions": transaction_summaries,
                    "indexed_analytics": indexed_analytics,
                },
            },
        ]

        summary = {
            "pubkey": pubkey,
            "commitment": self.commitment,
            "requested_at": requested_at,
            "solBalanceLamports": self._extract_balance(balance_response),
            "tokenAccounts": self._extract_token_accounts(pubkey, token_accounts_response),
            "recentSignatures": recent_signatures,
        }

        return {
            "summary": summary,
            "derived_signals": self.get_derived_signals(summary),
            "indexed_analytics": indexed_analytics,
            "provider": "rpc_history",
            "rpc_calls": rpc_calls,
        }

    def get_derived_signals(self, summary: dict[str, Any]) -> dict[str, Any]:
        earliest_observed_at = self._extract_earliest_observed_at(summary.get("recentSignatures"))
        wallet_age_estimate = self._derive_wallet_age_estimate(summary.get("requested_at"), earliest_observed_at)
        token_accounts = summary.get("tokenAccounts") if isinstance(summary.get("tokenAccounts"), list) else []
        holdings_count = len(
            [
                account
                for account in token_accounts
                if self._to_float(account.get("ui_amount")) > 0 or self._to_float(account.get("amount_raw")) > 0
            ]
        )
        signature_count = len(summary.get("recentSignatures") or [])

        return {
            "walletAgeEstimate": wallet_age_estimate,
            "activityLevel": self._derive_activity_level(signature_count),
            "holdingsCount": holdings_count,
        }

    async def _collect_transaction_summaries(
        self,
        pubkey: str,
        signatures: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        signature_values = [
            signature.get("signature")
            for signature in signatures[: self.analytics_signature_limit]
            if isinstance(signature.get("signature"), str) and signature.get("signature")
        ]
        if not signature_values:
            return []

        responses = await asyncio.gather(
            *[
                self._rpc_request(
                    "getTransaction",
                    [
                        signature_value,
                        {
                            "encoding": "jsonParsed",
                            "commitment": self.commitment,
                            "maxSupportedTransactionVersion": 0,
                        },
                    ],
                )
                for signature_value in signature_values
            ]
        )

        summaries = []
        for signature_value, response in zip(signature_values, responses, strict=False):
            summaries.append(self._extract_transaction_summary(pubkey, signature_value, response))
        return [summary for summary in summaries if summary]

    async def _rpc_request(self, method: str, params: list[Any]) -> dict[str, Any]:
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params,
        }
        timeout = httpx.Timeout(self.timeout_seconds)
        last_error: Exception | None = None

        for attempt in range(self.max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    response = await client.post(self.rpc_url, json=payload)
                    response.raise_for_status()
                    data = response.json()
                    if isinstance(data, dict) and data.get("error"):
                        raise RuntimeError(f"RPC error for {method}: {data['error']}")
                    if not isinstance(data, dict):
                        raise RuntimeError(f"Unexpected RPC response type for {method}")
                    return data
            except (httpx.HTTPError, ValueError, RuntimeError) as exc:
                last_error = exc
                if attempt >= self.max_retries:
                    break
                await asyncio.sleep(0.5 * (2**attempt))

        raise RuntimeError(f"Solana RPC request failed for {method}: {last_error}")

    def _extract_balance(self, payload: dict[str, Any]) -> int:
        result = payload.get("result")
        if isinstance(result, dict):
            value = result.get("value")
            if isinstance(value, int):
                return value
        return 0

    def _extract_token_accounts(self, owner: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
        result = payload.get("result")
        if not isinstance(result, dict):
            return []
        value = result.get("value")
        if not isinstance(value, list):
            return []

        token_accounts: list[dict[str, Any]] = []
        for item in value:
            if not isinstance(item, dict):
                continue
            pubkey = self._text(item.get("pubkey"))
            account = item.get("account")
            if not isinstance(account, dict):
                continue
            program_id = self._text(account.get("owner"))
            parsed_info = self._extract_parsed_info(account.get("data"))
            token_amount = self._extract_token_amount(parsed_info)
            token_accounts.append(
                {
                    "address": pubkey,
                    "mint": self._text(parsed_info.get("mint")),
                    "amount_raw": token_amount["amount_raw"],
                    "decimals": token_amount["decimals"],
                    "ui_amount": token_amount["ui_amount"],
                    "owner": self._text(parsed_info.get("owner")) or owner,
                    "program_id": program_id,
                }
            )
        return token_accounts

    def _extract_recent_signatures(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        result = payload.get("result")
        if not isinstance(result, list):
            return []

        signatures: list[dict[str, Any]] = []
        for item in result:
            if not isinstance(item, dict):
                continue
            signatures.append(
                {
                    "signature": self._text(item.get("signature")),
                    "slot": self._to_int(item.get("slot")),
                    "block_time": self._to_int(item.get("blockTime"), default=None),
                    "err": item.get("err"),
                    "confirmation_status": self._text(item.get("confirmationStatus")) or None,
                }
            )
        return signatures

    def _extract_parsed_info(self, data: Any) -> dict[str, Any]:
        if not isinstance(data, dict):
            return {}
        parsed = data.get("parsed")
        if not isinstance(parsed, dict):
            return {}
        info = parsed.get("info")
        return info if isinstance(info, dict) else {}

    def _extract_token_amount(self, parsed_info: dict[str, Any]) -> dict[str, Any]:
        token_amount = parsed_info.get("tokenAmount")
        if not isinstance(token_amount, dict):
            token_amount = {}
        amount_value = token_amount.get("amount")
        if isinstance(amount_value, str):
            amount_raw = amount_value
        elif isinstance(amount_value, (int, float)):
            amount_raw = str(amount_value)
        else:
            amount_raw = "0"
        decimals = token_amount.get("decimals")
        ui_amount = token_amount.get("uiAmount")
        return {
            "amount_raw": amount_raw,
            "decimals": decimals if isinstance(decimals, int) else 0,
            "ui_amount": float(ui_amount) if isinstance(ui_amount, (int, float)) else 0.0,
        }

    def _extract_transaction_summary(
        self,
        pubkey: str,
        signature_value: str,
        payload: dict[str, Any],
    ) -> dict[str, Any] | None:
        result = payload.get("result")
        if not isinstance(result, dict):
            return None

        meta = result.get("meta") if isinstance(result.get("meta"), dict) else {}
        transaction = result.get("transaction") if isinstance(result.get("transaction"), dict) else {}
        block_time = self._to_int(result.get("blockTime"), default=None)
        instructions = self._extract_instruction_programs(transaction, meta)
        counterparties = self._extract_instruction_counterparties(
            pubkey,
            instructions,
            self._extract_account_keys(transaction),
        )

        sol_transfer_in_lamports = 0
        sol_transfer_out_lamports = 0
        spl_transfer_count = 0
        program_names: set[str] = set()

        for instruction in instructions:
            program_name = self._text(instruction.get("program")).lower()
            program_id = self._text(instruction.get("program_id"))
            if program_name:
                program_names.add(program_name)
            elif program_id:
                program_names.add(program_id)

            parsed_type = self._text(instruction.get("parsed_type")).lower()
            info = instruction.get("parsed_info") if isinstance(instruction.get("parsed_info"), dict) else {}

            if program_name == "system" and parsed_type == "transfer":
                source = self._text(info.get("source"))
                destination = self._text(info.get("destination"))
                lamports = self._to_int(info.get("lamports"))
                if source == pubkey:
                    sol_transfer_out_lamports += lamports
                if destination == pubkey:
                    sol_transfer_in_lamports += lamports

            if program_name in {"spl-token", "token", "token-2022", "spl-token-2022"} and parsed_type in {
                "transfer",
                "transferchecked",
                "transfer_checked",
            }:
                spl_transfer_count += 1

        return {
            "signature": signature_value,
            "slot": self._to_int(result.get("slot")),
            "block_time": block_time,
            "observed_at": self._datetime_from_block_time(block_time),
            "failed": meta.get("err") is not None,
            "error": meta.get("err"),
            "fee_lamports": self._to_int(meta.get("fee")),
            "programs": sorted(program_names),
            "counterparties": counterparties,
            "sol_transfer_in_lamports": sol_transfer_in_lamports,
            "sol_transfer_out_lamports": sol_transfer_out_lamports,
            "spl_transfer_count": spl_transfer_count,
        }

    def _derive_indexed_analytics(
        self,
        pubkey: str,
        transaction_summaries: list[dict[str, Any]],
    ) -> dict[str, Any]:
        program_counts: dict[str, int] = {}
        counterparty_counts: dict[str, int] = {}
        failed_transaction_count = 0
        sol_transfer_in_lamports = 0
        sol_transfer_out_lamports = 0
        spl_transfer_count = 0

        for summary in transaction_summaries:
            if summary.get("failed"):
                failed_transaction_count += 1
            sol_transfer_in_lamports += self._to_int(summary.get("sol_transfer_in_lamports"))
            sol_transfer_out_lamports += self._to_int(summary.get("sol_transfer_out_lamports"))
            spl_transfer_count += self._to_int(summary.get("spl_transfer_count"))

            for program in summary.get("programs") or []:
                program_name = self._text(program)
                if program_name:
                    program_counts[program_name] = program_counts.get(program_name, 0) + 1

            for counterparty in summary.get("counterparties") or []:
                address = self._text(counterparty)
                if address and address != pubkey:
                    counterparty_counts[address] = counterparty_counts.get(address, 0) + 1

        transactions_analyzed = len(transaction_summaries)
        earliest_observed_at = self._extract_earliest_observed_at(transaction_summaries)

        return {
            "provider": "rpc_history",
            "transactions_analyzed": transactions_analyzed,
            "transactions_7d": self._window_count(transaction_summaries, 7),
            "transactions_30d": self._window_count(transaction_summaries, 30),
            "transactions_90d": self._window_count(transaction_summaries, 90),
            "failed_transaction_count": failed_transaction_count,
            "failed_transaction_rate": round(
                failed_transaction_count / transactions_analyzed if transactions_analyzed else 0.0,
                4,
            ),
            "unique_program_count": len(program_counts),
            "unique_counterparty_count": len(counterparty_counts),
            "sol_transfer_in_lamports": sol_transfer_in_lamports,
            "sol_transfer_out_lamports": sol_transfer_out_lamports,
            "spl_transfer_count": spl_transfer_count,
            "top_programs": [
                {"program": name, "count": count}
                for name, count in sorted(program_counts.items(), key=lambda item: (-item[1], item[0]))[:8]
            ],
            "top_counterparties": [
                {"address": address, "count": count}
                for address, count in sorted(counterparty_counts.items(), key=lambda item: (-item[1], item[0]))[:8]
            ],
            "earliest_transaction_at": earliest_observed_at,
        }

    def _extract_account_keys(self, transaction: dict[str, Any]) -> list[str]:
        message = transaction.get("message")
        if not isinstance(message, dict):
            return []

        account_keys = message.get("accountKeys")
        if not isinstance(account_keys, list):
            return []

        normalized: list[str] = []
        for item in account_keys:
            if isinstance(item, dict):
                value = self._text(item.get("pubkey"))
            else:
                value = self._text(item)
            if value:
                normalized.append(value)
        return normalized

    def _extract_instruction_programs(
        self,
        transaction: dict[str, Any],
        meta: dict[str, Any],
    ) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []
        message = transaction.get("message")
        if isinstance(message, dict):
            instructions = message.get("instructions")
            if isinstance(instructions, list):
                for instruction in instructions:
                    normalized = self._normalize_instruction_record(instruction)
                    if normalized:
                        records.append(normalized)

        inner_instructions = meta.get("innerInstructions")
        if isinstance(inner_instructions, list):
            for block in inner_instructions:
                if not isinstance(block, dict):
                    continue
                instructions = block.get("instructions")
                if not isinstance(instructions, list):
                    continue
                for instruction in instructions:
                    normalized = self._normalize_instruction_record(instruction)
                    if normalized:
                        records.append(normalized)
        return records

    def _normalize_instruction_record(self, instruction: Any) -> dict[str, Any] | None:
        if not isinstance(instruction, dict):
            return None

        program_id = self._text(instruction.get("programId"))
        program = self._text(instruction.get("program")).lower()
        if not program:
            if program_id == TOKEN_PROGRAM_ID:
                program = "spl-token"
            elif program_id == SOLANA_SYSTEM_PROGRAM_ID:
                program = "system"
            else:
                program = program_id.lower()

        parsed = instruction.get("parsed")
        parsed_type = ""
        parsed_info: dict[str, Any] = {}
        if isinstance(parsed, dict):
            parsed_type = self._text(parsed.get("type")).lower().replace(" ", "_")
            info = parsed.get("info")
            if isinstance(info, dict):
                parsed_info = info

        accounts: list[str] = []
        raw_accounts = instruction.get("accounts")
        if isinstance(raw_accounts, list):
            for item in raw_accounts:
                if isinstance(item, dict):
                    value = self._text(item.get("pubkey"))
                else:
                    value = self._text(item)
                if value:
                    accounts.append(value)

        return {
            "program": program,
            "program_id": program_id,
            "parsed_type": parsed_type,
            "parsed_info": parsed_info,
            "accounts": accounts,
        }

    def _extract_instruction_counterparties(
        self,
        pubkey: str,
        instructions: list[dict[str, Any]],
        account_keys: list[str],
    ) -> list[str]:
        program_ids = {
            self._text(record.get("program_id"))
            for record in instructions
            if self._text(record.get("program_id"))
        }

        addresses: set[str] = set()
        for instruction in instructions:
            info = instruction.get("parsed_info") if isinstance(instruction.get("parsed_info"), dict) else {}
            for field_name in (
                "source",
                "destination",
                "authority",
                "owner",
                "wallet",
                "account",
                "from",
                "to",
                "recipient",
                "newAccount",
            ):
                value = self._text(info.get(field_name))
                if value:
                    addresses.add(value)

            for account in instruction.get("accounts") or []:
                value = self._text(account)
                if value:
                    addresses.add(value)

        if not addresses:
            addresses.update(account_keys)

        filtered = [
            address
            for address in sorted(addresses)
            if address
            and address != pubkey
            and address not in program_ids
            and address != SOLANA_SYSTEM_PROGRAM_ID
            and len(address) >= 20
        ]
        return filtered[:24]

    def _extract_earliest_observed_at(self, entries: Any) -> str | None:
        if not isinstance(entries, list):
            return None

        timestamps: list[datetime] = []
        for item in entries:
            if not isinstance(item, dict):
                continue

            block_time = item.get("block_time")
            if isinstance(block_time, int):
                observed_at = self._datetime_from_block_time(block_time)
            else:
                observed_at = self._text(item.get("observed_at"))

            parsed = self._parse_datetime(observed_at)
            if parsed is not None:
                timestamps.append(parsed)

        if not timestamps:
            return None
        return min(timestamps).isoformat()

    def _derive_wallet_age_estimate(
        self,
        requested_at: Any,
        earliest_observed_at: Any,
    ) -> dict[str, Any]:
        requested = self._parse_datetime(requested_at) or datetime.now(timezone.utc)
        earliest = self._parse_datetime(earliest_observed_at)
        if earliest is None:
            return {
                "earliest_observed_at": None,
                "lookback_days": 0,
                "lower_bound": False,
            }

        lookback_days = max(0, round((requested - earliest).total_seconds() / 86400))
        return {
            "earliest_observed_at": earliest.isoformat(),
            "lookback_days": lookback_days,
            "lower_bound": True,
        }

    def _derive_activity_level(self, signature_count: int) -> str:
        if signature_count <= 0:
            return "none"
        if signature_count <= 3:
            return "low"
        if signature_count <= 15:
            return "medium"
        return "high"

    @staticmethod
    def normalize_commitment(value: str) -> str:
        normalized = str(value or "").strip().lower()
        if normalized in {"processed", "confirmed", "finalized"}:
            return normalized
        return "finalized"

    @classmethod
    def normalize_signature_commitment(cls, value: str) -> str:
        return cls.normalize_commitment(value)

    def _window_count(self, transaction_summaries: list[dict[str, Any]], days: int) -> int:
        count = 0
        for summary in transaction_summaries:
            days_since = self._days_since_block_time(summary.get("block_time"))
            if days_since is not None and days_since <= days:
                count += 1
        return count

    def _days_since_block_time(self, block_time: Any) -> int | None:
        block_time_int = self._to_int(block_time, default=None)
        if block_time_int is None or block_time_int <= 0:
            return None
        observed = datetime.fromtimestamp(block_time_int, tz=timezone.utc)
        return max(0, round((datetime.now(timezone.utc) - observed).total_seconds() / 86400))

    def _datetime_from_block_time(self, block_time: Any) -> str | None:
        block_time_int = self._to_int(block_time, default=None)
        if block_time_int is None or block_time_int <= 0:
            return None
        return datetime.fromtimestamp(block_time_int, tz=timezone.utc).isoformat()

    def _parse_datetime(self, value: Any) -> datetime | None:
        text = self._text(value)
        if not text:
            return None
        normalized = text.replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)

    def _text(self, value: Any) -> str:
        return str(value).strip() if value is not None else ""

    def _to_float(self, value: Any, default: float = 0.0) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    def _to_int(self, value: Any, default: int | None = 0) -> int | None:
        if value is None:
            return default
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    def _now_iso(self) -> str:
        return datetime.now(timezone.utc).isoformat()
