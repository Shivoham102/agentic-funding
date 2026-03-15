from __future__ import annotations

import json
import os
import subprocess
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any

from bson import ObjectId


class FeatureExtractionAgent:
    """Bridge the Python backend to the deterministic TypeScript scoring package."""

    def __init__(
        self,
        node_executable: str = "node",
        package_dir: str | Path | None = None,
        build_timeout_seconds: float = 45.0,
        cli_timeout_seconds: float = 20.0,
    ) -> None:
        self.node_executable = node_executable
        self.package_dir = Path(package_dir) if package_dir else Path(__file__).resolve().parents[2] / "packages" / "scoring"
        self.src_dir = self.package_dir / "src"
        self.dist_cli = self.package_dir / "dist" / "cli.js"
        self.build_timeout_seconds = build_timeout_seconds
        self.cli_timeout_seconds = cli_timeout_seconds

    def extract_features(self, project: dict[str, Any]) -> dict[str, Any]:
        parsed = self._run_cli(
            {
                "proposal": self._proposal_payload(project),
                "evidence": self._evidence_payload(project),
            }
        )
        features = parsed.get("features")
        if not isinstance(features, dict):
            raise RuntimeError("Feature extraction did not return a feature vector.")
        return features

    def run_scoring_review(
        self,
        project: dict[str, Any],
        treasury_snapshot: dict[str, Any],
        owner_prefs: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        parsed = self._run_cli(
            {
                "proposal": self._proposal_payload(project),
                "evidence": self._evidence_payload(project),
                "ownerPrefs": owner_prefs or {},
                "treasurySnapshot": self._treasury_snapshot_payload(treasury_snapshot),
            }
        )
        features = parsed.get("features")
        scorecard = parsed.get("scorecard")
        funding_package_draft = parsed.get("fundingPackageDraft")

        if not isinstance(features, dict):
            raise RuntimeError("Scoring review did not return a feature vector.")
        if not isinstance(scorecard, dict):
            raise RuntimeError("Scoring review did not return a scorecard.")
        if not isinstance(funding_package_draft, dict):
            raise RuntimeError("Scoring review did not return a funding package draft.")

        return {
            "features": features,
            "scorecard": scorecard,
            "funding_package_draft": funding_package_draft,
        }

    def _run_cli(self, payload: dict[str, Any]) -> dict[str, Any]:
        self._ensure_runtime()
        result = subprocess.run(
            [self.node_executable, str(self.dist_cli)],
            input=json.dumps(payload, default=self._json_default),
            text=True,
            capture_output=True,
            cwd=self.package_dir,
            timeout=self.cli_timeout_seconds,
            check=False,
        )
        if result.returncode != 0:
            message = result.stderr.strip() or result.stdout.strip() or "Unknown scoring CLI error"
            raise RuntimeError(f"Feature extraction failed: {message}")

        parsed = json.loads(result.stdout or "{}")
        if not isinstance(parsed, dict):
            raise RuntimeError("Feature extraction returned a non-object response.")
        if not parsed.get("ok"):
            raise RuntimeError(f"Feature extraction reported failure: {parsed}")

        validation = parsed.get("validation")
        if isinstance(validation, dict) and not validation.get("ok", False):
            raise RuntimeError(f"Feature validation failed: {validation.get('errors')}")

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
            raise RuntimeError(f"Unable to build scoring package: {message}")
        if not self.dist_cli.exists():
            raise RuntimeError("Scoring package build completed but dist/cli.js is missing.")

    def _proposal_payload(self, project: dict[str, Any]) -> dict[str, Any]:
        return {
            "proposal_id": self._text(project.get("id")) or self._text(project.get("_id")),
            "name": project.get("name"),
            "website_url": project.get("website_url"),
            "github_url": project.get("github_url"),
            "short_description": project.get("short_description"),
            "description": project.get("description"),
            "category": self._enum_value(project.get("category")),
            "stage": self._enum_value(project.get("stage")),
            "team_size": project.get("team_size"),
            "requested_funding": project.get("requested_funding"),
            "recipient_wallet": project.get("recipient_wallet"),
            "team_background": project.get("team_background"),
            "market_summary": project.get("market_summary"),
            "traction_summary": project.get("traction_summary"),
            "budget_breakdown": project.get("budget_breakdown") or [],
            "requested_milestones": project.get("requested_milestones") or [],
        }

    def _evidence_payload(self, project: dict[str, Any]) -> dict[str, Any]:
        enriched_data = project.get("enriched_data")
        if not isinstance(enriched_data, dict):
            return {}
        evidence_bundle = enriched_data.get("evidence_bundle")
        return evidence_bundle if isinstance(evidence_bundle, dict) else {}

    def _treasury_snapshot_payload(self, treasury_snapshot: dict[str, Any]) -> dict[str, Any]:
        return {
            "hot_reserve_usd": self._to_float(treasury_snapshot.get("hot_reserve")),
            "committed_reserve_usd": self._to_float(treasury_snapshot.get("committed_reserve")),
            "idle_treasury_usd": self._to_float(treasury_snapshot.get("idle_treasury")),
            "strategic_buffer_usd": self._to_float(treasury_snapshot.get("strategic_buffer")),
            "available_for_new_commitments_usd": self._to_float(
                treasury_snapshot.get("available_for_new_commitments")
            ),
        }

    def _enum_value(self, value: Any) -> Any:
        if isinstance(value, Enum):
            return value.value
        return value

    def _text(self, value: Any) -> str:
        if isinstance(value, ObjectId):
            return str(value)
        return str(value).strip() if value is not None else ""

    def _to_float(self, value: Any) -> float:
        if value is None:
            return 0.0
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    def _json_default(self, value: Any) -> Any:
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, Enum):
            return value.value
        if isinstance(value, ObjectId):
            return str(value)
        raise TypeError(f"Unsupported JSON value for feature extraction: {type(value)!r}")
