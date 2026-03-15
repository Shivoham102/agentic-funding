from __future__ import annotations

import asyncio
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx

from agents.contradiction_engine import DeterministicContradictionEngine
from agents.github_enrichment import GitHubEnrichmentClient
from agents.market_intelligence import MarketIntelligenceAgent
from agents.solana_enrichment import SolanaEnrichmentClient


HTML_LINK_PATTERN = re.compile(r"""href=["']([^"'#]+)["']""", re.IGNORECASE)
TARGET_CATEGORIES = ("team", "product", "market", "traction")
COMMON_TARGET_PATHS = (
    "",
    "/about",
    "/company",
    "/team",
    "/careers",
    "/product",
    "/platform",
    "/features",
    "/pricing",
    "/docs",
    "/documentation",
    "/developers",
    "/api",
    "/customers",
    "/case-studies",
    "/blog",
    "/changelog",
    "/security",
)
STOP_WORDS = {
    "about",
    "after",
    "agent",
    "against",
    "analytics",
    "build",
    "capital",
    "company",
    "data",
    "feature",
    "founder",
    "funding",
    "market",
    "milestone",
    "platform",
    "product",
    "proposal",
    "release",
    "startup",
    "system",
    "team",
    "their",
    "this",
    "with",
}


class DataCollectorAgent:
    """Collect structured diligence evidence from web, GitHub, Solana, and internal portfolio context."""

    def __init__(
        self,
        unbrowse_api_key: str,
        base_url: str,
        timeout_seconds: float = 45.0,
        max_retries: int = 2,
        solana_rpc_url: str = "https://api.mainnet-beta.solana.com",
        solana_commitment: str = "finalized",
        solana_recent_signature_limit: int = 25,
        solana_analytics_provider: str = "rpc_history",
        solana_analytics_signature_limit: int = 100,
        solana_timeout_seconds: float = 20.0,
        solana_max_retries: int = 2,
        github_api_url: str = "https://api.github.com",
        github_api_token: str = "",
        github_timeout_seconds: float = 20.0,
        github_max_retries: int = 2,
        github_commits_lookback_days: int = 90,
        github_max_pages: int = 5,
        gemini_api_key: str = "",
        gemini_api_url: str = "https://generativelanguage.googleapis.com/v1beta",
        gemini_market_model: str = "gemini-3.1-flash-lite-preview",
        gemini_timeout_seconds: float = 60.0,
        gemini_max_retries: int = 0,
        gemini_min_request_interval_seconds: float = 5.0,
        market_search_timeout_seconds: float = 12.0,
        market_search_results_per_query: int = 2,
        market_max_source_documents: int = 4,
    ) -> None:
        self.unbrowse_api_key = unbrowse_api_key
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries
        self.unbrowse_search_timeout_seconds = min(20.0, max(8.0, float(timeout_seconds) / 2.0))
        self.unbrowse_resolve_timeout_seconds = min(90.0, max(60.0, float(timeout_seconds) * 1.5))
        self.unbrowse_total_budget_seconds = min(
            150.0,
            max(90.0, self.unbrowse_resolve_timeout_seconds * 1.5),
        )
        self.solana_enrichment_timeout_seconds = min(
            45.0,
            max(
                15.0,
                float(solana_timeout_seconds) * max(1, int(solana_max_retries) + 1) * 1.5,
            ),
        )
        self.solana_client = SolanaEnrichmentClient(
            rpc_url=solana_rpc_url,
            commitment=solana_commitment,
            recent_signature_limit=solana_recent_signature_limit,
            analytics_provider=solana_analytics_provider,
            analytics_signature_limit=solana_analytics_signature_limit,
            timeout_seconds=solana_timeout_seconds,
            max_retries=solana_max_retries,
        )
        self.github_client = GitHubEnrichmentClient(
            api_url=github_api_url,
            api_token=github_api_token,
            timeout_seconds=github_timeout_seconds,
            max_retries=github_max_retries,
            commits_lookback_days=github_commits_lookback_days,
            max_pages=github_max_pages,
        )
        self.market_intelligence_client = MarketIntelligenceAgent(
            api_key=gemini_api_key,
            base_url=gemini_api_url,
            model_name=gemini_market_model,
            timeout_seconds=gemini_timeout_seconds,
            max_retries=gemini_max_retries,
            min_request_interval_seconds=gemini_min_request_interval_seconds,
            search_timeout_seconds=market_search_timeout_seconds,
            search_results_per_query=market_search_results_per_query,
            max_source_documents=market_max_source_documents,
        )
        self.contradiction_engine = DeterministicContradictionEngine()

    async def collect_and_normalize(
        self,
        project: dict[str, Any],
        portfolio_projects: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        website_url = self._text(project.get("website_url"))
        github_url = self._text(project.get("github_url"))
        recipient_wallet = self._text(project.get("recipient_wallet"))
        project_name = self._text(project.get("name")) or "Unknown project"
        generated_at = self._now_iso()
        portfolio_projects = portfolio_projects or []

        if not website_url and not github_url and not recipient_wallet and not portfolio_projects:
            return {
                "project_name": project_name,
                "generated_at": generated_at,
                "website_scraped": False,
                "github_scraped": False,
                "wallet_scraped": False,
                "portfolio_context_applied": False,
                "market_intelligence_applied": False,
                "metrics": {},
                "raw_data": {},
                "evidence_sources": [],
                "evidence_bundle": self._build_bundle([], [], generated_at),
                "notes": ["No website URL, GitHub repository, wallet, or portfolio context available for enrichment."],
                "web_targets": [],
                "claim_assessments": [],
                "market_intelligence_report": None,
                "market_intelligence_cache": None,
            }

        raw_payloads: dict[str, Any] = {}
        evidence_sources: list[dict[str, Any]] = []
        facts: list[dict[str, Any]] = []
        notes: list[str] = []
        metrics: dict[str, Any] = {"risk_flags": []}

        website_scraped = False
        github_scraped = False
        wallet_scraped = False
        portfolio_context_applied = False
        market_intelligence_applied = False
        market_intelligence_report: dict[str, Any] | None = None
        market_intelligence_cache: dict[str, Any] | None = None

        web_targets: list[dict[str, Any]] = []
        if website_url:
            domain = self._normalized_domain(website_url)
            if domain:
                try:
                    domain_search = await self._search_domain(domain, project_name)
                    if domain_search:
                        storage_payload = self._sanitize_for_storage(domain_search)
                        search_source = self._build_search_source(
                            kind="unbrowse_domain_search",
                            label="Unbrowse domain search",
                            url=website_url,
                            payload=storage_payload,
                            observed_at=generated_at,
                        )
                        raw_payloads[search_source["id"]] = storage_payload
                        evidence_sources.append(search_source)
                        notes.append(
                            f"Found {len(self._extract_search_results(domain_search))} existing Unbrowse skill candidates for {domain}."
                        )
                        self._merge_metrics(
                            metrics,
                            {"matched_skill_count": len(self._extract_search_results(domain_search))},
                        )
                except Exception as exc:
                    notes.append(f"Domain skill search failed: {exc}")

            try:
                web_targets = await self._discover_web_targets(website_url)
                if web_targets:
                    notes.append(f"Selected {len(web_targets)} targeted website pages for diligence.")
                    self._merge_metrics(metrics, {"web_target_count": len(web_targets)})
            except Exception as exc:
                notes.append(f"Web target discovery failed: {exc}")
        else:
            notes.append("No website URL available for website enrichment.")

        request_specs = self._build_request_specs(project, web_targets)
        if request_specs:
            category_successes: set[str] = set()
            deadline = time.monotonic() + self.unbrowse_total_budget_seconds
            for spec in request_specs:
                category = self._text(spec.get("category"))
                if category and category in category_successes:
                    continue

                remaining_budget = deadline - time.monotonic()
                if remaining_budget <= 0:
                    notes.append("Skipped remaining website evidence checks after exhausting the Unbrowse time budget.")
                    break

                try:
                    result = await asyncio.wait_for(
                        self._resolve_request(spec, generated_at),
                        timeout=min(self.unbrowse_resolve_timeout_seconds, remaining_budget),
                    )
                except asyncio.TimeoutError:
                    notes.append(f"{spec['label']} timed out for {spec['url']}.")
                    continue
                except Exception as exc:
                    notes.append(f"{spec['label']} failed for {spec['url']}: {exc}")
                    continue

                evidence_sources.extend(result["sources"])
                facts.extend(result["facts"])
                raw_payloads.update(result["raw_payloads"])
                self._merge_metrics(metrics, result["metrics"])
                website_scraped = True

                if category and result.get("resolved_usefully"):
                    category_successes.add(category)

        if github_url:
            try:
                github_evidence = await self._collect_github_evidence(github_url, generated_at)
                github_scraped = True
                evidence_sources.extend(github_evidence["sources"])
                facts.extend(github_evidence["facts"])
                raw_payloads.update(github_evidence["raw_payloads"])
                self._merge_metrics(metrics, github_evidence["metrics"])
                notes.extend(github_evidence.get("notes", []))
            except Exception as exc:
                notes.append(f"GitHub enrichment failed: {exc}")

        if recipient_wallet:
            try:
                wallet_evidence = await asyncio.wait_for(
                    self._collect_wallet_evidence(recipient_wallet, generated_at),
                    timeout=self.solana_enrichment_timeout_seconds,
                )
                wallet_scraped = True
                evidence_sources.extend(wallet_evidence["sources"])
                facts.extend(wallet_evidence["facts"])
                raw_payloads.update(wallet_evidence["raw_payloads"])
                self._merge_metrics(metrics, wallet_evidence["metrics"])
            except asyncio.TimeoutError:
                notes.append("Wallet enrichment timed out before the configured RPC budget completed.")
            except Exception as exc:
                notes.append(f"Wallet enrichment failed: {exc}")

        if portfolio_projects:
            portfolio_evidence = self._collect_portfolio_context(project, portfolio_projects, generated_at)
            portfolio_context_applied = True
            evidence_sources.extend(portfolio_evidence["sources"])
            facts.extend(portfolio_evidence["facts"])
            raw_payloads.update(portfolio_evidence["raw_payloads"])
            self._merge_metrics(metrics, portfolio_evidence["metrics"])

        if website_url or github_url:
            market_metric_snapshot = self._sanitize_for_storage(metrics)
            cached_market_evidence = self._get_cached_market_intelligence(project, market_metric_snapshot, generated_at)
            if cached_market_evidence is not None:
                market_intelligence_applied = True
                market_intelligence_report = self._sanitize_for_storage(cached_market_evidence.get("report"))
                evidence_sources.extend(cached_market_evidence["sources"])
                facts.extend(cached_market_evidence["facts"])
                raw_payloads.update(cached_market_evidence["raw_payloads"])
                self._merge_metrics(metrics, cached_market_evidence["metrics"])
                market_intelligence_cache = self._build_market_intelligence_cache(
                    project,
                    market_metric_snapshot,
                    cached_market_evidence,
                    generated_at,
                )
                notes.append("Reused cached market intelligence to conserve Gemini quota.")
            elif self.market_intelligence_client.api_key:
                try:
                    market_evidence = await self.market_intelligence_client.collect_market_intelligence(
                        project,
                        current_metrics=market_metric_snapshot,
                    )
                    market_intelligence_applied = True
                    market_intelligence_report = self._sanitize_for_storage(market_evidence.get("report"))
                    evidence_sources.extend(market_evidence["sources"])
                    facts.extend(market_evidence["facts"])
                    raw_payloads.update(market_evidence["raw_payloads"])
                    self._merge_metrics(metrics, market_evidence["metrics"])
                    market_intelligence_cache = self._build_market_intelligence_cache(
                        project,
                        market_metric_snapshot,
                        market_evidence,
                        generated_at,
                    )
                except Exception as exc:
                    notes.append(f"Market intelligence enrichment failed: {exc}")

        claim_assessments = self.contradiction_engine.assess(project, facts, generated_at)
        facts.extend(claim_assessments["facts"])
        self._merge_metrics(metrics, claim_assessments["metrics"])

        facts = [self._sanitize_for_storage(fact) for fact in facts]
        evidence_sources = [self._sanitize_for_storage(source) for source in evidence_sources]

        support_summary = self._build_support_summary(facts)
        freshness_summary = self._build_freshness_summary(facts)
        contradiction_flags = self._collect_contradiction_flags(facts)
        self._merge_metrics(
            metrics,
            {
                "evidence_source_count": len(evidence_sources),
                "evidence_fact_count": len(facts),
                "unique_source_url_count": len(
                    {
                        source.get("url")
                        for source in evidence_sources
                        if isinstance(source.get("url"), str) and source.get("url")
                    }
                ),
                "supported_fact_count": float(support_summary.get("supported", 0)),
                "contradicted_fact_count": float(support_summary.get("contradicted", 0)),
                "observed_fact_count": float(support_summary.get("observed", 0)),
            },
        )
        if contradiction_flags:
            self._merge_metrics(metrics, {"risk_flags": ["contradicted_external_claims", *contradiction_flags]})

        bundle = self._build_bundle(facts, evidence_sources, generated_at)

        return {
            "project_name": project_name,
            "generated_at": generated_at,
            "website_scraped": website_scraped,
            "github_scraped": github_scraped,
            "wallet_scraped": wallet_scraped,
            "portfolio_context_applied": portfolio_context_applied,
            "market_intelligence_applied": market_intelligence_applied,
            "metrics": self._sanitize_for_storage(metrics),
            "raw_data": self._sanitize_for_storage(raw_payloads),
            "evidence_sources": evidence_sources,
            "evidence_bundle": bundle,
            "notes": notes,
            "web_targets": web_targets,
            "support_summary": support_summary,
            "freshness_summary": freshness_summary,
            "claim_assessments": self._sanitize_for_storage(claim_assessments["assessments"]),
            "market_intelligence_report": market_intelligence_report,
            "market_intelligence_cache": market_intelligence_cache,
        }

    async def _discover_web_targets(self, website_url: str) -> list[dict[str, Any]]:
        homepage_url = self._normalize_url(website_url)
        domain = self._normalized_domain(homepage_url)
        candidates: dict[str, dict[str, Any]] = {
            homepage_url: {
                "url": homepage_url,
                "discovery_method": "homepage",
                "candidate_score": 100,
            }
        }

        for path in COMMON_TARGET_PATHS:
            target_url = self._normalize_url(urljoin(homepage_url, path or "/"))
            if self._normalized_domain(target_url) != domain:
                continue
            if target_url not in candidates:
                candidates[target_url] = {
                    "url": target_url,
                    "discovery_method": "common_path",
                    "candidate_score": 25,
                }

        html = await self._fetch_html(homepage_url)
        if html:
            for href in HTML_LINK_PATTERN.findall(html):
                normalized = self._normalize_url(urljoin(homepage_url, href))
                if self._normalized_domain(normalized) != domain:
                    continue
                if any(normalized.startswith(prefix) for prefix in ("mailto:", "tel:", "javascript:")):
                    continue
                if normalized not in candidates:
                    candidates[normalized] = {
                        "url": normalized,
                        "discovery_method": "homepage_link",
                        "candidate_score": 40,
                    }
                else:
                    candidates[normalized]["candidate_score"] = max(
                        candidates[normalized]["candidate_score"],
                        40,
                    )

        scored_targets: list[dict[str, Any]] = []
        for candidate in candidates.values():
            role_scores = self._score_target_roles(candidate["url"], homepage_url)
            primary_role = max(role_scores, key=role_scores.get)
            category_hints = [role for role, score in role_scores.items() if score >= 3]
            if not category_hints:
                continue
            scored_targets.append(
                {
                    "url": candidate["url"],
                    "primary_role": primary_role,
                    "category_hints": category_hints,
                    "category_scores": role_scores,
                    "score": max(role_scores.values()) + candidate["candidate_score"],
                    "discovery_method": candidate["discovery_method"],
                }
            )

        selected: dict[str, dict[str, Any]] = {}
        for category in TARGET_CATEGORIES:
            ranked = sorted(
                [
                    target
                    for target in scored_targets
                    if category in target["category_hints"]
                ],
                key=lambda item: (
                    item["category_scores"].get(category, 0),
                    item["score"],
                    1 if item["url"] == homepage_url else 0,
                ),
                reverse=True,
            )
            for target in ranked[:2]:
                existing = selected.get(target["url"])
                if existing is None:
                    selected[target["url"]] = {
                        **target,
                        "category_hints": list(target["category_hints"]),
                    }
                else:
                    existing["category_hints"] = sorted(
                        set(existing["category_hints"]) | set(target["category_hints"])
                    )
                    existing["score"] = max(existing["score"], target["score"])

        ordered = sorted(selected.values(), key=lambda item: (item["score"], item["url"] == homepage_url), reverse=True)
        validated_targets: list[dict[str, Any]] = []
        for target in ordered[:8]:
            if target["url"] == homepage_url:
                validated_targets.append(target)
                continue
            if await self._fetch_html(target["url"]):
                validated_targets.append(target)

        return validated_targets[:8] or ordered[:1]

    def _build_request_specs(
        self,
        project: dict[str, Any],
        web_targets: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        claims = [
            {
                "category": "team",
                "label": "Team credibility and background claims",
                "claim": self._text(project.get("team_background")),
            },
            {
                "category": "product",
                "label": "Product and technical claims",
                "claim": self._join_text(
                    project.get("short_description"),
                    project.get("description"),
                ),
            },
            {
                "category": "market",
                "label": "Market and positioning claims",
                "claim": self._text(project.get("market_summary")),
            },
            {
                "category": "traction",
                "label": "Traction and adoption claims",
                "claim": self._text(project.get("traction_summary")),
            },
        ]

        specs: list[dict[str, Any]] = []
        homepage_target = web_targets[0] if web_targets else None
        for claim in claims:
            if not claim["claim"]:
                continue

            category_targets = [
                target for target in web_targets if claim["category"] in target.get("category_hints", [])
            ]
            if not category_targets and homepage_target:
                category_targets = [homepage_target]

            for target in category_targets[:2]:
                specs.append(
                    {
                        "category": claim["category"],
                        "label": claim["label"],
                        "claim": claim["claim"],
                        "url": target["url"],
                        "page_role": target.get("primary_role"),
                        "discovery_method": target.get("discovery_method"),
                        "target_score": target.get("score", 0),
                    }
                )

        return specs

    async def _resolve_request(self, spec: dict[str, Any], generated_at: str) -> dict[str, Any]:
        payload = {
            "intent": self._build_intent(spec["category"], spec["label"], spec["claim"]),
            "params": {
                "url": spec["url"],
            },
            "context": {
                "url": spec["url"],
                "domain": self._normalized_domain(spec["url"]),
                "page_role": spec.get("page_role"),
            },
        }
        response = await self._post_json("/v1/intent/resolve", payload)
        storage_payload = self._sanitize_for_storage(response)
        observed_at = self._extract_observed_at(response)
        raw_payload_hash = self._hash_json(storage_payload)

        source = {
            "id": self._build_id("source", f"unbrowse|{raw_payload_hash}"),
            "kind": "unbrowse_intent",
            "label": spec["label"],
            "category": spec["category"],
            "url": spec["url"],
            "observed_at": observed_at,
            "invocation_id": self._trace_value(response, "trace_id"),
            "skill_id": self._trace_value(response, "skill_id"),
            "endpoint_id": self._trace_value(response, "endpoint_id"),
            "source": self._text(response.get("source")),
            "raw_payload_hash": raw_payload_hash,
            "metadata": {
                "page_role": spec.get("page_role"),
                "discovery_method": spec.get("discovery_method"),
                "target_score": spec.get("target_score", 0),
            },
        }

        facts = self._normalize_web_facts(spec, response, source, generated_at)
        metrics = self._extract_metrics(response)
        metrics["unbrowse_fact_count"] = float(len(facts))

        return {
            "sources": [source],
            "facts": facts,
            "raw_payloads": {source["id"]: storage_payload},
            "metrics": metrics,
            "resolved_usefully": any(
                self._text(fact.get("support_status")) not in {"", "unverified"}
                for fact in facts
            ),
        }

    async def _collect_github_evidence(self, github_url: str, generated_at: str) -> dict[str, Any]:
        enrichment = await self.github_client.collect_repository_enrichment(github_url)
        summary = enrichment["summary"]
        metrics = dict(enrichment["metrics"])
        raw_payloads: dict[str, Any] = {}
        sources: list[dict[str, Any]] = []

        for api_call in enrichment["api_calls"]:
            payload = self._sanitize_for_storage(api_call["payload"])
            raw_payload_hash = self._hash_json(payload)
            source = {
                "id": self._build_id("source", f"github|{api_call['request_signature']}|{raw_payload_hash}"),
                "kind": "github_api",
                "label": api_call["label"],
                "url": github_url,
                "endpoint": api_call["endpoint"],
                "method": api_call["method"],
                "request_signature": api_call["request_signature"],
                "observed_at": api_call["observed_at"],
                "raw_payload_hash": raw_payload_hash,
                "metadata": {
                    "repository": summary["repository"]["full_name"],
                },
            }
            sources.append(source)
            raw_payloads[source["id"]] = payload

        repo_summary = summary["repository"]
        contradiction_flags = list(metrics.get("risk_flags") or [])
        product_status = "mixed" if contradiction_flags else "observed"
        facts = [
            self._make_fact(
                category="team",
                key="github_repo_contributors",
                claim="Repository contributor count from GitHub API.",
                value=int(metrics.get("repo_contributors", 0)),
                observed_at=self._now_iso(),
                sources=sources,
                confidence=1.0,
                support_status="observed",
                contradiction_flags=[],
                freshness_days=0,
            ),
            self._make_fact(
                category="product",
                key="github_repository_profile",
                claim="Repository metadata describing the product codebase.",
                value=repo_summary,
                observed_at=self._now_iso(),
                sources=sources,
                confidence=1.0,
                support_status=product_status,
                contradiction_flags=contradiction_flags,
                freshness_days=self._days_between(generated_at, repo_summary.get("pushed_at")) or 0,
            ),
            self._make_fact(
                category="product",
                key="github_docs_quality_score",
                claim="Documentation quality proxy derived from README, homepage, topics, and releases.",
                value=metrics.get("docs_quality_score", 0),
                observed_at=self._now_iso(),
                sources=sources,
                confidence=1.0,
                support_status="observed",
                contradiction_flags=[],
                freshness_days=0,
            ),
            self._make_fact(
                category="product",
                key="github_product_readiness_score",
                claim="Product readiness proxy derived from repository activity and release hygiene.",
                value=metrics.get("product_readiness_score", 0),
                observed_at=self._now_iso(),
                sources=sources,
                confidence=1.0,
                support_status=product_status,
                contradiction_flags=contradiction_flags,
                freshness_days=self._days_between(generated_at, repo_summary.get("pushed_at")) or 0,
            ),
            self._make_fact(
                category="traction",
                key="github_stars",
                claim="GitHub star count as a public adoption signal.",
                value=int(metrics.get("github_stars", 0)),
                observed_at=self._now_iso(),
                sources=sources,
                confidence=1.0,
                support_status="observed",
                contradiction_flags=[],
                freshness_days=0,
            ),
            self._make_fact(
                category="traction",
                key="github_commits_90d",
                claim="Commit count over the GitHub lookback window.",
                value=int(metrics.get("github_commits_90d", 0)),
                observed_at=self._now_iso(),
                sources=sources,
                confidence=1.0,
                support_status="observed",
                contradiction_flags=[],
                freshness_days=0,
            ),
            self._make_fact(
                category="traction",
                key="github_release_count",
                claim="Release count from GitHub releases.",
                value=int(metrics.get("github_release_count", 0)),
                observed_at=self._now_iso(),
                sources=sources,
                confidence=1.0,
                support_status="observed",
                contradiction_flags=[],
                freshness_days=self._days_between(generated_at, repo_summary.get("latest_release_at")),
            ),
        ]

        return {
            "sources": sources,
            "facts": facts,
            "raw_payloads": raw_payloads,
            "metrics": metrics,
            "notes": list(summary.get("notes") or []),
        }

    async def _collect_wallet_evidence(self, recipient_wallet: str, generated_at: str) -> dict[str, Any]:
        wallet_enrichment = await self.solana_client.collect_wallet_enrichment(recipient_wallet)
        summary = wallet_enrichment["summary"]
        derived_signals = wallet_enrichment["derived_signals"]
        indexed_analytics = wallet_enrichment.get("indexed_analytics", {})
        rpc_calls = wallet_enrichment["rpc_calls"]
        observed_at = summary["requested_at"]

        sources: list[dict[str, Any]] = []
        raw_payloads: dict[str, Any] = {}
        for rpc_call in rpc_calls:
            payload = self._sanitize_for_storage(rpc_call["response"])
            raw_payload_hash = self._hash_json(payload)
            source = {
                "id": self._build_id("source", f"{rpc_call['request_signature']}|{raw_payload_hash}"),
                "kind": "solana_rpc",
                "label": rpc_call["label"],
                "category": "wallet",
                "endpoint": self.solana_client.rpc_url,
                "method": rpc_call["method"],
                "request_signature": rpc_call["request_signature"],
                "observed_at": rpc_call["observed_at"],
                "raw_payload_hash": raw_payload_hash,
                "metadata": {
                    "wallet": recipient_wallet,
                    "commitment": summary["commitment"],
                    "analytics_provider": wallet_enrichment.get("provider"),
                },
            }
            sources.append(source)
            raw_payloads[source["id"]] = payload

        facts = [
            self._make_fact(
                category="wallet",
                key="sol_balance_lamports",
                claim="Wallet SOL balance in lamports.",
                value=summary["solBalanceLamports"],
                observed_at=observed_at,
                sources=sources,
                confidence=1.0,
                support_status="observed",
                contradiction_flags=[],
                freshness_days=0,
            ),
            self._make_fact(
                category="wallet",
                key="token_accounts",
                claim="Wallet SPL token account holdings.",
                value=summary["tokenAccounts"],
                observed_at=observed_at,
                sources=sources,
                confidence=1.0,
                support_status="observed",
                contradiction_flags=[],
                freshness_days=0,
            ),
            self._make_fact(
                category="wallet",
                key="recent_signatures",
                claim="Recent wallet signatures from the Solana RPC view.",
                value=summary["recentSignatures"],
                observed_at=observed_at,
                sources=sources,
                confidence=1.0,
                support_status="observed",
                contradiction_flags=[],
                freshness_days=0,
            ),
            self._make_fact(
                category="wallet",
                key="wallet_age_estimate",
                claim="Estimated wallet age derived from the oldest recent signature in scope.",
                value=derived_signals["walletAgeEstimate"],
                observed_at=observed_at,
                sources=sources,
                confidence=1.0,
                support_status="observed",
                contradiction_flags=[],
                freshness_days=self._days_between(generated_at, derived_signals["walletAgeEstimate"].get("earliest_observed_at")),
            ),
            self._make_fact(
                category="wallet",
                key="activity_level",
                claim="Derived wallet activity level from recent signatures.",
                value=derived_signals["activityLevel"],
                observed_at=observed_at,
                sources=sources,
                confidence=1.0,
                support_status="observed",
                contradiction_flags=[],
                freshness_days=0,
            ),
            self._make_fact(
                category="wallet",
                key="holdings_count",
                claim="Count of token holdings with a positive balance.",
                value=derived_signals["holdingsCount"],
                observed_at=observed_at,
                sources=sources,
                confidence=1.0,
                support_status="observed",
                contradiction_flags=[],
                freshness_days=0,
            ),
            self._make_fact(
                category="wallet",
                key="indexed_analytics",
                claim="Indexed analytics derived from recent Solana transaction history.",
                value=indexed_analytics,
                observed_at=observed_at,
                sources=sources,
                confidence=1.0,
                support_status="observed",
                contradiction_flags=[],
                freshness_days=self._days_between(generated_at, indexed_analytics.get("earliest_transaction_at")),
            ),
            self._make_fact(
                category="wallet",
                key="transactions_30d",
                claim="Wallet transactions observed in the last 30 days.",
                value=indexed_analytics.get("transactions_30d", 0),
                observed_at=observed_at,
                sources=sources,
                confidence=1.0,
                support_status="observed",
                contradiction_flags=[],
                freshness_days=0,
            ),
            self._make_fact(
                category="wallet",
                key="unique_program_count",
                claim="Distinct Solana programs observed in wallet transaction history.",
                value=indexed_analytics.get("unique_program_count", 0),
                observed_at=observed_at,
                sources=sources,
                confidence=1.0,
                support_status="observed",
                contradiction_flags=[],
                freshness_days=0,
            ),
            self._make_fact(
                category="wallet",
                key="unique_counterparty_count",
                claim="Distinct counterparties inferred from wallet transaction history.",
                value=indexed_analytics.get("unique_counterparty_count", 0),
                observed_at=observed_at,
                sources=sources,
                confidence=1.0,
                support_status="observed",
                contradiction_flags=[],
                freshness_days=0,
            ),
            self._make_fact(
                category="wallet",
                key="sol_transfer_flow",
                claim="SOL transfer flow observed across indexed transaction history.",
                value={
                    "in_lamports": indexed_analytics.get("sol_transfer_in_lamports", 0),
                    "out_lamports": indexed_analytics.get("sol_transfer_out_lamports", 0),
                },
                observed_at=observed_at,
                sources=sources,
                confidence=1.0,
                support_status="observed",
                contradiction_flags=[],
                freshness_days=0,
            ),
        ]

        return {
            "sources": sources,
            "facts": facts,
            "raw_payloads": raw_payloads,
            "metrics": {
                "wallet_sol_balance_lamports": summary["solBalanceLamports"],
                "wallet_holdings_count": derived_signals["holdingsCount"],
                "wallet_recent_signature_count": len(summary["recentSignatures"]),
                "wallet_age_lookback_days": self._to_float(derived_signals["walletAgeEstimate"].get("lookback_days")),
                "wallet_activity_level_score": self._activity_level_score(derived_signals["activityLevel"]),
                "wallet_transactions_analyzed": self._to_float(indexed_analytics.get("transactions_analyzed")),
                "wallet_transactions_30d": self._to_float(indexed_analytics.get("transactions_30d")),
                "wallet_transactions_90d": self._to_float(indexed_analytics.get("transactions_90d")),
                "wallet_unique_program_count": self._to_float(indexed_analytics.get("unique_program_count")),
                "wallet_unique_counterparty_count": self._to_float(
                    indexed_analytics.get("unique_counterparty_count")
                ),
                "wallet_failed_transaction_rate": self._to_float(indexed_analytics.get("failed_transaction_rate")),
                "wallet_sol_transfer_in_lamports": self._to_float(indexed_analytics.get("sol_transfer_in_lamports")),
                "wallet_sol_transfer_out_lamports": self._to_float(indexed_analytics.get("sol_transfer_out_lamports")),
                "wallet_spl_transfer_count": self._to_float(indexed_analytics.get("spl_transfer_count")),
            },
        }

    def _collect_portfolio_context(
        self,
        project: dict[str, Any],
        portfolio_projects: list[dict[str, Any]],
        generated_at: str,
    ) -> dict[str, Any]:
        observed_at = self._now_iso()
        proposal_domain = self._normalized_domain(self._text(project.get("website_url")))
        proposal_wallet = self._text(project.get("recipient_wallet"))
        proposal_github = self._normalize_github_repo_url(self._text(project.get("github_url")))
        proposal_tokens = self._text_tokens(
            self._join_text(
                project.get("short_description"),
                project.get("description"),
                project.get("market_summary"),
                project.get("traction_summary"),
            )
        )

        same_category = []
        same_stage = []
        same_domain = []
        same_wallet = []
        same_github = []
        keyword_overlaps: list[dict[str, Any]] = []

        for portfolio in portfolio_projects:
            if self._text(portfolio.get("category")) and portfolio.get("category") == project.get("category"):
                same_category.append(portfolio)
            if self._text(portfolio.get("stage")) and portfolio.get("stage") == project.get("stage"):
                same_stage.append(portfolio)

            portfolio_domain = self._normalized_domain(self._text(portfolio.get("website_url")))
            if proposal_domain and portfolio_domain and proposal_domain == portfolio_domain:
                same_domain.append(portfolio)

            portfolio_wallet = self._text(portfolio.get("recipient_wallet"))
            if proposal_wallet and portfolio_wallet and proposal_wallet == portfolio_wallet:
                same_wallet.append(portfolio)

            portfolio_github = self._normalize_github_repo_url(self._text(portfolio.get("github_url")))
            if proposal_github and portfolio_github and proposal_github == portfolio_github:
                same_github.append(portfolio)

            portfolio_tokens = self._text_tokens(
                self._join_text(
                    portfolio.get("short_description"),
                    portfolio.get("description"),
                    portfolio.get("market_summary"),
                    portfolio.get("traction_summary"),
                )
            )
            overlap = sorted(proposal_tokens & portfolio_tokens)
            if len(overlap) >= 3:
                keyword_overlaps.append(
                    {
                        "project_id": str(portfolio.get("id") or portfolio.get("_id") or ""),
                        "name": self._text(portfolio.get("name")) or "Unknown project",
                        "overlap_count": len(overlap),
                        "keywords": overlap[:8],
                    }
                )

        keyword_overlaps.sort(key=lambda item: (item["overlap_count"], item["name"]), reverse=True)
        overlap_projects = self._dedupe_overlap_projects(
            same_category,
            same_stage,
            same_domain,
            same_wallet,
            same_github,
            keyword_overlaps,
        )

        contradiction_flags: list[str] = []
        if same_wallet:
            contradiction_flags.append("shared_recipient_wallet")
        if same_domain:
            contradiction_flags.append("shared_website_domain")
        if same_github:
            contradiction_flags.append("shared_github_repository")

        payload = {
            "proposal": {
                "category": project.get("category"),
                "stage": project.get("stage"),
                "website_domain": proposal_domain,
                "recipient_wallet": proposal_wallet or None,
                "github_repository": proposal_github or None,
            },
            "overlap_summary": {
                "same_category_count": len(same_category),
                "same_stage_count": len(same_stage),
                "same_domain_count": len(same_domain),
                "same_wallet_count": len(same_wallet),
                "same_github_count": len(same_github),
                "keyword_overlap_count": len(keyword_overlaps),
                "overlap_projects": overlap_projects,
            },
        }
        raw_payload_hash = self._hash_json(payload)
        source = {
            "id": self._build_id("source", f"portfolio|{raw_payload_hash}"),
            "kind": "portfolio_context",
            "label": "Internal portfolio context",
            "endpoint": "internal-db",
            "method": "SNAPSHOT",
            "request_signature": "portfolio_context_snapshot",
            "observed_at": observed_at,
            "raw_payload_hash": raw_payload_hash,
            "metadata": {
                "roster_size": len(portfolio_projects),
            },
        }

        facts = [
            self._make_fact(
                category="portfolio_context",
                key="portfolio_total_projects",
                claim="Current internal portfolio size.",
                value=len(portfolio_projects),
                observed_at=observed_at,
                sources=[source],
                confidence=1.0,
                support_status="observed",
                contradiction_flags=[],
                freshness_days=0,
            ),
            self._make_fact(
                category="portfolio_context",
                key="portfolio_same_category_count",
                claim="Count of portfolio projects in the same category.",
                value=len(same_category),
                observed_at=observed_at,
                sources=[source],
                confidence=1.0,
                support_status="observed",
                contradiction_flags=[],
                freshness_days=0,
            ),
            self._make_fact(
                category="portfolio_context",
                key="portfolio_same_stage_count",
                claim="Count of portfolio projects at the same stage.",
                value=len(same_stage),
                observed_at=observed_at,
                sources=[source],
                confidence=1.0,
                support_status="observed",
                contradiction_flags=[],
                freshness_days=0,
            ),
            self._make_fact(
                category="portfolio_context",
                key="portfolio_overlap_projects",
                claim="Projects overlapping on category, stage, domain, wallet, GitHub repository, or keywords.",
                value=overlap_projects,
                observed_at=observed_at,
                sources=[source],
                confidence=1.0,
                support_status="observed",
                contradiction_flags=contradiction_flags,
                freshness_days=0,
            ),
        ]

        return {
            "sources": [source],
            "facts": facts,
            "raw_payloads": {source["id"]: payload},
            "metrics": {
                "portfolio_total_projects": len(portfolio_projects),
                "portfolio_same_category_count": len(same_category),
                "portfolio_same_stage_count": len(same_stage),
                "portfolio_same_domain_count": len(same_domain),
                "portfolio_same_wallet_count": len(same_wallet),
                "portfolio_same_github_count": len(same_github),
                "portfolio_keyword_overlap_count": len(keyword_overlaps),
                "risk_flags": contradiction_flags,
            },
        }

    async def _search_domain(self, domain: str, query: str) -> dict[str, Any]:
        payload = {
            "domain": domain,
            "intent": query,
            "k": 5,
        }
        try:
            return await self._post_json("/v1/search/domain", payload)
        except Exception:
            return await self._post_json(
                "/v1/search",
                {
                    "intent": query,
                    "k": 5,
                },
            )

    async def _post_json(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        headers = {"Content-Type": "application/json"}
        if self.unbrowse_api_key:
            headers["Authorization"] = f"Bearer {self.unbrowse_api_key}"

        timeout = httpx.Timeout(self._timeout_for_path(path))
        url = f"{self.base_url}{path}"
        last_error: Exception | None = None

        for attempt in range(self.max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    response = await client.post(url, json=payload, headers=headers)
                    response.raise_for_status()
                    body = response.json()
                    if not isinstance(body, dict):
                        raise RuntimeError(f"Unexpected response type from {path}")
                    return body
            except httpx.HTTPStatusError as exc:
                response_text = exc.response.text[:200].strip()
                last_error = RuntimeError(
                    f"HTTP {exc.response.status_code} from {path}: {response_text or exc}"
                )
                if attempt >= self.max_retries:
                    break
                await asyncio.sleep(0.5 * (2**attempt))
            except (httpx.HTTPError, ValueError, RuntimeError) as exc:
                last_error = exc
                if attempt >= self.max_retries:
                    break
                await asyncio.sleep(0.5 * (2**attempt))

        raise RuntimeError(f"Unbrowse request failed for {path}: {last_error}")

    def _timeout_for_path(self, path: str) -> float:
        if path == "/v1/intent/resolve":
            return self.unbrowse_resolve_timeout_seconds
        if path in {"/v1/search/domain", "/v1/search"}:
            return self.unbrowse_search_timeout_seconds
        return self.timeout_seconds

    async def _fetch_html(self, url: str) -> str:
        timeout = httpx.Timeout(min(self.timeout_seconds, 10.0))
        headers = {"User-Agent": "AutoVC-Diligence-Agent"}
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                response = await client.get(url, headers=headers)
                response.raise_for_status()
                content_type = response.headers.get("content-type", "")
                if "text/html" not in content_type and "application/xhtml+xml" not in content_type:
                    return ""
                return response.text[:250_000]
        except httpx.HTTPError:
            return ""

    def _normalize_web_facts(
        self,
        spec: dict[str, Any],
        payload: dict[str, Any],
        source: dict[str, Any],
        generated_at: str,
    ) -> list[dict[str, Any]]:
        result = payload.get("result")
        observed_at = source["observed_at"]
        invocation_ids = [source["invocation_id"]] if source.get("invocation_id") else []
        extracted_items = self._extract_fact_items(result)
        facts: list[dict[str, Any]] = []

        if not extracted_items:
            facts.append(
                self._make_fact(
                    category=spec["category"],
                    key=f"{spec['category']}_corroboration",
                    claim=spec["claim"],
                    value=self._sanitize_for_storage(result),
                    observed_at=observed_at,
                    sources=[source],
                    confidence=self._extract_confidence(payload),
                    support_status="unverified",
                    contradiction_flags=[],
                    freshness_days=self._days_between(generated_at, observed_at),
                    urls=[spec["url"]],
                    invocation_ids=invocation_ids,
                )
            )
            return facts

        for index, item in enumerate(extracted_items, start=1):
            item_dict = item if isinstance(item, dict) else {}
            if not self._should_keep_web_fact(spec["claim"], item_dict):
                continue
            claim = (
                self._text(item_dict.get("claim"))
                or self._text(item_dict.get("statement"))
                or self._text(item_dict.get("title"))
                or self._text(item_dict.get("description"))
                or self._text(item_dict.get("definition"))
                or spec["claim"]
            )
            key = self._slug(
                self._text(item_dict.get("key"))
                or self._text(item_dict.get("title"))
                or f"{spec['category']}_fact_{index}"
            )
            support_status = self._support_status(item_dict)
            contradiction_flags = self._contradiction_flags(item_dict, support_status)
            fact_observed_at = self._extract_item_timestamp(item_dict) or observed_at
            supporting_urls = self._extract_supporting_urls(item_dict, spec["url"])
            confidence = self._normalize_confidence(item_dict.get("confidence"), self._extract_confidence(payload))

            facts.append(
                self._make_fact(
                    category=spec["category"],
                    key=key,
                    claim=claim,
                    value=self._sanitize_for_storage(item),
                    observed_at=fact_observed_at,
                    sources=[source],
                    confidence=confidence,
                    support_status=support_status,
                    contradiction_flags=contradiction_flags,
                    freshness_days=self._days_between(generated_at, fact_observed_at),
                    urls=supporting_urls,
                    invocation_ids=invocation_ids,
                )
            )

        return facts

    def _should_keep_web_fact(self, claim_text: str, item: dict[str, Any]) -> bool:
        if self._text(item.get("claim")) or self._text(item.get("statement")):
            return True

        candidate_text = self._join_text(
            item.get("title"),
            item.get("description"),
            item.get("definition"),
            item.get("text"),
        )
        if not candidate_text:
            return True

        claim_tokens = self._text_tokens(claim_text)
        candidate_tokens = self._text_tokens(candidate_text)
        if claim_tokens & candidate_tokens:
            return True

        normalized = candidate_text.lower()
        low_signal_phrases = (
            "save the date",
            "start deploying",
            "contact sales",
            "join us",
            "coming to",
        )
        if any(phrase in normalized for phrase in low_signal_phrases):
            return False

        return len(candidate_tokens) >= 4

    def _make_fact(
        self,
        category: str,
        key: str,
        claim: str,
        value: Any,
        observed_at: str,
        sources: list[dict[str, Any]],
        confidence: float,
        support_status: str,
        contradiction_flags: list[str],
        freshness_days: int | None,
        urls: list[str] | None = None,
        invocation_ids: list[str] | None = None,
        request_signatures: list[str] | None = None,
    ) -> dict[str, Any]:
        return {
            "id": self._build_id("fact", f"{category}|{key}|{self._hash_json(value)}"),
            "category": category,
            "key": key,
            "claim": claim,
            "value": self._sanitize_for_storage(value),
            "confidence": round(max(0.0, min(1.0, confidence)), 4),
            "observed_at": observed_at,
            "support_status": support_status,
            "freshness_days": freshness_days,
            "contradiction_flags": sorted(set(contradiction_flags)),
            "provenance": {
                "source_ids": [source["id"] for source in sources],
                "urls": urls or [
                    source["url"]
                    for source in sources
                    if isinstance(source.get("url"), str) and source.get("url")
                ],
                "invocation_ids": invocation_ids or [
                    source["invocation_id"]
                    for source in sources
                    if isinstance(source.get("invocation_id"), str) and source.get("invocation_id")
                ],
                "request_signatures": request_signatures or [
                    source["request_signature"]
                    for source in sources
                    if isinstance(source.get("request_signature"), str) and source.get("request_signature")
                ],
            },
        }

    def _build_bundle(
        self,
        facts: list[dict[str, Any]],
        sources: list[dict[str, Any]],
        generated_at: str,
    ) -> dict[str, Any]:
        category_scores: dict[str, list[float]] = {}
        for fact in facts:
            category = self._text(fact.get("category")) or "other"
            category_scores.setdefault(category, []).append(self._to_float(fact.get("confidence"), 0.5))

        confidence_by_category = {
            category: round(sum(values) / len(values), 4)
            for category, values in category_scores.items()
            if values
        }
        overall_confidence = round(
            sum(confidence_by_category.values()) / len(confidence_by_category) if confidence_by_category else 0.0,
            4,
        )

        payload = {
            "facts": facts,
            "sources": sources,
            "timestamps": {
                "generated_at": generated_at,
                "source_observed_at": sorted(
                    {source.get("observed_at") for source in sources if source.get("observed_at")}
                ),
            },
            "confidence": {
                "overall": overall_confidence,
                "by_category": confidence_by_category,
            },
            "support_summary": self._build_support_summary(facts),
            "freshness_summary": self._build_freshness_summary(facts),
            "contradiction_flags": self._collect_contradiction_flags(facts),
        }
        payload["raw_payload_hash"] = self._hash_json(payload)
        return payload

    def _build_search_source(
        self,
        kind: str,
        label: str,
        url: str,
        payload: dict[str, Any],
        observed_at: str,
    ) -> dict[str, Any]:
        raw_payload_hash = self._hash_json(payload)
        return {
            "id": self._build_id("source", f"{kind}|{raw_payload_hash}"),
            "kind": kind,
            "label": label,
            "url": url,
            "observed_at": observed_at,
            "raw_payload_hash": raw_payload_hash,
        }

    def _extract_search_results(self, payload: dict[str, Any]) -> list[Any]:
        for key in ("results", "data"):
            value = payload.get(key)
            if isinstance(value, list):
                return value
        return []

    def _extract_metrics(self, payload: dict[str, Any]) -> dict[str, Any]:
        numeric_values = self._collect_numeric_values(payload.get("result"))
        metrics: dict[str, Any] = {}
        for path, value in numeric_values:
            normalized = path.lower()
            if "contributor" in normalized:
                metrics["repo_contributors"] = max(self._to_float(metrics.get("repo_contributors")), value)
            if "commit" in normalized:
                metrics["github_commits_90d"] = max(self._to_float(metrics.get("github_commits_90d")), value)
            if "deploy" in normalized or "release" in normalized:
                metrics["deployments_count"] = max(self._to_float(metrics.get("deployments_count")), value)
            if "customer" in normalized:
                metrics["customers"] = max(self._to_float(metrics.get("customers")), value)
            if "active_user" in normalized or "monthly_active" in normalized or normalized.endswith(".users"):
                metrics["active_users"] = max(self._to_float(metrics.get("active_users")), value)
            if "tam" in normalized or "market_size" in normalized:
                metrics["tam_usd"] = max(self._to_float(metrics.get("tam_usd")), value)
            if "growth" in normalized and "rate" in normalized:
                metrics["market_growth_pct"] = max(self._to_float(metrics.get("market_growth_pct")), value)
            if "revenue" in normalized or normalized.endswith(".mrr"):
                metrics["monthly_revenue_usd"] = max(self._to_float(metrics.get("monthly_revenue_usd")), value)
            if "tvl" in normalized:
                metrics["tvl_usd"] = max(self._to_float(metrics.get("tvl_usd")), value)
            if "volume" in normalized:
                metrics["onchain_volume_usd"] = max(self._to_float(metrics.get("onchain_volume_usd")), value)
        return metrics

    def _collect_numeric_values(self, value: Any, prefix: str = "") -> list[tuple[str, float]]:
        values: list[tuple[str, float]] = []
        if isinstance(value, dict):
            for key, inner in value.items():
                path = f"{prefix}.{key}" if prefix else str(key)
                values.extend(self._collect_numeric_values(inner, path))
            return values
        if isinstance(value, list):
            for index, inner in enumerate(value[:40]):
                path = f"{prefix}[{index}]"
                values.extend(self._collect_numeric_values(inner, path))
            return values
        numeric = self._parse_numeric(value)
        if numeric is not None:
            values.append((prefix, numeric))
        return values

    def _parse_numeric(self, value: Any) -> float | None:
        if isinstance(value, bool) or value is None:
            return None
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            cleaned = value.replace(",", "").replace("$", "").replace("%", "").strip()
            if cleaned.count(".") > 1:
                return None
            try:
                return float(cleaned)
            except ValueError:
                return None
        return None

    def _build_support_summary(self, facts: list[dict[str, Any]]) -> dict[str, int]:
        summary: dict[str, int] = {}
        for fact in facts:
            status = self._text(fact.get("support_status")) or "unverified"
            summary[status] = summary.get(status, 0) + 1
        return summary

    def _build_freshness_summary(self, facts: list[dict[str, Any]]) -> dict[str, Any]:
        freshness_values = [
            int(fact["freshness_days"])
            for fact in facts
            if isinstance(fact.get("freshness_days"), int)
        ]
        if not freshness_values:
            return {"min_days": None, "max_days": None, "stale_fact_count": 0}
        return {
            "min_days": min(freshness_values),
            "max_days": max(freshness_values),
            "stale_fact_count": sum(1 for value in freshness_values if value > 180),
        }

    def _collect_contradiction_flags(self, facts: list[dict[str, Any]]) -> list[str]:
        flags: set[str] = set()
        for fact in facts:
            contradiction_flags = fact.get("contradiction_flags")
            if isinstance(contradiction_flags, list):
                flags.update(self._text(item) for item in contradiction_flags if self._text(item))
        return sorted(flags)

    def _merge_metrics(self, metrics: dict[str, Any], update: dict[str, Any]) -> None:
        for key, value in update.items():
            if value is None:
                continue
            if isinstance(value, (int, float)):
                metrics[key] = max(self._to_float(metrics.get(key)), float(value))
            elif isinstance(value, list):
                existing = metrics.get(key)
                existing_list = existing if isinstance(existing, list) else []
                metrics[key] = sorted(
                    {
                        str(self._sanitize_for_storage(item))
                        for item in [*existing_list, *value]
                        if item is not None and self._sanitize_for_storage(item) != ""
                    }
                )
            elif isinstance(value, dict):
                existing = metrics.get(key)
                merged = existing.copy() if isinstance(existing, dict) else {}
                for inner_key, inner_value in value.items():
                    merged[inner_key] = inner_value
                metrics[key] = merged
            else:
                metrics[key] = value

    def _support_status(self, item: dict[str, Any]) -> str:
        supported = item.get("supported")
        if supported is True:
            return "supported"
        if supported is False:
            return "contradicted"

        explicit = self._text(item.get("support_status") or item.get("status"))
        explicit_normalized = explicit.lower().replace(" ", "_")
        if explicit_normalized in {"supported", "contradicted", "mixed", "unverified", "observed"}:
            return explicit_normalized
        if self._looks_like_observed_fact(item):
            return "observed"
        return "unverified"

    def _contradiction_flags(self, item: dict[str, Any], support_status: str) -> list[str]:
        flags: list[str] = []
        if support_status == "contradicted":
            flags.append("claim_not_supported")

        for key in ("contradiction_flags", "flags"):
            value = item.get(key)
            if isinstance(value, list):
                flags.extend(self._text(entry) for entry in value if self._text(entry))

        for key in ("contradiction", "conflict", "unsupported_reason"):
            value = self._text(item.get(key))
            if value:
                flags.append(self._slug(value)[:80])

        return sorted(set(flag for flag in flags if flag))

    def _extract_item_timestamp(self, item: dict[str, Any]) -> str | None:
        for key in ("observed_at", "as_of", "updated_at", "published_at", "date", "timestamp"):
            value = self._text(item.get(key))
            parsed = self._parse_datetime(value)
            if parsed is not None:
                return parsed.isoformat()
        return None

    def _extract_supporting_urls(self, item: dict[str, Any], default_url: str) -> list[str]:
        urls: list[str] = []
        for key in ("supporting_urls", "urls"):
            value = item.get(key)
            if isinstance(value, list):
                urls.extend(
                    self._normalize_related_url(self._text(entry), default_url)
                    for entry in value
                    if self._text(entry)
                )
        for key in ("url", "link", "href"):
            source_url = self._text(item.get(key))
            if source_url:
                urls.append(self._normalize_related_url(source_url, default_url))
        urls.append(default_url)
        return sorted({url for url in urls if url})

    def _extract_fact_items(self, result: Any) -> list[Any]:
        if isinstance(result, list):
            flattened: list[Any] = []
            for item in result:
                flattened.extend(self._flatten_fact_candidates(item))
            return flattened[:40]
        if not isinstance(result, dict):
            return []
        for key in ("facts", "claims", "items", "results"):
            candidate = result.get(key)
            if isinstance(candidate, list):
                flattened: list[Any] = []
                for item in candidate:
                    flattened.extend(self._flatten_fact_candidates(item))
                return flattened[:40]
        return []

    def _flatten_fact_candidates(self, item: Any) -> list[Any]:
        if isinstance(item, dict):
            for key in ("facts", "claims", "items", "results", "data"):
                candidate = item.get(key)
                if isinstance(candidate, list):
                    flattened: list[Any] = []
                    for nested in candidate:
                        flattened.extend(self._flatten_fact_candidates(nested))
                    if flattened:
                        return flattened
        return [item]

    def _extract_observed_at(self, payload: dict[str, Any]) -> str:
        trace = payload.get("trace")
        if isinstance(trace, dict):
            for key in ("completed_at", "started_at"):
                value = self._text(trace.get(key))
                parsed = self._parse_datetime(value)
                if parsed is not None:
                    return parsed.isoformat()
        return self._now_iso()

    def _extract_confidence(self, payload: dict[str, Any]) -> float:
        trace = payload.get("trace")
        if isinstance(trace, dict):
            trace_result = trace.get("result")
            if isinstance(trace_result, dict):
                extraction = trace_result.get("_extraction")
                if isinstance(extraction, dict):
                    return self._normalize_confidence(extraction.get("confidence"), 0.5)
        return 0.5

    def _normalize_confidence(self, value: Any, default: float = 0.0) -> float:
        confidence = self._to_float(value, default)
        if confidence > 1:
            confidence /= 100.0
        return max(0.0, min(1.0, confidence))

    def _looks_like_observed_fact(self, item: dict[str, Any]) -> bool:
        return any(
            self._text(item.get(key))
            for key in ("title", "description", "definition", "text", "content")
        )

    def _trace_value(self, payload: dict[str, Any], key: str) -> str | None:
        trace = payload.get("trace")
        if isinstance(trace, dict):
            value = self._text(trace.get(key))
            if value:
                return value
        return None

    def _build_intent(self, category: str, label: str, claim: str) -> str:
        category_guidance = {
            "team": "Prefer team, founder, leadership, company, and careers pages.",
            "product": "Prefer product, platform, docs, API, and security pages.",
            "market": "Prefer pricing, customers, solutions, compare, and positioning pages.",
            "traction": "Prefer customers, case studies, changelog, blog, release, and usage evidence.",
        }.get(category, "Prefer stable page content that directly addresses the claim.")
        return (
            f"Corroborate {label}. Return structured facts only in JSON-friendly form. "
            f"Each fact should include key, claim, supported, evidence, supporting_urls, contradiction_flags, and confidence. "
            f"Focus on directly observable page evidence relevant to the {category} category. "
            f"{category_guidance} "
            f"Ignore navigation, event banners, cookie notices, marketing promos, and generic CTAs. "
            f"If the page lacks relevant evidence, return an empty facts list instead of unrelated snippets. "
            f"Claim text: {claim}"
        )

    def _score_target_roles(self, url: str, homepage_url: str) -> dict[str, int]:
        parsed = urlparse(url)
        path = parsed.path.lower().strip("/") or "home"
        scores = {category: 0 for category in TARGET_CATEGORIES}

        if url == homepage_url:
            scores["product"] += 8
            scores["market"] += 5
            scores["traction"] += 5
            scores["team"] += 3

        keywords = path.replace("-", "/").replace("_", "/").split("/")
        for keyword in keywords:
            if keyword in {"about", "company", "team", "founders", "careers", "leadership"}:
                scores["team"] += 5
            if keyword in {"product", "platform", "features", "docs", "documentation", "developers", "api", "security"}:
                scores["product"] += 5
            if keyword in {"pricing", "solutions", "customers", "industries", "compare"}:
                scores["market"] += 5
            if keyword in {"customers", "case", "studies", "blog", "news", "press", "changelog", "updates"}:
                scores["traction"] += 4
            if keyword == "pricing":
                scores["traction"] += 3

        return scores

    def _activity_level_score(self, activity_level: str) -> float:
        return {
            "none": 0.0,
            "low": 30.0,
            "medium": 65.0,
            "high": 90.0,
        }.get(activity_level, 0.0)

    def _dedupe_overlap_projects(
        self,
        same_category: list[dict[str, Any]],
        same_stage: list[dict[str, Any]],
        same_domain: list[dict[str, Any]],
        same_wallet: list[dict[str, Any]],
        same_github: list[dict[str, Any]],
        keyword_overlaps: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        combined: dict[str, dict[str, Any]] = {}
        for group_name, projects in (
            ("same_category", same_category),
            ("same_stage", same_stage),
            ("same_domain", same_domain),
            ("same_wallet", same_wallet),
            ("same_github", same_github),
        ):
            for project in projects:
                identifier = str(project.get("id") or project.get("_id") or "")
                if not identifier:
                    continue
                entry = combined.setdefault(
                    identifier,
                    {
                        "project_id": identifier,
                        "name": self._text(project.get("name")) or "Unknown project",
                        "overlap_types": [],
                    },
                )
                entry["overlap_types"] = sorted(set(entry["overlap_types"] + [group_name]))

        for overlap in keyword_overlaps[:5]:
            identifier = overlap["project_id"]
            entry = combined.setdefault(
                identifier,
                {
                    "project_id": identifier,
                    "name": overlap["name"],
                    "overlap_types": [],
                },
            )
            entry["overlap_types"] = sorted(set(entry["overlap_types"] + ["keyword_overlap"]))
            entry["keyword_overlap_count"] = overlap["overlap_count"]
            entry["keywords"] = overlap["keywords"]

        return sorted(combined.values(), key=lambda item: (len(item["overlap_types"]), item["name"]), reverse=True)[:8]

    def _text_tokens(self, value: str) -> set[str]:
        return {
            token
            for token in re.findall(r"[a-z0-9]{4,}", value.lower())
            if token not in STOP_WORDS
        }

    def _get_cached_market_intelligence(
        self,
        project: dict[str, Any],
        current_metrics: dict[str, Any],
        generated_at: str,
    ) -> dict[str, Any] | None:
        enriched = project.get("enriched_data")
        if not isinstance(enriched, dict):
            return None
        cache_entry = enriched.get("market_intelligence_cache")
        if not isinstance(cache_entry, dict):
            return None
        if self._text(cache_entry.get("model")) != self.market_intelligence_client.model_name:
            return None
        fingerprint = self._text(cache_entry.get("fingerprint"))
        expected_fingerprint = self.market_intelligence_client.build_cache_key(project, current_metrics)
        if not fingerprint or fingerprint != expected_fingerprint:
            return None
        cached_at = self._parse_datetime(cache_entry.get("cached_at"))
        generated = self._parse_datetime(generated_at)
        if cached_at is None or generated is None:
            return None
        if (generated - cached_at).total_seconds() > 86_400:
            return None
        evidence = cache_entry.get("evidence")
        if not isinstance(evidence, dict):
            return None
        required_keys = {"sources", "facts", "raw_payloads", "metrics", "report"}
        if not required_keys.issubset(evidence.keys()):
            return None
        return self._sanitize_for_storage(evidence)

    def _build_market_intelligence_cache(
        self,
        project: dict[str, Any],
        current_metrics: dict[str, Any],
        market_evidence: dict[str, Any],
        generated_at: str,
    ) -> dict[str, Any]:
        return self._sanitize_for_storage(
            {
                "fingerprint": self.market_intelligence_client.build_cache_key(project, current_metrics),
                "model": self.market_intelligence_client.model_name,
                "cached_at": generated_at,
                "evidence": market_evidence,
            }
        )

    def _days_between(self, generated_at: str, observed_at: Any) -> int | None:
        generated = self._parse_datetime(generated_at)
        observed = self._parse_datetime(observed_at)
        if generated is None or observed is None:
            return None
        delta = generated - observed
        return max(0, round(delta.total_seconds() / 86400))

    def _parse_datetime(self, value: Any) -> datetime | None:
        if not isinstance(value, str) or not value.strip():
            return None
        normalized = value.replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)

    def _hash_json(self, payload: Any) -> str:
        normalized = json.dumps(payload, sort_keys=True, default=str, separators=(",", ":"))
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()

    def _sanitize_for_storage(self, value: Any) -> Any:
        if isinstance(value, dict):
            return {str(key): self._sanitize_for_storage(inner) for key, inner in value.items()}
        if isinstance(value, list):
            return [self._sanitize_for_storage(item) for item in value]
        if isinstance(value, int) and not -(2**63) <= value <= (2**63 - 1):
            return str(value)
        return value

    def _normalize_url(self, value: str) -> str:
        if not value:
            return ""
        parsed = urlparse(value)
        if not parsed.scheme:
            value = f"https://{value.lstrip('/')}"
            parsed = urlparse(value)
        path = parsed.path or "/"
        if path != "/" and path.endswith("/"):
            path = path[:-1]
        return parsed._replace(path=path, params="", query="", fragment="").geturl()

    def _normalize_related_url(self, value: str, default_url: str = "") -> str:
        if not value:
            return ""
        candidate = urljoin(default_url, value) if default_url else value
        return self._normalize_url(candidate)

    def _normalize_github_repo_url(self, value: str) -> str:
        if not value:
            return ""
        normalized = self._normalize_url(value)
        parsed = urlparse(normalized)
        if parsed.netloc.lower() not in {"github.com", "www.github.com"}:
            return normalized
        parts = [part for part in parsed.path.split("/") if part][:2]
        if len(parts) < 2:
            return normalized
        return f"https://github.com/{parts[0]}/{parts[1].removesuffix('.git')}"

    def _normalized_domain(self, value: str) -> str:
        parsed = urlparse(self._normalize_url(value))
        domain = parsed.netloc.lower()
        return domain[4:] if domain.startswith("www.") else domain

    def _join_text(self, *values: Any) -> str:
        return " ".join(self._text(value) for value in values if self._text(value)).strip()

    def _build_id(self, prefix: str, seed: str) -> str:
        return f"{prefix}_{hashlib.sha256(seed.encode('utf-8')).hexdigest()[:16]}"

    def _slug(self, value: str) -> str:
        return "_".join(
            part for part in "".join(ch.lower() if ch.isalnum() else "_" for ch in value).split("_") if part
        )

    def _text(self, value: Any) -> str:
        return value.strip() if isinstance(value, str) else ""

    def _to_float(self, value: Any, default: float = 0.0) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    def _now_iso(self) -> str:
        return datetime.now(timezone.utc).isoformat()
