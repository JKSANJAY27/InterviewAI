# InterviewAI 🎙️🤖

An elite, production-grade, real-time voice AI system that simulates a **Senior Engineering Interviewer**. It conducts live, low-latency technical interviews over voice, dynamically adapts its follow-up questions, challenges candidate reasoning, and generates comprehensive multi-metric performance feedback. 

All speech-to-text, LLM stream reasoning, and text-to-speech rendering are orchestrated through a highly optimized, event-driven WebSocket pipeline delivering sub-**1.2s end-to-end latency** on standard consumer hardware.

---

## 🚀 Architectural Blueprint

InterviewAI operates on a highly concurrent, event-driven asymmetric streaming architecture. Below is the system flow mapping the real-time full-duplex WebSocket loop:

```
                                 [ Dual-Channel WebSocket Connection ]
                                                 |
         +---------------------------------------+---------------------------------------+
         | (Candidate Audio Stream Input)                                                | (Interviewer Audio Stream Output)
         v                                                                               v
  [ Deepgram Nova-3 ASR ]                                                         [ Client Audio Playback Queue ]
         |                                                                               ^
         | (Real-time Speech Frame)                                                      | (Chunked PCM Audio Buffer)
         v                                                                               |
  [ Interim Speech Debouncer ]                                                    [ ElevenLabs TTS Stream ]
         |                                                                               ^
         | (Normalized Text Block)                                                       | (Sentence-by-Sentence Chunks)
         v                                                                               |
  [ Interruption Core ] --(Signals Cancellation)--> [ LLM Stream Coroutines (Ollama) ] --+
                                                                 ^
                                                                 | (System Context & RAG Prompting)
                                                          [ Session History Memory ]
```

---

## ⚡ Technical Core & Engineering Highlights

### 1. Ultra-Low Latency Streaming Pipeline
* **ASR (Speech-to-Text):** Connects to the **Deepgram Nova-3** WebSocket API. The backend ingests raw binary mic chunks from the candidate and pipes them via high-performance ASGI channels, receiving transcribed segments instantly.
* **LLM Stream Routing:** Integrates directly with a local **Ollama** engine. Generative responses are streamed sentence-by-sentence. A custom regex-based sentence splitter intercepts the LLM output buffer in real time, pushing complete grammatical clauses to the TTS engine before the LLM even finishes generating the complete paragraph.
* **TTS (Text-to-Speech):** Utilizes **ElevenLabs API** with HTTP streaming chunking. By utilizing chunked PCM audio output streams, the system plays audio frames incrementally, maintaining an ultra-snappy flow.

### 2. Event-Driven Interruption Engine
To support natural conversational flows, InterviewAI implements a zero-lag interruption handler:
* **Detection:** The backend constantly monitors incoming candidate transcription streams. If any speech is detected from the candidate while the interviewer is playing audio, an interruption event is raised.
* **Cancellation:** The system instantly terminates the concurrent LLM generator coroutine and cancels pending TTS tasks.
* **Flushing:** A control frame (`type: "interrupt"`) is sent over the WebSocket. The client player immediately purges its active buffer, flushes all audio tracks, and transitions into recording mode.

### 3. Asynchronous Debounced Interim Speech Merging
* **The Problem:** Real-time ASR tools yield rapid, fragmented interim transcription blocks. Unchecked, these cause the UI to render broken, split chat bubbles for a single continuous sentence.
* **The Solution:** An asymmetric interim speech buffer merges overlapping segments. Incoming transcripts are debounced using an 800ms silence-detection timeout. Only after the candidate stops speaking does the engine lock the segment and compile it into a single, cohesive message bubble, dramatically improving readability.

### 4. Local CPU Resource Throttling & System Preservation
* **The Challenge:** Generating rich performance evaluations using multi-billion parameter LLMs on consumer-grade CPU setups (local Ollama instances) originally caused 100% CPU spikes, system freezes, and network timeouts.
* **The Solution:** The feedback engine is highly optimized for lightweight local LLMs like `llama3.2:3b` and `gemma2:2b`.
* **Parameter Tuning:** The generation requests configure low-footprint constraint parameters:
  ```json
  {
    "temperature": 0.3,
    "num_predict": 750,
    "top_k": 30,
    "top_p": 0.85
  }
  ```
* **Threading Isolations:** Bulk JSON parsing and evaluation tasks run inside dedicated asynchronous thread pools (`asyncio.to_thread`), preventing the primary WebSocket event loop from starving.

---

## 📊 Analytics Dashboard & Session Telemetry

InterviewAI records detailed telemetry logs for every turn, measuring latencies down to the millisecond.

### Database Schema (SQLite)

```
        turns TABLE                                conversations TABLE
+-----------------------------+             +-----------------------------+
| turn_id               (PK)  |             | id                     (PK) |
| session_id            (FK)  |             | session_id            (FK)  |
| timestamp             (DATE)|             | timestamp             (DATE)|
| asr_latency_ms        (REAL)|             | role                  (TEXT)|
| llm_queue_ms          (REAL)|             | content               (TEXT)|
| llm_ttft_ms           (REAL)|             +-----------------------------+
| llm_first_sentence_ms (REAL)|
| tts_latency_ms        (REAL)|                      feedback TABLE
| total_ms              (REAL)|             +-----------------------------+
| raw_budget            (JSON)|             | session_id            (PK)  |
+-----------------------------+             | timestamp             (DATE)|
                                            | feedback_json         (TEXT)|
                                            +-----------------------------+
```

### High-Fidelity Dashboard Page
* **Dual-Panel Session Selector:** A sidebar displaying current active sessions and a timeline of past historical sessions.
* **Live Telemetry Waterfall Charts:** Real-time graphs breaking down latency (ASR time, LLM queue times, LLM Time-to-First-Token, TTS processing, and E2E total latency).
* **Multi-Format Client Exporters:** One-click client downloads for Markdown (`.md`) and raw JSON (`.json`) transcripts.
* **Vector PDF Generator:** Native `@media print` style overrides format the evaluation, radar charts, scorecard, and full transcripts into a highly polished, vector-sharp PDF document.

---

## 🛠️ Stack & Technologies

* **Core Backend:** Python 3.11, FastAPI, WebSockets (`websockets`, `uvicorn`), `aiosqlite`.
* **Core Frontend:** React 18, Vite, Chart.js (`react-chartjs-2`), React Router.
* **ASR Engine:** Deepgram WebSocket SDK (Nova-3 Speech-to-Text model).
* **LLM Engine:** Ollama local API (running quantized `llama3.2:3b` / `gemma2:2b`).
* **TTS Engine:** ElevenLabs streaming HTTP voice API.

---

## ⚙️ Environment Configuration

Create a `.env` file in the project root:

```env
# Speech recognition credentials
DEEPGRAM_API_KEY=your_deepgram_api_key_here

# Voice synthesiser credentials
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# Ollama local settings (Defaults to standard local server)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b
```

---

## 📦 Getting Started

### Prerequisites
* Python 3.11+
* Node.js 18+
* [Ollama](https://ollama.com/) running on local CPU / GPU

### 1. Model Preparation
Pull the target optimized 3B model locally:
```bash
ollama pull llama3.2:3b
```

### 2. Backend Orchestration
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows use: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Frontend Execution
```bash
cd frontend
npm install
npm run dev
```

Navigate to `http://localhost:5173` to start the live simulation. Select your dynamic interviewer voice, connect your microphone, and begin the technical screening!
