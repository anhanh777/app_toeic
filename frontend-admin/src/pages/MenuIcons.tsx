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

/* Biểu tượng menu trang chủ — chỉ admin: chọn emoji cho 12 mục menu
   (Hôm nay, Luyện tập, Thi thử, …). Lưu vào backend
   (GET /api/menu-icons công khai, PUT /api/admin/menu-icons chỉ admin),
   cả 2 app đọc động lúc mở — đổi là có hiệu lực ngay, không cần
   deploy lại code. Bảng chọn dùng chung 1 bảng emoji cho mọi mục. */
const EMOJI_OPTIONS = [
  '📅', '✏️', '⏱️', '❌', '📖', '🏆', '⚙️', '🧭', '🐉', '✍️', '🎤', '📝',
  '🎯', '⭐', '💡', '🚀', '🎓', '📚', '🌸', '🔥', '🎨', '✅',
];

export default function MenuIcons() {
  const [doc, setDoc] = useState<MenuIconsDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState<unknown>(null);

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

      <div className="card">
        {MENU_ICON_KEYS.map(key => (
          <div
            key={key}
            style={{ display: 'flex', alignItems: 'center', gap: '.8rem', flexWrap: 'wrap', padding: '.6rem 0', borderBottom: '1px solid var(--border)' }}
          >
            <span
              aria-hidden="true"
              style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, lineHeight: 1, flexShrink: 0 }}
            >
              {doc[key]}
            </span>
            <span style={{ fontWeight: 600, minWidth: 150 }}>{MENU_ICON_LABELS[key]}</span>
            <div className="btn-row" role="radiogroup" aria-label={`Biểu tượng cho ${MENU_ICON_LABELS[key]}`}>
              {EMOJI_OPTIONS.map(e => (
                <button
                  key={e} type="button" className="btn secondary btn-sm"
                  aria-label={`Chọn emoji ${e} cho ${MENU_ICON_LABELS[key]}`}
                  aria-pressed={doc[key] === e}
                  style={doc[key] === e
                    ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px var(--accent-soft-strong)', fontSize: '1.2rem' }
                    : { fontSize: '1.2rem' }}
                  onClick={() => update(key, e)}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="btn-row" style={{ marginTop: '1rem' }}>
          <button className="btn" type="button" disabled={saving} onClick={() => void save()}>
            {saving ? 'Đang lưu…' : 'Lưu biểu tượng menu'}
          </button>
          <button className="btn secondary" type="button" disabled={saving} onClick={() => void resetDefaults()}>
            Khôi phục mặc định
          </button>
        </div>
      </div>
    </div>
  );
}
