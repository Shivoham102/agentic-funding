from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any

from config import settings


class DecisionReviewAgent:
    """Bridge the Python backend to the TypeScript decision package."""

    def __init__(
        self,
        node_executable: str | None = None,
        package_dir: str | Path | None = None,
        build_timeout_seconds: float = 45.0,
        cli_timeout_seconds: float = 30.0,
    ) -> None:
        self.node_executable = node_executable or settings.DECISION_NODE_EXECUTABLE
        self.package_dir = (
            Path(package_dir)
            if package_dir
            else Path(__file__).resolve().parents[2] / "packages" / "decision"
        )
        self.src_dir = self.package_dir / "src"
        self.dist_cli = self.package_dir / "dist" / "cli.js"
        self.build_timeout_seconds = build_timeout_seconds
        self.cli_timeout_seconds = cli_timeout_seconds

    def review(
        self,
        project: dict[str, Any],
        scorecard: dict[str, Any],
        funding_package_draft: dict[str, Any],
        treasury_snapshot: dict[str, Any],
        approved_projects: list[dict[str, Any]],
    ) -> dict[str, Any]:
        try:
            return self._run_cli(
                {
                    "proposal": self._proposal_payload(project),
                    "evidence": self._evidence_payload(project, scorecard),
                    "scorecard": scorecard,
                    "fundingPackageDraft": funding_package_draft,
                    "treasurySnapshot": self._treasury_snapshot_payload(treasury_snapshot),
                    "portfolioContext": self._portfolio_context_payload(project, approved_projects),
                    "policy": self._policy_payload(),
                    "agent": self._agent_payload(),
                }
            ).get("review", {})
        except Exception as exc:
            return self._fallback_review(project, scorecard, funding_package_draft, treasury_snapshot, exc)

    def _run_cli(self, payload: dict[str, Any]) -> dict[str, Any]:
        self._ensure_runtime()
        result = subprocess.run(
            [self.node_executable, str(self.dist_cli)],
            input=json.dumps(payload, default=str),
            text=True,
            capture_output=True,
            cwd=self.package_dir,
            timeout=self.cli_timeout_seconds,
            check=False,
        )
        if result.returncode != 0:
            message = result.stderr.strip() or result.stdout.strip() or "Unknown decision CLI error"
            raise RuntimeError(message)

        parsed = json.loads(result.stdout or "{}")
        if not isinstance(parsed, dict):
            raise RuntimeError("Decision CLI returned a non-object response.")
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
            raise RuntimeError(f"Unable to build decision package: {message}")
        if not self.dist_cli.exists():
            raise RuntimeError("Decision package build completed but dist/cli.js is missing.")

    def _proposal_payload(self, project: dict[str, Any]) -> dict[str, Any]:
        return {
            "proposal_id": self._text(project.get("id")) or self._text(project.get("_id")),
            "name": project.get("name"),
            "category": self._enum_value(project.get("category"), "other"),
            "stage": self._enum_value(project.get("stage"), "idea"),
            "requested_amount_usd": self._to_float(project.get("requested_funding")),
            "short_description": project.get("short_description"),
            "description": project.get("description"),
            "requested_milestones": project.get("requested_milestones") or [],
        }

    def _evidence_payload(self, project: dict[str, Any], scorecard: dict[str, Any]) -> dict[str, Any]:
        enriched_data = project.get("enriched_data")
        evidence_bundle = enriched_data.get("evidence_bundle") if isinstance(enriched_data, dict) else None
        thin_categories = self._thin_evidence_categories(project, scorecard)
        if not isinstance(evidence_bundle, dict):
            return {
                "facts_count": 0,
                "sources_count": 0,
                "overall_confidence": 0.0,
                "thin_evidence_categories": thin_categories,
                "contradiction_flag_count": 0,
            }

        facts = evidence_bundle.get("facts") if isinstance(evidence_bundle.get("facts"), list) else []
        sources = evidence_bundle.get("sources") if isinstance(evidence_bundle.get("sources"), list) else []
        confidence = evidence_bundle.get("confidence") if isinstance(evidence_bundle.get("confidence"), dict) else {}
        contradiction_flags = (
            evidence_bundle.get("contradiction_flags")
            if isinstance(evidence_bundle.get("contradiction_flags"), list)
            else []
        )
        freshness_summary = (
            evidence_bundle.get("freshness_summary")
            if isinstance(evidence_bundle.get("freshness_summary"), dict)
            else {}
        )
        return {
            "facts_count": len(facts),
            "sources_count": len(sources),
            "overall_confidence": self._to_float(confidence.get("overall")),
            "thin_evidence_categories": thin_categories,
            "contradiction_flag_count": len(contradiction_flags),
            "raw_payload_hash": self._text(evidence_bundle.get("raw_payload_hash")),
            "stale_fact_count": int(self._to_float(freshness_summary.get("stale_fact_count"))),
        }

    def _thin_evidence_categories(self, project: dict[str, Any], scorecard: dict[str, Any]) -> list[str]:
        feature_vector = project.get("feature_vector")
        if isinstance(feature_vector, dict):
            missingness_summary = feature_vector.get("missingness_summary")
            if isinstance(missingness_summary, dict):
                categories = missingness_summary.get("thin_evidence_categories")
                if isinstance(categories, list):
                    return [str(item).strip() for item in categories if str(item).strip()]

        if isinstance(scorecard, dict):
            missingness_summary = scorecard.get("missingness_summary")
            if isinstance(missingness_summary, dict):
                categories = missingness_summary.get("thin_evidence_categories")
                if isinstance(categories, list):
                    return [str(item).strip() for item in categories if str(item).strip()]

        return []

    def _treasury_snapshot_payload(self, treasury_snapshot: dict[str, Any]) -> dict[str, Any]:
        total_capital = self._to_float(treasury_snapshot.get("total_capital"))
        min_hot = round(total_capital * float(settings.TREASURY_HOT_RESERVE_RATIO), 2)
        return {
            "total_capital_usd": total_capital,
            "min_hot_reserve_usd": min_hot,
            "hot_reserve_usd": self._to_float(treasury_snapshot.get("hot_reserve")),
            "committed_reserve_usd": self._to_float(treasury_snapshot.get("committed_reserve")),
            "idle_treasury_usd": self._to_float(treasury_snapshot.get("idle_treasury")),
            "strategic_buffer_usd": self._to_float(treasury_snapshot.get("strategic_buffer")),
            "available_for_new_commitments_usd": self._to_float(
                treasury_snapshot.get("available_for_new_commitments")
            ),
        }

    def _portfolio_context_payload(
        self,
        project: dict[str, Any],
        approved_projects: list[dict[str, Any]],
    ) -> dict[str, Any]:
        sector_exposure: dict[str, float] = {}
        active_total = 0.0
        for approved_project in approved_projects:
            decision = approved_project.get("funding_decision")
            decision_dict = decision if isinstance(decision, dict) else {}
            funding_package = decision_dict.get("funding_package")
            funding_package_dict = funding_package if isinstance(funding_package, dict) else {}
            approved_amount = self._to_float(funding_package_dict.get("approved_amount"))
            if approved_amount <= 0:
                continue
            active_total += approved_amount
            category = self._enum_value(approved_project.get("category"), "other")
            sector_exposure[category] = round(sector_exposure.get(category, 0.0) + approved_amount, 2)

        current_category = self._enum_value(project.get("category"), "other")
        sector_exposure.setdefault(current_category, round(sector_exposure.get(current_category, 0.0), 2))
        return {
            "active_approved_total_usd": round(active_total, 2),
            "active_project_count": len(approved_projects),
            "sector_exposure_usd": sector_exposure,
        }

    def _policy_payload(self) -> dict[str, Any]:
        total_capital = float(settings.TREASURY_TOTAL_CAPITAL)
        return {
            "treasury_total_usd": total_capital,
            "strategic_buffer_usd": round(total_capital * float(settings.TREASURY_STRATEGIC_BUFFER_RATIO), 2),
            "min_hot_reserve_usd": round(total_capital * float(settings.TREASURY_HOT_RESERVE_RATIO), 2),
            "per_proposal_cap_ratio": float(settings.DECISION_PER_PROPOSAL_CAP_RATIO),
            "sector_exposure_cap_ratio": float(settings.DECISION_SECTOR_EXPOSURE_CAP_RATIO),
            "minimum_fundable_score": float(settings.DECISION_MINIMUM_FUNDABLE_SCORE),
            "minimum_accept_score": float(settings.DECISION_MINIMUM_ACCEPT_SCORE),
            "minimum_confidence": float(settings.DECISION_MINIMUM_CONFIDENCE),
            "high_risk_reject_below_score": float(settings.DECISION_HIGH_RISK_REJECT_BELOW_SCORE),
            "high_risk_min_confidence": float(settings.DECISION_HIGH_RISK_MIN_CONFIDENCE),
            "max_revision_attempts": int(settings.DECISION_MAX_REVISION_ATTEMPTS),
            "min_milestone_count": 2,
            "max_milestone_count": int(settings.DECISION_MAX_MILESTONE_COUNT),
        }

    def _agent_payload(self) -> dict[str, Any]:
        return {
            "mode": settings.DECISION_AGENT_MODE,
            "apiKey": settings.GEMINI_API_KEY or None,
            "baseUrl": settings.GEMINI_API_URL,
            "model": settings.DECISION_AGENT_MODEL,
            "timeoutMs": int(float(settings.DECISION_TIMEOUT_SECONDS) * 1000),
            "maxRetries": int(settings.DECISION_MAX_RETRIES),
            "minRequestIntervalSeconds": float(settings.DECISION_MIN_REQUEST_INTERVAL_SECONDS),
            "allowHeuristicFallback": bool(settings.DECISION_ALLOW_HEURISTIC_FALLBACK),
        }

    def _fallback_review(
        self,
        project: dict[str, Any],
        scorecard: dict[str, Any],
        funding_package_draft: dict[str, Any],
        treasury_snapshot: dict[str, Any],
        exc: Exception,
    ) -> dict[str, Any]:
        return {
            "schema_version": "decision-review-v1",
            "approved_for_execution": False,
            "agent_mode_used": "heuristic_fallback",
            "decision_package": {
                "schema_version": "decision-v1",
                "decision": "reject",
                "approved_amount": 0.0,
                "milestones": [],
                "rationale": "Rejected because the decision engine was unavailable for verified execution.",
                "score_inputs_used": [
                    "overall_score",
                    "confidence",
                    "risk_classification",
                    "funding_package_draft.recommended_amount_usd",
                    "treasury_snapshot.available_for_new_commitments_usd",
                ],
                "assumptions": [],
                "requested_revisions": ["Restore decision engine availability and rerun review."],
                "confidence": max(0.0, min(1.0, self._to_float(scorecard.get("confidence")))),
                "uncertainty_flags": ["decision_engine_unavailable"],
            },
            "verifier_result": {
                "schema_version": "verifier-v1",
                "passed": False,
                "approved_for_execution": False,
                "violation_codes": ["DECISION_ENGINE_UNAVAILABLE"],
                "violations": [
                    {
                        "code": "DECISION_ENGINE_UNAVAILABLE",
                        "message": str(exc),
                        "path": "decision_package",
                    }
                ],
                "check_results": [
                    {
                        "code": "DECISION_ENGINE_UNAVAILABLE",
                        "passed": False,
                        "message": str(exc),
                    }
                ],
            },
            "revision_attempts": 0,
            "attempts": [],
            "warnings": [
                f"Decision engine fallback activated: {exc}",
                f"Deterministic draft remained at ${self._to_float(funding_package_draft.get('recommended_amount_usd')):,.0f} with treasury capacity ${self._to_float(treasury_snapshot.get('available_for_new_commitments')):,.0f}.",
            ],
        }

    def _enum_value(self, value: Any, default: str) -> str:
        if value is None:
            return default
        raw_value = getattr(value, "value", value)
        return str(raw_value)

    def _text(self, value: Any) -> str:
        return str(value).strip() if value is not None else ""

    def _to_float(self, value: Any) -> float:
        if value is None:
            return 0.0
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0
