import { useEffect, useState } from 'react';
import { api } from '../api';
import { ErrorBox } from '../components';
import {
  MENU_ICON_DEFAULTS,
  MENU_ICON_KEYS,
  MENU_ICON_LABELS,
  normalizeMenuIcons,
  type MenuIconKey,
  type MenuIconsDoc,
} from '../menuIcons';

/* Biểu tượng menu trang chủ — chỉ admin: chọn emoji cho 17 mục
   (12 mục menu + Trang chủ, Thống kê, nút Đổi bài thi, thẻ TOEIC/IELTS).
   Lưu vào backend (GET /api/menu-icons công khai, PUT /api/admin/menu-icons
   chỉ admin), cả 2 app đọc động lúc mở — đổi là có hiệu lực ngay, không cần
   deploy lại code. Mỗi mục là 1 box chữ nhật: trên là biểu tượng hiện
   tại (to), dưới là bảng chọn (nhỏ hơn) + ô dán emoji khác ngoài bảng. */
const EMOJI_OPTIONS = [
  '📅', '✏️', '⏱️', '❌', '📖', '🏆', '⚙️', '🧭', '🐉', '✍️', '🎤', '📝',
  '🎯', '⭐', '💡', '🚀', '🎓', '📚', '🌸', '🔥', '🎨', '✅',
  '🏠', '📊', '🔄',
];

export default function MenuIcons() {
  const [doc, setDoc] = useState<MenuIconsDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [custom, setCustom] = useState<Partial<Record<MenuIconKey, string>>>({});

  useEffect(() => {
    api.adminMenuIcons()
      .then(d => setDoc(normalizeMenuIcons(d)))
      .catch(err => { setError(err); setDoc(MENU_ICON_DEFAULTS); })
      .finally(() => setLoading(false));
  }, []);

  const update = (key: MenuIconKey, icon: string) => {
    setDoc(prev => (prev ? { ...prev, [key]: icon } : prev));
    setMsg('');
  };

  // Dán emoji ngoài bảng chọn (giới hạn như backend: 1–10 code point).
  const applyCustom = (key: MenuIconKey) => {
    const value = (custom[key] ?? '').trim();
    const len = [...value].length;
    if (len < 1 || len > 10) {
      setError(new Error('Emoji không hợp lệ — dán đúng 1 emoji thôi nhé.'));
      return;
    }
    setError(null);
    update(key, value);
    setCustom(prev => ({ ...prev, [key]: '' }));
  };

  const save = async (toSave?: MenuIconsDoc): Promise<boolean> => {
    const target = toSave || doc;
    if (!target) return false;
    setError(null); setMsg(''); setSaving(true);
    try {
      const saved = await api.adminSaveMenuIcons(normalizeMenuIcons(target));
      setDoc(normalizeMenuIcons(saved));
      setMsg('Đã lưu biểu tượng menu — web và app sẽ dùng ngay khi mở lại.');
      return true;
    } catch (err) { setError(err); return false; } finally { setSaving(false); }
  };

  const resetDefaults = async () => {
    setDoc(MENU_ICON_DEFAULTS);
    if (await save(MENU_ICON_DEFAULTS)) setMsg('Đã khôi phục biểu tượng menu mặc định.');
  };

  if (loading) return <div><h1>🎨 Biểu tượng menu</h1><p>Đang tải biểu tượng menu…</p></div>;
  if (!doc) return <div><h1>🎨 Biểu tượng menu</h1><ErrorBox error={error} /><p className="muted">Không tải được biểu tượng menu.</p></div>;

  return (
    <div>
      <h1>🎨 Biểu tượng menu</h1>
      <p className="muted">
        Emoji hiển thị trước tên từng mục menu trên trang chủ app học viên.
        Lưu vào backend nên đổi là có hiệu lực ngay, không cần deploy lại code.
      </p>
      <ErrorBox error={error} />
      {msg && <div className="success">{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        {MENU_ICON_KEYS.map(key => (
          <div key={key} className="card" style={{ padding: '1rem' }}>
            {/* Trên: biểu tượng hiện tại (to) + tên mục */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '.8rem', paddingBottom: '.8rem', borderBottom: '1px solid var(--border)', marginBottom: '.8rem' }}>
              <span
                aria-hidden="true"
                style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, lineHeight: 1, flexShrink: 0 }}
              >
                {doc[key]}
              </span>
              <div>
                <div style={{ fontWeight: 700 }}>{MENU_ICON_LABELS[key]}</div>
                <div className="muted" style={{ fontSize: '.85rem' }}>Biểu tượng hiện tại</div>
              </div>
            </div>
            {/* Dưới: danh sách chọn (nhỏ hơn icon ở trên) */}
            <div className="btn-row" role="radiogroup" aria-label={`Biểu tượng cho ${MENU_ICON_LABELS[key]}`}>
              {EMOJI_OPTIONS.map(e => (
                <button
                  key={e} type="button" className="btn secondary btn-sm"
                  aria-label={`Chọn emoji ${e} cho ${MENU_ICON_LABELS[key]}`}
                  aria-pressed={doc[key] === e}
                  style={doc[key] === e
                    ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px var(--accent-soft-strong)', fontSize: '1rem', padding: '.2rem .4rem' }
                    : { fontSize: '1rem', padding: '.2rem .4rem' }}
                  onClick={() => update(key, e)}
                >
                  {e}
                </button>
              ))}
            </div>
            {/* Thêm emoji ngoài bảng chọn */}
            <div style={{ display: 'flex', gap: '.4rem', marginTop: '.6rem' }}>
              <input
                type="text"
                value={custom[key] ?? ''}
                maxLength={10}
                placeholder="Dán emoji khác…"
                aria-label={`Emoji khác cho ${MENU_ICON_LABELS[key]}`}
                onChange={e => setCustom(prev => ({ ...prev, [key]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyCustom(key); } }}
                style={{ flex: 1, minWidth: 0 }}
              />
              <button className="btn secondary btn-sm" type="button" onClick={() => applyCustom(key)}>
                ✓ Dùng
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="btn-row" style={{ marginTop: '1rem' }}>
        <button className="btn" type="button" disabled={saving} onClick={() => void save()}>
          {saving ? 'Đang lưu…' : 'Lưu biểu tượng menu'}
        </button>
        <button className="btn secondary" type="button" disabled={saving} onClick={() => void resetDefaults()}>
          Khôi phục mặc định
        </button>
      </div>
    </div>
  );
}
