import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, scoreLevel, type Question, type TestResultDetail } from '../api';
import { ErrorBox, LivelyMascot, PassageWithBlanks, partName, QuestionText, TierBadge, type BlankState } from '../components';
import { bandLevel, isFillIn, isMultiAnswer, parseSelectedLabels, partLabel, partNameFor, questionTypeName, realQuestionNumber, stripLeadingNumber } from '../exam';
import { IeltsAnswerControl } from '../ielts-ui';
import { RootCausePicker, skillOfPart } from '../ielts-phase1';
import { LoadingLine, useUiSettings } from '../uiSettings';
import { WordText } from '../wordLookup';

export default function Result() {
  const { id } = useParams();
  const { settings } = useUiSettings();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.testResult>> | null>(null);
  const [error, setError] = useState<unknown>(null);
  // IELTS-only: mã nguyên nhân đã ghi + đánh dấu đoán mò, theo id câu.
  const [causeById, setCauseById] = useState<Record<string, string>>({});
  const [guessedById, setGuessedById] = useState<Record<string, boolean>>({});
  // Bộ lọc danh sách câu ở trang kết quả: tất cả / đúng / sai.
  const [detailFilter, setDetailFilter] = useState<'all' | 'correct' | 'wrong'>('all');
  // Chế độ xem chi tiết: "Xem trên đề" (mặc định — đáp án + giải thích
  // hiện ngay trên tờ đề, như lúc "Làm xong mới chấm") hoặc "Danh sách"
  // (kiểu liệt kê cũ, giữ nguyên).
  const [paperView, setPaperView] = useState(true);

  useEffect(() => {
    if (id) api.testResult(Number(id)).then(setData).catch(setError);
  }, [id]);

  if (error) return <div><ErrorBox error={error} /><Link className="btn secondary btn-sm" to="/">Về trang chủ</Link></div>;
  if (!data) return <LoadingLine location="page" text="Đang tải kết quả…" />;

  const isFull = data.mode === 'full';
  const isIelts = data.exam === 'ielts' || data.overallBand != null;
  const totalCorrect = (data.listening_correct ?? 0) + (data.reading_correct ?? 0);
  // Chi tiết TẤT CẢ câu trong bài (backend trả kèm detail, có flag
  // correct từng câu); bài cũ không có detail thì fallback về danh
  // sách id câu sai như cũ.
  const detailAll = data.detail ?? [];
  const correctCount = detailAll.filter(d => d.correct === true).length;
  const wrongCount = detailAll.length - correctCount;
  // Ý 4 (IELTS-only): điểm theo dạng câu hỏi — nhóm từ detail (đã có
  // questionType từng câu), xếp dạng yếu nhất lên trước để ôn cho trúng.
  // firstPart: Part đầu tiên có dạng này (để link luyện khi bài thi không
  // gắn với bộ đề cụ thể).
  const byType = isIelts && detailAll.length ? (() => {
    const map = new Map<string, { correct: number; total: number; firstPart: number }>();
    for (const d of detailAll) {
      const t = d.questionType || 'multiple_choice';
      const cur = map.get(t) ?? { correct: 0, total: 0, firstPart: d.part ?? 1 };
      cur.total += 1;
      if (d.correct === true) cur.correct += 1;
      map.set(t, cur);
    }
    return [...map.entries()]
      .map(([questionType, v]) => ({ questionType, ...v, accuracy: v.total ? v.correct / v.total : 0 }))
      .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total);
  })() : [];
  // Số câu thật trên đề, tính theo thứ tự trong bài (chung hàm với phòng thi).
  const withinSeen: Record<number, number> = {};
  const detailNumbers = detailAll.map(d => {
    const p = d.part ?? 0;
    withinSeen[p] = (withinSeen[p] ?? 0) + 1;
    return realQuestionNumber(isIelts ? 'ielts' : 'toeic', p, withinSeen[p]);
  });

  // Thân bài xem lại của 1 câu — dùng chung cho cả 2 chế độ xem: cổng
  // nguyên nhân gốc của IELTS (câu sai/chưa trả lời), hoặc đáp án đúng +
  // giải thích (+ transcript/đoạn văn). Chế độ "Xem trên đề" không lặp
  // lại đoạn văn (đã hiện 1 lần ở đầu khối) và chỉ hiện transcript ở
  // câu nghe (câu đọc thì "transcript" thực chất là đoạn văn).
  const renderAnswerReview = (d: TestResultDetail, opts: { showPassage: boolean; showScript: boolean }) => {
    const causeLogged = !!causeById[d.questionId];
    const isReadingPassage = isIelts ? (d.part ?? 0) >= 5 : (d.part ?? 0) >= 6;
    if (isIelts && d.correct !== true && !causeLogged) {
      return (
        <>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontWeight: 500 }}>
            <input type="checkbox" checked={!!guessedById[d.questionId]}
              onChange={e => setGuessedById(m => ({ ...m, [d.questionId]: e.target.checked }))} />
            Câu này mình đoán mò 🤔
          </label>
          <RootCausePicker
            skill={d.part ? skillOfPart(d.part) : ''}
            questionId={d.questionId}
            attemptId={id ? Number(id) : undefined}
            questionType={d.questionType}
            guessed={!!guessedById[d.questionId]}
            onLogged={code => setCauseById(m => ({ ...m, [d.questionId]: code }))}
          />
        </>
      );
    }
    return (
      <>
        <p className="muted" style={{ margin: '.2rem 0' }}>
          {isFillIn(d.questionType) ? 'Đáp án bạn gõ: ' : 'Đáp án bạn chọn: '}
          {/* list_selection: "A,C" → "A, C" cho dễ đọc. */}
          <strong>{isMultiAnswer(d.questionType) ? (parseSelectedLabels(d.selected).join(', ') || '—') : (d.selected ?? '—')}</strong>
          {' • '}Đáp án đúng: <strong>{isMultiAnswer(d.questionType)
            ? (parseSelectedLabels(d.correctLabel).join(', ') || d.correctText || '—')
            : (d.correctText ?? d.correctLabel ?? '—')}</strong>
        </p>
        {d.explanation ? (
          <p style={{ margin: '.2rem 0' }}><strong>Giải thích:</strong> {d.explanation}</p>
        ) : (
          <p className="muted" style={{ margin: '.2rem 0' }}>Chưa có giải thích chi tiết trong file đáp án.</p>
        )}
        {opts.showScript && d.script ? (
          <details style={{ margin: '.2rem 0' }}>
            <summary>Xem transcript</summary>
            <p>{d.script}</p>
          </details>
        ) : null}
        {opts.showPassage && d.passageText ? (
          <details style={{ margin: '.2rem 0' }}>
            <summary>Xem đoạn văn</summary>
            <p>{isReadingPassage ? <WordText text={d.passageText} /> : d.passageText}</p>
          </details>
        ) : null}
      </>
    );
  };

  // "Xem trên đề": nhóm các câu liên tiếp cùng 1 đoạn văn (cùng mẫu
  // PracticeSession — cùng passageId hoặc cùng passageText) để đoạn chỉ
  // hiện 1 lần, các câu hỏi nối tiếp ngay bên dưới như tờ đề thi thật.
  type PaperBlock = { key: string; part: number; passageText?: string | null; items: { d: TestResultDetail; n: number }[] };
  const paperBlocks: PaperBlock[] = [];
  detailAll.forEach((d, i) => {
    const last = paperBlocks[paperBlocks.length - 1];
    const sameId = !!d.passageId && !!last && last.items[0]?.d.passageId === d.passageId;
    const sameText = !!d.passageText && !!last && last.passageText === d.passageText;
    if ((sameId || sameText) && last) last.items.push({ d, n: detailNumbers[i] });
    else paperBlocks.push({ key: d.questionId, part: d.part ?? 0, passageText: d.passageText, items: [{ d, n: detailNumbers[i] }] });
  });
  // Câu Reading trắc nghiệm: xếp 2 câu 1 hàng (cùng mẫu PracticeSession).
  const isDuoPaperQuestion = (d: TestResultDetail) => {
    const t = d.questionType || 'multiple_choice';
    return (d.part ?? 0) >= 5 && (t === 'multiple_choice' || t === 'choosing_title');
  };

  // Đoạn văn của 1 khối ở chế độ "Xem trên đề": Part 6 (TOEIC) thì chỗ
  // trống thành chip số (tô màu theo đúng/sai của câu đó, bấm để nhảy tới
  // câu); đoạn văn ĐỌC thì từ bấm được để tra từ.
  const renderPaperPassage = (block: PaperBlock) => {
    const part = block.items[0]?.d.part ?? 0;
    const isReading = isIelts ? part >= 5 : part >= 6;
    const isP6Block = !isIelts && part === 6;
    if (!isP6Block || !block.passageText) return <div className="passage">{block.passageText && isReading ? <WordText text={block.passageText} /> : block.passageText}</div>;
    const blanks: Record<number, BlankState> = {};
    const idByNum: Record<number, string> = {};
    for (const { d, n } of block.items) {
      idByNum[n] = d.questionId;
      if (d.selected || d.correct != null) blanks[n] = { selected: d.selected || undefined, graded: d.correct ?? null };
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

  // 1 câu ở chế độ "Xem trên đề": chỉ đọc (không chọn lại) — phương án
  // tô màu theo đáp án đã chọn/đáp án đúng, dạng IELTS đặc biệt dùng lại
  // IeltsAnswerControl ở trạng thái đã chấm, dưới câu là trạng thái +
  // đáp án + giải thích (cùng mẫu "Làm xong mới chấm" ở PracticeSession).
  const renderPaperQuestion = (d: TestResultDetail, n: number) => {
    const qType = d.questionType || 'multiple_choice';
    const isIeltsSpecial = isIelts && qType !== 'multiple_choice' && qType !== 'choosing_title';
    const isP6 = !isIelts && (d.part ?? 0) === 6;
    const isDuo = isDuoPaperQuestion(d);
    const showContent = !!d.content && !isP6;
    const listeningOnly = !isIelts && ((d.part ?? 0) === 1 || (d.part ?? 0) === 2)
      && (d.options ?? []).length > 0 && (d.options ?? []).every(o => !o.content || !o.content.trim());
    const letterOnly = listeningOnly;
    const status = d.correct === true ? '✓ Đúng' : d.correct === false ? '✗ Sai' : '— Chưa trả lời';
    const statusColor = d.correct === true ? 'var(--green-ink)' : d.correct === false ? 'var(--red-ink)' : 'var(--muted)';
    // Câu hỏi tổng hợp từ detail để dùng lại IeltsAnswerControl.
    const qForControl: Question = {
      id: d.questionId, part: d.part ?? 0, passageId: d.passageId ?? null,
      passageText: d.passageText ?? undefined, script: d.script ?? undefined,
      content: d.content ?? '', options: (d.options ?? []).map(o => ({ label: o.label, content: o.content ?? '' })),
      questionType: d.questionType, wordLimit: d.wordLimit ?? undefined, imageUrl: d.imageUrl ?? null,
    };
    const graded = { correct: d.correct === true, correctLabel: d.correctLabel ?? null, correctText: d.correctText ?? null, explanation: d.explanation ?? undefined };
    const selectedLabels = isMultiAnswer(qType) ? parseSelectedLabels(d.selected) : [d.selected ?? ''];
    const correctLabels = isMultiAnswer(qType) ? parseSelectedLabels(d.correctLabel) : [d.correctLabel ?? ''];
    return (
      <div id={`q-${d.questionId}`} className={`paper-q exam-q${isIeltsSpecial ? ' exam-q--ielts' : ''}${isDuo ? ' exam-q--duo' : ''}`} key={d.questionId}>
        <div className="exam-q-body">
          {d.imageUrl && (
            <img src={d.imageUrl} alt="Ảnh minh họa" style={{ maxWidth: '100%', borderRadius: 12 }} />
          )}
          {listeningOnly && (d.part ?? 0) === 1 && !d.imageUrl && (
            <p className="muted">🖼 Chưa có ảnh minh họa cho câu này.</p>
          )}
          {showContent ? (
            <p><span className="exam-q-num">{n}.</span>{isIelts ? <QuestionText text={stripLeadingNumber(d.content!, n)} /> : <strong>{stripLeadingNumber(d.content!, n)}</strong>}</p>
          ) : null}
        </div>
        <div className="exam-q-side">
          {/* Chỉ-nghe (P1/P2) và Part 6 không có chữ câu hỏi: số câu nằm
              trên phương án như phiếu trả lời. */}
          {!isIeltsSpecial && (letterOnly || isP6) && <div className="exam-q-num">{n}.</div>}
          {isIeltsSpecial ? (
            <IeltsAnswerControl q={qForControl} value={d.selected ?? ''} onChange={() => {}} disabled graded={graded} />
          ) : (
            <div className="exam-opts">
              {(d.options ?? []).map(o => {
                let cls = 'option';
                if (selectedLabels.includes(o.label)) cls += ' selected';
                if (correctLabels.includes(o.label)) cls += ' correct';
                else if (selectedLabels.includes(o.label) && d.correct !== true) cls += ' wrong';
                return <button key={o.label} className={cls} disabled>{letterOnly ? <strong>{o.label}</strong> : <><strong>{o.label}</strong> {o.content}</>}</button>;
              })}
            </div>
          )}
        </div>
        <div className="exam-q-result">
          <p style={{ color: statusColor, fontWeight: 700, margin: '.5rem 0 0' }}>{status}</p>
          {renderAnswerReview(d, { showPassage: false, showScript: (d.part ?? 0) <= 4 })}
        </div>
      </div>
    );
  };

  // Tờ đề ở chế độ "Xem trên đề": tiêu đề mỗi khi chuyển Part + đoạn văn
  // 1 lần mỗi khối + câu Reading trắc nghiệm xếp 2 câu 1 hàng (cùng mẫu
  // renderPaper của PracticeSession; IELTS Reading chia đôi màn hình khi
  // khối có đoạn văn).
  const renderPaper = () => {
    const out: React.ReactNode[] = [];
    let duoRun: { d: TestResultDetail; n: number }[] = [];
    const flushDuo = (key: string) => {
      if (!duoRun.length) return;
      out.push(<div className="exam-q-grid2" key={key}>{duoRun.map(item => renderPaperQuestion(item.d, item.n))}</div>);
      duoRun = [];
    };
    let prevPart = -1;
    for (const block of paperBlocks) {
      const split = isIelts && block.part >= 5 && !!block.passageText;
      if (block.part !== prevPart) {
        flushDuo(`duo-before-part-${block.part}`);
        out.push(
          <h3 className="paper-part" key={`part-${block.part}`}>
            {isIelts ? `${partLabel(block.part, 'ielts')} — ${block.part <= 4 ? 'Listening' : 'Reading'}` : `Part ${block.part}`}
          </h3>
        );
      }
      prevPart = block.part;
      const duoBlock = !block.passageText && block.items.every(({ d }) => isDuoPaperQuestion(d));
      if (duoBlock) { duoRun.push(...block.items); continue; }
      flushDuo(`duo-${block.key}`);
      out.push(block.passageText ? (
        <div className={`paper-cluster${split ? ' paper-cluster--split' : ''}`} key={block.key}>
          {renderPaperPassage(block)}
          {split ? (
            <div>{block.items.map(item => renderPaperQuestion(item.d, item.n))}</div>
          ) : block.items.every(({ d }) => isDuoPaperQuestion(d)) ? (
            <div className="exam-q-grid2">{block.items.map(item => renderPaperQuestion(item.d, item.n))}</div>
          ) : (
            block.items.map(item => renderPaperQuestion(item.d, item.n))
          )}
        </div>
      ) : (
        <div key={block.key}>{block.items.map(item => renderPaperQuestion(item.d, item.n))}</div>
      ));
    }
    flushDuo('duo-last');
    return out;
  };

  return (
    <div>
      <h1>Kết quả thi thử</h1>
      {/* Lively-only: mascot nho o dau trang ket qua, khong lan noi dung. */}
      {settings.ui.style === 'lively' && (
        <div className="lively-result-mascot-wrap"><LivelyMascot size={88} alt="Mascot ANHANH" /></div>
      )}
      {isIelts ? (
        isFull && data.overallBand != null ? (
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="muted">Band tổng (band ước lượng để tham khảo)</div>
            <div className="band-num">Band {data.overallBand}</div>
            <p>Mức: {bandLevel(data.overallBand)}</p>
            <p className="hearts">{'★'.repeat(data.overallBand >= 8 ? 3 : data.overallBand >= 6.5 ? 2 : 1)}{'☆'.repeat(data.overallBand >= 8 ? 0 : data.overallBand >= 6.5 ? 1 : 2)}</p>
            <div className="grid" style={{ marginTop: '.8rem', textAlign: 'left' }}>
              <div className="card" style={{ marginBottom: 0 }}>
                <div className="muted">🎧 Listening</div>
                <div className="big">Band {data.listeningBand ?? '—'}</div>
                <p className="muted">{data.listening_correct ?? 0}/40 câu đúng</p>
              </div>
              <div className="card" style={{ marginBottom: 0 }}>
                <div className="muted">📖 Reading</div>
                <div className="big">Band {data.readingBand ?? '—'}</div>
                <p className="muted">{data.reading_correct ?? 0}/40 câu đúng</p>
              </div>
            </div>
            <p className="muted">Band ước lượng theo bảng quy đổi tham khảo công khai, không phải band chính thức.</p>
          </div>
        ) : (
          <div className="card">
            <p className="big">{totalCorrect} câu đúng</p>
            <p className="muted">Bài thi mini (1 Section/Passage) chỉ báo số câu đúng/tổng, không có band.</p>
          </div>
        )
      ) : isFull && data.total_score != null ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="muted">Tổng điểm (điểm ước lượng)</div>
          <div className="big">{data.total_score} / 990</div>
          <p><TierBadge total={data.total_score} /></p>
          <p className="hearts">{'★'.repeat(data.total_score >= 900 ? 3 : data.total_score >= 600 ? 2 : 1)}{'☆'.repeat(data.total_score >= 900 ? 0 : data.total_score >= 600 ? 1 : 2)}</p>
          <p>Mức: {scoreLevel(data.total_score)}</p>
          <p>Listening: {data.listening_score ?? '—'} ({data.listening_correct ?? 0} câu đúng) • Reading: {data.reading_score ?? '—'} ({data.reading_correct ?? 0} câu đúng)</p>
          <p className="muted">Điểm ước lượng theo bảng quy đổi tham khảo công khai, không phải điểm chính thức của ETS.</p>
        </div>
      ) : (
        <div className="card">
          <p className="big">{totalCorrect} câu đúng</p>
          <p className="muted">Bài thi mini (1 Part) chỉ báo số câu đúng/tổng, không có điểm 10–990.</p>
        </div>
      )}
      {data.byPart && (
        <div className="card"><h2>{isIelts ? 'Điểm theo Section/Passage' : 'Điểm theo Part'}</h2>
          {data.byPart.map(b => (
            <div key={b.part} style={{ marginBottom: '.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{isIelts ? partNameFor(b.part, 'ielts') : partName(b.part)}</span><span>{b.correct}/{b.total}</span></div>
              <div className="bar"><i style={{ width: `${b.total ? (b.correct / b.total) * 100 : 0}%` }} /></div>
            </div>
          ))}
        </div>
      )}
      {byType.length > 0 && (
        <div className="card"><h2>Điểm theo dạng câu hỏi</h2>
          <p className="muted" style={{ marginTop: 0 }}>Dạng yếu nhất xếp lên trước — bấm tên dạng để luyện riêng dạng đó.</p>
          {byType.map(b => (
            <div key={b.questionType} style={{ marginBottom: '.6rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Link className="btn secondary btn-sm" to={data.testSetId
                  ? `/practice/session?part=all&testSetId=${data.testSetId}&exam=ielts&questionType=${b.questionType}`
                  : `/practice/part/${b.firstPart}?exam=ielts&questionType=${b.questionType}`}>{questionTypeName(b.questionType)}</Link>
                <span>{b.correct}/{b.total} ({Math.round(b.accuracy * 100)}%)</span>
              </div>
              <div className="bar"><i style={{ width: `${b.accuracy * 100}%` }} /></div>
            </div>
          ))}
        </div>
      )}
      {detailAll.length ? (
        <div className="card">
          <h2>Chi tiết từng câu ({correctCount}/{detailAll.length} đúng)</h2>
          {wrongCount === 0 && <p>🎉 Không có câu sai!</p>}
          <div className="btn-row" role="group" aria-label="Chế độ xem kết quả">
            <button type="button" className={paperView ? 'btn' : 'btn secondary'} onClick={() => setPaperView(true)}>📄 Xem trên đề</button>
            <button type="button" className={!paperView ? 'btn' : 'btn secondary'} onClick={() => setPaperView(false)}>📋 Danh sách</button>
          </div>
          {paperView ? (
            <div className="paper">{renderPaper()}</div>
          ) : (
            <>
              <div className="btn-row" role="group" aria-label="Lọc câu">
                <button type="button" className={detailFilter === 'all' ? 'btn' : 'btn secondary'} onClick={() => setDetailFilter('all')}>Tất cả ({detailAll.length})</button>
                <button type="button" className={detailFilter === 'correct' ? 'btn' : 'btn secondary'} onClick={() => setDetailFilter('correct')}>✓ Đúng ({correctCount})</button>
                <button type="button" className={detailFilter === 'wrong' ? 'btn' : 'btn secondary'} onClick={() => setDetailFilter('wrong')}>✗ Sai ({wrongCount})</button>
              </div>
              {detailAll.map((d, i) => {
                if (detailFilter === 'correct' && d.correct !== true) return null;
                if (detailFilter === 'wrong' && d.correct === true) return null;
                const n = detailNumbers[i];
                const status = d.correct === true ? '✓ Đúng' : d.correct === false ? '✗ Sai' : '— Chưa trả lời';
                return (
                  <div key={d.questionId} style={{ borderBottom: '1px solid var(--border-soft)', padding: '.5rem 0' }}>
                    <p style={{ margin: '.2rem 0' }}><strong>Câu {n} · {status}</strong>{d.content ? <> — {stripLeadingNumber(d.content, n)}</> : null}</p>
                    {renderAnswerReview(d, { showPassage: true, showScript: true })}
                  </div>
                );
              })}
            </>
          )}
          <div className="btn-row">
            <Link className="btn" to="/wrong">Ôn lại câu sai</Link>
            {isIelts && data.testSetId && <Link className="btn secondary" to={`/wrong?testSetId=${data.testSetId}`}>Ôn lại câu sai của bài thi này</Link>}
          </div>
        </div>
      ) : data.wrongQuestionIds?.length ? (
        <div className="card"><h2>Câu làm sai ({data.wrongQuestionIds.length})</h2><p>{data.wrongQuestionIds.join(', ')}</p>
          <div className="btn-row">
            <Link className="btn" to="/wrong">Ôn lại câu sai</Link>
            {isIelts && data.testSetId && <Link className="btn secondary" to={`/wrong?testSetId=${data.testSetId}`}>Ôn lại câu sai của bài thi này</Link>}
          </div></div>
      ) : <div className="card"><p>🎉 Không có câu sai!</p></div>}
      <div className="btn-row"><Link className="btn secondary" to="/mock">Thi thử lại</Link><Link className="btn secondary" to="/">Về trang chủ</Link></div>
    </div>
  );
}
