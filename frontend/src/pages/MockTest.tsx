import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Question, type TestSet } from '../api';
import { ErrorBox, ListeningAudio, PassageWithBlanks, QuestionPalette, QuestionText, partName, type BlankState, type PaletteItemState } from '../components';
import { WordText } from '../wordLookup';
import { partLabel, partNameFor, realQuestionNumber, stripLeadingNumber, useExam, useTextSize } from '../exam';
import { IeltsAnswerControl, IeltsMatchingBoard, IeltsNotesBlock, FlagButton, splitGroupSegments } from '../ielts-ui';
import { stopSpeak, ttsTextFor } from '../tts';
import { LoadingLine, useUiSettings } from '../uiSettings';

function fmt(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function MockTest() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const testSetId = params.get('testSetId') || undefined;
  const { exam: ctxExam } = useExam();
  const { settings } = useUiSettings();
  // Cỡ chữ thi thử (A- / A+), lưu localStorage.
  const { level: textLevel } = useTextSize();
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
  // Nút Thoát: bấm lần 1 để xác nhận, lần 2 mới thoát thật.
  const [confirmExit, setConfirmExit] = useState(false);
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
  // Phòng nghe kiểu YouPass: câu được đánh dấu + câu đang làm (chỉ lưu
  // trong phiên thi, để highlight trên thanh số câu).
  const [flaggedById, setFlaggedById] = useState<Record<string, boolean>>({});
  const [currentId, setCurrentId] = useState<string | null>(null);
  const toggleFlag = (q: Question) => setFlaggedById(m => ({ ...m, [q.id]: !m[q.id] }));

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
      // Mini khong kem de: backend chon ngau nhien 1 de va tra ve testSetId
      // cua de do — tai audio theo de duoc chon de nghe dung file audio.
      if (t.testSetId && t.testSetId !== testSetId) {
        try { setPartMedia(await api.partMedia(t.testSetId)); } catch { /* giu {} */ }
      }
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

  // Danh sách đề để chọn ở màn hình Thi thử (khi mở /mock trực tiếp,
  // chưa có testSetId trên URL).
  const [testSets, setTestSets] = useState<TestSet[]>([]);
  useEffect(() => {
    if (!testSetId) api.testSets(exam).then(setTestSets).catch(() => undefined);
  }, [exam, testSetId]);

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

  // IELTS-only: thanh số câu theo dõi câu đang nhìn thấy (scroll-spy) —
  // lúc mở bài và khi cuộn, số của câu trong vùng nhìn sẽ sáng lên.
  // Trước đây currentId chỉ đổi khi bấm/chọn đáp án nên lúc mới mở không
  // có số nào sáng. Mỗi đơn vị câu đều mang id `q-<id>` (câu lẻ, dòng
  // ghi chú, hàng matching) nên quan sát chung 1 selector được.
  // (Đặt trước các early return để không vi phạm thứ tự hook.)
  useEffect(() => {
    if (!isIelts || questions.length === 0) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>('[id^="q-"]'));
    if (els.length === 0) return;
    const obs = new IntersectionObserver(entries => {
      const visible = entries.filter(e => e.isIntersecting);
      if (visible.length === 0) return;
      visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      setCurrentId(visible[0].target.id.slice(2));
    }, { rootMargin: '-20% 0px -70% 0px', threshold: 0 });
    els.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [isIelts, questions]);

  // Ghi lần chọn cuối (đổi đáp án thoải mái trước khi nộp) + ghi nhận
  // câu đang làm để highlight trên thanh số câu.
  const setAnswer = (q: Question, value: string) => {
    if (!q || !attemptId) return;
    setAnswers(a => ({ ...a, [q.id]: value }));
    setCurrentId(q.id);
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
        <div className="card card--narrow">
          <h1>Thi thử cả đề</h1>
          <ErrorBox error={error} />
          {testSet ? (
            <div>
              <p><strong>{testSet.title}</strong></p>
              {testSet.description && <p className="muted">{testSet.description}</p>}
              <p><span className="stat-num">{testSet.totalQuestions}</span> câu • {fullMinutes} phút</p>
              <p className="muted">{testSet.parts.map(p => `${partLabel(p.part, exam)} ${p.count}`).join(' · ')}</p>
              {testSet.missing.length > 0 && (
                <p style={{ color: 'var(--amber)' }}>⚠️ Đề chưa đủ câu chuẩn: {testSet.missing.map(m => `${partLabel(m.part, exam)} thiếu ${m.missing} câu`).join(', ')}.</p>
              )}
            </div>
          ) : <LoadingLine effect={settings.ui.loading.page} speed={settings.ui.loading.speed} text="Đang tải thông tin đề thi…" />}
          <p className="muted">Làm đủ {testSet?.totalQuestions || ''} câu, hết giờ tự nộp. Đáp án được lưu tự động sau mỗi câu. {isIelts ? <>Band thi thử là <strong>band ước lượng để tham khảo</strong> (thang 0–9).</> : <>Điểm thi thử là <strong>điểm ước lượng</strong> (thang 10–990).</>}</p>
          {isIelts && <p className="muted">🎧 Thi thử: audio mỗi Section chỉ phát 1 lần — bấm nghe khi đã sẵn sàng làm các câu của Section đó.</p>}
          <div className="btn-row">
            <button className="btn gold" disabled={busy || !testSet || !testSet.totalQuestions} onClick={start}>{busy ? 'Đang tạo đề…' : 'Bắt đầu thi'}</button>
          </div>
        </div>
      );
    }
    return (
      <div className="card card--narrow">
        <h1>Thi thử</h1>
        <ErrorBox error={error} />
        <label>Loại bài thi</label>
        <select value={mode} onChange={e => setMode(e.target.value as 'mini' | 'full')}>
          <option value="mini">{isIelts ? 'Thi mini — 1 Section/Passage' : 'Thi mini — 1 Part'}</option>
          <option value="full">{isIelts ? 'Thi full — Listening + Reading (80 câu, 90 phút)' : 'Thi full — toàn bộ ngân hàng, 120 phút'}</option>
        </select>
        {mode === 'mini' && (<><label>{isIelts ? 'Chọn Section/Passage' : 'Chọn Part'}</label><select value={part} onChange={e => setPart(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6, 7].map(p => <option key={p} value={p}>{isIelts ? `${partNameFor(p, exam)} — ${p <= 4 ? 'Listening' : 'Reading'}` : partName(p)}</option>)}</select></>)}
        {mode === 'full' && (<><label>Chọn đề thi</label><select value="" onChange={e => { const id = e.target.value; if (id) nav(`/mock?testSetId=${id}&exam=${exam}`); }}><option value="">Toàn bộ ngân hàng</option>{testSets.map(s => <option key={s.id} value={s.id}>{s.title} ({s.totalQuestions} câu)</option>)}</select><p className="muted">Chọn một đề để thi thử cả đề đó; để nguyên "Toàn bộ ngân hàng" để thi từ tất cả các đề.</p></>)}
        <p className="muted">Thi full: làm đủ {fullMinutes} phút, hết giờ tự nộp. Đáp án được lưu tự động sau mỗi câu. {isIelts ? <>Band thi thử là <strong>band ước lượng để tham khảo</strong> (thang 0–9). Bài mini chỉ báo số câu đúng/tổng, không có band.</> : <>Điểm thi thử là <strong>điểm ước lượng</strong> (thang 10–990). Bài mini chỉ báo số câu đúng/tổng, không có điểm 10–990.</>}</p>
        {isIelts && <p className="muted">🎧 Thi thử: audio mỗi Section chỉ phát 1 lần — bấm nghe khi đã sẵn sàng làm các câu của Section đó.</p>}
        <div className="btn-row"><button className="btn" disabled={busy} onClick={start}>{busy ? 'Đang tạo đề…' : 'Bắt đầu thi'}</button></div>
      </div>
    );
  }

  if (!questions.length) return <LoadingLine effect={settings.ui.loading.page} speed={settings.ui.loading.speed} text="Đang tải đề thi…" />;
  const answeredCount = Object.keys(answers).length;

  // Câu chỉ-nghe (Part 1/2 TOEIC): toàn bộ phương án đều rỗng nội dung
  // (chỉ có nhãn) — người học chỉ nghe audio rồi chọn chữ cái.
  const isListeningOnly = (q: Question) =>
    exam === 'toeic' &&
    (q.part === 1 || q.part === 2) &&
    q.options.length > 0 &&
    q.options.every(o => !o.content || !o.content.trim());

  // Câu Reading trắc nghiệm: xếp 2 câu 1 hàng (lưới 2 cột), đáp án 1 dọc.
  const isDuoQuestion = (q: Question) => {
    const t = q.questionType || 'multiple_choice';
    return q.part >= 5 && (t === 'multiple_choice' || t === 'choosing_title') && !isListeningOnly(q);
  };

  // Nhóm các câu liên tiếp cùng 1 đoạn văn (Part 3/4/6/7) để đoạn chỉ hiện
  // 1 lần, các câu hỏi của đoạn nối tiếp ngay bên dưới — như tờ đề thi thật.
  // Số thứ tự n là SỐ THẬT trong đề (mốc đầu Part + vị trí trong Part).
  // Mỗi khối cũng ghi lại Part để hiện tiêu đề Part khi chuyển sang Part
  // mới (thi full).
  type Block = { key: string; part: number; passageText?: string; questions: { q: Question; n: number }[] };
  const blocks: Block[] = [];
  const partCount: Record<number, number> = {};
  questions.forEach((q) => {
    const idx = (partCount[q.part] ?? 0) + 1;
    partCount[q.part] = idx;
    const n = realQuestionNumber(exam, q.part, idx);
    const last = blocks[blocks.length - 1];
    const sameId = !!q.passageId && !!last && last.questions[0]?.q.passageId === q.passageId;
    const sameText = !!q.passageText && !!last && last.passageText === q.passageText;
    if ((sameId || sameText) && last) last.questions.push({ q, n });
    else blocks.push({ key: q.id, part: q.part, passageText: q.passageText, questions: [{ q, n }] });
  });

  // 1 nút nghe DUY NHẤT cho cả Part: chỉ khi thi trong 1 bộ đề (có
  // testSetId) VÀ đề đó có file audio cấp Part. Đề chưa có audio Part
  // (hoặc thi mini/full không kèm đề) thì giữ nút nghe từng câu như cũ.
  const usePartAudioFor = (p: number) => p <= 4 && !!testSetId && !!partMedia[p];

  // IELTS-only: thanh số câu (kiểu YouPass) — bấm số để nhảy tới câu đó.
  // Thi thử chưa chấm nên chỉ phân biệt đã trả lời / chưa trả lời.
  // Nhóm theo Section/Passage + dấu câu đã đánh dấu + câu đang làm.
  const paletteItems = blocks.flatMap(b => b.questions.map(({ q, n }) => {
    const state: PaletteItemState = answers[q.id] ? 'done' : 'todo';
    return { n, id: q.id, state, group: partLabel(q.part, exam), flagged: !!flaggedById[q.id] };
  }));
  const jumpToQuestion = (id: string) => {
    setCurrentId(id);
    document.getElementById(`q-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // IELTS-only: chuyển Section/Passage trước/sau (kiểu YouPass) — chỉ
  // hiện khi bài thi có nhiều hơn 1 Section/Passage (thi full).
  const partOrder = [...new Set(blocks.map(b => b.part))];
  const currentPart = currentId ? (questions.find(q => q.id === currentId)?.part ?? partOrder[0]) : partOrder[0];
  const currentPartIdx = partOrder.indexOf(currentPart);
  const jumpToPart = (p: number) => {
    const first = blocks.find(b => b.part === p)?.questions[0];
    if (first) jumpToQuestion(first.q.id);
  };

  // Render các câu trong 1 khối: khối IELTS thì chia thành các đoạn
  // (khối ghi chú inline — chỉ Listening — / bảng matching — cả Listening
  // lẫn Reading, xếp dọc ở Reading vì cột phải hẹp — / câu lẻ); TOEIC
  // render từng câu như cũ. Thi thử không có dải chấm (không chấm từng câu).
  const renderBlockQuestions = (block: Block) => {
    if (!isIelts) return block.questions.map(item => renderQuestion(item));
    return splitGroupSegments(block.questions).map((seg, si) => {
      if (seg.kind === 'single') return renderQuestion(seg.item);
      const groupProps = {
        items: seg.items,
        valueOf: (q: Question) => answers[q.id] ?? '',
        onChange: (q: Question, v: string) => setAnswer(q, v),
        onCommit: (q: Question, v: string) => void saveAnswer(q, v),
        flaggedById,
        onToggleFlag: toggleFlag,
        onFocusQuestion: (q: Question) => setCurrentId(q.id),
      };
      return (
        <div key={`${block.key}-seg-${si}`}>
          {seg.kind === 'notes' ? <IeltsNotesBlock {...groupProps} /> : <IeltsMatchingBoard {...groupProps} layout={block.part >= 5 ? 'stacked' : 'side'} />}
        </div>
      );
    });
  };

  const renderQuestion = ({ q, n }: { q: Question; n: number }) => {
    const listeningOnly = isListeningOnly(q);
    // Part 1/2 thi that (TOEIC): trong bai thi chi hien tranh (Part 1) +
    // audio + nut A/B/C/D, KHONG hien chu cau hoi/phuong an trong SUOT bai
    // thi (xem lai o trang On cau sai sau khi nop bai) — KHONG hien lai chu
    // sau khi chon dap an nhu man Luyen tap.
    const hideListeningText = exam === 'toeic' && (q.part === 1 || q.part === 2);
    const letterOnly = listeningOnly || hideListeningText;
    const qType = q.questionType || 'multiple_choice';
    // choosing_title dùng lại nút .option như multiple_choice (không đặc
    // biệt); các dạng IELTS còn lại (kể cả list_selection, 4 dạng điền mới,
    // matching_sentence_endings) dùng IeltsAnswerControl.
    const isIeltsSpecial = isIelts && qType !== 'multiple_choice' && qType !== 'choosing_title';
    // Part 6 (TOEIC): câu hỏi chỉ còn số + phương án — câu chứa chỗ trống
    // đã nằm trong đoạn văn phía trên (chip số), không hiện lại gây lặp.
    const isP6 = exam === 'toeic' && q.part === 6;
    // Reading trắc nghiệm: 2 câu 1 hàng, đáp án 1 dọc.
    const isDuo = isDuoQuestion(q);
    return (
      <div id={`q-${q.id}`} className={`paper-q exam-q${isIeltsSpecial ? ' exam-q--ielts' : ''}${isDuo ? ' exam-q--duo' : ''}`} key={q.id}>
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
          {/* Số câu gắn ngay đầu chữ câu hỏi (căn thẳng hàng với câu hỏi),
              thay vì nằm riêng ở cột phải như trước. Part 6 không hiện
              chữ câu hỏi (câu chứa chỗ trống đã nằm trong đoạn văn trên).
              Nội dung gốc đôi khi đã có số ở đầu ("147. Where...") thì
              bỏ đi để khỏi lặp. IELTS: chữ thường, chỉ chỗ trống in đậm
              (đỡ nặng mắt); TOEIC giữ in đậm như cũ. */}
          {!hideListeningText && !isP6 && q.content ? (
            <p><span className="exam-q-num">{n}.</span>{isIelts ? <QuestionText text={stripLeadingNumber(q.content, n)} /> : <strong>{stripLeadingNumber(q.content, n)}</strong>}</p>
          ) : null}
        </div>
        <div className="exam-q-side">
          {/* IELTS-only: đánh dấu câu để xem lại sau (hiện trên thanh số câu). */}
          {isIelts && <FlagButton flagged={!!flaggedById[q.id]} onToggle={() => toggleFlag(q)} label={`Đánh dấu câu ${n}`} />}
          {/* Chỉ-nghe (P1/P2) và Part 6 không có chữ câu hỏi: số câu nằm
              trên phương án như phiếu trả lời. */}
          {!isIeltsSpecial && (letterOnly || isP6) && <div className="exam-q-num">{n}.</div>}
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

  // Đoạn văn Part 6: chỗ trống thành chip số (bấm để tới câu hỏi).
  // Đoạn văn ĐỌC (TOEIC P6/P7, IELTS Reading): từ bấm được để tra từ.
  const renderPassage = (block: Block) => {
    const part = block.questions[0]?.q.part ?? 0;
    const isReading = exam === 'toeic' ? part >= 6 : part >= 5;
    const isP6Block = exam === 'toeic' && part === 6;
    if (!isP6Block || !block.passageText) return <div className="passage">{block.passageText && isReading ? <WordText text={block.passageText} /> : block.passageText}</div>;
    const blanks: Record<number, BlankState> = {};
    const idByNum: Record<number, string> = {};
    for (const { q, n } of block.questions) {
      idByNum[n] = q.id;
      const sel = answers[q.id] ?? '';
      if (sel) blanks[n] = { selected: sel };
    }
    return (
      <div className="passage">
        <PassageWithBlanks
          text={block.passageText}
          blanks={blanks}
          onBlankClick={num => document.getElementById(`q-${idByNum[num]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          renderText={(t) => <WordText text={t} />}
        />
      </div>
    );
  };

  // Thoát khỏi bài thi khi không làm nữa: dừng audio, hủy attempt chưa nộp
  // (không tính kết quả, không lọt vào lịch sử), rồi về trang chủ.
  const exitTest = async () => {
    if (!confirmExit) { setConfirmExit(true); return; }
    stopSpeak();
    if (attemptId) { try { await api.abandonTest(attemptId); } catch { /* vẫn thoát */ } }
    nav('/');
  };

  // Tờ đề: câu Reading trắc nghiệm xếp 2 câu 1 hàng (lưới 2 cột); các khối
  // liên tiếp không có đoạn văn (Part 5) gom chung 1 lưới; khối có đoạn văn
  // (Part 6/7) thì lưới nằm trong cụm đoạn văn. Tiêu đề Part vẫn hiện khi
  // chuyển Part. IELTS Reading: khối có đoạn văn thì chia đôi màn hình
  // (đoạn văn trái, câu hỏi phải — xem .paper-cluster--split trong CSS).
  const renderPaper = () => {
    const out: React.ReactNode[] = [];
    let duoRun: { q: Question; n: number }[] = [];
    const flushDuo = (key: string) => {
      if (!duoRun.length) return;
      out.push(<div className="exam-q-grid2" key={key}>{duoRun.map(item => renderQuestion(item))}</div>);
      duoRun = [];
    };
    blocks.forEach((block, bi) => {
      const showPart = bi === 0 || blocks[bi - 1].part !== block.part;
      const split = isIelts && block.part >= 5 && !!block.passageText;
      const duoBlock = !block.passageText && block.questions.every(({ q }) => isDuoQuestion(q));
      if (duoBlock) {
        if (showPart) {
          flushDuo(`duo-${block.key}`);
          out.push(<div key={`ph-${block.key}`}><h3 className="paper-part">{isIelts ? partNameFor(block.part, exam) : partName(block.part)}</h3></div>);
        }
        duoRun.push(...block.questions);
        return;
      }
      flushDuo(`duo-${block.key}`);
      out.push(
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
            <div className={`paper-cluster${split ? ' paper-cluster--split' : ''}`}>
              {renderPassage(block)}
              {split ? (
                <div>{renderBlockQuestions(block)}</div>
              ) : block.questions.every(({ q }) => isDuoQuestion(q)) ? (
                <div className="exam-q-grid2">{block.questions.map(item => renderQuestion(item))}</div>
              ) : (
                renderBlockQuestions(block)
              )}
            </div>
          ) : (
            renderBlockQuestions(block)
          )}
        </div>
      );
    });
    flushDuo('duo-last');
    return out;
  };

  return (
    <div className={`ts-${textLevel} exam-room exam-room--sidelayout`}>
      <div className="exam-main">
        <div className="exam-head">
          <h2 className="exam-part">{testSet ? testSet.title : 'Thi thử'}</h2>
        </div>
        {/* Đồng hồ nổi (phương án 3): thanh đầu trang không dính nữa, đồng hồ
            đếm ngược tách thành chip cố định góc phải, luôn thấy được khi
            cuộn (hết giờ là tự nộp bài nên không được để mất đồng hồ). */}
        <span className={`timer-chip${secondsLeft < 300 ? ' low' : ''}`} title="Thời gian còn lại">⏱️ {fmt(secondsLeft)}</span>
        <ErrorBox error={error} />
        <div className="paper">
          {renderPaper()}
        </div>
        <div className="practice-bar">
          {isIelts && <QuestionPalette items={paletteItems} onJump={jumpToQuestion} currentId={currentId} />}
          {isIelts && partOrder.length > 1 && (
            <span className="btn-row" style={{ margin: 0 }}>
              <button className="btn btn-sm secondary" disabled={currentPartIdx <= 0}
                onClick={() => jumpToPart(partOrder[currentPartIdx - 1])}>← {currentPartIdx > 0 ? partLabel(partOrder[currentPartIdx - 1], exam) : ''}</button>
              <button className="btn btn-sm secondary" disabled={currentPartIdx < 0 || currentPartIdx >= partOrder.length - 1}
                onClick={() => jumpToPart(partOrder[currentPartIdx + 1])}>{currentPartIdx < partOrder.length - 1 ? partLabel(partOrder[currentPartIdx + 1], exam) : ''} →</button>
            </span>
          )}
          <span className="progress">Đã trả lời {answeredCount}/{questions.length}</span>
          <span className="btn-row" style={{ margin: 0 }}>
            <button className="btn secondary btn-sm" title="Thoát khỏi bài thi — bài làm sẽ không được chấm và không lưu kết quả"
              onClick={() => void exitTest()}>{confirmExit ? '⚠️ Bấm lại để thoát' : '← Thoát'}</button>
            <button className="btn btn-sm" onClick={() => void submit()}>Nộp bài</button>
          </span>
        </div>
        <p className="muted" style={{ margin: '.45rem 0 0' }}>Nộp bài chỉ 1 lần. Hết giờ hệ thống tự nộp.</p>
      </div>
      {/* Cot phai (phuong an A): man hinh rong (>=1100px) thi bang cau hoi
          + tien do + nut bam nam o day, thanh duoi an di; man hinh hep
          thi cot nay an, thanh duoi hien nhu cu. */}
      <aside className="room-side">
        {isIelts && (
          <div className="room-side-block">
            <h3 className="room-side-title">Câu hỏi</h3>
            <QuestionPalette variant="side" items={paletteItems} onJump={jumpToQuestion} currentId={currentId} />
          </div>
        )}
        <div className="room-side-block room-side-actions">
          {isIelts && partOrder.length > 1 && (
            <span className="btn-row" style={{ margin: 0 }}>
              <button className="btn btn-sm secondary" disabled={currentPartIdx <= 0}
                onClick={() => jumpToPart(partOrder[currentPartIdx - 1])}>← {currentPartIdx > 0 ? partLabel(partOrder[currentPartIdx - 1], exam) : ''}</button>
              <button className="btn btn-sm secondary" disabled={currentPartIdx < 0 || currentPartIdx >= partOrder.length - 1}
                onClick={() => jumpToPart(partOrder[currentPartIdx + 1])}>{currentPartIdx < partOrder.length - 1 ? partLabel(partOrder[currentPartIdx + 1], exam) : ''} →</button>
            </span>
          )}
          <span className="progress">Đã trả lời {answeredCount}/{questions.length}</span>
          <span className="btn-row" style={{ margin: 0 }}>
            <button className="btn secondary btn-sm" title="Thoát khỏi bài thi — bài làm sẽ không được chấm và không lưu kết quả"
              onClick={() => void exitTest()}>{confirmExit ? '⚠️ Bấm lại để thoát' : '← Thoát'}</button>
            <button className="btn btn-sm" onClick={() => void submit()}>Nộp bài</button>
          </span>
        </div>
      </aside>
    </div>
  );
}
