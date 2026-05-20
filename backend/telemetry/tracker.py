import time
from typing import Dict
from models.events import LatencyBudget

class LatencyTracker:
    def __init__(self):
        # Maps session_id -> current Turn's LatencyBudget
        self.active_budgets: Dict[str, LatencyBudget] = {}

    def start_turn(self, session_id: str, turn_id: str):
        self.active_budgets[session_id] = LatencyBudget(
            session_id=session_id,
            turn_id=turn_id,
            speech_start_ms=time.perf_counter() * 1000
        )

    def record_asr_final(self, session_id: str):
        if session_id in self.active_budgets:
            self.active_budgets[session_id].asr_final_ms = time.perf_counter() * 1000

    def record_llm_request(self, session_id: str):
        if session_id in self.active_budgets:
            self.active_budgets[session_id].llm_request_ms = time.perf_counter() * 1000

    def record_llm_first_token(self, session_id: str):
        if session_id in self.active_budgets:
            budget = self.active_budgets[session_id]
            if budget.llm_first_token_ms is None:
                budget.llm_first_token_ms = time.perf_counter() * 1000

    def record_llm_first_sentence(self, session_id: str):
        if session_id in self.active_budgets:
            budget = self.active_budgets[session_id]
            if budget.llm_first_sentence_ms is None:
                budget.llm_first_sentence_ms = time.perf_counter() * 1000

    def record_tts_request(self, session_id: str):
        if session_id in self.active_budgets:
            budget = self.active_budgets[session_id]
            if budget.tts_request_ms is None:
                budget.tts_request_ms = time.perf_counter() * 1000

    def record_tts_first_audio(self, session_id: str):
        if session_id in self.active_budgets:
            budget = self.active_budgets[session_id]
            if budget.tts_first_audio_ms is None:
                budget.tts_first_audio_ms = time.perf_counter() * 1000

    def record_audio_playback(self, session_id: str):
        if session_id in self.active_budgets:
            budget = self.active_budgets[session_id]
            if budget.audio_playback_ms is None:
                budget.audio_playback_ms = time.perf_counter() * 1000

    def finish_turn(self, session_id: str) -> LatencyBudget | None:
        budget = self.active_budgets.pop(session_id, None)
        return budget

# Global singleton
tracker = LatencyTracker()
