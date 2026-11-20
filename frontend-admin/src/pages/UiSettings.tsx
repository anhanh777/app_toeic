import { useEffect, useState } from 'react';
import { api } from '../api';
import { ErrorBox } from '../components';
import {
  ACCENT_PRESETS,
  LOADING_EFFECTS,
  LoadingEffect,
  UI_SETTINGS_DEFAULTS,
  normalizeSettings,
  useUiSettings,
  type LoadingEffectId,
  type LoadingLocation,
  type UiSettings,
} from '../uiSettings';

/* Cài đặt giao diện (scope C) — chỉ admin: màu chủ đạo, cỡ chữ cơ sở,
   hiệu ứng loading từng vị trí, tốc độ, câu chờ máy chủ. Lưu vào backend
   (bang app_settings), cả 2 app đọc động lúc mở — đổi là có hiệu lực ngay,
   không cần deploy lại code.
   LƯU Ý: fontScale chỉ là CỠ CHỮ CƠ SỞ. Người học vẫn tự chọn cỡ chữ
   riêng bằng nút 🔠 (localStorage app_text_size); cỡ chữ hiệu dụng =
   fontScale × hệ số mức của người học. Trang này không động gì đến
   lựa chọn đó. */
const EFFECT_OPTIONS: Record<LoadingLocation, LoadingEffectId[]> = {
  loginButton: ['spinner', 'dual-ring', 'bouncing-dots'],
  page: ['spinner', 'dual-ring', 'bouncing-dots', 'progress-bar'],
  table: ['skeleton', 'spinner', 'bouncing-dots'],
};

const LOCATION_LABELS: Record<LoadingLocation, string> = {
  loginButton: 'Nút đăng nhập',
  page: 'Mở trang / chờ máy chủ',
  table: 'Danh sách / bảng đang tải',
};

type UiStyleId = 'pastel' | 'lively';

/** Phong cách giao diện — contract với uiSettings.tsx (field `ui.style`,
 *  mặc định 'pastel'). Trang này đọc/ghi kiểu "mềm" (ép kiểu cục bộ, xem
 *  updateStyle và uiStyle bên dưới) để biên dịch được cả khi field chưa
 *  có trong type UiSettings lẫn sau khi đã được thêm vào. */
const STYLE_OPTIONS: { id: UiStyleId; name: string; desc: string; accent: string }[] = [
  { id: 'pastel', name: 'Pastel nhẹ nhàng', desc: 'Giao diện hiện tại: nền kem ấm, thẻ trắng, màu sage dịu.', accent: '#5FA8A0' },
  { id: 'lively', name: 'Sống động', desc: 'Kiểu Duolingo: xanh lá tươi, nút nổi, gamified (streak, xu, nhiệm vụ).', accent: '#58CC02' },
];

export default function UiSettings() {
  const { applySettings } = useUiSettings();
  const [doc, setDoc] = useState<UiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.adminUiSettings()
      .then(d => setDoc(normalizeSettings(d)))
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  const update = (patch: Partial<UiSettings['ui']>) => {
    setDoc(prev => (prev ? { ui: { ...prev.ui, ...patch } } : prev));
    setMsg('');
  };
  const updateLoading = (patch: Partial<UiSettings['ui']['loading']>) => {
    setDoc(prev => (prev ? { ui: { ...prev.ui, loading: { ...prev.ui.loading, ...patch } } } : prev));
    setMsg('');
  };

  /** Ghi `ui.style` ('pastel' | 'lively') vào doc — doc này được nút Lưu
   *  PUT nguyên vẹn cùng các field khác (xem save()). Ép kiểu cục bộ vì
   *  field thuộc contract đang được thêm vào UiSettings; sau khi type đã
   *  có field thì phép ép vẫn biên dịch bình thường. */
  const updateStyle = (next: UiStyleId) => {
    setDoc(prev => (prev ? { ...prev, ui: { ...prev.ui, style: next } as UiSettings['ui'] } : prev));
    setMsg('');
  };

  const save = async (toSave?: UiSettings) => {
    const target = toSave || doc;
    if (!target) return;
    setError(null); setMsg(''); setSaving(true);
    try {
      const saved = await api.adminSaveUiSettings(normalizeSettings(target));
      const normalized = normalizeSettings(saved);
      setDoc(normalized);
      applySettings(normalized);
      setMsg('Đã lưu cài đặt giao diện — cả 2 app sẽ dùng ngay khi mở lại.');
    } catch (err) { setError(err); } finally { setSaving(false); }
  };

  const resetDefaults = () => {
    setDoc(UI_SETTINGS_DEFAULTS);
    void save(UI_SETTINGS_DEFAULTS);
    setMsg('Đã khôi phục cài đặt mặc định.');
  };

  if (loading) return <div><h1>🎨 Cài đặt giao diện</h1><p>Đang tải cài đặt…</p></div>;
  if (!doc) return <div><h1>🎨 Cài đặt giao diện</h1><ErrorBox error={error} /><p className="muted">Không tải được cài đặt.</p></div>;

  const { accent, fontScale, loading: loadingCfg } = doc.ui;
  /* Field `ui.style` theo contract — doc cũ chưa có thì mặc định 'pastel'. */
  const uiStyle: UiStyleId = (doc.ui as UiSettings['ui'] & { style?: UiStyleId }).style ?? 'pastel';

  return (
    <div>
      <h1>🎨 Cài đặt giao diện</h1>
      <p className="muted">
        Phong cách, màu chủ đạo, cỡ chữ cơ sở và hiệu ứng loading cho cả 2 app (học viên + quản trị).
        Lưu vào backend nên đổi là có hiệu lực ngay, không cần deploy lại code.
        Cỡ chữ ở đây chỉ là cỡ cơ sở — người học vẫn giữ nút 🔠 chọn cỡ chữ riêng của mình.
      </p>
      <ErrorBox error={error} />
      {msg && <div className="success">{msg}</div>}

      <div className="split-even">
        <div className="card">
          <h2>Màu chủ đạo</h2>
          <div className="btn-row" style={{ alignItems: 'center' }}>
            <input
              type="color" value={accent} aria-label="Chọn màu chủ đạo"
              onChange={e => update({ accent: e.target.value })}
              style={{ width: '3rem', height: '2.4rem', padding: 0 }}
            />
            <span style={{ fontWeight: 700 }}>{accent}</span>
          </div>
          <div className="btn-row" style={{ marginTop: '.6rem' }}>
            {ACCENT_PRESETS.map(p => (
              <button
                key={p.value} type="button" className="btn secondary btn-sm"
                title={p.name}
                style={accent === p.value ? { borderColor: p.value, boxShadow: `0 0 0 2px ${p.value}55` } : undefined}
                onClick={() => update({ accent: p.value })}
              >
                <span aria-hidden="true" style={{ display: 'inline-block', width: '.8rem', height: '.8rem', borderRadius: '50%', background: p.value, verticalAlign: '-.05rem', marginRight: '.3rem' }} />
                {p.name}
              </button>
            ))}
          </div>

          <h2 style={{ marginTop: '1.2rem' }}>🎨 Phong cách</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Pastel là giao diện hiện tại. Sống động đổi sang kiểu Duolingo: xanh lá tươi, nút nổi, gamified.
            Đổi phong cách không làm mất màu chủ đạo đã lưu.
          </p>
          <div className="btn-row" role="radiogroup" aria-label="Phong cách giao diện" style={{ alignItems: 'stretch' }}>
            {STYLE_OPTIONS.map(o => (
              <button
                key={o.id} type="button" role="radio" aria-checked={uiStyle === o.id}
                className="btn secondary"
                style={uiStyle === o.id
                  ? { borderColor: o.accent, boxShadow: `0 0 0 2px ${o.accent}55`, textAlign: 'left' }
                  : { textAlign: 'left' }}
                onClick={() => updateStyle(o.id)}
              >
                <span style={{ display: 'block', fontWeight: 700 }}>
                  {o.id === 'pastel' ? '🌸' : '🚀'} {o.name}{uiStyle === o.id ? ' ✓' : ''}
                </span>
                <span className="muted" style={{ display: 'block', fontWeight: 400, fontSize: '.85rem', marginTop: '.2rem' }}>
                  {o.desc}
                </span>
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block', marginTop: '.5rem', padding: '.35rem 1rem',
                    borderRadius: o.id === 'lively' ? 12 : 8, background: o.accent, color: '#fff',
                    fontWeight: 700, boxShadow: o.id === 'lively' ? '0 4px 0 #46A302' : 'none',
                  }}
                >
                  Nút mẫu
                </span>
              </button>
            ))}
          </div>

          <h2 style={{ marginTop: '1.2rem' }}>Cỡ chữ cơ sở</h2>
          <label>Cỡ chữ cơ sở: <b>{fontScale.toFixed(2)}×</b> <span className="muted">(0.90 – 1.15; nhân với mức 🔠 của từng người)</span></label>
          <input
            type="range" min={0.9} max={1.15} step={0.05} value={fontScale}
            onChange={e => update({ fontScale: Number(e.target.value) })}
            aria-label="Cỡ chữ cơ sở"
          />
          <p style={{ fontSize: `calc(1rem * ${fontScale})` }}>
            Chữ mẫu ở cỡ {fontScale.toFixed(2)}× — đoạn văn, câu hỏi và phương án sẽ to/nhỏ theo tỉ lệ này.
          </p>

          <h2 style={{ marginTop: '1.2rem' }}>Hiệu ứng loading</h2>
          {(Object.keys(LOCATION_LABELS) as LoadingLocation[]).map(loc => (
            <div key={loc}>
              <label>{LOCATION_LABELS[loc]}</label>
              <select
                value={loadingCfg[loc]}
                onChange={e => updateLoading({ [loc]: e.target.value as LoadingEffectId })}
              >
                {EFFECT_OPTIONS[loc].map(id => (
                  <option key={id} value={id}>{LOADING_EFFECTS[id].label}</option>
                ))}
              </select>
            </div>
          ))}
          <label>Tốc độ hiệu ứng: <b>{loadingCfg.speed.toFixed(2)}×</b> <span className="muted">(0.5 chậm – 2 nhanh)</span></label>
          <input
            type="range" min={0.5} max={2} step={0.25} value={loadingCfg.speed}
            onChange={e => updateLoading({ speed: Number(e.target.value) })}
            aria-label="Tốc độ hiệu ứng"
          />
          <label>Câu chờ khi máy chủ đang khởi động</label>
          <input
            type="text" value={loadingCfg.text} maxLength={120}
            onChange={e => updateLoading({ text: e.target.value })}
            placeholder="Máy chủ đang khởi động, chờ một chút nhé…"
          />

          <div className="btn-row" style={{ marginTop: '1rem' }}>
            <button className="btn" type="button" disabled={saving} onClick={() => void save()}>
              {saving ? 'Đang lưu…' : 'Lưu cài đặt'}
            </button>
            <button className="btn secondary" type="button" disabled={saving} onClick={resetDefaults}>
              Khôi phục mặc định
            </button>
          </div>
        </div>

        <div className="card">
          <h2>Xem trước (chưa lưu)</h2>
          <p className="muted">Hiệu ứng và màu dưới đây dùng đúng giá trị đang chọn ở cột bên — chưa lưu thì app thật vẫn dùng cài đặt cũ.</p>
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '1rem', background: 'var(--surface-soft)' }}>
            <button
              type="button" className="btn btn-block"
              style={{ background: accent, borderColor: accent }}
              disabled
            >
              <LoadingEffect effect={loadingCfg.loginButton} speed={loadingCfg.speed} size="sm" /> Đang đăng nhập…
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.6rem', padding: '1rem 0' }}>
              <LoadingEffect effect={loadingCfg.page} speed={loadingCfg.speed} size="lg" />
              <span className="muted">{loadingCfg.text}</span>
            </div>
            <div>
              <p className="muted" style={{ margin: '0 0 .5rem' }}>Danh sách đang tải:</p>
              <LoadingEffect effect={loadingCfg.table} speed={loadingCfg.speed} />
            </div>
            <p style={{ fontSize: `calc(1rem * ${fontScale})`, margin: '1rem 0 0' }}>
              Chữ mẫu cỡ {fontScale.toFixed(2)}× với màu {accent}.
            </p>
            <h3 style={{ margin: '1rem 0 .5rem', fontSize: '1rem' }}>
              Phong cách đang chọn: {uiStyle === 'lively' ? 'Sống động' : 'Pastel nhẹ nhàng'}
            </h3>
            <div style={{ display: 'flex', gap: '.8rem', flexWrap: 'wrap' }}>
              {STYLE_OPTIONS.map(o => (
                <span
                  key={o.id}
                  style={{
                    padding: '.45rem 1rem', borderRadius: o.id === 'lively' ? 12 : 8,
                    background: o.accent, color: '#fff', fontWeight: 700,
                    boxShadow: o.id === 'lively' ? '0 4px 0 #46A302' : 'none',
                    outline: uiStyle === o.id ? `2px solid ${o.accent}` : 'none',
                    outlineOffset: 2, opacity: uiStyle === o.id ? 1 : 0.55,
                  }}
                >
                  {o.name}{uiStyle === o.id ? ' ✓' : ''}
                </span>
              ))}
            </div>
            <p className="muted" style={{ margin: '.6rem 0 0', fontSize: '.85rem' }}>
              Pastel: nút sage phẳng, bo góc nhẹ. Sống động: nút xanh lá tươi #58CC02, bo góc lớn, bóng đổ dày 4px.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
