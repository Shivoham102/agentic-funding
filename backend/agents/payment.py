import logging
from typing import Any
from datetime import datetime, timezone

try:
    from eth_abi import encode
except ImportError:
    encode = None

try:
    from alkahest_py import AlkahestClient
except ImportError:
    try:
        from alkahest_py.alkahest_py import AlkahestClient
    except ImportError:
        AlkahestClient = None

from config import Settings

logger = logging.getLogger(__name__)

# Lazy import: alkahest-py may not export AlkahestClient in all versions; app still starts without it.
def _get_alkahest_client():
    try:
        from alkahest_py import AlkahestClient
        return AlkahestClient
    except (ImportError, AttributeError) as e:
        try:
            from alkahest_py.alkahest_py import AlkahestClient
            return AlkahestClient
        except (ImportError, AttributeError):
            logger.debug("AlkahestClient not available: %s", e)
            return None


class PaymentAgent:
    """Handles on-chain payments via Alkahest escrow on Base Sepolia.

    Flow:
    1. Approve tokens for payment + escrow
    2. 50% direct transfer via create_payment_obligation
    3. 50% locked in escrow via create_escrow_obligation with oracle arbiter
    4. Oracle attests when conditions met -> escrow releases automatically
    """

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client: Any | None = None
        self._initialized = False

    async def initialize(self) -> None:
        """Initialize the Alkahest client. Call once before using other methods."""
        alkahest_client_cls = _get_alkahest_client()
        if alkahest_client_cls is None or encode is None:
            logger.warning(
                "Alkahest dependencies are not installed - payment agent running in dry-run mode"
            )
            return

        if not self.settings.ORACLE_PRIVATE_KEY:
            logger.warning("ORACLE_PRIVATE_KEY not set - payment agent running in dry-run mode")
            return

        try:
            self.client = alkahest_client_cls(
                self.settings.ORACLE_PRIVATE_KEY,
                self.settings.BASE_SEPOLIA_RPC_URL,
            )
            self._initialized = True
            logger.info("Alkahest client initialized on Base Sepolia")
        except Exception as e:
            logger.error(f"Failed to initialize Alkahest client: {e}")

    def _is_ready(self) -> bool:
        return self._initialized and self.client is not None

    async def process_payment(
        self,
        project_id: str,
        recipient_address: str,
        amount: int,
        arbiter_address: str = "",
    ) -> dict[str, Any]:
        """Process a funding payment: 50% direct + 50% escrow.

        Args:
            project_id: Internal project ID
            recipient_address: Project's EVM wallet address (0x...)
            amount: Total amount in token smallest unit (e.g., USDC has 6 decimals)
            arbiter_address: On-chain arbiter contract address for escrow conditions
        """
        if not self._is_ready():
            logger.info(f"[DRY RUN] Would process payment of {amount} for project {project_id}")
            return {
                "project_id": project_id,
                "status": "dry_run",
                "total_amount": amount,
                "immediate_amount": amount // 2,
                "escrowed_amount": amount - (amount // 2),
                "direct_tx_hash": None,
                "escrow_tx_hash": None,
                "escrow_attestation_uid": None,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        token_address = self.settings.ESCROW_TOKEN_ADDRESS
        immediate_amount = amount // 2
        escrow_amount = amount - immediate_amount

        # Step 1: Approve tokens for direct payment
        logger.info(f"Approving {immediate_amount} tokens for direct payment to {recipient_address}")
        direct_approve_hash = self.client.erc20.approve(
            {"address": token_address, "value": immediate_amount},
            "payment",
        )

        # Step 2: Execute direct payment (50%)
        logger.info(f"Executing direct payment of {immediate_amount} to {recipient_address}")
        direct_tx_hash = self.client.erc20.create_payment_obligation(
            {"address": token_address, "value": immediate_amount},
        )

        # Step 3: Approve tokens for escrow
        logger.info(f"Approving {escrow_amount} tokens for escrow")
        escrow_approve_hash = self.client.erc20.approve(
            {"address": token_address, "value": escrow_amount},
            "escrow",
        )

        # Step 4: Create escrow with oracle arbiter condition
        # Encode the demand: our oracle wallet address + condition identifier
        demand_bytes = encode(
            ["address", "bytes32"],
            [
                self.settings.ORACLE_WALLET_ADDRESS,
                bytes.fromhex(project_id.ljust(64, '0')[:64]),
            ],
        )

        arbiter_data = {
            "arbiter": arbiter_address or self.settings.ORACLE_WALLET_ADDRESS,
            "demand": demand_bytes,
        }

        logger.info(f"Creating escrow of {escrow_amount} with oracle arbiter")
        escrow_tx_hash = self.client.erc20.create_escrow_obligation(
            {"address": token_address, "value": escrow_amount},
            arbiter_data,
        )

        # Extract attestation UID from escrow receipt
        escrow_attestation_uid = None
        try:
            AlkahestClientCls = _get_alkahest_client()
            if AlkahestClientCls:
                receipt = escrow_tx_hash  # The SDK may return receipt directly
                attested_event = AlkahestClientCls.get_attested_event(receipt)
                escrow_attestation_uid = str(attested_event.data.uid)
        except Exception as e:
            logger.warning(f"Could not extract escrow attestation UID: {e}")

        result = {
            "project_id": project_id,
            "status": "processed",
            "total_amount": amount,
            "immediate_amount": immediate_amount,
            "escrowed_amount": escrow_amount,
            "direct_tx_hash": str(direct_tx_hash) if direct_tx_hash else None,
            "escrow_tx_hash": str(escrow_tx_hash) if escrow_tx_hash else None,
            "escrow_attestation_uid": escrow_attestation_uid,
            "recipient_address": recipient_address,
            "token_address": token_address,
            "arbiter_address": arbiter_data["arbiter"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        logger.info(f"Payment processed for project {project_id}: {result['status']}")
        return result

    async def check_escrow_conditions(self, project_id: str, metrics: dict) -> bool:
        """Check if escrow release conditions are met.

        Args:
            project_id: The project to check
            metrics: Dict with current metrics, e.g. {"user_count": 1500, "baseline_users": 1000}
        """
        baseline = metrics.get("baseline_users", 0)
        current = metrics.get("user_count", 0)

        if baseline <= 0:
            logger.warning(f"No baseline users for project {project_id}")
            return False

        growth_pct = ((current - baseline) / baseline) * 100
        target = self.settings.ESCROW_GROWTH_TARGET

        logger.info(
            f"Project {project_id}: {growth_pct:.1f}% growth "
            f"(baseline={baseline}, current={current}, target={target}%)"
        )

        return growth_pct >= target

    async def release_escrow(
        self,
        project_id: str,
        escrow_attestation_uid: str,
    ) -> dict[str, Any]:
        """Release escrowed funds by submitting an oracle attestation.

        When our oracle wallet attests that conditions are met,
        the arbiter contract verifies and releases the escrow.
        """
        if not self._is_ready():
            logger.info(f"[DRY RUN] Would release escrow for project {project_id}")
            return {
                "project_id": project_id,
                "status": "dry_run",
                "released": False,
                "attestation_tx_hash": None,
            }

        try:
            # Create an attestation that the escrow conditions are met
            # The arbiter contract will check this attestation and release funds
            attestation_data = encode(
                ["string", "bytes32", "bool"],
                [
                    f"escrow_release:{project_id}",
                    bytes.fromhex(project_id.ljust(64, '0')[:64]),
                    True,
                ],
            )

            # Submit fulfillment attestation
            # The arbiter contract checks for this attestation from our oracle wallet
            logger.info(f"Submitting release attestation for project {project_id}")

            fulfillment_hash = self.client.string_obligation.create_obligation(
                f"escrow_release:{project_id}",
            )

            return {
                "project_id": project_id,
                "status": "released",
                "released": True,
                "fulfillment_tx_hash": str(fulfillment_hash) if fulfillment_hash else None,
                "escrow_attestation_uid": escrow_attestation_uid,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        except Exception as e:
            logger.error(f"Failed to release escrow for {project_id}: {e}")
            return {
                "project_id": project_id,
                "status": "error",
                "released": False,
                "error": str(e),
            }
