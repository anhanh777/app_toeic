// Luyện tập theo Part — dạng danh sách liền mạch như tờ đề thi:
// LUYỆN HẾT câu của Part (không giới hạn số lượng): toàn bộ câu của Part
// đó — trong 1 đề hoặc toàn ngân hàng — nằm trong 1 tờ giấy (.paper),
// các câu nối tiếp nhau bằng đường kẻ mảnh; mặc định chấm điểm theo
// từng câu ngay sau khi bấm "Nộp đáp án" của câu đó (giữ nguyên API
// practiceAnswer, XP, ghi câu sai), hoặc chọn "Làm xong mới chấm" ở đầu
// trang để làm hết rồi bấm "Nộp tất cả" chấm 1 lượt (câu chưa làm tính
// sai, không gọi API). Người học được làm các câu theo thứ tự bất kỳ. Part 1/2
// (TOEIC) vẫn ẨN chữ trước khi trả lời từng câu (đúng đề thi thật), chỉ
// hiện lại sau khi đã nộp đáp án.
// IELTS: Section N (Listening, part 1–4) / Passage N (Reading, part 5–7),
// đủ dạng câu hỏi (T/F/NG, Y/N/NG, matching, điền từ có giới hạn số từ).
import { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { LoadingLine, useUiSettings } from '../uiSettings';
import { api, type Question } from '../api';
import { ErrorBox, ListeningAudio, PassageWithBlanks, partName, type BlankState } from '../components';
import { WordText } from '../wordLookup';
import { isFillIn, isMultiAnswer, parseSelectedLabels, partLabel, realQuestionNumber, stripLeadingNumber, useExam, useTextSize, wordCount } from '../exam';
import { IeltsAnswerControl } from '../ielts-ui';
import { RootCausePicker, skillOfPart } from '../ielts-phase1';
import { stopSpeak, ttsTextFor } from '../tts';

type AnswerResult = { correct: boolean; correctLabel: string; correctText?: string; explanation?: string; transcript?: string; xpAwarded?: number };

export default function PracticeSession() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const part = Number(params.get('part') || 5);
  const { exam: ctxExam } = useExam();
  const { settings } = useUiSettings();
  const qExam = params.get('exam');
  const exam = qExam === 'ielts' || qExam === 'toeic' ? qExam : ctxExam ?? 'toeic';
  const isIelts = exam === 'ielts';
  // Luyện HẾT câu của Part (không giới hạn số lượng): lấy toàn bộ qua
  // phân trang. Tham số count cũ trên URL (nếu còn từ link cũ) được bỏ qua.
  const testSetId = params.get('testSetId') || undefined;
  const [testSetTitle, setTestSetTitle] = useState<string>('');
  const [questions, setQuestions] = useState<Question[]>([]);
  // Chọn đáp án + kết quả chấm lưu theo id câu (mỗi câu chấm độc lập).
  const [selectedById, setSelectedById] = useState<Record<string, string>>({});
  const [resultById, setResultById] = useState<Record<string, AnswerResult>>({});
  // IELTS-only: đánh dấu đoán mò + mã nguyên nhân gốc đã ghi (theo id câu).
  // Giải thích bị ẨN ở UI cho tới khi ghi xong nguyên nhân (xem renderQuestion).
  const [guessedById, setGuessedById] = useState<Record<string, boolean>>({});
  const [causeById, setCauseById] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState({ correct: 0, done: 0 });
  const [finished, setFinished] = useState(false);
  // Chế độ chấm: 'instant' (chấm từng câu ngay sau khi nộp, như trước)
  // hoặc 'submit-all' (làm hết rồi bấm "Nộp tất cả" mới chấm 1 lượt).
  // Mặc định instant; khóa chọn chế độ ngay khi đã chọn đáp án đầu tiên.
  const [gradingMode, setGradingMode] = useState<'instant' | 'submit-all'>('instant');
  // submit-all: true sau khi đã nộp cả bài (kể cả câu chưa làm — tính sai).
  const [submittedAll, setSubmittedAll] = useState(false);
  // Audio cấp Part (Part 1–4): fallback khi câu/đoạn chưa có audio riêng.
  // Tải thất bại (backend chưa có endpoint) thì bỏ qua, fallback về {}.
  const [partMedia, setPartMedia] = useState<Record<number, string>>({});
  // Đã tải xong part-media hay chưa — để quyết định "1 nút cả Part" hay
  // "nút từng câu" rồi mới render, tránh nhấp nháy đổi dạng giữa chừng.
  const [partMediaLoaded, setPartMediaLoaded] = useState(false);
  // Cỡ chữ luyện (A- / A+), lưu localStorage.
  const { level: textLevel } = useTextSize();

  useEffect(() => {
    setLoading(true);
    setPartMediaLoaded(false);
    // Đổi buổi luyện (part / đề / exam) thì reset chế độ chấm về mặc định.
    setGradingMode('instant');
    setSubmittedAll(false);
    if (testSetId) api.testSet(testSetId).then(t => setTestSetTitle(t.title)).catch(() => undefined);
    if (part <= 4) {
      (testSetId ? api.partMedia(testSetId) : Promise.resolve<Record<number, string>>({}))
        .then(setPartMedia)
        .catch(() => setPartMedia({}))
        .finally(() => setPartMediaLoaded(true));
    }
    api.questionsAll(part, testSetId, exam).then(setQuestions).catch(setError).finally(() => setLoading(false));
    return () => stopSpeak();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part, testSetId, exam]);

  const isListening = part <= 4;
  // 1 nút nghe DUY NHẤT cho cả Part: chỉ khi luyện trong 1 bộ đề (có
  // testSetId) VÀ đề đó có file audio cấp Part. Đề chưa có audio Part
  // (hoặc luyện theo Part không kèm đề) thì giữ nút nghe từng câu như cũ.
  const usePartAudio = isListening && !!testSetId && !!partMedia[part];
  // IELTS: đề chưa có audio (VD đề mẫu TS-024) — không render nút nghe hỏng,
  // chỉ hiện ghi chú và cho làm bài bình thường. Đề chẩn đoán TS-028 đã có
  // audio cấp Part. Cũng không dùng TTS đọc transcript cho IELTS (đọc trước
  // thì lộ nội dung bài nghe).
  const ieltsNoAudio = isIelts && isListening && partMediaLoaded
    && !partMedia[part] && !questions.some(q => q.audioUrl);

  // Câu chỉ-nghe (Part 1/2 TOEIC): toàn bộ phương án đều rỗng nội dung
  // (chỉ có nhãn) — người học chỉ nghe audio rồi chọn chữ cái.
  const isListeningOnly = (q: Question) =>
    exam === 'toeic' &&
    (q.part === 1 || q.part === 2) &&
    q.options.length > 0 &&
    q.options.every(o => !o.content || !o.content.trim());

  // Đếm số lần mỗi tiêu đề được chọn (matching_headings) để cảnh báo khi
  // 2 câu trong cùng 1 passage chọn trùng 1 tiêu đề.
  const headingCounts: Record<string, number> = {};
  questions.forEach(q => {
    if (q.questionType === 'matching_headings') {
      const v = selectedById[q.id];
      if (v) headingCounts[v] = (headingCounts[v] ?? 0) + 1;
    }
  });

  const submit = async (q: Question) => {
    const selected = selectedById[q.id];
    // Đã chấm rồi thì không chấm lại (nút cũng đã bị khóa, đây là chốt chặn).
    if (!selected || resultById[q.id]) return;
    // Câu điền từ: chặn ngay ở client khi vượt giới hạn số từ (backend
    // cũng trả 400 vuot_gioi_han_tu nếu lọt qua).
    if (isFillIn(q.questionType) && q.wordLimit != null && wordCount(selected) > q.wordLimit) {
      setError(new Error(`Quá giới hạn số từ cho câu này (tối đa ${q.wordLimit} từ). Hãy rút gọn đáp án rồi nộp lại.`));
      return;
    }
    try {
      const r = await api.practiceAnswer(q.id, selected);
      setResultById(m => ({ ...m, [q.id]: r }));
      setScore(s => ({ correct: s.correct + (r.correct ? 1 : 0), done: s.done + 1 }));
    } catch (e) { setError(e); }
  };

  // Số thật trong đề của 1 câu (để báo lỗi giới hạn từ đúng câu).
  const questionNumber = (target: Question) => {
    let idx = 0;
    for (const qq of questions) {
      if (qq.part === target.part) {
        idx += 1;
        if (qq.id === target.id) break;
      }
    }
    return realQuestionNumber(exam, target.part, idx);
  };

  // Nộp tất cả (chế độ 'submit-all'): chấm lần lượt từng câu đã làm theo
  // thứ tự trong đề; câu chưa làm KHÔNG gọi API (backend trả 400 với đáp
  // án MC rỗng) mà tính là sai. Lỗi giữa chừng thì dừng lại, các câu đã
  // chấm vẫn giữ kết quả, bấm lại để chấm nốt phần còn lại.
  const submitAll = async () => {
    if (submittedAll) return;
    const answered = questions.filter(q => selectedById[q.id]);
    if (!answered.length) return;
    const unanswered = questions.length - answered.length;
    if (unanswered > 0 && !window.confirm(`Còn ${unanswered} câu chưa làm, vẫn nộp?`)) return;
    // (a) Kiểm tra giới hạn số từ cho TẤT CẢ câu điền từ đã làm TRƯỚC
    // khi nộp câu nào — vượt thì báo lỗi (ghi rõ số câu) và dừng hẳn.
    for (const q of answered) {
      if (isFillIn(q.questionType) && q.wordLimit != null && wordCount(selectedById[q.id]) > q.wordLimit) {
        setError(new Error(`Câu ${questionNumber(q)} quá giới hạn số từ (tối đa ${q.wordLimit} từ). Hãy rút gọn đáp án rồi nộp lại.`));
        return;
      }
    }
    // (b) Chấm tuần tự theo thứ tự trong đề.
    const nextResults: Record<string, AnswerResult> = {};
    let correct = 0;
    for (const q of answered) {
      const already = resultById[q.id];
      if (already) {
        nextResults[q.id] = already;
        if (already.correct) correct += 1;
        continue;
      }
      try {
        const r = await api.practiceAnswer(q.id, selectedById[q.id]);
        nextResults[q.id] = r;
        if (r.correct) correct += 1;
      } catch (e) {
        const merged = { ...resultById, ...nextResults };
        setResultById(merged);
        setScore({ correct: Object.values(merged).filter(r => r.correct).length, done: Object.keys(merged).length });
        setError(e);
        return;
      }
    }
    // (c) Xong: câu chưa làm tính là sai (done = tổng số câu).
    setResultById(m => ({ ...m, ...nextResults }));
    setScore({ correct, done: questions.length });
    setSubmittedAll(true);
  };

  if (loading || (isListening && !!testSetId && !partMediaLoaded)) return <LoadingLine effect={settings.ui.loading.page} speed={settings.ui.loading.speed} text="Đang tải câu hỏi…" />;
  if (!questions.length) return <div><ErrorBox error={error} /><p>Chưa có câu hỏi cho {isIelts ? partLabel(part, exam) : `Part ${part}`} này. {testSetId ? <Link to={`/practice/test-set/${testSetId}`}>Quay lại đề thi</Link> : <Link to="/practice">Quay lại chọn Part</Link>}</p></div>;
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
            : <><Link className="btn" to="/practice">{isIelts ? 'Luyện Section khác' : 'Luyện Part khác'}</Link><Link className="btn secondary" to="/wrong">Ôn câu sai</Link></>}
        </div>
      </div>
    );
  }

  // Câu Reading trắc nghiệm: xếp 2 câu 1 hàng (lưới 2 cột), đáp án 1 dọc.
  const isDuoQuestion = (q: Question) => {
    const t = q.questionType || 'multiple_choice';
    return q.part >= 5 && (t === 'multiple_choice' || t === 'choosing_title') && !isListeningOnly(q);
  };

  // Nhóm các câu liên tiếp cùng 1 đoạn văn (Part 3/4/6/7) để đoạn chỉ hiện
  // 1 lần, các câu hỏi của đoạn nối tiếp ngay bên dưới — như tờ đề thi thật.
  // Số thứ tự n là SỐ THẬT trong đề (mốc đầu Part + vị trí trong Part),
  // không phải vị trí trong danh sách (luyện riêng Part 3 thì 1–39 sai,
  // số thật là 32–70).
  type Block = { key: string; passageText?: string; questions: { q: Question; n: number }[] };
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
    else blocks.push({ key: q.id, passageText: q.passageText, questions: [{ q, n }] });
  });

  const renderQuestion = ({ q, n }: { q: Question; n: number }) => {
    const result = resultById[q.id];
    const selected = selectedById[q.id] ?? '';
    const listeningOnly = isListeningOnly(q);
    // Part 1/2 thi that (TOEIC): chi co tranh + nghe + chon A/B/C/D,
    // KHONG hien chu cau hoi/phuong an truoc khi tra loi cau do. Tra loi
    // xong moi hien day du chu de xem lai minh vua nghe gi.
    const hideListeningText = exam === 'toeic' && (q.part === 1 || q.part === 2) && !result;
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
    const showContent = !!q.content && !hideListeningText && !isP6;
    // Câu điền từ: chặn nút Nộp khi vượt giới hạn số từ. list_selection
    // không bị chặn này (chọn thiếu chỉ là sai, backend chấm set equality).
    const overLimit = isFillIn(qType) && q.wordLimit != null && wordCount(selected) > q.wordLimit;
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
          {isListening && !usePartAudio && (exam === 'toeic' || q.audioUrl) && (
            <ListeningAudio
              // Ưu tiên: audio câu hỏi → audio đoạn văn đã gộp sẵn trong
              // q.audioUrl → audio cấp Part. Không có audio nào thì TTS như cũ.
              // Khi đề có file audio cấp Part thì KHÔNG render hộp này nữa —
              // cả Part chỉ còn 1 nút nghe duy nhất ở đầu Part (ngay dưới
              // tiêu đề PART X). IELTS: chỉ render khi có file audio thật,
              // không dùng TTS đọc transcript (lộ nội dung bài nghe).
              audioUrl={q.audioUrl || partMedia[q.part]}
              ttsText={ttsTextFor(q)}
              stopKey={q.id}
              onError={setError}
            />
          )}
          {/* Số câu gắn ngay đầu chữ câu hỏi (căn thẳng hàng với câu hỏi),
              thay vì nằm riêng ở cột phải như trước. Nội dung gốc đôi khi
              đã có số ở đầu ("147. Where...") thì bỏ đi để khỏi lặp. */}
          {showContent ? (
            <p><span className="exam-q-num">{n}.</span><strong>{stripLeadingNumber(q.content, n)}</strong></p>
          ) : null}
        </div>
        <div className="exam-q-side">
          {/* Chỉ-nghe (P1/P2) và Part 6 không có chữ câu hỏi: số câu nằm
              trên phương án như phiếu trả lời. */}
          {!isIeltsSpecial && (letterOnly || isP6) && <div className="exam-q-num">{n}.</div>}
          {isIeltsSpecial ? (
            <IeltsAnswerControl
              q={q}
              value={selected}
              onChange={v => setSelectedById(m => ({ ...m, [q.id]: v }))}
              disabled={submittedAll}
              graded={result}
              duplicateHeading={qType === 'matching_headings' && !!selected && (headingCounts[selected] ?? 0) > 1}
            />
          ) : (
            <div className="exam-opts">
              {q.options.map(o => {
                let cls = 'option';
                if (selected === o.label) cls += ' selected';
                if (result) {
                  if (o.label === result.correctLabel) cls += ' correct';
                  else if (selected === o.label && !result.correct) cls += ' wrong';
                }
                return <button key={o.label} className={cls} disabled={!!result || submittedAll} onClick={() => setSelectedById(m => ({ ...m, [q.id]: o.label }))}>{letterOnly ? <strong>{o.label}</strong> : <><strong>{o.label}</strong> {o.content}</>}</button>;
              })}
            </div>
          )}
          {/* Chế độ instant: nút "Nộp đáp án" từng câu như trước. Chế độ
              submit-all: ẨN nút này (chấm chung ở thanh dưới), nhưng vẫn
              giữ checkbox "Đoán mò" của IELTS để ghi nhận trước khi nộp. */}
          {!result && (gradingMode === 'instant' || isIelts) && (
            <div className="btn-row">
              {gradingMode === 'instant' && (
                <button className="btn btn-sm" disabled={!selected || overLimit} onClick={() => void submit(q)}>Nộp đáp án</button>
              )}
              {/* IELTS-only: đánh dấu đoán mò — kể cả làm đúng mà đoán mò
                  thì vẫn phải ghi nguyên nhân trước khi xem giải thích. */}
              {isIelts && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontWeight: 500, margin: 0 }}>
                  <input type="checkbox" checked={!!guessedById[q.id]} disabled={submittedAll}
                    onChange={e => setGuessedById(m => ({ ...m, [q.id]: e.target.checked }))} />
                  Đoán mò 🤔
                </label>
              )}
            </div>
          )}
          {/* Submit-all: câu chưa làm thì không gọi API chấm (backend trả
              400 với đáp án MC rỗng) nên không có kết quả — chỉ báo là
              chưa làm và tính sai, KHÔNG lộ đáp án đúng của câu đó. */}
          {submittedAll && !result && (
            <p style={{ color: 'var(--red-ink)', fontWeight: 700, margin: '.5rem 0 0' }}>❌ Chưa làm — tính là sai</p>
          )}
        </div>
        {result && (
          <div className="exam-q-result">
            <p style={{ color: result.correct ? 'var(--green-ink)' : 'var(--red-ink)', fontWeight: 700 }}>
              {/* list_selection: đáp án đúng là tập nhãn, hiển thị "A, C". */}
              {result.correct ? '✅ Đúng rồi!' : `❌ Sai rồi. Đáp án đúng: ${isMultiAnswer(qType) ? (parseSelectedLabels(result.correctLabel).join(', ') || result.correctText || '') : (result.correctLabel ?? result.correctText ?? '')}`} {result.xpAwarded ? `(+${result.xpAwarded} XP)` : ''}
            </p>
            {(() => {
              // IELTS-only: cổng giải thích — câu sai HOẶC đoán mò thì ẨN
              // giải thích cho tới khi người học chọn + ghi nguyên nhân
              // gốc (POST /api/ielts/error-log). Giải thích đã có sẵn
              // trong API response, chỉ ẩn ở UI. TOEIC: hiện như cũ.
              const needsCause = isIelts && (!result.correct || !!guessedById[q.id]);
              const causeLogged = !!causeById[q.id];
              if (needsCause && !causeLogged) {
                return (
                  <RootCausePicker
                    skill={skillOfPart(q.part)}
                    questionId={q.id}
                    questionType={q.questionType}
                    guessed={!!guessedById[q.id]}
                    onLogged={code => setCauseById(m => ({ ...m, [q.id]: code }))}
                  />
                );
              }
              return (
                <>
                  {result.explanation && <p><strong>Giải thích:</strong> {result.explanation}</p>}
                  {/* Transcript chỉ ở Part nghe (P1–4): ở Part đọc (P6/P7 TOEIC, Reading IELTS)
                     "transcript" API trả về thực chất là đoạn văn dùng chung, đã hiện 1 lần
                     phía trên rồi — sau khi nộp chỉ hiện giải thích, không in lại cả đoạn. */}
                  {isListening && result.transcript && <p><strong>Transcript:</strong> {result.transcript}</p>}
                </>
              );
            })()}
          </div>
        )}
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
      const sel = selectedById[q.id] ?? '';
      const res = resultById[q.id];
      if (sel || res) blanks[n] = { selected: sel || undefined, graded: res ? res.correct : null };
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

  // Tờ đề: câu Reading trắc nghiệm xếp 2 câu 1 hàng (lưới 2 cột); các khối
  // liên tiếp không có đoạn văn (Part 5) gom chung 1 lưới; khối có đoạn văn
  // (Part 6/7) thì lưới nằm trong cụm đoạn văn.
  const renderPaper = () => {
    const out: React.ReactNode[] = [];
    let duoRun: { q: Question; n: number }[] = [];
    const flushDuo = (key: string) => {
      if (!duoRun.length) return;
      out.push(<div className="exam-q-grid2" key={key}>{duoRun.map(item => renderQuestion(item))}</div>);
      duoRun = [];
    };
    for (const block of blocks) {
      const duoBlock = !block.passageText && block.questions.every(({ q }) => isDuoQuestion(q));
      if (duoBlock) { duoRun.push(...block.questions); continue; }
      flushDuo(`duo-${block.key}`);
      out.push(block.passageText ? (
        <div className="paper-cluster" key={block.key}>
          {renderPassage(block)}
          {block.questions.every(({ q }) => isDuoQuestion(q)) ? (
            <div className="exam-q-grid2">{block.questions.map(item => renderQuestion(item))}</div>
          ) : (
            block.questions.map(item => renderQuestion(item))
          )}
        </div>
      ) : (
        <div key={block.key}>{block.questions.map(item => renderQuestion(item))}</div>
      ));
    }
    flushDuo('duo-last');
    return out;
  };

  // Khóa chọn chế độ chấm khi đã chọn đáp án cho câu nào trong đề hiện
  // tại (chỉ tính câu của đề này — selectedById cũ của buổi trước không
  // khóa nhầm). Chọn xong thì không đổi chế độ giữa buổi.
  const modeLocked = questions.some(q => selectedById[q.id]);
  const answeredCount = questions.filter(q => selectedById[q.id]).length;

  return (
    <div className={`ts-${textLevel}`}>
      {testSetTitle && <p className="tag" style={{ margin: '.15rem 0' }}>📚 {testSetTitle}</p>}
      <div className="exam-head">
        <h2 className="exam-part">
          {isIelts
            ? <>{partLabel(part, exam)}<span> — {part <= 4 ? 'Listening' : 'Reading'}</span></>
            : <>Part {part}{partName(part).split('—')[1]?.trim() ? <span> — {partName(part).split('—')[1]?.trim()}</span> : null}</>}
        </h2>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
          {/* Chọn chế độ chấm — chỉ đổi được trước khi chọn đáp án đầu tiên. */}
          <span role="group" aria-label="Chế độ chấm điểm" title={modeLocked ? 'Đã chọn đáp án nên không đổi được chế độ chấm trong buổi này' : undefined}
            style={{ display: 'inline-flex', border: '1px solid var(--accent)', borderRadius: 8, overflow: 'hidden', opacity: modeLocked ? .55 : 1 }}>
            {(['instant', 'submit-all'] as const).map(m => (
              <button key={m} type="button" className="btn btn-sm" disabled={modeLocked} aria-pressed={gradingMode === m}
                onClick={() => setGradingMode(m)}
                style={gradingMode === m
                  ? { borderRadius: 0, boxShadow: 'none' }
                  : { borderRadius: 0, boxShadow: 'none', background: 'transparent', color: 'var(--accent-dark)' }}>
                {m === 'instant' ? 'Chấm từng câu' : 'Làm xong mới chấm'}
              </button>
            ))}
          </span>
          <span className="progress-badge">Đã làm {score.done}/{questions.length}</span>
        </span>
      </div>
      {usePartAudio && (
        <div className="part-audio">
          <ListeningAudio audioUrl={partMedia[part]} ttsText="" stopKey={`part-${part}`} onError={setError} />
          <p className="muted">🎧 Nghe cả {isIelts ? `Section ${part}` : `Part ${part}`} — bấm 1 lần rồi làm hết các câu của {isIelts ? 'Section' : 'Part'} trong lúc nghe.</p>
        </div>
      )}
      {ieltsNoAudio && (
        <p className="muted">📌 Bộ đề mẫu chưa có audio — bạn vẫn làm bài bình thường.</p>
      )}
      <ErrorBox error={error} />
      <div className="paper">
        {renderPaper()}
      </div>
      <div className="practice-bar">
        <span className="progress">Đã làm {score.done}/{questions.length} • Đúng {score.correct}</span>
        <button className="btn secondary btn-sm" onClick={() => { stopSpeak(); nav(testSetId ? `/practice/test-set/${testSetId}` : '/practice'); }}>🚪 Thoát</button>
        {gradingMode === 'submit-all' && !submittedAll ? (
          <button className="btn btn-sm" disabled={answeredCount === 0} onClick={() => void submitAll()}>Nộp tất cả · {answeredCount}/{questions.length} câu</button>
        ) : (
          <button className="btn btn-sm" onClick={() => { stopSpeak(); setFinished(true); }}>Xem kết quả</button>
        )}
      </div>
    </div>
  );
}
