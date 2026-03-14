from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query

from database import get_database
from models.project import (
    ProjectCreate,
    ProjectResponse,
    ProjectStatus,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _doc_to_response(doc: dict) -> ProjectResponse:
    """Convert a MongoDB document to a ProjectResponse."""
    doc["id"] = str(doc.pop("_id"))
    return ProjectResponse(**doc)


@router.post("/", response_model=ProjectResponse, status_code=201)
async def create_project(project: ProjectCreate) -> ProjectResponse:
    """Create a new project submission."""
    db = get_database()
    now = datetime.now(timezone.utc)
    doc = {
        **project.model_dump(),
        "status": ProjectStatus.submitted.value,
        "ranking_score": None,
        "funding_amount": None,
        "normalized_data": None,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.projects.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _doc_to_response(doc)


@router.get("/", response_model=list[ProjectResponse])
async def list_projects(
    status: Optional[ProjectStatus] = Query(default=None, description="Filter by project status"),
) -> list[ProjectResponse]:
    """List all projects, optionally filtered by status."""
    db = get_database()
    query: dict = {}
    if status is not None:
        query["status"] = status.value
    cursor = db.projects.find(query)
    docs = await cursor.to_list(length=1000)
    return [_doc_to_response(doc) for doc in docs]


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str) -> ProjectResponse:
    """Get a single project by ID."""
    db = get_database()
    try:
        oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID format")
    doc = await db.projects.find_one({"_id": oid})
    if doc is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return _doc_to_response(doc)


@router.post("/{project_id}/analyze", response_model=ProjectResponse)
async def analyze_project(project_id: str) -> ProjectResponse:
    """Trigger data collection agent for a project (stub)."""
    db = get_database()
    try:
        oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    result = await db.projects.find_one_and_update(
        {"_id": oid},
        {"$set": {"status": ProjectStatus.under_review.value, "updated_at": datetime.now(timezone.utc)}},
        return_document=True,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Project not found")

    # TODO: Invoke DataCollectorAgent here to scrape & normalise project data via Unbrowse.

    return _doc_to_response(result)
