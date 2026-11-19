import { useEffect, useState, type ChangeEvent } from 'react';
import { api, type MediaConfig } from '../api';
import { ErrorBox, Modal } from '../components';
import { uploadToCloudinary } from '../cloudinary';
import { ImageCropper } from '../ImageCropper';
import { BRAND_DEFAULTS, normalizeBrand, useBrand, type BrandSettings } from '../brand';

/* Tên & Logo thương hiệu — chỉ admin: tên app, câu tagline, logo emoji
   hoặc ảnh tải lên. Lưu vào backend (GET /api/brand công khai,
   PUT /api/admin/brand chỉ admin), cả 2 app đọc động lúc mở — đổi là
   có hiệu lực ngay, không cần deploy lại code.
   Ảnh logo tối đa 2MB (giới hạn chặt hơn uploader chung 5MB), lưu vào
   Cloudinary thư mục toeic/brand. Ảnh gốc chọn lên tối đa 5MB — sau khi
   cắt vuông 512×512 thì file luôn nhỏ hơn 2MB. */
const EMOJI_OPTIONS = ['🌸', '🎓', '📚', '✏️', '🎯', '🚀', '⭐', '💡', '📖', '🏆', '🌟', '🎨'];
const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5MB (ảnh gốc, trước khi cắt)

export default function Brand() {
  const { applyBrand, refresh } = useBrand();
  const [doc, setDoc] = useState<BrandSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null); // ảnh gốc đang cắt
  const [mediaCfg, setMediaCfg] = useState<MediaConfig | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.adminBrand()
      .then(d => setDoc(normalizeBrand(d)))
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);
  // Cấu hình Cloudinary lấy 1 lần khi mở trang (chỉ admin gọi được).
  useEffect(() => {
    api.mediaConfig().then(setMediaCfg).catch(() => setMediaCfg(null));
  }, []);

  const update = (patch: Partial<BrandSettings>) => {
    setDoc(prev => (prev ? { ...prev, ...patch } : prev));
    setMsg('');
  };

  const save = async (toSave?: BrandSettings): Promise<boolean> => {
    const target = toSave || doc;
    if (!target) return false;
    setError(null); setMsg(''); setSaving(true);
    try {
      const saved = await api.adminSaveBrand(normalizeBrand(target));
      const normalized = normalizeBrand(saved);
      setDoc(normalized);
      applyBrand(normalized);
      refresh();
      setMsg('Đã lưu tên & logo — web và app sẽ dùng ngay khi mở lại.');
      return true;
    } catch (err) { setError(err); return false; } finally { setSaving(false); }
  };

  const resetDefaults = async () => {
    setDoc(BRAND_DEFAULTS);
    if (await save(BRAND_DEFAULTS)) setMsg('Đã khôi phục tên & logo mặc định.');
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Cho phép chọn lại đúng file vừa chọn (nếu upload trước đó lỗi).
    e.target.value = '';
    if (!file) return;
    setError(null); setMsg('');
    if (file.size > MAX_LOGO_BYTES) {
      setError(new Error('Ảnh gốc tối đa 5MB. Hãy nén ảnh nhỏ lại rồi chọn lại.'));
      return;
    }
    if (!mediaCfg) {
      setError(new Error('Chưa tải được cấu hình Cloudinary. Tải lại trang rồi thử lại.'));
      return;
    }
    // Mở khung cắt trước — tải lên chỉ sau khi đã cắt xong.
    setCropSrc(URL.createObjectURL(file));
  };

  const cancelCrop = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  };

  const onCropDone = async (file: File) => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    if (!mediaCfg) {
      setError(new Error('Chưa tải được cấu hình Cloudinary. Tải lại trang rồi thử lại.'));
      return;
    }
    setError(null); setMsg('');
    setUploading(true);
    try {
      const url = await uploadToCloudinary(file, 'toeic/brand', mediaCfg);
      update({ logoUrl: url, logoType: 'image' });
    } catch (err) { setError(err); } finally { setUploading(false); }
  };

  const removeImage = () => {
    update({ logoUrl: '', logoType: 'emoji' });
  };

  if (loading) return <div><h1>🏷️ Tên &amp; Logo</h1><p>Đang tải tên &amp; logo…</p></div>;
  if (!doc) return <div><h1>🏷️ Tên &amp; Logo</h1><ErrorBox error={error} /><p className="muted">Không tải được tên &amp; logo.</p></div>;

  const showImage = doc.logoType === 'image' && doc.logoUrl !== '';

  return (
    <div>
      <h1>🏷️ Tên &amp; Logo</h1>
      <p className="muted">
        Tên app, câu tagline và logo hiển thị trên cả 2 app (học viên + quản trị).
        Lưu vào backend nên đổi là có hiệu lực ngay, không cần deploy lại code.
      </p>
      <ErrorBox error={error} />
      {msg && <div className="success">{msg}</div>}

      <div className="split-even">
        <div className="card">
          <h2>Tên &amp; tagline</h2>
          <label>Tên app <span className="muted">(1–30 ký tự)</span></label>
          <input
            type="text" value={doc.name} maxLength={30}
            onChange={e => update({ name: e.target.value })}
            placeholder="ANHANH"
          />
          <label>Câu tagline <span className="muted">(tối đa 80 ký tự, được để trống)</span></label>
          <input
            type="text" value={doc.tagline} maxLength={80}
            onChange={e => update({ tagline: e.target.value })}
            placeholder="Luyện TOEIC • IELTS mỗi ngày"
          />

          <h2 style={{ marginTop: '1.2rem' }}>Logo</h2>
          <div className="btn-row" role="radiogroup" aria-label="Kiểu logo">
            <label style={{ display: 'flex', alignItems: 'center', gap: '.3rem' }}>
              <input
                type="radio" name="logoType" checked={doc.logoType === 'emoji'}
                onChange={() => update({ logoType: 'emoji' })}
              />
              Emoji
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '.3rem' }}>
              <input
                type="radio" name="logoType" checked={doc.logoType === 'image'}
                onChange={() => update({ logoType: 'image' })}
              />
              Ảnh tải lên
            </label>
          </div>

          {doc.logoType === 'emoji' ? (
            <div className="btn-row" style={{ marginTop: '.6rem' }}>
              {EMOJI_OPTIONS.map(e => (
                <button
                  key={e} type="button" className="btn secondary btn-sm"
                  aria-label={`Chọn emoji ${e}`}
                  aria-pressed={doc.logoEmoji === e}
                  style={doc.logoEmoji === e
                    ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px var(--accent-soft-strong)', fontSize: '1.2rem' }
                    : { fontSize: '1.2rem' }}
                  onClick={() => update({ logoEmoji: e })}
                >
                  {e}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: '.6rem' }}>
              {showImage && (
                <div style={{ marginBottom: '.6rem' }}>
                  <img
                    src={doc.logoUrl} alt="Logo đã tải lên"
                    style={{ maxWidth: '100%', maxHeight: 160, objectFit: 'contain', borderRadius: 12, border: '1px solid var(--border)' }}
                  />
                  <p className="muted" style={{ wordBreak: 'break-all', fontSize: '.8rem', margin: '.4rem 0' }}>{doc.logoUrl}</p>
                  <button className="btn secondary btn-sm" type="button" onClick={removeImage}>
                    Xóa ảnh, dùng emoji
                  </button>
                </div>
              )}
              <label>Chọn ảnh logo <span className="muted">(PNG/JPG, tối đa 5MB)</span></label>
              <input
                type="file" accept=".png,.jpg,.jpeg" onChange={e => void onFile(e)} disabled={uploading}
              />
              {uploading && <p className="muted">Đang tải ảnh lên…</p>}
              <p className="muted" style={{ fontSize: '.85rem' }}>
                Chọn ảnh xong sẽ hiện khung cắt: kéo để lấy phần chính, phóng to/thu nhỏ
                rồi bấm “Cắt &amp; tải lên”. Ảnh được lưu vào Cloudinary (thư mục toeic/brand)
                và dùng làm logo + favicon.
              </p>
              {cropSrc && (
                <Modal title="✂️ Cắt ảnh logo" onClose={cancelCrop} wide>
                  <ImageCropper
                    imageUrl={cropSrc}
                    onCrop={f => void onCropDone(f)}
                    onCancel={cancelCrop}
                  />
                </Modal>
              )}
            </div>
          )}

          <div className="btn-row" style={{ marginTop: '1rem' }}>
            <button className="btn" type="button" disabled={saving} onClick={() => void save()}>
              {saving ? 'Đang lưu…' : 'Lưu tên & logo'}
            </button>
            <button className="btn secondary" type="button" disabled={saving} onClick={() => void resetDefaults()}>
              Khôi phục mặc định
            </button>
          </div>
        </div>

        <div className="card">
          <h2>Xem trước (chưa lưu)</h2>
          <p className="muted">Tên và logo dưới đây dùng đúng giá trị đang chọn ở cột bên — chưa lưu thì app thật vẫn dùng tên &amp; logo cũ.</p>
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '1.2rem', background: 'var(--surface-soft)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.5rem', textAlign: 'center' }}>
            {showImage ? (
              <img src={doc.logoUrl} alt="Logo xem trước" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 12 }} />
            ) : (
              <span
                aria-hidden="true"
                style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, lineHeight: 1 }}
              >
                {doc.logoEmoji}
              </span>
            )}
            <div style={{ fontWeight: 700, fontSize: '1.375rem' }}>{doc.name || '—'}</div>
            <div className="muted">{doc.tagline || 'Luyện thi TOEIC · IELTS'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
