# InterviewAI

A production-grade, real-time voice AI system that simulates a **Senior Engineering Interviewer**. It conducts live technical interviews over voice, asks follow-ups, challenges your reasoning, and gives structured feedback — all streamed end-to-end with sub-1.5s response latency.

## Stack

| Layer | Technology |
|---|---|
| Speech Recognition | Deepgram Nova-3 (WebSocket streaming) |
| Language Model | Ollama `llama3.2:3b` / `gemma2:4b` (local or Docker) |
| Text-to-Speech | ElevenLabs (streaming) |
| Backend | FastAPI + WebSockets (Python 3.11) |
| Frontend | React + Vite |
| Database | SQLite (session & latency logs) |
| Deployment | Railway (backend) + Vercel (frontend) |

## Local Setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- [Ollama](https://ollama.ai) installed and running

### 1. Pull the LLM model
```bash
ollama pull llama3.2:3b
```

### 2. Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -r requirements.txt
cp ../.env.example ../.env  # then fill in your API keys
uvicorn main:app --reload --port 8000
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` and start your interview.

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Description |
|---|---|
| `DEEPGRAM_API_KEY` | Deepgram API key (free $200 credit) |
| `ELEVENLABS_API_KEY` | ElevenLabs API key (free tier) |
| `ELEVENLABS_VOICE_ID` | ElevenLabs voice ID |
| `OLLAMA_BASE_URL` | Ollama server URL (default: `http://localhost:11434`) |
| `OLLAMA_MODEL` | Model name (e.g. `llama3.2:3b`) |

## Project Structure

```
voiceAgent/
├── backend/          # FastAPI server, pipeline, telemetry, resilience
├── frontend/         # React + Vite UI
├── docker-compose.yml
├── .env.example
└── README.md
```

## Features

- **Real-time streaming pipeline** — mic audio → ASR → LLM → TTS, all streamed over a single WebSocket connection
- **Natural interruption handling** — user can interrupt the interviewer mid-sentence
- **Latency observatory** — live dashboard breaking down ASR / LLM / TTS latency per turn with p50/p95/p99 stats
- **Resilience engineering** — circuit breakers, hard timeouts, and graceful degradation (never hangs silently)
- **Session replay** — record and replay sessions for debugging without a live mic
