import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Question, type TestSet } from '../api';
import { ErrorBox, ListeningAudio, partName } from '../components';
import { partLabel, partNameFor, useExam } from '../exam';
import { IeltsAnswerControl } from '../ielts-ui';
import { stopSpeak, ttsTextFor } from '../tts';

function fmt(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function MockTest() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const testSetId = params.get('testSetId') || undefined;
  const { exam: ctxExam } = useExam();
  const [testSet, setTestSet] = useState<TestSet | null>(null);
  // Kỳ thi: ưu tiên ?exam=, rồi exam của bộ đề, rồi kỳ thi đang chọn.
  const qExam = params.get('exam');
  const exam = qExam === 'ielts' || qExam === 'toeic'
    ? qExam
    : (testSet?.exam === 'ielts' || testSet?.exam === 'toeic' ? testSet.exam : ctxExam ?? 'toeic');
  const isIelts = exam === 'ielts';
  const [mode, setMode] = useState<'mini' | 'full'>('mini');
  const [part, setPart] = useState(5);
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  // Đáp án lưu theo id câu (làm theo thứ tự bất kỳ, đổi thoải mái trước
  // khi nộp — thi thử KHÔNG chấm ngay từng câu).
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const submittedRef = useRef(false);
  // Audio cấp Part (Part 1–4): fallback khi câu/đoạn chưa có audio riêng.
  const [partMedia, setPartMedia] = useState<Record<number, string>>({});
  // IELTS thi thử: các Section đã phát audio (mỗi Section chỉ phát 1 lần).
  const [playedSections, setPlayedSections] = useState<Record<number, boolean>>({});
  const markPlayed = (p: number) => setPlayedSections(m => ({ ...m, [p]: true }));

  // IELTS full: 80 câu, 90 phút. Mini IELTS: 1 Section Listening 30 phút,
  // 1 Passage Reading 20 phút (contract chỉ quy định full = 90 phút).
  const fullMinutes = isIelts ? 90 : 120;
  const miniMinutes = isIelts ? (part <= 4 ? 30 : 20) : 120;

  const start = async () => {
    setBusy(true); setError(null);
    try {
      // Tải audio cấp Part trước khi bắt đầu để câu đầu tiên đã có audio.
      // Lỗi (backend chưa có endpoint) thì bỏ qua, fallback về {}.
      try { setPartMedia(testSetId ? await api.partMedia(testSetId) : {}); } catch { setPartMedia({}); }
      const t = testSetId
        ? await api.createTest('full', undefined, fullMinutes, testSetId, exam)
        : await api.createTest(mode, mode === 'mini' ? part : undefined, mode === 'mini' ? miniMinutes : fullMinutes, undefined, exam);
      setAttemptId(t.attemptId);
      setSecondsLeft(t.durationSec || fullMinutes * 60);
      const qs: Question[] = [];
      for (const id of t.questionIds) {
        try { qs.push(await api.question(id)); } catch { /* skip missing */ }
      }
      setQuestions(qs);
      setAnswers({});
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const submit = async () => {
    if (!attemptId || submittedRef.current) return;
    submittedRef.current = true;
    stopSpeak();
    try { await api.submitTest(attemptId); nav(`/result/${attemptId}`); }
    catch (e) { submittedRef.current = false; setError(e); }
  };

  useEffect(() => {
    if (testSetId) api.testSet(testSetId).then(setTestSet).catch(setError);
  }, [testSetId]);

  useEffect(() => {
    if (!attemptId || secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearInterval(t);
  }, [attemptId, secondsLeft > 0]);

  useEffect(() => {
    if (attemptId && secondsLeft <= 0 && !submittedRef.current) submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, attemptId]);

  useEffect(() => () => stopSpeak(), []);

  // Ghi lần chọn cuối (đổi đáp án thoải mái trước khi nộp).
  const setAnswer = (q: Question, value: string) => {
    if (!q || !attemptId) return;
    setAnswers(a => ({ ...a, [q.id]: value }));
  };
  const saveAnswer = async (q: Question, value: string) => {
    if (!q || !attemptId) return;
    try { await api.saveTestAnswer(attemptId, q.id, value); } catch (e) { setError(e); }
  };
  const choose = async (q: Question, label: string) => {
    setAnswer(q, label);
    await saveAnswer(q, label);
  };

  if (!attemptId) {
    if (testSetId) {
      return (
        <div className="card">
          <h1>Thi thử cả đề</h1>
          <ErrorBox error={error} />
          {testSet ? (
            <div>
              <p><strong>{testSet.title}</strong></p>
              {testSet.description && <p className="muted">{testSet.description}</p>}
              <p><span className="stat-num">{testSet.totalQuestions}</span> câu • {fullMinutes} phút</p>
              <p className="muted">{testSet.parts.map(p => `${partLabel(p.part, exam)} ${p.count}`).join(' · ')}</p>
              {testSet.missing.length > 0 && (
                <p style={{ color: 'var(--amber)' }}>⚠ Đề chưa đủ câu chuẩn: {testSet.missing.map(m => `${partLabel(m.part, exam)} thiếu ${m.missing} câu`).join(', ')}.</p>
              )}
            </div>
          ) : <p>Đang tải thông tin đề thi…</p>}
          <p className="muted">Làm đủ {testSet?.totalQuestions || ''} câu, hết giờ tự nộp. Đáp án được lưu tự động sau mỗi câu. {isIelts ? <>Band thi thử là <strong>band ước lượng để tham khảo</strong> (thang 0–9).</> : <>Điểm thi thử là <strong>điểm ước lượng</strong> (thang 10–990).</>}</p>
          {isIelts && <p className="muted">🎧 Thi thử: audio mỗi Section chỉ phát 1 lần — bấm nghe khi đã sẵn sàng làm các câu của Section đó.</p>}
          <div className="btn-row">
            <button className="btn gold" disabled={busy || !testSet || !testSet.totalQuestions} onClick={start}>{busy ? 'Đang tạo đề…' : 'Bắt đầu thi'}</button>
          </div>
        </div>
      );
    }
    return (
      <div className="card">
        <h1>Thi thử</h1>
        <ErrorBox error={error} />
        <label>Loại bài thi</label>
        <select value={mode} onChange={e => setMode(e.target.value as 'mini' | 'full')}>
          <option value="mini">{isIelts ? 'Thi mini — 1 Section/Passage' : 'Thi mini — 1 Part'}</option>
          <option value="full">{isIelts ? 'Thi full — Listening + Reading (80 câu, 90 phút)' : 'Thi full — toàn bộ ngân hàng, 120 phút'}</option>
        </select>
        {mode === 'mini' && (<><label>{isIelts ? 'Chọn Section/Passage' : 'Chọn Part'}</label><select value={part} onChange={e => setPart(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6, 7].map(p => <option key={p} value={p}>{isIelts ? `${partNameFor(p, exam)} — ${p <= 4 ? 'Listening' : 'Reading'}` : partName(p)}</option>)}</select></>)}
        <p className="muted">Thi full: làm đủ {fullMinutes} phút, hết giờ tự nộp. Đáp án được lưu tự động sau mỗi câu. {isIelts ? <>Band thi thử là <strong>band ước lượng để tham khảo</strong> (thang 0–9). Bài mini chỉ báo số câu đúng/tổng, không có band.</> : <>Điểm thi thử là <strong>điểm ước lượng</strong> (thang 10–990). Bài mini chỉ báo số câu đúng/tổng, không có điểm 10–990.</>}</p>
        {isIelts && <p className="muted">🎧 Thi thử: audio mỗi Section chỉ phát 1 lần — bấm nghe khi đã sẵn sàng làm các câu của Section đó.</p>}
        <div className="btn-row"><button className="btn" disabled={busy} onClick={start}>{busy ? 'Đang tạo đề…' : 'Bắt đầu thi'}</button></div>
      </div>
    );
  }

  if (!questions.length) return <p>Đang tải đề thi…</p>;
  const answeredCount = Object.keys(answers).length;

  // Câu chỉ-nghe (Part 1/2 TOEIC): toàn bộ phương án đều rỗng nội dung
  // (chỉ có nhãn) — người học chỉ nghe audio rồi chọn chữ cái.
  const isListeningOnly = (q: Question) =>
    exam === 'toeic' &&
    (q.part === 1 || q.part === 2) &&
    q.options.length > 0 &&
    q.options.every(o => !o.content || !o.content.trim());

  // Nhóm các câu liên tiếp cùng 1 đoạn văn (Part 3/4/6/7) để đoạn chỉ hiện
  // 1 lần, các câu hỏi của đoạn nối tiếp ngay bên dưới — như tờ đề thi thật.
  // Số thứ tự n đếm liên tiếp theo thứ tự câu trong bài thi. Mỗi khối cũng
  // ghi lại Part để hiện tiêu đề Part khi chuyển sang Part mới (thi full).
  type Block = { key: string; part: number; passageText?: string; questions: { q: Question; n: number }[] };
  const blocks: Block[] = [];
  questions.forEach((q, i) => {
    const last = blocks[blocks.length - 1];
    const sameId = !!q.passageId && !!last && last.questions[0]?.q.passageId === q.passageId;
    const sameText = !!q.passageText && !!last && last.passageText === q.passageText;
    if ((sameId || sameText) && last) last.questions.push({ q, n: i + 1 });
    else blocks.push({ key: q.id, part: q.part, passageText: q.passageText, questions: [{ q, n: i + 1 }] });
  });

  // 1 nút nghe DUY NHẤT cho cả Part: chỉ khi thi trong 1 bộ đề (có
  // testSetId) VÀ đề đó có file audio cấp Part. Đề chưa có audio Part
  // (hoặc thi mini/full không kèm đề) thì giữ nút nghe từng câu như cũ.
  const usePartAudioFor = (p: number) => p <= 4 && !!testSetId && !!partMedia[p];

  const renderQuestion = ({ q, n }: { q: Question; n: number }) => {
    const listeningOnly = isListeningOnly(q);
    // Part 1/2 thi that (TOEIC): trong bai thi chi hien tranh (Part 1) +
    // audio + nut A/B/C/D, KHONG hien chu cau hoi/phuong an trong SUOT bai
    // thi (xem lai o trang On cau sai sau khi nop bai) — KHONG hien lai chu
    // sau khi chon dap an nhu man Luyen tap.
    const hideListeningText = exam === 'toeic' && (q.part === 1 || q.part === 2);
    const letterOnly = listeningOnly || hideListeningText;
    const qType = q.questionType || 'multiple_choice';
    const isIeltsSpecial = isIelts && qType !== 'multiple_choice';
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
          {q.part <= 4 && !usePartAudioFor(q.part) && (exam === 'toeic' || q.audioUrl || partMedia[q.part]) && (
            <ListeningAudio
              // Ưu tiên: audio câu hỏi → audio đoạn văn đã gộp sẵn trong
              // q.audioUrl → audio cấp Part. Không có audio nào thì TTS như cũ.
              // Khi đề có file audio cấp Part thì KHÔNG render hộp này nữa —
              // cả Part chỉ còn 1 nút nghe duy nhất ở đầu Part (ngay dưới
              // tiêu đề Part trong tờ đề). IELTS: chỉ render khi có file
              // audio thật, không dùng TTS đọc transcript; thi thử thì mỗi
              // audio chỉ phát 1 lần.
              audioUrl={q.audioUrl || partMedia[q.part]}
              ttsText={ttsTextFor(q)}
              stopKey={q.id}
              onError={setError}
              playOnce={isIelts}
              onFirstPlay={() => markPlayed(q.part)}
            />
          )}
          {!hideListeningText && q.content ? <p><strong>{q.content}</strong></p> : null}
        </div>
        <div className="exam-q-side">
          <div className="exam-q-num">{n}.</div>
          {isIeltsSpecial ? (
            <IeltsAnswerControl
              q={q}
              value={answers[q.id] ?? ''}
              onChange={v => setAnswer(q, v)}
              onCommit={v => void saveAnswer(q, v)}
            />
          ) : (
            <div className="exam-opts">
              {q.options.map(o => (
                <button
                  key={o.label}
                  className={`option ${answers[q.id] === o.label ? 'selected' : ''}`}
                  onClick={() => void choose(q, o.label)}
                >
                  {letterOnly ? <strong>{o.label}</strong> : <><strong>{o.label}</strong> {o.content}</>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="exam-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: '.8rem', flexWrap: 'wrap', minWidth: 0 }}>
          <h2 className="exam-part">{testSet ? testSet.title : 'Thi thử'}</h2>
          <span className={`timer ${secondsLeft < 300 ? 'low' : ''}`}>⏱ {fmt(secondsLeft)}</span>
        </div>
        <span className="progress-badge">Đã trả lời {answeredCount}/{questions.length}</span>
      </div>
      <ErrorBox error={error} />
      <div className="paper">
        {blocks.map((block, bi) => {
          const showPart = bi === 0 || blocks[bi - 1].part !== block.part;
          return (
            <div key={block.key}>
              {showPart && <h3 className="paper-part">{isIelts ? partNameFor(block.part, exam) : partName(block.part)}</h3>}
              {showPart && usePartAudioFor(block.part) && (
                <div className="part-audio">
                  <ListeningAudio
                    audioUrl={partMedia[block.part]} ttsText="" stopKey={`part-${block.part}`} onError={setError}
                    playOnce={isIelts} onFirstPlay={() => markPlayed(block.part)}
                  />
                  <p className="muted">🎧 Nghe cả {isIelts ? `Section ${block.part}` : `Part ${block.part}`} — {isIelts ? 'thi thử: audio mỗi Section chỉ phát 1 lần, bấm 1 lần rồi làm hết các câu của Section trong lúc nghe.' : 'bấm 1 lần rồi làm hết các câu của Part trong lúc nghe.'}</p>
                  {isIelts && playedSections[block.part] && <p className="muted">✓ Đã phát Section này (thi thử chỉ phát 1 lần).</p>}
                </div>
              )}
              {showPart && isIelts && block.part <= 4 && !partMedia[block.part]
                && !questions.some(q => q.part === block.part && q.audioUrl) && (
                <p className="muted">📌 Bộ đề mẫu chưa có audio — bạn vẫn làm bài bình thường.</p>
              )}
              {block.passageText ? (
                <div className="paper-cluster">
                  <div className="passage">{block.passageText}</div>
                  {block.questions.map(item => renderQuestion(item))}
                </div>
              ) : (
                block.questions.map(item => renderQuestion(item))
              )}
            </div>
          );
        })}
      </div>
      <div className="practice-bar">
        <span className="progress">Đã trả lời {answeredCount}/{questions.length}</span>
        <button className="btn btn-sm" onClick={() => void submit()}>Nộp bài</button>
      </div>
      <p className="muted" style={{ margin: '.45rem 0 0' }}>Nộp bài chỉ 1 lần. Hết giờ hệ thống tự nộp.</p>
    </div>
  );
}
