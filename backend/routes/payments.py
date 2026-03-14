from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone

from database import get_database
from config import Settings
from agents.payment import PaymentAgent

router = APIRouter(prefix="/api/payments", tags=["payments"])

USDC_DECIMALS = 6

settings = Settings()
payment_agent = PaymentAgent(settings)


class CreateEscrowRequest(BaseModel):
    project_id: str
    amount: float  # USDC human-readable (e.g. 100.0)
    demand: str  # Natural language condition


class FulfillRequest(BaseModel):
    project_id: str
    fulfillment_evidence: str


class ArbitrateRequest(BaseModel):
    project_id: str


class CollectRequest(BaseModel):
    project_id: str


@router.on_event("startup")
async def startup():
    await payment_agent.initialize()


@router.post("/create-escrow")
async def create_escrow(req: CreateEscrowRequest):
    """Create an escrow with a natural language condition for a project."""
    raw_amount = int(req.amount * (10 ** USDC_DECIMALS))

    result = await payment_agent.create_escrow(
        project_id=req.project_id,
        amount=raw_amount,
        demand=req.demand,
    )

    # Store escrow info in the project document
    db = get_database()
    if db is not None:
        from bson import ObjectId
        try:
            await db.projects.update_one(
                {"_id": ObjectId(req.project_id)},
                {
                    "$set": {
                        "escrow_info": {
                            "escrow_uid": result.get("escrow_uid"),
                            "amount": raw_amount,
                            "demand": req.demand,
                            "oracle_address": result.get("oracle_address"),
                            "token_address": result.get("token_address"),
                            "status": result.get("status"),
                            "created_at": datetime.now(timezone.utc).isoformat(),
                        },
                        "status": "funded",
                        "funding_amount": raw_amount,
                        "updated_at": datetime.now(timezone.utc),
                    }
                },
            )
        except Exception:
            pass  # Non-critical: escrow was created, DB update is secondary

    return result


@router.post("/fulfill")
async def submit_fulfillment(req: FulfillRequest):
    """Submit fulfillment evidence for a project's escrow."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")

    from bson import ObjectId
    try:
        project = await db.projects.find_one({"_id": ObjectId(req.project_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    escrow_info = project.get("escrow_info", {})
    escrow_uid = escrow_info.get("escrow_uid")
    if not escrow_uid:
        raise HTTPException(status_code=400, detail="No escrow found for this project")

    result = await payment_agent.submit_fulfillment(
        escrow_uid=escrow_uid,
        fulfillment_evidence=req.fulfillment_evidence,
    )

    # Store fulfillment UID in DB
    if result.get("fulfillment_uid"):
        try:
            await db.projects.update_one(
                {"_id": ObjectId(req.project_id)},
                {
                    "$set": {
                        "escrow_info.fulfillment_uid": result["fulfillment_uid"],
                        "escrow_info.fulfillment_evidence": req.fulfillment_evidence,
                        "escrow_info.status": "fulfilled",
                        "updated_at": datetime.now(timezone.utc),
                    }
                },
            )
        except Exception:
            pass

    return result


@router.post("/arbitrate")
async def arbitrate(req: ArbitrateRequest):
    """Trigger LLM arbitration for a project's escrow."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")

    from bson import ObjectId
    try:
        project = await db.projects.find_one({"_id": ObjectId(req.project_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    escrow_info = project.get("escrow_info", {})
    escrow_uid = escrow_info.get("escrow_uid")
    if not escrow_uid:
        raise HTTPException(status_code=400, detail="No escrow found for this project")

    result = await payment_agent.arbitrate(escrow_uid=escrow_uid)

    # Update status in DB
    if result.get("status") == "arbitrated":
        try:
            await db.projects.update_one(
                {"_id": ObjectId(req.project_id)},
                {
                    "$set": {
                        "escrow_info.status": "arbitrated",
                        "updated_at": datetime.now(timezone.utc),
                    }
                },
            )
        except Exception:
            pass

    return result


@router.post("/collect")
async def collect_funds(req: CollectRequest):
    """Collect funds from an approved escrow."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")

    from bson import ObjectId
    try:
        project = await db.projects.find_one({"_id": ObjectId(req.project_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    escrow_info = project.get("escrow_info", {})
    escrow_uid = escrow_info.get("escrow_uid")
    fulfillment_uid = escrow_info.get("fulfillment_uid")

    if not escrow_uid:
        raise HTTPException(status_code=400, detail="No escrow found for this project")
    if not fulfillment_uid:
        raise HTTPException(status_code=400, detail="No fulfillment found - submit evidence first")

    result = await payment_agent.collect_funds(
        escrow_uid=escrow_uid,
        fulfillment_uid=fulfillment_uid,
    )

    # Update status in DB
    if result.get("status") == "collected":
        try:
            await db.projects.update_one(
                {"_id": ObjectId(req.project_id)},
                {
                    "$set": {
                        "escrow_info.status": "collected",
                        "escrow_info.collected_at": datetime.now(timezone.utc).isoformat(),
                        "updated_at": datetime.now(timezone.utc),
                    }
                },
            )
        except Exception:
            pass

    return result


@router.get("/escrow/{project_id}")
async def get_escrow_status(project_id: str):
    """Get escrow status for a specific project."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")

    from bson import ObjectId
    try:
        project = await db.projects.find_one({"_id": ObjectId(project_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    escrow_info = project.get("escrow_info")
    if not escrow_info:
        return {"project_id": project_id, "has_escrow": False}

    # Optionally check on-chain status
    escrow_uid = escrow_info.get("escrow_uid")
    on_chain_status = None
    if escrow_uid and payment_agent._is_ready():
        on_chain_status = await payment_agent.get_escrow_status(escrow_uid)

    return {
        "project_id": project_id,
        "has_escrow": True,
        "escrow_info": escrow_info,
        "on_chain_status": on_chain_status,
        "project_status": project.get("status"),
        "funding_amount": project.get("funding_amount"),
    }
