import { useRef, useCallback, useEffect } from 'react'

export function useAudioPlayer() {
  const audioContext = useRef(null)
  const nextPlayTime = useRef(0)
  const isPlaying = useRef(false)
  const playbackQueue = useRef([])

  useEffect(() => {
    // Initialize AudioContext on first user interaction or mount
    audioContext.current = new (window.AudioContext || window.webkitAudioContext)()
    return () => {
      if (audioContext.current?.state !== 'closed') {
        audioContext.current?.close()
      }
    }
  }, [])

  const playBase64Chunk = useCallback(async (base64String) => {
    if (!audioContext.current) return

    try {
      if (audioContext.current.state === 'suspended') {
        await audioContext.current.resume()
      }
      
      // Convert base64 to binary ArrayBuffer
      const binaryString = atob(base64String)
      const len = binaryString.length
      const bytes = new Uint8Array(len)
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      
      // Decode audio data
      const audioBuffer = await audioContext.current.decodeAudioData(bytes.buffer)
      playbackQueue.current.push(audioBuffer)
      
      _scheduleNext()
    } catch (e) {
      console.error('[AudioPlayer] Error decoding audio chunk:', e)
    }
  }, [])

  const _scheduleNext = useCallback(() => {
    if (!audioContext.current || playbackQueue.current.length === 0) return

    const currentTime = audioContext.current.currentTime

    // If nextPlayTime is in the past, reset to current time + slight buffer
    if (nextPlayTime.current < currentTime) {
      nextPlayTime.current = currentTime + 0.05 
    }

    const audioBuffer = playbackQueue.current.shift()
    const source = audioContext.current.createBufferSource()
    source.buffer = audioBuffer
    source.connect(audioContext.current.destination)
    
    source.start(nextPlayTime.current)
    nextPlayTime.current += audioBuffer.duration
    isPlaying.current = true

  }, [])

  const stopPlaying = useCallback(() => {
    playbackQueue.current = []
    nextPlayTime.current = 0
    isPlaying.current = false
    
    // Quickest way to stop current playback is to suspend and recreate or clear nextPlayTime,
    // but fully stopping in Web Audio requires keeping track of source nodes. 
    // To simplify: we close context and create a new one to aggressively interrupt.
    if (audioContext.current) {
      audioContext.current.close()
      audioContext.current = new (window.AudioContext || window.webkitAudioContext)()
    }
  }, [])

  return { playBase64Chunk, stopPlaying, isPlaying }
}
