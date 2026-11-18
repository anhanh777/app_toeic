// Chọn 1 bộ đề để luyện 1 Part/Section — bước 2 của flow Luyện theo Part:
// Part → chọn đề → buổi luyện (1 Part của 1 đề). Buổi luyện chỉ có đúng
// 1 file audio cấp Part (part_media) nên nút "Nghe cả Part" ở
// PracticeSession hoạt động; đề nào chưa có câu cho Part này thì hiện
// "Chưa có câu" và không bấm được (không ẩn — để thấy rõ đề đó thiếu).
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, type TestSet } from '../api';
import { ErrorBox, partName, sectionOf } from '../components';
import { partLabel, partNameFor, useExam } from '../exam';
import { LoadingLine, useUiSettings } from '../uiSettings';

export default function PracticePartSets() {
  const nav = useNavigate();
  const { part: partParam } = useParams<{ part: string }>();
  const [searchParams] = useSearchParams();
  const { exam: ctxExam } = useExam();
  const { settings } = useUiSettings();
  const part = Number(partParam);
  const qExam = searchParams.get('exam');
  const exam = qExam === 'ielts' || qExam === 'toeic' ? qExam : ctxExam ?? 'toeic';
  const isIelts = exam === 'ielts';
  const partValid = Number.isInteger(part) && part >= 1 && part <= 7;
  const [testSets, setTestSets] = useState<TestSet[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!partValid) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    api.testSets(exam).then(setTestSets).catch(setError).finally(() => setLoading(false));
  }, [exam, partValid]);

  // Mới nhất trước: createdAt giảm dần, không có createdAt thì id giảm dần.
  const sorted = [...testSets].sort((a, b) =>
    (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0)
    || (b.id < a.id ? -1 : b.id > a.id ? 1 : 0));

  const title = isIelts
    ? `${partLabel(part, exam)} — ${sectionOf(part)}`
    : partName(part);
  const shortLabel = isIelts ? partNameFor(part, exam) : partName(part);

  if (!partValid) {
    return (
      <div>
        <p><Link to="/practice">← Quay lại chọn Part</Link></p>
        <div className="card"><p>Part không hợp lệ.</p></div>
      </div>
    );
  }

  return (
    <div>
      <p><Link to="/practice">← Quay lại chọn Part</Link></p>
      <h1>{title}</h1>
      <p className="muted">Chọn 1 đề để luyện {shortLabel} — mỗi buổi là 1 {isIelts ? 'Section/Passage' : 'Part'} của 1 đề, có đủ audio.</p>
      <ErrorBox error={error} />
      {loading && <LoadingLine effect={settings.ui.loading.table} speed={settings.ui.loading.speed} text="Đang tải danh sách bộ đề…" />}
      {!loading && !testSets.length && !error && (
        <div className="card"><p>Chưa có bộ đề nào.</p></div>
      )}
      <div className="grid">
        {sorted.map(ts => {
          const partCount = ts.parts.find(p => p.part === part)?.count ?? 0;
          const total = ts.totalQuestions || 0;
          const disabled = partCount === 0;
          const go = () => { if (!disabled) nav(`/practice/session?part=${part}&testSetId=${ts.id}&exam=${exam}`); };
          return (
            <div
              key={ts.id}
              className="card part-card"
              role={disabled ? undefined : 'button'}
              tabIndex={disabled ? undefined : 0}
              aria-disabled={disabled}
              onClick={go}
              onKeyDown={e => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) go(); }}
              style={disabled ? { opacity: 0.6 } : undefined}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', flexWrap: 'wrap' }}>
                <strong>{ts.title} <span className="muted" style={{ fontWeight: 500 }}>· {partCount} câu {shortLabel}</span></strong>
                {!ts.isPublished && <span className="pill">NHÁP</span>}
              </div>
              <p className="muted" style={{ margin: 0 }}>{total} câu cả đề</p>
              {disabled ? (
                <p className="muted" style={{ margin: 0 }}>Chưa có câu</p>
              ) : (
                <div className="btn-row">
                  <button className="btn btn-sm" onClick={e => { e.stopPropagation(); go(); }}>
                    ▶ Luyện {shortLabel}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
