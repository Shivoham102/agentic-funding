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


class ProjectStage(str, Enum):
    idea = "idea"
    mvp = "mvp"
    beta = "beta"
    live = "live"
    scaling = "scaling"


class ProjectStatus(str, Enum):
    submitted = "submitted"
    processing = "processing"
    reviewed = "reviewed"
    ranked = "ranked"
    funded = "funded"
    rejected = "rejected"


class ProjectCreate(BaseModel):
    """Schema for creating a new project submission."""
    name: str
    website_url: str
    short_description: str = Field(..., max_length=140)
    description: str
    category: ProjectCategory
    github_url: Optional[str] = None
    team_size: Optional[int] = None
    stage: ProjectStage
    requested_funding: Optional[float] = None


class ProjectUpdate(BaseModel):
    """Schema for partial project updates."""
    name: Optional[str] = None
    website_url: Optional[str] = None
    short_description: Optional[str] = Field(default=None, max_length=140)
    description: Optional[str] = None
    category: Optional[ProjectCategory] = None
    github_url: Optional[str] = None
    team_size: Optional[int] = None
    stage: Optional[ProjectStage] = None
    requested_funding: Optional[float] = None
    status: Optional[ProjectStatus] = None
    ranking_score: Optional[float] = None
    funding_amount: Optional[float] = None
    enriched_data: Optional[dict[str, Any]] = None


class ProjectInDB(ProjectCreate):
    """Full project document as stored in MongoDB."""
    id: str
    status: ProjectStatus = ProjectStatus.submitted
    ranking_score: Optional[float] = None
    funding_amount: Optional[float] = None
    enriched_data: Optional[dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime


class ProjectResponse(ProjectInDB):
    """Project model returned in API responses."""
    pass
