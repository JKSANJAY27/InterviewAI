import time
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

_start_time = time.time()


class ServiceStatus(BaseModel):
    state: str
    healthy: bool


class HealthResponse(BaseModel):
    status: str
    uptime_seconds: float
    services: dict[str, ServiceStatus]
    active_sessions: int


# Will be populated by the session manager
_active_sessions: dict = {}


@router.get("/health", response_model=HealthResponse, tags=["health"])
async def health_check():
    uptime = time.time() - _start_time
    return HealthResponse(
        status="ok",
        uptime_seconds=round(uptime, 1),
        services={
            "deepgram_asr": ServiceStatus(state="unknown", healthy=True),
            "ollama_llm": ServiceStatus(state="unknown", healthy=True),
            "elevenlabs_tts": ServiceStatus(state="unknown", healthy=True),
        },
        active_sessions=len(_active_sessions),
    )


@router.get("/ping", tags=["health"])
async def ping():
    return {"pong": True}
