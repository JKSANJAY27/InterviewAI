import asyncio
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

    from pipeline.asr import DeepgramASR
    from pipeline.llm import OllamaLLM
    from pipeline.tts import ElevenLabsTTS
    from models.session import Session
    from models.events import LLMTokenEvent, TurnCompleteEvent, AudioResponseEvent

    chat_session = Session(session_id=session_id)
    llm = OllamaLLM(session_id)
    tts = ElevenLabsTTS(session_id)
    
    # Track the current LLM task so we can cancel it if interrupted
    llm_task: asyncio.Task | None = None

    async def run_llm(user_text: str):
        # Notify frontend we are thinking
        await websocket.send_json({"type": "status", "state": "thinking", "message": "Thinking..."})
        
        chat_session.start_turn()
        # Add the user text to history
        history = chat_session.get_history_for_llm() + [{"role": "user", "content": user_text}]
        
        full_response = ""
        
        # Async generator that broadcasts LLM tokens while feeding them to TTS
        async def text_streamer():
            nonlocal full_response
            async for token in llm.generate_response(history):
                full_response += token
                event = LLMTokenEvent(token=token)
                await websocket.send_json(event.model_dump())
                yield token

        # Stream audio from TTS
        await websocket.send_json({"type": "status", "state": "speaking", "message": "Speaking..."})
        chunk_idx = 0
        async for audio_bytes in tts.generate_audio(text_streamer()):
            import base64
            event = AudioResponseEvent(
                data=base64.b64encode(audio_bytes).decode("utf-8"),
                chunk_index=chunk_idx
            )
            await websocket.send_json(event.model_dump())
            chunk_idx += 1
            
        # Finish turn
        chat_session.finish_turn(user_text=user_text, assistant_text=full_response)
        
        event = TurnCompleteEvent(
            turn_id=chat_session.current_turn.turn_id if chat_session.current_turn else "unknown",
            latency={},
            full_response=full_response
        )
        await websocket.send_json(event.model_dump())

    # Callback to route ASR events back to the client or the next pipeline stage
    def on_asr_event(msg_dict: dict):
        nonlocal llm_task
        event_type = msg_dict["type"]
        event_obj = msg_dict["event"]
        
        # Fire-and-forget sending to client (since callback is synchronous)
        if event_type == "asr_interim":
            asyncio.create_task(websocket.send_json(event_obj.model_dump()))
        elif event_type == "asr_final":
            asyncio.create_task(websocket.send_json(event_obj.model_dump()))
            
            user_text = event_obj.text.strip()
            if not user_text:
                return
                
            # Cancel any ongoing LLM task to handle interruption
            if llm_task and not llm_task.done():
                llm_task.cancel()
                
            llm_task = asyncio.create_task(run_llm(user_text))

    asr = DeepgramASR(session_id, on_event=on_asr_event)
    await asr.start()

    try:
        await websocket.send_json(
            {
                "type": "status",
                "state": "idle",
                "message": "Connected. Ready to begin your interview.",
            }
        )
        # Initial greeting from interviewer
        initial_greeting = "Hello, thanks for joining me today. Could you start by telling me a little bit about your most recent project?"
        chat_session.finish_turn(user_text="", assistant_text=initial_greeting)
        
        event = TurnCompleteEvent(
            turn_id="initial",
            latency={},
            full_response=initial_greeting
        )
        await websocket.send_json(event.model_dump())

        while True:
            # Receive raw bytes (audio) or JSON (control messages)
            data = await websocket.receive()
            if data["type"] == "websocket.disconnect":
                logger.info("WebSocket disconnect received for session %s", session_id)
                break
            elif "bytes" in data:
                # Audio chunk — push to ASR
                await asr.push_audio(data["bytes"])
            elif "text" in data:
                import json
                msg = json.loads(data["text"])
                logger.debug("Control message: %s", msg.get("type"))
    except WebSocketDisconnect:
        logger.info("Session disconnected: %s", session_id)
    finally:
        await asr.stop()
        if llm_task:
            llm_task.cancel()
        _sessions.pop(session_id, None)


@app.websocket("/ws")
async def websocket_auto(websocket: WebSocket):
    """Auto-assign a session ID for clients that don't provide one."""
    session_id = str(uuid.uuid4())
    await websocket_endpoint(websocket, session_id)
