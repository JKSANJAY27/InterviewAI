import asyncio
import base64
import logging
from typing import AsyncGenerator

from elevenlabs.client import AsyncElevenLabs

from config import settings

logger = logging.getLogger(__name__)


class ElevenLabsTTS:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.client = AsyncElevenLabs(api_key=settings.elevenlabs_api_key)
        self.voice_id = settings.elevenlabs_voice_id

    async def generate_audio(self, text_stream: AsyncGenerator[str, None]) -> AsyncGenerator[bytes, None]:
        """
        Takes an async generator of text tokens and yields raw audio bytes from ElevenLabs.
        """
        logger.info("[%s] Requesting TTS stream from ElevenLabs", self.session_id)
        
        # We need to wrap the text stream in a way that ElevenLabs accepts.
        # AsyncElevenLabs.generate expects a string or an async iterator of strings.
        try:
            audio_stream = await self.client.generate(
                text=text_stream,
                voice=self.voice_id,
                model="eleven_turbo_v2",
                stream=True,
                output_format="mp3_44100_128",
            )
            
            async for chunk in audio_stream:
                if chunk:
                    yield chunk
        except Exception as e:
            logger.error("[%s] ElevenLabs TTS error: %s", self.session_id, e)
