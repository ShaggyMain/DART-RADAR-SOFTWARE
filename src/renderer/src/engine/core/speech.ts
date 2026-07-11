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
      clearTimeout(watchdog)
      onEnd()
    }
  }
  utterance.onend = finish
  utterance.onerror = finish
  // Some platforms have speechSynthesis but no working voices and never
  // fire end/error — a generous watchdog keeps audio tasks from hanging.
  const watchdog = setTimeout(finish, 5000 + (text.length * 100) / rate)
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
  return () => {
    done = true
    clearTimeout(watchdog)
    window.speechSynthesis.cancel()
  }
}
