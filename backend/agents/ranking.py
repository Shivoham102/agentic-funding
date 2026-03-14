import random
from typing import Any


class RankingAgent:
    """Agent that ranks projects based on multiple evaluation factors."""

    async def rank_projects(self, projects: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Ranks projects based on multiple factors: project quality, team,
        traction, funding availability.

        Returns projects sorted by ranking score.
        """
        # TODO: Replace random scores with a real ranking algorithm that considers:
        #   - Normalised project data quality
        #   - Team experience & credibility
        #   - Traction metrics (users, TVL, tx volume)
        #   - Funding availability & project category demand
        scored: list[dict[str, Any]] = []
        for project in projects:
            project_copy = dict(project)
            project_copy["ranking_score"] = round(random.uniform(0.0, 100.0), 2)
            scored.append(project_copy)

        scored.sort(key=lambda p: p.get("ranking_score", 0.0), reverse=True)
        return scored
