import { useEffect, useState, useRef } from 'react'
import { Bar, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import './DashboardPage.css'

// Register ChartJS modules
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
)

export default function DashboardPage() {
  const [summary, setSummary] = useState(null)
  const [turns, setTurns] = useState([])
  const [selectedTurnId, setSelectedTurnId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  const pollInterval = useRef(null)
  const sessionId = localStorage.getItem('interview_session_id')

  const fetchData = async () => {
    try {
      // 1. Fetch Summary
      const summaryRes = await fetch('http://localhost:8000/api/metrics/summary')
      if (summaryRes.ok) {
        const summaryData = await summaryRes.json()
        setSummary(summaryData.summary)
      }

      // 2. Fetch Session Turns if session ID exists
      if (sessionId) {
        const turnsRes = await fetch(`http://localhost:8000/api/metrics/sessions/${sessionId}/turns`)
        if (turnsRes.ok) {
          const turnsData = await turnsRes.json()
          const fetchedTurns = turnsData.turns || []
          setTurns(fetchedTurns)
          
          // Select the latest turn by default if not set or if new turns arrived
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
  }

  useEffect(() => {
    fetchData()
    // Poll metrics every 3 seconds for a live-updating dashboard feeling
    pollInterval.current = setInterval(fetchData, 3000)

    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current)
    }
  }, [sessionId])

  const selectedTurn = turns.find(t => t.turn_id === selectedTurnId)

  // ── 1. Waterfall Chart Data ───────────────────────────────────────
  const waterfallData = selectedTurn ? {
    labels: ['ASR', 'LLM Queue', 'LLM TTFT', 'LLM Sentence', 'TTS', 'Total E2E'],
    datasets: [
      {
        label: 'Latency (ms)',
        data: [
          selectedTurn.asr_latency_ms || 0,
          selectedTurn.llm_queue_ms || 0,
          selectedTurn.llm_ttft_ms || 0,
          selectedTurn.llm_first_sentence_ms || 0,
          selectedTurn.tts_latency_ms || 0,
          selectedTurn.total_ms || 0,
        ],
        backgroundColor: [
          '#22c55e', // green
          '#6366f1', // indigo
          '#818cf8', // light indigo
          '#c084fc', // purple
          '#f59e0b', // amber
          '#ec4899', // pink (total)
        ],
        borderRadius: 8,
        barPercentage: 0.6,
      }
    ]
  } : null

  const waterfallOptions = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.raw.toFixed(1)} ms`
        }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#8b90b8', callback: (val) => `${val}ms` }
      },
      y: {
        grid: { display: false },
        ticks: { color: '#f0f2ff', font: { weight: '600' } }
      }
    }
  }

  // ── 2. Time Series Chart Data ──────────────────────────────────────
  const timeSeriesData = turns.length > 0 ? {
    labels: turns.map((_, idx) => `Turn ${idx + 1}`),
    datasets: [
      {
        label: 'Total E2E Latency',
        data: turns.map(t => t.total_ms || 0),
        borderColor: '#818cf8',
        backgroundColor: 'rgba(129, 140, 248, 0.1)',
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
      }
    ]
  } : null

  const timeSeriesOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { color: '#8b90b8', boxWidth: 12 }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#8b90b8' }
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#8b90b8', callback: (val) => `${val}ms` }
      }
    }
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
          <span className="stat-value">
            {summary?.avg_total ? `${summary.avg_total.toFixed(0)}ms` : '—'}
          </span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Avg ASR Latency</span>
          <span className="stat-value">
            {summary?.avg_asr ? `${summary.avg_asr.toFixed(0)}ms` : '—'}
          </span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Avg LLM TTFT</span>
          <span className="stat-value">
            {summary?.avg_llm ? `${summary.avg_llm.toFixed(0)}ms` : '—'}
          </span>
        </div>
      </div>

      {/* Charts section */}
      <div className="dashboard-charts">
        {/* Waterfall */}
        <div className="card chart-card">
          <div className="chart-header">
            <h3 className="chart-title">Latency Waterfall</h3>
            {turns.length > 0 && (
              <select
                className="turn-selector"
                value={selectedTurnId}
                onChange={(e) => setSelectedTurnId(e.target.value)}
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
    </main>
  )
}
