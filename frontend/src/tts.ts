// TTS via window.speechSynthesis, lang en-US. Label everywhere:
// "Âm thanh đọc bằng giọng máy (TTS)"
export function speak(text: string, rate = 1, onEnd?: () => void) {
  if (!('speechSynthesis' in window)) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = rate;
  if (onEnd) u.onend = onEnd;
  window.speechSynthesis.speak(u);
  return true;
}
export function stopSpeak() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
export function pauseSpeak() {
  if ('speechSynthesis' in window) window.speechSynthesis.pause();
}
export function resumeSpeak() {
  if ('speechSynthesis' in window) window.speechSynthesis.resume();
}
export function ttsSupported(): boolean {
  return 'speechSynthesis' in window;
}
/** Text to read for a question: passage script for Part 3/4, script for Part 1/2, else content. */
export function ttsTextFor(q: { part: number; script?: string; passageText?: string; content: string }): string {
  if (q.part === 3 || q.part === 4) return q.passageText || q.script || q.content;
  return q.script || q.content;
}
