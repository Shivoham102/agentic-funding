from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class ProjectCategory(str, Enum):
    defi = "defi"
    infrastructure = "infrastructure"
    developer_tools = "developer_tools"
    consumer = "consumer"
    other = "other"


class ProjectStatus(str, Enum):
    submitted = "submitted"
    under_review = "under_review"
    ranked = "ranked"
    funded = "funded"


class ProjectCreate(BaseModel):
    name: str
    website_url: str
    description: str
    github_url: Optional[str] = None
    category: ProjectCategory


class ProjectInDB(ProjectCreate):
    id: str
    status: ProjectStatus = ProjectStatus.submitted
    ranking_score: Optional[float] = None
    funding_amount: Optional[float] = None
    normalized_data: Optional[dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime


class ProjectResponse(ProjectInDB):
    """Project model returned in API responses."""
    pass
