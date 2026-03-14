from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query
from pymongo import ASCENDING, DESCENDING, ReturnDocument

from database import get_database
from models.project import (
    ProjectCreate,
    ProjectResponse,
    ProjectStatus,
    ProjectUpdate,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])


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


@router.post("/", response_model=ProjectResponse, status_code=201)
async def create_project(project: ProjectCreate) -> ProjectResponse:
    """Create a new project submission (store first, scrape later)."""
    db = get_database()
    now = datetime.now(timezone.utc)
    doc = {
        **project.model_dump(),
        "status": ProjectStatus.submitted.value,
        "ranking_score": None,
        "funding_amount": None,
        "enriched_data": None,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.projects.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _doc_to_response(doc)


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
