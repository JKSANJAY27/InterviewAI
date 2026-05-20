import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useMicrophone } from '../hooks/useMicrophone'
import { useAudioPlayer } from '../hooks/useAudioPlayer'

const InterviewContext = createContext(null)

const getOrCreateSessionId = () => {
  let id = localStorage.getItem('interview_session_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('interview_session_id', id)
  }
  return id
}

export function InterviewProvider({ children }) {
  const [sessionId, setSessionId] = useState(getOrCreateSessionId)
  const [sessionState, setSessionState] = useState('idle')
  const [transcript, setTranscript] = useState([])
  const [interimText, setInterimText] = useState('')
  const [streamingText, setStreamingText] = useState('')

  const { connect, disconnect, sendJson, sendBinary, connected, on } = useWebSocket()

  const handleAudioChunk = useCallback((buffer) => {
    sendBinary(buffer)
  }, [sendBinary])

  const { startRecording, stopRecording, isRecording } = useMicrophone(handleAudioChunk)
  const { playBase64Chunk, stopPlaying } = useAudioPlayer()

  useEffect(() => {
    on('status', (msg) => setSessionState(msg.state))

    on('transcript_interim', (msg) => {
      setInterimText(msg.text)
      stopPlaying()
    })

    on('transcript_final', (msg) => {
      setInterimText('')
      setTranscript((prev) => [...prev, { role: 'user', text: msg.text }])
    })

    on('llm_token', (msg) => {
      setStreamingText((prev) => prev + msg.token)
    })

    on('turn_complete', (msg) => {
      setTranscript((prev) => [...prev, { role: 'assistant', text: msg.full_response }])
      setStreamingText('')
      setSessionState('idle')
    })

    on('audio_response', (msg) => {
      playBase64Chunk(msg.data)
    })
  }, [on, stopPlaying, playBase64Chunk])

  useEffect(() => {
    if (connected && !isRecording) {
      startRecording()
    } else if (!connected && isRecording) {
      stopRecording()
    }
  }, [connected, isRecording, startRecording, stopRecording])

  const handleConnect = useCallback(() => {
    connect(sessionId)
    setSessionState('idle')
  }, [connect, sessionId])

  const handleDisconnect = useCallback(() => {
    stopRecording()
    stopPlaying()
    disconnect()

    // Generate a brand new Session ID for a clean slate
    const newSessionId = crypto.randomUUID()
    localStorage.setItem('interview_session_id', newSessionId)
    setSessionId(newSessionId)

    // Clear session state
    setTranscript([])
    setInterimText('')
    setStreamingText('')
    setSessionState('idle')
  }, [stopRecording, stopPlaying, disconnect])

  return (
    <InterviewContext.Provider
      value={{
        sessionId,
        sessionState,
        transcript,
        interimText,
        streamingText,
        connected,
        handleConnect,
        handleDisconnect,
      }}
    >
      {children}
    </InterviewContext.Provider>
  )
}

export function useInterview() {
  const context = useContext(InterviewContext)
  if (!context) {
    throw new Error('useInterview must be used within an InterviewProvider')
  }
  return context
}
