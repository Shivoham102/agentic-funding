import unittest
from copy import deepcopy

from config import Settings
from models.project import ExecutionStatus, FundingExecutionActionType, PayoutChain
from services.funding_execution import FundingExecutionError, FundingExecutionService


class FakeProjectsCollection:
    def __init__(self) -> None:
        self.updates: list[dict] = []

    async def update_one(self, query, update):
        self.updates.append({"query": query, "update": update})


class FakeExecutionRecordsCollection:
    def __init__(self) -> None:
        self.inserted: list[dict] = []

    async def insert_one(self, document):
        self.inserted.append(document)


class FakeDB:
    def __init__(self) -> None:
        self.projects = FakeProjectsCollection()
        self.funding_execution_records = FakeExecutionRecordsCollection()


class FakeBaseSepoliaAdapter:
    chain = PayoutChain.base_sepolia
    provider_name = "fake_base_sepolia"

    async def execute_immediate_payout(self, project_id, action):
        return {
            "status": "transferred",
            "project_id": project_id,
            "tx_hash": "0xtransferhash",
            "provider_metadata": {"adapter": "fake"},
        }

    async def create_milestone_escrow(self, project_id, action):
        return {
            "status": "created",
            "project_id": project_id,
            "escrow_uid": f"0xescrow{action.sequence}",
            "provider_metadata": {"adapter": "fake"},
        }


def sample_project() -> dict:
    return {
        "_id": "project-oid-1",
        "id": "project-1",
        "name": "Execution Test",
        "preferred_payout_chain": "base_sepolia",
        "recipient_evm_address": "0x47d0079dA447f21bEea09B209BCad84A5d2d2705",
        "recipient_solana_address": "BWgJc8KvCbxqrn2Wggb395c2URfS19a5NoAEVDaiyXCa",
        "recipient_wallet": "legacy-wallet-value",
        "reviewed_at": "2026-03-15T12:00:00+00:00",
        "decision_review": {
            "schema_version": "decision-review-v1",
            "approved_for_execution": True,
        },
        "funding_decision": {
            "decision": "accept_reduced",
            "funding_package": {
                "requested_amount": 100000.0,
                "approved_amount": 50000.0,
                "immediate_release_amount": 10000.0,
                "escrow_amount": 40000.0,
            },
            "milestone_schedule": [
                {
                    "sequence": 1,
                    "name": "Kickoff",
                    "target_days": 14,
                    "verification_type": "committee_validation",
                    "success_metric": "Kickoff approved",
                    "release_amount": 10000.0,
                },
                {
                    "sequence": 2,
                    "name": "MVP release",
                    "target_days": 45,
                    "verification_type": "deployment_proof",
                    "success_metric": "MVP live",
                    "release_amount": 20000.0,
                },
                {
                    "sequence": 3,
                    "name": "Usage growth",
                    "target_days": 90,
                    "verification_type": "kpi_evidence",
                    "success_metric": "Usage target achieved",
                    "release_amount": 20000.0,
                },
            ],
        },
        "treasury_allocation": {
            "hot_reserve": 150000.0,
            "committed_reserve": 100000.0,
            "idle_treasury": 700000.0,
            "strategic_buffer": 100000.0,
            "available_for_new_commitments": 750000.0,
        },
        "execution_status": "not_started",
    }


class TestFundingExecutionService(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        settings = Settings()
        self.adapter = FakeBaseSepoliaAdapter()
        self.service = FundingExecutionService(
            settings=settings,
            adapters={PayoutChain.base_sepolia: self.adapter},
        )

    def test_build_execution_plan_maps_immediate_and_deferred_actions(self) -> None:
        project = sample_project()

        plan = self.service.build_execution_plan(project)

        self.assertEqual(plan.project_id, "project-1")
        self.assertEqual(plan.payout_chain, PayoutChain.base_sepolia)
        self.assertIsNotNone(plan.immediate_payout)
        self.assertEqual(plan.immediate_payout.action_type, FundingExecutionActionType.immediate_payout)
        self.assertEqual(plan.immediate_payout.amount, 10000.0)
        self.assertEqual(len(plan.escrow_actions), 2)
        self.assertEqual(plan.escrow_actions[0].milestone_id, "milestone-2")
        self.assertEqual(plan.escrow_actions[1].verification_method, "kpi_evidence")

    def test_build_execution_plan_requires_explicit_execution_address(self) -> None:
        project = sample_project()
        project["recipient_evm_address"] = None
        project["recipient_solana_address"] = None
        project["preferred_payout_chain"] = None

        with self.assertRaises(FundingExecutionError) as context:
            self.service.build_execution_plan(project)

        self.assertEqual(context.exception.code, "missing_explicit_payout_address")

    async def test_execute_project_persists_records_and_updates_status(self) -> None:
        project = sample_project()
        db = FakeDB()

        response = await self.service.execute_project(deepcopy(project), db)

        self.assertEqual(response.execution_status, ExecutionStatus.completed)
        self.assertEqual(len(response.payment_records), 3)
        self.assertEqual(len(response.escrow_uids), 2)
        self.assertEqual(response.tx_hashes, ["0xtransferhash"])
        self.assertEqual(len(db.funding_execution_records.inserted), 3)
        self.assertEqual(
            db.projects.updates[0]["update"]["$set"]["execution_status"],
            ExecutionStatus.processing.value,
        )
        self.assertEqual(
            db.projects.updates[-1]["update"]["$set"]["execution_status"],
            ExecutionStatus.completed.value,
        )


if __name__ == "__main__":
    unittest.main()
