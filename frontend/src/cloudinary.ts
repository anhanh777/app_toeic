// Upload trực tiếp từ trình duyệt lên Cloudinary (unsigned preset).
// Không qua backend: backend chỉ cấp cloudName + uploadPreset qua
// GET /api/admin/media/config, file đi thẳng tới Cloudinary.

export type CloudinaryFolder = 'toeic/images' | 'toeic/audio';

export interface CloudinaryConfig {
  cloudName: string;
  uploadPreset: string;
}

const IMAGE_EXTS = ['png', 'jpg', 'jpeg'];
const AUDIO_EXTS = ['mp3'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10MB

function extOf(file: File): string {
  const name = file.name || '';
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function validate(file: File, folder: CloudinaryFolder) {
  if (folder === 'toeic/images') {
    if (!IMAGE_EXTS.includes(extOf(file))) {
      throw new Error('Ảnh minh họa chỉ nhận file .png, .jpg hoặc .jpeg.');
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error('Ảnh minh họa tối đa 5MB. Hãy nén ảnh nhỏ lại rồi upload lại.');
    }
  } else {
    if (!AUDIO_EXTS.includes(extOf(file))) {
      throw new Error('File audio chỉ nhận định dạng .mp3.');
    }
    if (file.size > MAX_AUDIO_BYTES) {
      throw new Error('File audio tối đa 10MB. Hãy nén file nhỏ lại rồi upload lại.');
    }
  }
}

export async function uploadToCloudinary(
  file: File,
  folder: CloudinaryFolder,
  config: CloudinaryConfig,
): Promise<string> {
  validate(file, folder);
  if (!config.cloudName || !config.uploadPreset) {
    throw new Error('Chưa cấu hình Cloudinary trên máy chủ.');
  }
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', config.uploadPreset);
  form.append('folder', folder);
  let res: Response;
  try {
    res = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/auto/upload`, {
      method: 'POST',
      body: form,
    });
  } catch {
    throw new Error('Không kết nối được tới Cloudinary. Kiểm tra mạng rồi thử lại.');
  }
  let data: unknown = null;
  try { data = await res.json(); } catch { /* không phải JSON */ }
  if (!res.ok) {
    const msg = (data as { error?: { message?: string } })?.error?.message;
    throw new Error(msg ? `Upload lên Cloudinary thất bại: ${msg}` : `Upload lên Cloudinary thất bại (mã ${res.status}).`);
  }
  const url = (data as { secure_url?: string })?.secure_url;
  if (!url) throw new Error('Upload lên Cloudinary thất bại: máy chủ không trả về đường dẫn file.');
  return url;
}
