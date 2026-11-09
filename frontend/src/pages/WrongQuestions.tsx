import { useEffect, useState } from 'react';
import { api, type Question } from '../api';
import { ErrorBox, partName } from '../components';

type Item = Question & { wrongCount?: number };

export default function WrongQuestions() {
  const [items, setItems] = useState<Item[]>([]);
  const [part, setPart] = useState<number | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  const load = (p?: number) => api.wrongQuestions(p).then(setItems).catch(setError);
  useEffect(() => { load(part); }, [part]);

  const review = async (q: Item) => {
    const sel = selected[q.id];
    if (!sel) return;
    try {
      const r = await api.reviewWrong(q.id, sel);
      setFeedback(f => ({ ...f, [q.id]: r.correct ? `✅ Đúng! Câu này đã được gỡ khỏi danh sách.${r.xpAwarded ? ` +${r.xpAwarded} XP` : ''}` : `❌ Sai. Đáp án đúng: ${r.correctLabel}. ${r.explanation || ''}` }));
      if (r.correct) setItems(list => list.filter(x => x.id !== q.id));
    } catch (e) { setError(e); }
  };

  return (
    <div>
      <h1>Câu đã làm sai</h1>
      <ErrorBox error={error} />
      <label htmlFor="filter">Lọc theo Part</label>
      <select id="filter" value={part ?? ''} onChange={e => setPart(e.target.value ? Number(e.target.value) : undefined)}>
        <option value="">Tất cả các Part</option>
        {[1, 2, 3, 4, 5, 6, 7].map(p => <option key={p} value={p}>{partName(p)}</option>)}
      </select>
      {items.length === 0 && <p className="muted">Chưa có câu sai nào. Làm đúng 1 câu ở đây sẽ gỡ nó khỏi danh sách.</p>}
      {items.map(q => (
        <div key={q.id} className="card">
          <p className="tag">{partName(q.part)} • Sai {q.wrongCount ?? 1} lần</p>
          {q.passageText && <div className="passage">{q.passageText}</div>}
          <p><strong>{q.content}</strong></p>
          {q.options.map(o => (
            <button key={o.label} className={`option ${selected[q.id] === o.label ? 'selected' : ''}`} onClick={() => setSelected(s => ({ ...s, [q.id]: o.label }))}>
              <strong>{o.label}.</strong> {o.content}
            </button>
          ))}
          {feedback[q.id] && <p>{feedback[q.id]}</p>}
          <div className="btn-row"><button className="btn" disabled={!selected[q.id]} onClick={() => review(q)}>Kiểm tra</button></div>
        </div>
      ))}
    </div>
  );
}
