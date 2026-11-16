// Chế độ sáng/tối — lưu lựa chọn vào localStorage, lần đầu theo hệ thống.
// Script inline trong index.html đã đặt data-theme trước khi React vẽ
// (tránh chớp sáng); hàm này chỉ dùng cho nút đổi trong header.

export type Theme = 'light' | 'dark';

const KEY = 'toeic_theme';

export function resolveTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* localStorage không dùng được thì theo hệ thống */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* bỏ qua */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#211E1B' : '#FDF8F3');
}
