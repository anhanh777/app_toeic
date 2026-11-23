import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { api, type MediaConfig } from '../api';
import { ErrorBox, Modal } from '../components';
import { uploadToCloudinary } from '../cloudinary';
import {
  ACCENT_PRESETS,
  EXTRA_EFFECT_IDS,
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
/* Hieu ung chon duoc theo tung cho — lay tu LOADING_EFFECTS.locations
   (1 nguon duy nhat) nen mo them cho cho hieu ung nao thi modal tu hien.
   Hieu ung them tay (EXTRA_EFFECT_IDS) chi hien khi da co trong danh sach
   `extraEffects` cua doc — chua them thi chi thay o bang chon them. */
function effectOptionsFor(loc: LoadingLocation, extraEffects: LoadingEffectId[]): LoadingEffectId[] {
  return (Object.keys(LOADING_EFFECTS) as LoadingEffectId[]).filter(
    id =>
      LOADING_EFFECTS[id].locations.includes(loc) &&
      (!EXTRA_EFFECT_IDS.includes(id) || extraEffects.includes(id)),
  );
}

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
  /** Bảng chọn "Thêm hiệu ứng" đang mở trong Modal cấu hình hay không. */
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const addPanelRef = useRef<HTMLDivElement>(null);
  /* Mở bảng chọn thì cuộn tới nó luôn — bảng nằm dưới 3 lưới nên không
     cuộn sẽ tưởng nút ＋ bấm không được. */
  useEffect(() => {
    if (addPanelOpen) addPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [addPanelOpen]);
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

  /** Thêm 1 hiệu ứng vào danh sách thêm tay (hiện trong lưới ở cả 3 mục). */
  const addExtraEffect = (id: LoadingEffectId) => {
    setDoc(prev => {
      if (!prev || prev.ui.loading.extraEffects.includes(id)) return prev;
      if (prev.ui.loading.extraEffects.length >= EXTRA_EFFECT_IDS.length) return prev;
      return {
        ...prev,
        ui: { ...prev.ui, loading: { ...prev.ui.loading, extraEffects: [...prev.ui.loading.extraEffects, id] } },
      };
    });
    setMsg('');
  };

  /** Gỡ 1 hiệu ứng khỏi danh sách thêm tay (mất khỏi lưới ở cả 3 mục).
   * Chỗ nào (loading chung + loading riêng từng kiểu) đang dùng hiệu ứng
   * đó thì tự về mặc định spinner — không để giá trị mồ côi. */
  const removeExtraEffect = (id: LoadingEffectId) => {
    const resetIfUsed = (ld: StyleLoading): StyleLoading => ({
      ...ld,
      loginButton: ld.loginButton === id ? 'spinner' : ld.loginButton,
      page: ld.page === id ? 'spinner' : ld.page,
      table: ld.table === id ? 'spinner' : ld.table,
    });
    setDoc(prev => {
      if (!prev || !prev.ui.loading.extraEffects.includes(id)) return prev;
      return {
        ...prev,
        ui: {
          ...prev.ui,
          loading: {
            ...resetIfUsed(prev.ui.loading),
            extraEffects: prev.ui.loading.extraEffects.filter(x => x !== id),
          },
          styles: Object.fromEntries(
            STYLE_REGISTRY.map(s => [
              s.id,
              { ...prev.ui.styles[s.id], loading: resetIfUsed(prev.ui.styles[s.id].loading) },
            ]),
          ) as UiSettings['ui']['styles'],
        },
      };
    });
    setMsg('');
  };

  /** Đóng Modal cấu hình (kèm bảng chọn thêm nếu đang mở). */
  const closeConfig = () => {
    setConfigStyle(null);
    setAddPanelOpen(false);
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
  /** Danh sách hiệu ứng thêm tay (global) + những hiệu ứng còn thêm được. */
  const extraEffects = doc.ui.loading.extraEffects;
  const remainingExtras = EXTRA_EFFECT_IDS.filter(id => !extraEffects.includes(id));

  return (
    <div>
      <h1>🎨 Cài đặt giao diện</h1>
      <p className="muted">
        2 giao diện — mỗi kiểu có màu chủ đạo và hiệu ứng loading riêng. Bấm vào box để chọn kiểu đang dùng,
        bấm "⚙️ Cấu hình" để chỉnh sâu từng kiểu. Trong cửa sổ Cấu hình, nút "＋ Thêm hiệu ứng" ở cuối mỗi lưới
        sẽ thêm hiệu ứng mới vào lưới chọn ở cả 3 mục. Lưu vào backend nên đổi là có hiệu lực ngay, không cần deploy lại code.
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
          onClose={closeConfig}
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
                {effectOptionsFor(loc, extraEffects).map(id => {
                  const on = cfg.loading[loc] === id;
                  const isExtra = EXTRA_EFFECT_IDS.includes(id);
                  return (
                    <div key={id} className="ld-pick-wrap">
                      <button
                        type="button" role="radio" aria-checked={on}
                        className={on ? 'ld-pick-card ld-pick-card--on' : 'ld-pick-card'}
                        onClick={() => updateStyleLoading(configStyle, { [loc]: id })}
                      >
                        <span className="ld-pick-anim">
                          {id === 'none' ? (
                            <span className="ld-pick-none" aria-hidden="true">∅</span>
                          ) : (
                            <LoadingEffect effect={id} speed={cfg.loading.speed} size="md" />
                          )}
                        </span>
                        <span className="ld-pick-label">{LOADING_EFFECTS[id].label}</span>
                      </button>
                      {isExtra && (
                        <button
                          type="button" className="ld-pick-remove"
                          aria-label={`Gỡ hiệu ứng ${LOADING_EFFECTS[id].label}`}
                          title={`Gỡ ${LOADING_EFFECTS[id].label} khỏi danh sách`}
                          onClick={() => removeExtraEffect(id)}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
                {remainingExtras.length > 0 && (
                  <button
                    type="button" className="ld-pick-card ld-pick-add"
                    onClick={() => setAddPanelOpen(true)}
                    title="Thêm hiệu ứng vào lưới chọn"
                  >
                    <span className="ld-pick-plus" aria-hidden="true">＋</span>
                    <span className="ld-pick-label">Thêm hiệu ứng</span>
                  </button>
                )}
              </div>
            </div>
          ))}
          {addPanelOpen && (
            <div className="ld-add-panel" ref={addPanelRef}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.6rem' }}>
                <b>Thêm hiệu ứng</b>
                <button type="button" className="btn secondary btn-sm" onClick={() => setAddPanelOpen(false)}>Đóng</button>
              </div>
              <p className="muted" style={{ margin: '.3rem 0 .4rem' }}>
                Hiệu ứng được thêm sẽ xuất hiện trong lưới chọn ở cả 3 mục trên. Nhớ bấm Lưu cài đặt ở trang chính để lưu hẳn.
              </p>
              {remainingExtras.length === 0 ? (
                <p className="muted" style={{ margin: '.2rem 0' }}>Đã thêm hết 6 hiệu ứng.</p>
              ) : (
                remainingExtras.map(id => (
                  <button
                    type="button" key={id} className="ld-add-row"
                    onClick={() => addExtraEffect(id)}
                    title={`Thêm ${LOADING_EFFECTS[id].label} vào lưới chọn`}
                  >
                    <span className="ld-add-anim">
                      <LoadingEffect effect={id} speed={cfg.loading.speed} size="md" />
                    </span>
                    <span className="ld-add-name">{LOADING_EFFECTS[id].label}</span>
                    <span className="ld-add-hint" aria-hidden="true">＋ Thêm</span>
                  </button>
                ))
              )}
            </div>
          )}
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
            <button className="btn" type="button" onClick={closeConfig}>Xong</button>
          </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
