from fastapi import APIRouter

from agents.treasury import TreasuryManagementAgent
from database import get_database
from models.project import FundingDecisionType, TreasuryAllocation

router = APIRouter(prefix="/api/treasury", tags=["treasury"])
treasury_agent = TreasuryManagementAgent()


@router.get("/", response_model=TreasuryAllocation)
async def get_treasury_snapshot() -> TreasuryAllocation:
    """Return the current treasury bucket allocation across approved commitments."""
    db = get_database()
    approved_projects = await db.projects.find(
        {
            "funding_decision.decision": {
                "$in": [
                    FundingDecisionType.accept.value,
                    FundingDecisionType.accept_reduced.value,
                ]
            }
        }
    ).to_list(length=None)
    return treasury_agent.summarize_portfolio(approved_projects)
