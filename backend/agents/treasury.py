from typing import Any

from config import settings
from models.project import TreasuryAllocation, TreasuryStrategyAllocation


class TreasuryManagementAgent:
    """Treasury policy engine for reserve sizing and idle-capital allocation."""

    def summarize_portfolio(
        self,
        approved_projects: list[dict[str, Any]],
        proposed_schedule: list[dict[str, Any]] | None = None,
    ) -> TreasuryAllocation:
        total_capital = float(settings.TREASURY_TOTAL_CAPITAL)
        strategic_buffer = round(total_capital * float(settings.TREASURY_STRATEGIC_BUFFER_RATIO), 2)
        minimum_hot_reserve = round(total_capital * float(settings.TREASURY_HOT_RESERVE_RATIO), 2)

        existing_hot, existing_committed = self._aggregate_commitments(approved_projects)
        proposed_hot, proposed_committed = self._aggregate_schedule(proposed_schedule or [])
        base_available = round(
            max(0.0, total_capital - strategic_buffer - max(minimum_hot_reserve, existing_hot) - existing_committed),
            2,
        )

        hot_reserve = round(max(minimum_hot_reserve, existing_hot + proposed_hot), 2)
        committed_reserve = round(existing_committed + proposed_committed, 2)
        idle_treasury = round(total_capital - hot_reserve - committed_reserve - strategic_buffer, 2)
        policy_compliant = idle_treasury >= 0
        liquidity_gap = round(abs(idle_treasury), 2) if idle_treasury < 0 else 0.0

        if idle_treasury < 0:
            idle_for_strategy = 0.0
            idle_treasury = 0.0
        else:
            idle_for_strategy = idle_treasury

        strategy_allocations = self._build_strategy_allocations(idle_for_strategy)
        notes = [
            "Hot reserve is sized to near-term milestone obligations or the policy floor, whichever is higher.",
            "Committed reserve covers future milestone obligations that must remain liquid.",
            "Strategic buffer is held back from strategy allocation as a treasury safety margin.",
        ]
        if proposed_schedule:
            notes.append("Snapshot includes the candidate project's milestone schedule.")

        return TreasuryAllocation(
            total_capital=round(total_capital, 2),
            available_for_new_commitments=base_available if not proposed_schedule else round(idle_treasury, 2),
            hot_reserve=hot_reserve,
            committed_reserve=committed_reserve,
            idle_treasury=round(idle_treasury, 2),
            strategic_buffer=strategic_buffer,
            policy_compliant=policy_compliant,
            liquidity_gap=liquidity_gap,
            strategy_allocations=strategy_allocations,
            notes=notes,
        )

    def max_fundable_amount(
        self,
        approved_projects: list[dict[str, Any]],
        schedule_template: list[dict[str, Any]],
    ) -> float:
        total_capital = float(settings.TREASURY_TOTAL_CAPITAL)
        low = 0.0
        high = total_capital

        for _ in range(30):
            candidate_amount = (low + high) / 2.0
            proposed_schedule = self._schedule_from_template(schedule_template, candidate_amount)
            allocation = self.summarize_portfolio(approved_projects, proposed_schedule)
            if allocation.policy_compliant:
                low = candidate_amount
            else:
                high = candidate_amount

        return round(low, 2)

    def _aggregate_commitments(self, approved_projects: list[dict[str, Any]]) -> tuple[float, float]:
        hot_total = 0.0
        committed_total = 0.0

        for project in approved_projects:
            decision = self._as_dict(project.get("funding_decision"))
            if not decision:
                continue
            milestone_schedule = decision.get("milestone_schedule") or []
            hot_amount, committed_amount = self._aggregate_schedule(milestone_schedule)
            hot_total += hot_amount
            committed_total += committed_amount

        return round(hot_total, 2), round(committed_total, 2)

    def _aggregate_schedule(self, milestone_schedule: list[dict[str, Any]]) -> tuple[float, float]:
        hot_total = 0.0
        committed_total = 0.0
        window_days = int(settings.TREASURY_HOT_WINDOW_DAYS)

        for item in milestone_schedule:
            if not isinstance(item, dict):
                continue
            release_amount = self._to_float(item.get("release_amount"))
            target_days = int(self._to_float(item.get("target_days")))
            if target_days <= window_days:
                hot_total += release_amount
            else:
                committed_total += release_amount

        return round(hot_total, 2), round(committed_total, 2)

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

    def _build_strategy_allocations(self, idle_treasury: float) -> list[TreasuryStrategyAllocation]:
        if idle_treasury <= 0:
            return []

        allocations = [
            (
                "tokenized_treasury_bills",
                0.5,
                "T+1 redemption",
                "Primary low-risk yield sleeve for capital not earmarked for near-term releases.",
            ),
            (
                "overcollateralized_stablecoin_lending",
                0.3,
                "24h withdrawal",
                "Secondary yield sleeve sized below the reserve buffer.",
            ),
            (
                "instant_stable_liquidity",
                0.2,
                "Instant",
                "Immediate liquidity for reserve rebalancing and payout smoothing.",
            ),
        ]

        strategy_allocations: list[TreasuryStrategyAllocation] = []
        remaining = idle_treasury
        for index, (name, ratio, liquidity_profile, rationale) in enumerate(allocations):
            if index == len(allocations) - 1:
                amount = round(remaining, 2)
            else:
                amount = round(idle_treasury * ratio, 2)
                remaining -= amount
            strategy_allocations.append(
                TreasuryStrategyAllocation(
                    strategy_name=name,
                    amount=amount,
                    liquidity_profile=liquidity_profile,
                    rationale=rationale,
                )
            )

        return strategy_allocations

    def _as_dict(self, value: Any) -> dict[str, Any]:
        return value if isinstance(value, dict) else {}

    def _to_float(self, value: Any) -> float:
        if value is None:
            return 0.0
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0
