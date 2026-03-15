from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any

from config import settings
from models.project import TreasuryAllocation, TreasuryStrategyAllocation


class TreasuryManagementAgent:
    """Bridge-backed treasury policy engine with Meteora-aware idle allocation."""

    def __init__(
        self,
        node_executable: str | None = None,
        package_dir: str | Path | None = None,
        build_timeout_seconds: float = 45.0,
        cli_timeout_seconds: float = 25.0,
    ) -> None:
        self.node_executable = node_executable or settings.TREASURY_NODE_EXECUTABLE
        self.package_dir = (
            Path(package_dir)
            if package_dir
            else Path(__file__).resolve().parents[2] / "packages" / "treasury"
        )
        self.src_dir = self.package_dir / "src"
        self.dist_cli = self.package_dir / "dist" / "cli.js"
        self.build_timeout_seconds = build_timeout_seconds
        self.cli_timeout_seconds = cli_timeout_seconds

    def summarize_portfolio(
        self,
        approved_projects: list[dict[str, Any]],
        proposed_schedule: list[dict[str, Any]] | None = None,
    ) -> TreasuryAllocation:
        treasury_state = self._treasury_state_payload()
        upcoming_milestones = self._collect_upcoming_milestones(approved_projects, proposed_schedule)
        review = self._review_treasury(treasury_state, upcoming_milestones)
        buckets = self._as_dict(review.get("buckets"))
        allocation_plan = self._as_dict(review.get("allocationPlan"))
        warnings = self._string_list(review.get("warnings"))
        vault_details = self._list_of_dicts(review.get("vaultDetails"))

        if not buckets:
            buckets = self._fallback_buckets(treasury_state, upcoming_milestones)
        if not allocation_plan:
            allocation_plan = self._fallback_allocation_plan(buckets)

        strategy_allocations = self._strategy_allocations_from_plan(allocation_plan, vault_details)
        policy_compliant = self._to_float(buckets.get("unallocatedShortfallUsd")) <= 0
        notes = [
            "Hot reserve is sized to near-term milestone obligations or the policy floor, whichever is higher.",
            "Committed reserve covers future milestone obligations that must remain liquid.",
            "Strategic buffer is held back from strategy allocation as a treasury safety margin.",
        ]
        if proposed_schedule:
            notes.append("Snapshot includes the candidate project's milestone schedule.")
        if vault_details:
            token_symbols = ", ".join(
                sorted(
                    {
                        str(item.get("tokenSymbol")).strip()
                        for item in vault_details
                        if str(item.get("tokenSymbol")).strip()
                    }
                )
            )
            if token_symbols:
                notes.append(f"Meteora Dynamic Vaults reviewed for idle deployment: {token_symbols}.")
        rationale_codes = self._string_list(allocation_plan.get("rationaleCodes"))
        if rationale_codes:
            notes.append(
                "Idle allocation rationale: "
                + ", ".join(code.replace("_", " ").lower() for code in rationale_codes[:4])
                + "."
            )
        notes.extend(warnings)

        return TreasuryAllocation(
            total_capital=round(self._to_float(buckets.get("totalCapitalUsd")), 2),
            available_for_new_commitments=round(
                self._to_float(buckets.get("availableForNewCommitmentsUsd")),
                2,
            ),
            hot_reserve=round(self._to_float(buckets.get("hotReserveUsd")), 2),
            committed_reserve=round(self._to_float(buckets.get("committedReserveUsd")), 2),
            idle_treasury=round(self._to_float(buckets.get("idleTreasuryUsd")), 2),
            strategic_buffer=round(self._to_float(buckets.get("strategicBufferUsd")), 2),
            policy_compliant=policy_compliant,
            liquidity_gap=round(self._to_float(buckets.get("unallocatedShortfallUsd")), 2),
            strategy_allocations=strategy_allocations,
            notes=notes,
        )

    def max_fundable_amount(
        self,
        approved_projects: list[dict[str, Any]],
        schedule_template: list[dict[str, Any]],
    ) -> float:
        treasury_state = self._treasury_state_payload()
        existing_milestones = self._collect_upcoming_milestones(approved_projects, None)
        low = 0.0
        high = float(settings.TREASURY_TOTAL_CAPITAL)

        for _ in range(30):
            candidate_amount = (low + high) / 2.0
            candidate_schedule = self._schedule_from_template(schedule_template, candidate_amount)
            candidate_milestones = existing_milestones + self._milestones_from_schedule(
                candidate_schedule,
                project_id="candidate",
            )
            buckets = self._compute_buckets(treasury_state, candidate_milestones)
            if self._to_float(buckets.get("unallocatedShortfallUsd")) <= 0:
                low = candidate_amount
            else:
                high = candidate_amount

        return round(low, 2)

    def _review_treasury(
        self,
        treasury_state: dict[str, Any],
        upcoming_milestones: list[dict[str, Any]],
    ) -> dict[str, Any]:
        try:
            return self._run_cli(
                {
                    "action": "reviewTreasury",
                    "treasuryState": treasury_state,
                    "upcomingMilestones": upcoming_milestones,
                    "marketConditions": self._market_conditions_payload(),
                    "meteora": self._meteora_payload(),
                }
            )
        except Exception as exc:
            buckets = self._fallback_buckets(treasury_state, upcoming_milestones)
            allocation_plan = self._fallback_allocation_plan(buckets)
            return {
                "buckets": buckets,
                "allocationPlan": allocation_plan,
                "vaultDetails": [],
                "warnings": [f"Treasury package fallback activated: {exc}"],
            }

    def _compute_buckets(
        self,
        treasury_state: dict[str, Any],
        upcoming_milestones: list[dict[str, Any]],
    ) -> dict[str, Any]:
        try:
            result = self._run_cli(
                {
                    "action": "computeBuckets",
                    "treasuryState": treasury_state,
                    "upcomingMilestones": upcoming_milestones,
                }
            )
            buckets = self._as_dict(result.get("buckets"))
            if buckets:
                return buckets
        except Exception:
            pass
        return self._fallback_buckets(treasury_state, upcoming_milestones)

    def _run_cli(self, payload: dict[str, Any]) -> dict[str, Any]:
        self._ensure_runtime()
        result = subprocess.run(
            [self.node_executable, str(self.dist_cli)],
            input=json.dumps(payload),
            text=True,
            capture_output=True,
            cwd=self.package_dir,
            timeout=self.cli_timeout_seconds,
            check=False,
        )
        if result.returncode != 0:
            message = result.stderr.strip() or result.stdout.strip() or "Unknown treasury CLI error"
            raise RuntimeError(message)

        parsed = json.loads(result.stdout or "{}")
        if not isinstance(parsed, dict):
            raise RuntimeError("Treasury CLI returned a non-object response.")
        if not parsed.get("ok"):
            raise RuntimeError(str(parsed))
        return parsed

    def _ensure_runtime(self) -> None:
        if not self.dist_cli.exists() or self._is_dist_stale():
            self._build_package()

    def _is_dist_stale(self) -> bool:
        if not self.dist_cli.exists():
            return True
        dist_mtime = self.dist_cli.stat().st_mtime
        newest_src_mtime = max((path.stat().st_mtime for path in self.src_dir.glob("*.ts")), default=dist_mtime)
        return newest_src_mtime > dist_mtime

    def _build_package(self) -> None:
        command = ["cmd", "/c", "npm", "run", "build"] if os.name == "nt" else ["npm", "run", "build"]
        result = subprocess.run(
            command,
            text=True,
            capture_output=True,
            cwd=self.package_dir,
            timeout=self.build_timeout_seconds,
            check=False,
        )
        if result.returncode != 0:
            message = result.stderr.strip() or result.stdout.strip() or "Unknown npm build error"
            raise RuntimeError(f"Unable to build treasury package: {message}")
        if not self.dist_cli.exists():
            raise RuntimeError("Treasury package build completed but dist/cli.js is missing.")

    def _treasury_state_payload(self) -> dict[str, Any]:
        total_capital = float(settings.TREASURY_TOTAL_CAPITAL)
        return {
            "totalCapitalUsd": total_capital,
            "minHotReserveUsd": round(total_capital * float(settings.TREASURY_HOT_RESERVE_RATIO), 2),
            "strategicBufferUsd": round(total_capital * float(settings.TREASURY_STRATEGIC_BUFFER_RATIO), 2),
            "hotReserveWindowDays": int(settings.TREASURY_HOT_WINDOW_DAYS),
            "maxIdleDeploymentRatio": float(settings.TREASURY_MAX_IDLE_DEPLOYMENT_RATIO),
            "maxSingleVaultAllocationRatio": float(settings.TREASURY_MAX_SINGLE_VAULT_ALLOCATION_RATIO),
        }

    def _market_conditions_payload(self) -> dict[str, Any]:
        return {
            "riskOff": bool(settings.TREASURY_MARKET_RISK_OFF),
            "volatilityScore": float(settings.TREASURY_MARKET_VOLATILITY_SCORE),
            "liquidityStressScore": float(settings.TREASURY_MARKET_LIQUIDITY_STRESS_SCORE),
            "withdrawalDemandScore": float(settings.TREASURY_MARKET_WITHDRAWAL_DEMAND_SCORE),
            "minimumAverageApyPct": float(settings.TREASURY_MARKET_MIN_AVERAGE_APY_PCT),
            "minimumWithdrawableCoverageRatio": float(
                settings.TREASURY_MARKET_MIN_WITHDRAWABLE_COVERAGE_RATIO
            ),
            "minimumStrategyCount": int(settings.TREASURY_MARKET_MIN_STRATEGY_COUNT),
        }

    def _meteora_payload(self) -> dict[str, Any]:
        payload = {
            "enabled": bool(settings.TREASURY_METEORA_ENABLED),
            "tokenSymbols": self._csv_list(settings.TREASURY_METEORA_TOKEN_SYMBOLS),
            "cluster": settings.TREASURY_METEORA_CLUSTER,
            "rpcUrl": settings.TREASURY_METEORA_RPC_URL or None,
            "dynamicVaultApiBaseUrl": settings.TREASURY_METEORA_DYNAMIC_VAULT_API_URL or None,
            "timeoutMs": int(float(settings.TREASURY_METEORA_TIMEOUT_SECONDS) * 1000),
            "tokenMintOverrides": self._json_dict(settings.TREASURY_METEORA_TOKEN_MINT_OVERRIDES),
        }
        return payload

    def _collect_upcoming_milestones(
        self,
        approved_projects: list[dict[str, Any]],
        proposed_schedule: list[dict[str, Any]] | None,
    ) -> list[dict[str, Any]]:
        milestones: list[dict[str, Any]] = []
        for project in approved_projects:
            project_id = self._text(project.get("id")) or self._text(project.get("_id")) or "approved"
            decision = self._as_dict(project.get("funding_decision"))
            schedule = decision.get("milestone_schedule") if isinstance(decision, dict) else []
            milestones.extend(self._milestones_from_schedule(schedule, project_id))
        if proposed_schedule:
            milestones.extend(self._milestones_from_schedule(proposed_schedule, "candidate"))
        return milestones

    def _milestones_from_schedule(
        self,
        schedule: Any,
        project_id: str,
    ) -> list[dict[str, Any]]:
        if not isinstance(schedule, list):
            return []
        milestones: list[dict[str, Any]] = []
        hot_window = int(settings.TREASURY_HOT_WINDOW_DAYS)
        for index, raw_item in enumerate(schedule, start=1):
            if not isinstance(raw_item, dict):
                continue
            amount = self._to_float(raw_item.get("release_amount"))
            if amount <= 0:
                amount = self._to_float(raw_item.get("amount_usd"))
            if amount <= 0:
                continue
            due_in_days = int(self._to_float(raw_item.get("target_days")))
            milestone_id = self._text(raw_item.get("sequence")) or self._text(raw_item.get("index")) or str(index)
            milestones.append(
                {
                    "projectId": project_id,
                    "milestoneId": milestone_id,
                    "amountUsd": round(amount, 2),
                    "dueInDays": max(0, due_in_days),
                    "priority": "high" if due_in_days <= hot_window else "normal",
                }
            )
        return milestones

    def _fallback_buckets(
        self,
        treasury_state: dict[str, Any],
        upcoming_milestones: list[dict[str, Any]],
    ) -> dict[str, Any]:
        hot_window = int(self._to_float(treasury_state.get("hotReserveWindowDays")))
        hot_obligations = round(
            sum(
                self._to_float(item.get("amountUsd"))
                for item in upcoming_milestones
                if int(self._to_float(item.get("dueInDays"))) <= hot_window
            ),
            2,
        )
        committed_obligations = round(
            sum(
                self._to_float(item.get("amountUsd"))
                for item in upcoming_milestones
                if int(self._to_float(item.get("dueInDays"))) > hot_window
            ),
            2,
        )
        min_hot = round(self._to_float(treasury_state.get("minHotReserveUsd")), 2)
        strategic_buffer = round(self._to_float(treasury_state.get("strategicBufferUsd")), 2)
        total_capital = round(self._to_float(treasury_state.get("totalCapitalUsd")), 2)
        hot_reserve = round(max(min_hot, hot_obligations), 2)
        protected_capital = round(hot_reserve + committed_obligations + strategic_buffer, 2)
        idle_treasury = round(max(0.0, total_capital - protected_capital), 2)
        shortfall = round(max(0.0, protected_capital - total_capital), 2)

        return {
            "totalCapitalUsd": total_capital,
            "hotReserveUsd": hot_reserve,
            "committedReserveUsd": committed_obligations,
            "idleTreasuryUsd": idle_treasury,
            "strategicBufferUsd": strategic_buffer,
            "protectedCapitalUsd": protected_capital,
            "availableForNewCommitmentsUsd": idle_treasury,
            "unallocatedShortfallUsd": shortfall,
            "hotReserveFloorUsd": min_hot,
            "windowedMilestonePayoutUsd": hot_obligations,
            "maxIdleDeploymentRatio": float(self._to_float(treasury_state.get("maxIdleDeploymentRatio"))),
            "maxSingleVaultAllocationRatio": float(
                self._to_float(treasury_state.get("maxSingleVaultAllocationRatio"))
            ),
        }

    def _fallback_allocation_plan(self, buckets: dict[str, Any]) -> dict[str, Any]:
        held_back = round(self._to_float(buckets.get("idleTreasuryUsd")), 2)
        return {
            "allocatableIdleUsd": 0.0,
            "heldBackIdleUsd": held_back,
            "weightedExpectedApyPct": 0.0,
            "actions": [
                {
                    "action": "hold_idle_cash",
                    "tokenSymbol": "USD",
                    "amountUsd": held_back,
                    "rationaleCodes": ["METEORA_ALLOCATION_UNAVAILABLE"],
                }
            ]
            if held_back > 0
            else [],
            "rationaleCodes": ["METEORA_ALLOCATION_UNAVAILABLE"],
        }

    def _strategy_allocations_from_plan(
        self,
        allocation_plan: dict[str, Any],
        vault_details: list[dict[str, Any]],
    ) -> list[TreasuryStrategyAllocation]:
        actions = allocation_plan.get("actions")
        if not isinstance(actions, list):
            return []
        vaults_by_symbol = {
            self._text(item.get("tokenSymbol")).upper(): item for item in vault_details if isinstance(item, dict)
        }
        strategy_allocations: list[TreasuryStrategyAllocation] = []
        for raw_action in actions:
            if not isinstance(raw_action, dict):
                continue
            amount = round(self._to_float(raw_action.get("amountUsd")), 2)
            if amount <= 0:
                continue
            action_name = self._text(raw_action.get("action"))
            token_symbol = self._text(raw_action.get("tokenSymbol")).upper() or "USD"
            rationale_codes = self._string_list(raw_action.get("rationaleCodes"))
            expected_apy = self._to_float(raw_action.get("expectedApyPct"))

            if action_name == "deposit_dynamic_vault":
                vault = vaults_by_symbol.get(token_symbol, {})
                withdrawable_usd = self._to_float(vault.get("withdrawableUsd"))
                coverage = withdrawable_usd / amount if amount > 0 and withdrawable_usd > 0 else 0.0
                liquidity_profile = (
                    f"Meteora Dynamic Vault ({token_symbol}, {coverage:.1f}x withdrawable coverage)"
                    if coverage > 0
                    else f"Meteora Dynamic Vault ({token_symbol})"
                )
                rationale = (
                    f"Deploy idle capital to Meteora Dynamic Vault for {token_symbol}."
                    + (f" Expected APY {expected_apy:.2f}%." if expected_apy > 0 else "")
                    + (
                        " Reason codes: "
                        + ", ".join(code.replace("_", " ").lower() for code in rationale_codes)
                        + "."
                        if rationale_codes
                        else ""
                    )
                )
                strategy_allocations.append(
                    TreasuryStrategyAllocation(
                        strategy_name=f"meteora_dynamic_vault_{token_symbol.lower()}",
                        amount=amount,
                        liquidity_profile=liquidity_profile,
                        rationale=rationale,
                    )
                )
            else:
                strategy_allocations.append(
                    TreasuryStrategyAllocation(
                        strategy_name="hold_idle_cash",
                        amount=amount,
                        liquidity_profile="Instant",
                        rationale="Keep idle capital unallocated for safety."
                        + (
                            " Reason codes: "
                            + ", ".join(code.replace("_", " ").lower() for code in rationale_codes)
                            + "."
                            if rationale_codes
                            else ""
                        ),
                    )
                )
        return strategy_allocations

    def _schedule_from_template(
        self,
        schedule_template: list[dict[str, Any]],
        approved_amount: float,
    ) -> list[dict[str, Any]]:
        schedule: list[dict[str, Any]] = []
        for item in schedule_template:
            release_percentage = self._to_float(item.get("release_percentage"))
            schedule.append(
                {
                    **item,
                    "release_amount": round(approved_amount * release_percentage, 2),
                }
            )
        return schedule

    def _csv_list(self, value: Any) -> list[str]:
        if value is None:
            return []
        return [item.strip() for item in str(value).split(",") if item.strip()]

    def _json_dict(self, value: Any) -> dict[str, str]:
        if value is None:
            return {}
        text = str(value).strip()
        if not text:
            return {}
        try:
            parsed = json.loads(text)
        except Exception:
            return {}
        if not isinstance(parsed, dict):
            return {}
        return {str(key): str(inner) for key, inner in parsed.items() if str(inner).strip()}

    def _list_of_dicts(self, value: Any) -> list[dict[str, Any]]:
        if not isinstance(value, list):
            return []
        return [item for item in value if isinstance(item, dict)]

    def _as_dict(self, value: Any) -> dict[str, Any]:
        return value if isinstance(value, dict) else {}

    def _string_list(self, value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value if str(item).strip()]

    def _text(self, value: Any) -> str:
        return str(value).strip() if value is not None else ""

    def _to_float(self, value: Any) -> float:
        if value is None:
            return 0.0
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0
