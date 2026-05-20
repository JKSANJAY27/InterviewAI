import aiosqlite
import json
import logging
from typing import List, Dict, Any
from pathlib import Path
from models.events import LatencyBudget

logger = logging.getLogger(__name__)

# Resolve the path relative to this file's directory (backend/telemetry)
DB_PATH = Path(__file__).parent.parent / "data" / "metrics.db"

class TelemetryStore:
    def __init__(self):
        self.db_path = DB_PATH
        # Ensure dir exists
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    async def init_db(self):
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS turns (
                    turn_id TEXT PRIMARY KEY,
                    session_id TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    asr_latency_ms REAL,
                    llm_queue_ms REAL,
                    llm_ttft_ms REAL,
                    llm_first_sentence_ms REAL,
                    tts_latency_ms REAL,
                    total_ms REAL,
                    raw_budget JSON
                )
                """
            )
            await db.commit()
            logger.info("Telemetry database initialized at %s", self.db_path)

    async def save_turn(self, budget: LatencyBudget):
        breakdown = budget.to_breakdown()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """
                INSERT INTO turns (
                    turn_id, session_id, asr_latency_ms, llm_queue_ms,
                    llm_ttft_ms, llm_first_sentence_ms, tts_latency_ms,
                    total_ms, raw_budget
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    budget.turn_id,
                    budget.session_id,
                    breakdown.get("asr_latency_ms"),
                    breakdown.get("llm_queue_ms"),
                    breakdown.get("llm_ttft_ms"),
                    breakdown.get("llm_first_sentence_ms"),
                    breakdown.get("tts_latency_ms"),
                    breakdown.get("total_ms"),
                    json.dumps(budget.model_dump())
                )
            )
            await db.commit()

    async def get_session_turns(self, session_id: str) -> List[Dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM turns WHERE session_id = ? ORDER BY timestamp ASC", 
                (session_id,)
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def get_summary_metrics(self) -> Dict[str, Any]:
        # Simple averages for now, can be expanded to p50/p95/p99
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT 
                    AVG(asr_latency_ms) as avg_asr,
                    AVG(llm_ttft_ms) as avg_llm,
                    AVG(tts_latency_ms) as avg_tts,
                    AVG(total_ms) as avg_total,
                    COUNT(*) as total_turns
                FROM turns
                """
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else {}

store = TelemetryStore()
