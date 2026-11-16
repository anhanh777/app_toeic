// Dùng chung cho IELTS Giai đoạn 1 (v3): mã lỗi = quái, hook đếm ngược,
// picker chọn nguyên nhân gốc. Chỉ dùng khi exam==='ielts' — TOEIC
// không chạm tới file này.
import { useEffect, useRef, useState } from 'react';
import { api, type ErrorCode } from './api';
import { ErrorBox } from './components';

export interface ErrorCodeInfo { code: string; skill: 'listening' | 'reading' | 'writing' | 'speaking'; name: string; }

export const ERROR_CODES: ErrorCodeInfo[] = [
  { code: 'L1', skill: 'listening', name: 'Không nhận ra từ' },
  { code: 'L2', skill: 'listening', name: 'Hiểu nhưng không kịp ghi' },
  { code: 'L3', skill: 'listening', name: 'Mất tập trung/lạc câu' },
  { code: 'L4', skill: 'listening', name: 'Dính bẫy đổi ý / phủ định' },
  { code: 'L5', skill: 'listening', name: 'Sai chính tả / số ít-số nhiều / viết hoa' },
  { code: 'L6', skill: 'listening', name: 'Không hiểu paraphrase' },
  { code: 'L7', skill: 'listening', name: 'Không quen giọng' },
  { code: 'L8', skill: 'listening', name: 'Sai giới hạn số từ / sai dạng từ' },
  { code: 'L9', skill: 'listening', name: 'Sai khi chép sang phiếu' },
  { code: 'R1', skill: 'reading', name: 'Không biết từ' },
  { code: 'R2', skill: 'reading', name: 'Hiểu sai paraphrase' },
  { code: 'R3', skill: 'reading', name: 'Nhầm False và Not Given' },
  { code: 'R4', skill: 'reading', name: 'Bị từ khóa đánh lừa' },
  { code: 'R5', skill: 'reading', name: 'Hết giờ' },
  { code: 'R6', skill: 'reading', name: 'Sai ý chính' },
  { code: 'R7', skill: 'reading', name: 'Đọc ẩu/đọc sót yêu cầu' },
  { code: 'R8', skill: 'reading', name: 'Đoán mò' },
  { code: 'W1', skill: 'writing', name: 'Lạc đề / thiếu phần' },
  { code: 'W2', skill: 'writing', name: 'Ý mỏng, không phát triển' },
  { code: 'W3', skill: 'writing', name: 'Task 1 thiếu overview' },
  { code: 'W4', skill: 'writing', name: 'Liên kết sai / lạm dụng linking words' },
  { code: 'W5', skill: 'writing', name: 'Từ vựng lặp, sai sắc thái' },
  { code: 'W6', skill: 'writing', name: 'Cấu trúc câu đơn điệu' },
  { code: 'W7', skill: 'writing', name: 'Lỗi ngữ pháp lặp' },
  { code: 'W8', skill: 'writing', name: 'Thiếu số từ hoặc hết giờ' },
  { code: 'S1', skill: 'speaking', name: 'Ngập ngừng dài, lặp từ đệm' },
  { code: 'S2', skill: 'speaking', name: 'Trả lời quá ngắn' },
  { code: 'S3', skill: 'speaking', name: 'Part 2 hết ý trước 1:30' },
  { code: 'S4', skill: 'speaking', name: 'Từ vựng nghèo, lặp' },
  { code: 'S5', skill: 'speaking', name: 'Lỗi ngữ pháp lặp' },
  { code: 'S6', skill: 'speaking', name: 'Sai âm cuối, âm th, s/z' },
  { code: 'S7', skill: 'speaking', name: 'Ngữ điệu phẳng, trọng âm sai' },
  { code: 'S8', skill: 'speaking', name: 'Hiểu sai câu hỏi' },
];

export const SKILL_LABEL: Record<string, string> = {
  listening: 'Listening', reading: 'Reading', writing: 'Writing', speaking: 'Speaking',
};
export const SKILL_EMOJI: Record<string, string> = {
  listening: '🎧', reading: '📖', writing: '✍️', speaking: '🎤',
};
export function errorCodeName(code: string): string {
  const c = ERROR_CODES.find(e => e.code === code);
  return c ? `${c.code} — ${c.name}` : code;
}
export function codesForSkill(skill: string): ErrorCodeInfo[] {
  return ERROR_CODES.filter(e => e.skill === skill);
}
/** Skill của 1 câu theo Part: part 1–4 → Listening, 5–7 → Reading. */
export function skillOfPart(part: number): 'listening' | 'reading' {
  return part <= 4 ? 'listening' : 'reading';
}

/** Đếm ngược (giây) — dùng chung cho Writing/Speaking/skim. Hết giờ thì
 * gọi onDone 1 lần (nếu có). Trả về số giây còn lại + hàm reset. */
export function useCountdown(totalSec: number, running: boolean, onDone?: () => void) {
  const [left, setLeft] = useState(totalSec);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => { setLeft(totalSec); doneRef.current = false; }, [totalSec]);
  useEffect(() => {
    if (!running || left <= 0) return;
    const t = setInterval(() => setLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [running, left]);
  useEffect(() => {
    if (left === 0 && !doneRef.current) { doneRef.current = true; onDoneRef.current?.(); }
  }, [left]);
  return { left, reset: () => { setLeft(totalSec); doneRef.current = false; } };
}

export function fmtClock(sec: number): string {
  const s = Math.max(0, sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Picker chọn nguyên nhân gốc cho 1 câu sai (IELTS-only).
 * Props: skill ('listening'|'reading'), questionId/attemptId để POST
 * /api/ielts/error-log. Sau khi ghi thành công gọi onLogged(code).
 * Nếu backend chưa có endpoint (lỗi), vẫn gọi onLogged để không chặn
 * người học xem giải thích — lỗi được hiển thị qua ErrorBox.
 */
export function RootCausePicker({ skill, questionId, attemptId, questionType, guessed, timeSpentSec, onLogged, compact }: {
  skill: string; questionId?: string; attemptId?: number; questionType?: string;
  guessed?: boolean; timeSpentSec?: number; onLogged: (code: string) => void; compact?: boolean;
}) {
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [serverCodes, setServerCodes] = useState<ErrorCode[] | null>(null);
  useEffect(() => {
    api.errorCodes().then(setServerCodes).catch(() => undefined);
  }, []);
  const list = serverCodes?.length
    ? serverCodes.filter(c => !skill || c.skill === skill).map(c => ({ code: c.code, skill: c.skill as ErrorCodeInfo['skill'], name: c.name }))
    : (skill ? codesForSkill(skill) : ERROR_CODES.filter(e => e.skill === 'listening' || e.skill === 'reading'));
  const save = async () => {
    if (!code) return;
    setSaving(true); setError(null);
    try {
      await api.logError({ questionId, attemptId, skill, questionType, errorCode: code, guessed, timeSpentSec });
      onLogged(code);
    } catch (e) {
      // Backend chưa sẵn sàng thì vẫn mở giải thích, không chặn người học.
      setError(e);
      onLogged(code);
    } finally { setSaving(false); }
  };
  return (
    <div className="panel" style={{ marginTop: '.6rem' }}>
      <p style={{ margin: '.1rem 0 .5rem' }}>
        <strong>🔍 Vì sao mình sai câu này?</strong>
        {guessed ? ' (bạn đã đánh dấu đoán mò 🤔)' : ''} Chọn 1 nguyên nhân để ghi vào sổ lỗi — giải thích sẽ hiện sau khi bạn chọn.
      </p>
      <ErrorBox error={error} />
      <div className="btn-row" style={{ flexWrap: 'wrap' }}>
        {list.map(c => (
          <button key={c.code} type="button" className={`btn btn-sm${code === c.code ? ' gold' : ' secondary'}`} onClick={() => setCode(c.code)}>
            {c.code} · {c.name}
          </button>
        ))}
      </div>
      <div className="btn-row" style={{ marginTop: '.6rem' }}>
        <button type="button" className="btn btn-sm" disabled={!code || saving} onClick={() => void save()}>
          {saving ? 'Đang ghi…' : 'Ghi nguyên nhân & xem giải thích'}
        </button>
      </div>
      {compact ? null : (
        <p className="muted" style={{ margin: '.4rem 0 0' }}>Ghi đúng nguyên nhân giúp app nhắc ôn đúng lỗi — quái tương ứng sẽ mất máu.</p>
      )}
    </div>
  );
}
