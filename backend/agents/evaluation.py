from enum import Enum
from typing import Any

from models.project import (
    ConfidenceLevel,
    EvaluationResult,
    ProjectCategory,
    ProjectStage,
    RiskClassification,
    ScoreBreakdown,
)


class EvaluationAgent:
    """Deterministic evaluation engine for proposal scoring."""

    CATEGORY_BASELINE = {
        ProjectCategory.defi.value: 64.0,
        ProjectCategory.infrastructure.value: 68.0,
        ProjectCategory.developer_tools.value: 66.0,
        ProjectCategory.consumer.value: 60.0,
        ProjectCategory.other.value: 55.0,
    }

    STAGE_FEASIBILITY = {
        ProjectStage.idea.value: 40.0,
        ProjectStage.mvp.value: 55.0,
        ProjectStage.beta.value: 70.0,
        ProjectStage.live.value: 82.0,
        ProjectStage.scaling.value: 90.0,
    }

    STAGE_TRACTION_FLOOR = {
        ProjectStage.idea.value: 28.0,
        ProjectStage.mvp.value: 36.0,
        ProjectStage.beta.value: 48.0,
        ProjectStage.live.value: 58.0,
        ProjectStage.scaling.value: 68.0,
    }

    STAGE_FUNDING_CAP = {
        ProjectStage.idea.value: 50_000.0,
        ProjectStage.mvp.value: 80_000.0,
        ProjectStage.beta.value: 125_000.0,
        ProjectStage.live.value: 200_000.0,
        ProjectStage.scaling.value: 300_000.0,
    }

    CATEGORY_CAP_MULTIPLIER = {
        ProjectCategory.defi.value: 1.0,
        ProjectCategory.infrastructure.value: 1.1,
        ProjectCategory.developer_tools.value: 1.0,
        ProjectCategory.consumer.value: 0.9,
        ProjectCategory.other.value: 0.85,
    }

    def evaluate_project(self, project: dict[str, Any]) -> EvaluationResult:
        stage = self._enum_value(project.get("stage"), ProjectStage.mvp.value)
        category = self._enum_value(project.get("category"), ProjectCategory.other.value)
        enriched = self._as_dict(project.get("enriched_data"))
        feature_vector = self._as_dict(project.get("feature_vector"))
        feature_numeric = self._as_dict(feature_vector.get("numeric"))
        feature_categorical = self._as_dict(feature_vector.get("categorical"))
        feature_missingness = self._as_dict(feature_vector.get("missingness_summary"))

        metrics = self._as_dict(enriched.get("metrics"))
        metrics = self._merge_metrics(metrics, feature_numeric)
        thin_evidence_categories = self._string_list(feature_categorical.get("thin_evidence_categories"))
        if thin_evidence_categories:
            metrics["thin_evidence_categories"] = thin_evidence_categories
            metrics["thin_evidence_category_count"] = float(len(thin_evidence_categories))
        missing_total = self._to_float(feature_missingness.get("total_missing_count"))
        if missing_total > 0:
            metrics["missingness_total"] = missing_total
        missing_evidence = self._to_float(feature_missingness.get("missing_evidence_fields"))
        if missing_evidence > 0:
            metrics["missing_evidence_fields"] = missing_evidence

        data_completeness = self._metric(feature_numeric, "proposal_completeness_ratio")
        if data_completeness <= 0:
            data_completeness = self._calculate_data_completeness(project, metrics)
        evidence_coverage = self._metric(feature_numeric, "evidence_category_coverage_ratio")
        if evidence_coverage <= 0:
            evidence_coverage = self._calculate_evidence_coverage(project, enriched, metrics)

        team_quality = self._score_team_quality(project, metrics, stage, category)
        market_opportunity = self._score_market_opportunity(project, metrics, category)
        product_feasibility = self._score_product_feasibility(project, metrics, stage, category)
        capital_efficiency = self._score_capital_efficiency(project, metrics, stage, category)
        traction_signals = self._score_traction_signals(project, metrics, stage)
        risk_indicators = self._score_risk_indicators(
            project=project,
            metrics=metrics,
            stage=stage,
            category=category,
            data_completeness=data_completeness,
            evidence_coverage=evidence_coverage,
            capital_efficiency=capital_efficiency,
        )

        breakdown = ScoreBreakdown(
            team_quality=team_quality,
            market_opportunity=market_opportunity,
            product_feasibility=product_feasibility,
            capital_efficiency=capital_efficiency,
            traction_signals=traction_signals,
            risk_indicators=risk_indicators,
        )

        overall_score = self._round(
            (
                team_quality * 0.22
                + market_opportunity * 0.18
                + product_feasibility * 0.22
                + capital_efficiency * 0.15
                + traction_signals * 0.13
                + risk_indicators * 0.10
            )
        )

        confidence_score = self._round(
            min(
                100.0,
                30.0 + data_completeness * 40.0 + evidence_coverage * 30.0,
            )
        )
        confidence_level = self._confidence_level(confidence_score)
        risk_score = self._round(100.0 - risk_indicators)
        risk_classification = self._risk_classification(risk_score)

        recommended_amount = self._recommended_funding_amount(
            project=project,
            overall_score=overall_score,
            confidence_score=confidence_score,
            risk_score=risk_score,
            stage=stage,
            category=category,
        )
        requested_funding = self._to_float(project.get("requested_funding"))
        allocation_ratio = 0.0
        if requested_funding > 0:
            allocation_ratio = self._round(min(1.0, recommended_amount / requested_funding), 4)

        strengths, concerns = self._build_observations(
            breakdown=breakdown,
            confidence_level=confidence_level,
            risk_classification=risk_classification,
            project=project,
            metrics=metrics,
            feature_vector=feature_vector,
        )
        policy_notes = self._build_policy_notes(
            requested_funding=requested_funding,
            recommended_amount=recommended_amount,
            confidence_level=confidence_level,
            evidence_coverage=evidence_coverage,
        )

        return EvaluationResult(
            overall_score=overall_score,
            confidence_score=confidence_score,
            confidence_level=confidence_level,
            risk_score=risk_score,
            risk_classification=risk_classification,
            breakdown=breakdown,
            strengths=strengths,
            concerns=concerns,
            policy_notes=policy_notes,
            data_completeness=self._round(data_completeness, 4),
            evidence_coverage=self._round(evidence_coverage, 4),
            recommended_funding_amount=recommended_amount,
            recommended_allocation_ratio=allocation_ratio,
        )

    def _score_team_quality(
        self,
        project: dict[str, Any],
        metrics: dict[str, Any],
        stage: str,
        category: str,
    ) -> float:
        score = 18.0
        team_size = self._to_float(project.get("team_size"))
        if team_size > 0:
            score += min(team_size, 6.0) * 6.0
            if stage in {ProjectStage.live.value, ProjectStage.scaling.value} and team_size < 3:
                score -= 8.0
        elif stage in {ProjectStage.idea.value, ProjectStage.mvp.value}:
            score += 8.0

        years_experience = self._metric(metrics, "years_experience", "team_experience_years", "founder_experience_years")
        score += min(years_experience * 2.5, 18.0)

        domain_expertise = self._normalize_score(
            self._metric(metrics, "domain_expertise_score", "team_quality_score")
        )
        score += domain_expertise * 0.12

        prior_exits = self._metric(metrics, "prior_exits")
        score += min(prior_exits * 5.0, 10.0)

        repo_contributors = self._metric(metrics, "repo_contributors", "contributors")
        score += min(repo_contributors * 2.0, 8.0)

        team_fact_count = self._metric(metrics, "team_fact_count")
        if team_fact_count >= 3:
            score += 4.0
        elif 0 < team_fact_count < 2:
            score += 2.0

        if project.get("github_url"):
            score += 8.0

        team_background = self._text(project.get("team_background"))
        if len(team_background) >= 80:
            score += 6.0

        if category in {ProjectCategory.infrastructure.value, ProjectCategory.developer_tools.value} and not project.get("github_url"):
            score -= 8.0

        if team_size <= 0 and not team_background:
            score -= 10.0

        return self._bounded(score)

    def _score_market_opportunity(
        self,
        project: dict[str, Any],
        metrics: dict[str, Any],
        category: str,
    ) -> float:
        score = self.CATEGORY_BASELINE.get(category, 55.0)
        tam = self._metric(metrics, "tam_usd", "market_size_usd")
        if tam >= 1_000_000_000:
            score += 15.0
        elif tam >= 250_000_000:
            score += 11.0
        elif tam >= 50_000_000:
            score += 6.0

        growth_rate = self._metric(metrics, "market_growth_pct", "growth_rate_pct")
        score += min(growth_rate / 4.0, 12.0)

        validation = self._normalize_score(self._metric(metrics, "market_validation_score"))
        score += validation * 0.10

        demand_score = self._normalize_score(self._metric(metrics, "market_demand_score"))
        score += demand_score * 0.12

        trend_score = self._normalize_score(self._metric(metrics, "market_trend_score"))
        score += trend_score * 0.08

        intelligence_score = self._normalize_score(self._metric(metrics, "market_intelligence_score"))
        score += intelligence_score * 0.12

        competition = self._normalize_score(self._metric(metrics, "competition_intensity", "competition_score"))
        score -= competition * 0.08

        market_summary = self._text(project.get("market_summary"))
        if len(market_summary) >= 80:
            score += 5.0

        active_users = self._metric(metrics, "active_users", "monthly_active_users", "users")
        paying_customers = self._metric(metrics, "customers", "paying_customers")
        if active_users >= 5_000 or paying_customers >= 100:
            score += 5.0

        market_fact_count = self._metric(metrics, "market_fact_count")
        if market_fact_count >= 3:
            score += 4.0
        elif market_fact_count <= 0 and self._metric(metrics, "evidence_fact_count") > 0:
            score -= 6.0

        return self._bounded(score)

    def _score_product_feasibility(
        self,
        project: dict[str, Any],
        metrics: dict[str, Any],
        stage: str,
        category: str,
    ) -> float:
        score = self.STAGE_FEASIBILITY.get(stage, 55.0)
        if project.get("github_url"):
            score += 10.0

        commits = self._metric(metrics, "github_commits_90d", "commits_90d")
        if commits >= 100:
            score += 12.0
        elif commits >= 40:
            score += 8.0
        elif commits >= 10:
            score += 4.0

        docs_quality = self._normalize_score(self._metric(metrics, "docs_quality_score"))
        score += docs_quality * 0.10

        readiness = self._normalize_score(self._metric(metrics, "product_readiness_score", "implementation_maturity_score"))
        score += readiness * 0.12

        novelty_score = self._normalize_score(self._metric(metrics, "market_novelty_score"))
        score += novelty_score * 0.06

        product_fact_count = self._metric(metrics, "product_fact_count")
        if product_fact_count >= 3:
            score += 4.0
        elif product_fact_count <= 0 and self._metric(metrics, "evidence_fact_count") > 0:
            score -= 6.0

        deployments = self._metric(metrics, "deployments_count", "production_deployments")
        score += min(deployments * 3.0, 8.0)

        audits = self._metric(metrics, "audits_count")
        if category in {ProjectCategory.defi.value, ProjectCategory.infrastructure.value} and audits > 0:
            score += min(audits * 4.0, 8.0)

        if len(self._text(project.get("description"))) >= 250:
            score += 5.0

        if (
            stage in {ProjectStage.beta.value, ProjectStage.live.value, ProjectStage.scaling.value}
            and category in {ProjectCategory.infrastructure.value, ProjectCategory.developer_tools.value, ProjectCategory.defi.value}
            and not project.get("github_url")
        ):
            score -= 12.0

        return self._bounded(score)

    def _score_capital_efficiency(
        self,
        project: dict[str, Any],
        metrics: dict[str, Any],
        stage: str,
        category: str,
    ) -> float:
        requested_funding = self._to_float(project.get("requested_funding"))
        if requested_funding <= 0:
            return 35.0

        team_size = max(1.0, self._to_float(project.get("team_size")) or 1.0)
        stage_reference = {
            ProjectStage.idea.value: 25_000.0,
            ProjectStage.mvp.value: 50_000.0,
            ProjectStage.beta.value: 85_000.0,
            ProjectStage.live.value: 140_000.0,
            ProjectStage.scaling.value: 220_000.0,
        }
        category_modifier = {
            ProjectCategory.defi.value: 1.0,
            ProjectCategory.infrastructure.value: 1.1,
            ProjectCategory.developer_tools.value: 1.0,
            ProjectCategory.consumer.value: 0.9,
            ProjectCategory.other.value: 0.85,
        }

        ideal_amount = stage_reference.get(stage, 60_000.0) * (0.75 + min(team_size, 8.0) * 0.08)
        ideal_amount *= category_modifier.get(category, 1.0)
        variance_ratio = abs(requested_funding - ideal_amount) / max(ideal_amount, 1.0)
        score = 92.0 - min(variance_ratio * 42.0, 52.0)

        budget_breakdown = project.get("budget_breakdown") or []
        if budget_breakdown:
            score += 6.0

        runway_months = self._metric(metrics, "runway_months")
        if runway_months >= 12:
            score += 6.0
        elif 0 < runway_months < 6:
            score -= 8.0

        burn_multiple = self._metric(metrics, "burn_multiple")
        if 0 < burn_multiple <= 2:
            score += 5.0
        elif burn_multiple >= 4:
            score -= 10.0

        revenue = self._metric(metrics, "monthly_revenue_usd", "mrr_usd")
        if revenue > 0 and requested_funding <= revenue * 18:
            score += 6.0
        elif revenue > 0 and requested_funding > revenue * 48:
            score -= 8.0

        budget_coverage = self._metric(metrics, "budget_coverage_ratio")
        if budget_coverage >= 0.8:
            score += 4.0
        elif 0 < budget_coverage < 0.4:
            score -= 8.0

        funding_per_milestone = self._metric(metrics, "funding_per_milestone_usd")
        if funding_per_milestone >= 100_000:
            score -= 6.0

        return self._bounded(score)

    def _score_traction_signals(
        self,
        project: dict[str, Any],
        metrics: dict[str, Any],
        stage: str,
    ) -> float:
        score = self.STAGE_TRACTION_FLOOR.get(stage, 40.0)

        active_users = self._metric(metrics, "active_users", "monthly_active_users", "users")
        if active_users >= 50_000:
            score += 25.0
        elif active_users >= 10_000:
            score += 18.0
        elif active_users >= 2_000:
            score += 10.0
        elif active_users >= 500:
            score += 5.0

        customers = self._metric(metrics, "customers", "paying_customers")
        if customers >= 500:
            score += 18.0
        elif customers >= 100:
            score += 12.0
        elif customers >= 25:
            score += 6.0

        revenue = self._metric(metrics, "monthly_revenue_usd", "mrr_usd", "revenue_usd")
        if revenue >= 100_000:
            score += 18.0
        elif revenue >= 25_000:
            score += 12.0
        elif revenue >= 5_000:
            score += 6.0

        volume = self._metric(metrics, "tvl_usd", "onchain_volume_usd")
        if volume >= 10_000_000:
            score += 10.0
        elif volume >= 1_000_000:
            score += 6.0

        stars = self._metric(metrics, "github_stars")
        if stars >= 2_000:
            score += 8.0
        elif stars >= 500:
            score += 5.0
        elif stars >= 100:
            score += 2.0

        traction_summary = self._text(project.get("traction_summary"))
        if len(traction_summary) >= 60:
            score += 5.0

        wallet_activity = self._metric(metrics, "wallet_transactions_30d")
        if wallet_activity >= 100:
            score += 5.0
        elif wallet_activity >= 25:
            score += 2.0

        traction_fact_count = self._metric(metrics, "traction_fact_count")
        if traction_fact_count >= 3:
            score += 3.0

        return self._bounded(score)

    def _score_risk_indicators(
        self,
        project: dict[str, Any],
        metrics: dict[str, Any],
        stage: str,
        category: str,
        data_completeness: float,
        evidence_coverage: float,
        capital_efficiency: float,
    ) -> float:
        score = 84.0
        requested_funding = self._to_float(project.get("requested_funding"))
        team_size = self._to_float(project.get("team_size"))

        if requested_funding <= 0:
            score -= 20.0

        if stage in {ProjectStage.live.value, ProjectStage.scaling.value} and team_size < 2:
            score -= 12.0

        if (
            category in {ProjectCategory.defi.value, ProjectCategory.infrastructure.value, ProjectCategory.developer_tools.value}
            and stage in {ProjectStage.beta.value, ProjectStage.live.value, ProjectStage.scaling.value}
            and not project.get("github_url")
        ):
            score -= 12.0

        if capital_efficiency < 50:
            score -= 12.0
        elif capital_efficiency < 65:
            score -= 6.0

        runway_months = self._metric(metrics, "runway_months")
        if 0 < runway_months < 6:
            score -= 10.0

        compliance_risk = self._normalize_score(self._metric(metrics, "compliance_risk_score"))
        security_risk = self._normalize_score(self._metric(metrics, "security_risk_score"))
        score -= compliance_risk * 0.08
        score -= security_risk * 0.08

        risk_flags = project.get("risk_flags") or metrics.get("risk_flags") or []
        if isinstance(risk_flags, list):
            score -= min(len(risk_flags) * 8.0, 24.0)

        market_confidence = self._normalize_score(self._metric(metrics, "market_intelligence_confidence_score"))
        if 0 < market_confidence < 45:
            score -= 8.0
        elif 45 <= market_confidence < 60:
            score -= 4.0

        if data_completeness < 0.6:
            score -= 12.0
        if evidence_coverage < 0.5:
            score -= 8.0

        contradiction_count = self._metric(metrics, "contradiction_flag_count")
        score -= min(contradiction_count * 4.0, 16.0)

        stale_fact_ratio = self._metric(metrics, "stale_fact_ratio")
        score -= stale_fact_ratio * 18.0

        thin_evidence_categories = self._metric(metrics, "thin_evidence_category_count")
        score -= min(thin_evidence_categories * 3.0, 12.0)

        missing_evidence_fields = self._metric(metrics, "missing_evidence_fields")
        if missing_evidence_fields >= 6:
            score -= 8.0
        elif missing_evidence_fields >= 3:
            score -= 4.0

        return self._bounded(score)

    def _recommended_funding_amount(
        self,
        project: dict[str, Any],
        overall_score: float,
        confidence_score: float,
        risk_score: float,
        stage: str,
        category: str,
    ) -> float:
        requested_funding = self._to_float(project.get("requested_funding"))
        if requested_funding <= 0:
            return 0.0

        stage_cap = self.STAGE_FUNDING_CAP.get(stage, 80_000.0)
        category_cap = stage_cap * self.CATEGORY_CAP_MULTIPLIER.get(category, 1.0)

        if overall_score < 55 or risk_score > 80:
            return 0.0

        if overall_score >= 82 and confidence_score >= 72 and risk_score <= 35:
            ratio = 1.0
        elif overall_score >= 72 and confidence_score >= 58 and risk_score <= 55:
            ratio = 0.85
        elif overall_score >= 62 and confidence_score >= 45 and risk_score <= 68:
            ratio = 0.65
        else:
            ratio = 0.45

        recommended_amount = min(requested_funding * ratio, category_cap)
        return self._round(max(0.0, recommended_amount))

    def _calculate_data_completeness(self, project: dict[str, Any], metrics: dict[str, Any]) -> float:
        slots = [
            bool(self._text(project.get("name"))),
            bool(self._text(project.get("website_url"))),
            bool(self._text(project.get("short_description"))),
            len(self._text(project.get("description"))) >= 80,
            bool(project.get("category")),
            bool(project.get("stage")),
            self._to_float(project.get("requested_funding")) > 0,
            self._to_float(project.get("team_size")) > 0,
            bool(self._text(project.get("team_background"))),
            bool(self._text(project.get("market_summary"))),
            bool(self._text(project.get("traction_summary"))),
            bool(project.get("github_url")),
            bool(project.get("budget_breakdown")),
            bool(project.get("requested_milestones")),
            bool(metrics),
        ]
        if self._text(project.get("recipient_wallet")):
            slots.append(True)
        return sum(1 for slot in slots if slot) / len(slots)

    def _calculate_evidence_coverage(
        self,
        project: dict[str, Any],
        enriched: dict[str, Any],
        metrics: dict[str, Any],
    ) -> float:
        evidence_sources = enriched.get("evidence_sources") or []
        raw_data = enriched.get("raw_data") or {}
        slots = [
            bool(enriched.get("website_scraped")),
            bool(enriched.get("github_scraped")),
            bool(metrics),
            bool(raw_data),
            bool(evidence_sources),
            bool(self._text(project.get("team_background"))),
            bool(self._text(project.get("market_summary"))),
            bool(self._text(project.get("traction_summary"))),
            bool(project.get("budget_breakdown")),
            bool(project.get("requested_milestones")),
        ]
        if self._text(project.get("recipient_wallet")):
            slots.append(bool(enriched.get("wallet_scraped")))
        if project.get("website_url") or project.get("github_url"):
            slots.append(bool(enriched.get("market_intelligence_applied")))
        return sum(1 for slot in slots if slot) / len(slots)

    def _build_observations(
        self,
        breakdown: ScoreBreakdown,
        confidence_level: ConfidenceLevel,
        risk_classification: RiskClassification,
        project: dict[str, Any],
        metrics: dict[str, Any],
        feature_vector: dict[str, Any] | None = None,
    ) -> tuple[list[str], list[str]]:
        strengths: list[str] = []
        concerns: list[str] = []

        score_to_label = {
            "team_quality": "team execution signals",
            "market_opportunity": "market opportunity",
            "product_feasibility": "product feasibility",
            "capital_efficiency": "capital efficiency",
            "traction_signals": "traction signals",
            "risk_indicators": "risk posture",
        }
        for field_name, label in score_to_label.items():
            value = getattr(breakdown, field_name)
            if value >= 75:
                strengths.append(f"Strong {label}.")
            elif value <= 55:
                concerns.append(f"Weak {label} relative to policy thresholds.")

        if confidence_level == ConfidenceLevel.low:
            concerns.append("Evidence coverage is limited, so confidence is low.")
        elif confidence_level == ConfidenceLevel.high:
            strengths.append("Submission includes enough detail to support a high-confidence review.")

        if risk_classification in {RiskClassification.high, RiskClassification.critical}:
            concerns.append("Risk profile is elevated and requires tighter capital controls.")

        if self._metric(metrics, "monthly_revenue_usd", "mrr_usd") >= 25_000:
            strengths.append("Commercial traction is already visible in revenue data.")

        if self._metric(metrics, "market_intelligence_score") >= 72:
            strengths.append("Market research indicates strong demand, trend, or differentiation signals.")

        if self._metric(metrics, "competition_intensity", "competition_score") >= 70:
            concerns.append("Competitive intensity appears high relative to current differentiation evidence.")

        if not project.get("github_url") and self._enum_value(project.get("category"), "") in {
            ProjectCategory.defi.value,
            ProjectCategory.infrastructure.value,
            ProjectCategory.developer_tools.value,
        }:
            concerns.append("Missing repository evidence increases execution risk for a technical project.")

        feature_vector = self._as_dict(feature_vector)
        feature_categorical = self._as_dict(feature_vector.get("categorical"))
        thin_evidence_categories = self._string_list(
            feature_categorical.get("thin_evidence_categories") or metrics.get("thin_evidence_categories")
        )
        if thin_evidence_categories:
            labels = ", ".join(item.replace("_", " ") for item in thin_evidence_categories[:3])
            concerns.append(f"Evidence remains thin for {labels}.")

        return strengths[:4], concerns[:5]

    def _build_policy_notes(
        self,
        requested_funding: float,
        recommended_amount: float,
        confidence_level: ConfidenceLevel,
        evidence_coverage: float,
    ) -> list[str]:
        notes: list[str] = []
        if requested_funding <= 0:
            notes.append("Funding recommendation defaults to zero until the request amount is defined.")
        elif recommended_amount < requested_funding:
            notes.append("Recommended funding is reduced to fit score-based policy limits.")
        else:
            notes.append("Requested funding is within score-based policy limits.")

        if confidence_level == ConfidenceLevel.low:
            notes.append("Low confidence pushes the policy toward conservative sizing.")
        elif evidence_coverage >= 0.7:
            notes.append("Evidence coverage supports normal policy sizing.")

        return notes

    def _confidence_level(self, confidence_score: float) -> ConfidenceLevel:
        if confidence_score >= 75:
            return ConfidenceLevel.high
        if confidence_score >= 55:
            return ConfidenceLevel.medium
        return ConfidenceLevel.low

    def _risk_classification(self, risk_score: float) -> RiskClassification:
        if risk_score <= 25:
            return RiskClassification.low
        if risk_score <= 50:
            return RiskClassification.medium
        if risk_score <= 70:
            return RiskClassification.high
        return RiskClassification.critical

    def _metric(self, metrics: dict[str, Any], *keys: str) -> float:
        for key in keys:
            if key in metrics:
                return self._to_float(metrics.get(key))
        return 0.0

    def _merge_metrics(self, metrics: dict[str, Any], feature_numeric: dict[str, Any]) -> dict[str, Any]:
        merged = dict(metrics)
        for key, value in feature_numeric.items():
            if isinstance(value, (int, float)):
                merged[key] = float(value)
        return merged

    def _normalize_score(self, value: float) -> float:
        if value <= 1:
            value *= 100.0
        return self._bounded(value)

    def _bounded(self, value: float) -> float:
        return self._round(max(0.0, min(100.0, value)))

    def _round(self, value: float, digits: int = 2) -> float:
        return round(value, digits)

    def _enum_value(self, value: Any, default: str) -> str:
        if isinstance(value, Enum):
            return str(value.value)
        if value is None:
            return default
        return str(value)

    def _to_float(self, value: Any) -> float:
        if value is None:
            return 0.0
        if isinstance(value, bool):
            return float(value)
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

    def _text(self, value: Any) -> str:
        return str(value).strip() if value is not None else ""
