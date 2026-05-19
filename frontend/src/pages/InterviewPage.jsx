import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useWebSocket } from '../hooks/useWebSocket'
import { useMicrophone } from '../hooks/useMicrophone'
import { useAudioPlayer } from '../hooks/useAudioPlayer'
import './InterviewPage.css'

const SESSION_ID = crypto.randomUUID()

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

export default function InterviewPage() {
  const { connect, disconnect, sendJson, sendBinary, connected, on } = useWebSocket()
  
  const handleAudioChunk = useCallback((buffer) => {
    sendBinary(buffer)
  }, [sendBinary])

  const { startRecording, stopRecording, isRecording } = useMicrophone(handleAudioChunk)
  const { playBase64Chunk, stopPlaying } = useAudioPlayer()

  const [sessionState, setSessionState] = useState('idle')
  const [transcript, setTranscript] = useState([])
  const [interimText, setInterimText]  = useState('')
  const [streamingText, setStreamingText] = useState('')
  const transcriptRef = useRef(null)

  useEffect(() => {
    on('status', (msg) => setSessionState(msg.state))

    on('transcript_interim', (msg) => {
      setInterimText(msg.text)
      // Interrupt playback if user starts speaking
      stopPlaying()
    })

    on('transcript_final', (msg) => {
      setInterimText('')
      setTranscript(prev => [...prev, { role: 'user', text: msg.text }])
    })

    on('llm_token', (msg) => {
      setStreamingText(prev => prev + msg.token)
    })

    on('turn_complete', (msg) => {
      setTranscript(prev => [...prev, { role: 'assistant', text: msg.full_response }])
      setStreamingText('')
      setSessionState('idle')
    })

    on('audio_response', (msg) => {
      playBase64Chunk(msg.data)
    })
  }, [on, stopPlaying, playBase64Chunk])

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [transcript, streamingText, interimText])

  useEffect(() => {
    if (connected && !isRecording) {
      startRecording()
    } else if (!connected && isRecording) {
      stopRecording()
    }
  }, [connected, isRecording, startRecording, stopRecording])

  const handleConnect = () => {
    connect(SESSION_ID)
    setSessionState('idle')
  }

  const handleDisconnect = () => {
    stopRecording()
    stopPlaying()
    disconnect()
  }

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

      {/* Right — Transcript */}
      <section className="interview-transcript" ref={transcriptRef}>
        <AnimatePresence initial={false}>
          {transcript.length === 0 && !connected && (
            <motion.div
              key="empty-state"
              className="transcript-empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <p>Press <strong>Start Interview</strong> to begin.</p>
              <p>Your interviewer will introduce themselves and ask the first question.</p>
            </motion.div>
          )}

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
        </AnimatePresence>
      </section>
    </main>
  )
}
