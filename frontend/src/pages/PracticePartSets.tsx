// Chọn 1 bộ đề để luyện 1 Part/Section — bước 2 của flow Luyện theo Part:
// Part → chọn đề → buổi luyện (1 Part của 1 đề). Buổi luyện chỉ có đúng
// 1 file audio cấp Part (part_media) nên nút "Nghe cả Part" ở
// PracticeSession hoạt động; đề nào chưa có câu cho Part này thì hiện
// "Chưa có câu" và không bấm được (không ẩn — để thấy rõ đề đó thiếu).
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, type TestSet } from '../api';
import { ErrorBox, partName, sectionOf } from '../components';
import { groupTestSetsByBook, partLabel, questionTypeName, useExam } from '../exam';
import { LoadingLine } from '../uiSettings';

export default function PracticePartSets() {
  const nav = useNavigate();
  const { part: partParam } = useParams<{ part: string }>();
  const [searchParams] = useSearchParams();
  const { exam: ctxExam } = useExam();
  const part = Number(partParam);
  const qExam = searchParams.get('exam');
  const exam = qExam === 'ielts' || qExam === 'toeic' ? qExam : ctxExam ?? 'toeic';
  const isIelts = exam === 'ielts';
  // Ý 4/Ý 5: luyện theo dạng — ?questionType=... được mang theo từ trang
  // kết quả / thống kê, gắn tiếp vào URL buổi luyện khi chọn đề (để buổi
  // luyện vẫn có testSetId → có audio cấp Part cho dạng nghe).
  const questionType = isIelts ? (searchParams.get('questionType') || '') : '';
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

  // Xếp theo tên (số tự nhiên: Test 04 trước Test 05) — giống lưới chọn đề
  // thi thử, để dễ quét mắt thay vì thứ tự ngày tạo lộn xộn.
  const sorted = [...testSets].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));

  const title = isIelts
    ? `${partLabel(part, exam)} — ${sectionOf(part)}`
    : partName(part);
  // Ý 2 (IELTS-only): gom nhóm đề theo sách Cambridge (như tab Bộ đề).
  const bookGroups = isIelts ? groupTestSetsByBook(sorted) : [];

  const renderSetCard = (ts: TestSet) => {
    const partCount = ts.parts.find(p => p.part === part)?.count ?? 0;
    const disabled = partCount === 0;
    const go = () => { if (!disabled) nav(`/practice/session?part=${part}&testSetId=${ts.id}&exam=${exam}${questionType ? `&questionType=${questionType}` : ''}`); };
    return (
      <button
        key={ts.id}
        type="button"
        className="pick-box"
        disabled={disabled}
        onClick={go}
      >
        <b>{ts.title}{!ts.isPublished && <> <span className="pill">NHÁP</span></>}</b>
        <span>{disabled ? 'Chưa có câu' : `${partCount} câu`}</span>
      </button>
    );
  };

  if (!partValid) {
    return (
      <div>
        <p><Link className="btn secondary btn-sm" to="/practice">← Quay lại chọn Part</Link></p>
        <div className="card"><p>Part không hợp lệ.</p></div>
      </div>
    );
  }

  return (
    <div>
      <p><Link className="btn secondary btn-sm" to="/practice">← Quay lại chọn Part</Link></p>
      <h1>{title}</h1>
      <p className="muted">Mỗi buổi là 1 {isIelts ? 'Section/Passage' : 'Part'} của 1 đề.{questionType ? <> Đang luyện riêng dạng: <strong>{questionTypeName(questionType)}</strong>.</> : ''}</p>
      <ErrorBox error={error} />
      {loading && <LoadingLine location="table" text="Đang tải danh sách bộ đề…" />}
      {!loading && !testSets.length && !error && (
        <div className="card"><p>Chưa có bộ đề nào.</p></div>
      )}
      {isIelts ? (
        bookGroups.map(g => (
          <details className="book-group" key={g.label} open>
            <summary>{g.label} <span className="muted">({g.sets.length} đề)</span></summary>
            <div className="pick-grid" style={{ marginTop: '.5rem' }}>
              {g.sets.map(renderSetCard)}
            </div>
          </details>
        ))
      ) : (
        <div className="pick-grid">
          {sorted.map(renderSetCard)}
        </div>
      )}
    </div>
  );
}
