from __future__ import annotations

import asyncio
import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

import httpx


GITHUB_CACHE_TTL_SECONDS = 21_600


class GitHubEnrichmentClient:
    """Collect deterministic repository signals from the public GitHub API."""

    def __init__(
        self,
        api_url: str = "https://api.github.com",
        api_token: str = "",
        timeout_seconds: float = 20.0,
        max_retries: int = 2,
        commits_lookback_days: int = 90,
        max_pages: int = 5,
        cache_ttl_seconds: int = GITHUB_CACHE_TTL_SECONDS,
        unauthenticated_commits_lookback_days: int = 30,
        unauthenticated_max_pages: int = 1,
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.api_token = api_token
        self.timeout_seconds = timeout_seconds
        self.max_retries = max(0, int(max_retries))
        self.commits_lookback_days = max(1, int(commits_lookback_days))
        self.max_pages = max(1, int(max_pages))
        self.cache_ttl_seconds = max(300, int(cache_ttl_seconds))
        self.unauthenticated_commits_lookback_days = max(1, int(unauthenticated_commits_lookback_days))
        self.unauthenticated_max_pages = max(1, int(unauthenticated_max_pages))
        self._cache: dict[str, dict[str, Any]] = {}

    async def collect_repository_enrichment(self, repository_url: str) -> dict[str, Any]:
        owner, repo = self._parse_repo_url(repository_url)
        observed_at = self._now_iso()
        repo_path = f"/repos/{owner}/{repo}"
        api_authenticated = bool(self.api_token)
        effective_lookback_days = (
            self.commits_lookback_days
            if api_authenticated
            else min(self.commits_lookback_days, self.unauthenticated_commits_lookback_days)
        )
        effective_max_pages = self.max_pages if api_authenticated else min(self.max_pages, self.unauthenticated_max_pages)
        cache_key = self._build_cache_key(owner, repo, effective_lookback_days, effective_max_pages, api_authenticated)
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        notes: list[str] = []
        if not api_authenticated:
            notes.append("GitHub enrichment ran without a token; using a low-budget API plan.")

        repo_response = await self._request_json(repo_path)
        contributors_response, contributors_note, contributors_rate_limited = await self._request_json_soft(
            f"{repo_path}/contributors?per_page=100&anon=1",
            default=[],
            label="contributors",
        )
        releases_response, releases_note, releases_rate_limited = await self._request_json_soft(
            f"{repo_path}/releases?per_page=20",
            default=[],
            label="releases",
        )
        readme_response, readme_note, readme_rate_limited = await self._request_json_soft(
            f"{repo_path}/readme",
            default=None,
            label="README",
        )
        commits_response = await self._collect_commit_pages(
            owner=owner,
            repo=repo,
            lookback_days=effective_lookback_days,
            max_pages=effective_max_pages,
        )

        for note in (
            contributors_note,
            releases_note,
            readme_note,
            commits_response.get("note"),
        ):
            if note:
                notes.append(note)

        repository = repo_response if isinstance(repo_response, dict) else {}
        contributors = contributors_response if isinstance(contributors_response, list) else []
        releases = releases_response if isinstance(releases_response, list) else []
        has_readme = isinstance(readme_response, dict) and bool(readme_response)
        commit_items = commits_response["items"]

        pushed_at = self._parse_datetime(repository.get("pushed_at"))
        created_at = self._parse_datetime(repository.get("created_at"))
        latest_release_at = self._latest_release_at(releases)

        contributor_count = len([item for item in contributors if isinstance(item, dict)])
        commits_lookback_count = len(commit_items)
        release_count = len([item for item in releases if isinstance(item, dict)])
        recent_release_count = len(
            [
                item
                for item in releases
                if isinstance(item, dict) and self._is_recent(item.get("published_at"), 180)
            ]
        )
        docs_quality_score = self._docs_quality_score(repository, has_readme, release_count)
        product_readiness_score = self._product_readiness_score(
            repository=repository,
            has_readme=has_readme,
            commits_lookback_count=commits_lookback_count,
            recent_release_count=recent_release_count,
            pushed_at=pushed_at,
        )

        partial_enrichment = bool(
            contributors_note
            or releases_note
            or readme_note
            or commits_response["partial"]
        )
        rate_limited = bool(
            contributors_rate_limited
            or releases_rate_limited
            or readme_rate_limited
            or commits_response["rate_limited"]
        )

        risk_flags: list[str] = []
        if repository.get("archived") is True:
            risk_flags.append("github_repo_archived")
        if repository.get("disabled") is True:
            risk_flags.append("github_repo_disabled")
        days_since_push = self._days_since(pushed_at)
        if days_since_push is not None and days_since_push > 180:
            risk_flags.append("github_repo_stale")
        if commits_response["truncated"]:
            risk_flags.append("github_commit_count_truncated")
        if partial_enrichment:
            risk_flags.append("github_partial_enrichment")
        if rate_limited:
            risk_flags.append("github_api_rate_limited")

        metrics = {
            "github_stars": self._to_float(repository.get("stargazers_count")),
            "github_forks": self._to_float(repository.get("forks_count")),
            "github_watchers": self._to_float(repository.get("subscribers_count") or repository.get("watchers_count")),
            "github_open_issues": self._to_float(repository.get("open_issues_count")),
            "repo_contributors": float(contributor_count),
            "github_commits_90d": float(commits_lookback_count),
            "github_release_count": float(release_count),
            "github_recent_release_count": float(recent_release_count),
            "github_repo_age_days": self._to_float(self._days_since(created_at)),
            "github_days_since_last_push": self._to_float(days_since_push),
            "docs_quality_score": docs_quality_score,
            "product_readiness_score": product_readiness_score,
            "github_api_authenticated": 1.0 if api_authenticated else 0.0,
            "github_partial_enrichment": 1.0 if partial_enrichment else 0.0,
            "github_rate_limited": 1.0 if rate_limited else 0.0,
            "github_commit_pages_fetched": float(commits_response["pages_fetched"]),
            # Releases are the closest deterministic proxy here to deployment cadence.
            "deployments_count": float(recent_release_count),
            "risk_flags": risk_flags,
        }

        summary = {
            "repository": {
                "url": repository_url,
                "owner": owner,
                "name": repo,
                "full_name": self._text(repository.get("full_name")) or f"{owner}/{repo}",
                "description": self._text(repository.get("description")),
                "homepage": self._text(repository.get("homepage")),
                "language": self._text(repository.get("language")),
                "topics": repository.get("topics") if isinstance(repository.get("topics"), list) else [],
                "default_branch": self._text(repository.get("default_branch")),
                "archived": bool(repository.get("archived")),
                "disabled": bool(repository.get("disabled")),
                "created_at": repository.get("created_at"),
                "updated_at": repository.get("updated_at"),
                "pushed_at": repository.get("pushed_at"),
                "has_readme": has_readme,
                "latest_release_at": latest_release_at.isoformat() if latest_release_at else None,
            },
            "metrics": metrics,
            "notes": notes,
            "partial_enrichment": partial_enrichment,
            "rate_limited": rate_limited,
            "api_authenticated": api_authenticated,
            "derived_signals": {
                "docs_quality_score": docs_quality_score,
                "product_readiness_score": product_readiness_score,
                "days_since_last_push": days_since_push,
                "commit_count_truncated": commits_response["truncated"],
                "commit_pages_fetched": commits_response["pages_fetched"],
            },
        }

        api_calls = [
            self._build_api_call(
                label="GitHub repository metadata",
                method="GET",
                endpoint=f"{self.api_url}{repo_path}",
                request_signature=f"github_repo:{owner}/{repo}",
                observed_at=observed_at,
                payload=repository,
            ),
            self._build_api_call(
                label="GitHub contributors",
                method="GET",
                endpoint=f"{self.api_url}{repo_path}/contributors",
                request_signature=f"github_contributors:{owner}/{repo}",
                observed_at=observed_at,
                payload=contributors,
            ),
            self._build_api_call(
                label="GitHub releases",
                method="GET",
                endpoint=f"{self.api_url}{repo_path}/releases",
                request_signature=f"github_releases:{owner}/{repo}",
                observed_at=observed_at,
                payload=releases,
            ),
            self._build_api_call(
                label="GitHub README",
                method="GET",
                endpoint=f"{self.api_url}{repo_path}/readme",
                request_signature=f"github_readme:{owner}/{repo}",
                observed_at=observed_at,
                payload=readme_response if readme_response is not None else {"found": False},
            ),
            self._build_api_call(
                label="GitHub commits in lookback window",
                method="GET",
                endpoint=f"{self.api_url}{repo_path}/commits",
                request_signature=f"github_commits:{owner}/{repo}:{effective_lookback_days}",
                observed_at=observed_at,
                payload={
                    "since": commits_response["since"],
                    "count": commits_lookback_count,
                    "truncated": commits_response["truncated"],
                    "partial": commits_response["partial"],
                    "rate_limited": commits_response["rate_limited"],
                    "pages_fetched": commits_response["pages_fetched"],
                    "items": commit_items,
                },
            ),
        ]

        result = {
            "summary": summary,
            "metrics": metrics,
            "api_calls": api_calls,
        }
        self._set_cached(cache_key, result)
        return result

    async def _collect_commit_pages(
        self,
        owner: str,
        repo: str,
        lookback_days: int,
        max_pages: int,
    ) -> dict[str, Any]:
        since = (datetime.now(timezone.utc) - timedelta(days=lookback_days)).isoformat()
        items: list[dict[str, Any]] = []
        truncated = False
        partial = False
        rate_limited = False
        note: str | None = None
        pages_fetched = 0

        for page in range(1, max_pages + 1):
            payload, page_note, page_rate_limited = await self._request_json_soft(
                f"/repos/{owner}/{repo}/commits?per_page=100&page={page}&since={since}",
                default=[],
                label=f"commits page {page}",
            )
            if page_note:
                note = page_note
                partial = True
                rate_limited = rate_limited or page_rate_limited
                break
            if not isinstance(payload, list) or not payload:
                break

            page_items = [item for item in payload if isinstance(item, dict)]
            items.extend(page_items)
            pages_fetched += 1
            if len(payload) < 100:
                break
            if page == max_pages:
                truncated = True

        return {
            "since": since,
            "items": items,
            "truncated": truncated,
            "partial": partial,
            "rate_limited": rate_limited,
            "note": note,
            "pages_fetched": pages_fetched,
        }

    async def _request_json_soft(
        self,
        path: str,
        default: dict[str, Any] | list[Any] | None,
        label: str,
    ) -> tuple[dict[str, Any] | list[Any] | None, str | None, bool]:
        try:
            payload = await self._request_json(path)
        except RuntimeError as exc:
            message = str(exc)
            lowered = message.lower()
            if "404" in lowered and default is None:
                return default, None, False
            if self._is_rate_limited(lowered):
                return default, f"GitHub rate limit hit for {label}; using partial repository signals.", True
            return default, f"GitHub optional request failed for {label}; using partial repository signals.", False
        return payload, None, False

    async def _request_json(self, path: str) -> dict[str, Any] | list[Any]:
        headers = {
            "Accept": "application/vnd.github+json",
            "User-Agent": "AutoVC-Diligence-Agent",
        }
        if self.api_token:
            headers["Authorization"] = f"Bearer {self.api_token}"

        timeout = httpx.Timeout(self.timeout_seconds)
        url = f"{self.api_url}{path}"
        last_error: Exception | None = None

        for attempt in range(self.max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                    response = await client.get(url, headers=headers)
                    try:
                        response.raise_for_status()
                    except httpx.HTTPStatusError as exc:
                        raise RuntimeError(self._github_http_error(path, exc.response)) from exc
                    data = response.json()
                    if not isinstance(data, (dict, list)):
                        raise RuntimeError(f"Unexpected GitHub response type for {path}")
                    return data
            except (httpx.HTTPError, ValueError, RuntimeError) as exc:
                last_error = exc
                lowered = str(exc).lower()
                if attempt >= self.max_retries or self._is_rate_limited(lowered) or "http 4" in lowered:
                    break
                await asyncio.sleep(0.5 * (2**attempt))

        raise RuntimeError(f"GitHub API request failed for {path}: {last_error}")

    def _github_http_error(self, path: str, response: httpx.Response) -> str:
        status_code = response.status_code
        detail = ""
        try:
            payload = response.json()
        except ValueError:
            detail = response.text[:240].strip()
        else:
            if isinstance(payload, dict):
                detail = self._text(payload.get("message"))[:240]
        if status_code == 403 and self._is_rate_limited(detail.lower()):
            return f"GitHub API rate limit hit for {path}"
        if detail:
            return f"HTTP {status_code} {detail}"
        return f"HTTP {status_code}"

    def _is_rate_limited(self, message: str) -> bool:
        return "rate limit" in message or "secondary rate limit" in message

    def _build_cache_key(
        self,
        owner: str,
        repo: str,
        lookback_days: int,
        max_pages: int,
        api_authenticated: bool,
    ) -> str:
        payload = {
            "owner": owner,
            "repo": repo,
            "lookback_days": lookback_days,
            "max_pages": max_pages,
            "api_authenticated": api_authenticated,
        }
        normalized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()

    def _get_cached(self, cache_key: str) -> dict[str, Any] | None:
        cached = self._cache.get(cache_key)
        if not isinstance(cached, dict):
            return None
        cached_at = cached.get("cached_at")
        if not isinstance(cached_at, datetime):
            return None
        age_seconds = (datetime.now(timezone.utc) - cached_at).total_seconds()
        if age_seconds > self.cache_ttl_seconds:
            self._cache.pop(cache_key, None)
            return None
        return cached.get("value")

    def _set_cached(self, cache_key: str, value: dict[str, Any]) -> None:
        self._cache[cache_key] = {
            "cached_at": datetime.now(timezone.utc),
            "value": value,
        }

    def _build_api_call(
        self,
        label: str,
        method: str,
        endpoint: str,
        request_signature: str,
        observed_at: str,
        payload: Any,
    ) -> dict[str, Any]:
        return {
            "label": label,
            "method": method,
            "endpoint": endpoint,
            "request_signature": request_signature,
            "observed_at": observed_at,
            "payload": payload,
        }

    def _parse_repo_url(self, repository_url: str) -> tuple[str, str]:
        parsed = urlparse(repository_url)
        if parsed.netloc.lower() not in {"github.com", "www.github.com"}:
            raise ValueError("GitHub enrichment requires a github.com repository URL")

        parts = [part for part in parsed.path.split("/") if part]
        if len(parts) < 2:
            raise ValueError("GitHub repository URL must include owner and repo name")

        owner = parts[0]
        repo = parts[1].removesuffix(".git")
        return owner, repo

    def _docs_quality_score(self, repository: dict[str, Any], has_readme: bool, release_count: int) -> float:
        score = 0.0
        if self._text(repository.get("description")):
            score += 20.0
        if self._text(repository.get("homepage")):
            score += 20.0
        if has_readme:
            score += 25.0
        topics = repository.get("topics")
        if isinstance(topics, list) and topics:
            score += 15.0
        if release_count > 0:
            score += 20.0
        return round(min(100.0, score), 2)

    def _product_readiness_score(
        self,
        repository: dict[str, Any],
        has_readme: bool,
        commits_lookback_count: int,
        recent_release_count: int,
        pushed_at: datetime | None,
    ) -> float:
        score = 15.0
        if not repository.get("archived"):
            score += 15.0
        if not repository.get("disabled"):
            score += 10.0
        if has_readme:
            score += 15.0
        if self._text(repository.get("homepage")):
            score += 10.0
        if commits_lookback_count >= 100:
            score += 25.0
        elif commits_lookback_count >= 40:
            score += 18.0
        elif commits_lookback_count >= 10:
            score += 10.0
        if recent_release_count >= 3:
            score += 15.0
        elif recent_release_count >= 1:
            score += 8.0

        days_since_push = self._days_since(pushed_at)
        if days_since_push is not None and days_since_push <= 30:
            score += 10.0
        elif days_since_push is not None and days_since_push > 180:
            score -= 12.0

        return round(max(0.0, min(100.0, score)), 2)

    def _latest_release_at(self, releases: list[dict[str, Any]]) -> datetime | None:
        parsed = [self._parse_datetime(item.get("published_at")) for item in releases if isinstance(item, dict)]
        available = [value for value in parsed if value is not None]
        return max(available) if available else None

    def _is_recent(self, value: Any, days: int) -> bool:
        parsed = self._parse_datetime(value)
        if parsed is None:
            return False
        return self._days_since(parsed) is not None and self._days_since(parsed) <= days

    def _days_since(self, value: datetime | None) -> int | None:
        if value is None:
            return None
        delta = datetime.now(timezone.utc) - value
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

    def _text(self, value: Any) -> str:
        return value.strip() if isinstance(value, str) else ""

    def _to_float(self, value: Any) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    def _now_iso(self) -> str:
        return datetime.now(timezone.utc).isoformat()
