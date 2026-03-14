"""Tests for PaymentAgent (dry-run mode — no real chain or Alkahest required)."""
import asyncio
import unittest

# Use default Settings (no ORACLE_PRIVATE_KEY) so agent runs in dry-run
from config import Settings

from agents.payment import PaymentAgent


class TestPaymentAgentDryRun(unittest.TestCase):
    """Test payment agent in dry-run mode (no Alkahest, no private key)."""

    def setUp(self) -> None:
        self.settings = Settings()
        self.settings.ORACLE_PRIVATE_KEY = ""  # force dry-run
        self.agent = PaymentAgent(self.settings)

    async def _init_agent(self) -> None:
        await self.agent.initialize()

    def test_initialize_stays_dry_run_without_oracle_key(self) -> None:
        """Without ORACLE_PRIVATE_KEY, agent should not be ready for real payments."""
        asyncio.run(self._init_agent())
        self.assertFalse(self.agent._is_ready())

    async def _process_payment(self) -> dict:
        return await self.agent.process_payment(
            project_id="test-project-123",
            recipient_address="0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
            amount=100_000_000,  # 100e6 (e.g. 100 USDC with 6 decimals)
        )

    def test_process_payment_returns_dry_run_result(self) -> None:
        """process_payment in dry-run returns expected structure and 50/50 split."""
        asyncio.run(self._init_agent())
        result = asyncio.run(self._process_payment())

        self.assertEqual(result["project_id"], "test-project-123")
        self.assertEqual(result["status"], "dry_run")
        self.assertEqual(result["total_amount"], 100_000_000)
        self.assertEqual(result["immediate_amount"], 50_000_000)
        self.assertEqual(result["escrowed_amount"], 50_000_000)
        self.assertIsNone(result["direct_tx_hash"])
        self.assertIsNone(result["escrow_tx_hash"])
        self.assertIsNone(result["escrow_attestation_uid"])
        self.assertIn("timestamp", result)

    async def _release_escrow(self) -> dict:
        return await self.agent.release_escrow(
            project_id="test-project-123",
            escrow_attestation_uid="fake-uid-123",
        )

    def test_release_escrow_returns_dry_run_result(self) -> None:
        """release_escrow in dry-run returns released: False."""
        asyncio.run(self._init_agent())
        result = asyncio.run(self._release_escrow())

        self.assertEqual(result["project_id"], "test-project-123")
        self.assertEqual(result["status"], "dry_run")
        self.assertFalse(result["released"])
        self.assertIsNone(result.get("attestation_tx_hash"))

    async def _check_conditions(self, baseline: int, current: int) -> bool:
        return await self.agent.check_escrow_conditions(
            "test-project-123",
            {"baseline_users": baseline, "user_count": current},
        )

    def test_check_escrow_conditions_met_when_growth_above_target(self) -> None:
        """When growth % >= ESCROW_GROWTH_TARGET (default 30%), conditions are met."""
        asyncio.run(self._init_agent())
        # 1000 -> 1300 = 30% growth
        self.assertTrue(asyncio.run(self._check_conditions(1000, 1300)))
        # 1000 -> 1400 = 40% growth
        self.assertTrue(asyncio.run(self._check_conditions(1000, 1400)))

    def test_check_escrow_conditions_not_met_when_growth_below_target(self) -> None:
        """When growth % < target, conditions are not met."""
        asyncio.run(self._init_agent())
        # 1000 -> 1200 = 20% growth (target 30%)
        self.assertFalse(asyncio.run(self._check_conditions(1000, 1200)))

    def test_check_escrow_conditions_no_baseline_returns_false(self) -> None:
        """When baseline_users is 0 or missing, returns False."""
        asyncio.run(self._init_agent())

        async def run():
            return await self.agent.check_escrow_conditions(
                "test-project-123",
                {"user_count": 1000},
            )

        self.assertFalse(asyncio.run(run()))


if __name__ == "__main__":
    unittest.main()
