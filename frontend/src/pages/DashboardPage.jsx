import './DashboardPage.css'

export default function DashboardPage() {
  return (
    <main className="dashboard-page">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Latency Analytics</h1>
        <p className="dashboard-sub">
          Real-time breakdown of ASR · LLM · TTS latency per interview turn
        </p>
      </div>

      <div className="dashboard-grid">
        <div className="card stat-card">
          <span className="stat-label">Total Turns</span>
          <span className="stat-value">—</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Avg E2E Latency</span>
          <span className="stat-value">—</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Avg ASR Latency</span>
          <span className="stat-value">—</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Avg LLM TTFT</span>
          <span className="stat-value">—</span>
        </div>
      </div>

      <div className="dashboard-charts">
        <div className="card chart-placeholder">
          <span className="chart-placeholder__label">
            Latency Waterfall — per turn breakdown
          </span>
          <span className="chart-placeholder__hint">
            Complete an interview session to see data
          </span>
        </div>
        <div className="card chart-placeholder">
          <span className="chart-placeholder__label">
            E2E Latency Over Time
          </span>
          <span className="chart-placeholder__hint">
            Complete an interview session to see data
          </span>
        </div>
      </div>
    </main>
  )
}
