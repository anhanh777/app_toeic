import { useEffect, useRef, useState } from 'react';

/** Cắt ảnh vuông cho logo: kéo ảnh để lấy phần chính vào khung,
 *  trượt zoom để phóng to/thu nhỏ. Khung vuông chính là phần sẽ lấy —
 *  đúng như logo hiển thị (vuông ở hero trang đăng nhập, header, favicon).
 *  Xuất ảnh 512×512 PNG (nhỏ hơn 2MB), không cần thêm thư viện. */
const VIEW = 300; // px — khung cắt hiển thị
const OUT = 512; // px — kích thước ảnh xuất

export function ImageCropper({ imageUrl, onCrop, onCancel }: {
  imageUrl: string;
  onCrop: (file: File) => void;
  onCancel: () => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState('');
  const [zoom, setZoom] = useState(1); // 1 = vừa khung (cover), tối đa 3
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [cropping, setCropping] = useState(false);
  const dragRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    let alive = true;
    const el = new Image();
    el.onload = () => { if (alive) setImg(el); };
    el.onerror = () => { if (alive) setLoadError('Không đọc được ảnh này. Thử file PNG/JPG khác.'); };
    el.src = imageUrl;
    return () => { alive = false; };
  }, [imageUrl]);

  // Tỉ lệ vừa khung (cover): cạnh ngắn của ảnh = cạnh khung.
  const base = img ? Math.max(VIEW / img.naturalWidth, VIEW / img.naturalHeight) : 1;
  const scale = base * zoom;
  const w = img ? img.naturalWidth * scale : 0;
  const h = img ? img.naturalHeight * scale : 0;

  // Giữ ảnh luôn phủ kín khung (không lòi nền đen).
  const clampFor = (ox: number, oy: number, s: number) => {
    if (!img) return { x: ox, y: oy };
    return {
      x: Math.min(0, Math.max(VIEW - img.naturalWidth * s, ox)),
      y: Math.min(0, Math.max(VIEW - img.naturalHeight * s, oy)),
    };
  };

  // Căn giữa khi ảnh vừa tải xong.
  useEffect(() => {
    if (!img) return;
    setOffset(clampFor((VIEW - w) / 2, (VIEW - h) / 2, scale));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img]);

  // Đổi zoom: giữ nguyên điểm ảnh ở giữa khung (không nhảy về tâm).
  const applyZoom = (nz: number) => {
    if (!img) return;
    const s2 = base * nz;
    const cx = (VIEW / 2 - offset.x) / scale;
    const cy = (VIEW / 2 - offset.y) / scale;
    setZoom(nz);
    setOffset(clampFor(VIEW / 2 - cx * s2, VIEW / 2 - cy * s2, s2));
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!img) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || !img) return;
    setOffset(clampFor(d.ox + (e.clientX - d.px), d.oy + (e.clientY - d.py), scale));
  };
  const endDrag = () => { dragRef.current = null; };

  const confirm = () => {
    if (!img) return;
    setCropping(true);
    const canvas = document.createElement('canvas');
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setCropping(false); return; }
    const s = VIEW / scale; // cạnh vùng cắt, theo px ảnh gốc (khung vuông)
    ctx.drawImage(img, -offset.x / scale, -offset.y / scale, s, s, 0, 0, OUT, OUT);
    canvas.toBlob(blob => {
      setCropping(false);
      if (!blob) return;
      onCrop(new File([blob], 'logo.png', { type: 'image/png' }));
    }, 'image/png');
  };

  const k = 64 / VIEW; // tỉ lệ xem trước 64px so với khung 300px

  return (
    <div>
      {loadError ? (
        <p className="error">{loadError}</p>
      ) : !img ? (
        <p className="muted">Đang đọc ảnh…</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div
              role="application"
              aria-label="Kéo ảnh để lấy phần chính vào khung vuông"
              style={{
                width: VIEW, height: VIEW, maxWidth: '100%', position: 'relative',
                overflow: 'hidden', borderRadius: 12, background: '#111',
                touchAction: 'none', cursor: dragRef.current ? 'grabbing' : 'grab',
                border: '2px solid var(--accent)', flexShrink: 0,
              }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <img
                src={imageUrl} alt="" draggable={false}
                style={{
                  position: 'absolute', width: w, height: h,
                  left: offset.x, top: offset.y, maxWidth: 'none',
                  userSelect: 'none', pointerEvents: 'none',
                }}
              />
            </div>
            <div>
              <p className="muted" style={{ marginTop: 0 }}>Xem trước logo (cỡ thật trên app):</p>
              <div style={{ width: 64, height: 64, overflow: 'hidden', borderRadius: 12, border: '1px solid var(--border)', position: 'relative', background: 'var(--surface-soft)' }}>
                <img
                  src={imageUrl} alt="Xem trước logo" draggable={false}
                  style={{
                    position: 'absolute', width: w * k, height: h * k,
                    left: offset.x * k, top: offset.y * k, maxWidth: 'none', pointerEvents: 'none',
                  }}
                />
              </div>
              <p className="muted" style={{ fontSize: '.85rem' }}>
                Logo hiển thị vuông: 56px ở trang đăng nhập, 22px ở đầu trang.
              </p>
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <label htmlFor="crop-zoom">Phóng to / thu nhỏ: {zoom.toFixed(2)}x</label>
            <input
              id="crop-zoom" type="range" min={1} max={3} step={0.05} value={zoom}
              onChange={e => applyZoom(Number(e.target.value))}
              style={{ width: '100%' }}
            />
            <p className="muted" style={{ fontSize: '.85rem' }}>
              Kéo ảnh để lấy phần chính vào khung vuông. Ảnh cắt ra 512×512.
            </p>
          </div>

          <div className="btn-row" style={{ marginTop: '1rem' }}>
            <button className="btn" type="button" disabled={cropping} onClick={confirm}>
              {cropping ? 'Đang cắt…' : '✂️ Cắt & tải lên'}
            </button>
            <button className="btn secondary" type="button" disabled={cropping} onClick={onCancel}>
              Hủy
            </button>
          </div>
        </>
      )}
    </div>
  );
}
