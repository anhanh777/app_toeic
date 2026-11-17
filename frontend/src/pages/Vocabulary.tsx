import { useEffect, useMemo, useState } from 'react';
import { api, type UserWord, type Vocab } from '../api';
import { ErrorBox } from '../components';
import { useExam } from '../exam';

type WordStatus = 'learning' | 'learned' | 'wrong';
const STATUS_LABEL: Record<WordStatus, string> = { learning: 'Đang học', learned: 'Đã thuộc', wrong: 'Chưa thuộc' };

/**
 * Trang Từ vựng — 2 kho:
 * - "Từ của tôi" (mặc định): từ cá nhân, lưu khi tra từ trong đoạn văn
 *   lúc luyện tập hoặc thêm tay; sửa/xóa/đánh dấu được.
 * - "Từ chung": kho từ chung do admin quản (hiện đã làm trống theo
 *   hướng mới — từ vựng lấy từ quá trình luyện tập); người học chỉ
 *   đánh dấu đã thuộc/chưa thuộc.
 */
export default function Vocabulary() {
  const [tab, setTab] = useState<'mine' | 'shared'>('mine');
  return (
    <div>
      <h1>Từ vựng</h1>
      <div className="btn-row" role="tablist" aria-label="Kho từ vựng">
        <button type="button" className={tab === 'mine' ? 'btn' : 'btn secondary'} onClick={() => setTab('mine')}>Từ của tôi</button>
        <button type="button" className={tab === 'shared' ? 'btn' : 'btn secondary'} onClick={() => setTab('shared')}>Từ chung</button>
      </div>
      {tab === 'mine' ? <MyWords /> : <SharedWords />}
    </div>
  );
}

function MyWords() {
  const [words, setWords] = useState<UserWord[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [msg, setMsg] = useState('');
  const [flipped, setFlipped] = useState(false);
  const [idx, setIdx] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  // Sửa từ: form mở theo từ đang sửa.
  const [editing, setEditing] = useState<UserWord | null>(null);
  const [editForm, setEditForm] = useState({ phonetic: '', pos: '', meaning: '', example: '', topic: '' });
  // Thêm từ mới tay: gõ từ -> tra cứu tự điền -> sửa lại -> lưu.
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ word: '', phonetic: '', pos: '', meaning: '', example: '', topic: '' });
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');

  const load = () => {
    api.userWords('', 500, 0).then((d) => { setWords(d.items); setIdx(0); setFlipped(false); }).catch(setError);
  };
  useEffect(load, []);

  const filtered = useMemo(
    () => (statusFilter ? words.filter((w) => w.status === statusFilter) : words),
    [words, statusFilter]
  );
  const safeIdx = filtered.length ? Math.min(idx, filtered.length - 1) : 0;
  const w = filtered[safeIdx];

  const mark = async (id: number, status: WordStatus) => {
    try {
      const updated = await api.markUserWord(id, status);
      setWords((list) => list.map((x) => (x.id === id ? updated : x)));
      setMsg(`Đã đánh dấu "${updated.word}": ${STATUS_LABEL[status]}.`);
    } catch (e) { setError(e); }
  };

  const removeWord = async (word: UserWord) => {
    if (!window.confirm(`Xóa từ "${word.word}" khỏi Từ của tôi?`)) return;
    try {
      await api.deleteUserWord(word.id);
      setWords((list) => list.filter((x) => x.id !== word.id));
      setMsg(`Đã xóa từ "${word.word}".`);
    } catch (e) { setError(e); }
  };

  const startEdit = (word: UserWord) => {
    setEditing(word);
    setEditForm({
      phonetic: word.phonetic || '',
      pos: word.pos || '',
      meaning: word.meaning || '',
      example: word.example || '',
      topic: word.topic || '',
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editForm.meaning.trim()) { setError(new Error('Nghĩa không được để trống.')); return; }
    try {
      const updated = await api.updateUserWord(editing.id, {
        phonetic: editForm.phonetic, pos: editForm.pos, meaning: editForm.meaning,
        example: editForm.example, topic: editForm.topic,
      });
      setWords((list) => list.map((x) => (x.id === updated.id ? updated : x)));
      setEditing(null);
      setMsg(`Đã lưu sửa đổi cho từ "${updated.word}".`);
    } catch (e) { setError(e); }
  };

  const lookupAdd = async () => {
    const word = addForm.word.trim();
    if (!word) { setLookupError('Gõ từ cần thêm trước đã.'); return; }
    setLookupError('');
    setLookupLoading(true);
    try {
      const entry = await api.dictionaryLookup(word);
      setAddForm((f) => ({
        ...f,
        word: entry.word,
        phonetic: entry.phonetic || '',
        pos: entry.pos || '',
        meaning: entry.meaning_vi,
        example: entry.example || '',
      }));
    } catch {
      setLookupError('Không tra được từ này, thử lại sau (hoặc tự gõ nghĩa rồi lưu).');
    } finally {
      setLookupLoading(false);
    }
  };

  const saveAdd = async () => {
    if (!addForm.word.trim() || !addForm.meaning.trim()) {
      setError(new Error('Cần có từ và nghĩa tiếng Việt mới lưu được.'));
      return;
    }
    try {
      const row = await api.createUserWord({
        word: addForm.word.trim(),
        phonetic: addForm.phonetic || undefined,
        pos: addForm.pos || undefined,
        meaning: addForm.meaning.trim(),
        example: addForm.example || undefined,
        topic: addForm.topic || undefined,
      });
      if (row.existed) {
        setMsg(`Từ "${row.word}" đã có trong Từ của tôi rồi.`);
      } else {
        setWords((list) => [row, ...list]);
        setMsg(`Đã thêm từ "${row.word}" vào Từ của tôi.`);
      }
      setAddForm({ word: '', phonetic: '', pos: '', meaning: '', example: '', topic: '' });
      setShowAdd(false);
    } catch (e) { setError(e); }
  };

  return (
    <div>
      <ErrorBox error={error} />
      {msg && <div className="success">{msg}</div>}
      <div className="btn-row" style={{ alignItems: 'center' }}>
        <label htmlFor="my-status">Trạng thái</label>
        <select id="my-status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setIdx(0); setFlipped(false); }}>
          <option value="">Tất cả</option>
          <option value="learning">Đang học</option>
          <option value="learned">Đã thuộc</option>
          <option value="wrong">Chưa thuộc</option>
        </select>
        <button type="button" className="btn" onClick={() => setShowAdd((v) => !v)}>＋ Thêm từ mới</button>
      </div>

      {showAdd && (
        <div className="card">
          <h2>Thêm từ mới</h2>
          <label>Từ tiếng Anh</label>
          <div className="btn-row">
            <input value={addForm.word} onChange={(e) => setAddForm((f) => ({ ...f, word: e.target.value }))} placeholder="vd: supervisor" />
            <button type="button" className="btn secondary" disabled={lookupLoading} onClick={() => void lookupAdd()}>
              {lookupLoading ? 'Đang tra…' : 'Tra cứu'}
            </button>
          </div>
          {lookupError && <p className="error">{lookupError}</p>}
          <p className="muted">Bấm "Tra cứu" để tự điền phiên âm, loại từ và nghĩa — sửa lại nếu cần rồi bấm Lưu.</p>
          <label>Phiên âm</label>
          <input value={addForm.phonetic} onChange={(e) => setAddForm((f) => ({ ...f, phonetic: e.target.value }))} placeholder="/ˈsuːpərvaɪzər/" />
          <label>Loại từ</label>
          <input value={addForm.pos} onChange={(e) => setAddForm((f) => ({ ...f, pos: e.target.value }))} placeholder="vd: danh từ" />
          <label>Nghĩa tiếng Việt</label>
          <input value={addForm.meaning} onChange={(e) => setAddForm((f) => ({ ...f, meaning: e.target.value }))} />
          <label>Ví dụ</label>
          <input value={addForm.example} onChange={(e) => setAddForm((f) => ({ ...f, example: e.target.value }))} />
          <label>Chủ đề (không bắt buộc)</label>
          <input value={addForm.topic} onChange={(e) => setAddForm((f) => ({ ...f, topic: e.target.value }))} placeholder="vd: office" />
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => void saveAdd()}>Lưu từ</button>
            <button type="button" className="btn secondary" onClick={() => setShowAdd(false)}>Đóng</button>
          </div>
        </div>
      )}

      {w ? (
        <div className="card">
          <h2>Flashcard</h2>
          <div className={`flashcard ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped((f) => !f)}>
            <div className="flashcard-inner">
              <div className="flashcard-face">
                <div className="big">{w.word}</div>
                <div className="muted">{[w.phonetic, w.pos].filter(Boolean).join(' · ')}</div>
                <p className="muted">Bấm để lật thẻ</p>
              </div>
              <div className="flashcard-face back">
                <div><strong>{w.meaning}</strong></div>
                <p>{w.example || ''}</p>
              </div>
            </div>
          </div>
          <div className="btn-row">
            <button type="button" className="btn secondary" disabled={safeIdx === 0} onClick={() => { setIdx((i) => i - 1); setFlipped(false); }}>← Từ trước</button>
            <button type="button" className="btn secondary" disabled={safeIdx + 1 >= filtered.length} onClick={() => { setIdx((i) => i + 1); setFlipped(false); }}>Từ tiếp →</button>
            <button type="button" className="btn" onClick={() => void mark(w.id, 'learned')}>Đã thuộc ✅</button>
            <button type="button" className="btn danger" onClick={() => void mark(w.id, 'wrong')}>Chưa thuộc ❌</button>
          </div>
          <p className="muted">Từ {safeIdx + 1}/{filtered.length} • {STATUS_LABEL[w.status]}</p>
        </div>
      ) : (
        <div className="card">
          <p>Chưa có từ nào ở đây. Khi luyện tập, bấm vào từ trong đoạn văn rồi chọn ＋ Lưu vào từ vựng — từ sẽ hiện ở đây. Bạn cũng có thể bấm "＋ Thêm từ mới" để tự thêm.</p>
        </div>
      )}

      {editing && (
        <div className="card">
          <h2>Sửa từ "{editing.word}"</h2>
          <label>Phiên âm</label>
          <input value={editForm.phonetic} onChange={(e) => setEditForm((f) => ({ ...f, phonetic: e.target.value }))} />
          <label>Loại từ</label>
          <input value={editForm.pos} onChange={(e) => setEditForm((f) => ({ ...f, pos: e.target.value }))} />
          <label>Nghĩa tiếng Việt</label>
          <input value={editForm.meaning} onChange={(e) => setEditForm((f) => ({ ...f, meaning: e.target.value }))} />
          <label>Ví dụ</label>
          <input value={editForm.example} onChange={(e) => setEditForm((f) => ({ ...f, example: e.target.value }))} />
          <label>Chủ đề</label>
          <input value={editForm.topic} onChange={(e) => setEditForm((f) => ({ ...f, topic: e.target.value }))} />
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => void saveEdit()}>Lưu sửa đổi</button>
            <button type="button" className="btn secondary" onClick={() => setEditing(null)}>Hủy</button>
          </div>
        </div>
      )}

      {words.length > 0 && (
        <div className="card">
          <h2>Danh sách từ ({filtered.length})</h2>
          <table>
            <thead><tr><th>Từ</th><th>Nghĩa</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.id}>
                  <td>
                    <strong>{v.word}</strong>
                    <br /><span className="muted">{[v.phonetic, v.pos].filter(Boolean).join(' · ')}</span>
                    <br /><span className="muted">{v.example || ''}</span>
                  </td>
                  <td>{v.meaning}</td>
                  <td>
                    <select value={v.status} onChange={(e) => void mark(v.id, e.target.value as WordStatus)} aria-label={`Trạng thái của từ ${v.word}`}>
                      <option value="learning">Đang học</option>
                      <option value="learned">Đã thuộc</option>
                      <option value="wrong">Chưa thuộc</option>
                    </select>
                  </td>
                  <td>
                    <div className="btn-row">
                      <button type="button" className="btn ghost" onClick={() => startEdit(v)}>Sửa</button>
                      <button type="button" className="btn ghost" onClick={() => void removeWord(v)}>Xóa</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SharedWords() {
  const { exam } = useExam();
  const ex = exam ?? 'toeic';
  const [words, setWords] = useState<Vocab[]>([]);
  const [topic, setTopic] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [flipped, setFlipped] = useState(false);
  const [idx, setIdx] = useState(0);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.vocabulary(topic, 100, ex).then((w) => { setWords(w); setIdx(0); }).catch(setError);
  }, [topic, ex]);

  const topics = useMemo(() => [...new Set(words.map((w) => w.topic || 'Chung'))], [words]);
  const w = words[idx];

  const mark = async (status: 'learning' | 'learned' | 'wrong', vocabId?: string) => {
    const id = vocabId || w?.id;
    if (!id) return;
    try {
      await api.markVocab(id, status);
      setMsg(status === 'learned' ? 'Đã đánh dấu đã thuộc ✅' : status === 'wrong' ? 'Đã đưa vào danh sách ôn lại.' : 'Đã đánh dấu đang học.');
    } catch (e) { setError(e); }
  };

  return (
    <div>
      <ErrorBox error={error} />
      {msg && <div className="success">{msg}</div>}
      {words.length === 0 ? (
        <div className="card">
          <p>Chưa có từ chung — từ vựng giờ lấy từ quá trình luyện tập của bạn: khi luyện tập, bấm vào từ trong đoạn văn rồi chọn ＋ Lưu vào từ vựng, từ sẽ nằm ở tab "Từ của tôi".</p>
        </div>
      ) : (
        <>
          <label htmlFor="topic">Chủ đề</label>
          <select id="topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="">Tất cả chủ đề</option>
            {topics.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>

          {w && (
            <div className="card">
              <h2>Flashcard</h2>
              <div className={`flashcard ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped((f) => !f)}>
                <div className="flashcard-inner">
                  <div className="flashcard-face"><div className="big">{w.word}</div><div className="muted">{w.phonetic || ''}</div><p className="muted">Bấm để lật thẻ</p></div>
                  <div className="flashcard-face back"><div><strong>{w.meaning}</strong></div><p>{w.example || ''}</p></div>
                </div>
              </div>
              <div className="btn-row">
                <button type="button" className="btn secondary" disabled={idx === 0} onClick={() => { setIdx((i) => i - 1); setFlipped(false); }}>← Từ trước</button>
                <button type="button" className="btn secondary" disabled={idx + 1 >= words.length} onClick={() => { setIdx((i) => i + 1); setFlipped(false); }}>Từ tiếp →</button>
                <button type="button" className="btn" onClick={() => void mark('learned')}>Đã thuộc ✅</button>
                <button type="button" className="btn danger" onClick={() => void mark('wrong')}>Chưa thuộc ❌</button>
              </div>
              <p className="muted">Từ {idx + 1}/{words.length}</p>
            </div>
          )}

          <div className="card">
            <h2>Danh sách từ ({words.length})</h2>
            <table><thead><tr><th>Từ</th><th>Phiên âm</th><th>Nghĩa</th><th>Chủ đề</th><th></th></tr></thead>
              <tbody>{words.map((v) => (
                <tr key={v.id}><td><strong>{v.word}</strong><br /><span className="muted">{v.example || ''}</span></td><td>{v.phonetic || ''}</td><td>{v.meaning}</td><td>{v.topic || ''}</td>
                  <td><button type="button" className="btn ghost" onClick={() => void mark('learned', v.id)}>Đã thuộc</button></td></tr>
              ))}</tbody></table>
          </div>
        </>
      )}
    </div>
  );
}
