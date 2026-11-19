// Công cụ luyện tập kiểu YouPass (IELTS-only, chỉ ở phòng Luyện tập):
// Highlight (phím H) + Ghi chú (phím N).
//
// - Highlight dùng CSS Custom Highlight API (không sửa DOM, không động
//   vào WordText): bôi đen 1 đoạn chữ rồi bấm H (hoặc nút Highlight) để
//   tô vàng đoạn đó. Chỉ lưu trong phiên luyện (rời trang là mất).
//   Trình duyệt chưa hỗ trợ (Firefox cũ) thì nút báo không hỗ trợ.
// - Ghi chú gắn theo từng câu hỏi, lưu localStorage (không cần backend)
//   nên vẫn còn khi mở lại đề khác. Panel liệt kê ghi chú của buổi hiện
//   tại, bấm để nhảy tới câu đó.
import { useEffect, useState } from 'react';

const HL_NAME = 'ielts-hl';
let hl: Highlight | null = null;

export function highlightSupported(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight === 'function';
}

/** Tô vàng vùng chữ đang bôi đen (chỉ khi vùng chọn nằm trong container
 * của tờ đề). Trả về true nếu tô được. */
export function highlightSelection(container: HTMLElement | null): boolean {
  if (!highlightSupported()) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  if (container && !container.contains(range.commonAncestorContainer)) return false;
  if (!hl) {
    hl = new Highlight();
    (CSS.highlights as HighlightRegistry).set(HL_NAME, hl);
  }
  hl.add(range.cloneRange());
  sel.removeAllRanges();
  return true;
}

export function clearHighlights(): void {
  if (hl) hl.clear();
}

/** Số đoạn chữ đang được tô vàng trong phiên (để ẩn nút "Xóa highlight"
 * khi chưa có đoạn nào). */
export function getHighlightCount(): number {
  return hl ? hl.size : 0;
}

/* ---- Ghi chú theo câu hỏi (localStorage) ---- */

const NOTES_KEY = 'ielts-question-notes-v1';
type NotesMap = Record<string, string>;

function loadNotes(): NotesMap {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as NotesMap) : {};
  } catch {
    return {};
  }
}

export function useIeltsNotes() {
  const [notesById, setNotesById] = useState<NotesMap>(loadNotes);
  useEffect(() => {
    try { localStorage.setItem(NOTES_KEY, JSON.stringify(notesById)); } catch { /* đầy bộ nhớ: bỏ qua */ }
  }, [notesById]);
  const setNote = (questionId: string, text: string) => {
    setNotesById(m => {
      const next = { ...m };
      if (text.trim()) next[questionId] = text;
      else delete next[questionId];
      return next;
    });
  };
  return { notesById, setNote };
}

/* ---- Thanh công cụ (trên tờ đề) ---- */

export function IeltsToolsBar({ onHighlight, onNotes, onClearHighlights, hlSupported, notesCount, hlCount }: {
  onHighlight: () => void;
  onNotes: () => void;
  onClearHighlights: () => void;
  hlSupported: boolean;
  notesCount: number;
  /** Số đoạn đang tô vàng — nút "Xóa highlight" chỉ hiện khi > 0. */
  hlCount: number;
}) {
  return (
    <div className="ielts-tools" role="toolbar" aria-label="Công cụ luyện tập">
      <span className="ielts-tools-label">🛠️ Công cụ:</span>
      <button type="button" className="btn btn-sm secondary" onClick={onHighlight}
        disabled={!hlSupported}
        title={hlSupported ? 'Bôi đen đoạn chữ rồi bấm để tô vàng (phím H)' : 'Trình duyệt này chưa hỗ trợ tô màu chữ'}>
        🖍 Highlight <kbd>H</kbd>
      </button>
      <button type="button" className="btn btn-sm secondary" onClick={onNotes}
        title="Ghi chú cho câu đang làm (phím N)">
        📝 Ghi chú <kbd>N</kbd>{notesCount > 0 ? ` (${notesCount})` : ''}
      </button>
      {hlCount > 0 && (
        <button type="button" className="btn btn-sm secondary" onClick={onClearHighlights}
          title="Xóa tất cả đoạn đã tô vàng trong buổi này">
          🗑 Xóa highlight
        </button>
      )}
    </div>
  );
}

/* ---- Panel ghi chú (góc phải dưới) ---- */

export interface SessionNote { id: string; n: number; text: string }

export function IeltsNotePanel({ current, sessionNotes, onSave, onJump, onClose }: {
  /** Câu đang làm (để soạn ghi chú) — null nếu chưa chọn câu nào. */
  current: { id: string; n: number; text: string } | null;
  /** Ghi chú của các câu trong buổi hiện tại. */
  sessionNotes: SessionNote[];
  onSave: (questionId: string, text: string) => void;
  onJump: (id: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(current?.text ?? '');
  useEffect(() => { setDraft(current?.text ?? ''); }, [current?.id]);
  return (
    <div className="ielts-note-panel card" role="dialog" aria-label="Ghi chú">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>📝 Ghi chú</h3>
        <button type="button" className="btn btn-sm secondary" onClick={onClose} aria-label="Đóng ghi chú">✕</button>
      </div>
      {current ? (
        <>
          <p className="muted" style={{ margin: '.4rem 0' }}>Câu {current.n}</p>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Ghi chú cho câu này… (ví dụ: từ mới, bẫy hay gặp, cách làm)"
            rows={3}
            style={{ width: '100%' }}
            aria-label={`Ghi chú câu ${current.n}`}
          />
          <div className="btn-row">
            <button type="button" className="btn btn-sm" onClick={() => onSave(current.id, draft)}>Lưu ghi chú</button>
            {current.text && (
              <button type="button" className="btn btn-sm secondary" onClick={() => { setDraft(''); onSave(current.id, ''); }}>Xóa ghi chú</button>
            )}
          </div>
        </>
      ) : (
        <p className="muted">Bấm vào 1 câu trong đề rồi mở lại ghi chú để ghi cho câu đó.</p>
      )}
      {sessionNotes.length > 0 && (
        <>
          <h4 style={{ margin: '.8rem 0 .3rem' }}>Ghi chú trong buổi này ({sessionNotes.length})</h4>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {sessionNotes.map(sn => (
              <li key={sn.id} style={{ marginBottom: '.3rem' }}>
                <button type="button" className="linklike" onClick={() => onJump(sn.id)}>Câu {sn.n}</button>
                {': '}{sn.text}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
