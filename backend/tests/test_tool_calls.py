"""
Comprehensive test for all FundingAgent tool calls.
Tests every tool WITHOUT calling the LLM (no API credits used).

Run: cd backend && python -m pytest tests/test_tool_calls.py -v
"""

import asyncio
import copy
import json
import pytest
import sys
import os
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import Settings
from agents.payment import PaymentAgent
from agents.funding_agent import FundingAgent, TOOLS, USDC_DECIMALS


# ---- Fixtures ----

FAKE_PROJECT_ID = "507f1f77bcf86cd799439011"
FAKE_ESCROW_UID = "0xabc123def456789012345678901234567890123456789012345678901234abcd"
FAKE_FULFILLMENT_UID = "0xfff999888777666555444333222111000aaabbbcccdddeeefff000111222333"


def make_fake_project(overrides=None):
    """Create a fake project document as it would appear in MongoDB."""
    project = {
        "_id": FAKE_PROJECT_ID,
        "id": FAKE_PROJECT_ID,
        "name": "TestProject",
        "website_url": "https://testproject.io",
        "short_description": "A test project",
        "description": "A project for testing the funding agent tools",
        "category": "defi",
        "stage": "beta",
        "status": "submitted",
        "requested_funding": 100,
        "recipient_wallet": "0x47d0079dA447f21bEea09B209BCad84A5d2d2705",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "escrow_info": None,
    }
    if overrides:
        project.update(overrides)
    return project


@pytest.fixture
def settings():
    return Settings(
        ORACLE_PRIVATE_KEY="0xfakekey",
        BASE_SEPOLIA_RPC_URL="https://fake-rpc.example.com",
        ORACLE_WALLET_ADDRESS="0xFakeOracleAddress",
        ESCROW_TOKEN_ADDRESS="0xFakeTokenAddress",
        OPENAI_API_KEY="sk-fake",
        ANTHROPIC_API_KEY="sk-ant-fake",
    )


@pytest.fixture
def mock_payment_agent(settings):
    agent = PaymentAgent(settings)
    agent._initialized = True
    agent._nla_path = "/fake/nla"

    # Mock all NLA CLI methods
    agent.create_escrow = AsyncMock(return_value={
        "project_id": FAKE_PROJECT_ID,
        "status": "created",
        "amount": 100_000_000,
        "demand": "Release after 30 seconds",
        "escrow_uid": FAKE_ESCROW_UID,
        "oracle_address": settings.ORACLE_WALLET_ADDRESS,
        "token_address": settings.ESCROW_TOKEN_ADDRESS,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    agent.submit_fulfillment = AsyncMock(return_value={
        "status": "fulfilled",
        "escrow_uid": FAKE_ESCROW_UID,
        "fulfillment_uid": FAKE_FULFILLMENT_UID,
        "evidence": "30 seconds have elapsed",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    agent.arbitrate = AsyncMock(return_value={
        "status": "arbitrated",
        "escrow_uid": FAKE_ESCROW_UID,
        "raw_output": "Arbitration approved",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    agent.collect_funds = AsyncMock(return_value={
        "status": "collected",
        "escrow_uid": FAKE_ESCROW_UID,
        "fulfillment_uid": FAKE_FULFILLMENT_UID,
        "raw_output": "Funds collected",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    agent.get_escrow_status = AsyncMock(return_value={
        "escrow_uid": FAKE_ESCROW_UID,
        "raw_output": "Escrow status: active",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    return agent


@pytest.fixture
def mock_db():
    """Mock MongoDB with an in-memory store."""
    projects_store = {}

    class FakeCursor:
        def __init__(self, results):
            self._results = results
        def limit(self, n):
            self._results = self._results[:n]
            return self
        async def to_list(self, length=100):
            return self._results[:length]

    class FakeCollection:
        async def find_one(self, query):
            if "_id" in query:
                pid = str(query["_id"])
                if pid in projects_store:
                    # Return a deep copy so .pop("_id") doesn't mutate the store
                    return copy.deepcopy(projects_store[pid])
            return None

        def find(self, query=None):
            results = list(projects_store.values())
            if query and "status" in query:
                results = [p for p in results if p.get("status") == query["status"]]
            # Return deep copies so .pop("_id") doesn't mutate the store
            return FakeCursor([copy.deepcopy(p) for p in results])

        async def update_one(self, query, update):
            pid = str(query.get("_id", ""))
            if pid in projects_store:
                if "$set" in update:
                    for key, value in update["$set"].items():
                        # Handle nested keys like "escrow_info.fulfillment_uid"
                        if "." in key:
                            parts = key.split(".")
                            obj = projects_store[pid]
                            for part in parts[:-1]:
                                if part not in obj or obj[part] is None:
                                    obj[part] = {}
                                obj = obj[part]
                            obj[parts[-1]] = value
                        else:
                            projects_store[pid][key] = value
                return MagicMock(modified_count=1)
            return MagicMock(modified_count=0)

    class FakeDB:
        projects = FakeCollection()

    db = FakeDB()
    projects_store[FAKE_PROJECT_ID] = make_fake_project()
    return db, projects_store


@pytest.fixture
def funding_agent(settings, mock_payment_agent, mock_db):
    db, _ = mock_db
    agent = FundingAgent(settings, mock_payment_agent)

    # Patch get_database to return our fake DB
    import agents.funding_agent as fa_module
    fa_module.get_database = lambda: db

    return agent


# ---- Tool Schema Validation Tests ----

class TestToolSchemas:
    """Verify all tool definitions have valid schemas."""

    def test_all_tools_have_required_fields(self):
        for tool in TOOLS:
            assert "name" in tool, f"Tool missing 'name'"
            assert "description" in tool, f"Tool {tool.get('name')} missing 'description'"
            assert "input_schema" in tool, f"Tool {tool['name']} missing 'input_schema'"
            assert tool["input_schema"]["type"] == "object"

    def test_tool_names_are_unique(self):
        names = [t["name"] for t in TOOLS]
        assert len(names) == len(set(names)), f"Duplicate tool names: {names}"

    def test_expected_tools_exist(self):
        names = {t["name"] for t in TOOLS}
        expected = {
            "get_project", "list_projects", "create_escrow",
            "submit_fulfillment", "trigger_arbitration", "collect_funds",
            "check_escrow_status", "update_project_status", "wait_and_fulfill",
        }
        assert expected == names, f"Missing tools: {expected - names}, Extra tools: {names - expected}"


# ---- Individual Tool Call Tests ----

class TestGetProject:
    @pytest.mark.asyncio
    async def test_get_existing_project(self, funding_agent, mock_db):
        result = await funding_agent._execute_tool("get_project", {"project_id": FAKE_PROJECT_ID})
        assert result["name"] == "TestProject"
        assert result["id"] == FAKE_PROJECT_ID
        assert result["requested_funding"] == 100

    @pytest.mark.asyncio
    async def test_get_nonexistent_project(self, funding_agent):
        result = await funding_agent._execute_tool("get_project", {"project_id": "000000000000000000000000"})
        assert "error" in result

    @pytest.mark.asyncio
    async def test_get_project_invalid_id(self, funding_agent):
        result = await funding_agent._execute_tool("get_project", {"project_id": "not-a-valid-id"})
        assert "error" in result


class TestListProjects:
    @pytest.mark.asyncio
    async def test_list_all(self, funding_agent):
        result = await funding_agent._execute_tool("list_projects", {})
        assert isinstance(result, list)
        assert len(result) >= 1

    @pytest.mark.asyncio
    async def test_list_by_status(self, funding_agent):
        result = await funding_agent._execute_tool("list_projects", {"status": "submitted"})
        assert isinstance(result, list)
        for p in result:
            assert p["status"] == "submitted"

    @pytest.mark.asyncio
    async def test_list_empty_status(self, funding_agent):
        result = await funding_agent._execute_tool("list_projects", {"status": "funded"})
        assert isinstance(result, list)
        assert len(result) == 0

    @pytest.mark.asyncio
    async def test_list_with_limit(self, funding_agent):
        result = await funding_agent._execute_tool("list_projects", {"limit": 1})
        assert isinstance(result, list)
        assert len(result) <= 1


class TestCreateEscrow:
    @pytest.mark.asyncio
    async def test_create_escrow_success(self, funding_agent, mock_payment_agent, mock_db):
        result = await funding_agent._execute_tool("create_escrow", {
            "project_id": FAKE_PROJECT_ID,
            "amount_usdc": 100,
            "demand": "Release after 30 seconds",
        })
        assert result["status"] == "created"
        assert result["escrow_uid"] == FAKE_ESCROW_UID
        mock_payment_agent.create_escrow.assert_called_once_with(
            project_id=FAKE_PROJECT_ID,
            amount=100 * (10 ** USDC_DECIMALS),
            demand="Release after 30 seconds",
        )

        # Verify escrow info was stored in DB
        _, store = mock_db
        project = store[FAKE_PROJECT_ID]
        assert project["escrow_info"]["escrow_uid"] == FAKE_ESCROW_UID
        assert project["status"] == "funded"
        assert project["funding_amount"] == 100

    @pytest.mark.asyncio
    async def test_create_escrow_decimal_amount(self, funding_agent, mock_payment_agent):
        result = await funding_agent._execute_tool("create_escrow", {
            "project_id": FAKE_PROJECT_ID,
            "amount_usdc": 0.5,
            "demand": "Test",
        })
        mock_payment_agent.create_escrow.assert_called_with(
            project_id=FAKE_PROJECT_ID,
            amount=500_000,
            demand="Test",
        )


class TestSubmitFulfillment:
    @pytest.mark.asyncio
    async def test_submit_fulfillment_success(self, funding_agent, mock_payment_agent, mock_db):
        # First give the project an escrow UID
        _, store = mock_db
        store[FAKE_PROJECT_ID]["escrow_info"] = {"escrow_uid": FAKE_ESCROW_UID}

        result = await funding_agent._execute_tool("submit_fulfillment", {
            "project_id": FAKE_PROJECT_ID,
            "evidence": "Growth target met",
        })
        assert result["status"] == "fulfilled"
        mock_payment_agent.submit_fulfillment.assert_called_once_with(
            escrow_uid=FAKE_ESCROW_UID,
            fulfillment_evidence="Growth target met",
        )

    @pytest.mark.asyncio
    async def test_submit_fulfillment_no_escrow(self, funding_agent):
        result = await funding_agent._execute_tool("submit_fulfillment", {
            "project_id": FAKE_PROJECT_ID,
            "evidence": "some evidence",
        })
        assert "error" in result


class TestTriggerArbitration:
    @pytest.mark.asyncio
    async def test_arbitration_success(self, funding_agent, mock_payment_agent, mock_db):
        _, store = mock_db
        store[FAKE_PROJECT_ID]["escrow_info"] = {"escrow_uid": FAKE_ESCROW_UID}

        result = await funding_agent._execute_tool("trigger_arbitration", {
            "project_id": FAKE_PROJECT_ID,
        })
        assert result["status"] == "arbitrated"
        mock_payment_agent.arbitrate.assert_called_once_with(FAKE_ESCROW_UID)

    @pytest.mark.asyncio
    async def test_arbitration_no_escrow(self, funding_agent):
        result = await funding_agent._execute_tool("trigger_arbitration", {
            "project_id": FAKE_PROJECT_ID,
        })
        assert "error" in result


class TestCollectFunds:
    @pytest.mark.asyncio
    async def test_collect_success(self, funding_agent, mock_payment_agent, mock_db):
        _, store = mock_db
        store[FAKE_PROJECT_ID]["escrow_info"] = {
            "escrow_uid": FAKE_ESCROW_UID,
            "fulfillment_uid": FAKE_FULFILLMENT_UID,
        }

        result = await funding_agent._execute_tool("collect_funds", {
            "project_id": FAKE_PROJECT_ID,
        })
        assert result["status"] == "collected"
        mock_payment_agent.collect_funds.assert_called_once_with(
            escrow_uid=FAKE_ESCROW_UID,
            fulfillment_uid=FAKE_FULFILLMENT_UID,
        )

    @pytest.mark.asyncio
    async def test_collect_no_escrow_info(self, funding_agent):
        # escrow_info is None in the default project, so .get() on None raises
        # an AttributeError which is caught and returned as an error
        result = await funding_agent._execute_tool("collect_funds", {
            "project_id": FAKE_PROJECT_ID,
        })
        assert "error" in result


class TestCheckEscrowStatus:
    @pytest.mark.asyncio
    async def test_status_success(self, funding_agent, mock_payment_agent, mock_db):
        _, store = mock_db
        store[FAKE_PROJECT_ID]["escrow_info"] = {"escrow_uid": FAKE_ESCROW_UID}

        result = await funding_agent._execute_tool("check_escrow_status", {
            "project_id": FAKE_PROJECT_ID,
        })
        assert result["escrow_uid"] == FAKE_ESCROW_UID
        mock_payment_agent.get_escrow_status.assert_called_once_with(FAKE_ESCROW_UID)


class TestUpdateProjectStatus:
    @pytest.mark.asyncio
    async def test_update_status(self, funding_agent, mock_db):
        result = await funding_agent._execute_tool("update_project_status", {
            "project_id": FAKE_PROJECT_ID,
            "status": "funded",
        })
        assert result["updated"] is True
        assert result["status"] == "funded"

        _, store = mock_db
        assert store[FAKE_PROJECT_ID]["status"] == "funded"


class TestWaitAndFulfill:
    @pytest.mark.asyncio
    async def test_wait_and_fulfill(self, funding_agent, mock_payment_agent, mock_db):
        _, store = mock_db
        store[FAKE_PROJECT_ID]["escrow_info"] = {"escrow_uid": FAKE_ESCROW_UID}

        # Use 0 seconds wait so asyncio.sleep(0) is instant
        result = await funding_agent._execute_tool("wait_and_fulfill", {
            "project_id": FAKE_PROJECT_ID,
            "wait_seconds": 0,
            "escrow_created_at": "2026-03-14T23:00:00Z",
        })

        assert result["status"] == "fulfilled"
        assert result["fulfillment_uid"] == FAKE_FULFILLMENT_UID
        mock_payment_agent.submit_fulfillment.assert_called_once()

        # Verify fulfillment UID was stored in DB
        assert store[FAKE_PROJECT_ID]["escrow_info"]["fulfillment_uid"] == FAKE_FULFILLMENT_UID


class TestUnknownTool:
    @pytest.mark.asyncio
    async def test_unknown_tool(self, funding_agent):
        result = await funding_agent._execute_tool("nonexistent_tool", {})
        assert "error" in result
        assert "Unknown tool" in result["error"]


# ---- Full Flow Integration Test (no LLM, just tools in sequence) ----

class TestFullFlowNoLLM:
    """Simulate the complete funding flow by calling tools in sequence, like the agent would."""

    @pytest.mark.asyncio
    async def test_complete_escrow_lifecycle(self, funding_agent, mock_payment_agent, mock_db):
        _, store = mock_db

        # Step 1: Look up the project
        project = await funding_agent._execute_tool("get_project", {"project_id": FAKE_PROJECT_ID})
        assert project["name"] == "TestProject"
        assert project["requested_funding"] == 100

        # Step 2: Create escrow using requested_funding
        escrow = await funding_agent._execute_tool("create_escrow", {
            "project_id": FAKE_PROJECT_ID,
            "amount_usdc": project["requested_funding"],
            "demand": "Release funds 30 seconds after escrow creation",
        })
        assert escrow["status"] == "created"
        assert escrow["escrow_uid"] == FAKE_ESCROW_UID

        # Step 3: Verify project status updated in DB
        assert store[FAKE_PROJECT_ID]["status"] == "funded"
        assert store[FAKE_PROJECT_ID]["escrow_info"]["escrow_uid"] == FAKE_ESCROW_UID

        # Step 4: Wait and fulfill (with 0s wait for test)
        fulfill = await funding_agent._execute_tool("wait_and_fulfill", {
            "project_id": FAKE_PROJECT_ID,
            "wait_seconds": 0,
            "escrow_created_at": escrow.get("timestamp", "now"),
        })
        assert fulfill["status"] == "fulfilled"

        # Step 5: Trigger arbitration
        arb = await funding_agent._execute_tool("trigger_arbitration", {
            "project_id": FAKE_PROJECT_ID,
        })
        assert arb["status"] == "arbitrated"

        # Step 6: Collect funds
        collect = await funding_agent._execute_tool("collect_funds", {
            "project_id": FAKE_PROJECT_ID,
        })
        assert collect["status"] == "collected"

        # Step 7: Check final escrow status
        status = await funding_agent._execute_tool("check_escrow_status", {
            "project_id": FAKE_PROJECT_ID,
        })
        assert status["escrow_uid"] == FAKE_ESCROW_UID

        print("\n✅ Full escrow lifecycle completed successfully!")
        print(f"   1. Project looked up: {project['name']}")
        print(f"   2. Escrow created: {escrow['escrow_uid'][:16]}...")
        print(f"   3. Fulfillment submitted: {fulfill['fulfillment_uid'][:16]}...")
        print(f"   4. Arbitration triggered")
        print(f"   5. Funds collected")


# ---- Run directly ----

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
