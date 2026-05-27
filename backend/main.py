import asyncio
import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from api.health import router as health_router
from api.metrics import router as metrics_router
from api.feedback import router as feedback_router
from telemetry.store import store
from telemetry.tracker import tracker

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
    
    # Initialize telemetry DB
    await store.init_db()
    
    # ── Ollama model warm-up ─────────────────────────────────────────────────
    # On the very first request Ollama has to load the model weights from disk
    # into memory, causing a cold-start latency of 60-120 seconds.  We
    # fire a minimal 1-token request here at startup so that by the time the
    # first real user connects the model is already resident in memory.
    logger.info("Warming up Ollama model '%s' (this may take 30-60s on first boot)...",
                settings.ollama_model)
    try:
        import httpx
        async with httpx.AsyncClient(timeout=120.0) as _warmup_client:
            _warmup_payload = {
                "model": settings.ollama_model,
                "messages": [
                    {"role": "system", "content": "You are a helpful assistant."},
                    {"role": "user",   "content": "Hello"},
                ],
                "stream": False,
                "options": {"num_predict": 1},  # 1 token is enough to load the model
            }
            _warmup_resp = await _warmup_client.post(
                f"{settings.ollama_base_url.rstrip('/')}/api/chat",
                json=_warmup_payload,
            )
            if _warmup_resp.status_code == 200:
                logger.info("Ollama warm-up complete — model is resident in memory")
            else:
                logger.warning("Ollama warm-up returned HTTP %d — first turn may be slow",
                               _warmup_resp.status_code)
    except Exception as _exc:
        logger.warning("Ollama warm-up failed (non-fatal, first turn may still be slow): %s", _exc)
    # ─────────────────────────────────────────────────────────────────────────
    
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
app.include_router(metrics_router, prefix="/api")
app.include_router(feedback_router, prefix="/api")


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    _sessions[session_id] = websocket
    logger.info("Session connected: %s  (total=%d)", session_id, len(_sessions))

    from pipeline.asr import DeepgramASR
    from pipeline.llm import OllamaLLM
    from pipeline.tts import ElevenLabsTTS
    from models.session import Session, TurnState
    from models.events import LLMTokenEvent, TurnCompleteEvent, AudioResponseEvent

    chat_session = Session(session_id=session_id)
    llm = OllamaLLM(session_id)
    tts = ElevenLabsTTS(session_id)
    
    # Track the current LLM task so we can cancel it if interrupted
    llm_task: asyncio.Task | None = None
    debounce_task: asyncio.Task | None = None
    accumulated_user_text: list[str] = []

    async def trigger_llm_after_debounce():
        nonlocal accumulated_user_text, llm_task
        # 2.5s silence threshold — long enough to allow natural speech pauses
        # without prematurely triggering the LLM and then immediately cancelling it.
        await asyncio.sleep(2.5)
        
        user_text = " ".join(accumulated_user_text).strip()
        accumulated_user_text = []
        
        if not user_text:
            return
            
        # Cancel any ongoing LLM task to handle interruption
        if llm_task and not llm_task.done():
            llm_task.cancel()
            
        tracker.record_llm_request(session_id)
        llm_task = asyncio.create_task(run_llm(user_text))

    async def run_llm(user_text: str):
        try:
            # Notify frontend we are thinking
            await websocket.send_json({"type": "status", "state": "thinking", "message": "Thinking..."})
            
            if chat_session.current_turn is None:
                chat_session.start_turn()
                tracker.start_turn(session_id, chat_session.current_turn.turn_id)
                
            # Add the user text to history
            history = chat_session.get_history_for_llm() + [{"role": "user", "content": user_text}]
            
            full_response = ""
            
            # Async generator that broadcasts LLM tokens while feeding them to TTS
            async def text_streamer():
                nonlocal full_response
                is_first_token = True
                async for token in llm.generate_response(
                    history,
                    interview_type=chat_session.interview_type,
                    custom_instructions=chat_session.custom_instructions
                ):
                    if is_first_token:
                        tracker.record_llm_first_token(session_id)
                        is_first_token = False
                    
                    # Check for sentence boundary heuristically or use your existing sentence detector if available
                    if token and any(p in token for p in [".", "?", "!"]):
                        tracker.record_llm_first_sentence(session_id)
                    
                    full_response += token
                    event = LLMTokenEvent(token=token)
                    await websocket.send_json(event.model_dump())
                    yield token

            # Stream audio from TTS — mark session as SPEAKING so on_asr_event
            # knows the interviewer is actively playing audio and may be interrupted.
            chat_session.state = TurnState.SPEAKING
            await websocket.send_json({"type": "status", "state": "speaking", "message": "Speaking..."})
            chunk_idx = 0
            tracker.record_tts_request(session_id)
            
            async for audio_bytes in tts.generate_audio(text_streamer()):
                import base64
                if chunk_idx == 0:
                    tracker.record_tts_first_audio(session_id)
                    
                event = AudioResponseEvent(
                    data=base64.b64encode(audio_bytes).decode("utf-8"),
                    chunk_index=chunk_idx
                )
                await websocket.send_json(event.model_dump())
                chunk_idx += 1
                
            current_turn_id = chat_session.current_turn.turn_id if chat_session.current_turn else "unknown"
            
            # Finish turn
            chat_session.finish_turn(user_text=user_text, assistant_text=full_response)
            
            budget = tracker.finish_turn(session_id)
            if budget:
                budget.turn_id = current_turn_id
                
            latency_dict = budget.to_breakdown() if budget else {}
            if budget:
                await store.save_turn(budget)
            
            # Persist conversation text for feedback generation
            await store.save_conversation_turn(session_id, user_text, full_response)
            
            event = TurnCompleteEvent(
                turn_id=current_turn_id,
                latency=latency_dict,
                full_response=full_response
            )
            await websocket.send_json(event.model_dump())
        except asyncio.CancelledError:
            logger.info("[%s] LLM/TTS generation task cancelled/interrupted by user speech", session_id)
            interrupted_text = full_response.strip() + "..." if full_response.strip() else "[Interrupted]"
            current_turn_id = chat_session.current_turn.turn_id if chat_session.current_turn else "interrupted"
            
            # Save the partial response generated so far to the session history
            chat_session.finish_turn(user_text=user_text, assistant_text=interrupted_text)
            
            # Send TurnCompleteEvent so client commits the partial response to its transcript
            event = TurnCompleteEvent(
                turn_id=current_turn_id,
                latency={},
                full_response=interrupted_text
            )
            await websocket.send_json(event.model_dump())
            
            # Ensure we reset status back to idle
            await websocket.send_json({"type": "status", "state": "idle", "message": "Ready"})
            raise

    # Callback to route ASR events back to the client or the next pipeline stage
    def on_asr_event(msg_dict: dict):
        nonlocal llm_task, debounce_task, accumulated_user_text
        event_type = msg_dict["type"]
        event_obj = msg_dict["event"]
        
        # Only cancel LLM if the interviewer is ACTIVELY SPEAKING audio to the user.
        # During THINKING phase we let the LLM keep running — the user's words are just
        # being accumulated for the next turn debounce, not an interruption.
        if llm_task and not llm_task.done() and chat_session.state == TurnState.SPEAKING:
            logger.info("[%s] User interrupted interviewer audio — cancelling LLM/TTS task", session_id)
            llm_task.cancel()
            
        # Fire-and-forget sending to client (since callback is synchronous)
        if event_type == "asr_interim":
            # If no current turn, start one to track speech start
            if chat_session.state == TurnState.IDLE or chat_session.current_turn is None:
                chat_session.start_turn()
                tracker.start_turn(session_id, chat_session.current_turn.turn_id)
            
            asyncio.create_task(websocket.send_json(event_obj.model_dump()))
        elif event_type == "asr_final":
            tracker.record_asr_final(session_id)
            asyncio.create_task(websocket.send_json(event_obj.model_dump()))
            
            user_text = event_obj.text.strip()
            if not user_text:
                return
                
            accumulated_user_text.append(user_text)
            
            # Reset debounce timer
            if debounce_task and not debounce_task.done():
                debounce_task.cancel()
            debounce_task = asyncio.create_task(trigger_llm_after_debounce())

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
                if msg.get("type") == "session_config":
                    chat_session.interview_type = msg.get("interview_type", "general")
                    chat_session.custom_instructions = msg.get("custom_instructions", "")
                    
                    voice_id = msg.get("voice_id")
                    if voice_id:
                        tts.voice_id = voice_id
                        
                    logger.info("[%s] Configured session: type=%s, instructions=%s, voice=%s", 
                                session_id, chat_session.interview_type, chat_session.custom_instructions, tts.voice_id)
                    
                    # Personalized initial greetings
                    greetings = {
                        "general": "Hello! Thank you for joining me today. Could you start by telling me a little bit about your engineering background and your most recent project?",
                        "system_design": "Hello! Thanks for joining me today. Let's design a high-scale real-time collaborative platform. How would you approach the overall architecture and data synchronization tradeoffs?",
                        "coding": "Hello! Thanks for engineering today. We'll be working on a coding and algorithms optimization problem together. To start off, what is your preferred coding language and how do you think about time and space complexity tradeoffs?",
                        "frontend": "Hello! Welcome to the frontend engineering interview. Let's build a highly responsive telemetry dashboard. How would you approach state modularity and minimizing browser repaints under constant data streams?",
                        "behavioral": "Hello! Thanks for meeting with me today. Let's discuss some of your past engineering and leadership experiences. Could you start by walking me through a time when you had to resolve a high-stress team conflict or a severe production outage?"
                    }
                    initial_greeting = greetings.get(chat_session.interview_type, greetings["general"])
                    chat_session.finish_turn(user_text="", assistant_text=initial_greeting)
                    
                    event = TurnCompleteEvent(
                        turn_id="initial",
                        latency={},
                        full_response=initial_greeting
                    )
                    await websocket.send_json(event.model_dump())

                    # Stream initial greeting voice audio using ElevenLabs
                    async def greeting_text_streamer():
                        yield initial_greeting

                    await websocket.send_json({"type": "status", "state": "speaking", "message": "Speaking..."})
                    chunk_idx = 0
                    async for audio_bytes in tts.generate_audio(greeting_text_streamer()):
                        import base64
                        event = AudioResponseEvent(
                            data=base64.b64encode(audio_bytes).decode("utf-8"),
                            chunk_index=chunk_idx
                        )
                        await websocket.send_json(event.model_dump())
                        chunk_idx += 1
                    
                    await websocket.send_json({"type": "status", "state": "idle", "message": "Ready"})
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
