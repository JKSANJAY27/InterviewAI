import json
import logging
from typing import AsyncGenerator
import httpx

from config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a Senior Engineering Interviewer conducting a technical interview.
Your persona is professional, high-signal, and analytical. 
You ask deep technical questions, follow up on tradeoffs, and challenge the candidate's reasoning.
Keep your responses concise and conversational, as they will be spoken aloud.
Do not output markdown code blocks unless absolutely necessary, and prefer describing code at a high level instead.
Do not use lists or bullet points. Speak in natural sentences.
"""

class OllamaLLM:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.base_url = settings.ollama_base_url.rstrip("/")
        self.model = settings.ollama_model

    async def generate_response(self, conversation_history: list[dict]) -> AsyncGenerator[str, None]:
        """
        Streams back the LLM response tokens.
        conversation_history should be a list of {"role": "...", "content": "..."}
        """
        messages = [{"role": "system", "content": SYSTEM_PROMPT}] + conversation_history

        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "options": {
                "temperature": 0.7,
                "top_p": 0.9,
            }
        }

        logger.info("[%s] Requesting LLM generation from %s", self.session_id, self.model)
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                async with client.stream("POST", f"{self.base_url}/api/chat", json=payload) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        try:
                            data = json.loads(line)
                            if "message" in data and "content" in data["message"]:
                                yield data["message"]["content"]
                        except json.JSONDecodeError:
                            logger.error("[%s] Failed to parse Ollama output line: %s", self.session_id, line)
        except httpx.ReadTimeout:
            logger.error("[%s] Ollama LLM read timeout", self.session_id)
            yield "I'm having a little trouble connecting to my thoughts. Could you repeat that?"
        except httpx.ConnectError:
            logger.error("[%s] Failed to connect to Ollama at %s", self.session_id, self.base_url)
            yield "My backend is currently unreachable. Please ensure the local model is running."
        except Exception as e:
            logger.exception("[%s] Unexpected error during LLM generation: %s", self.session_id, e)
            yield "Sorry, I encountered an unexpected error."
