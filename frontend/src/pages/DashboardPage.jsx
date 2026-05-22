import { useEffect, useState, useRef, useCallback } from 'react'
import { Bar, Line, Radar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { useInterview } from '../context/InterviewContext'
import './DashboardPage.css'

// Register ChartJS modules
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
  Filler,
)

const API = 'http://localhost:8000/api'

// ── Score color helper ────────────────────────────────────────────────────────
function scoreColor(score) {
  if (score >= 7) return '#22c55e'
  if (score >= 5) return '#f59e0b'
  return '#ef4444'
}
function scoreBadge(score) {
  if (score >= 7) return 'badge--green'
  if (score >= 5) return 'badge--yellow'
  return 'badge--red'
}
const SCORE_LABELS = {
  technical_accuracy:    'Technical Accuracy',
  communication_clarity: 'Communication Clarity',
  problem_solving_depth: 'Problem-Solving Depth',
  follow_up_quality:     'Follow-up Quality',
  overall_readiness:     'Overall Readiness',
}

// ── FeedbackCard component ────────────────────────────────────────────────────
function FeedbackCard({ feedback, generatedAt }) {
  const scores = feedback.scores || {}
  const labels  = Object.keys(scores).map(k => SCORE_LABELS[k] || k)
  const values  = Object.values(scores)
  const overall = scores.overall_readiness ?? 0

  const radarData = {
    labels,
    datasets: [{
      label: 'Score',
      data: values,
      backgroundColor: 'rgba(99, 102, 241, 0.15)',
      borderColor: '#818cf8',
      pointBackgroundColor: values.map(scoreColor),
      pointBorderColor: '#fff',
      pointRadius: 5,
      borderWidth: 2,
    }],
  }
  const radarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      r: {
        min: 0,
        max: 10,
        ticks: { stepSize: 2, color: '#4b5178', backdropColor: 'transparent' },
        grid: { color: 'rgba(255,255,255,0.07)' },
        angleLines: { color: 'rgba(255,255,255,0.07)' },
        pointLabels: { color: '#8b90b8', font: { size: 11, weight: '500' } },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => ` ${ctx.raw}/10` } },
    },
  }

  return (
    <div className="feedback-card">
      <div className="feedback-header">
        <div className="feedback-title-row">
          <h3 className="feedback-title">Interview Feedback Report</h3>
          <span className={`badge ${scoreBadge(overall)} feedback-overall-badge`}>
            Overall: {overall}/10
          </span>
        </div>
        {generatedAt && (
          <p className="feedback-meta">Generated {new Date(generatedAt).toLocaleString()}</p>
        )}
      </div>

      <div className="feedback-body">
        {/* Radar chart */}
        <div className="feedback-radar-wrap">
          <div className="feedback-radar-chart">
            <Radar data={radarData} options={radarOptions} />
          </div>
          {/* Score breakdown */}
          <div className="feedback-scores">
            {Object.entries(scores).map(([key, val]) => (
              <div key={key} className="score-row">
                <span className="score-label">{SCORE_LABELS[key] || key}</span>
                <div className="score-bar-wrap">
                  <div
                    className="score-bar"
                    style={{ width: `${val * 10}%`, background: scoreColor(val) }}
                  />
                </div>
                <span className="score-value" style={{ color: scoreColor(val) }}>{val}/10</span>
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        {feedback.summary && (
          <div className="feedback-section">
            <h4 className="feedback-section-title">Summary</h4>
            <p className="feedback-summary-text">{feedback.summary}</p>
          </div>
        )}

        {/* Three columns */}
        <div className="feedback-columns">
          {feedback.strengths?.length > 0 && (
            <div className="feedback-col">
              <h4 className="feedback-col-title feedback-col-title--green">
                <span>✓</span> Strengths
              </h4>
              <ul className="feedback-list">
                {feedback.strengths.map((s, i) => (
                  <li key={i} className="feedback-list-item feedback-list-item--green">{s}</li>
                ))}
              </ul>
            </div>
          )}
          {feedback.improvements?.length > 0 && (
            <div className="feedback-col">
              <h4 className="feedback-col-title feedback-col-title--amber">
                <span>↑</span> Areas to Improve
              </h4>
              <ul className="feedback-list">
                {feedback.improvements.map((s, i) => (
                  <li key={i} className="feedback-list-item feedback-list-item--amber">{s}</li>
                ))}
              </ul>
            </div>
          )}
          {feedback.study_topics?.length > 0 && (
            <div className="feedback-col">
              <h4 className="feedback-col-title feedback-col-title--blue">
                <span>📚</span> Study Topics
              </h4>
              <ul className="feedback-list">
                {feedback.study_topics.map((s, i) => (
                  <li key={i} className="feedback-list-item feedback-list-item--blue">{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── FeedbackSkeleton ──────────────────────────────────────────────────────────
function FeedbackSkeleton() {
  return (
    <div className="feedback-card feedback-skeleton">
      <div className="skeleton-header">
        <div className="skeleton-line skeleton-line--wide" />
        <div className="skeleton-line skeleton-line--narrow" />
      </div>
      <div className="skeleton-body">
        <div className="skeleton-radar" />
        <div className="skeleton-lines">
          {[80, 65, 70, 55, 75].map((w, i) => (
            <div key={i} className="skeleton-score-row">
              <div className="skeleton-line" style={{ width: `${w}px` }} />
              <div className="skeleton-bar" />
            </div>
          ))}
        </div>
      </div>
      <p className="skeleton-generating">
        <span className="dot" /> Analysing interview with Gemma 4…
      </p>
    </div>
  )
}

// ── Main Dashboard Page ───────────────────────────────────────────────────────
export default function DashboardPage() {
  const { sessionId } = useInterview()

  const [summary, setSummary] = useState(null)
  const [turns, setTurns] = useState([])
  const [selectedTurnId, setSelectedTurnId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Feedback state
  const [feedback, setFeedback] = useState(null)
  const [feedbackGeneratedAt, setFeedbackGeneratedAt] = useState(null)
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [feedbackError, setFeedbackError] = useState(null)

  const pollInterval = useRef(null)

  const fetchData = useCallback(async () => {
    try {
      const summaryRes = await fetch(`${API}/metrics/summary`)
      if (summaryRes.ok) {
        const d = await summaryRes.json()
        setSummary(d.summary)
      }
      if (sessionId) {
        const turnsRes = await fetch(`${API}/metrics/sessions/${sessionId}/turns`)
        if (turnsRes.ok) {
          const d = await turnsRes.json()
          const fetchedTurns = d.turns || []
          setTurns(fetchedTurns)
          if (fetchedTurns.length > 0) {
            setSelectedTurnId(prev => {
              const exists = fetchedTurns.some(t => t.turn_id === prev)
              return exists ? prev : fetchedTurns[fetchedTurns.length - 1].turn_id
            })
          }
        }
      }
      setError(null)
    } catch (err) {
      console.error('Error fetching metrics:', err)
      setError('Unable to reach telemetry service.')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  // Load any existing feedback for this session on mount
  const fetchExistingFeedback = useCallback(async () => {
    if (!sessionId) return
    try {
      const res = await fetch(`${API}/feedback/sessions/${sessionId}`)
      if (res.ok) {
        const d = await res.json()
        setFeedback(d.feedback)
        setFeedbackGeneratedAt(d.generated_at)
      }
    } catch { /* no stored feedback yet — that's fine */ }
  }, [sessionId])

  useEffect(() => {
    fetchData()
    fetchExistingFeedback()
    pollInterval.current = setInterval(fetchData, 3000)
    return () => { if (pollInterval.current) clearInterval(pollInterval.current) }
  }, [fetchData, fetchExistingFeedback])

  const handleGenerateFeedback = async () => {
    if (!sessionId) return
    setFeedbackLoading(true)
    setFeedbackError(null)
    try {
      const res = await fetch(`${API}/feedback/sessions/${sessionId}/generate`, {
        method: 'POST',
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Generation failed')
      }
      const d = await res.json()
      setFeedback(d.feedback)
      setFeedbackGeneratedAt(new Date().toISOString())
    } catch (err) {
      setFeedbackError(err.message)
    } finally {
      setFeedbackLoading(false)
    }
  }

  const selectedTurn = turns.find(t => t.turn_id === selectedTurnId)

  // ── Waterfall Chart ───────────────────────────────────────────────────────
  const waterfallData = selectedTurn ? {
    labels: ['ASR', 'LLM Queue', 'LLM TTFT', 'LLM Sentence', 'TTS', 'Total E2E'],
    datasets: [{
      label: 'Latency (ms)',
      data: [
        selectedTurn.asr_latency_ms || 0,
        selectedTurn.llm_queue_ms || 0,
        selectedTurn.llm_ttft_ms || 0,
        selectedTurn.llm_first_sentence_ms || 0,
        selectedTurn.tts_latency_ms || 0,
        selectedTurn.total_ms || 0,
      ],
      backgroundColor: ['#22c55e','#6366f1','#818cf8','#c084fc','#f59e0b','#ec4899'],
      borderRadius: 8,
      barPercentage: 0.6,
    }],
  } : null

  const waterfallOptions = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => ` ${ctx.raw.toFixed(1)} ms` } },
    },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8b90b8', callback: v => `${v}ms` } },
      y: { grid: { display: false }, ticks: { color: '#f0f2ff', font: { weight: '600' } } },
    },
  }

  // ── Time Series Chart ─────────────────────────────────────────────────────
  const timeSeriesData = turns.length > 0 ? {
    labels: turns.map((_, idx) => `Turn ${idx + 1}`),
    datasets: [
      {
        label: 'Total E2E Latency',
        data: turns.map(t => t.total_ms || 0),
        borderColor: '#818cf8',
        backgroundColor: 'rgba(129,140,248,0.1)',
        tension: 0.3,
        fill: true,
        pointBackgroundColor: '#818cf8',
        pointRadius: 4,
      },
      {
        label: 'ASR Latency',
        data: turns.map(t => t.asr_latency_ms || 0),
        borderColor: '#22c55e',
        tension: 0.3,
        fill: false,
        pointBackgroundColor: '#22c55e',
        pointRadius: 2,
        borderDash: [5, 5],
      },
    ],
  } : null

  const timeSeriesOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { color: '#8b90b8', boxWidth: 12 } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#8b90b8' } },
      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8b90b8', callback: v => `${v}ms` } },
    },
  }

  return (
    <main className="dashboard-page">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Latency Analytics</h1>
        <p className="dashboard-sub">
          Real-time breakdown of ASR · LLM · TTS latency per interview turn
        </p>
      </div>

      {error && (
        <div className="dashboard-error">
          <span className="badge badge--red">{error}</span>
        </div>
      )}

      {/* Aggregate Stats */}
      <div className="dashboard-grid">
        <div className="card stat-card">
          <span className="stat-label">Total Turns</span>
          <span className="stat-value">{summary?.total_turns ?? '0'}</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Avg E2E Latency</span>
          <span className="stat-value">{summary?.avg_total ? `${summary.avg_total.toFixed(0)}ms` : '—'}</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Avg ASR Latency</span>
          <span className="stat-value">{summary?.avg_asr ? `${summary.avg_asr.toFixed(0)}ms` : '—'}</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Avg LLM TTFT</span>
          <span className="stat-value">{summary?.avg_llm ? `${summary.avg_llm.toFixed(0)}ms` : '—'}</span>
        </div>
      </div>

      {/* Charts */}
      <div className="dashboard-charts">
        {/* Waterfall */}
        <div className="card chart-card">
          <div className="chart-header">
            <h3 className="chart-title">Latency Waterfall</h3>
            {turns.length > 0 && (
              <select
                className="turn-selector"
                value={selectedTurnId}
                onChange={e => setSelectedTurnId(e.target.value)}
              >
                {turns.map((t, idx) => (
                  <option key={t.turn_id} value={t.turn_id}>
                    Turn {idx + 1} ({t.total_ms ? `${t.total_ms.toFixed(0)}ms` : 'N/A'})
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="chart-container">
            {selectedTurn ? (
              <Bar data={waterfallData} options={waterfallOptions} />
            ) : (
              <div className="chart-empty">
                <span>No turn data selected</span>
                <span className="hint">Complete a turn in the voice interview page to see the breakdown</span>
              </div>
            )}
          </div>
        </div>

        {/* Time Series */}
        <div className="card chart-card">
          <div className="chart-header">
            <h3 className="chart-title">E2E Latency Over Time</h3>
          </div>
          <div className="chart-container">
            {turns.length > 0 ? (
              <Line data={timeSeriesData} options={timeSeriesOptions} />
            ) : (
              <div className="chart-empty">
                <span>No history available</span>
                <span className="hint">Data will populate as you conduct turns during this session</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Feedback Section ─────────────────────────────────────────────── */}
      <div className="feedback-section-wrap">
        <div className="feedback-section-header">
          <div>
            <h2 className="feedback-section-title-main">Performance Feedback</h2>
            <p className="feedback-section-sub">
              AI-generated evaluation of your interview using Gemma 4 · persisted per session
            </p>
          </div>
          <button
            id="generate-feedback-btn"
            className="btn btn--primary feedback-generate-btn"
            onClick={handleGenerateFeedback}
            disabled={feedbackLoading || turns.length < 2}
            title={turns.length < 2 ? 'Complete at least 2 turns first' : 'Generate feedback report'}
          >
            {feedbackLoading ? (
              <>
                <span className="dot" />
                Analysing…
              </>
            ) : feedback ? (
              '↺ Regenerate Feedback'
            ) : (
              '✦ Generate Feedback Report'
            )}
          </button>
        </div>

        {feedbackError && (
          <div className="feedback-error">
            <span className="badge badge--red">⚠ {feedbackError}</span>
          </div>
        )}

        {feedbackLoading && <FeedbackSkeleton />}

        {!feedbackLoading && feedback && (
          <FeedbackCard feedback={feedback} generatedAt={feedbackGeneratedAt} />
        )}

        {!feedbackLoading && !feedback && !feedbackError && (
          <div className="feedback-empty">
            <div className="feedback-empty-icon">✦</div>
            <p>Complete your interview session and click <strong>Generate Feedback Report</strong> to get a detailed performance analysis.</p>
          </div>
        )}
      </div>
    </main>
  )
}
