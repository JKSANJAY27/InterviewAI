from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
import uuid


class TurnState(str, Enum):
    IDLE = "idle"
    LISTENING = "listening"
    TRANSCRIBING = "transcribing"
    THINKING = "thinking"
    SPEAKING = "speaking"
    INTERRUPTED = "interrupted"


@dataclass
class Turn:
    turn_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    user_text: str = ""
    assistant_text: str = ""
    state: TurnState = TurnState.IDLE


@dataclass
class Session:
    session_id: str
    state: TurnState = TurnState.IDLE
    conversation_history: list[dict] = field(default_factory=list)
    current_turn: Optional[Turn] = None
    total_turns: int = 0
    interview_type: str = "general"
    custom_instructions: str = ""

    def start_turn(self) -> Turn:
        self.current_turn = Turn()
        self.state = TurnState.LISTENING
        return self.current_turn

    def finish_turn(self, user_text: str, assistant_text: str) -> None:
        if self.current_turn:
            self.current_turn.user_text = user_text
            self.current_turn.assistant_text = assistant_text
            self.conversation_history.append(
                {"role": "user", "content": user_text}
            )
            self.conversation_history.append(
                {"role": "assistant", "content": assistant_text}
            )
            self.total_turns += 1
            self.current_turn = None
        self.state = TurnState.IDLE

    def get_history_for_llm(self, max_turns: int = 4) -> list[dict]:
        """Return last N turns to keep context window bounded."""
        return self.conversation_history[-(max_turns * 2):]
