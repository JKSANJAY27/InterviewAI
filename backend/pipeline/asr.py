import asyncio
import logging
from typing import AsyncGenerator, Callable

from deepgram import (
    DeepgramClient,
    DeepgramClientOptions,
    LiveTranscriptionEvents,
    LiveOptions,
    LiveResultResponse,
)

from config import settings
from models.events import TranscriptInterimEvent, TranscriptFinalEvent

logger = logging.getLogger(__name__)


class DeepgramASR:
    def __init__(self, session_id: str, on_event: Callable[[dict], None]):
        self.session_id = session_id
        self.on_event = on_event
        
        # We will initialize connection per session
        client_options = DeepgramClientOptions(
            api_key=settings.deepgram_api_key,
        )
        self.client = DeepgramClient(
            settings.deepgram_api_key, config=client_options
        )
        self.connection = None
        self._is_active = False

    async def start(self):
        """Starts the Deepgram WebSocket connection."""
        self.connection = self.client.listen.asyncwebsocket.v("1")
        
        self.connection.on(LiveTranscriptionEvents.Transcript, self._on_message)
        self.connection.on(LiveTranscriptionEvents.Error, self._on_error)
        self.connection.on(LiveTranscriptionEvents.Close, self._on_close)

        options = LiveOptions(
            model="nova-3",
            language="en-US",
            smart_format=True,
            encoding="webm", # matches browser's MediaRecorder config
            sample_rate=16000,
            interim_results=True,
            endpointing=300, # 300ms of silence triggers endpoint
        )
        
        if await self.connection.start(options) is False:
            logger.error("[%s] Deepgram failed to connect", self.session_id)
            return

        self._is_active = True
        logger.info("[%s] Deepgram ASR started", self.session_id)

    async def stop(self):
        """Stops the Deepgram WebSocket connection."""
        if self._is_active and self.connection:
            await self.connection.finish()
            self._is_active = False
            logger.info("[%s] Deepgram ASR stopped", self.session_id)

    async def push_audio(self, chunk: bytes):
        """Send raw audio chunk to Deepgram."""
        if self._is_active and self.connection:
            await self.connection.send(chunk)

    def _on_message(self, *args, **kwargs):
        """Handle incoming Deepgram transcriptions."""
        # The Python SDK passes the result object as the second arg usually
        result: LiveResultResponse = kwargs.get("result") or args[1]
        
        if not result.channel.alternatives:
            return

        alt = result.channel.alternatives[0]
        text = alt.transcript

        if not text.strip():
            return

        if result.is_final:
            event = TranscriptFinalEvent(
                text=text,
                duration_ms=result.duration * 1000
            )
            logger.debug("[%s] ASR FINAL: %s", self.session_id, text)
            # Route back to main loop
            self.on_event({"type": "asr_final", "event": event})
        else:
            event = TranscriptInterimEvent(
                text=text,
                confidence=alt.confidence
            )
            self.on_event({"type": "asr_interim", "event": event})

    def _on_error(self, *args, **kwargs):
        error = kwargs.get("error") or args[1]
        logger.error("[%s] Deepgram ASR Error: %s", self.session_id, error)

    def _on_close(self, *args, **kwargs):
        self._is_active = False
        logger.info("[%s] Deepgram connection closed", self.session_id)
