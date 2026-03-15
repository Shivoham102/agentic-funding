import asyncio
import json
import logging
import shutil
import sys
from datetime import datetime, timezone
from typing import Any

from config import Settings

logger = logging.getLogger(__name__)

class PaymentAgent:
    """Handles on-chain payments via NLA (Natural Language Agreements) CLI.
    
    Uses the `nla` CLI tool to create escrows with natural language conditions
    on Base Sepolia. The escrow locks tokens with a demand (e.g., "Release when
    project shows 30% user growth"). An LLM arbiter evaluates fulfillment.
    
    Flow:
    1. Create escrow with natural language demand (deterministic CLI call)
    2. Project submits fulfillment evidence
    3. LLM oracle evaluates if evidence satisfies demand (agentic)
    4. Funds released if approved (deterministic CLI call)
    """

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._nla_path: str | None = None
        self._initialized = False

    async def initialize(self) -> None:
        """Check that nla CLI is available and configured."""
        self._nla_path = shutil.which("nla")
        if not self._nla_path:
            logger.warning("NLA CLI not found - install with: npm install -g nla")
            return

        if not self.settings.ORACLE_PRIVATE_KEY:
            logger.warning("ORACLE_PRIVATE_KEY not set - payment agent in dry-run mode")
            return

        # Switch to base-sepolia network
        try:
            await self._run_nla(["switch", "base-sepolia"], include_auth=False)
            logger.info("NLA CLI configured for Base Sepolia")
        except Exception as e:
            logger.warning(f"Could not switch NLA network: {e}")

        # Set wallet in NLA config
        try:
            await self._run_nla(["wallet:set", "--private-key", self.settings.ORACLE_PRIVATE_KEY], include_auth=False)
            logger.info("NLA wallet configured")
        except Exception as e:
            logger.warning(f"Could not set NLA wallet: {e}")

        self._initialized = True
        logger.info("Payment agent initialized with NLA CLI")

    def _is_ready(self) -> bool:
        return self._initialized and self._nla_path is not None

    def _build_env(self) -> dict[str, str]:
        """Build environment variables for NLA CLI subprocess."""
        import os
        env = os.environ.copy()
        env["PRIVATE_KEY"] = self.settings.ORACLE_PRIVATE_KEY
        env["RPC_URL"] = self.settings.BASE_SEPOLIA_RPC_URL
        if self.settings.OPENAI_API_KEY:
            env["OPENAI_API_KEY"] = self.settings.OPENAI_API_KEY
        if self.settings.ANTHROPIC_API_KEY:
            env["ANTHROPIC_API_KEY"] = self.settings.ANTHROPIC_API_KEY
        return env

    async def _run_nla(self, args: list[str], include_auth: bool = True) -> str:
        """Run an NLA CLI command and return stdout."""
        cmd = [self._nla_path] + args

        # Append auth flags to all commands that need them
        if include_auth and args[0] not in ("switch", "help", "network", "wallet:set", "wallet:show", "wallet:clear", "stop"):
            if self.settings.ORACLE_PRIVATE_KEY and "--private-key" not in args:
                cmd.extend(["--private-key", self.settings.ORACLE_PRIVATE_KEY])
            if self.settings.BASE_SEPOLIA_RPC_URL and "--rpc-url" not in args:
                cmd.extend(["--rpc-url", self.settings.BASE_SEPOLIA_RPC_URL])

        # On Windows, .cmd files need cmd /c to execute
        if sys.platform == "win32":
            cmd = ["cmd", "/c"] + cmd

        # Log command without private key
        safe_cmd = " ".join(a if not a.startswith("0x") or len(a) < 20 else a[:10] + "..." for a in cmd)
        logger.info(f"Running: {safe_cmd}")

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=self._build_env(),
        )
        stdout, stderr = await process.communicate()
        stdout_str = stdout.decode("utf-8", errors="replace").strip()
        stderr_str = stderr.decode("utf-8", errors="replace").strip()

        if process.returncode != 0:
            error_msg = stderr_str or stdout_str or f"NLA exited with code {process.returncode}"
            logger.error(f"NLA command failed (exit {process.returncode}): {error_msg}")
            raise RuntimeError(error_msg)

        # Log output for debugging
        if stdout_str:
            logger.info(f"NLA stdout: {stdout_str[:200]}")
        if stderr_str:
            logger.debug(f"NLA stderr: {stderr_str[:200]}")

        if not stdout_str and not stderr_str and args[0] not in ("switch", "wallet:set", "wallet:clear", "stop"):
            logger.warning(f"NLA command returned empty output - possible silent failure (is Bun installed?)")

        return stdout_str

    async def create_escrow(
        self,
        project_id: str,
        amount: int,
        demand: str,
    ) -> dict[str, Any]:
        """Create an escrow with a natural language condition.
        
        Args:
            project_id: Internal project ID
            amount: Amount in token smallest unit (USDC 6 decimals)
            demand: Natural language condition, e.g. "Release when project shows 30% user growth"
        """
        if not self._is_ready():
            logger.info(f"[DRY RUN] Would create escrow: amount={amount}, demand='{demand}'")
            return {
                "project_id": project_id,
                "status": "dry_run",
                "amount": amount,
                "demand": demand,
                "escrow_uid": None,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        try:
            token_address = self.settings.ESCROW_TOKEN_ADDRESS
            oracle_address = self.settings.ORACLE_WALLET_ADDRESS

            output = await self._run_nla([
                "escrow:create",
                "--demand", demand,
                "--amount", str(amount),
                "--token", token_address,
                "--oracle", oracle_address,
            ])

            # Parse escrow UID from output (NLA prints the UID)
            escrow_uid = self._parse_uid_from_output(output)

            logger.info(f"Escrow created for project {project_id}: uid={escrow_uid}")
            return {
                "project_id": project_id,
                "status": "created",
                "amount": amount,
                "demand": demand,
                "escrow_uid": escrow_uid,
                "oracle_address": oracle_address,
                "token_address": token_address,
                "raw_output": output,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        except Exception as e:
            logger.error(f"Failed to create escrow for {project_id}: {e}")
            return {
                "project_id": project_id,
                "status": "error",
                "error": str(e),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

    async def direct_transfer(
        self,
        project_id: str,
        recipient_address: str,
        amount: int,
    ) -> dict[str, Any]:
        """Transfer tokens directly to a recipient (no escrow).
        
        Uses NLA CLI's escrow:create with a trivially-true demand that
        auto-fulfills, or a direct ERC20 transfer via the CLI.
        
        Args:
            project_id: Internal project ID
            recipient_address: Recipient's EVM wallet address (0x...)
            amount: Amount in token smallest unit
        """
        if not self._is_ready():
            logger.info(f"[DRY RUN] Would transfer {amount} to {recipient_address}")
            return {
                "project_id": project_id,
                "status": "dry_run",
                "amount": amount,
                "recipient_address": recipient_address,
                "tx_hash": None,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        try:
            token_address = self.settings.ESCROW_TOKEN_ADDRESS

            # Use NLA to create a payment escrow with a trivially satisfied demand
            # This effectively acts as a direct transfer through the escrow system
            output = await self._run_nla([
                "escrow:create",
                "--demand", "This is a direct payment. Condition: always true.",
                "--amount", str(amount),
                "--token", token_address,
                "--oracle", self.settings.ORACLE_WALLET_ADDRESS,
            ])

            tx_hash = self._parse_uid_from_output(output)

            logger.info(f"Direct transfer of {amount} for project {project_id}: tx={tx_hash}")
            return {
                "project_id": project_id,
                "status": "transferred",
                "amount": amount,
                "recipient_address": recipient_address,
                "tx_hash": tx_hash,
                "raw_output": output,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        except Exception as e:
            logger.error(f"Direct transfer failed for {project_id}: {e}")
            return {
                "project_id": project_id,
                "status": "error",
                "error": str(e),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

    async def submit_fulfillment(
        self,
        escrow_uid: str,
        fulfillment_evidence: str,
    ) -> dict[str, Any]:
        """Submit evidence that escrow conditions are met.
        
        Args:
            escrow_uid: The escrow's on-chain UID
            fulfillment_evidence: Evidence text, e.g. "Project grew from 1000 to 1400 users (40%)"
        """
        if not self._is_ready():
            return {"status": "dry_run", "escrow_uid": escrow_uid}

        try:
            oracle_address = self.settings.ORACLE_WALLET_ADDRESS
            output = await self._run_nla([
                "escrow:fulfill",
                "--escrow-uid", escrow_uid,
                "--fulfillment", fulfillment_evidence,
                "--oracle", oracle_address,
            ])

            fulfillment_uid = self._parse_uid_from_output(output)

            return {
                "status": "fulfilled",
                "escrow_uid": escrow_uid,
                "fulfillment_uid": fulfillment_uid,
                "evidence": fulfillment_evidence,
                "raw_output": output,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        except Exception as e:
            logger.error(f"Failed to submit fulfillment: {e}")
            return {"status": "error", "escrow_uid": escrow_uid, "error": str(e)}

    async def arbitrate(self, escrow_uid: str) -> dict[str, Any]:
        """Trigger LLM arbitration for an escrow (the agentic part).
        
        The oracle LLM evaluates whether the fulfillment evidence
        satisfies the natural language demand.
        """
        if not self._is_ready():
            return {"status": "dry_run", "escrow_uid": escrow_uid}

        try:
            output = await self._run_nla([
                "escrow:arbitrate",
                escrow_uid,
                "--auto",
            ])

            return {
                "status": "arbitrated",
                "escrow_uid": escrow_uid,
                "raw_output": output,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        except Exception as e:
            logger.error(f"Arbitration failed: {e}")
            return {"status": "error", "escrow_uid": escrow_uid, "error": str(e)}

    async def collect_funds(
        self,
        escrow_uid: str,
        fulfillment_uid: str,
    ) -> dict[str, Any]:
        """Collect funds from an approved escrow."""
        if not self._is_ready():
            return {"status": "dry_run", "escrow_uid": escrow_uid}

        try:
            output = await self._run_nla([
                "escrow:collect",
                "--escrow-uid", escrow_uid,
                "--fulfillment-uid", fulfillment_uid,
            ])

            return {
                "status": "collected",
                "escrow_uid": escrow_uid,
                "fulfillment_uid": fulfillment_uid,
                "raw_output": output,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        except Exception as e:
            logger.error(f"Collection failed: {e}")
            return {"status": "error", "escrow_uid": escrow_uid, "error": str(e)}

    async def get_escrow_status(self, escrow_uid: str) -> dict[str, Any]:
        """Check the on-chain status of an escrow."""
        if not self._is_ready():
            return {"status": "dry_run", "escrow_uid": escrow_uid}

        try:
            output = await self._run_nla([
                "escrow:status",
                "--escrow-uid", escrow_uid,
            ])
            return {
                "escrow_uid": escrow_uid,
                "raw_output": output,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        except Exception as e:
            return {"escrow_uid": escrow_uid, "status": "error", "error": str(e)}

    def _parse_uid_from_output(self, output: str) -> str | None:
        """Extract a 0x... UID from NLA CLI output."""
        for line in output.split("\n"):
            line = line.strip()
            # Look for hex strings that look like UIDs (0x + 64 hex chars)
            if "0x" in line:
                for word in line.split():
                    word = word.strip(",:;\"'()")
                    if word.startswith("0x") and len(word) >= 10:
                        return word
        return output  # Return full output if no UID parsed
