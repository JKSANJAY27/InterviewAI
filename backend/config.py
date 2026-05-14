from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    # ASR
    deepgram_api_key: str = Field(..., env="DEEPGRAM_API_KEY")

    # TTS
    elevenlabs_api_key: str = Field(..., env="ELEVENLABS_API_KEY")
    elevenlabs_voice_id: str = Field(
        "21m00Tcm4TlvDq8ikWAM", env="ELEVENLABS_VOICE_ID"
    )

    # LLM
    ollama_base_url: str = Field("http://localhost:11434", env="OLLAMA_BASE_URL")
    ollama_model: str = Field("llama3.2:3b", env="OLLAMA_MODEL")

    # Server
    host: str = Field("0.0.0.0", env="HOST")
    port: int = Field(8000, env="PORT")
    cors_origins: str = Field(
        "http://localhost:5173,http://localhost:3000", env="CORS_ORIGINS"
    )

    # Features
    enable_session_recording: bool = Field(False, env="ENABLE_SESSION_RECORDING")
    log_level: str = Field("INFO", env="LOG_LEVEL")

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    model_config = {"env_file": "../.env", "extra": "ignore"}


settings = Settings()
