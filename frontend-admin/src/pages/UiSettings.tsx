import { useEffect, useState, type ChangeEvent } from 'react';
import { api, type MediaConfig } from '../api';
import { ErrorBox, Modal } from '../components';
import { uploadToCloudinary } from '../cloudinary';
import {
  ACCENT_PRESETS,
  LOADING_EFFECTS,
  LoadingEffect,
  STYLE_REGISTRY,
  UI_SETTINGS_DEFAULTS,
  normalizeSettings,
  useUiSettings,
  type LoadingEffectId,
  type LoadingImage,
  type LoadingLocation,
  type LoadingPosition,
  type StyleLoading,
  type StyleSettings,
  type UiSettings,
  type UiStyleId,
} from '../uiSettings';

/* Cài đặt giao diện (scope C) — chỉ admin. 2 box giao diện (render theo
   registry trong uiSettings.tsx — thêm kiểu mới thì box tự hiện) + cấu
   hình riêng từng kiểu (màu chủ đạo + hiệu ứng loading riêng, mở bằng
   Modal dùng chung) + cỡ chữ cơ sở dùng chung. Lưu vào backend (bảng
   app_settings), cả 2 app đọc động lúc mở — đổi là có hiệu lực ngay,
   không cần deploy lại code.
   LƯU Ý: fontScale chỉ là CỠ CHỮ CƠ SỞ. Người học vẫn tự chọn cỡ chữ
   riêng bằng nút 🔠 (localStorage app_text_size); cỡ chữ hiệu dụng =
   fontScale × hệ số mức của người học. Trang này không động gì đến
   lựa chọn đó. Mọi thay đổi trong trang (kể cả trong Modal) chỉ nằm ở
   doc tạm cho tới khi bấm "Lưu cài đặt". */
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

const POSITION_OPTIONS: { id: LoadingPosition; name: string }[] = [
  { id: 'center', name: 'Giữa màn hình' },
  { id: 'top', name: 'Trên đầu trang' },
];

const IMAGE_OPTIONS: { id: LoadingImage; name: string; desc: string }[] = [
  { id: 'none', name: 'Không dùng ảnh', desc: 'Chỉ hiệu ứng + câu chữ lúc chờ.' },
  { id: 'mascot', name: 'Mascot cú hồng', desc: 'Cú hồng cầm hoa anh đào, nhún nhảy lúc chờ.' },
  { id: 'custom', name: 'Link ảnh GIF tùy chỉnh', desc: 'Dán link ảnh động (GIF) của bạn.' },
];

const PREVIEW_BG: Record<UiStyleId, string> = {
  pastel: '#FDF8F3',
  lively: '#F8FDF0',
};

export default function UiSettings() {
  const { applySettings } = useUiSettings();
  const [doc, setDoc] = useState<UiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState<unknown>(null);
  /** Kiểu đang mở Modal cấu hình (null = không mở). */
  const [configStyle, setConfigStyle] = useState<UiStyleId | null>(null);
  /** Cấu hình Cloudinary (để tải ảnh động lên) + trạng thái upload trong Modal. */
  const [mediaCfg, setMediaCfg] = useState<MediaConfig | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    api.adminUiSettings()
      .then(d => setDoc(normalizeSettings(d)))
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);
  // Cấu hình Cloudinary lấy 1 lần khi mở trang (chỉ admin gọi được).
  useEffect(() => {
    api.mediaConfig().then(setMediaCfg).catch(() => setMediaCfg(null));
  }, []);

  const update = (patch: Partial<UiSettings['ui']>) => {
    setDoc(prev => (prev ? { ui: { ...prev.ui, ...patch } } : prev));
    setMsg('');
  };

  /** Chọn kiểu đang dùng (chưa lưu thì app thật vẫn dùng kiểu cũ). */
  const updateStyle = (next: UiStyleId) => {
    setDoc(prev => (prev ? { ...prev, ui: { ...prev.ui, style: next } } : prev));
    setMsg('');
  };

  /** Sửa cài đặt riêng của 1 kiểu (màu / loading) — nằm trong Modal. */
  const updateStyleConfig = (id: UiStyleId, patch: Partial<StyleSettings>) => {
    setDoc(prev =>
      prev
        ? { ui: { ...prev.ui, styles: { ...prev.ui.styles, [id]: { ...prev.ui.styles[id], ...patch } } } }
        : prev,
    );
    setMsg('');
  };
  const updateStyleLoading = (id: UiStyleId, patch: Partial<StyleLoading>) => {
    setDoc(prev =>
      prev
        ? {
            ui: {
              ...prev.ui,
              styles: {
                ...prev.ui.styles,
                [id]: { ...prev.ui.styles[id], loading: { ...prev.ui.styles[id].loading, ...patch } },
              },
            },
          }
        : prev,
    );
    setMsg('');
  };

  /** Tải ảnh động (GIF/PNG) lên Cloudinary thư mục toeic/loading — up nguyên
      file, không qua cắt (cắt ra PNG sẽ mất animation). Xong thì tự điền
      imageUrl + đặt image='custom' cho kiểu đang cấu hình. */
  const onUploadLoadingImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Cho phép chọn lại đúng file vừa chọn (nếu upload trước đó lỗi).
    e.target.value = '';
    if (!file || !configStyle) return;
    setUploadError('');
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Ảnh tối đa 5MB. Hãy nén ảnh nhỏ lại rồi chọn lại.');
      return;
    }
    if (!mediaCfg) {
      setUploadError('Chưa tải được cấu hình Cloudinary. Tải lại trang rồi thử lại.');
      return;
    }
    setUploading(true);
    try {
      const url = await uploadToCloudinary(file, 'toeic/loading', mediaCfg);
      updateStyleLoading(configStyle, { image: 'custom', imageUrl: url });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Tải lên thất bại.');
    } finally {
      setUploading(false);
    }
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

  const { fontScale } = doc.ui;
  const uiStyle = doc.ui.style;
  const cfg = configStyle ? doc.ui.styles[configStyle] : null;
  const cfgMeta = configStyle ? STYLE_REGISTRY.find(s => s.id === configStyle) : null;

  return (
    <div>
      <h1>🎨 Cài đặt giao diện</h1>
      <p className="muted">
        2 giao diện — mỗi kiểu có màu chủ đạo và hiệu ứng loading riêng. Bấm vào box để chọn kiểu đang dùng,
        bấm "⚙️ Cấu hình" để chỉnh sâu từng kiểu. Lưu vào backend nên đổi là có hiệu lực ngay, không cần deploy lại code.
        Cỡ chữ ở đây chỉ là cỡ cơ sở — người học vẫn giữ nút 🔠 chọn cỡ chữ riêng của mình.
      </p>
      <ErrorBox error={error} />
      {msg && <div className="success">{msg}</div>}

      <div className="split-even">
        {STYLE_REGISTRY.map(meta => {
          const st = doc.ui.styles[meta.id];
          const active = uiStyle === meta.id;
          return (
            <div className="card" key={meta.id}>
              <div
                style={{
                  background: PREVIEW_BG[meta.id] ?? 'var(--surface-soft)',
                  border: `1px solid var(--border)`,
                  borderRadius: 12,
                  padding: '1rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                  {meta.id === 'lively' && (
                    <img src="/mascot.png" alt="" aria-hidden="true" className="ld-mascot" style={{ width: 56, height: 56 }} />
                  )}
                  <div>
                    <h2 style={{ margin: 0 }}>
                      {meta.id === 'pastel' ? '🌸' : '🚀'} {meta.name}{' '}
                      {active && <span style={{ fontSize: '.8rem', color: 'var(--green-ink)' }}>✓ Đang dùng</span>}
                    </h2>
                    <p className="muted" style={{ margin: '.2rem 0 0' }}>{meta.desc}</p>
                  </div>
                </div>
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block', marginTop: '.8rem', padding: '.45rem 1.2rem',
                    borderRadius: meta.id === 'lively' ? 12 : 8, background: st.accent, color: '#fff',
                    fontWeight: 700, boxShadow: meta.id === 'lively' ? `0 4px 0 ${st.accent}8C` : 'none',
                  }}
                >
                  Nút mẫu
                </span>
                <span style={{ display: 'inline-block', margin: '.8rem 0 0 .8rem' }}>
                  <LoadingEffect effect={st.loading.page} speed={st.loading.speed} size="sm" />
                </span>
              </div>
              <p className="muted" style={{ margin: '.6rem 0' }}>
                Màu chủ đạo: <b>{st.accent}</b> · Hiệu ứng trang:{' '}
                {LOADING_EFFECTS[st.loading.page].label} · Câu chờ: "{st.loading.text}"
              </p>
              <div className="btn-row">
                <button
                  className="btn" type="button" disabled={active}
                  onClick={() => updateStyle(meta.id)}
                >
                  {active ? '✓ Đang dùng' : 'Dùng giao diện này'}
                </button>
                <button className="btn secondary" type="button" onClick={() => setConfigStyle(meta.id)}>
                  ⚙️ Cấu hình
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="split-even" style={{ marginTop: '1rem' }}>
        <div className="card">
          <h2>Cỡ chữ cơ sở</h2>
          <label>Cỡ chữ cơ sở: <b>{fontScale.toFixed(2)}×</b> <span className="muted">(0.90 – 1.15; nhân với mức 🔠 của từng người)</span></label>
          <input
            type="range" min={0.9} max={1.15} step={0.05} value={fontScale}
            onChange={e => update({ fontScale: Number(e.target.value) })}
            aria-label="Cỡ chữ cơ sở"
          />
          <p style={{ fontSize: `calc(1rem * ${fontScale})` }}>
            Chữ mẫu ở cỡ {fontScale.toFixed(2)}× — đoạn văn, câu hỏi và phương án sẽ to/nhỏ theo tỉ lệ này.
          </p>
        </div>

        <div className="card">
          <h2>Lưu cài đặt</h2>
          <p className="muted">
            Mọi thay đổi ở trên (kể cả trong cửa sổ Cấu hình) chỉ nằm ở trang này cho tới khi bấm Lưu.
            Sau khi lưu, cả web học viên và app sẽ dùng ngay khi mở lại.
          </p>
          <div className="btn-row">
            <button className="btn" type="button" disabled={saving} onClick={() => void save()}>
              {saving ? 'Đang lưu…' : 'Lưu cài đặt'}
            </button>
            <button className="btn secondary" type="button" disabled={saving} onClick={resetDefaults}>
              Khôi phục mặc định
            </button>
          </div>
        </div>
      </div>

      {configStyle && cfg && cfgMeta && (
        <Modal
          title={`Cấu hình giao diện ${cfgMeta.name}`}
          subtitle={
            configStyle === 'pastel'
              ? 'Màu chủ đạo + hiệu ứng loading riêng của kiểu này. Đóng cửa sổ rồi bấm Lưu ở trang chính để áp dụng.'
              : 'Hiệu ứng loading riêng của kiểu này (màu xanh Duolingo cố định). Đóng cửa sổ rồi bấm Lưu ở trang chính để áp dụng.'
          }
          onClose={() => setConfigStyle(null)}
          lg
        >
          <div className="ui-config">
          {configStyle === 'pastel' && (
            <>
              <h3 style={{ marginTop: 0 }}>Màu chủ đạo</h3>
              <div className="btn-row" style={{ alignItems: 'center' }}>
                <input
                  type="color" value={cfg.accent} aria-label="Chọn màu chủ đạo"
                  onChange={e => updateStyleConfig(configStyle, { accent: e.target.value })}
                  style={{ width: '3rem', height: '2.4rem', padding: 0 }}
                />
                <span style={{ fontWeight: 700 }}>{cfg.accent}</span>
              </div>
              <div className="btn-row" style={{ marginTop: '.6rem' }}>
                {ACCENT_PRESETS.map(p => (
                  <button
                    key={p.value} type="button" className="btn secondary btn-sm"
                    title={p.name}
                    style={cfg.accent === p.value ? { borderColor: p.value, boxShadow: `0 0 0 2px ${p.value}55` } : undefined}
                    onClick={() => updateStyleConfig(configStyle, { accent: p.value })}
                  >
                    <span aria-hidden="true" style={{ display: 'inline-block', width: '.8rem', height: '.8rem', borderRadius: '50%', background: p.value, verticalAlign: '-.05rem', marginRight: '.3rem' }} />
                    {p.name}
                  </button>
                ))}
              </div>
            </>
          )}

          <h3>Hiệu ứng loading</h3>
          {(Object.keys(LOCATION_LABELS) as LoadingLocation[]).map(loc => (
            <div key={loc}>
              <label>{LOCATION_LABELS[loc]}</label>
              <div className="ld-pick-grid" role="radiogroup" aria-label={LOCATION_LABELS[loc]}>
                {EFFECT_OPTIONS[loc].map(id => {
                  const on = cfg.loading[loc] === id;
                  return (
                    <button
                      key={id} type="button" role="radio" aria-checked={on}
                      className={on ? 'ld-pick-card ld-pick-card--on' : 'ld-pick-card'}
                      onClick={() => updateStyleLoading(configStyle, { [loc]: id })}
                    >
                      <span className="ld-pick-anim">
                        <LoadingEffect effect={id} speed={cfg.loading.speed} size="lg" />
                      </span>
                      <span className="ld-pick-label">{LOADING_EFFECTS[id].label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <label>Tốc độ hiệu ứng: <b>{cfg.loading.speed.toFixed(2)}×</b> <span className="muted">(0.5 chậm – 2 nhanh)</span></label>
          <input
            type="range" min={0.5} max={2} step={0.25} value={cfg.loading.speed}
            onChange={e => updateStyleLoading(configStyle, { speed: Number(e.target.value) })}
            aria-label="Tốc độ hiệu ứng"
          />
          <label>Câu chờ khi máy chủ đang khởi động</label>
          <input
            type="text" value={cfg.loading.text} maxLength={120}
            onChange={e => updateStyleLoading(configStyle, { text: e.target.value })}
            placeholder="Máy chủ đang khởi động, chờ một chút nhé…"
          />
          <label>Vị trí hiển thị lúc chờ trang</label>
          <select
            value={cfg.loading.position}
            onChange={e => updateStyleLoading(configStyle, { position: e.target.value as LoadingPosition })}
          >
            {POSITION_OPTIONS.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <label>Ảnh động lúc chờ</label>
          <select
            value={cfg.loading.image}
            onChange={e => updateStyleLoading(configStyle, { image: e.target.value as LoadingImage })}
          >
            {IMAGE_OPTIONS.map(o => (
              <option key={o.id} value={o.id}>{o.name} — {o.desc}</option>
            ))}
          </select>
          {cfg.loading.image === 'custom' && (
            <div>
              <label>Link ảnh GIF</label>
              <input
                type="url" value={cfg.loading.imageUrl} maxLength={500}
                onChange={e => updateStyleLoading(configStyle, { imageUrl: e.target.value })}
                placeholder="https://.../anh-dong.gif"
              />
              <div className="btn-row" style={{ marginTop: '.5rem', alignItems: 'center' }}>
                <label className="btn secondary btn-sm" style={{ cursor: uploading ? 'wait' : 'pointer', margin: 0 }}>
                  📤 Tải ảnh lên (GIF/PNG, tối đa 5MB)
                  <input
                    type="file" accept=".gif,.png,.jpg,.jpeg" hidden
                    onChange={e => void onUploadLoadingImage(e)} disabled={uploading}
                  />
                </label>
                {uploading && <span className="muted">Đang tải lên…</span>}
              </div>
              {uploadError && <p className="error" style={{ marginTop: '.4rem' }}>{uploadError}</p>}
              {cfg.loading.imageUrl && (
                <div style={{ marginTop: '.5rem' }}>
                  <img
                    src={cfg.loading.imageUrl} alt="Ảnh động đã chọn"
                    style={{ maxWidth: '100%', maxHeight: 120, borderRadius: 8, border: '1px solid var(--border)' }}
                  />
                </div>
              )}
            </div>
          )}

          <h3>Xem trước</h3>
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '1rem', background: 'var(--surface-soft)', textAlign: 'center' }}>
            {cfg.loading.image === 'mascot' && (
              <img src="/mascot.png" alt="Mascot" className="ld-mascot" style={{ margin: '0 auto .5rem' }} />
            )}
            {cfg.loading.image === 'custom' && cfg.loading.imageUrl && (
              <img src={cfg.loading.imageUrl} alt="Ảnh động tùy chỉnh" className="ld-mascot" style={{ margin: '0 auto .5rem' }} />
            )}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <LoadingEffect effect={cfg.loading.page} speed={cfg.loading.speed} size="lg" />
            </div>
            <p className="muted" style={{ margin: '.4rem 0 0' }}>{cfg.loading.text}</p>
            <p style={{ margin: '.6rem 0 0' }}>
              Vị trí: {cfg.loading.position === 'center' ? 'Giữa màn hình' : 'Trên đầu trang'} · Màu nút mẫu:{' '}
              <span style={{ display: 'inline-block', padding: '.2rem .8rem', borderRadius: 8, background: cfg.accent, color: '#fff', fontWeight: 700 }}>Nút mẫu</span>
            </p>
          </div>

          <div className="btn-row" style={{ marginTop: '1rem' }}>
            <button className="btn" type="button" onClick={() => setConfigStyle(null)}>Xong</button>
          </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
