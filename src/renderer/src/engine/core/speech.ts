/**
 * Thin wrapper around the Web Speech API (available inside Electron via the
 * OS voices). Callers must handle the unavailable case — audio tasks fall
 * back to briefly showing the text instead.
 */
export function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function speak(text: string, onEnd: () => void, rate = 1): () => void {
  if (!speechAvailable()) {
    onEnd()
    return () => undefined
  }
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'en-US'
  utterance.rate = rate
  let done = false
  const finish = (): void => {
    if (!done) {
      done = true
      onEnd()
    }
  }
  utterance.onend = finish
  utterance.onerror = finish
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
  return () => {
    done = true
    window.speechSynthesis.cancel()
  }
}
