"""Tests for PaymentAgent (dry-run mode — no real chain or NLA CLI required)."""
import asyncio
import unittest

# Use default Settings (no ORACLE_PRIVATE_KEY) so agent runs in dry-run
from config import Settings

from agents.payment import PaymentAgent


class TestPaymentAgentDryRun(unittest.TestCase):
    """Test payment agent in dry-run mode (no NLA CLI, no private key)."""

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

    async def _create_escrow(self) -> dict:
        return await self.agent.create_escrow(
            project_id="test-project-123",
            amount=100_000_000,  # 100e6 (e.g. 100 USDC with 6 decimals)
            demand="Release when project shows 30% user growth",
        )

    def test_create_escrow_returns_dry_run_result(self) -> None:
        """create_escrow in dry-run returns expected structure."""
        asyncio.run(self._init_agent())
        result = asyncio.run(self._create_escrow())

        self.assertEqual(result["project_id"], "test-project-123")
        self.assertEqual(result["status"], "dry_run")
        self.assertEqual(result["amount"], 100_000_000)
        self.assertEqual(result["demand"], "Release when project shows 30% user growth")
        self.assertIsNone(result["escrow_uid"])
        self.assertIn("timestamp", result)

    async def _submit_fulfillment(self) -> dict:
        return await self.agent.submit_fulfillment(
            escrow_uid="0xfake-escrow-uid",
            fulfillment_evidence="Project grew from 1000 to 1400 users (40%)",
        )

    def test_submit_fulfillment_returns_dry_run_result(self) -> None:
        """submit_fulfillment in dry-run returns expected structure."""
        asyncio.run(self._init_agent())
        result = asyncio.run(self._submit_fulfillment())

        self.assertEqual(result["status"], "dry_run")
        self.assertEqual(result["escrow_uid"], "0xfake-escrow-uid")

    async def _arbitrate(self) -> dict:
        return await self.agent.arbitrate(escrow_uid="0xfake-escrow-uid")

    def test_arbitrate_returns_dry_run_result(self) -> None:
        """arbitrate in dry-run returns expected structure."""
        asyncio.run(self._init_agent())
        result = asyncio.run(self._arbitrate())

        self.assertEqual(result["status"], "dry_run")
        self.assertEqual(result["escrow_uid"], "0xfake-escrow-uid")

    async def _collect_funds(self) -> dict:
        return await self.agent.collect_funds(
            escrow_uid="0xfake-escrow-uid",
            fulfillment_uid="0xfake-fulfillment-uid",
        )

    def test_collect_funds_returns_dry_run_result(self) -> None:
        """collect_funds in dry-run returns expected structure."""
        asyncio.run(self._init_agent())
        result = asyncio.run(self._collect_funds())

        self.assertEqual(result["status"], "dry_run")
        self.assertEqual(result["escrow_uid"], "0xfake-escrow-uid")

    async def _get_escrow_status(self) -> dict:
        return await self.agent.get_escrow_status(escrow_uid="0xfake-escrow-uid")

    def test_get_escrow_status_returns_dry_run_result(self) -> None:
        """get_escrow_status in dry-run returns expected structure."""
        asyncio.run(self._init_agent())
        result = asyncio.run(self._get_escrow_status())

        self.assertEqual(result["status"], "dry_run")
        self.assertEqual(result["escrow_uid"], "0xfake-escrow-uid")

    def test_parse_uid_from_output_extracts_hex(self) -> None:
        """_parse_uid_from_output should extract 0x hex UIDs."""
        uid = self.agent._parse_uid_from_output(
            "Escrow created: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
        )
        self.assertTrue(uid.startswith("0x"))
        self.assertGreater(len(uid), 10)

    def test_parse_uid_from_output_returns_full_when_no_hex(self) -> None:
        """When no 0x UID found, returns full output."""
        output = "Some output without hex"
        result = self.agent._parse_uid_from_output(output)
        self.assertEqual(result, output)


if __name__ == "__main__":
    unittest.main()
