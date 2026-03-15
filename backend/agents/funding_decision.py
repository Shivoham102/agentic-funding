from enum import Enum
from typing import Any

from agents.treasury import TreasuryManagementAgent
from models.project import (
    ConfidenceLevel,
    EvaluationResult,
    FundingDecision,
    FundingDecisionType,
    FundingPackage,
    MilestoneScheduleItem,
    MilestoneVerificationType,
    ProjectStage,
    ProjectStatus,
    RiskClassification,
    TreasuryAllocation,
)


class FundingDecisionAgent:
    """Transforms scores and treasury constraints into a policy decision."""

    MINIMUM_VIABLE_FUNDING = {
        ProjectStage.idea.value: 10_000.0,
        ProjectStage.mvp.value: 20_000.0,
        ProjectStage.beta.value: 30_000.0,
        ProjectStage.live.value: 45_000.0,
        ProjectStage.scaling.value: 60_000.0,
    }

    def __init__(self, treasury_agent: TreasuryManagementAgent) -> None:
        self.treasury_agent = treasury_agent

    def decide(
        self,
        project: dict[str, Any],
        evaluation: EvaluationResult,
        approved_projects: list[dict[str, Any]],
    ) -> tuple[FundingDecision, TreasuryAllocation, ProjectStatus]:
        decision_package = self._as_dict(project.get("decision_package"))
        verifier_result = self._as_dict(project.get("verifier_result"))
        if decision_package.get("schema_version") == "decision-v1":
            if verifier_result.get("passed") is True:
                return self._decide_from_verified_decision_package(
                    project=project,
                    evaluation=evaluation,
                    approved_projects=approved_projects,
                    decision_package=decision_package,
                    verifier_result=verifier_result,
                )
            return self._reject_from_verifier_failure(
                project=project,
                evaluation=evaluation,
                approved_projects=approved_projects,
                verifier_result=verifier_result,
            )

        funding_package_draft = self._as_dict(project.get("funding_package_draft"))
        if funding_package_draft.get("schema_version") == "funding-package-v1":
            return self._decide_from_package_draft(
                project=project,
                evaluation=evaluation,
                approved_projects=approved_projects,
                funding_package_draft=funding_package_draft,
            )

        stage = self._enum_value(project.get("stage"), ProjectStage.mvp.value)
        requested_amount = self._to_float(project.get("requested_funding"))
        schedule_template = self._build_schedule_template(project, stage)
        treasury_cap = self.treasury_agent.max_fundable_amount(approved_projects, schedule_template)
        score_recommended_amount = evaluation.recommended_funding_amount
        min_viable_amount = self.MINIMUM_VIABLE_FUNDING.get(stage, 20_000.0)

        policy_explanation: list[str] = [
            f"Overall score {evaluation.overall_score}/100 with {evaluation.confidence_level.value} confidence.",
            f"Risk classified as {evaluation.risk_classification.value}.",
            f"Treasury can support up to ${treasury_cap:,.0f} under current reserve policy.",
        ]

        if requested_amount <= 0:
            funding_package = self._empty_package(0.0)
            decision = FundingDecision(
                decision=FundingDecisionType.reject,
                rationale="Proposal is rejected because the funding request is missing or zero.",
                policy_explanation=policy_explanation
                + ["A numeric funding request is required before capital can be allocated."],
                funding_package=funding_package,
                milestone_schedule=[],
            )
            return decision, self.treasury_agent.summarize_portfolio(approved_projects), ProjectStatus.rejected

        if (
            evaluation.overall_score < 60
            or evaluation.risk_classification == RiskClassification.critical
            or (
                evaluation.confidence_level == ConfidenceLevel.low
                and evaluation.overall_score < 68
            )
        ):
            funding_package = self._empty_package(requested_amount)
            decision = FundingDecision(
                decision=FundingDecisionType.reject,
                rationale="Proposal does not meet the minimum score, confidence, or risk thresholds.",
                policy_explanation=policy_explanation
                + ["Policy blocks approval below the minimum quality and risk thresholds."],
                funding_package=funding_package,
                milestone_schedule=[],
            )
            return decision, self.treasury_agent.summarize_portfolio(approved_projects), ProjectStatus.rejected

        candidate_amount = min(requested_amount, score_recommended_amount, treasury_cap)
        candidate_amount = round(candidate_amount, 2)

        if candidate_amount < min_viable_amount:
            funding_package = self._empty_package(requested_amount)
            decision = FundingDecision(
                decision=FundingDecisionType.reject,
                rationale="Proposal is promising but cannot be funded at a viable size under current policy constraints.",
                policy_explanation=policy_explanation
                + [
                    f"Minimum viable commitment for the {stage} stage is ${min_viable_amount:,.0f}.",
                    "Treasury or scoring constraints reduce the commitment below that level.",
                ],
                funding_package=funding_package,
                milestone_schedule=[],
            )
            return decision, self.treasury_agent.summarize_portfolio(approved_projects), ProjectStatus.rejected

        decision_type = FundingDecisionType.accept_reduced
        rationale = "Proposal is approved with reduced funding because policy constraints size the commitment below the request."
        if (
            candidate_amount >= requested_amount * 0.9
            and evaluation.overall_score >= 78
            and evaluation.risk_classification in {RiskClassification.low, RiskClassification.medium}
        ):
            decision_type = FundingDecisionType.accept
            rationale = "Proposal is approved because it clears the score, confidence, risk, and treasury thresholds."

        milestone_schedule = self._materialize_schedule(schedule_template, candidate_amount)
        treasury_allocation = self.treasury_agent.summarize_portfolio(
            approved_projects,
            [item.model_dump() for item in milestone_schedule],
        )

        funding_package = FundingPackage(
            requested_amount=round(requested_amount, 2),
            recommended_amount=round(score_recommended_amount, 2),
            approved_amount=round(candidate_amount, 2),
            reduction_ratio=self._reduction_ratio(requested_amount, candidate_amount),
            immediate_release_amount=round(milestone_schedule[0].release_amount, 2),
            escrow_amount=round(
                sum(item.release_amount for item in milestone_schedule[1:]),
                2,
            ),
        )

        if candidate_amount < requested_amount:
            policy_explanation.append("Approved amount is reduced by score-based sizing or treasury capacity.")
        else:
            policy_explanation.append("Approved amount matches the founder request.")
        policy_explanation.append("Capital is released through milestone escrow rather than a single transfer.")

        decision = FundingDecision(
            decision=decision_type,
            rationale=rationale,
            policy_explanation=policy_explanation,
            funding_package=funding_package,
            milestone_schedule=milestone_schedule,
        )

        return decision, treasury_allocation, ProjectStatus.funded

    def _decide_from_package_draft(
        self,
        project: dict[str, Any],
        evaluation: EvaluationResult,
        approved_projects: list[dict[str, Any]],
        funding_package_draft: dict[str, Any],
    ) -> tuple[FundingDecision, TreasuryAllocation, ProjectStatus]:
        requested_amount = self._to_float(project.get("requested_funding"))
        recommended_amount = self._to_float(funding_package_draft.get("recommended_amount_usd"))
        recommendation_label = str(funding_package_draft.get("recommendation_label") or "").strip().lower()
        rationale_codes = self._string_list(funding_package_draft.get("rationale_codes"))

        if recommendation_label == FundingDecisionType.reject.value or recommended_amount <= 0:
            funding_package = self._empty_package(requested_amount)
            policy_explanation = self._policy_explanation_from_draft(evaluation, funding_package_draft, rationale_codes)
            decision = FundingDecision(
                decision=FundingDecisionType.reject,
                rationale="Proposal is rejected by the deterministic scorecard and treasury recommendation policy.",
                policy_explanation=policy_explanation,
                funding_package=funding_package,
                milestone_schedule=[],
            )
            return decision, self.treasury_agent.summarize_portfolio(approved_projects), ProjectStatus.rejected

        decision_type = (
            FundingDecisionType.accept
            if recommendation_label == FundingDecisionType.accept.value
            else FundingDecisionType.accept_reduced
        )
        milestone_schedule = self._materialize_schedule_from_draft(funding_package_draft)
        treasury_allocation = self.treasury_agent.summarize_portfolio(
            approved_projects,
            [item.model_dump(mode="json") for item in milestone_schedule],
        )

        if not treasury_allocation.policy_compliant:
            funding_package = self._empty_package(requested_amount)
            decision = FundingDecision(
                decision=FundingDecisionType.reject,
                rationale="Package draft is rejected because the milestone schedule violates treasury reserve policy after materialization.",
                policy_explanation=self._policy_explanation_from_draft(
                    evaluation,
                    funding_package_draft,
                    rationale_codes + ["TREASURY_POLICY_VIOLATION"],
                ),
                funding_package=funding_package,
                milestone_schedule=[],
            )
            return decision, treasury_allocation, ProjectStatus.rejected

        funding_package = FundingPackage(
            requested_amount=round(requested_amount, 2),
            recommended_amount=round(recommended_amount, 2),
            approved_amount=round(recommended_amount, 2),
            reduction_ratio=self._reduction_ratio(requested_amount, recommended_amount),
            immediate_release_amount=round(milestone_schedule[0].release_amount if milestone_schedule else 0.0, 2),
            escrow_amount=round(sum(item.release_amount for item in milestone_schedule[1:]), 2),
        )
        rationale = (
            "Proposal is approved because the deterministic scorecard and treasury package support full funding."
            if decision_type == FundingDecisionType.accept
            else "Proposal is approved with reduced funding because the deterministic scorecard or treasury package recommends a smaller commitment."
        )
        decision = FundingDecision(
            decision=decision_type,
            rationale=rationale,
            policy_explanation=self._policy_explanation_from_draft(evaluation, funding_package_draft, rationale_codes),
            funding_package=funding_package,
            milestone_schedule=milestone_schedule,
        )
        return decision, treasury_allocation, ProjectStatus.funded

    def _decide_from_verified_decision_package(
        self,
        project: dict[str, Any],
        evaluation: EvaluationResult,
        approved_projects: list[dict[str, Any]],
        decision_package: dict[str, Any],
        verifier_result: dict[str, Any],
    ) -> tuple[FundingDecision, TreasuryAllocation, ProjectStatus]:
        requested_amount = self._to_float(project.get("requested_funding"))
        approved_amount = self._to_float(decision_package.get("approved_amount"))
        decision_label = str(decision_package.get("decision") or "").strip().lower()
        decision_type = (
            FundingDecisionType(decision_label)
            if decision_label in {item.value for item in FundingDecisionType}
            else FundingDecisionType.reject
        )

        if decision_type == FundingDecisionType.reject or approved_amount <= 0:
            funding_package = self._empty_package(requested_amount)
            decision = FundingDecision(
                decision=FundingDecisionType.reject,
                rationale="Proposal is rejected because the verified agentic package does not authorize a positive commitment.",
                policy_explanation=self._policy_explanation_from_verified_package(
                    evaluation,
                    decision_package,
                    verifier_result,
                ),
                funding_package=funding_package,
                milestone_schedule=[],
            )
            return decision, self.treasury_agent.summarize_portfolio(approved_projects), ProjectStatus.rejected

        milestone_schedule = self._materialize_schedule_from_decision_package(decision_package)
        treasury_allocation = self.treasury_agent.summarize_portfolio(
            approved_projects,
            [item.model_dump(mode="json") for item in milestone_schedule],
        )
        if not treasury_allocation.policy_compliant:
            funding_package = self._empty_package(requested_amount)
            decision = FundingDecision(
                decision=FundingDecisionType.reject,
                rationale="Verified package is rejected because the materialized milestone schedule violates treasury reserve policy.",
                policy_explanation=self._policy_explanation_from_verified_package(
                    evaluation,
                    decision_package,
                    {
                        **verifier_result,
                        "violation_codes": self._string_list(verifier_result.get("violation_codes"))
                        + ["TREASURY_POLICY_VIOLATION"],
                    },
                ),
                funding_package=funding_package,
                milestone_schedule=[],
            )
            return decision, treasury_allocation, ProjectStatus.rejected

        funding_package = FundingPackage(
            requested_amount=round(requested_amount, 2),
            recommended_amount=round(approved_amount, 2),
            approved_amount=round(approved_amount, 2),
            reduction_ratio=self._reduction_ratio(requested_amount, approved_amount),
            immediate_release_amount=round(milestone_schedule[0].release_amount if milestone_schedule else 0.0, 2),
            escrow_amount=round(sum(item.release_amount for item in milestone_schedule[1:]), 2),
        )
        decision = FundingDecision(
            decision=decision_type,
            rationale=str(decision_package.get("rationale") or "").strip()
            or (
                "Proposal is approved because the verified agentic package passed policy checks."
                if decision_type == FundingDecisionType.accept
                else "Proposal is approved with reduced funding because the verified agentic package recommends a smaller commitment."
            ),
            policy_explanation=self._policy_explanation_from_verified_package(
                evaluation,
                decision_package,
                verifier_result,
            ),
            funding_package=funding_package,
            milestone_schedule=milestone_schedule,
        )
        return decision, treasury_allocation, ProjectStatus.funded

    def _reject_from_verifier_failure(
        self,
        project: dict[str, Any],
        evaluation: EvaluationResult,
        approved_projects: list[dict[str, Any]],
        verifier_result: dict[str, Any],
    ) -> tuple[FundingDecision, TreasuryAllocation, ProjectStatus]:
        requested_amount = self._to_float(project.get("requested_funding"))
        funding_package = self._empty_package(requested_amount)
        violation_codes = self._string_list(verifier_result.get("violation_codes"))
        policy_explanation = [
            f"Overall score {evaluation.overall_score}/100 with {evaluation.confidence_level.value} confidence.",
            f"Risk classified as {evaluation.risk_classification.value}.",
            "Agentic package failed formal policy verification, so execution is blocked.",
        ]
        if violation_codes:
            policy_explanation.append(
                "Verifier violation codes: "
                + ", ".join(code.replace("_", " ").lower() for code in violation_codes[:6])
                + "."
            )
        decision = FundingDecision(
            decision=FundingDecisionType.reject,
            rationale="Proposal is rejected because the agentic recommendation did not pass formal policy verification.",
            policy_explanation=policy_explanation,
            funding_package=funding_package,
            milestone_schedule=[],
        )
        return decision, self.treasury_agent.summarize_portfolio(approved_projects), ProjectStatus.rejected

    def _build_schedule_template(self, project: dict[str, Any], stage: str) -> list[dict[str, Any]]:
        requested_milestones = project.get("requested_milestones") or []
        if isinstance(requested_milestones, list) and requested_milestones:
            template = self._template_from_founder_milestones(requested_milestones)
            if template:
                return template

        if stage in {ProjectStage.idea.value, ProjectStage.mvp.value}:
            return [
                {
                    "sequence": 1,
                    "name": "Specification and build plan",
                    "description": "Approve the execution plan, architecture, and milestone owners.",
                    "target_days": 14,
                    "verification_type": MilestoneVerificationType.committee_validation.value,
                    "success_metric": "Execution plan and milestone scope approved.",
                    "release_percentage": 0.25,
                },
                {
                    "sequence": 2,
                    "name": "Working product milestone",
                    "description": "Deliver the core MVP functionality with repository evidence.",
                    "target_days": 45,
                    "verification_type": MilestoneVerificationType.repository_activity.value,
                    "success_metric": "Core product milestone shipped with sustained repository activity.",
                    "release_percentage": 0.4,
                },
                {
                    "sequence": 3,
                    "name": "Pilot or KPI validation",
                    "description": "Demonstrate user adoption, deployments, or measurable KPI movement.",
                    "target_days": 90,
                    "verification_type": MilestoneVerificationType.kpi_evidence.value,
                    "success_metric": "Pilot launch, deployments, or KPI evidence validates traction.",
                    "release_percentage": 0.35,
                },
            ]

        return [
            {
                "sequence": 1,
                "name": "Production release checkpoint",
                "description": "Confirm delivery plan, deployment scope, and release readiness.",
                "target_days": 14,
                "verification_type": MilestoneVerificationType.committee_validation.value,
                "success_metric": "Release scope and dependencies approved.",
                "release_percentage": 0.2,
            },
            {
                "sequence": 2,
                "name": "Deployment milestone",
                "description": "Ship the next production capability with deployment evidence.",
                "target_days": 45,
                "verification_type": MilestoneVerificationType.deployment_proof.value,
                "success_metric": "Deployment proof confirms the scoped release is live.",
                "release_percentage": 0.35,
            },
            {
                "sequence": 3,
                "name": "Growth or revenue milestone",
                "description": "Hit the agreed growth, usage, or revenue target.",
                "target_days": 90,
                "verification_type": MilestoneVerificationType.kpi_evidence.value,
                "success_metric": "Agreed KPI target is met and documented.",
                "release_percentage": 0.45,
            },
        ]

    def _template_from_founder_milestones(self, requested_milestones: list[dict[str, Any]]) -> list[dict[str, Any]]:
        template: list[dict[str, Any]] = []
        explicit_ratios = [
            self._to_float(item.get("requested_release_ratio"))
            for item in requested_milestones
            if isinstance(item, dict)
        ]
        ratio_sum = sum(ratio for ratio in explicit_ratios if ratio > 0)
        even_ratio = round(1.0 / len(requested_milestones), 4) if requested_milestones else 0.0

        for index, raw_item in enumerate(requested_milestones, start=1):
            if not isinstance(raw_item, dict):
                continue
            release_ratio = self._to_float(raw_item.get("requested_release_ratio"))
            if release_ratio <= 0:
                if ratio_sum > 0:
                    release_ratio = round((1.0 - ratio_sum) / max(1, len(requested_milestones) - len(explicit_ratios)), 4)
                else:
                    release_ratio = even_ratio

            template.append(
                {
                    "sequence": index,
                    "name": raw_item.get("name") or f"Milestone {index}",
                    "description": raw_item.get("description") or "Founder-defined milestone.",
                    "target_days": int(self._to_float(raw_item.get("target_days")) or index * 30),
                    "verification_type": self._verification_type(raw_item.get("name"), raw_item.get("description")).value,
                    "success_metric": raw_item.get("description") or "Milestone completion verified.",
                    "release_percentage": release_ratio,
                }
            )

        total_ratio = sum(item["release_percentage"] for item in template)
        if not template or total_ratio <= 0:
            return []

        for item in template:
            item["release_percentage"] = round(item["release_percentage"] / total_ratio, 4)

        return template

    def _materialize_schedule(
        self,
        schedule_template: list[dict[str, Any]],
        approved_amount: float,
    ) -> list[MilestoneScheduleItem]:
        schedule: list[MilestoneScheduleItem] = []
        remaining = approved_amount

        for index, template_item in enumerate(schedule_template):
            if index == len(schedule_template) - 1:
                release_amount = round(remaining, 2)
            else:
                release_amount = round(approved_amount * self._to_float(template_item.get("release_percentage")), 2)
                remaining -= release_amount

            schedule.append(
                MilestoneScheduleItem(
                    sequence=int(template_item.get("sequence", index + 1)),
                    name=str(template_item.get("name", f"Milestone {index + 1}")),
                    description=str(template_item.get("description", "")),
                    target_days=int(self._to_float(template_item.get("target_days"))),
                    verification_type=MilestoneVerificationType(template_item.get("verification_type")),
                    success_metric=str(template_item.get("success_metric", "")),
                    release_percentage=round(release_amount / approved_amount, 4) if approved_amount > 0 else 0.0,
                    release_amount=release_amount,
                )
            )

        return schedule

    def _materialize_schedule_from_draft(
        self,
        funding_package_draft: dict[str, Any],
    ) -> list[MilestoneScheduleItem]:
        approved_amount = self._to_float(funding_package_draft.get("recommended_amount_usd"))
        milestones = funding_package_draft.get("milestones") or []
        if not isinstance(milestones, list) or approved_amount <= 0:
            return []

        schedule: list[MilestoneScheduleItem] = []
        for raw_item in milestones:
            if not isinstance(raw_item, dict):
                continue
            release_amount = round(self._to_float(raw_item.get("amount_usd")), 2)
            verification_type = self._verification_type_from_draft(raw_item.get("verification_method"))
            deliverable_type = str(raw_item.get("deliverable_type") or f"milestone_{len(schedule) + 1}")
            schedule.append(
                MilestoneScheduleItem(
                    sequence=int(self._to_float(raw_item.get("index")) or len(schedule) + 1),
                    name=self._humanize_label(deliverable_type),
                    description=f"Deliver {self._humanize_label(deliverable_type).lower()} and verify via {verification_type.value.replace('_', ' ')}.",
                    target_days=self._target_days_from_deadline(raw_item.get("deadline")),
                    verification_type=verification_type,
                    success_metric=self._success_metric(deliverable_type, verification_type),
                    release_percentage=round(release_amount / approved_amount, 4),
                    release_amount=release_amount,
                )
            )
        return schedule

    def _materialize_schedule_from_decision_package(
        self,
        decision_package: dict[str, Any],
    ) -> list[MilestoneScheduleItem]:
        approved_amount = self._to_float(decision_package.get("approved_amount"))
        milestones = decision_package.get("milestones") or []
        if not isinstance(milestones, list) or approved_amount <= 0:
            return []

        schedule: list[MilestoneScheduleItem] = []
        for raw_item in milestones:
            if not isinstance(raw_item, dict):
                continue
            release_amount = round(self._to_float(raw_item.get("amount")), 2)
            verification_type = self._verification_type_from_draft(raw_item.get("verification_method"))
            deliverable_type = str(raw_item.get("deliverable_type") or f"milestone_{len(schedule) + 1}")
            schedule.append(
                MilestoneScheduleItem(
                    sequence=len(schedule) + 1,
                    name=self._humanize_label(deliverable_type),
                    description=f"Deliver {self._humanize_label(deliverable_type).lower()} and verify via {verification_type.value.replace('_', ' ')}.",
                    target_days=self._target_days_from_deadline(raw_item.get("deadline")),
                    verification_type=verification_type,
                    success_metric=self._success_metric(deliverable_type, verification_type),
                    release_percentage=round(release_amount / approved_amount, 4),
                    release_amount=release_amount,
                )
            )
        return schedule

    def _verification_type(self, name: Any, description: Any) -> MilestoneVerificationType:
        text = f"{name or ''} {description or ''}".lower()
        if any(keyword in text for keyword in ["deploy", "launch", "production"]):
            return MilestoneVerificationType.deployment_proof
        if any(keyword in text for keyword in ["revenue", "user", "growth", "kpi", "traction"]):
            return MilestoneVerificationType.kpi_evidence
        if any(keyword in text for keyword in ["repo", "code", "mvp", "build", "feature"]):
            return MilestoneVerificationType.repository_activity
        return MilestoneVerificationType.committee_validation

    def _empty_package(self, requested_amount: float) -> FundingPackage:
        return FundingPackage(
            requested_amount=round(requested_amount, 2),
            recommended_amount=0.0,
            approved_amount=0.0,
            reduction_ratio=1.0 if requested_amount > 0 else 0.0,
            immediate_release_amount=0.0,
            escrow_amount=0.0,
        )

    def _reduction_ratio(self, requested_amount: float, approved_amount: float) -> float:
        if requested_amount <= 0:
            return 0.0
        return round(max(0.0, min(1.0, 1.0 - (approved_amount / requested_amount))), 4)

    def _enum_value(self, value: Any, default: str) -> str:
        if isinstance(value, Enum):
            return str(value.value)
        if value is None:
            return default
        return str(value)

    def _to_float(self, value: Any) -> float:
        if value is None:
            return 0.0
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    def _as_dict(self, value: Any) -> dict[str, Any]:
        return value if isinstance(value, dict) else {}

    def _string_list(self, value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value if str(item).strip()]

    def _verification_type_from_draft(self, value: Any) -> MilestoneVerificationType:
        normalized = str(value or "").strip().lower()
        if normalized in {item.value for item in MilestoneVerificationType}:
            return MilestoneVerificationType(normalized)
        return MilestoneVerificationType.committee_validation

    def _target_days_from_deadline(self, value: Any) -> int:
        text = str(value or "").strip().upper()
        if text.startswith("P") and text.endswith("D"):
            number = text[1:-1]
            if number.isdigit():
                return int(number)
        return int(self._to_float(value))

    def _humanize_label(self, value: str) -> str:
        words = [part for part in value.replace("-", "_").split("_") if part]
        return " ".join(word.capitalize() for word in words) or "Milestone"

    def _success_metric(self, deliverable_type: str, verification_type: MilestoneVerificationType) -> str:
        return (
            f"{self._humanize_label(deliverable_type)} is verified through "
            f"{verification_type.value.replace('_', ' ')} evidence."
        )

    def _policy_explanation_from_draft(
        self,
        evaluation: EvaluationResult,
        funding_package_draft: dict[str, Any],
        rationale_codes: list[str],
    ) -> list[str]:
        explanation = [
            f"Overall score {evaluation.overall_score}/100 with {evaluation.confidence_level.value} confidence.",
            f"Risk classified as {evaluation.risk_classification.value}.",
            f"Deterministic package recommends ${self._to_float(funding_package_draft.get('recommended_amount_usd')):,.0f}.",
            f"Treasury capacity snapshot for new commitments is ${self._to_float(funding_package_draft.get('treasury_capacity_usd')):,.0f}.",
        ]
        if rationale_codes:
            explanation.append(
                "Package rationale codes: " + ", ".join(code.replace("_", " ").lower() for code in rationale_codes[:4]) + "."
            )
        return explanation

    def _policy_explanation_from_verified_package(
        self,
        evaluation: EvaluationResult,
        decision_package: dict[str, Any],
        verifier_result: dict[str, Any],
    ) -> list[str]:
        explanation = [
            f"Overall score {evaluation.overall_score}/100 with {evaluation.confidence_level.value} confidence.",
            f"Risk classified as {evaluation.risk_classification.value}.",
            f"Verified decision recommends ${self._to_float(decision_package.get('approved_amount')):,.0f}.",
        ]
        score_inputs_used = self._string_list(decision_package.get("score_inputs_used"))
        if score_inputs_used:
            explanation.append("Decision used score inputs: " + ", ".join(score_inputs_used[:6]) + ".")
        uncertainty_flags = self._string_list(decision_package.get("uncertainty_flags"))
        if uncertainty_flags:
            explanation.append(
                "Uncertainty flags: "
                + ", ".join(flag.replace("_", " ").lower() for flag in uncertainty_flags[:5])
                + "."
            )
        violation_codes = self._string_list(verifier_result.get("violation_codes"))
        if verifier_result.get("passed") is True:
            explanation.append("Formal policy verification passed before execution.")
        elif violation_codes:
            explanation.append(
                "Formal verification blocked execution with codes: "
                + ", ".join(code.replace("_", " ").lower() for code in violation_codes[:6])
                + "."
            )
        return explanation
