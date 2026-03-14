from typing import Any


class DataCollectorAgent:
    """Agent that collects and normalises project data using the Unbrowse API."""

    def __init__(self, unbrowse_api_key: str) -> None:
        self.unbrowse_api_key = unbrowse_api_key

    async def collect_and_normalize(self, project: dict[str, Any]) -> dict[str, Any]:
        """Uses Unbrowse to scrape project website and normalize data.

        Returns normalized project data.
        """
        # TODO: Integrate with the Unbrowse API to:
        #   1. Scrape the project's website_url for key metrics (team size, TVL, users, etc.)
        #   2. Optionally scrape the github_url for repo activity metrics.
        #   3. Normalise all collected data into a consistent schema.
        return {
            "project_name": project.get("name", ""),
            "website_scraped": False,
            "github_scraped": False,
            "metrics": {},
            "raw_data": {},
            "_placeholder": True,
        }
