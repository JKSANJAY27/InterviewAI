import { useState, useRef, useCallback } from 'react'

export function useMicrophone(onAudioChunk) {
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorder = useRef(null)
  const streamRef = useRef(null)

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      streamRef.current = stream

      const options = { mimeType: 'audio/webm' }
      const recorder = new MediaRecorder(stream, options)

      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0 && onAudioChunk) {
          const buffer = await e.data.arrayBuffer()
          onAudioChunk(buffer)
        }
      }

      // Slice audio into 250ms chunks
      recorder.start(250)
      mediaRecorder.current = recorder
      setIsRecording(true)
    } catch (err) {
      console.error('Microphone access denied or failed:', err)
      setIsRecording(false)
    }
  }, [onAudioChunk])

  const stopRecording = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
    }
    setIsRecording(false)
  }, [])

  return { startRecording, stopRecording, isRecording }
}
