from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone

from database import get_database
from config import Settings
from agents.payment import PaymentAgent
from agents.oracle import EscrowOracle
from agents.data_collector import DataCollectorAgent

router = APIRouter(prefix="/api/payments", tags=["payments"])

settings = Settings()
payment_agent = PaymentAgent(settings)
data_collector = DataCollectorAgent(settings.UNBROWSE_API_KEY)
oracle = EscrowOracle(payment_agent, data_collector)


class ProcessPaymentRequest(BaseModel):
    project_id: str
    recipient_address: str
    amount: int
    arbiter_address: str = ""


class ReleaseEscrowRequest(BaseModel):
    project_id: str
    escrow_attestation_uid: str


@router.on_event("startup")
async def startup():
    await payment_agent.initialize()


@router.post("/process")
async def process_payment(req: ProcessPaymentRequest):
    """Process a funding payment: 50% direct + 50% escrow."""
    result = await payment_agent.process_payment(
        project_id=req.project_id,
        recipient_address=req.recipient_address,
        amount=req.amount,
        arbiter_address=req.arbiter_address,
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
                            "escrow_attestation_uid": result.get("escrow_attestation_uid"),
                            "escrowed_amount": result.get("escrowed_amount"),
                            "direct_tx_hash": result.get("direct_tx_hash"),
                            "escrow_tx_hash": result.get("escrow_tx_hash"),
                            "arbiter_address": result.get("arbiter_address"),
                            "status": "active",
                            "created_at": datetime.now(timezone.utc).isoformat(),
                        },
                        "status": "funded",
                        "funding_amount": result.get("total_amount"),
                        "updated_at": datetime.now(timezone.utc),
                    }
                },
            )
        except Exception:
            pass  # Non-critical: payment was processed, DB update is secondary

    return result


@router.post("/release")
async def release_escrow(req: ReleaseEscrowRequest):
    """Manually trigger escrow release for a project."""
    result = await payment_agent.release_escrow(
        project_id=req.project_id,
        escrow_attestation_uid=req.escrow_attestation_uid,
    )

    if result.get("released"):
        db = get_database()
        if db is not None:
            from bson import ObjectId
            try:
                await db.projects.update_one(
                    {"_id": ObjectId(req.project_id)},
                    {
                        "$set": {
                            "escrow_info.status": "released",
                            "escrow_info.release_tx_hash": result.get("fulfillment_tx_hash"),
                            "escrow_info.released_at": datetime.now(timezone.utc).isoformat(),
                            "updated_at": datetime.now(timezone.utc),
                        }
                    },
                )
            except Exception:
                pass

    return result


@router.post("/oracle/check")
async def run_oracle_check():
    """Manually trigger an oracle check cycle for all funded projects."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")

    cursor = db.projects.find({
        "status": "funded",
        "escrow_info.status": "active",
    })
    funded_projects = await cursor.to_list(length=100)

    # Convert ObjectId to string for each project
    for p in funded_projects:
        p["id"] = str(p["_id"])

    results = await oracle.run_check_cycle(funded_projects)
    return {"checked": len(results), "results": results}


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

    return {
        "project_id": project_id,
        "has_escrow": True,
        "escrow_info": escrow_info,
        "project_status": project.get("status"),
        "funding_amount": project.get("funding_amount"),
    }
