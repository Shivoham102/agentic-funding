from __future__ import annotations

import asyncio
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from html import unescape
from typing import Any, Literal
from urllib.parse import parse_qs, quote_plus, unquote, urlparse

import httpx
from pydantic import BaseModel, Field, ValidationError


SEARCH_RESULT_ANCHOR_PATTERN = re.compile(
    r'<a[^>]*class="result__a"[^>]*href="(?P<href>[^"]+)"[^>]*>(?P<title>.*?)</a>',
    re.IGNORECASE | re.DOTALL,
)
SEARCH_RESULT_SNIPPET_PATTERN = re.compile(
    r'class="result__snippet"[^>]*>(?P<snippet>.*?)</(?:a|div)>',
    re.IGNORECASE | re.DOTALL,
)
TITLE_PATTERN = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
TAG_PATTERN = re.compile(r"<[^>]+>")
SCRIPT_STYLE_PATTERN = re.compile(r"<(script|style|noscript)[^>]*>.*?</\\1>", re.IGNORECASE | re.DOTALL)
WHITESPACE_PATTERN = re.compile(r"\s+")
NOISE_DOMAINS = {
    "duckduckgo.com",
    "html.duckduckgo.com",
    "www.duckduckgo.com",
}
MARKET_SCORECARD_VERSION = "market-v1"
MARKET_CACHE_VERSION = "market-cache-v1"
MARKET_CACHE_PROJECT_FIELDS = (
    "name",
    "website_url",
    "github_url",
    "category",
    "stage",
    "short_description",
    "description",
    "market_summary",
    "traction_summary",
)
MARKET_CACHE_METRIC_FIELDS = (
    "github_stars",
    "github_commits_90d",
    "active_users",
    "customers",
    "monthly_revenue_usd",
    "market_growth_pct",
    "tam_usd",
    "docs_quality_score",
    "product_readiness_score",
)
MARKET_SCORECARD_RUBRIC = {
    "version": MARKET_SCORECARD_VERSION,
    "dimensions": {
        "demand_score": {
            "weight": 0.30,
            "description": "Strength of grounded demand signals from customer need, growth, adoption, or ecosystem expansion.",
        },
        "competition_advantage_score": {
            "weight": 0.25,
            "description": "Ability to differentiate against competitors despite overlap in the category.",
        },
        "novelty_score": {
            "weight": 0.20,
            "description": "Degree of product novelty, from commodity to clearly novel.",
        },
        "trend_score": {
            "weight": 0.15,
            "description": "Direction and strength of current market momentum.",
        },
        "valuation_signal_score": {
            "weight": 0.10,
            "description": "Quality of publicly grounded valuation signals and comparable support.",
        },
    },
    "derived_metrics": {
        "market_validation_score": "0.55*demand + 0.25*trend + 0.20*valuation",
        "market_intelligence_score": "0.30*demand + 0.25*competition_advantage + 0.20*novelty + 0.15*trend + 0.10*valuation",
        "market_confidence_score": "document coverage plus source breadth plus valuation confidence",
    },
}


class MarketSourceDocument(BaseModel):
    doc_id: str
    title: str
    url: str
    source_kind: Literal["official_site", "github_repo", "market_search"]
    query: str | None = None
    excerpt: str = Field(..., min_length=40, max_length=1_200)


class CompetitorAssessment(BaseModel):
    name: str
    relation: Literal["direct", "indirect", "adjacent", "substitute"]
    overlap_level: Literal["low", "moderate", "high"]
    differentiation_strength: Literal["weak", "moderate", "strong"]
    summary: str = Field(..., min_length=12, max_length=240)
    evidence_document_ids: list[str] = Field(default_factory=list, max_length=4)


class DemandSignal(BaseModel):
    signal_type: Literal[
        "customer_need",
        "market_growth",
        "developer_adoption",
        "pricing_power",
        "ecosystem_expansion",
        "news_coverage",
        "funding_activity",
        "community_attention",
    ]
    strength: Literal["weak", "moderate", "strong"]
    summary: str = Field(..., min_length=12, max_length=240)
    evidence_document_ids: list[str] = Field(default_factory=list, max_length=4)


class TrendSignal(BaseModel):
    signal_type: Literal[
        "launch_velocity",
        "release_cadence",
        "search_interest",
        "ecosystem_tailwind",
        "news_cycle",
        "competitor_activity",
    ]
    strength: Literal["weak", "moderate", "strong"]
    summary: str = Field(..., min_length=12, max_length=240)
    evidence_document_ids: list[str] = Field(default_factory=list, max_length=4)


class ValuationAssessment(BaseModel):
    estimated_low_usd: int | None = Field(default=None, ge=0)
    estimated_high_usd: int | None = Field(default=None, ge=0)
    method: Literal["public_comparables", "revenue_multiple", "traction_multiple", "market_comparable", "unknown"]
    confidence: Literal["low", "medium", "high"]
    summary: str = Field(..., min_length=12, max_length=260)
    comparable_companies: list[str] = Field(default_factory=list, max_length=5)
    evidence_document_ids: list[str] = Field(default_factory=list, max_length=5)


class NoveltyAssessment(BaseModel):
    novelty_label: Literal["commodity", "incremental", "differentiated", "novel"]
    summary: str = Field(..., min_length=12, max_length=260)
    differentiation_points: list[str] = Field(default_factory=list, max_length=5)
    evidence_document_ids: list[str] = Field(default_factory=list, max_length=5)


class TrendAssessment(BaseModel):
    trend_label: Literal["declining", "stable", "rising", "hot"]
    summary: str = Field(..., min_length=12, max_length=260)
    trend_signals: list[TrendSignal] = Field(default_factory=list, max_length=5)
    evidence_document_ids: list[str] = Field(default_factory=list, max_length=5)


class MarketIntelligenceExtraction(BaseModel):
    market_category: str = Field(..., min_length=3, max_length=120)
    target_customer: str = Field(..., min_length=3, max_length=180)
    market_summary: str = Field(..., min_length=20, max_length=320)
    demand_summary: str = Field(..., min_length=20, max_length=320)
    competitor_summary: str = Field(..., min_length=20, max_length=320)
    novelty_summary: str = Field(..., min_length=20, max_length=320)
    trend_summary: str = Field(..., min_length=20, max_length=320)
    valuation_summary: str = Field(..., min_length=20, max_length=320)
    competitors: list[CompetitorAssessment] = Field(default_factory=list, max_length=5)
    demand_signals: list[DemandSignal] = Field(default_factory=list, max_length=5)
    valuation: ValuationAssessment
    novelty: NoveltyAssessment
    trend: TrendAssessment
    estimated_market_size_usd: float | None = Field(default=None, ge=0)
    estimated_market_growth_pct: float | None = Field(default=None, ge=0, le=500)


class MarketScorecard(BaseModel):
    demand_score: float = Field(..., ge=0, le=100)
    competition_advantage_score: float = Field(..., ge=0, le=100)
    competition_intensity_score: float = Field(..., ge=0, le=100)
    novelty_score: float = Field(..., ge=0, le=100)
    trend_score: float = Field(..., ge=0, le=100)
    valuation_signal_score: float = Field(..., ge=0, le=100)
    market_validation_score: float = Field(..., ge=0, le=100)
    market_intelligence_score: float = Field(..., ge=0, le=100)
    market_confidence_score: float = Field(..., ge=0, le=100)


class MarketDocumentRecord(BaseModel):
    doc_id: str
    url: str
    title: str
    source_kind: str
    query: str | None = None
    excerpt: str
    source_id: str
    raw_payload: dict[str, Any]


class MarketIntelligenceAgent:
    """Grounded market-intelligence enrichment using web retrieval plus Gemma synthesis."""

    _rate_limit_lock: asyncio.Lock | None = None
    _last_request_started_at: float = 0.0

    def __init__(
        self,
        api_key: str = "",
        base_url: str = "https://generativelanguage.googleapis.com/v1beta",
        model_name: str = "gemini-3.1-flash-lite-preview",
        timeout_seconds: float = 60.0,
        max_retries: int = 0,
        search_timeout_seconds: float = 12.0,
        search_results_per_query: int = 2,
        max_source_documents: int = 4,
        min_request_interval_seconds: float = 5.0,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model_name = model_name
        self.timeout_seconds = timeout_seconds
        self.max_retries = max(0, int(max_retries))
        self.search_timeout_seconds = search_timeout_seconds
        self.search_results_per_query = max(1, int(search_results_per_query))
        self.max_source_documents = max(2, int(max_source_documents))
        self.min_request_interval_seconds = max(0.0, float(min_request_interval_seconds))

    async def collect_market_intelligence(
        self,
        project: dict[str, Any],
        current_metrics: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not self.api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured")

        documents = await self._gather_documents(project)
        if not documents:
            raise RuntimeError("No market research documents could be collected")

        extraction, raw_response = await self._generate_extraction(project, documents, current_metrics or {})
        scorecard = self._score_extraction(extraction, documents)
        evidence = self._build_evidence(project, documents, extraction, scorecard, raw_response)
        return evidence

    def build_cache_key(
        self,
        project: dict[str, Any],
        current_metrics: dict[str, Any] | None = None,
    ) -> str:
        current_metrics = current_metrics or {}
        project_payload: dict[str, Any] = {}
        for key in MARKET_CACHE_PROJECT_FIELDS:
            value = project.get(key)
            if isinstance(value, str):
                project_payload[key] = self._truncate_text(value.strip(), 400)
            elif value is not None:
                project_payload[key] = value

        metrics_payload = {
            key: current_metrics.get(key)
            for key in MARKET_CACHE_METRIC_FIELDS
            if current_metrics.get(key) not in {None, ""}
        }
        return self._hash_json(
            {
                "cache_version": MARKET_CACHE_VERSION,
                "scorecard_version": MARKET_SCORECARD_VERSION,
                "model": self.model_name,
                "project": project_payload,
                "metrics": metrics_payload,
            }
        )

    async def _gather_documents(self, project: dict[str, Any]) -> list[MarketDocumentRecord]:
        documents: list[MarketDocumentRecord] = []
        seen_urls: set[str] = set()

        official_specs = [
            ("official_site", self._text(project.get("website_url")), None),
            ("github_repo", self._text(project.get("github_url")), None),
        ]
        for source_kind, url, query in official_specs:
            normalized = self._normalize_url(url)
            if not normalized or normalized in seen_urls:
                continue
            page = await self._fetch_page_document(normalized, source_kind=source_kind, query=query)
            if page is None:
                continue
            documents.append(page)
            seen_urls.add(normalized)

        for query in self._build_search_queries(project):
            if len(documents) >= self.max_source_documents:
                break
            search_results = await self._search_market_web(query)
            for result in search_results:
                if len(documents) >= self.max_source_documents:
                    break
                normalized = self._normalize_url(result["url"])
                if not normalized or normalized in seen_urls:
                    continue
                domain = urlparse(normalized).netloc.lower()
                if not domain or domain in NOISE_DOMAINS:
                    continue

                page = await self._fetch_page_document(
                    normalized,
                    source_kind="market_search",
                    query=query,
                    search_title=result["title"],
                    search_snippet=result["snippet"],
                )
                if page is None:
                    continue
                documents.append(page)
                seen_urls.add(normalized)

        return documents[: self.max_source_documents]

    async def _search_market_web(self, query: str) -> list[dict[str, str]]:
        search_url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}"
        timeout = httpx.Timeout(self.search_timeout_seconds)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            response = await client.get(search_url, headers={"User-Agent": "AutoVC-Market-Research"})
            response.raise_for_status()
            html = response.text

        results: list[dict[str, str]] = []
        for match in SEARCH_RESULT_ANCHOR_PATTERN.finditer(html):
            href = self._unwrap_search_url(unescape(match.group("href")))
            title = self._clean_html_fragment(match.group("title"))
            window = html[match.end() : match.end() + 1_200]
            snippet_match = SEARCH_RESULT_SNIPPET_PATTERN.search(window)
            snippet = self._clean_html_fragment(snippet_match.group("snippet")) if snippet_match else ""

            normalized = self._normalize_url(href)
            if not normalized or not title:
                continue
            results.append({"url": normalized, "title": title[:180], "snippet": snippet[:320]})
            if len(results) >= self.search_results_per_query:
                break

        return results

    async def _fetch_page_document(
        self,
        url: str,
        source_kind: str,
        query: str | None,
        search_title: str = "",
        search_snippet: str = "",
    ) -> MarketDocumentRecord | None:
        timeout = httpx.Timeout(self.search_timeout_seconds)
        headers = {"User-Agent": "AutoVC-Market-Research"}
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                response = await client.get(url, headers=headers)
                response.raise_for_status()
        except httpx.HTTPError:
            if not search_snippet:
                return None
            excerpt = search_snippet
            title = search_title or urlparse(url).netloc
            raw_payload = {
                "url": url,
                "title": title,
                "excerpt": excerpt,
                "source_kind": source_kind,
                "query": query,
                "fetched": False,
            }
        else:
            content_type = response.headers.get("content-type", "")
            if "text/html" not in content_type and "text/plain" not in content_type and "application/xhtml+xml" not in content_type:
                if not search_snippet:
                    return None
                excerpt = search_snippet
                title = search_title or urlparse(url).netloc
                raw_payload = {
                    "url": url,
                    "title": title,
                    "excerpt": excerpt,
                    "source_kind": source_kind,
                    "query": query,
                    "fetched": False,
                }
            else:
                html = response.text[:300_000]
                title_match = TITLE_PATTERN.search(html)
                title = self._clean_html_fragment(title_match.group(1)) if title_match else search_title or urlparse(url).netloc
                excerpt = self._extract_text_excerpt(html)
                if len(excerpt) < 40 and search_snippet:
                    excerpt = search_snippet
                if len(excerpt) < 40:
                    return None
                raw_payload = {
                    "url": url,
                    "title": title,
                    "excerpt": excerpt,
                    "source_kind": source_kind,
                    "query": query,
                    "fetched": True,
                }

        source_id = self._build_id("source", f"market_doc|{url}|{query or ''}")
        return MarketDocumentRecord(
            doc_id=self._build_id("doc", f"{url}|{query or ''}"),
            url=url,
            title=title[:180],
            source_kind=source_kind,
            query=query,
            excerpt=self._truncate_text(excerpt, 900),
            source_id=source_id,
            raw_payload=raw_payload,
        )

    async def _generate_extraction(
        self,
        project: dict[str, Any],
        documents: list[MarketDocumentRecord],
        current_metrics: dict[str, Any],
    ) -> tuple[MarketIntelligenceExtraction, dict[str, Any]]:
        schema = self._response_json_schema()
        prompt = self._build_prompt(project, documents, current_metrics)
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0,
                "topP": 0.05,
                "maxOutputTokens": 2048,
                "responseMimeType": "application/json",
                "responseJsonSchema": schema,
            },
        }
        last_error: Exception | None = None
        for attempt in range(self.max_retries + 1):
            try:
                raw_response = await self._gemini_request(payload)
                extraction = self._parse_extraction_response(raw_response)
                return extraction, raw_response
            except (ValidationError, ValueError) as exc:
                last_error = RuntimeError(f"Gemma structured output failed validation: {exc}")
                break
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                last_error = exc
            except RuntimeError as exc:
                last_error = exc
                lowered = str(exc).lower()
                if "rate-limited" in lowered or "quota" in lowered or "http 4" in lowered:
                    break
            if attempt >= self.max_retries:
                break
            await asyncio.sleep(0.75 * (2**attempt))

        raise RuntimeError(f"Gemma market intelligence failed: {last_error}")

    async def _gemini_request(self, payload: dict[str, Any]) -> dict[str, Any]:
        endpoint = f"{self.base_url}/models/{self.model_name}:generateContent"
        timeout = httpx.Timeout(self.timeout_seconds)
        await self._await_rate_limit_slot()
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                endpoint,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "x-goog-api-key": self.api_key,
                },
            )
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                message = self._gemini_http_error(exc.response)
                raise RuntimeError(message) from exc
            data = response.json()
            if not isinstance(data, dict):
                raise RuntimeError("Unexpected Gemini API response shape")
            return data

    async def _await_rate_limit_slot(self) -> None:
        if self.min_request_interval_seconds <= 0:
            return
        cls = type(self)
        if cls._rate_limit_lock is None:
            cls._rate_limit_lock = asyncio.Lock()
        async with cls._rate_limit_lock:
            now = time.monotonic()
            wait_seconds = self.min_request_interval_seconds - (now - cls._last_request_started_at)
            if wait_seconds > 0:
                await asyncio.sleep(wait_seconds)
            cls._last_request_started_at = time.monotonic()

    def _gemini_http_error(self, response: httpx.Response) -> str:
        status_code = response.status_code
        response_text = response.text.strip()
        detail = ""
        if response_text:
            try:
                payload = response.json()
            except ValueError:
                detail = response_text[:240]
            else:
                if isinstance(payload, dict):
                    error = payload.get("error")
                    if isinstance(error, dict):
                        detail = self._text(error.get("message"))[:240]
                    elif isinstance(error, str):
                        detail = error[:240]
        if status_code == 429:
            return f"Gemma API rate-limited the request (HTTP 429). {detail}".strip()
        if detail:
            return f"Gemma API request failed with HTTP {status_code}. {detail}".strip()
        return f"Gemma API request failed with HTTP {status_code}."

    def _response_json_schema(self) -> dict[str, Any]:
        string_array = {"type": "array", "items": {"type": "string"}}
        evidence_ids = {"type": "array", "items": {"type": "string"}}
        competitor_item = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "relation": {"type": "string"},
                "overlap_level": {"type": "string"},
                "differentiation_strength": {"type": "string"},
                "summary": {"type": "string"},
                "evidence_document_ids": evidence_ids,
            },
            "required": [
                "name",
                "relation",
                "overlap_level",
                "differentiation_strength",
                "summary",
                "evidence_document_ids",
            ],
        }
        signal_item = {
            "type": "object",
            "properties": {
                "signal_type": {"type": "string"},
                "strength": {"type": "string"},
                "summary": {"type": "string"},
                "evidence_document_ids": evidence_ids,
            },
            "required": ["signal_type", "strength", "summary", "evidence_document_ids"],
        }
        valuation_item = {
            "type": "object",
            "properties": {
                "estimated_low_usd": {"type": ["number", "null"]},
                "estimated_high_usd": {"type": ["number", "null"]},
                "method": {"type": "string"},
                "confidence": {"type": "string"},
                "summary": {"type": "string"},
                "comparable_companies": string_array,
                "evidence_document_ids": evidence_ids,
            },
            "required": [
                "estimated_low_usd",
                "estimated_high_usd",
                "method",
                "confidence",
                "summary",
                "comparable_companies",
                "evidence_document_ids",
            ],
        }
        novelty_item = {
            "type": "object",
            "properties": {
                "novelty_label": {"type": "string"},
                "summary": {"type": "string"},
                "differentiation_points": string_array,
                "evidence_document_ids": evidence_ids,
            },
            "required": ["novelty_label", "summary", "differentiation_points", "evidence_document_ids"],
        }
        trend_item = {
            "type": "object",
            "properties": {
                "trend_label": {"type": "string"},
                "summary": {"type": "string"},
                "trend_signals": {"type": "array", "items": signal_item},
                "evidence_document_ids": evidence_ids,
            },
            "required": ["trend_label", "summary", "trend_signals", "evidence_document_ids"],
        }
        return {
            "type": "object",
            "properties": {
                "market_category": {"type": "string"},
                "target_customer": {"type": "string"},
                "market_summary": {"type": "string"},
                "demand_summary": {"type": "string"},
                "competitor_summary": {"type": "string"},
                "novelty_summary": {"type": "string"},
                "trend_summary": {"type": "string"},
                "valuation_summary": {"type": "string"},
                "competitors": {"type": "array", "items": competitor_item},
                "demand_signals": {"type": "array", "items": signal_item},
                "valuation": valuation_item,
                "novelty": novelty_item,
                "trend": trend_item,
                "estimated_market_size_usd": {"type": ["number", "null"]},
                "estimated_market_growth_pct": {"type": ["number", "null"]},
            },
            "required": [
                "market_category",
                "target_customer",
                "market_summary",
                "demand_summary",
                "competitor_summary",
                "novelty_summary",
                "trend_summary",
                "valuation_summary",
                "competitors",
                "demand_signals",
                "valuation",
                "novelty",
                "trend",
                "estimated_market_size_usd",
                "estimated_market_growth_pct",
            ],
        }

    def _parse_extraction_response(self, payload: dict[str, Any]) -> MarketIntelligenceExtraction:
        candidates = payload.get("candidates")
        if not isinstance(candidates, list) or not candidates:
            raise RuntimeError("Gemini API returned no candidates")

        texts: list[str] = []
        for candidate in candidates:
            if not isinstance(candidate, dict):
                continue
            content = candidate.get("content")
            if not isinstance(content, dict):
                continue
            parts = content.get("parts")
            if not isinstance(parts, list):
                continue
            for part in parts:
                if isinstance(part, dict):
                    text = self._text(part.get("text"))
                    if text:
                        texts.append(text)

        response_text = "\n".join(texts).strip()
        if not response_text:
            raise RuntimeError("Gemini API returned empty text")

        normalized = response_text.strip()
        if normalized.startswith("```"):
            normalized = re.sub(r"^```(?:json)?", "", normalized).strip()
            normalized = re.sub(r"```$", "", normalized).strip()

        parsed = json.loads(normalized)
        if not isinstance(parsed, dict):
            raise RuntimeError("Gemini API returned a non-object JSON payload")
        return MarketIntelligenceExtraction.model_validate(self._normalize_extraction_payload(parsed))

    def _normalize_extraction_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        valuation = payload.get("valuation") if isinstance(payload.get("valuation"), dict) else {}
        novelty = payload.get("novelty") if isinstance(payload.get("novelty"), dict) else {}
        trend = payload.get("trend") if isinstance(payload.get("trend"), dict) else {}

        novelty_summary = self._normalized_summary(
            novelty.get("summary"),
            payload.get("novelty_summary"),
            20,
            260,
            "The product shows some differentiated characteristics in the available evidence.",
        )
        trend_summary = self._normalized_summary(
            trend.get("summary"),
            payload.get("trend_summary"),
            20,
            260,
            "The available evidence suggests steady market activity around this category.",
        )

        return {
            "market_category": self._normalized_label(
                payload.get("market_category"),
                3,
                120,
                "Software market",
            ),
            "target_customer": self._normalized_label(
                payload.get("target_customer"),
                3,
                180,
                "Software teams",
            ),
            "market_summary": self._normalized_summary(
                payload.get("market_summary"),
                payload.get("demand_summary"),
                20,
                320,
                "The product targets a software market with identifiable demand and competitive activity.",
            ),
            "demand_summary": self._normalized_summary(
                payload.get("demand_summary"),
                payload.get("market_summary"),
                20,
                320,
                "Demand appears supported by the available public evidence.",
            ),
            "competitor_summary": self._normalized_summary(
                payload.get("competitor_summary"),
                payload.get("market_summary"),
                20,
                320,
                "Competing products exist in the category and shape the positioning of this product.",
            ),
            "novelty_summary": self._normalized_summary(
                payload.get("novelty_summary"),
                novelty_summary,
                20,
                320,
                "The product has some differentiated attributes in the available evidence.",
            ),
            "trend_summary": self._normalized_summary(
                payload.get("trend_summary"),
                trend_summary,
                20,
                320,
                "The market shows ongoing activity and relevance in the available evidence.",
            ),
            "valuation_summary": self._normalized_summary(
                payload.get("valuation_summary"),
                valuation.get("summary"),
                20,
                320,
                "Valuation evidence is limited, so any estimate should be treated cautiously.",
            ),
            "competitors": self._normalize_competitors(payload.get("competitors")),
            "demand_signals": self._normalize_demand_signals(payload.get("demand_signals")),
            "valuation": self._normalize_valuation(valuation),
            "novelty": self._normalize_novelty(novelty, novelty_summary),
            "trend": self._normalize_trend(trend, trend_summary),
            "estimated_market_size_usd": self._coerce_number(payload.get("estimated_market_size_usd")),
            "estimated_market_growth_pct": self._coerce_number(payload.get("estimated_market_growth_pct")),
        }

    def _normalize_competitors(self, payload: Any) -> list[dict[str, Any]]:
        items = payload if isinstance(payload, list) else []
        normalized: list[dict[str, Any]] = []
        for item in items[:5]:
            if not isinstance(item, dict):
                continue
            normalized.append(
                {
                    "name": self._normalized_label(item.get("name"), 3, 120, "Comparable product"),
                    "relation": self._normalize_relation(item.get("relation")),
                    "overlap_level": self._normalize_overlap_level(item.get("overlap_level")),
                    "differentiation_strength": self._normalize_strength(item.get("differentiation_strength")),
                    "summary": self._normalized_summary(
                        item.get("summary"),
                        item.get("name"),
                        12,
                        240,
                        "Competes in a related part of the market.",
                    ),
                    "evidence_document_ids": self._normalize_string_list(item.get("evidence_document_ids"), 4),
                }
            )
        return normalized

    def _normalize_demand_signals(self, payload: Any) -> list[dict[str, Any]]:
        items = payload if isinstance(payload, list) else []
        normalized: list[dict[str, Any]] = []
        for item in items[:5]:
            if not isinstance(item, dict):
                continue
            normalized.append(
                {
                    "signal_type": self._normalize_demand_signal_type(item.get("signal_type")),
                    "strength": self._normalize_strength(item.get("strength")),
                    "summary": self._normalized_summary(
                        item.get("summary"),
                        item.get("signal_type"),
                        12,
                        240,
                        "Public evidence suggests some demand in the category.",
                    ),
                    "evidence_document_ids": self._normalize_string_list(item.get("evidence_document_ids"), 4),
                }
            )
        return normalized

    def _normalize_valuation(self, payload: dict[str, Any]) -> dict[str, Any]:
        summary = self._normalized_summary(
            payload.get("summary"),
            payload.get("method"),
            12,
            260,
            "Valuation evidence is limited, so confidence should remain conservative.",
        )
        return {
            "estimated_low_usd": self._coerce_int(payload.get("estimated_low_usd")),
            "estimated_high_usd": self._coerce_int(payload.get("estimated_high_usd")),
            "method": self._normalize_valuation_method(payload.get("method")),
            "confidence": self._normalize_confidence(payload.get("confidence")),
            "summary": summary,
            "comparable_companies": self._normalize_string_list(payload.get("comparable_companies"), 5),
            "evidence_document_ids": self._normalize_string_list(payload.get("evidence_document_ids"), 5),
        }

    def _normalize_novelty(self, payload: dict[str, Any], fallback_summary: str) -> dict[str, Any]:
        summary = self._normalized_summary(
            payload.get("summary"),
            fallback_summary,
            12,
            260,
            "The product appears differentiated in some aspects of the available evidence.",
        )
        return {
            "novelty_label": self._normalize_novelty_label(payload.get("novelty_label"), summary),
            "summary": summary,
            "differentiation_points": self._normalize_string_list(payload.get("differentiation_points"), 5),
            "evidence_document_ids": self._normalize_string_list(payload.get("evidence_document_ids"), 5),
        }

    def _normalize_trend(self, payload: dict[str, Any], fallback_summary: str) -> dict[str, Any]:
        summary = self._normalized_summary(
            payload.get("summary"),
            fallback_summary,
            12,
            260,
            "The market appears active based on the available evidence.",
        )
        signals = payload.get("trend_signals") if isinstance(payload.get("trend_signals"), list) else []
        normalized_signals: list[dict[str, Any]] = []
        for item in signals[:5]:
            if not isinstance(item, dict):
                continue
            normalized_signals.append(
                {
                    "signal_type": self._normalize_trend_signal_type(item.get("signal_type")),
                    "strength": self._normalize_strength(item.get("strength")),
                    "summary": self._normalized_summary(
                        item.get("summary"),
                        item.get("signal_type"),
                        12,
                        240,
                        "The category shows ongoing public activity.",
                    ),
                    "evidence_document_ids": self._normalize_string_list(item.get("evidence_document_ids"), 4),
                }
            )
        return {
            "trend_label": self._normalize_trend_label(payload.get("trend_label"), summary),
            "summary": summary,
            "trend_signals": normalized_signals,
            "evidence_document_ids": self._normalize_string_list(payload.get("evidence_document_ids"), 5),
        }

    def _normalize_relation(self, value: Any) -> str:
        text = self._text(value).lower()
        if "substitute" in text:
            return "substitute"
        if "adjacent" in text:
            return "adjacent"
        if "indirect" in text:
            return "indirect"
        return "direct"

    def _normalize_overlap_level(self, value: Any) -> str:
        text = self._text(value).lower()
        if "high" in text:
            return "high"
        if "moder" in text or "med" in text:
            return "moderate"
        return "low"

    def _normalize_strength(self, value: Any) -> str:
        text = self._text(value).lower()
        if "high" in text or "strong" in text:
            return "strong"
        if "moder" in text or "med" in text:
            return "moderate"
        return "weak"

    def _normalize_confidence(self, value: Any) -> str:
        return self._normalize_strength(value).replace("strong", "high").replace("weak", "low")

    def _normalize_valuation_method(self, value: Any) -> str:
        text = self._text(value).lower()
        if "revenue" in text:
            return "revenue_multiple"
        if "traction" in text or "usage" in text:
            return "traction_multiple"
        if "public" in text:
            return "public_comparables"
        if "compar" in text or "market" in text:
            return "market_comparable"
        return "unknown"

    def _normalize_novelty_label(self, value: Any, context: str) -> str:
        text = f"{self._text(value)} {context}".lower()
        if "commodity" in text or "generic" in text:
            return "commodity"
        if "novel" in text:
            return "novel"
        if "differ" in text or "unique" in text or "distinct" in text:
            return "differentiated"
        return "incremental"

    def _normalize_trend_label(self, value: Any, context: str) -> str:
        text = f"{self._text(value)} {context}".lower()
        if "declin" in text or "fall" in text:
            return "declining"
        if "hot" in text:
            return "hot"
        if "ris" in text or "grow" in text or "uptrend" in text:
            return "rising"
        return "stable"

    def _normalize_demand_signal_type(self, value: Any) -> str:
        text = self._text(value).lower()
        if "growth" in text or "trend" in text:
            return "market_growth"
        if "developer" in text or "adoption" in text:
            return "developer_adoption"
        if "pricing" in text:
            return "pricing_power"
        if "ecosystem" in text or "platform" in text:
            return "ecosystem_expansion"
        if "news" in text or "media" in text:
            return "news_coverage"
        if "fund" in text or "investment" in text:
            return "funding_activity"
        if "community" in text or "social" in text or "attention" in text:
            return "community_attention"
        return "customer_need"

    def _normalize_trend_signal_type(self, value: Any) -> str:
        text = self._text(value).lower()
        if "launch" in text or "ship" in text:
            return "launch_velocity"
        if "release" in text or "cadence" in text:
            return "release_cadence"
        if "search" in text or "interest" in text:
            return "search_interest"
        if "news" in text or "media" in text:
            return "news_cycle"
        if "compet" in text:
            return "competitor_activity"
        return "ecosystem_tailwind"

    def _normalize_string_list(self, value: Any, limit: int) -> list[str]:
        items = value if isinstance(value, list) else []
        normalized: list[str] = []
        for item in items[:limit]:
            text = self._truncate_text(self._text(item), 160)
            if text:
                normalized.append(text)
        return normalized

    def _normalized_label(self, value: Any, minimum: int, maximum: int, fallback: str) -> str:
        text = self._truncate_text(self._text(value), maximum)
        if len(text) >= minimum:
            return text
        return self._truncate_text(fallback, maximum)

    def _normalized_summary(self, value: Any, fallback: Any, minimum: int, maximum: int, default: str) -> str:
        for candidate in (value, fallback, default):
            text = self._truncate_text(self._text(candidate), maximum)
            if len(text) >= minimum:
                return text
        return self._truncate_text(default, maximum)

    def _coerce_number(self, value: Any) -> float | None:
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            return None
        if numeric < 0:
            return None
        return numeric

    def _coerce_int(self, value: Any) -> int | None:
        numeric = self._coerce_number(value)
        if numeric is None:
            return None
        return int(numeric)

    def _build_evidence(
        self,
        project: dict[str, Any],
        documents: list[MarketDocumentRecord],
        extraction: MarketIntelligenceExtraction,
        scorecard: MarketScorecard,
        raw_response: dict[str, Any],
    ) -> dict[str, Any]:
        observed_at = self._now_iso()
        source_lookup: dict[str, dict[str, Any]] = {}
        raw_payloads: dict[str, Any] = {}
        sources: list[dict[str, Any]] = []

        for document in documents:
            source = {
                "id": document.source_id,
                "kind": "market_research",
                "label": f"Market research source: {document.title}",
                "category": "market",
                "url": document.url,
                "observed_at": observed_at,
                "raw_payload_hash": self._hash_json(document.raw_payload),
                "metadata": {
                    "document_id": document.doc_id,
                    "source_kind": document.source_kind,
                    "query": document.query,
                },
            }
            source_lookup[document.doc_id] = source
            sources.append(source)
            raw_payloads[source["id"]] = document.raw_payload

        model_source = {
            "id": self._build_id("source", f"gemma_market|{self._hash_json(raw_response)}"),
            "kind": "gemma_market_analysis",
            "label": "Gemma market intelligence analysis",
            "category": "market",
            "url": self._text(project.get("website_url")) or None,
            "observed_at": observed_at,
            "raw_payload_hash": self._hash_json(raw_response),
            "metadata": {
                "model": self.model_name,
            },
        }
        sources.append(model_source)
        raw_payloads[model_source["id"]] = raw_response

        facts = [
            self._make_fact(
                category="market",
                key="market_intelligence_summary",
                claim="Structured market intelligence summary grounded in retrieved sources.",
                value=extraction.model_dump(mode="json"),
                observed_at=observed_at,
                source_ids=[model_source["id"]],
                urls=[document.url for document in documents[:5]],
                confidence=scorecard.market_confidence_score / 100.0,
            ),
            self._make_fact(
                category="market",
                key="market_demand_score",
                claim="Deterministic demand score derived from structured demand signals.",
                value=scorecard.demand_score,
                observed_at=observed_at,
                source_ids=self._source_ids_for_documents(source_lookup, self._document_ids_for_demand(extraction)),
                urls=self._urls_for_documents(documents, self._document_ids_for_demand(extraction)),
                confidence=scorecard.market_confidence_score / 100.0,
            ),
            self._make_fact(
                category="market",
                key="market_competition_advantage_score",
                claim="Deterministic competition advantage score derived from competitor overlap and differentiation.",
                value=scorecard.competition_advantage_score,
                observed_at=observed_at,
                source_ids=self._source_ids_for_documents(source_lookup, self._document_ids_for_competitors(extraction)),
                urls=self._urls_for_documents(documents, self._document_ids_for_competitors(extraction)),
                confidence=scorecard.market_confidence_score / 100.0,
            ),
            self._make_fact(
                category="product",
                key="market_novelty_score",
                claim="Deterministic novelty score derived from the structured novelty assessment.",
                value=scorecard.novelty_score,
                observed_at=observed_at,
                source_ids=self._source_ids_for_documents(source_lookup, extraction.novelty.evidence_document_ids),
                urls=self._urls_for_documents(documents, extraction.novelty.evidence_document_ids),
                confidence=scorecard.market_confidence_score / 100.0,
            ),
            self._make_fact(
                category="market",
                key="market_trend_score",
                claim="Deterministic trend score derived from structured trend signals.",
                value=scorecard.trend_score,
                observed_at=observed_at,
                source_ids=self._source_ids_for_documents(source_lookup, self._document_ids_for_trend(extraction)),
                urls=self._urls_for_documents(documents, self._document_ids_for_trend(extraction)),
                confidence=scorecard.market_confidence_score / 100.0,
            ),
            self._make_fact(
                category="market",
                key="valuation_estimate_range",
                claim="Valuation estimate range grounded in retrieved public comparable signals.",
                value=extraction.valuation.model_dump(mode="json"),
                observed_at=observed_at,
                source_ids=self._source_ids_for_documents(source_lookup, extraction.valuation.evidence_document_ids),
                urls=self._urls_for_documents(documents, extraction.valuation.evidence_document_ids),
                confidence=scorecard.market_confidence_score / 100.0,
            ),
            self._make_fact(
                category="market",
                key="market_intelligence_score",
                claim="Deterministic overall market intelligence score used by the judging pipeline.",
                value=scorecard.model_dump(mode="json"),
                observed_at=observed_at,
                source_ids=[model_source["id"]],
                urls=[document.url for document in documents[:5]],
                confidence=scorecard.market_confidence_score / 100.0,
            ),
        ]

        metrics = {
            "market_demand_score": scorecard.demand_score,
            "competition_advantage_score": scorecard.competition_advantage_score,
            "competition_intensity": scorecard.competition_intensity_score,
            "market_novelty_score": scorecard.novelty_score,
            "market_trend_score": scorecard.trend_score,
            "valuation_signal_score": scorecard.valuation_signal_score,
            "market_validation_score": scorecard.market_validation_score,
            "market_intelligence_score": scorecard.market_intelligence_score,
            "market_intelligence_confidence_score": scorecard.market_confidence_score,
            "market_competitor_count": float(len(extraction.competitors)),
            "market_search_source_count": float(len(documents)),
            "tam_usd": extraction.estimated_market_size_usd or 0.0,
            "market_growth_pct": extraction.estimated_market_growth_pct or 0.0,
            "is_trending": 1.0 if extraction.trend.trend_label in {"rising", "hot"} else 0.0,
            "valuation_estimate_low_usd": float(extraction.valuation.estimated_low_usd or 0),
            "valuation_estimate_high_usd": float(extraction.valuation.estimated_high_usd or 0),
        }

        return {
            "sources": sources,
            "facts": facts,
            "raw_payloads": raw_payloads,
            "metrics": metrics,
            "report": {
                "scorecard_version": MARKET_SCORECARD_VERSION,
                "scorecard_rubric": MARKET_SCORECARD_RUBRIC,
                "model": self.model_name,
                "extraction": extraction.model_dump(mode="json"),
                "scorecard": scorecard.model_dump(mode="json"),
            },
        }

    def _score_extraction(
        self,
        extraction: MarketIntelligenceExtraction,
        documents: list[MarketDocumentRecord],
    ) -> MarketScorecard:
        demand_score = self._score_demand(extraction)
        competition_advantage_score, competition_intensity_score = self._score_competition(extraction)
        novelty_score = self._score_novelty(extraction.novelty)
        trend_score = self._score_trend(extraction.trend)
        valuation_signal_score = self._score_valuation(extraction.valuation)
        market_validation_score = self._bounded(
            demand_score * 0.55 + trend_score * 0.25 + valuation_signal_score * 0.20
        )
        market_intelligence_score = self._bounded(
            demand_score * 0.30
            + competition_advantage_score * 0.25
            + novelty_score * 0.20
            + trend_score * 0.15
            + valuation_signal_score * 0.10
        )

        valid_doc_ids = {document.doc_id for document in documents}
        citation_ids = {
            *self._document_ids_for_competitors(extraction),
            *self._document_ids_for_demand(extraction),
            *self._document_ids_for_trend(extraction),
            *extraction.valuation.evidence_document_ids,
            *extraction.novelty.evidence_document_ids,
        }
        cited_valid_doc_ids = {doc_id for doc_id in citation_ids if doc_id in valid_doc_ids}
        document_coverage = 0.0
        if documents:
            document_coverage = min(1.0, len(cited_valid_doc_ids) / len(documents))
        confidence_map = {"low": 45.0, "medium": 68.0, "high": 84.0}
        valuation_confidence = confidence_map.get(extraction.valuation.confidence, 45.0)
        market_confidence_score = self._bounded(
            40.0 + document_coverage * 35.0 + min(len(documents), 8) * 3.0 + valuation_confidence * 0.15
        )

        return MarketScorecard(
            demand_score=self._round(demand_score),
            competition_advantage_score=self._round(competition_advantage_score),
            competition_intensity_score=self._round(competition_intensity_score),
            novelty_score=self._round(novelty_score),
            trend_score=self._round(trend_score),
            valuation_signal_score=self._round(valuation_signal_score),
            market_validation_score=self._round(market_validation_score),
            market_intelligence_score=self._round(market_intelligence_score),
            market_confidence_score=self._round(market_confidence_score),
        )

    def _score_demand(self, extraction: MarketIntelligenceExtraction) -> float:
        strength_map = {"weak": 42.0, "moderate": 65.0, "strong": 84.0}
        if not extraction.demand_signals:
            return 42.0
        base = sum(strength_map.get(signal.strength, 42.0) for signal in extraction.demand_signals)
        score = base / len(extraction.demand_signals)
        if len(extraction.demand_signals) >= 3:
            score += 4.0
        return self._bounded(score)

    def _score_competition(self, extraction: MarketIntelligenceExtraction) -> tuple[float, float]:
        overlap_map = {"low": 32.0, "moderate": 58.0, "high": 82.0}
        diff_map = {"weak": 40.0, "moderate": 64.0, "strong": 82.0}
        if not extraction.competitors:
            return 55.0, 50.0
        overlap = sum(overlap_map.get(item.overlap_level, 58.0) for item in extraction.competitors) / len(
            extraction.competitors
        )
        differentiation = sum(
            diff_map.get(item.differentiation_strength, 64.0) for item in extraction.competitors
        ) / len(extraction.competitors)
        advantage = self._bounded(52.0 + differentiation * 0.38 - overlap * 0.22)
        return advantage, self._bounded(overlap)

    def _score_novelty(self, novelty: NoveltyAssessment) -> float:
        label_map = {
            "commodity": 25.0,
            "incremental": 48.0,
            "differentiated": 72.0,
            "novel": 86.0,
        }
        score = label_map.get(novelty.novelty_label, 48.0)
        score += min(len(novelty.differentiation_points) * 2.0, 6.0)
        return self._bounded(score)

    def _score_trend(self, trend: TrendAssessment) -> float:
        label_map = {
            "declining": 28.0,
            "stable": 52.0,
            "rising": 72.0,
            "hot": 86.0,
        }
        strength_map = {"weak": 38.0, "moderate": 60.0, "strong": 82.0}
        score = label_map.get(trend.trend_label, 52.0)
        if trend.trend_signals:
            average_signal = sum(strength_map.get(signal.strength, 38.0) for signal in trend.trend_signals) / len(
                trend.trend_signals
            )
            score = score * 0.7 + average_signal * 0.3
        return self._bounded(score)

    def _score_valuation(self, valuation: ValuationAssessment) -> float:
        confidence_map = {"low": 38.0, "medium": 60.0, "high": 80.0}
        method_bonus = {
            "public_comparables": 10.0,
            "revenue_multiple": 8.0,
            "traction_multiple": 8.0,
            "market_comparable": 6.0,
            "unknown": 0.0,
        }
        score = confidence_map.get(valuation.confidence, 38.0) + method_bonus.get(valuation.method, 0.0)
        if valuation.estimated_low_usd and valuation.estimated_high_usd:
            score += 6.0
        if valuation.comparable_companies:
            score += min(len(valuation.comparable_companies) * 2.0, 6.0)
        return self._bounded(score)

    def _build_search_queries(self, project: dict[str, Any]) -> list[str]:
        name = self._text(project.get("name"))
        category = self._text(project.get("category")).replace("_", " ")
        short_description = self._text(project.get("short_description"))
        market_summary = self._text(project.get("market_summary"))
        keyword_phrase = self._keyword_phrase(short_description or market_summary or name)

        queries = [
            f'"{name}" startup competitors',
            f"{keyword_phrase} alternatives competitors",
            f"{keyword_phrase} market size demand trend",
            f'"{name}" funding valuation',
        ]
        if category:
            queries.append(f"{category} startup demand competition {keyword_phrase}")
        return [query.strip() for query in queries if query.strip()]

    def _build_prompt(
        self,
        project: dict[str, Any],
        documents: list[MarketDocumentRecord],
        current_metrics: dict[str, Any],
    ) -> str:
        project_context = {
            "name": self._text(project.get("name")),
            "website_url": self._text(project.get("website_url")),
            "github_url": self._text(project.get("github_url")),
            "category": self._text(project.get("category")),
            "stage": self._text(project.get("stage")),
            "short_description": self._truncate_text(self._text(project.get("short_description")), 180),
            "description": self._truncate_text(self._text(project.get("description")), 480),
            "market_summary": self._truncate_text(self._text(project.get("market_summary")), 220),
            "traction_summary": self._truncate_text(self._text(project.get("traction_summary")), 220),
            "current_metrics": {
                key: current_metrics.get(key)
                for key in (
                    "github_stars",
                    "github_commits_90d",
                    "active_users",
                    "customers",
                    "monthly_revenue_usd",
                    "market_growth_pct",
                    "tam_usd",
                )
                if key in current_metrics
            },
        }
        documents_payload = [
            MarketSourceDocument(
                doc_id=document.doc_id,
                title=document.title,
                url=document.url,
                source_kind=document.source_kind,
                query=document.query,
                excerpt=self._truncate_text(document.excerpt, 900),
            ).model_dump(mode="json")
            for document in documents
        ]

        return (
            "You are a market diligence analyst for an autonomous venture fund. "
            "Return only JSON that matches the configured response schema. "
            "Use only the provided source documents. "
            "If a fact is unsupported, use low confidence or nulls. "
            "Every evidence_document_ids value must use only listed doc_id entries. "
            "Keep summaries concise and factual.\n"
            f"Project={self._compact_json(project_context)}\n"
            f"Documents={self._compact_json(documents_payload)}"
        )

    def _document_ids_for_competitors(self, extraction: MarketIntelligenceExtraction) -> list[str]:
        return sorted(
            {
                document_id
                for competitor in extraction.competitors
                for document_id in competitor.evidence_document_ids
                if document_id
            }
        )

    def _document_ids_for_demand(self, extraction: MarketIntelligenceExtraction) -> list[str]:
        return sorted(
            {
                document_id
                for signal in extraction.demand_signals
                for document_id in signal.evidence_document_ids
                if document_id
            }
        )

    def _document_ids_for_trend(self, extraction: MarketIntelligenceExtraction) -> list[str]:
        return sorted(
            {
                *[document_id for document_id in extraction.trend.evidence_document_ids if document_id],
                *[
                    document_id
                    for signal in extraction.trend.trend_signals
                    for document_id in signal.evidence_document_ids
                    if document_id
                ],
            }
        )

    def _source_ids_for_documents(
        self,
        source_lookup: dict[str, dict[str, Any]],
        document_ids: list[str],
    ) -> list[str]:
        return [source_lookup[document_id]["id"] for document_id in document_ids if document_id in source_lookup]

    def _urls_for_documents(self, documents: list[MarketDocumentRecord], document_ids: list[str]) -> list[str]:
        wanted = set(document_ids)
        return [document.url for document in documents if document.doc_id in wanted]

    def _make_fact(
        self,
        category: str,
        key: str,
        claim: str,
        value: Any,
        observed_at: str,
        source_ids: list[str],
        urls: list[str],
        confidence: float,
    ) -> dict[str, Any]:
        return {
            "id": self._build_id("fact", f"{category}|{key}|{self._hash_json(value)}"),
            "category": category,
            "key": key,
            "claim": claim,
            "value": value,
            "confidence": self._round(max(0.0, min(1.0, confidence)), 4),
            "observed_at": observed_at,
            "support_status": "observed",
            "freshness_days": 0,
            "contradiction_flags": [],
            "provenance": {
                "source_ids": source_ids,
                "urls": urls,
                "invocation_ids": [],
                "request_signatures": [],
            },
        }

    def _unwrap_search_url(self, value: str) -> str:
        parsed = urlparse(value)
        query = parse_qs(parsed.query)
        if "uddg" in query and query["uddg"]:
            return unquote(query["uddg"][0])
        return value

    def _extract_text_excerpt(self, html: str) -> str:
        stripped = SCRIPT_STYLE_PATTERN.sub(" ", html)
        stripped = TAG_PATTERN.sub(" ", stripped)
        stripped = unescape(stripped)
        stripped = WHITESPACE_PATTERN.sub(" ", stripped).strip()
        return self._truncate_text(stripped, 1_200)

    def _clean_html_fragment(self, value: str) -> str:
        cleaned = TAG_PATTERN.sub(" ", value)
        cleaned = unescape(cleaned)
        return WHITESPACE_PATTERN.sub(" ", cleaned).strip()

    def _keyword_phrase(self, value: str) -> str:
        tokens = re.findall(r"[a-z0-9]{4,}", value.lower())
        return " ".join(tokens[:6]) or "software product"

    def _normalize_url(self, value: str) -> str:
        text = self._text(value)
        if not text:
            return ""
        parsed = urlparse(text)
        if not parsed.scheme:
            text = f"https://{text}"
            parsed = urlparse(text)
        if parsed.scheme not in {"http", "https"}:
            return ""
        path = parsed.path or "/"
        if path != "/" and path.endswith("/"):
            path = path[:-1]
        return parsed._replace(path=path, params="", query="", fragment="").geturl()

    def _build_id(self, prefix: str, seed: str) -> str:
        return f"{prefix}_{hashlib.sha256(seed.encode('utf-8')).hexdigest()[:16]}"

    def _hash_json(self, payload: Any) -> str:
        normalized = json.dumps(payload, sort_keys=True, default=str, separators=(",", ":"))
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()

    def _bounded(self, value: float) -> float:
        return self._round(max(0.0, min(100.0, value)))

    def _round(self, value: float, digits: int = 2) -> float:
        return round(value, digits)

    def _compact_json(self, payload: Any) -> str:
        return json.dumps(payload, separators=(",", ":"), ensure_ascii=False)

    def _truncate_text(self, value: str, limit: int) -> str:
        normalized = WHITESPACE_PATTERN.sub(" ", value or "").strip()
        if len(normalized) <= limit:
            return normalized
        if limit <= 3:
            return normalized[:limit]
        return normalized[: max(0, limit - 3)].rstrip() + "..."

    def _text(self, value: Any) -> str:
        return str(value).strip() if value is not None else ""

    def _now_iso(self) -> str:
        return datetime.now(timezone.utc).isoformat()
