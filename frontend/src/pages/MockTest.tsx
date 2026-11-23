import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, api, type Attempt, type InProgressTest, type Question, type TestSet } from '../api';
import { useAuth } from '../auth';
import { clearMockTest, isPageReload, readDraft, readPaper, writeDraft, writePaper, type MockDraft } from '../mockDraft';
import { ErrorBox, ListeningAudio, PassageWithBlanks, QuestionPalette, QuestionText, partName, type BlankState, type PaletteItemState } from '../components';
import { WordText } from '../wordLookup';
import { attemptStatsFor, partLabel, partNameFor, realQuestionNumber, stripLeadingNumber, useExam, useTextSize } from '../exam';
import { IeltsAnswerControl, IeltsMatchingBoard, IeltsNotesBlock, FlagButton, splitGroupSegments } from '../ielts-ui';
import { stopSpeak, ttsTextFor } from '../tts';
import { LoadingLine } from '../uiSettings';

function fmt(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// Ngay nop bai (vi-VN, kem gio) + thoi gian lam (mm:ss, hoac hh:mm:ss
// neu tren 1 gio) — dung cho khoi "Lich su thi thu".
function fmtMockDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
}

function fmtDur(s?: number | null): string {
  if (s == null) return '—';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0
    ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function MockTest() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const testSetId = params.get('testSetId') || undefined;
  const { exam: ctxExam } = useExam();
  const { user, loading: authLoading } = useAuth();
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
  // Id cac cau cua bai dang lam + de cua bai (mini khong kem de thi de do
  // backend chon ngau nhien) — can cho nhap localStorage + khoi phuc.
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [attemptTestSetId, setAttemptTestSetId] = useState<string | null>(null);
  // Trang thai luu dap an len server (chi bao nho canh dong ho).
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'offline' | 'error'>('saved');
  // Bai thi chua nop moi nhat (the "Tiep tuc bai dang lam do").
  const [inProgress, setInProgress] = useState<InProgressTest | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoredNotice, setRestoredNotice] = useState(false);
  const [resumeArmed, setResumeArmed] = useState(false);
  // Hang doi dap an chua luu kip len server (mang loi): {questionId: selected}.
  const pendingRef = useRef(new Map<string, string>());
  const flushingRef = useRef(false);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushBackoffRef = useRef(1000);
  const restoreDoneRef = useRef(false);
  const secondsLeftRef = useRef(0);
  const attemptIdRef = useRef<number | null>(null);
  // Nút Thoát: bấm lần 1 để xác nhận, lần 2 mới thoát thật.
  const [confirmExit, setConfirmExit] = useState(false);
  // Menu ⋮ (Phương án A): Nộp/Thoát dời khỏi thanh dưới vào popup neo
  // dưới icon ⋮ ở thanh tiêu đề. Nộp bài 1 lần bấm như cũ; chỉ Thoát
  // giữ 2 lần bấm để xác nhận. Đóng menu thì hủy trạng thái "bấm lại"
  // của Thoát để lần mở sau phải xác nhận lại từ đầu.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const closeMenu = () => { setMenuOpen(false); setConfirmExit(false); };
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMenu(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen]);
  const [questions, setQuestions] = useState<Question[]>([]);
  // Đáp án lưu theo id câu (làm theo thứ tự bất kỳ, đổi thoải mái trước
  // khi nộp — thi thử KHÔNG chấm ngay từng câu).
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  // Ref dong bo de hang doi luu + ghi nhap doc duoc gia tri moi nhat
  // trong callback/timeout (tranh stale closure).
  secondsLeftRef.current = secondsLeft;
  attemptIdRef.current = attemptId;
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
      // Bat dau bai moi thi huy bai do cu (cung ky thi) — best-effort,
      // khong chan viec tao bai moi.
      if (inProgress) {
        try { await api.abandonTest(inProgress.attemptId); } catch { /* bo qua */ }
        setInProgress(null);
      }
      clearLocalTest();
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
      // Tai cau hoi theo lo (1 lan goi + retry). Loi thi huy attempt vua
      // tao de khong de lai bai do, roi bao loi ro rang cho user thu lai.
      let qs: Question[];
      try {
        qs = await loadQuestionsBatch(t.questionIds);
      } catch (e) {
        try { await api.abandonTest(t.attemptId); } catch { /* bo qua */ }
        throw e;
      }
      setAttemptTestSetId(t.testSetId ?? testSetId ?? null);
      setQuestionIds(t.questionIds);
      setQuestions(qs);
      setAnswers({});
      setFlaggedById({});
      setPlayedSections({});
      pendingRef.current.clear();
      setSaveState('saved');
      setSecondsLeft(t.durationSec || fullMinutes * 60);
      setAttemptId(t.attemptId);
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const submit = async () => {
    if (!attemptId || submittedRef.current) return;
    submittedRef.current = true;
    stopSpeak();
    try {
      // Day het dap an dang cho len server truoc khi nop de khong mat cau.
      await flushQueue();
      await api.submitTest(attemptId);
      clearLocalTest();
      nav(`/result/${attemptId}`);
    } catch (e) { submittedRef.current = false; setError(e); }
  };

  // Nộp bài từ menu ⋮: 1 lần bấm như cũ — nộp 1 lần duy nhất
  // (submittedRef trong submit()); hết giờ vẫn tự nộp, không qua menu.
  const submitFromMenu = () => {
    closeMenu();
    void submit();
  };

  // ---- Hang doi luu dap an: dap an gui that bai (mang loi) thi xep hang
  // va tu gui lai (backoff + khi co mang lai + dinh ky), thay vi hien loi
  // do va mat dap an. Upsert o server nen gui lai an toan.
  const scheduleFlush = () => {
    if (flushTimerRef.current) return;
    const delay = flushBackoffRef.current;
    flushBackoffRef.current = Math.min(flushBackoffRef.current * 2, 30000);
    flushTimerRef.current = setTimeout(() => { flushTimerRef.current = null; void flushQueue(); }, delay);
  };
  const flushQueue = async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    try {
      while (pendingRef.current.size > 0) {
        const id = attemptIdRef.current;
        if (!id) return;
        setSaveState('saving');
        const [qid, val] = [...pendingRef.current.entries()][0];
        try {
          await api.saveTestAnswer(id, qid, val);
          // Chi xoa khi gia tri trong hang van la gia tri vua gui (nguoi
          // dung co the doi dap an trong luc gui — gia tri moi o lai hang).
          if (pendingRef.current.get(qid) === val) pendingRef.current.delete(qid);
        } catch (e) {
          setSaveState(!navigator.onLine || (e instanceof ApiError && e.status === 0) ? 'offline' : 'error');
          scheduleFlush();
          return;
        }
      }
      setSaveState('saved');
      flushBackoffRef.current = 1000;
    } finally {
      flushingRef.current = false;
    }
  };

  // ---- Tai cau hoi theo lo (1 lan goi + retry), thay cho vong lap goi le
  // tung cau nhu truoc. Cau nao khong tai duoc thi BAO LOI RO RANG thay vi
  // lang le bo cau khoi de. Neu backend cu chua co endpoint batch (404,
  // cua so deploy) thi fallback ve tai tung cau.
  const loadQuestionsSequential = async (ids: string[]): Promise<Question[]> => {
    const qs: Question[] = [];
    const failed: string[] = [];
    for (const id of ids) {
      try { qs.push(await api.question(id)); } catch { failed.push(id); }
    }
    if (failed.length > 0) {
      throw new Error(`Không tải được ${failed.length}/${ids.length} câu hỏi. Kiểm tra mạng rồi thử lại.`);
    }
    return qs;
  };
  const loadQuestionsBatch = async (ids: string[]): Promise<Question[]> => {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await api.questionsBatch(ids);
        if (r.missing.length > 0) {
          throw new Error(`Không tải được ${r.missing.length}/${ids.length} câu hỏi. Kiểm tra mạng rồi thử lại.`);
        }
        return r.items;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return loadQuestionsSequential(ids);
        lastErr = e;
        if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    if (lastErr instanceof Error) throw lastErr;
    throw new Error('Không tải được đề thi. Kiểm tra mạng rồi thử lại.');
  };

  // Xoa nhap + de luu trong may (nop bai / thoat / huy bai).
  const clearLocalTest = () => {
    if (user) clearMockTest(exam, user.id);
  };

  useEffect(() => {
    if (testSetId) api.testSet(testSetId).then(setTestSet).catch(setError);
  }, [testSetId]);

  // Danh sách đề để chọn ở màn hình Thi thử (khi mở /mock trực tiếp,
  // chưa có testSetId trên URL).
  const [testSets, setTestSets] = useState<TestSet[]>([]);
  // Lich su thi thu (de dem so lan da lam moi de o luoi chon de).
  const [history, setHistory] = useState<Attempt[]>([]);
  // Lich su thi thu DA NOP (GET /api/tests/history: chi mini/full, toi
  // da 50) — hien o khoi "Lich su thi thu" duoi form chon de. API tra ca
  // bai dang lam do (chua co finishedAt) nen loc lai o render.
  const [mockHistory, setMockHistory] = useState<Attempt[]>([]);
  useEffect(() => {
    if (!testSetId) {
      api.testSets(exam).then(setTestSets).catch(() => undefined);
      api.statsHistory(exam).then(setHistory).catch(() => undefined);
      api.testHistory(exam).then(setMockHistory).catch(() => undefined);
    }
  }, [exam, testSetId]);

  // Hang doi luu: tu day lai khi co mang / quay lai tab / dinh ky 15s.
  useEffect(() => {
    const onOnline = () => { flushBackoffRef.current = 1000; void flushQueue(); };
    const onVisibility = () => { if (!document.hidden) void flushQueue(); };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
    const t = setInterval(() => { if (pendingRef.current.size > 0) void flushQueue(); }, 15000);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(t);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ghi nhap bai thi vao localStorage moi lan doi trang thai (dap an, co,
  // audio da phat) — tai lai trang giua bai thi khoi phuc tu nhap nay.
  useEffect(() => {
    if (!attemptId || !user) return;
    const draft: MockDraft = {
      v: 1,
      attemptId,
      userId: user.id,
      exam,
      mode,
      part: mode === 'mini' ? part : null,
      testSetId: attemptTestSetId ?? testSetId ?? null,
      questionIds,
      answers,
      secondsLeft: secondsLeftRef.current,
      deadlineAt: Date.now() + Math.max(0, secondsLeftRef.current) * 1000,
      savedAt: Date.now(),
      flaggedById,
      playedSections,
    };
    writeDraft(exam, user.id, draft);
  }, [attemptId, user, exam, mode, part, attemptTestSetId, testSetId, questionIds, answers, flaggedById, playedSections]);

  // Dong ho trong nhap cap nhat moi 5s (de khoi phuc dung gio con lai).
  useEffect(() => {
    if (!attemptId || !user) return;
    const t = setInterval(() => {
      const d = readDraft(exam, user.id);
      if (!d || d.attemptId !== attemptId) return;
      writeDraft(exam, user.id, {
        ...d,
        secondsLeft: secondsLeftRef.current,
        deadlineAt: Date.now() + Math.max(0, secondsLeftRef.current) * 1000,
        savedAt: Date.now(),
      });
    }, 5000);
    return () => clearInterval(t);
  }, [attemptId, user, exam]);

  // Luu toan bo cau hoi cua de vao may (1 lan khi vua tai de) — khoi phuc
  // duoc ca khi mang sut khong tai lai duoc cau hoi.
  useEffect(() => {
    if (!attemptId || !user || questions.length === 0) return;
    writePaper(exam, user.id, { v: 1, attemptId, questions });
  }, [attemptId, user, exam, questions]);

  // Khi mo trang: lay bai dang lam do (the "Tiep tuc") + neu trang vua
  // TAI LAI giua bai thi thi tu khoi phuc tu nhap. Gio server la chuan
  // khi online; chi dung gio nhap khi khong lien lac duoc server.
  useEffect(() => {
    if (authLoading || !user || restoreDoneRef.current) return;
    restoreDoneRef.current = true;
    void (async () => {
      let ip: InProgressTest | null = null;
      let ipFetchOk = false;
      try {
        ip = await api.inProgressTest(exam);
        ipFetchOk = true;
      } catch { ip = null; }
      setInProgress(ip);
      if (!isPageReload()) return;
      const draft = readDraft(exam, user.id);
      if (!draft) return;
      // Server co bai do khac voi nhap -> nhap da cu (bai da bi huy o noi
      // khac): bo nhap, de user tiep tuc bai tren server qua the resume.
      if (ipFetchOk && ip && ip.attemptId !== draft.attemptId) {
        clearMockTest(exam, user.id);
        return;
      }
      // Server xac nhan khong con bai do (online, khong loi) -> bai cua
      // nhap da bi huy: bo nhap.
      if (ipFetchOk && !ip) {
        clearMockTest(exam, user.id);
        return;
      }
      setRestoring(true);
      try {
        const paper = readPaper(exam, user.id);
        let qs: Question[];
        if (paper && paper.attemptId === draft.attemptId && paper.questions.length === draft.questionIds.length) {
          qs = paper.questions;
        } else {
          qs = await loadQuestionsBatch(draft.questionIds);
        }
        if (draft.testSetId) {
          try { setPartMedia(await api.partMedia(draft.testSetId)); } catch { setPartMedia({}); }
          try { setTestSet(await api.testSet(draft.testSetId)); } catch { /* giu null */ }
        }
        // Dap an: nhap (moi nhat, co the gom cau chua luu kip khi mat mang)
        // de len tren dap an server.
        const merged = { ...(ip ? ip.answers : {}), ...draft.answers };
        const seconds = ip
          ? ip.secondsLeft
          : Math.max(0, Math.floor((draft.deadlineAt - Date.now()) / 1000));
        setMode(draft.mode);
        if (draft.mode === 'mini' && draft.part) setPart(draft.part);
        setAttemptTestSetId(draft.testSetId);
        setQuestionIds(draft.questionIds);
        setQuestions(qs);
        setAnswers(merged);
        setFlaggedById(draft.flaggedById);
        setPlayedSections(draft.playedSections);
        setSecondsLeft(seconds);
        setAttemptId(draft.attemptId);
        // Gui lai toan bo dap an trong nhap len server (upsert nen an toan).
        for (const [qid, val] of Object.entries(draft.answers)) pendingRef.current.set(qid, val);
        setRestoredNotice(true);
        void flushQueue();
      } catch (e) {
        setError(e);
      } finally {
        setRestoring(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, exam]);

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

  // Thanh số câu theo dõi câu đang nhìn thấy (scroll-spy) — lúc mở bài
  // và khi cuộn, số của câu trong vùng nhìn sẽ sáng lên. Trước đây
  // currentId chỉ đổi khi bấm/chọn đáp án nên lúc mới mở không có số nào
  // sáng. Mỗi đơn vị câu đều mang id `q-<id>` (câu lẻ, dòng ghi chú,
  // hàng matching) nên quan sát chung 1 selector được.
  // (Đặt trước các early return để không vi phạm thứ tự hook.)
  useEffect(() => {
    if (questions.length === 0) return;
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
  }, [questions]);

  // Ghi lần chọn cuối (đổi đáp án thoải mái trước khi nộp) + ghi nhận
  // câu đang làm để highlight trên thanh số câu.
  const setAnswer = (q: Question, value: string) => {
    if (!q || !attemptId) return;
    setAnswers(a => ({ ...a, [q.id]: value }));
    setCurrentId(q.id);
  };
  // Luu dap an len server qua hang doi: that bai thi tu gui lai sau, khong
  // hien loi do am i nua (xem chi bao trang thai luu canh dong ho).
  const saveAnswer = async (q: Question, value: string) => {
    if (!q || !attemptIdRef.current) return;
    pendingRef.current.set(q.id, value);
    void flushQueue();
  };
  const choose = async (q: Question, label: string) => {
    setAnswer(q, label);
    await saveAnswer(q, label);
  };

  // Tiep tuc bai dang lam do tu server: dap an + gio con lai lay tu server;
  // nhap trong may (neu cung attempt) de them dap an chua luu kip + co +
  // audio da phat. Het gio roi thi vao bai la tu nop nhu binh thuong.
  const resumeInProgress = async () => {
    if (!inProgress || !user) return;
    setBusy(true); setError(null);
    try {
      const ip = inProgress;
      const draft = readDraft(exam, user.id);
      const sameDraft = draft && draft.attemptId === ip.attemptId ? draft : null;
      const paper = readPaper(exam, user.id);
      let qs: Question[];
      if (paper && paper.attemptId === ip.attemptId && paper.questions.length === ip.questionIds.length) {
        qs = paper.questions;
      } else {
        qs = await loadQuestionsBatch(ip.questionIds);
      }
      if (ip.testSetId) {
        try { setPartMedia(await api.partMedia(ip.testSetId)); } catch { setPartMedia({}); }
        try { setTestSet(await api.testSet(ip.testSetId)); } catch { /* giu null */ }
      }
      setMode(ip.mode);
      if (ip.mode === 'mini' && ip.part) setPart(ip.part);
      setAttemptTestSetId(ip.testSetId ?? null);
      setQuestionIds(ip.questionIds);
      setQuestions(qs);
      setAnswers({ ...ip.answers, ...(sameDraft ? sameDraft.answers : {}) });
      setFlaggedById(sameDraft ? sameDraft.flaggedById : {});
      setPlayedSections(sameDraft ? sameDraft.playedSections : {});
      setSecondsLeft(ip.secondsLeft);
      setAttemptId(ip.attemptId);
      if (sameDraft) {
        for (const [qid, val] of Object.entries(sameDraft.answers)) pendingRef.current.set(qid, val);
      }
      setRestoredNotice(true);
      void flushQueue();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  // Huy bai dang lam do tu the resume: bam 2 lan de xac nhan (nhu nut Thoat).
  const abandonInProgress = async () => {
    if (!inProgress) return;
    if (!resumeArmed) { setResumeArmed(true); return; }
    setResumeArmed(false);
    try { await api.abandonTest(inProgress.attemptId); } catch { /* best-effort */ }
    setInProgress(null);
    if (user) clearMockTest(exam, user.id);
  };

  // The "Tiep tuc bai dang lam do" — hien o man chon de (moi bai do) va o
  // man chi tiet de (chi khi bai do thuoc dung de nay).
  const renderResumeCard = () => {
    if (!inProgress) return null;
    const title = inProgress.testSetTitle
      ? (inProgress.mode === 'mini' && inProgress.part
        ? `${inProgress.testSetTitle} — ${partLabel(inProgress.part, exam)}`
        : inProgress.testSetTitle)
      : (inProgress.mode === 'mini' && inProgress.part
        ? `Thi mini — ${partLabel(inProgress.part, exam)}`
        : 'Thi full — Toàn bộ ngân hàng');
    const expired = inProgress.secondsLeft <= 0;
    return (
      <div className="resume-card">
        <div>
          <b>↩️ Bài thi đang làm dở</b>
          <p className="muted">{title} • Đã làm {inProgress.answeredCount}/{inProgress.questionIds.length} câu • {expired ? 'Đã hết giờ' : `Còn lại ${fmt(inProgress.secondsLeft)}`}</p>
        </div>
        <div className="btn-row" style={{ margin: 0 }}>
          <button className="btn" disabled={busy} onClick={() => void resumeInProgress()}>
            {busy ? 'Đang mở bài…' : expired ? 'Nộp bài và xem kết quả' : 'Tiếp tục làm bài'}
          </button>
          <button className="btn secondary" onClick={() => void abandonInProgress()}>
            {resumeArmed ? 'Bấm lại để hủy bài dở' : 'Hủy bài dở'}
          </button>
        </div>
      </div>
    );
  };

  // ---- Khoi "Lich su thi thu" (man chon de): chi bai DA NOP (co
  // finishedAt); bai dang lam do khong hien o day (da co the resume
  // rieng). "Lam lai" chi chon san dung de + dung che do, KHONG tu bat
  // dau thi — user tu bam "Bat dau thi". Mini khong kem de (backend chon
  // ngau nhien) nen chi can chon dung Part; full toan ngan hang thi chi
  // can chon che do full.
  const testSetTitleById = new Map(testSets.map(t => [t.id, t.title]));
  const submittedHistory = mockHistory.filter(a => a.finishedAt || a.finished_at);
  const redoAttempt = (a: Attempt) => {
    if (a.mode === 'mini') {
      setMode('mini');
      if (a.part) setPart(a.part);
    } else if (a.testSetId) {
      nav(`/mock?testSetId=${a.testSetId}&exam=${exam}`);
    } else {
      setMode('full');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (restoring) {
    return <LoadingLine location="page" text="Đang khôi phục bài thi đang làm dở…" />;
  }

  if (!attemptId) {
    if (testSetId) {
      return (
        <div className="card card--mid">
          <h1>Thi thử cả đề</h1>
          <ErrorBox error={error} />
          {inProgress && inProgress.testSetId === testSetId && renderResumeCard()}
          {testSet ? (
            <div>
              <h2 style={{ margin: '.2rem 0 .3rem' }}>{testSet.title}</h2>
              {testSet.description && <p className="muted">{testSet.description}</p>}
              <div className="stat-grid">
                <div className="stat-box"><b>{testSet.totalQuestions}</b><span>câu hỏi</span></div>
                <div className="stat-box"><b>{fullMinutes}</b><span>phút làm bài</span></div>
                <div className="stat-box"><b>{testSet.parts.length}</b><span>{isIelts ? 'Section/Passage' : 'Part'}</span></div>
              </div>
              <span className="mock-label">Cấu trúc đề</span>
              <div className="pick-grid pick-grid--parts">
                {testSet.parts.map(p => (
                  <div key={p.part} className="pick-box pick-box--static">
                    <b>{partLabel(p.part, exam)}</b>
                    <span>{p.count} câu</span>
                  </div>
                ))}
              </div>
              {testSet.missing.length > 0 && (
                <div className="mock-warn">⚠️ Đề chưa đủ câu chuẩn: {testSet.missing.map(m => `${partLabel(m.part, exam)} thiếu ${m.missing} câu`).join(', ')}.</div>
              )}
            </div>
          ) : <LoadingLine location="page" text="Đang tải thông tin đề thi…" />}
          <div className="mock-note">
            <p className="muted">Làm đủ {testSet?.totalQuestions || ''} câu, hết giờ tự nộp. Đáp án được lưu tự động sau mỗi câu. {isIelts ? <>Band thi thử là <strong>band ước lượng để tham khảo</strong> (thang 0–9).</> : <>Điểm thi thử là <strong>điểm ước lượng</strong> (thang 10–990).</>}</p>
            {isIelts && <p className="muted">🎧 Thi thử: audio mỗi Section chỉ phát 1 lần — bấm nghe khi đã sẵn sàng làm các câu của Section đó.</p>}
          </div>
          <div className="btn-row">
            <button className="btn secondary btn-sm" onClick={() => nav(`/mock?exam=${exam}`)}>← Đổi đề thi</button>
            <button className="btn gold" disabled={busy || !testSet || !testSet.totalQuestions} onClick={start}>{busy ? 'Đang tạo đề…' : 'Bắt đầu thi'}</button>
          </div>
        </div>
      );
    }
    return (
      <div className="card card--mid">
        <h1>Thi thử</h1>
        <ErrorBox error={error} />
        {renderResumeCard()}
        <span className="mock-label">Loại bài thi</span>
        <span role="group" aria-label="Loại bài thi"
          style={{ display: 'inline-flex', border: '1px solid var(--accent)', borderRadius: 12, overflow: 'hidden' }}>
          {(['mini', 'full'] as const).map(m => (
            <button key={m} type="button" className="btn" aria-pressed={mode === m} onClick={() => setMode(m)}
              style={mode === m
                ? { borderRadius: 0, boxShadow: 'none' }
                : { borderRadius: 0, boxShadow: 'none', background: 'transparent', color: 'var(--accent-dark)' }}>
              {m === 'mini'
                ? (isIelts ? 'Thi mini — 1 Section/Passage' : 'Thi mini — 1 Part')
                : (isIelts ? 'Thi full — 80 câu, 90 phút' : 'Thi full — 200 câu, 120 phút')}
            </button>
          ))}
        </span>
        {mode === 'mini' && (
          <>
            <span className="mock-label">{isIelts ? 'Chọn Section/Passage' : 'Chọn Part'}</span>
            <div className="pick-grid pick-grid--parts" role="group" aria-label="Chọn phần thi">
              {[1, 2, 3, 4, 5, 6, 7].map(p => (
                <button key={p} type="button" className={`pick-box${part === p ? ' pick-box--selected' : ''}`} aria-pressed={part === p} onClick={() => setPart(p)}>
                  <b>{isIelts ? partNameFor(p, exam) : partName(p)}</b>
                  <span>{isIelts ? (p <= 4 ? 'Listening • 30 phút' : 'Reading • 20 phút') : (p <= 4 ? 'Listening' : 'Reading')}</span>
                </button>
              ))}
            </div>
            <p className="muted">Thi mini lấy đúng đủ số câu của phần đó ở một đề ngẫu nhiên.</p>
          </>
        )}
        {mode === 'full' && (
          <>
            <span className="mock-label">Chọn đề thi</span>
            <div className="pick-grid" role="group" aria-label="Chọn đề thi">
              <div className="pick-box pick-box--selected" aria-current="true">
                <b>Toàn bộ ngân hàng</b>
                <span>Trộn câu từ tất cả các đề</span>
              </div>
              {[...testSets].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true })).map(s => {
                const doneCount = attemptStatsFor(history, s.id).count;
                return (
                  <button key={s.id} type="button" className="pick-box" onClick={() => nav(`/mock?testSetId=${s.id}&exam=${exam}`)}>
                    <b>{s.title}</b>
                    <span>{s.totalQuestions} câu • {fullMinutes} phút</span>
                    {doneCount > 0 && <span className="pick-box-attempts">{doneCount} lần</span>}
                  </button>
                );
              })}
            </div>
            {testSets.length === 0 && <p className="muted">Đang tải danh sách đề…</p>}
            <p className="muted">Bấm vào một đề để xem chi tiết rồi thi cả đề đó; bấm “Bắt đầu thi” để thi từ toàn bộ ngân hàng.</p>
          </>
        )}
        <div className="mock-note">
          <p className="muted">Thi full: làm đủ {fullMinutes} phút, hết giờ tự nộp. Đáp án được lưu tự động sau mỗi câu. {isIelts ? <>Band thi thử là <strong>band ước lượng để tham khảo</strong> (thang 0–9). Bài mini chỉ báo số câu đúng/tổng, không có band.</> : <>Điểm thi thử là <strong>điểm ước lượng</strong> (thang 10–990). Bài mini chỉ báo số câu đúng/tổng, không có điểm 10–990.</>}</p>
          {isIelts && <p className="muted">🎧 Thi thử: audio mỗi Section chỉ phát 1 lần — bấm nghe khi đã sẵn sàng làm các câu của Section đó.</p>}
        </div>
        <div className="btn-row"><button className="btn" disabled={busy} onClick={start}>{busy ? 'Đang tạo đề…' : 'Bắt đầu thi'}</button></div>
        <div className="mock-history">
          <h2>📜 Lịch sử thi thử</h2>
          {submittedHistory.length === 0 ? (
            <p className="muted">Chưa có bài thi thử nào — làm 1 bài để xem lịch sử nhé.</p>
          ) : (
            <table>
              <thead><tr><th>Ngày</th><th>Đề</th><th>Chế độ</th><th>{isIelts ? 'Band' : 'Điểm'}</th><th>Thời gian</th><th>Đúng</th><th></th></tr></thead>
              <tbody>
                {submittedHistory.map(a => {
                  const correct = (a.listeningCorrect ?? a.listening_correct ?? 0) + (a.readingCorrect ?? a.reading_correct ?? 0);
                  const total = a.questionCount ?? 0;
                  const score = isIelts
                    ? (a.overallBand != null ? `Band ${a.overallBand}` : '—')
                    : ((a.totalScore ?? a.total_score) != null ? `${a.totalScore ?? a.total_score}` : '—');
                  return (
                    <tr key={a.id}>
                      <td>{fmtMockDate(a.finishedAt || a.finished_at)}</td>
                      <td>{a.testSetId ? (testSetTitleById.get(a.testSetId) ?? a.testSetId) : 'Toàn bộ ngân hàng'}</td>
                      <td>{a.mode === 'mini' ? (a.part ? `Mini — ${partLabel(a.part, exam)}` : 'Mini') : 'Full'}</td>
                      <td>{score}{isIelts && a.overallBand != null ? <span className="muted"> (L {a.listeningBand ?? '—'} • R {a.readingBand ?? '—'})</span> : ''}</td>
                      <td>{fmtDur(a.durationSec ?? a.duration_sec)}</td>
                      <td>{total ? `${correct}/${total}` : `${correct}`}</td>
                      <td>
                        <div className="btn-row" style={{ margin: 0 }}>
                          <button className="btn secondary btn-sm" onClick={() => nav(`/result/${a.id}`)}>Xem lại</button>
                          <button className="btn secondary btn-sm" onClick={() => redoAttempt(a)}>Làm lại</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  if (!questions.length) return <LoadingLine location="page" text="Đang tải đề thi…" />;
  const answeredCount = Object.keys(answers).length;
  const unansweredCount = questions.length - answeredCount;

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

  // 1 nút nghe DUY NHẤT cho cả Part: khi có file audio cấp Part cho Part
  // đó — kể cả thi mini không kèm đề (backend chọn ngẫu nhiên 1 đề và
  // start() đã tải part-media của đề đó). Trước đây điều kiện còn đòi
  // testSetId trên URL nên thi mini rơi vào nhánh "nút nghe từng câu",
  // mà câu hỏi không có audio riêng (chỉ có file cấp Part) nên cùng 1
  // file audio lặp lại ở mọi câu. Đề chưa có audio Part (hoặc thi full
  // toàn ngân hàng, không có part-media) thì vẫn giữ nút nghe từng câu.
  const usePartAudioFor = (p: number) => p <= 4 && !!partMedia[p];

  // Audio thật để nghe cho 1 câu: file audio của câu, file audio cấp Part,
  // hoặc (TOEIC) transcript thật để đọc TTS. IELTS không dùng TTS (đọc
  // transcript thì lộ nội dung bài nghe) nên chỉ tính file audio thật.
  // Câu không có audio thật thì KHÔNG vẽ player từng câu nữa (trước đây
  // mỗi câu vẽ 1 hộp audio-missing chết) — xem thông báo thiếu audio ở
  // đầu Part trong renderPaper.
  const hasPlayableAudio = (q: Question) =>
    !!q.audioUrl || !!partMedia[q.part] || (exam === 'toeic' && !!ttsTextFor(q));
  // Part có audio thật để nghe không (để quyết định hiện thông báo thiếu audio).
  const partHasAudio = (p: number) =>
    !!partMedia[p] || questions.some(q => q.part === p && hasPlayableAudio(q));

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
          {q.part <= 4 && !usePartAudioFor(q.part) && hasPlayableAudio(q) && (
            <ListeningAudio
              // Ưu tiên: audio câu hỏi → audio đoạn văn đã gộp sẵn trong
              // q.audioUrl → audio cấp Part. Chỉ vẽ hộp này khi có audio
              // thật để nghe (file audio hoặc transcript thật để TTS);
              // câu không có audio thật thì không vẽ gì — thông báo thiếu
              // audio chỉ hiện 1 lần ở đầu Part (xem renderPaper).
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
    clearLocalTest();
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
          {showPart && block.part <= 4 && !usePartAudioFor(block.part) && !partHasAudio(block.part) && (
            <p className="muted">📌 {isIelts ? 'Bộ đề mẫu chưa có audio — bạn vẫn làm bài bình thường.' : `Part ${block.part} chưa có file audio — bạn vẫn làm bài bình thường.`}</p>
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
    <div className={`ts-${textLevel} exam-room exam-room--sidelayout exam-room--mockhead`}>
      {/* Thanh tiêu đề (Phương án A): tiêu đề + đồng hồ + icon ⋮, full
          chiều ngang (bằng cả 2 cột dưới cộng lại), bo góc như 1 thẻ.
          Đồng hồ nằm trong thanh tiêu đề dính để luôn thấy khi cuộn. */}
      <div className="exam-head exam-head--mock">
        <div className="exam-head-title">
          <h2 className="exam-part">{testSet ? testSet.title : 'Thi thử'}</h2>
        </div>
        <div className="exam-head-right">
          <span className={`save-indicator save-indicator--${saveState}`}
            title={saveState === 'saved' ? 'Mọi đáp án đã lưu lên máy chủ' : saveState === 'saving' ? 'Đang lưu đáp án…' : 'Mất kết nối — đáp án sẽ tự lưu lại khi có mạng'}>
            <span className="save-dot" />
            <span className="save-text">{saveState === 'saved' ? 'Đã lưu' : saveState === 'saving' ? 'Đang lưu…' : saveState === 'offline' ? 'Mất mạng — sẽ tự lưu lại' : 'Chưa lưu được — đang thử lại'}</span>
          </span>
          <span className={`timer-chip timer-chip--inline${secondsLeft < 300 ? ' low' : ''}`} title="Thời gian còn lại">⏱️ {fmt(secondsLeft)}</span>
          <div className="mock-menu-wrap" ref={menuRef}>
            <button type="button" className="icon-btn mock-menu-btn" aria-label="Mở menu thi thử" aria-haspopup="menu" aria-expanded={menuOpen}
              title="Mở menu thi thử" onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}>⋮</button>
            {menuOpen && (
              <div className="mock-menu" role="menu" aria-label="Menu thi thử">
                <p className="mock-menu-head">Đã trả lời {answeredCount}/{questions.length} câu</p>
                <button type="button" className="mock-menu-item" role="menuitem" onClick={submitFromMenu}>
                  {`✅ Nộp bài · ${answeredCount}/${questions.length} câu (còn ${unansweredCount} câu chưa làm)`}
                </button>
                <button type="button" className={`mock-menu-item mock-menu-item--exit${confirmExit ? ' mock-menu-item--armed' : ''}`} role="menuitem" onClick={() => void exitTest()}>
                  {confirmExit ? '⚠️ Bấm lại để thoát (sẽ hủy bài thi này)' : '🚪 Thoát (sẽ hủy bài thi này)'}
                </button>
                <button type="button" className="mock-menu-item mock-menu-item--close" role="menuitem" onClick={closeMenu}>Đóng</button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="mock-room-grid">
      <div className="exam-main">
        <ErrorBox error={error} />
        {restoredNotice && (
          <div className="mock-note">↩️ Đã khôi phục bài thi đang làm dở — đáp án và thời gian còn lại giữ nguyên.</div>
        )}
        <div className="paper">
          {renderPaper()}
        </div>
        {/* Chỉ còn bảng số câu + nút chuyển Part (IELTS) — thanh dưới cũ
            (số câu đã trả lời + Thoát/Nộp) đã dời vào menu ⋮ trên thanh
            tiêu đề. Màn rộng dùng cột phải nên dải này ẩn đi. */}
        <div className="mock-palette">
          <QuestionPalette items={paletteItems} onJump={jumpToQuestion} currentId={currentId} />
          {isIelts && partOrder.length > 1 && (
            <span className="btn-row" style={{ margin: 0 }}>
              <button className="btn btn-sm secondary" disabled={currentPartIdx <= 0}
                onClick={() => jumpToPart(partOrder[currentPartIdx - 1])}>← {currentPartIdx > 0 ? partLabel(partOrder[currentPartIdx - 1], exam) : ''}</button>
              <button className="btn btn-sm secondary" disabled={currentPartIdx < 0 || currentPartIdx >= partOrder.length - 1}
                onClick={() => jumpToPart(partOrder[currentPartIdx + 1])}>{currentPartIdx < partOrder.length - 1 ? partLabel(partOrder[currentPartIdx + 1], exam) : ''} →</button>
            </span>
          )}
        </div>
        <p className="muted" style={{ margin: '.45rem 0 0' }}>Nộp bài chỉ 1 lần. Hết giờ hệ thống tự nộp.</p>
      </div>
      {/* Cot phai: chi con bang cau hoi (+ chuyen Section/Passage) — tien
          do + nut Thoat/Nop da dời vào menu ⋮ trên thanh tiêu đề. */}
      <aside className="room-side">
        <h3 className="room-side-title">Câu hỏi</h3>
        <div className="room-side-palette">
          <QuestionPalette variant="side" items={paletteItems} onJump={jumpToQuestion} currentId={currentId} />
        </div>
        {isIelts && partOrder.length > 1 && (
          <div className="room-side-controls">
            <span className="btn-row" style={{ margin: 0 }}>
              <button className="btn btn-sm secondary" disabled={currentPartIdx <= 0}
                onClick={() => jumpToPart(partOrder[currentPartIdx - 1])}>← {currentPartIdx > 0 ? partLabel(partOrder[currentPartIdx - 1], exam) : ''}</button>
              <button className="btn btn-sm secondary" disabled={currentPartIdx < 0 || currentPartIdx >= partOrder.length - 1}
                onClick={() => jumpToPart(partOrder[currentPartIdx + 1])}>{currentPartIdx < partOrder.length - 1 ? partLabel(partOrder[currentPartIdx + 1], exam) : ''} →</button>
            </span>
          </div>
        )}
      </aside>
      </div>
    </div>
  );
}
