import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from api.health import router as health_router

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

# Active WebSocket sessions: session_id → WebSocket
_sessions: dict[str, WebSocket] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("InterviewAI backend starting up")
    logger.info("LLM model : %s @ %s", settings.ollama_model, settings.ollama_base_url)
    logger.info("ASR       : Deepgram Nova-3 (streaming)")
    logger.info("TTS       : ElevenLabs (streaming)")
    yield
    logger.info("InterviewAI backend shutting down")


app = FastAPI(
    title="InterviewAI",
    description="Real-time technical interview voice assistant",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/api")


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    _sessions[session_id] = websocket
    logger.info("Session connected: %s  (total=%d)", session_id, len(_sessions))

    try:
        await websocket.send_json(
            {
                "type": "status",
                "state": "idle",
                "message": "Connected. Ready to begin your interview.",
            }
        )
        while True:
            # Receive raw bytes (audio) or JSON (control messages)
            data = await websocket.receive()
            if "bytes" in data:
                # Audio chunk — will be routed to ASR pipeline
                pass
            elif "text" in data:
                import json
                msg = json.loads(data["text"])
                logger.debug("Control message: %s", msg.get("type"))
    except WebSocketDisconnect:
        logger.info("Session disconnected: %s", session_id)
    finally:
        _sessions.pop(session_id, None)


@app.websocket("/ws")
async def websocket_auto(websocket: WebSocket):
    """Auto-assign a session ID for clients that don't provide one."""
    session_id = str(uuid.uuid4())
    await websocket_endpoint(websocket, session_id)
