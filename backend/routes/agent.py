from fastapi import APIRouter
from pydantic import BaseModel

from config import Settings
from agents.payment import PaymentAgent
from agents.funding_agent import FundingAgent

router = APIRouter(prefix="/api/agent", tags=["agent"])

settings = Settings()
payment_agent = PaymentAgent(settings)
funding_agent = FundingAgent(settings, payment_agent)


class AgentRequest(BaseModel):
    task: str


@router.on_event("startup")
async def startup():
    await payment_agent.initialize()
    funding_agent.initialize()


@router.post("/run")
async def run_agent(req: AgentRequest):
    """Run the funding agent with a task description.
    
    Examples:
    - "Fund project 69b5e4eb4a78ce61b1f45000 with 100 USDC"
    - "Check the escrow status of all funded projects"
    - "Submit growth evidence for project X: user count grew from 1000 to 1500"
    """
    result = await funding_agent.run(req.task)
    return result
