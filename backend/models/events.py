from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel


class EventType(str, Enum):
    # Client → Server
    AUDIO_CHUNK = "audio_chunk"
    SESSION_CONFIG = "session_config"
    INTERRUPT = "interrupt"

    # Server → Client: ASR
    TRANSCRIPT_INTERIM = "transcript_interim"
    TRANSCRIPT_FINAL = "transcript_final"

    # Server → Client: LLM
    LLM_TOKEN = "llm_token"
    LLM_SENTENCE = "llm_sentence"

    # Server → Client: TTS
    AUDIO_RESPONSE = "audio_response"

    # Server → Client: Control
    TURN_COMPLETE = "turn_complete"
    TURN_START = "turn_start"
    STATUS = "status"
    ERROR = "error"


class BaseEvent(BaseModel):
    type: EventType


class TranscriptInterimEvent(BaseEvent):
    type: EventType = EventType.TRANSCRIPT_INTERIM
    text: str
    confidence: float = 0.0


class TranscriptFinalEvent(BaseEvent):
    type: EventType = EventType.TRANSCRIPT_FINAL
    text: str
    duration_ms: float


class LLMTokenEvent(BaseEvent):
    type: EventType = EventType.LLM_TOKEN
    token: str


class LLMSentenceEvent(BaseEvent):
    type: EventType = EventType.LLM_SENTENCE
    text: str
    sentence_index: int


class AudioResponseEvent(BaseEvent):
    type: EventType = EventType.AUDIO_RESPONSE
    data: str          # base64-encoded audio chunk
    chunk_index: int
    is_final: bool = False


class LatencyBudget(BaseModel):
    session_id: str
    turn_id: str
    speech_start_ms: Optional[float] = None
    asr_final_ms: Optional[float] = None
    llm_request_ms: Optional[float] = None
    llm_first_token_ms: Optional[float] = None
    llm_first_sentence_ms: Optional[float] = None
    tts_request_ms: Optional[float] = None
    tts_first_audio_ms: Optional[float] = None
    audio_playback_ms: Optional[float] = None

    @property
    def asr_latency(self) -> Optional[float]:
        if self.speech_start_ms and self.asr_final_ms:
            return self.asr_final_ms - self.speech_start_ms
        return None

    @property
    def llm_ttft(self) -> Optional[float]:
        if self.llm_request_ms and self.llm_first_token_ms:
            return self.llm_first_token_ms - self.llm_request_ms
        return None

    @property
    def tts_latency(self) -> Optional[float]:
        if self.tts_request_ms and self.tts_first_audio_ms:
            return self.tts_first_audio_ms - self.tts_request_ms
        return None

    @property
    def total_latency(self) -> Optional[float]:
        playback_time = self.audio_playback_ms or self.tts_first_audio_ms
        if self.speech_start_ms and playback_time:
            return playback_time - self.speech_start_ms
        return None

    def to_breakdown(self) -> dict[str, Any]:
        return {
            "asr_latency_ms": self.asr_latency,
            "llm_queue_ms": (
                self.llm_request_ms - self.asr_final_ms
                if self.llm_request_ms and self.asr_final_ms
                else None
            ),
            "llm_ttft_ms": self.llm_ttft,
            "llm_first_sentence_ms": (
                self.llm_first_sentence_ms - self.llm_first_token_ms
                if self.llm_first_sentence_ms and self.llm_first_token_ms
                else None
            ),
            "tts_latency_ms": self.tts_latency,
            "total_ms": self.total_latency,
        }


class TurnCompleteEvent(BaseEvent):
    type: EventType = EventType.TURN_COMPLETE
    turn_id: str
    latency: dict[str, Any]
    full_response: str


class StatusEvent(BaseEvent):
    type: EventType = EventType.STATUS
    state: str          # "listening" | "thinking" | "speaking" | "idle"
    message: Optional[str] = None


class ErrorEvent(BaseEvent):
    type: EventType = EventType.ERROR
    code: str
    message: str
    recoverable: bool = True
