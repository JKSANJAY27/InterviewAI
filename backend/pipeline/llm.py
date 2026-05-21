import json
import logging
from typing import AsyncGenerator
import httpx

from config import settings

logger = logging.getLogger(__name__)

def build_system_prompt(interview_type: str = "general", custom_instructions: str = "") -> str:
    prompt = """You are a Senior Engineering Interviewer conducting a technical interview.
Your persona is professional, high-signal, and analytical. 
You ask deep technical questions, follow up on tradeoffs, and challenge the candidate's reasoning.

CRITICAL RULES:
1. Speak as a real person in a live conversation: be extremely concise, natural, and friendly but focused.
2. Limit your responses to 1-3 short sentences. Never speak in long paragraphs or give verbose explanations.
3. Do not list things or use bullet points. Speak in natural flowing sentences.
4. Do not output markdown, bullet lists, or code blocks. Describe technical details at a high level.
5. Focus strictly on conducting the interview: ask exactly ONE focused question or follow-up question per turn. Let the candidate speak.
"""

    if interview_type == "system_design":
        prompt += "\nThis is a SYSTEM DESIGN interview. Focus on scalability, high availability, database choices, caching, API design, and distributed systems tradeoffs."
    elif interview_type == "coding":
        prompt += "\nThis is a CODING AND ALGORITHMS interview. Focus on problem-solving, data structures, space/time complexity (Big O), edge cases, and algorithmic efficiency."
    elif interview_type == "frontend":
        prompt += "\nThis is a FRONTEND/UI ENGINEERING interview. Focus on state management, browser performance, accessibility, rendering strategies, CSS layouts, and component design."
    elif interview_type == "behavioral":
        prompt += "\nThis is a BEHAVIORAL AND LEADERSHIP interview. Focus on conflict resolution, project management, ownership, communication, mentoring, and past engineering experiences."
    
    if custom_instructions.strip():
        prompt += f"\n\nCandidate's personalization instructions:\n{custom_instructions.strip()}"
        
    return prompt

class OllamaLLM:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.base_url = settings.ollama_base_url.rstrip("/")
        self.model = settings.ollama_model

    async def generate_response(
        self,
        conversation_history: list[dict],
        interview_type: str = "general",
        custom_instructions: str = ""
    ) -> AsyncGenerator[str, None]:
        """
        Streams back the LLM response tokens.
        conversation_history should be a list of {"role": "...", "content": "..."}
        """
        system_prompt = build_system_prompt(interview_type, custom_instructions)
        messages = [{"role": "system", "content": system_prompt}] + conversation_history

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
            # CPU-based Ollama execution can be slow for first-time prompt evaluation.
            # We increase timeout to 180.0s to prevent premature read timeouts.
            async with httpx.AsyncClient(timeout=180.0) as client:
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
