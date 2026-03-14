import logging
from typing import Any
from datetime import datetime, timezone

from agents.payment import PaymentAgent
from agents.data_collector import DataCollectorAgent

logger = logging.getLogger(__name__)


class EscrowOracle:
    """Off-chain oracle that monitors project metrics and releases escrows.

    Periodically checks funded projects' performance against their
    escrow conditions. When conditions are met, submits on-chain
    attestations to release escrowed funds.
    """

    def __init__(
        self,
        payment_agent: PaymentAgent,
        data_collector: DataCollectorAgent,
    ) -> None:
        self.payment_agent = payment_agent
        self.data_collector = data_collector

    async def check_project(self, project: dict) -> dict[str, Any]:
        """Check a single project's escrow conditions.

        Args:
            project: Project document from MongoDB with escrow details
        """
        project_id = project.get("id", project.get("_id", "unknown"))
        escrow_info = project.get("escrow_info", {})

        if not escrow_info or escrow_info.get("status") == "released":
            return {"project_id": project_id, "action": "skip", "reason": "no active escrow"}

        # Collect current metrics using data collector
        try:
            metrics = await self.data_collector.collect_and_normalize(project)
        except Exception as e:
            logger.error(f"Failed to collect metrics for {project_id}: {e}")
            return {"project_id": project_id, "action": "error", "error": str(e)}

        # Check if conditions are met
        escrow_metrics = {
            "user_count": metrics.get("current_users", 0),
            "baseline_users": escrow_info.get("baseline_users", 0),
        }

        conditions_met = await self.payment_agent.check_escrow_conditions(
            project_id, escrow_metrics
        )

        if not conditions_met:
            return {
                "project_id": project_id,
                "action": "waiting",
                "metrics": escrow_metrics,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        # Conditions met - release escrow
        escrow_uid = escrow_info.get("escrow_attestation_uid")
        if not escrow_uid:
            logger.warning(f"No escrow attestation UID for project {project_id}")
            return {"project_id": project_id, "action": "error", "error": "missing escrow UID"}

        release_result = await self.payment_agent.release_escrow(project_id, escrow_uid)

        return {
            "project_id": project_id,
            "action": "released" if release_result.get("released") else "release_failed",
            "release_result": release_result,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    async def run_check_cycle(self, funded_projects: list[dict]) -> list[dict]:
        """Run a full check cycle across all funded projects with active escrows."""
        results = []
        for project in funded_projects:
            result = await self.check_project(project)
            results.append(result)
            logger.info(f"Oracle check: {result['project_id']} -> {result['action']}")
        return results
