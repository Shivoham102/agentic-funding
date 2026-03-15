from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query
from pymongo import DESCENDING, ReturnDocument

from agents.data_collector import DataCollectorAgent
from agents.decision import DecisionReviewAgent
from agents.evaluation import EvaluationAgent
from agents.feature_extraction import FeatureExtractionAgent
from agents.funding_decision import FundingDecisionAgent
from agents.treasury import TreasuryManagementAgent
from config import settings
from database import get_database
from models.project import (
    ExecutionStatus,
    FundingDecisionType,
    FundingExecutionRecord,
    FundingExecutionResponse,
    ProjectCreate,
    ProjectResponse,
    ProjectStatus,
    ProjectUpdate,
)
from services.funding_execution import FundingExecutionError, FundingExecutionService

router = APIRouter(prefix="/api/projects", tags=["projects"])
evaluation_agent = EvaluationAgent()
feature_extraction_agent = FeatureExtractionAgent(node_executable=settings.SCORING_NODE_EXECUTABLE)
treasury_agent = TreasuryManagementAgent()
decision_review_agent = DecisionReviewAgent(node_executable=settings.DECISION_NODE_EXECUTABLE)
funding_decision_agent = FundingDecisionAgent(treasury_agent)
funding_execution_service = FundingExecutionService(settings=settings)
data_collector_agent = DataCollectorAgent(
    unbrowse_api_key=settings.UNBROWSE_API_KEY,
    base_url=settings.UNBROWSE_URL,
    timeout_seconds=settings.UNBROWSE_TIMEOUT_SECONDS,
    max_retries=settings.UNBROWSE_MAX_RETRIES,
    solana_rpc_url=settings.SOLANA_RPC_URL,
    solana_commitment=settings.SOLANA_RPC_COMMITMENT,
    solana_recent_signature_limit=settings.SOLANA_RECENT_SIGNATURE_LIMIT,
    solana_analytics_provider=settings.SOLANA_ANALYTICS_PROVIDER,
    solana_analytics_signature_limit=settings.SOLANA_ANALYTICS_SIGNATURE_LIMIT,
    solana_timeout_seconds=settings.SOLANA_TIMEOUT_SECONDS,
    solana_max_retries=settings.SOLANA_MAX_RETRIES,
    github_api_url=settings.GITHUB_API_URL,
    github_api_token=settings.GITHUB_API_TOKEN,
    github_timeout_seconds=settings.GITHUB_TIMEOUT_SECONDS,
    github_max_retries=settings.GITHUB_MAX_RETRIES,
    github_commits_lookback_days=settings.GITHUB_COMMITS_LOOKBACK_DAYS,
    github_max_pages=settings.GITHUB_MAX_PAGES,
    gemini_api_key=settings.GEMINI_API_KEY,
    gemini_api_url=settings.GEMINI_API_URL,
    gemini_market_model=settings.GEMINI_MARKET_MODEL,
    gemini_timeout_seconds=settings.GEMINI_TIMEOUT_SECONDS,
    gemini_max_retries=settings.GEMINI_MAX_RETRIES,
    gemini_min_request_interval_seconds=settings.GEMINI_MIN_REQUEST_INTERVAL_SECONDS,
    market_search_timeout_seconds=settings.MARKET_SEARCH_TIMEOUT_SECONDS,
    market_search_results_per_query=settings.MARKET_SEARCH_RESULTS_PER_QUERY,
    market_max_source_documents=settings.MARKET_MAX_SOURCE_DOCUMENTS,
)


class SortField(str, Enum):
    created_at = "created_at"
    ranking_score = "ranking_score"


def _doc_to_response(doc: dict) -> ProjectResponse:
    """Convert a MongoDB document to a ProjectResponse."""
    doc["id"] = str(doc.pop("_id"))
    return ProjectResponse(**doc)


def _parse_object_id(project_id: str) -> ObjectId:
    """Parse a string into an ObjectId, raising 400 on invalid format."""
    try:
        return ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID format")


async def _approved_projects_for_treasury(db, current_project_id: ObjectId) -> list[dict]:
    query = {
        "_id": {"$ne": current_project_id},
        "funding_decision.decision": {
            "$in": [
                FundingDecisionType.accept.value,
                FundingDecisionType.accept_reduced.value,
            ]
        },
    }
    return await db.projects.find(query).to_list(length=None)


async def _portfolio_projects_for_context(db, current_project_id: ObjectId) -> list[dict]:
    projection = {
        "name": 1,
        "category": 1,
        "stage": 1,
        "website_url": 1,
        "github_url": 1,
        "recipient_wallet": 1,
        "recipient_solana_address": 1,
        "recipient_evm_address": 1,
        "preferred_payout_chain": 1,
        "short_description": 1,
        "description": 1,
        "market_summary": 1,
        "traction_summary": 1,
        "status": 1,
    }
    docs = await db.projects.find({"_id": {"$ne": current_project_id}}, projection).to_list(length=None)
    portfolio_projects: list[dict] = []
    for doc in docs:
        portfolio_projects.append(
            {
                "id": str(doc.get("_id")),
                "name": doc.get("name"),
                "category": doc.get("category"),
                "stage": doc.get("stage"),
                "website_url": doc.get("website_url"),
                "github_url": doc.get("github_url"),
                "recipient_wallet": doc.get("recipient_wallet"),
                "recipient_solana_address": doc.get("recipient_solana_address"),
                "recipient_evm_address": doc.get("recipient_evm_address"),
                "preferred_payout_chain": doc.get("preferred_payout_chain"),
                "short_description": doc.get("short_description"),
                "description": doc.get("description"),
                "market_summary": doc.get("market_summary"),
                "traction_summary": doc.get("traction_summary"),
                "status": doc.get("status"),
            }
        )
    return portfolio_projects


async def _run_review_pipeline(project_doc: dict) -> dict:
    db = get_database()
    approved_projects = await _approved_projects_for_treasury(db, project_doc["_id"])
    treasury_snapshot = treasury_agent.summarize_portfolio(approved_projects)
    scoring_review = feature_extraction_agent.run_scoring_review(
        project_doc,
        treasury_snapshot=treasury_snapshot.model_dump(mode="json"),
    )
    feature_vector = scoring_review["features"]
    scorecard = scoring_review["scorecard"]
    funding_package_draft = scoring_review["funding_package_draft"]
    decision_review = decision_review_agent.review(
        project=project_doc,
        scorecard=scorecard,
        funding_package_draft=funding_package_draft,
        treasury_snapshot=treasury_snapshot.model_dump(mode="json"),
        approved_projects=approved_projects,
    )
    decision_package = decision_review.get("decision_package")
    verifier_result = decision_review.get("verifier_result")

    evaluation_input = {
        **project_doc,
        "feature_vector": feature_vector,
        "scorecard": scorecard,
        "funding_package_draft": funding_package_draft,
        "decision_package": decision_package,
        "verifier_result": verifier_result,
        "decision_review": decision_review,
    }
    evaluation = evaluation_agent.evaluate_project(evaluation_input)
    funding_decision, treasury_allocation, status = funding_decision_agent.decide(
        project=evaluation_input,
        evaluation=evaluation,
        approved_projects=approved_projects,
    )

    now = datetime.now(timezone.utc)
    update_doc = {
        "status": status.value,
        "ranking_score": evaluation.overall_score,
        "funding_amount": funding_decision.funding_package.approved_amount,
        "feature_vector": feature_vector,
        "scorecard": scorecard,
        "funding_package_draft": funding_package_draft,
        "decision_package": decision_package,
        "verifier_result": verifier_result,
        "decision_review": decision_review,
        "evaluation": evaluation.model_dump(mode="json"),
        "funding_decision": funding_decision.model_dump(mode="json"),
        "treasury_allocation": treasury_allocation.model_dump(mode="json"),
        "reviewed_at": now,
        "updated_at": now,
    }

    result = await db.projects.find_one_and_update(
        {"_id": project_doc["_id"]},
        {"$set": update_doc},
        return_document=ReturnDocument.AFTER,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return result


@router.post("/", response_model=ProjectResponse, status_code=201)
async def create_project(project: ProjectCreate) -> ProjectResponse:
    """Create a new project submission and run the deterministic review flow."""
    db = get_database()
    now = datetime.now(timezone.utc)
    doc = {
        **project.model_dump(),
        "status": ProjectStatus.submitted.value,
        "ranking_score": None,
        "funding_amount": None,
        "enriched_data": None,
        "feature_vector": None,
        "scorecard": None,
        "funding_package_draft": None,
        "decision_package": None,
        "verifier_result": None,
        "decision_review": None,
        "execution_status": ExecutionStatus.not_started.value,
        "execution_plan_json": None,
        "evaluation": None,
        "funding_decision": None,
        "treasury_allocation": None,
        "reviewed_at": None,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.projects.insert_one(doc)
    doc["_id"] = result.inserted_id
    reviewed_doc = await _run_review_pipeline(doc)
    return _doc_to_response(reviewed_doc)


@router.get("/", response_model=list[ProjectResponse])
async def list_projects(
    status: Optional[ProjectStatus] = Query(default=None, description="Filter by project status"),
    sort_by: SortField = Query(default=SortField.created_at, description="Field to sort by"),
    limit: int = Query(default=50, ge=1, le=500, description="Max number of results"),
) -> list[ProjectResponse]:
    """List all projects with optional status filter and sorting."""
    db = get_database()
    query: dict = {}
    if status is not None:
        query["status"] = status.value

    sort_direction = DESCENDING
    cursor = db.projects.find(query).sort(sort_by.value, sort_direction).limit(limit)
    docs = await cursor.to_list(length=limit)
    return [_doc_to_response(doc) for doc in docs]


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str) -> ProjectResponse:
    """Get a single project by ID."""
    db = get_database()
    oid = _parse_object_id(project_id)
    doc = await db.projects.find_one({"_id": oid})
    if doc is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return _doc_to_response(doc)


@router.post("/{project_id}/review", response_model=ProjectResponse)
async def review_project(project_id: str) -> ProjectResponse:
    """Run evaluation, treasury, and funding-decision policies for a project."""
    db = get_database()
    oid = _parse_object_id(project_id)
    doc = await db.projects.find_one({"_id": oid})
    if doc is None:
        raise HTTPException(status_code=404, detail="Project not found")
    reviewed_doc = await _run_review_pipeline(doc)
    return _doc_to_response(reviewed_doc)


@router.post("/{project_id}/enrich", response_model=ProjectResponse)
async def enrich_project(project_id: str) -> ProjectResponse:
    """Run live enrichment, persist structured evidence, and rerun review."""
    db = get_database()
    oid = _parse_object_id(project_id)
    existing_doc = await db.projects.find_one({"_id": oid})
    if existing_doc is None:
        raise HTTPException(status_code=404, detail="Project not found")

    previous_status = existing_doc.get("status", ProjectStatus.submitted.value)

    processing_doc = await db.projects.find_one_and_update(
        {"_id": oid},
        {"$set": {"status": ProjectStatus.processing.value, "updated_at": datetime.now(timezone.utc)}},
        return_document=ReturnDocument.AFTER,
    )
    if processing_doc is None:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        portfolio_projects = await _portfolio_projects_for_context(db, oid)
        enriched_data = await data_collector_agent.collect_and_normalize(
            processing_doc,
            portfolio_projects=portfolio_projects,
        )
        enriched_doc = await db.projects.find_one_and_update(
            {"_id": oid},
            {
                "$set": {
                    "enriched_data": enriched_data,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
            return_document=ReturnDocument.AFTER,
        )
        if enriched_doc is None:
            raise HTTPException(status_code=404, detail="Project not found")
        reviewed_doc = await _run_review_pipeline(enriched_doc)
        return _doc_to_response(reviewed_doc)
    except HTTPException:
        await db.projects.find_one_and_update(
            {"_id": oid},
            {
                "$set": {
                    "status": previous_status,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
        raise
    except Exception as exc:
        await db.projects.find_one_and_update(
            {"_id": oid},
            {
                "$set": {
                    "status": previous_status,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
        raise HTTPException(status_code=502, detail=f"Enrichment failed: {exc}")


@router.post("/{project_id}/execute-funding", response_model=FundingExecutionResponse)
async def execute_funding(project_id: str) -> FundingExecutionResponse:
    """Execute a verified funding decision via the configured payout rail."""
    db = get_database()
    oid = _parse_object_id(project_id)
    project_doc = await db.projects.find_one({"_id": oid})
    if project_doc is None:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        return await funding_execution_service.execute_project(project_doc, db)
    except FundingExecutionError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code, "message": exc.detail})


@router.get("/{project_id}/execution-records", response_model=list[FundingExecutionRecord])
async def get_execution_records(project_id: str) -> list[FundingExecutionRecord]:
    """Return persisted payout and escrow records for a project."""
    db = get_database()
    oid = _parse_object_id(project_id)
    project_doc = await db.projects.find_one({"_id": oid}, {"_id": 1})
    if project_doc is None:
        raise HTTPException(status_code=404, detail="Project not found")

    docs = await (
        db.funding_execution_records.find({"project_id": project_id}).sort("created_at", DESCENDING).to_list(length=200)
    )

    records: list[FundingExecutionRecord] = []
    for doc in docs:
        doc.pop("_id", None)
        records.append(FundingExecutionRecord(**doc))
    return records


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: str, updates: ProjectUpdate) -> ProjectResponse:
    """Partially update a project (e.g. patch enriched data back)."""
    db = get_database()
    oid = _parse_object_id(project_id)

    # Only include fields that were explicitly set
    update_data = updates.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_data["updated_at"] = datetime.now(timezone.utc)

    result = await db.projects.find_one_and_update(
        {"_id": oid},
        {"$set": update_data},
        return_document=ReturnDocument.AFTER,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Project not found")

    return _doc_to_response(result)
