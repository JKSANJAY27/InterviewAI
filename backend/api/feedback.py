import json
import logging
import httpx

from fastapi import APIRouter, HTTPException
from config import settings
from telemetry.store import store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/feedback", tags=["feedback"])

# ── Feedback generation prompt ────────────────────────────────────────────────
# gemma4:e4b has strong JSON instruction-following ability.  We ask it to
# evaluate the candidate across 5 measurable dimensions and return a clean
# JSON object that the frontend can directly render.
FEEDBACK_PROMPT = """\
You are an expert technical interview evaluator. You have reviewed a complete interview transcript.

Evaluate the candidate's performance across 5 dimensions. Return ONLY valid JSON — no markdown, no explanation, just the JSON object.

Interview Transcript:
{transcript}

Respond with this exact JSON schema:
{{
  "scores": {{
    "technical_accuracy": <integer 0-10>,
    "communication_clarity": <integer 0-10>,
    "problem_solving_depth": <integer 0-10>,
    "follow_up_quality": <integer 0-10>,
    "overall_readiness": <integer 0-10>
  }},
  "summary": "<2-3 sentence overall performance assessment>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "improvements": ["<area 1>", "<area 2>", "<area 3>"],
  "study_topics": ["<topic 1>", "<topic 2>", "<topic 3>"]
}}"""


def _format_transcript(turns: list[dict]) -> str:
    lines = []
    for t in turns:
        role = "Interviewer" if t["role"] == "assistant" else "Candidate"
        lines.append(f"{role}: {t['content']}")
    return "\n".join(lines)


async def _generate_feedback(transcript_text: str) -> dict:
    """Call gemma4:e4b to produce a structured feedback JSON."""
    payload = {
        "model": settings.feedback_model,
        "messages": [
            {
                "role": "user",
                "content": FEEDBACK_PROMPT.format(transcript=transcript_text),
            }
        ],
        "stream": False,
        "format": "json",          # Ollama native JSON-mode for cleaner output
        "options": {
            "temperature": 0.3,    # Lower temp = more consistent, structured output
            "num_predict": 512,    # Enough for the full JSON response
            "num_ctx": 4096,       # Larger ctx needed to fit the whole transcript
        },
    }

    async with httpx.AsyncClient(timeout=450.0) as client:
        response = await client.post(
            f"{settings.ollama_base_url.rstrip('/')}/api/chat",
            json=payload,
        )
        response.raise_for_status()
        data = response.json()

    raw = data.get("message", {}).get("content", "")
    logger.debug("[feedback] Raw LLM output: %s", raw[:500])

    # Strip any accidental markdown fences
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```")[1]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
    cleaned = cleaned.strip()

    return json.loads(cleaned)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/sessions/{session_id}/generate")
async def generate_feedback(session_id: str):
    """Generate (and persist) a feedback report for a completed session."""
    transcript = await store.get_session_transcript(session_id)

    if len(transcript) < 2:
        raise HTTPException(
            status_code=422,
            detail="Not enough conversation data to generate feedback. "
                   "Complete at least 2 turns first.",
        )

    transcript_text = _format_transcript(transcript)
    logger.info(
        "[feedback] Generating feedback for session %s (%d turns, %d chars)",
        session_id, len(transcript), len(transcript_text),
    )

    try:
        feedback = await _generate_feedback(transcript_text)
    except json.JSONDecodeError as exc:
        logger.error("[feedback] LLM returned invalid JSON: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="Feedback model returned malformed JSON. Please try again.",
        )
    except httpx.ReadTimeout as exc:
        logger.error("[feedback] Ollama read timeout (model load took too long): %s", exc)
        raise HTTPException(
            status_code=504,
            detail="The feedback model took too long to load and respond (timeout). "
                   "This is common on the first generation as Gemma 4 (9.6 GB) loads into RAM/VRAM. "
                   "The model should be loaded now — please try clicking generate again.",
        )
    except httpx.HTTPError as exc:
        logger.error("[feedback] Ollama request failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Feedback model unavailable: {exc}")

    await store.save_feedback(session_id, feedback)
    logger.info("[feedback] Feedback persisted for session %s", session_id)
    return {"session_id": session_id, "feedback": feedback}


@router.get("/sessions/{session_id}")
async def get_feedback(session_id: str):
    """Retrieve a previously generated feedback report."""
    result = await store.get_feedback(session_id)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail="No feedback found for this session. Generate it first.",
        )
    return {"session_id": session_id, **result}
