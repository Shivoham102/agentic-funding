from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query
from pymongo import DESCENDING, ReturnDocument

from agents.evaluation import EvaluationAgent
from agents.funding_decision import FundingDecisionAgent
from agents.treasury import TreasuryManagementAgent
from database import get_database
from models.project import (
    FundingDecisionType,
    ProjectCreate,
    ProjectResponse,
    ProjectStatus,
    ProjectUpdate,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])
evaluation_agent = EvaluationAgent()
treasury_agent = TreasuryManagementAgent()
funding_decision_agent = FundingDecisionAgent(treasury_agent)


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


async def _run_review_pipeline(project_doc: dict) -> dict:
    db = get_database()
    approved_projects = await _approved_projects_for_treasury(db, project_doc["_id"])

    evaluation = evaluation_agent.evaluate_project(project_doc)
    funding_decision, treasury_allocation, status = funding_decision_agent.decide(
        project=project_doc,
        evaluation=evaluation,
        approved_projects=approved_projects,
    )

    now = datetime.now(timezone.utc)
    update_doc = {
        "status": status.value,
        "ranking_score": evaluation.overall_score,
        "funding_amount": funding_decision.funding_package.approved_amount,
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
    """Trigger Unbrowse scraping/enrichment for a project (stub).

    Sets the project status to 'processing' and would kick off the
    DataCollectorAgent to scrape website and GitHub data.
    """
    db = get_database()
    oid = _parse_object_id(project_id)

    result = await db.projects.find_one_and_update(
        {"_id": oid},
        {"$set": {"status": ProjectStatus.processing.value, "updated_at": datetime.now(timezone.utc)}},
        return_document=ReturnDocument.AFTER,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Project not found")

    # TODO: Call DataCollectorAgent to scrape project website_url and github_url
    # via Unbrowse, then store the enriched data back using PATCH endpoint.

    return _doc_to_response(result)


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
