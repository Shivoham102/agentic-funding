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


class PayoutChain(str, Enum):
    solana = "solana"
    base_sepolia = "base_sepolia"


class ExecutionStatus(str, Enum):
    not_started = "not_started"
    blocked = "blocked"
    processing = "processing"
    dry_run = "dry_run"
    completed = "completed"
    partial = "partial"
    failed = "failed"


class FundingExecutionActionType(str, Enum):
    immediate_payout = "immediate_payout"
    milestone_escrow = "milestone_escrow"


class FundingExecutionRecordStatus(str, Enum):
    planned = "planned"
    succeeded = "succeeded"
    dry_run = "dry_run"
    error = "error"


class EscrowInfo(BaseModel):
    """Escrow details for a funded project."""
    escrow_attestation_uid: str | None = None
    escrowed_amount: float | None = None
    direct_tx_hash: str | None = None
    escrow_tx_hash: str | None = None
    arbiter_address: str | None = None
    status: str = "pending"  # pending, active, released, failed
    baseline_users: int = 0
    created_at: str | None = None
    released_at: str | None = None
    release_tx_hash: str | None = None


class ConfidenceLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class RiskClassification(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class FundingDecisionType(str, Enum):
    reject = "reject"
    accept = "accept"
    accept_reduced = "accept_reduced"


class MilestoneVerificationType(str, Enum):
    committee_validation = "committee_validation"
    repository_activity = "repository_activity"
    deployment_proof = "deployment_proof"
    kpi_evidence = "kpi_evidence"
    documentation_review = "documentation_review"
    financial_review = "financial_review"


class BudgetLineItem(BaseModel):
    category: str
    amount: float = Field(..., ge=0)
    notes: Optional[str] = None


class FounderMilestone(BaseModel):
    name: str
    description: str
    target_days: Optional[int] = Field(default=None, ge=0)
    requested_release_ratio: Optional[float] = Field(default=None, ge=0, le=1)


class ScoreBreakdown(BaseModel):
    team_quality: float = Field(..., ge=0, le=100)
    market_opportunity: float = Field(..., ge=0, le=100)
    product_feasibility: float = Field(..., ge=0, le=100)
    capital_efficiency: float = Field(..., ge=0, le=100)
    traction_signals: float = Field(..., ge=0, le=100)
    risk_indicators: float = Field(..., ge=0, le=100)


class EvaluationResult(BaseModel):
    overall_score: float = Field(..., ge=0, le=100)
    confidence_score: float = Field(..., ge=0, le=100)
    confidence_level: ConfidenceLevel
    risk_score: float = Field(..., ge=0, le=100)
    risk_classification: RiskClassification
    breakdown: ScoreBreakdown
    strengths: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)
    policy_notes: list[str] = Field(default_factory=list)
    data_completeness: float = Field(..., ge=0, le=1)
    evidence_coverage: float = Field(..., ge=0, le=1)
    recommended_funding_amount: float = Field(..., ge=0)
    recommended_allocation_ratio: float = Field(..., ge=0, le=1)


class TreasuryStrategyAllocation(BaseModel):
    strategy_name: str
    amount: float = Field(..., ge=0)
    liquidity_profile: str
    rationale: str


class TreasuryAllocation(BaseModel):
    total_capital: float = Field(..., ge=0)
    available_for_new_commitments: float = Field(..., ge=0)
    hot_reserve: float = Field(..., ge=0)
    committed_reserve: float = Field(..., ge=0)
    idle_treasury: float = Field(..., ge=0)
    strategic_buffer: float = Field(..., ge=0)
    policy_compliant: bool
    liquidity_gap: float = Field(default=0, ge=0)
    strategy_allocations: list[TreasuryStrategyAllocation] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class FundingPackage(BaseModel):
    requested_amount: float = Field(..., ge=0)
    recommended_amount: float = Field(..., ge=0)
    approved_amount: float = Field(..., ge=0)
    reduction_ratio: float = Field(..., ge=0, le=1)
    immediate_release_amount: float = Field(..., ge=0)
    escrow_amount: float = Field(..., ge=0)


class MilestoneScheduleItem(BaseModel):
    sequence: int = Field(..., ge=1)
    name: str
    description: str
    target_days: int = Field(..., ge=0)
    verification_type: MilestoneVerificationType
    success_metric: str
    release_percentage: float = Field(..., gt=0, le=1)
    release_amount: float = Field(..., ge=0)


class FundingDecision(BaseModel):
    decision: FundingDecisionType
    rationale: str
    policy_explanation: list[str] = Field(default_factory=list)
    funding_package: FundingPackage
    milestone_schedule: list[MilestoneScheduleItem] = Field(default_factory=list)


class FundingExecutionAction(BaseModel):
    action_id: str
    action_type: FundingExecutionActionType
    amount: float = Field(..., ge=0)
    payout_chain: PayoutChain
    recipient: str
    milestone_id: Optional[str] = None
    milestone_name: Optional[str] = None
    sequence: Optional[int] = Field(default=None, ge=1)
    deliverable_type: Optional[str] = None
    verification_method: Optional[str] = None
    deadline: Optional[str] = None
    demand: Optional[str] = None
    provider: str
    provider_metadata: dict[str, Any] = Field(default_factory=dict)


class FundingExecutionPlan(BaseModel):
    schema_version: str = "funding-execution-plan-v1"
    plan_id: str
    project_id: str
    generated_at: str
    approved_for_execution: bool
    decision: FundingDecisionType
    payout_chain: PayoutChain
    requested_amount: float = Field(..., ge=0)
    approved_amount: float = Field(..., ge=0)
    recipient_solana_address: Optional[str] = None
    recipient_evm_address: Optional[str] = None
    treasury_snapshot: dict[str, Any] = Field(default_factory=dict)
    immediate_payout: Optional[FundingExecutionAction] = None
    escrow_actions: list[FundingExecutionAction] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class FundingExecutionRecord(BaseModel):
    schema_version: str = "funding-execution-record-v1"
    record_id: str
    project_id: str
    plan_id: str
    action_id: str
    action_type: FundingExecutionActionType
    status: FundingExecutionRecordStatus
    payout_chain: PayoutChain
    recipient: str
    amount: float = Field(..., ge=0)
    milestone_id: Optional[str] = None
    milestone_name: Optional[str] = None
    verification_method: Optional[str] = None
    provider: str
    provider_metadata: dict[str, Any] = Field(default_factory=dict)
    escrow_uid: Optional[str] = None
    tx_hash: Optional[str] = None
    error: Optional[str] = None
    raw_result: Optional[dict[str, Any]] = None
    created_at: str
    updated_at: str


class FundingExecutionResponse(BaseModel):
    project_id: str
    execution_status: ExecutionStatus
    execution_plan: FundingExecutionPlan
    payment_records: list[FundingExecutionRecord] = Field(default_factory=list)
    escrow_uids: list[str] = Field(default_factory=list)
    tx_hashes: list[str] = Field(default_factory=list)


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
    recipient_wallet: Optional[str] = None
    recipient_solana_address: Optional[str] = None
    recipient_evm_address: Optional[str] = None
    preferred_payout_chain: Optional[PayoutChain] = None
    team_background: Optional[str] = None
    market_summary: Optional[str] = None
    traction_summary: Optional[str] = None
    budget_breakdown: Optional[list[BudgetLineItem]] = None
    requested_milestones: Optional[list[FounderMilestone]] = None


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
    recipient_wallet: Optional[str] = None
    recipient_solana_address: Optional[str] = None
    recipient_evm_address: Optional[str] = None
    preferred_payout_chain: Optional[PayoutChain] = None
    team_background: Optional[str] = None
    market_summary: Optional[str] = None
    traction_summary: Optional[str] = None
    budget_breakdown: Optional[list[BudgetLineItem]] = None
    requested_milestones: Optional[list[FounderMilestone]] = None
    status: Optional[ProjectStatus] = None
    ranking_score: Optional[float] = None
    funding_amount: Optional[float] = None
    enriched_data: Optional[dict[str, Any]] = None
    feature_vector: Optional[dict[str, Any]] = None
    scorecard: Optional[dict[str, Any]] = None
    funding_package_draft: Optional[dict[str, Any]] = None
    decision_package: Optional[dict[str, Any]] = None
    verifier_result: Optional[dict[str, Any]] = None
    decision_review: Optional[dict[str, Any]] = None
    escrow_info: Optional[EscrowInfo] = None
    execution_status: Optional[ExecutionStatus] = None
    execution_plan_json: Optional[FundingExecutionPlan] = None
    evaluation: Optional[EvaluationResult] = None
    treasury_allocation: Optional[TreasuryAllocation] = None
    funding_decision: Optional[FundingDecision] = None
    reviewed_at: Optional[datetime] = None


class ProjectInDB(ProjectCreate):
    """Full project document as stored in MongoDB."""
    id: str
    status: ProjectStatus = ProjectStatus.submitted
    ranking_score: Optional[float] = None
    funding_amount: Optional[float] = None
    enriched_data: Optional[dict[str, Any]] = None
    feature_vector: Optional[dict[str, Any]] = None
    scorecard: Optional[dict[str, Any]] = None
    funding_package_draft: Optional[dict[str, Any]] = None
    decision_package: Optional[dict[str, Any]] = None
    verifier_result: Optional[dict[str, Any]] = None
    decision_review: Optional[dict[str, Any]] = None
    escrow_info: Optional[EscrowInfo] = None
    execution_status: ExecutionStatus = ExecutionStatus.not_started
    execution_plan_json: Optional[FundingExecutionPlan] = None
    evaluation: Optional[EvaluationResult] = None
    treasury_allocation: Optional[TreasuryAllocation] = None
    funding_decision: Optional[FundingDecision] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class ProjectResponse(ProjectInDB):
    """Project model returned in API responses."""
    pass
