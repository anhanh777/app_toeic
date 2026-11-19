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
/** Text để đọc TTS cho 1 câu: CHỈ transcript thật (script).
 * - KHÔNG đọc câu hỏi (content): TTS đọc "What is the woman...?" thì
 *   vừa lộ câu hỏi vừa không phải nội dung bài nghe.
 * - KHÔNG đọc passageText: ở TOEIC Part 3/4 đó là bảng/hình minh họa kèm
 *   theo (danh sách người nói, lịch trình...), không phải lời thoại;
 *   ở IELTS passageText chỉ có ở Reading.
 * Trả '' khi không có transcript thật — nơi gọi sẽ hiện trạng thái thiếu
 * audio thay vì đọc câu hỏi. */
export function ttsTextFor(q: { part: number; script?: string; passageText?: string; content: string }): string {
  return (q.script || '').trim();
}
