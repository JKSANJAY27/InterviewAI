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
  const [interviewType, setInterviewType] = useState('general')
  const [customInstructions, setCustomInstructions] = useState('')

  const { connect, disconnect, sendJson, sendBinary, connected, on } = useWebSocket()

  const handleAudioChunk = useCallback((buffer) => {
    sendBinary(buffer)
  }, [sendBinary])

  const { startRecording, stopRecording, isRecording } = useMicrophone(handleAudioChunk)
  const { playBase64Chunk, stopPlaying } = useAudioPlayer()

  useEffect(() => {
    on('status', (msg) => {
      console.log('[InterviewContext] status event:', msg)
      setSessionState(msg.state)
    })

    on('transcript_interim', (msg) => {
      console.log('[InterviewContext] transcript_interim event:', msg)
      setInterimText(msg.text)
      stopPlaying()
    })

    on('transcript_final', (msg) => {
      console.log('[InterviewContext] transcript_final event:', msg)
      const cleanedText = (msg.text || '').trim()
      if (!cleanedText) return

      setInterimText('')
      setTranscript((prev) => {
        console.log('[InterviewContext] prev transcript state before final:', prev)

        // Smart-merge: find the last user bubble in the entire transcript.
        // We merge into it as long as there is NO real (non-interrupted) assistant
        // response after it. This keeps speech together even if [Interrupted]
        // placeholder bubbles were interspersed.
        let lastUserIdx = -1
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].role === 'user') {
            lastUserIdx = i
            break
          }
        }

        if (lastUserIdx !== -1) {
          const messagesAfterUser = prev.slice(lastUserIdx + 1)
          const hasRealAssistantResponse = messagesAfterUser.some(
            (m) => m.role === 'assistant' && m.text !== '[Interrupted]'
          )

          if (!hasRealAssistantResponse) {
            const updatedBubble = {
              ...prev[lastUserIdx],
              text: (prev[lastUserIdx].text + ' ' + cleanedText).trim(),
            }
            const nextTranscript = [
              ...prev.slice(0, lastUserIdx),
              updatedBubble,
              // Keep any [Interrupted] stubs that were after the user bubble
              ...prev.slice(lastUserIdx + 1),
            ]
            console.log('[InterviewContext] appended to existing user bubble:', nextTranscript)
            return nextTranscript
          }
        }

        const nextTranscript = [...prev, { role: 'user', text: cleanedText }]
        console.log('[InterviewContext] created new user transcript bubble:', nextTranscript)
        return nextTranscript
      })
    })

    on('llm_token', (msg) => {
      setStreamingText((prev) => prev + msg.token)
    })

    on('turn_complete', (msg) => {
      console.log('[InterviewContext] turn_complete event:', msg)
      setTranscript((prev) => {
        // Suppress bare [Interrupted] messages — they are noise from premature
        // cancellations and should not pollute the chat transcript.
        if (!msg.full_response || msg.full_response === '[Interrupted]') {
          console.log('[InterviewContext] suppressing [Interrupted] turn_complete from transcript')
          return prev
        }
        const nextTranscript = [...prev, { role: 'assistant', text: msg.full_response }]
        console.log('[InterviewContext] transcript state after turn complete:', nextTranscript)
        return nextTranscript
      })
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

  useEffect(() => {
    if (connected) {
      sendJson({
        type: 'session_config',
        interview_type: interviewType,
        custom_instructions: customInstructions,
      })
    }
  }, [connected, sendJson, interviewType, customInstructions])

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
        interviewType,
        setInterviewType,
        customInstructions,
        setCustomInstructions,
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
