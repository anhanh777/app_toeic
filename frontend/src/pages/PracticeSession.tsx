// Luyện tập theo Part — dạng danh sách liền mạch như tờ đề thi:
// LUYỆN HẾT câu của Part (không giới hạn số lượng): toàn bộ câu của Part
// đó — trong 1 đề hoặc toàn ngân hàng — nằm trong 1 tờ giấy (.paper),
// các câu nối tiếp nhau bằng đường kẻ mảnh; chấm điểm theo từng câu ngay
// sau khi bấm "Nộp đáp án" của câu đó (giữ nguyên API practiceAnswer, XP,
// ghi câu sai). Người học được làm các câu theo thứ tự bất kỳ. Part 1/2
// vẫn ẨN chữ trước khi trả lời từng câu (đúng đề thi thật), chỉ hiện lại
// sau khi đã nộp đáp án.
import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api, type Question } from '../api';
import { ErrorBox, ListeningAudio, partName } from '../components';
import { stopSpeak, ttsTextFor } from '../tts';

type AnswerResult = { correct: boolean; correctLabel: string; explanation?: string; transcript?: string; xpAwarded?: number };

export default function PracticeSession() {
  const [params] = useSearchParams();
  const part = Number(params.get('part') || 5);
  // Luyện HẾT câu của Part (không giới hạn số lượng): lấy toàn bộ qua
  // phân trang. Tham số count cũ trên URL (nếu còn từ link cũ) được bỏ qua.
  const testSetId = params.get('testSetId') || undefined;
  const [testSetTitle, setTestSetTitle] = useState<string>('');
  const [questions, setQuestions] = useState<Question[]>([]);
  // Chọn đáp án + kết quả chấm lưu theo id câu (mỗi câu chấm độc lập).
  const [selectedById, setSelectedById] = useState<Record<string, string>>({});
  const [resultById, setResultById] = useState<Record<string, AnswerResult>>({});
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState({ correct: 0, done: 0 });
  const [finished, setFinished] = useState(false);
  // Audio cấp Part (Part 1–4): fallback khi câu/đoạn chưa có audio riêng.
  // Tải thất bại (backend chưa có endpoint) thì bỏ qua, fallback về {}.
  const [partMedia, setPartMedia] = useState<Record<number, string>>({});
  // Đã tải xong part-media hay chưa — để quyết định "1 nút cả Part" hay
  // "nút từng câu" rồi mới render, tránh nhấp nháy đổi dạng giữa chừng.
  const [partMediaLoaded, setPartMediaLoaded] = useState(false);

  useEffect(() => {
    setLoading(true);
    setPartMediaLoaded(false);
    if (testSetId) api.testSet(testSetId).then(t => setTestSetTitle(t.title)).catch(() => undefined);
    if (part <= 4) {
      (testSetId ? api.partMedia(testSetId) : Promise.resolve<Record<number, string>>({}))
        .then(setPartMedia)
        .catch(() => setPartMedia({}))
        .finally(() => setPartMediaLoaded(true));
    }
    api.questionsAll(part, testSetId).then(setQuestions).catch(setError).finally(() => setLoading(false));
    return () => stopSpeak();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part, testSetId]);

  const isListening = part <= 4;
  // 1 nút nghe DUY NHẤT cho cả Part: chỉ khi luyện trong 1 bộ đề (có
  // testSetId) VÀ đề đó có file audio cấp Part. Đề chưa có audio Part
  // (hoặc luyện theo Part không kèm đề) thì giữ nút nghe từng câu như cũ.
  const usePartAudio = isListening && !!testSetId && !!partMedia[part];

  // Câu chỉ-nghe (Part 1/2): toàn bộ phương án đều rỗng nội dung (chỉ có
  // nhãn) — người học chỉ nghe audio rồi chọn chữ cái.
  const isListeningOnly = (q: Question) =>
    (q.part === 1 || q.part === 2) &&
    q.options.length > 0 &&
    q.options.every(o => !o.content || !o.content.trim());

  const submit = async (q: Question) => {
    const selected = selectedById[q.id];
    // Đã chấm rồi thì không chấm lại (nút cũng đã bị khóa, đây là chốt chặn).
    if (!selected || resultById[q.id]) return;
    try {
      const r = await api.practiceAnswer(q.id, selected);
      setResultById(m => ({ ...m, [q.id]: r }));
      setScore(s => ({ correct: s.correct + (r.correct ? 1 : 0), done: s.done + 1 }));
    } catch (e) { setError(e); }
  };

  if (loading || (isListening && !!testSetId && !partMediaLoaded)) return <p>Đang tải câu hỏi…</p>;
  if (!questions.length) return <div><ErrorBox error={error} /><p>Chưa có câu hỏi cho Part này. {testSetId ? <Link to={`/practice/test-set/${testSetId}`}>Quay lại đề thi</Link> : <Link to="/practice">Quay lại chọn Part</Link>}</p></div>;
  if (finished) {
    return (
      <div className="card">
        <h1>Hoàn thành!</h1>
        {testSetTitle && <p className="muted">{testSetTitle}</p>}
        <p className="big">{score.correct}/{score.done} câu đúng</p>
        <p>{score.done ? `Tỉ lệ đúng: ${Math.round((score.correct / score.done) * 100)}%` : ''}</p>
        <div className="btn-row">
          {testSetId
            ? <><Link className="btn" to={`/practice/test-set/${testSetId}`}>Quay lại đề thi</Link><Link className="btn secondary" to="/wrong">Ôn câu sai</Link></>
            : <><Link className="btn" to="/practice">Luyện Part khác</Link><Link className="btn secondary" to="/wrong">Ôn câu sai</Link></>}
        </div>
      </div>
    );
  }

  // Nhóm các câu liên tiếp cùng 1 đoạn văn (Part 3/4/6/7) để đoạn chỉ hiện
  // 1 lần, các câu hỏi của đoạn nối tiếp ngay bên dưới — như tờ đề thi thật.
  // Số thứ tự n đếm liên tiếp theo thứ tự câu trong đợt luyện.
  type Block = { key: string; passageText?: string; questions: { q: Question; n: number }[] };
  const blocks: Block[] = [];
  questions.forEach((q, i) => {
    const last = blocks[blocks.length - 1];
    const sameId = !!q.passageId && !!last && last.questions[0]?.q.passageId === q.passageId;
    const sameText = !!q.passageText && !!last && last.passageText === q.passageText;
    if ((sameId || sameText) && last) last.questions.push({ q, n: i + 1 });
    else blocks.push({ key: q.id, passageText: q.passageText, questions: [{ q, n: i + 1 }] });
  });

  const renderQuestion = ({ q, n }: { q: Question; n: number }) => {
    const result = resultById[q.id];
    const selected = selectedById[q.id] ?? null;
    const listeningOnly = isListeningOnly(q);
    // Part 1/2 thi that: chi co tranh + nghe + chon A/B/C/D, KHONG hien chu
    // cau hoi/phuong an truoc khi tra loi cau do. Tra loi xong moi hien day
    // du chu de xem lai minh vua nghe gi.
    const hideListeningText = (q.part === 1 || q.part === 2) && !result;
    const letterOnly = listeningOnly || hideListeningText;
    return (
      <div className="paper-q exam-q" key={q.id}>
        <div className="exam-q-body">
          {/* Thứ tự trong cột trái: dòng hướng dẫn (Part 2) → ảnh → trình phát
              audio nổi bật ở đầu khối → rồi mới tới chữ câu hỏi. Bài nghe thì
              nút nghe phải thấy ngay, không bị chìm dưới chữ câu hỏi. */}
          {hideListeningText && q.part === 2 && listeningOnly ? (
            <p><strong>🎧 Nghe và chọn đáp án đúng</strong></p>
          ) : null}
          {q.imageUrl && (
            <img src={q.imageUrl} alt="Ảnh minh họa" style={{ maxWidth: '100%', borderRadius: 12 }} />
          )}
          {listeningOnly && q.part === 1 && !q.imageUrl && (
            <p className="muted">🖼 Chưa có ảnh minh họa cho câu này.</p>
          )}
          {isListening && !usePartAudio && (
            <ListeningAudio
              // Ưu tiên: audio câu hỏi → audio đoạn văn đã gộp sẵn trong
              // q.audioUrl → audio cấp Part. Không có audio nào thì TTS như cũ.
              // Khi đề có file audio cấp Part thì KHÔNG render hộp này nữa —
              // cả Part chỉ còn 1 nút nghe duy nhất ở đầu Part (ngay dưới
              // tiêu đề PART X).
              audioUrl={q.audioUrl || partMedia[q.part]}
              ttsText={ttsTextFor(q)}
              stopKey={q.id}
              onError={setError}
            />
          )}
          {!hideListeningText && q.content ? <p><strong>{q.content}</strong></p> : null}
        </div>
        <div className="exam-q-side">
          <div className="exam-q-num">{n}.</div>
          <div className="exam-opts">
            {q.options.map(o => {
              let cls = 'option';
              if (selected === o.label) cls += ' selected';
              if (result) {
                if (o.label === result.correctLabel) cls += ' correct';
                else if (selected === o.label && !result.correct) cls += ' wrong';
              }
              return <button key={o.label} className={cls} disabled={!!result} onClick={() => setSelectedById(m => ({ ...m, [q.id]: o.label }))}>{letterOnly ? <strong>{o.label}</strong> : <><strong>{o.label}</strong> {o.content}</>}</button>;
            })}
          </div>
          {!result && (
            <div className="btn-row"><button className="btn btn-sm" disabled={!selected} onClick={() => void submit(q)}>Nộp đáp án</button></div>
          )}
        </div>
        {result && (
          <div className="exam-q-result">
            <p style={{ color: result.correct ? '#3E6B4A' : '#A84A4A', fontWeight: 700 }}>
              {result.correct ? '✅ Đúng rồi!' : `❌ Sai rồi. Đáp án đúng: ${result.correctLabel}`} {result.xpAwarded ? `(+${result.xpAwarded} XP)` : ''}
            </p>
            {result.explanation && <p><strong>Giải thích:</strong> {result.explanation}</p>}
            {result.transcript && <p><strong>Transcript:</strong> {result.transcript}</p>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {testSetTitle && <p className="tag" style={{ margin: '.15rem 0' }}>📚 {testSetTitle}</p>}
      <div className="exam-head">
        <h2 className="exam-part">Part {part}{partName(part).split('—')[1]?.trim() ? <span> — {partName(part).split('—')[1]?.trim()}</span> : null}</h2>
        <span className="progress-badge">Đã làm {score.done}/{questions.length}</span>
      </div>
      {usePartAudio && (
        <div className="part-audio">
          <ListeningAudio audioUrl={partMedia[part]} ttsText="" stopKey={`part-${part}`} onError={setError} />
          <p className="muted">🎧 Nghe cả Part {part} — bấm 1 lần rồi làm hết các câu của Part trong lúc nghe.</p>
        </div>
      )}
      <ErrorBox error={error} />
      <div className="paper">
        {blocks.map(block => block.passageText ? (
          <div className="paper-cluster" key={block.key}>
            <div className="passage">{block.passageText}</div>
            {block.questions.map(item => renderQuestion(item))}
          </div>
        ) : (
          block.questions.map(item => renderQuestion(item))
        ))}
      </div>
      <div className="practice-bar">
        <span className="progress">Đã làm {score.done}/{questions.length} • Đúng {score.correct}</span>
        <button className="btn btn-sm" onClick={() => { stopSpeak(); setFinished(true); }}>Xem kết quả</button>
      </div>
    </div>
  );
}
