from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any


CLAIM_STOP_WORDS = {
    "about",
    "also",
    "build",
    "built",
    "company",
    "customer",
    "customers",
    "developer",
    "developers",
    "founder",
    "founders",
    "market",
    "platform",
    "product",
    "startup",
    "team",
    "their",
    "there",
    "these",
    "this",
    "with",
}


class DeterministicContradictionEngine:
    """Assess founder claims against collected evidence using deterministic matching rules."""

    def assess(
        self,
        project: dict[str, Any],
        evidence_facts: list[dict[str, Any]],
        generated_at: str,
    ) -> dict[str, Any]:
        claims = self._build_claims(project)
        assessments: list[dict[str, Any]] = []
        facts: list[dict[str, Any]] = []
        metrics = {
            "claim_supported_count": 0.0,
            "claim_partially_supported_count": 0.0,
            "claim_contradicted_count": 0.0,
            "claim_missing_evidence_count": 0.0,
            "risk_flags": [],
        }

        for claim in claims:
            category_facts = [
                fact
                for fact in evidence_facts
                if fact.get("category") == claim["category"]
                and not str(fact.get("key", "")).endswith("_claim_assessment")
            ]

            assessment = self._assess_claim_against_facts(claim, category_facts)
            assessments.append(assessment)
            facts.append(
                {
                    "id": f"claim_assessment_{claim['claim_id']}",
                    "category": claim["category"],
                    "key": f"{claim['category']}_claim_assessment",
                    "claim": claim["text"],
                    "value": {
                        "claim_id": claim["claim_id"],
                        "assessment": assessment["status"],
                        "evidence_fact_ids": assessment["evidence_fact_ids"],
                        "matched_fact_keys": assessment["matched_fact_keys"],
                        "max_overlap_score": assessment["max_overlap_score"],
                    },
                    "confidence": 0.9,
                    "observed_at": generated_at,
                    "support_status": self._assessment_support_status(assessment["status"]),
                    "freshness_days": self._min_freshness_days(category_facts),
                    "contradiction_flags": assessment["contradiction_flags"],
                    "provenance": {
                        "source_ids": assessment["source_ids"],
                        "urls": assessment["urls"],
                        "invocation_ids": [],
                        "request_signatures": [],
                    },
                }
            )

            if assessment["status"] == "supported":
                metrics["claim_supported_count"] += 1.0
            elif assessment["status"] == "partially_supported":
                metrics["claim_partially_supported_count"] += 1.0
            elif assessment["status"] == "contradicted":
                metrics["claim_contradicted_count"] += 1.0
                metrics["risk_flags"].append("claim_contradiction_detected")
            else:
                metrics["claim_missing_evidence_count"] += 1.0

        metrics["risk_flags"] = sorted(set(metrics["risk_flags"]))
        return {
            "assessments": assessments,
            "facts": facts,
            "metrics": metrics,
        }

    def _build_claims(self, project: dict[str, Any]) -> list[dict[str, str]]:
        claims: list[dict[str, str]] = []
        team_background = self._text(project.get("team_background"))
        if team_background:
            claims.append(
                {
                    "claim_id": "team_background",
                    "category": "team",
                    "text": team_background,
                }
            )

        product_claim = self._join_text(project.get("short_description"), project.get("description"))
        if product_claim:
            claims.append(
                {
                    "claim_id": "product_description",
                    "category": "product",
                    "text": product_claim,
                }
            )

        market_summary = self._text(project.get("market_summary"))
        if market_summary:
            claims.append(
                {
                    "claim_id": "market_summary",
                    "category": "market",
                    "text": market_summary,
                }
            )

        traction_summary = self._text(project.get("traction_summary"))
        if traction_summary:
            claims.append(
                {
                    "claim_id": "traction_summary",
                    "category": "traction",
                    "text": traction_summary,
                }
            )

        return claims

    def _assess_claim_against_facts(
        self,
        claim: dict[str, str],
        evidence_facts: list[dict[str, Any]],
    ) -> dict[str, Any]:
        if not evidence_facts:
            return {
                "claim_id": claim["claim_id"],
                "category": claim["category"],
                "status": "missing_evidence",
                "evidence_fact_ids": [],
                "matched_fact_keys": [],
                "max_overlap_score": 0.0,
                "contradiction_flags": [],
                "source_ids": [],
                "urls": [],
            }

        scored_facts: list[dict[str, Any]] = []
        for fact in evidence_facts:
            overlap_score = self._overlap_score(claim["text"], self._fact_text(fact))
            scored_facts.append(
                {
                    "fact": fact,
                    "overlap_score": overlap_score,
                    "support_status": self._text(fact.get("support_status")) or "unverified",
                    "contradiction_flags": [
                        self._text(flag)
                        for flag in (fact.get("contradiction_flags") or [])
                        if self._text(flag)
                    ],
                }
            )

        supporting = [
            item
            for item in scored_facts
            if item["support_status"] in {"supported", "observed", "mixed"}
            and item["overlap_score"] >= 0.08
        ]
        contradicting = [
            item
            for item in scored_facts
            if item["support_status"] == "contradicted"
            or (item["contradiction_flags"] and item["overlap_score"] >= 0.08)
        ]
        observed_same_category = [
            item
            for item in scored_facts
            if item["support_status"] in {"supported", "observed", "mixed"}
        ]

        if contradicting and (not supporting or self._max_overlap(contradicting) >= self._max_overlap(supporting)):
            selected = self._top_scored(contradicting)
            status = "contradicted"
        elif supporting:
            selected = self._top_scored(supporting)
            status = "supported" if self._max_overlap(supporting) >= 0.22 else "partially_supported"
        elif observed_same_category:
            selected = self._top_scored(observed_same_category)
            status = "partially_supported"
        else:
            selected = self._top_scored(scored_facts)
            status = "missing_evidence"

        contradiction_flags = sorted(
            {
                flag
                for item in selected
                for flag in item["contradiction_flags"]
                if flag
            }
        )
        if status == "contradicted" and not contradiction_flags:
            contradiction_flags = ["deterministic_contradiction"]

        return {
            "claim_id": claim["claim_id"],
            "category": claim["category"],
            "status": status,
            "evidence_fact_ids": [item["fact"].get("id") for item in selected if item["fact"].get("id")],
            "matched_fact_keys": [item["fact"].get("key") for item in selected if item["fact"].get("key")],
            "max_overlap_score": round(self._max_overlap(selected), 4),
            "contradiction_flags": contradiction_flags,
            "source_ids": self._unique(
                source_id
                for item in selected
                for source_id in (item["fact"].get("provenance", {}) or {}).get("source_ids", [])
            ),
            "urls": self._unique(
                url
                for item in selected
                for url in (item["fact"].get("provenance", {}) or {}).get("urls", [])
            ),
        }

    def _assessment_support_status(self, status: str) -> str:
        if status == "supported":
            return "supported"
        if status == "contradicted":
            return "contradicted"
        if status == "partially_supported":
            return "mixed"
        return "unverified"

    def _fact_text(self, fact: dict[str, Any]) -> str:
        parts = [
            self._text(fact.get("claim")),
            self._text(fact.get("key")),
            self._stringify_value(fact.get("value")),
        ]
        return " ".join(part for part in parts if part).strip()

    def _stringify_value(self, value: Any) -> str:
        if isinstance(value, str):
            return value
        if value is None:
            return ""
        try:
            return json.dumps(value, sort_keys=True, default=str)
        except TypeError:
            return str(value)

    def _overlap_score(self, claim_text: str, evidence_text: str) -> float:
        claim_tokens = self._tokens(claim_text)
        if not claim_tokens:
            return 0.0
        evidence_tokens = self._tokens(evidence_text)
        if not evidence_tokens:
            return 0.0
        overlap = claim_tokens & evidence_tokens
        return len(overlap) / max(len(claim_tokens), 1)

    def _tokens(self, value: str) -> set[str]:
        return {
            token
            for token in re.findall(r"[a-z0-9]{4,}", value.lower())
            if token not in CLAIM_STOP_WORDS
        }

    def _top_scored(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return sorted(items, key=lambda item: item["overlap_score"], reverse=True)[:4]

    def _max_overlap(self, items: list[dict[str, Any]]) -> float:
        if not items:
            return 0.0
        return max(float(item["overlap_score"]) for item in items)

    def _min_freshness_days(self, evidence_facts: list[dict[str, Any]]) -> int | None:
        freshness_values = [
            int(fact["freshness_days"])
            for fact in evidence_facts
            if isinstance(fact.get("freshness_days"), int)
        ]
        if not freshness_values:
            return 0
        return min(freshness_values)

    def _unique(self, values: Any) -> list[str]:
        items = [self._text(value) for value in values if self._text(value)]
        return sorted(set(items))

    def _join_text(self, *values: Any) -> str:
        return " ".join(self._text(value) for value in values if self._text(value)).strip()

    def _text(self, value: Any) -> str:
        return str(value).strip() if value is not None else ""

    def _now_iso(self) -> str:
        return datetime.now(timezone.utc).isoformat()
