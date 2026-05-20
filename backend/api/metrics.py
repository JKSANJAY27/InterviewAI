from fastapi import APIRouter, HTTPException
from telemetry.store import store
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/metrics", tags=["metrics"])

@router.get("/sessions/{session_id}/turns")
async def get_session_turns(session_id: str):
    try:
        turns = await store.get_session_turns(session_id)
        return {"session_id": session_id, "turns": turns}
    except Exception as e:
        logger.error(f"Error fetching session turns: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/summary")
async def get_summary_metrics():
    try:
        summary = await store.get_summary_metrics()
        return {"summary": summary}
    except Exception as e:
        logger.error(f"Error fetching summary metrics: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
