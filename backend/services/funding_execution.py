from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Protocol
from uuid import uuid4

from agents.payment import PaymentAgent
from config import Settings
from models.project import (
    ExecutionStatus,
    FundingDecisionType,
    FundingExecutionAction,
    FundingExecutionActionType,
    FundingExecutionPlan,
    FundingExecutionRecord,
    FundingExecutionRecordStatus,
    FundingExecutionResponse,
    PayoutChain,
)

USDC_DECIMALS = 6


class FundingExecutionError(RuntimeError):
    def __init__(self, detail: str, status_code: int = 400, code: str = "funding_execution_error") -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code
        self.code = code


class PaymentRailAdapter(Protocol):
    chain: PayoutChain
    provider_name: str

    async def execute_immediate_payout(self, project_id: str, action: FundingExecutionAction) -> dict[str, Any]:
        ...

    async def create_milestone_escrow(self, project_id: str, action: FundingExecutionAction) -> dict[str, Any]:
        ...


@dataclass(slots=True)
class BaseSepoliaNlaAdapter:
    payment_agent: PaymentAgent
    settings: Settings

    chain: PayoutChain = PayoutChain.base_sepolia
    provider_name: str = "nla_base_sepolia"

    async def _ensure_initialized(self) -> None:
        if not self.payment_agent._is_ready():
            await self.payment_agent.initialize()

    async def execute_immediate_payout(self, project_id: str, action: FundingExecutionAction) -> dict[str, Any]:
        await self._ensure_initialized()
        amount = self._usd_to_token_amount(action.amount)
        result = await self.payment_agent.direct_transfer(
            project_id=project_id,
            recipient_address=action.recipient,
            amount=amount,
        )
        result.setdefault(
            "provider_metadata",
            {
                "rail": self.provider_name,
                "token_address": self.settings.ESCROW_TOKEN_ADDRESS,
                "recipient_binding_mode": "onchain_transfer",
            },
        )
        return result

    async def create_milestone_escrow(self, project_id: str, action: FundingExecutionAction) -> dict[str, Any]:
        await self._ensure_initialized()
        amount = self._usd_to_token_amount(action.amount)
        result = await self.payment_agent.create_escrow(
            project_id=project_id,
            amount=amount,
            demand=action.demand or "Release when milestone verification succeeds.",
        )
        result.setdefault(
            "provider_metadata",
            {
                "rail": self.provider_name,
                "token_address": self.settings.ESCROW_TOKEN_ADDRESS,
                "oracle_address": self.settings.ORACLE_WALLET_ADDRESS or None,
                "requested_recipient": action.recipient,
                "recipient_binding_mode": "execution_metadata_only",
            },
        )
        return result

    @staticmethod
    def _usd_to_token_amount(value: float) -> int:
        return int(round(max(0.0, value) * (10**USDC_DECIMALS)))


class FundingExecutionService:
    def __init__(
        self,
        settings: Settings | None = None,
        payment_agent: PaymentAgent | None = None,
        adapters: dict[PayoutChain, PaymentRailAdapter] | None = None,
    ) -> None:
        self.settings = settings or Settings()
        self.payment_agent = payment_agent or PaymentAgent(self.settings)
        self.adapters = adapters or {
            PayoutChain.base_sepolia: BaseSepoliaNlaAdapter(self.payment_agent, self.settings),
        }

    def build_execution_plan(self, project: dict[str, Any]) -> FundingExecutionPlan:
        project_id = self._project_id(project)
        decision_review = self._as_dict(project.get("decision_review"))
        verifier_result = self._as_dict(project.get("verifier_result"))
        funding_decision = self._as_dict(project.get("funding_decision"))
        funding_package = self._as_dict(funding_decision.get("funding_package"))

        if (
            decision_review.get("approved_for_execution") is not True
            or (verifier_result and verifier_result.get("passed") is not True)
        ):
            raise FundingExecutionError(
                "Project is not approved for execution. Run review and wait for a verifier-approved decision package.",
                status_code=409,
                code="decision_not_approved_for_execution",
            )

        decision_label = self._text(funding_decision.get("decision")).lower()
        if decision_label not in {
            FundingDecisionType.accept.value,
            FundingDecisionType.accept_reduced.value,
        }:
            raise FundingExecutionError(
                "Only accepted projects can be executed for funding.",
                status_code=409,
                code="decision_not_fundable",
            )

        approved_amount = self._to_float(funding_package.get("approved_amount"))
        if approved_amount <= 0:
            raise FundingExecutionError(
                "Funding decision does not authorize a positive approved amount.",
                status_code=409,
                code="approved_amount_missing",
            )

        payout_chain = self._resolve_payout_chain(project)
        recipient = self._resolve_recipient(project, payout_chain)
        treasury_snapshot = self._as_dict(project.get("treasury_allocation"))
        reviewed_at = self._parse_datetime(project.get("reviewed_at")) or datetime.now(timezone.utc)
        immediate_amount = self._to_float(funding_package.get("immediate_release_amount"))
        milestone_schedule = self._list_of_dicts(funding_decision.get("milestone_schedule"))
        plan_id = uuid4().hex
        notes: list[str] = []

        immediate_payout = None
        if immediate_amount > 0:
            immediate_payout = FundingExecutionAction(
                action_id=f"{plan_id}:immediate",
                action_type=FundingExecutionActionType.immediate_payout,
                amount=round(immediate_amount, 2),
                payout_chain=payout_chain,
                recipient=recipient,
                provider=self._provider_name(payout_chain),
                provider_metadata=self._provider_metadata(
                    payout_chain,
                    recipient=recipient,
                    action_type=FundingExecutionActionType.immediate_payout,
                ),
            )

        escrow_actions: list[FundingExecutionAction] = []
        for item in milestone_schedule[1:]:
            amount = round(self._to_float(item.get("release_amount")), 2)
            if amount <= 0:
                continue
            sequence = int(self._to_float(item.get("sequence")) or len(escrow_actions) + 2)
            milestone_name = self._text(item.get("name")) or f"Milestone {sequence}"
            verification_method = self._text(item.get("verification_type")) or "committee_validation"
            deadline = (reviewed_at + timedelta(days=int(self._to_float(item.get("target_days"))))).isoformat()
            milestone_id = f"milestone-{sequence}"
            demand = self._build_milestone_demand(
                project_name=self._text(project.get("name")) or "Project",
                milestone_name=milestone_name,
                verification_method=verification_method,
                success_metric=self._text(item.get("success_metric")) or "Milestone completion verified.",
                deadline=deadline,
            )
            escrow_actions.append(
                FundingExecutionAction(
                    action_id=f"{plan_id}:{milestone_id}",
                    action_type=FundingExecutionActionType.milestone_escrow,
                    amount=amount,
                    payout_chain=payout_chain,
                    recipient=recipient,
                    milestone_id=milestone_id,
                    milestone_name=milestone_name,
                    sequence=sequence,
                    deliverable_type=self._slugify(milestone_name),
                    verification_method=verification_method,
                    deadline=deadline,
                    demand=demand,
                    provider=self._provider_name(payout_chain),
                    provider_metadata=self._provider_metadata(
                        payout_chain,
                        recipient=recipient,
                        action_type=FundingExecutionActionType.milestone_escrow,
                    ),
                )
            )

        if payout_chain == PayoutChain.base_sepolia and escrow_actions:
            notes.append(
                "Base Sepolia milestone escrows use the current NLA rail. Recipient binding is stored in execution metadata and records for MVP compatibility."
            )

        return FundingExecutionPlan(
            plan_id=plan_id,
            project_id=project_id,
            generated_at=self._now_iso(),
            approved_for_execution=True,
            decision=FundingDecisionType(decision_label),
            payout_chain=payout_chain,
            requested_amount=round(self._to_float(funding_package.get("requested_amount")), 2),
            approved_amount=round(approved_amount, 2),
            recipient_solana_address=self._text(project.get("recipient_solana_address")) or None,
            recipient_evm_address=self._text(project.get("recipient_evm_address")) or None,
            treasury_snapshot=treasury_snapshot,
            immediate_payout=immediate_payout,
            escrow_actions=escrow_actions,
            notes=notes,
        )

    async def execute_project(self, project: dict[str, Any], db) -> FundingExecutionResponse:
        project_id = self._project_id(project)
        current_status = self._text(project.get("execution_status")).lower()
        if current_status in {
            ExecutionStatus.processing.value,
            ExecutionStatus.completed.value,
            ExecutionStatus.partial.value,
        }:
            raise FundingExecutionError(
                f"Execution is blocked because the project is already in '{current_status}' state.",
                status_code=409,
                code="execution_already_started",
            )

        try:
            plan = self.build_execution_plan(project)
        except FundingExecutionError as exc:
            await self._update_project_execution_state(
                db,
                project["_id"],
                status=ExecutionStatus.blocked,
                execution_plan=None,
            )
            raise exc

        adapter = self.adapters.get(plan.payout_chain)
        if adapter is None:
            await self._update_project_execution_state(
                db,
                project["_id"],
                status=ExecutionStatus.blocked,
                execution_plan=plan,
            )
            raise FundingExecutionError(
                f"Payout chain '{plan.payout_chain.value}' is not supported by the current MVP execution rail.",
                status_code=409,
                code="unsupported_payout_chain",
            )

        await self._update_project_execution_state(
            db,
            project["_id"],
            status=ExecutionStatus.processing,
            execution_plan=plan,
        )

        records: list[FundingExecutionRecord] = []
        actions = ([plan.immediate_payout] if plan.immediate_payout else []) + list(plan.escrow_actions)

        for action in actions:
            if action is None:
                continue
            if action.action_type == FundingExecutionActionType.immediate_payout:
                result = await adapter.execute_immediate_payout(project_id, action)
            else:
                result = await adapter.create_milestone_escrow(project_id, action)

            record = self._record_from_result(plan, action, result)
            records.append(record)
            await db.funding_execution_records.insert_one(record.model_dump(mode="json"))

        final_status = self._aggregate_status(records)
        await self._update_project_execution_state(
            db,
            project["_id"],
            status=final_status,
            execution_plan=plan,
        )

        return FundingExecutionResponse(
            project_id=project_id,
            execution_status=final_status,
            execution_plan=plan,
            payment_records=records,
            escrow_uids=[record.escrow_uid for record in records if record.escrow_uid],
            tx_hashes=[record.tx_hash for record in records if record.tx_hash],
        )

    async def _update_project_execution_state(
        self,
        db,
        project_object_id: Any,
        *,
        status: ExecutionStatus,
        execution_plan: FundingExecutionPlan | None,
    ) -> None:
        await db.projects.update_one(
            {"_id": project_object_id},
            {
                "$set": {
                    "execution_status": status.value,
                    "execution_plan_json": execution_plan.model_dump(mode="json") if execution_plan else None,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )

    def _record_from_result(
        self,
        plan: FundingExecutionPlan,
        action: FundingExecutionAction,
        result: dict[str, Any],
    ) -> FundingExecutionRecord:
        now = self._now_iso()
        provider_metadata = {
            **action.provider_metadata,
            **self._as_dict(result.get("provider_metadata")),
        }
        result_status = self._text(result.get("status")).lower()
        if result_status in {"transferred", "created", "collected", "fulfilled", "arbitrated"}:
            status = FundingExecutionRecordStatus.succeeded
        elif result_status == "dry_run":
            status = FundingExecutionRecordStatus.dry_run
        else:
            status = FundingExecutionRecordStatus.error

        return FundingExecutionRecord(
            record_id=uuid4().hex,
            project_id=plan.project_id,
            plan_id=plan.plan_id,
            action_id=action.action_id,
            action_type=action.action_type,
            status=status,
            payout_chain=action.payout_chain,
            recipient=action.recipient,
            amount=action.amount,
            milestone_id=action.milestone_id,
            milestone_name=action.milestone_name,
            verification_method=action.verification_method,
            provider=action.provider,
            provider_metadata=provider_metadata,
            escrow_uid=self._text(result.get("escrow_uid")) or None,
            tx_hash=self._text(result.get("tx_hash")) or None,
            error=self._text(result.get("error")) or None,
            raw_result=result,
            created_at=now,
            updated_at=now,
        )

    def _aggregate_status(self, records: list[FundingExecutionRecord]) -> ExecutionStatus:
        if not records:
            return ExecutionStatus.failed

        statuses = {record.status for record in records}
        if statuses == {FundingExecutionRecordStatus.succeeded}:
            return ExecutionStatus.completed
        if statuses == {FundingExecutionRecordStatus.dry_run}:
            return ExecutionStatus.dry_run
        if FundingExecutionRecordStatus.error in statuses:
            if FundingExecutionRecordStatus.succeeded in statuses or FundingExecutionRecordStatus.dry_run in statuses:
                return ExecutionStatus.partial
            return ExecutionStatus.failed
        return ExecutionStatus.completed

    def _resolve_payout_chain(self, project: dict[str, Any]) -> PayoutChain:
        preferred = self._text(project.get("preferred_payout_chain")).lower()
        recipient_solana = self._text(project.get("recipient_solana_address"))
        recipient_evm = self._text(project.get("recipient_evm_address"))

        if preferred == PayoutChain.base_sepolia.value:
            if not recipient_evm:
                raise FundingExecutionError(
                    "preferred_payout_chain is base_sepolia but recipient_evm_address is missing.",
                    status_code=409,
                    code="missing_recipient_evm_address",
                )
            return PayoutChain.base_sepolia

        if preferred == PayoutChain.solana.value:
            if not recipient_solana:
                raise FundingExecutionError(
                    "preferred_payout_chain is solana but recipient_solana_address is missing.",
                    status_code=409,
                    code="missing_recipient_solana_address",
                )
            return PayoutChain.solana

        if recipient_evm:
            return PayoutChain.base_sepolia
        if recipient_solana:
            return PayoutChain.solana

        raise FundingExecutionError(
            "Execution requires an explicit payout address. Set recipient_evm_address or recipient_solana_address before executing funding.",
            status_code=409,
            code="missing_explicit_payout_address",
        )

    def _resolve_recipient(self, project: dict[str, Any], payout_chain: PayoutChain) -> str:
        if payout_chain == PayoutChain.base_sepolia:
            recipient = self._text(project.get("recipient_evm_address"))
            if not recipient:
                raise FundingExecutionError(
                    "Base Sepolia execution requires recipient_evm_address.",
                    status_code=409,
                    code="missing_recipient_evm_address",
                )
            return recipient

        recipient = self._text(project.get("recipient_solana_address"))
        if not recipient:
            raise FundingExecutionError(
                "Solana execution requires recipient_solana_address.",
                status_code=409,
                code="missing_recipient_solana_address",
            )
        return recipient

    def _provider_name(self, payout_chain: PayoutChain) -> str:
        adapter = self.adapters.get(payout_chain)
        return adapter.provider_name if adapter else f"unsupported_{payout_chain.value}"

    def _provider_metadata(
        self,
        payout_chain: PayoutChain,
        *,
        recipient: str,
        action_type: FundingExecutionActionType,
    ) -> dict[str, Any]:
        metadata = {
            "payout_chain": payout_chain.value,
            "recipient": recipient,
            "token_address": self.settings.ESCROW_TOKEN_ADDRESS,
        }
        if payout_chain == PayoutChain.base_sepolia:
            metadata["provider"] = "nla_base_sepolia"
            metadata["recipient_binding_mode"] = (
                "onchain_transfer" if action_type == FundingExecutionActionType.immediate_payout else "execution_metadata_only"
            )
        return metadata

    def _build_milestone_demand(
        self,
        *,
        project_name: str,
        milestone_name: str,
        verification_method: str,
        success_metric: str,
        deadline: str,
    ) -> str:
        return (
            f"Release funds for {project_name} milestone '{milestone_name}' when verification succeeds. "
            f"Verification method: {verification_method}. Success metric: {success_metric}. "
            f"Target deadline: {deadline}."
        )

    def _project_id(self, project: dict[str, Any]) -> str:
        if "id" in project and project["id"] is not None:
            return str(project["id"])
        if "_id" in project and project["_id"] is not None:
            return str(project["_id"])
        raise FundingExecutionError("Project is missing an identifier.", status_code=400, code="missing_project_id")

    def _parse_datetime(self, value: Any) -> datetime | None:
        if value is None:
            return None
        if isinstance(value, datetime):
            return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        text = self._text(value)
        if not text:
            return None
        try:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)

    def _slugify(self, value: str) -> str:
        return "_".join(part for part in value.strip().lower().replace("-", " ").split() if part) or "milestone"

    def _as_dict(self, value: Any) -> dict[str, Any]:
        return value if isinstance(value, dict) else {}

    def _list_of_dicts(self, value: Any) -> list[dict[str, Any]]:
        if not isinstance(value, list):
            return []
        return [item for item in value if isinstance(item, dict)]

    def _text(self, value: Any) -> str:
        return str(value).strip() if value is not None else ""

    def _to_float(self, value: Any) -> float:
        if value is None:
            return 0.0
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    def _now_iso(self) -> str:
        return datetime.now(timezone.utc).isoformat()
