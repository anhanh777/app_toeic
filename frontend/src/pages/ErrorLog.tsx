// Sổ lỗi IELTS (Giai đoạn 1, v3) — IELTS-only.
// (a) hàng đợi ôn đến hạn, (b) toàn bộ lỗi + lọc theo skill/mã,
// (c) biểu đồ lỗi theo tuần (CSS bars), (d) quái (monsters) với HP,
// (e) thêm lỗi thủ công (dùng cho Writing/Speaking — ghi tay).
import { useEffect, useState } from 'react';
import { api, type ErrorLogEntry, type Monster, type WeeklyError } from '../api';
import { ErrorBox } from '../components';
import { questionTypeName } from '../exam';
import { codesForSkill, errorCodeName, SKILL_EMOJI, SKILL_LABEL } from '../ielts-phase1';

export default function ErrorLog() {
  const [due, setDue] = useState<ErrorLogEntry[]>([]);
  const [all, setAll] = useState<ErrorLogEntry[]>([]);
  const [weekly, setWeekly] = useState<WeeklyError[]>([]);
  const [monsters, setMonsters] = useState<Monster[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [filterSkill, setFilterSkill] = useState('');
  const [filterCode, setFilterCode] = useState('');
  const [xpNote, setXpNote] = useState('');

  const load = () => {
    api.errorLogDue().then(setDue).catch(setError);
    api.errorLog().then(setAll).catch(setError);
    api.errorLogWeekly().then(setWeekly).catch(() => undefined);
    api.monsters().then(setMonsters).catch(() => undefined);
  };
  useEffect(load, []);

  const review = async (id: number, correct: boolean) => {
    try {
      const r = await api.reviewError(id, correct);
      setDue(prev => prev.filter(i => i.id !== id));
      setXpNote(correct ? `✅ Ghi nhận đúng!${r.xpAwarded ? ` +${r.xpAwarded} XP` : ''}` : 'Đã ghi nhận — lỗi này sẽ được nhắc lại sau.');
      load();
    } catch (e) { setError(e); }
  };

  const filtered = all.filter(i =>
    (!filterSkill || i.skill === filterSkill) && (!filterCode || i.errorCode === filterCode));
  const killed = monsters.filter(m => m.killed);
  const maxWeekly = Math.max(1, ...weekly.map(w => w.count));
  // Gom lỗi tuần theo nhóm mã (VD "L*" / "R*") để vẽ 6 tuần gần nhất.
  const weekGroups = new Map<string, number>();
  weekly.forEach(w => weekGroups.set(w.week, (weekGroups.get(w.week) ?? 0) + w.count));
  const lastWeeks = [...weekGroups.entries()].slice(-6);

  return (
    <div>
      <div className="hero">
        <h1>📓 Sổ lỗi IELTS</h1>
        <p className="sub">Mỗi lỗi là 1 con quái — ôn đúng thì quái mất máu, ôn đủ 3 lần thì quái bị diệt.</p>
      </div>
      <ErrorBox error={error} />
      {xpNote && <p style={{ color: 'var(--green-ink)' }}>{xpNote}</p>}

      <div className="card">
        <h2>(a) Ôn lỗi đến hạn ({due.length})</h2>
        {!due.length && <p className="muted">🎉 Không có lỗi nào đến hạn hôm nay.</p>}
        {due.map(it => (
          <ErrorItem key={it.id} it={it} onReview={review} />
        ))}
      </div>

      <div className="card">
        <h2>(b) Tất cả lỗi ({filtered.length}/{all.length})</h2>
        <div className="btn-row" style={{ flexWrap: 'wrap', alignItems: 'end' }}>
          <span>
            <label htmlFor="flt-skill">Kỹ năng</label>
            <select id="flt-skill" value={filterSkill} onChange={e => { setFilterSkill(e.target.value); setFilterCode(''); }}>
              <option value="">Tất cả</option>
              {Object.entries(SKILL_LABEL).map(([k, v]) => <option key={k} value={k}>{SKILL_EMOJI[k]} {v}</option>)}
            </select>
          </span>
          <span>
            <label htmlFor="flt-code">Mã lỗi</label>
            <select id="flt-code" value={filterCode} onChange={e => setFilterCode(e.target.value)}>
              <option value="">Tất cả</option>
              {(filterSkill ? codesForSkill(filterSkill) : []).map(c => (
                <option key={c.code} value={c.code}>{c.code} · {c.name}</option>
              ))}
            </select>
          </span>
        </div>
        {filtered.slice(0, 50).map(it => <ErrorItem key={it.id} it={it} />)}
        {filtered.length > 50 && <p className="muted">Hiển thị 50 lỗi đầu tiên.</p>}
      </div>

      <div className="card">
        <h2>(c) Lỗi theo tuần (6 tuần gần nhất)</h2>
        {!lastWeeks.length && <p className="muted">Chưa có dữ liệu lỗi theo tuần.</p>}
        {lastWeeks.map(([week, count]) => (
          <div key={week} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.3rem' }}>
            <span style={{ minWidth: '6rem' }}>{week}</span>
            <div className="bar" style={{ flex: 1 }}><i style={{ width: `${(count / maxWeekly) * 100}%` }} /></div>
            <span>{count}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>(d) Quái — đã diệt {killed.length}/{monsters.length} 👹</h2>
        {!monsters.length && <p className="muted">Chưa có quái nào — làm sai 1 câu và ghi nguyên nhân là quái xuất hiện.</p>}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))' }}>
          {monsters.map(m => (
            <div key={m.code} className={`card monster-card${m.killed ? ' monster-killed' : ''}`} style={{ marginBottom: 0 }}>
              <div className="monster-ico">{SKILL_EMOJI[m.skill] ?? '👹'}</div>
              <strong>{m.code} — {m.name}</strong>
              <p className="muted" style={{ margin: 0 }}>{SKILL_LABEL[m.skill] ?? m.skill} · {m.hits} lần mắc · {m.resolved}/{m.total} lần sửa đúng</p>
              <div className="hp-bar" role="img" aria-label={`Máu quái ${m.hp}/3`}>
                <i style={{ width: `${Math.max(0, Math.min(3, m.hp)) / 3 * 100}%` }} />
              </div>
              <p style={{ margin: 0 }}>{m.killed ? '✅ Đã diệt ✓' : `HP: ${m.hp}/3`}</p>
            </div>
          ))}
        </div>
        {killed.length > 0 && (
          <p style={{ marginTop: '.8rem' }}>🏆 <strong>Bộ sưu tập quái đã diệt ({killed.length}):</strong> {killed.map(m => `${m.code} ${m.name}`).join(' · ')}</p>
        )}
      </div>

      <ManualErrorForm onAdded={load} />
    </div>
  );
}

function ErrorItem({ it, onReview }: { it: ErrorLogEntry; onReview?: (id: number, correct: boolean) => void }) {
  return (
    <div className="panel" style={{ marginBottom: '.5rem' }}>
      <p style={{ margin: '.1rem 0' }}>
        <strong>{errorCodeName(it.errorCode)}</strong> · {SKILL_EMOJI[it.skill] ?? ''} {SKILL_LABEL[it.skill] ?? it.skill}
        {it.questionType ? ` · ${questionTypeName(it.questionType)}` : ''}
        {it.guessed ? ' · 🤔 đoán mò' : ''}
      </p>
      {it.evidence && <p className="muted" style={{ margin: '.1rem 0' }}>{it.evidence}</p>}
      {it.missedKeyword && <p className="muted" style={{ margin: '.1rem 0' }}>Từ bỏ lỡ: <strong>{it.missedKeyword}</strong></p>}
      {it.createdAt && <p className="muted" style={{ margin: '.1rem 0' }}>{new Date(it.createdAt).toLocaleDateString('vi-VN')}</p>}
      {onReview && (
        <div className="btn-row">
          <button className="btn btn-sm" onClick={() => void onReview(it.id, true)}>Tôi đã làm đúng ✓</button>
          <button className="btn btn-sm secondary" onClick={() => void onReview(it.id, false)}>Vẫn sai ✗</button>
        </div>
      )}
    </div>
  );
}

/* (e) Thêm lỗi thủ công — chủ yếu cho Writing/Speaking (ghi tay). */
function ManualErrorForm({ onAdded }: { onAdded: () => void }) {
  const [skill, setSkill] = useState('writing');
  const [code, setCode] = useState('W1');
  const [evidence, setEvidence] = useState('');
  const [missedKeyword, setMissedKeyword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const codes = codesForSkill(skill);
  useEffect(() => { if (!codes.some(c => c.code === code)) setCode(codes[0]?.code ?? ''); }, [skill]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setSaving(true); setError(null); setDone(false);
    try {
      await api.logError({ skill, errorCode: code, evidence: evidence || undefined, missedKeyword: missedKeyword || undefined });
      setDone(true); setEvidence(''); setMissedKeyword('');
      onAdded();
    } catch (e) { setError(e); } finally { setSaving(false); }
  };

  return (
    <div className="card">
      <h2>(e) Thêm lỗi thủ công</h2>
      <p className="muted">Dùng khi tự phát hiện lỗi ở Writing/Speaking (hoặc lỗi ngoài bài luyện) — ghi tay vào sổ.</p>
      <ErrorBox error={error} />
      <label htmlFor="me-skill">Kỹ năng</label>
      <select id="me-skill" value={skill} onChange={e => setSkill(e.target.value)}>
        {Object.entries(SKILL_LABEL).map(([k, v]) => <option key={k} value={k}>{SKILL_EMOJI[k]} {v}</option>)}
      </select>
      <label htmlFor="me-code">Mã lỗi</label>
      <select id="me-code" value={code} onChange={e => setCode(e.target.value)}>
        {codes.map(c => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
      </select>
      <label htmlFor="me-evidence">Bằng chứng (câu/ví dụ cụ thể)</label>
      <textarea id="me-evidence" rows={2} value={evidence} onChange={e => setEvidence(e.target.value)} placeholder="VD: Viết 'more better' trong Task 2…" />
      <label htmlFor="me-keyword">Từ khóa bỏ lỡ (nếu có)</label>
      <input id="me-keyword" value={missedKeyword} onChange={e => setMissedKeyword(e.target.value)} placeholder="VD: furthermore" />
      <div className="btn-row" style={{ marginTop: '.6rem' }}>
        <button className="btn btn-sm" disabled={saving || !code} onClick={() => void submit()}>
          {saving ? 'Đang ghi…' : 'Ghi lỗi vào sổ'}
        </button>
      </div>
      {done && <p style={{ color: 'var(--green-ink)' }}>✅ Đã ghi lỗi vào sổ.</p>}
    </div>
  );
}
