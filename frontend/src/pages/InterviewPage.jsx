import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useInterview } from '../context/InterviewContext'
import './InterviewPage.css'

const STATE_LABELS = {
  idle:         'Ready',
  listening:    'Listening…',
  transcribing: 'Processing…',
  thinking:     'Thinking…',
  speaking:     'Answering…',
}

const STATE_COLORS = {
  idle:         '#4b5178',
  listening:    '#22c55e',
  transcribing: '#f59e0b',
  thinking:     '#6366f1',
  speaking:     '#818cf8',
}

function VoiceOrb({ state }) {
  const color = STATE_COLORS[state] || STATE_COLORS.idle
  const active = state !== 'idle'

  return (
    <div className="orb-wrap">
      <motion.div
        className="orb"
        animate={{
          scale: active ? [1, 1.08, 1] : 1,
          boxShadow: active
            ? [`0 0 32px ${color}55`, `0 0 64px ${color}88`, `0 0 32px ${color}55`]
            : `0 0 20px ${color}33`,
        }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        style={{ background: `radial-gradient(circle at 40% 35%, ${color}cc, ${color}44)` }}
      />
      <span className="orb-label" style={{ color }}>
        {STATE_LABELS[state] || 'Ready'}
      </span>
    </div>
  )
}

function TranscriptBubble({ role, text }) {
  return (
    <motion.div
      className={`bubble bubble--${role}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <span className="bubble__role">{role === 'user' ? 'You' : 'Interviewer'}</span>
      <p className="bubble__text">{text}</p>
    </motion.div>
  )
}

const INTERVIEW_TYPES = [
  {
    id: 'general',
    name: 'General Technical',
    desc: 'Core computer science concepts, basic data structures, and multi-disciplinary software engineering.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
    )
  },
  {
    id: 'system_design',
    name: 'System Design',
    desc: 'Large-scale distributed systems, microservices, databases, load balancing, and performance tradeoffs.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    )
  },
  {
    id: 'coding',
    name: 'Coding / Algorithmic',
    desc: 'Data structures, algorithms, runtime & space complexity analysis, and strict adherence to clean code.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    )
  },
  {
    id: 'frontend',
    name: 'Frontend Architecture',
    desc: 'SPAs, framework specifics (React/Vite), performance tuning, browser mechanics, state, and responsive styling.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a10 10 0 0 0-10 10c0 5.523 4.477 10 10 10a9.98 9.98 0 0 0 8-4h-4a2 2 0 1 1 0-4h4.41a9.988 9.988 0 0 0-.41-2h-3a2 2 0 1 1 0-4h3.41A9.97 9.97 0 0 0 12 2z"/>
      </svg>
    )
  },
  {
    id: 'behavioral',
    name: 'Behavioral & Culture',
    desc: 'Conflict resolution, leadership situations, execution, project delivery, collaboration, and growth path.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    )
  }
]

const VOICES = [
  {
    id: 'pNInz6obpgDQGcFmaJgB',
    name: 'Adam',
    gender: 'male',
    desc: 'Deep, structured, and authoritative. Best for mock technical leads and system architectural deep dives.'
  },
  {
    id: '21m00Tcm4TlvDq8ikWAM',
    name: 'Rachel',
    gender: 'female',
    desc: 'Calm, highly professional, and encouraging. Excellent for multi-disciplinary software engineering rounds.'
  },
  {
    id: '29vD33N1CtxCmqQRPOHJ',
    name: 'Drew',
    gender: 'male',
    desc: 'Casual, conversational, and energetic. Standard mock behavioral round persona.'
  },
  {
    id: '2EiwWnXF2V4j26dxz2i5',
    name: 'Clyde',
    gender: 'male',
    desc: 'Smooth, highly articulate, and technical. Ideal for structured algorithm and coding evaluation.'
  },
  {
    id: 'piTKgcLEGmPEe24245c5',
    name: 'Nicole',
    gender: 'female',
    desc: 'Crisp, fast-paced, and sharp. Perfect for rapid-fire Q&A and technical accuracy assessments.'
  }
]

export default function InterviewPage() {
  const {
    sessionState,
    transcript,
    interimText,
    streamingText,
    connected,
    interviewType,
    setInterviewType,
    customInstructions,
    setCustomInstructions,
    voiceId,
    setVoiceId,
    handleConnect,
    handleDisconnect,
  } = useInterview()

  const transcriptRef = useRef(null)

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [transcript, streamingText, interimText])

  return (
    <main className="interview-page">
      {/* Left — Orb + controls */}
      <aside className="interview-sidebar">
        <div className="interview-header">
          <h1 className="interview-title">Technical Interview</h1>
          <p className="interview-subtitle">
            Powered by AI · Real-time voice
          </p>
        </div>

        <VoiceOrb state={sessionState} />

        <div className="interview-controls">
          {!connected ? (
            <button className="btn btn--primary" onClick={handleConnect}>
              Start Interview
            </button>
          ) : (
            <button className="btn btn--ghost" onClick={handleDisconnect}>
              End Session
            </button>
          )}
        </div>

        <div className="session-info">
          <span className={`badge ${connected ? 'badge--green' : 'badge--red'}`}>
            <span className="dot" />
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </aside>

      {/* Right — Transcript / Settings panel */}
      <section className="interview-transcript" ref={transcriptRef}>
        <AnimatePresence initial={false} mode="wait">
          {transcript.length === 0 && !connected ? (
            <motion.div
              key="setup-state"
              className="setup-container"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <div className="setup-card">
                <div className="setup-header">
                  <h2 className="setup-title">Personalize Your Interview</h2>
                  <p className="setup-subtitle">
                    Select a focus category and supply directives to customize the interviewer's style.
                  </p>
                </div>

                <div className="setup-section">
                  <label className="section-label">1. Focus Category</label>
                  <div className="type-grid">
                    {INTERVIEW_TYPES.map((t) => (
                      <div
                        key={t.id}
                        className={`type-card ${interviewType === t.id ? 'active' : ''}`}
                        onClick={() => setInterviewType(t.id)}
                      >
                        <div className="type-icon-wrapper">
                          {t.icon}
                        </div>
                        <div className="type-info">
                          <span className="type-name">{t.name}</span>
                          <span className="type-desc">{t.desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="setup-section">
                  <label className="section-label">2. Interviewer Voice Profile</label>
                  <div className="voice-grid">
                    {VOICES.map((v) => (
                      <div
                        key={v.id}
                        className={`voice-card ${voiceId === v.id ? 'active' : ''}`}
                        onClick={() => setVoiceId(v.id)}
                      >
                        <div className="voice-avatar">
                          <span>{v.gender === 'female' ? '👩' : '👨'}</span>
                        </div>
                        <div className="voice-info">
                          <span className="voice-name">{v.name}</span>
                          <span className="voice-desc">{v.desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="setup-section">
                  <label className="section-label">3. Custom Focus & Directives (Optional)</label>
                  <textarea
                    className="custom-textarea"
                    placeholder="e.g., 'Act as a principal engineer at Netflix. Challenge my choices on data modeling and caching.' or 'Evaluate my frontend skills specifically around hydration and layout shifts.'"
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value.slice(0, 500))}
                  />
                  <div className="char-count">
                    {customInstructions.length}/500 characters
                  </div>
                </div>

                <button className="btn btn--primary setup-start-btn" onClick={handleConnect}>
                  Start Tailored Session
                </button>
              </div>
            </motion.div>
          ) : (
            <div className="transcript-list">
              {transcript.map((entry, i) => (
                <TranscriptBubble key={`entry-${i}`} role={entry.role} text={entry.text} />
              ))}

              {/* Streaming LLM response */}
              {streamingText && (
                <TranscriptBubble key="streaming-state" role="assistant" text={streamingText + '▌'} />
              )}

              {/* Interim ASR */}
              {interimText && (
                <motion.div
                  key="interim-state"
                  className="bubble bubble--interim"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <span className="bubble__role">You (listening…)</span>
                  <p className="bubble__text">{interimText}</p>
                </motion.div>
              )}
            </div>
          )}
        </AnimatePresence>
      </section>
    </main>
  )
}
