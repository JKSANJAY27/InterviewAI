import asyncio
import httpx
import logging
from typing import AsyncGenerator

from config import settings

logger = logging.getLogger(__name__)

class ElevenLabsTTS:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.api_key = settings.elevenlabs_api_key
        self.voice_id = settings.elevenlabs_voice_id

    async def generate_audio(self, text_stream: AsyncGenerator[str, None]) -> AsyncGenerator[bytes, None]:
        """
        Takes an async generator of text tokens and yields raw audio bytes from ElevenLabs via httpx.
        """
        logger.info("[%s] Requesting TTS stream from ElevenLabs", self.session_id)
        sentence = ""
        try:
            async for text_chunk in text_stream:
                sentence += text_chunk
                if any(punct in text_chunk for punct in [".", "?", "!", "\n"]):
                    if sentence.strip():
                        async for chunk in self._fetch_audio_chunk(sentence.strip()):
                            yield chunk
                    sentence = ""
            
            if sentence.strip():
                async for chunk in self._fetch_audio_chunk(sentence.strip()):
                    yield chunk

        except Exception as e:
            logger.error("[%s] ElevenLabs TTS error: %s", self.session_id, e)

    async def _fetch_audio_chunk(self, text: str) -> AsyncGenerator[bytes, None]:
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{self.voice_id}/stream"
        headers = {
            "Accept": "audio/mpeg",
            "xi-api-key": self.api_key,
            "Content-Type": "application/json"
        }
        data = {
            "text": text,
            "model_id": "eleven_turbo_v2",
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.5
            }
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, json=data, timeout=15.0)
            if response.status_code != 200:
                logger.error("[%s] ElevenLabs API failed with status %d: %s", self.session_id, response.status_code, response.text)
            response.raise_for_status()
            # Yield the entire MP3 file for this sentence as a single chunk
            yield response.content
