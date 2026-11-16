import { useEffect, useState } from 'react';
import { api, type Question } from '../api';
import { ErrorBox, partName } from '../components';
import { isFillIn, partNameFor, useExam, wordCount } from '../exam';
import { IeltsAnswerControl } from '../ielts-ui';

type Item = Question & { wrongCount?: number };

export default function WrongQuestions() {
  const { exam } = useExam();
  const ex = exam ?? 'toeic';
  const isIelts = ex === 'ielts';
  const [items, setItems] = useState<Item[]>([]);
  const [part, setPart] = useState<number | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  const load = (p?: number) => api.wrongQuestions(p, ex).then(setItems).catch(setError);
  useEffect(() => { load(part); }, [part, ex]);

  const review = async (q: Item) => {
    const sel = selected[q.id];
    if (!sel) return;
    try {
      const r = await api.reviewWrong(q.id, sel);
      const right = r.correctText ?? r.correctLabel;
      setFeedback(f => ({ ...f, [q.id]: r.correct ? `✅ Đúng! Câu này đã được gỡ khỏi danh sách.${r.xpAwarded ? ` +${r.xpAwarded} XP` : ''}` : `❌ Sai. Đáp án đúng: ${right ?? '—'}. ${r.explanation || ''}` }));
      if (r.correct) setItems(list => list.filter(x => x.id !== q.id));
    } catch (e) { setError(e); }
  };

  return (
    <div>
      <h1>Câu đã làm sai</h1>
      <ErrorBox error={error} />
      <label htmlFor="filter">{isIelts ? 'Lọc theo Section/Passage' : 'Lọc theo Part'}</label>
      <select id="filter" value={part ?? ''} onChange={e => setPart(e.target.value ? Number(e.target.value) : undefined)}>
        <option value="">{isIelts ? 'Tất cả các Section/Passage' : 'Tất cả các Part'}</option>
        {[1, 2, 3, 4, 5, 6, 7].map(p => <option key={p} value={p}>{isIelts ? partNameFor(p, ex) : partName(p)}</option>)}
      </select>
      {items.length === 0 && <p className="muted">Chưa có câu sai nào. Làm đúng 1 câu ở đây sẽ gỡ nó khỏi danh sách.</p>}
      {items.map(q => {
        const fillIn = isFillIn(q.questionType);
        const sel = selected[q.id] ?? '';
        const overLimit = fillIn && q.wordLimit != null && wordCount(sel) > q.wordLimit;
        return (
          <div key={q.id} className="card">
            <p className="tag">{isIelts ? partNameFor(q.part, ex) : partName(q.part)} • Sai {q.wrongCount ?? 1} lần</p>
            {q.passageText && <div className="passage">{q.passageText}</div>}
            <p><strong>{q.content}</strong></p>
            {isIelts && q.questionType && q.questionType !== 'multiple_choice' ? (
              <IeltsAnswerControl
                q={q}
                value={sel}
                onChange={v => setSelected(s => ({ ...s, [q.id]: v }))}
              />
            ) : (
              q.options.map(o => (
                <button key={o.label} className={`option ${selected[q.id] === o.label ? 'selected' : ''}`} onClick={() => setSelected(s => ({ ...s, [q.id]: o.label }))}>
                  <strong>{o.label}.</strong> {o.content}
                </button>
              ))
            )}
            {feedback[q.id] && <p>{feedback[q.id]}</p>}
            <div className="btn-row"><button className="btn" disabled={!selected[q.id] || overLimit} onClick={() => review(q)}>Kiểm tra</button></div>
          </div>
        );
      })}
    </div>
  );
}
