import { useEffect, useMemo, useState } from 'react';
import { api, type Vocab } from '../api';
import { ErrorBox } from '../components';

export default function Vocabulary() {
  const [words, setWords] = useState<Vocab[]>([]);
  const [topic, setTopic] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [flipped, setFlipped] = useState(false);
  const [idx, setIdx] = useState(0);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.vocabulary(topic).then(w => { setWords(w); setIdx(0); }).catch(setError);
  }, [topic]);

  const topics = useMemo(() => [...new Set(words.map(w => w.topic || 'Chung'))], [words]);
  const w = words[idx];

  const mark = async (status: 'learning' | 'learned' | 'wrong', vocabId?: string) => {
    const id = vocabId || w?.id;
    if (!id) return;
    try { await api.markVocab(id, status); setMsg(status === 'learned' ? 'Đã đánh dấu đã thuộc ✅' : status === 'wrong' ? 'Đã đưa vào danh sách ôn lại.' : 'Đã đánh dấu đang học.'); }
    catch (e) { setError(e); }
  };

  return (
    <div>
      <h1>Từ vựng</h1>
      <ErrorBox error={error} />
      {msg && <div className="success">{msg}</div>}
      <label htmlFor="topic">Chủ đề</label>
      <select id="topic" value={topic} onChange={e => setTopic(e.target.value)}>
        <option value="">Tất cả chủ đề</option>
        {topics.map(t => <option key={t} value={t}>{t}</option>)}
      </select>

      {w && (
        <div className="card">
          <h2>Flashcard</h2>
          <div className={`flashcard ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped(f => !f)}>
            <div className="flashcard-inner">
              <div className="flashcard-face"><div className="big">{w.word}</div><div className="muted">{w.phonetic || ''}</div><p className="muted">Bấm để lật thẻ</p></div>
              <div className="flashcard-face back"><div><strong>{w.meaning}</strong></div><p>{w.example || ''}</p></div>
            </div>
          </div>
          <div className="btn-row">
            <button className="btn secondary" disabled={idx === 0} onClick={() => { setIdx(i => i - 1); setFlipped(false); }}>← Từ trước</button>
            <button className="btn secondary" disabled={idx + 1 >= words.length} onClick={() => { setIdx(i => i + 1); setFlipped(false); }}>Từ tiếp →</button>
            <button className="btn" onClick={() => mark('learned')}>Đã thuộc ✅</button>
            <button className="btn danger" onClick={() => mark('wrong')}>Chưa thuộc ❌</button>
          </div>
          <p className="muted">Từ {idx + 1}/{words.length}</p>
        </div>
      )}

      <div className="card">
        <h2>Danh sách từ ({words.length})</h2>
        <table><thead><tr><th>Từ</th><th>Phiên âm</th><th>Nghĩa</th><th>Chủ đề</th><th></th></tr></thead>
          <tbody>{words.map(v => (
            <tr key={v.id}><td><strong>{v.word}</strong><br /><span className="muted">{v.example || ''}</span></td><td>{v.phonetic || ''}</td><td>{v.meaning}</td><td>{v.topic || ''}</td>
              <td><button className="btn ghost" onClick={() => mark('learned', v.id)}>Đã thuộc</button></td></tr>
          ))}</tbody></table>
      </div>
    </div>
  );
}
