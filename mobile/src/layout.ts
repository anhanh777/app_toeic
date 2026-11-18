// Responsive + hiệu năng danh sách — nền móng chung cho mọi màn hình
// (yêu cầu "smooth + fits all screens", áp dụng từ Phase 0, dùng lại ở
// Phase 1/2). Nguyên tắc:
// - Chỉ dùng flex layout, KHÔNG width cố định theo pixel — mọi màn hình
//   phải vừa từ điện thoại nhỏ (~360px) tới tablet.
// - SafeAreaView / safe-area insets ở layout gốc (app/_layout.tsx).
// - Tôn trọng font scale hệ thống: không đặt allowFontScaling={false}
//   tràn lan; text-size của app chỉ nhân tối đa 1.3x (xem theme.ts).
// - Danh sách dài dùng FlatList + windowing, không render hết 200 câu.
import { useWindowDimensions } from 'react-native';

// ---- Breakpoints (theo chiều rộng màn hình, dp) ----
export const BREAKPOINTS = {
  /** Điện thoại nhỏ, vd. 360px. */
  small: 360,
  /** Điện thoại chuẩn, vd. 390px. */
  standard: 390,
  /** Từ đây coi như màn hình lớn (điện thoại lớn / tablet nhỏ). */
  wide: 600,
} as const;

/** Số cột cho layout "2 câu 1 hàng" của web: màn hẹp → 1 cột (stack),
 * màn rộng (≥600dp) → 2 cột. Dùng cho màn Luyện tập/Thi thử Phase 1. */
export function columnsForWidth(width: number): 1 | 2 {
  return width >= BREAKPOINTS.wide ? 2 : 1;
}

export function useColumns(): 1 | 2 {
  const { width } = useWindowDimensions();
  return columnsForWidth(width);
}

/** Chiều rộng nội dung tối đa trên tablet — nội dung căn giữa, không
 * giãn vô hạn. Áp bằng style { maxWidth, alignSelf: 'center', width: '100%' }. */
export const MAX_CONTENT_WIDTH = 720;

/** Padding ngang chuẩn theo chiều rộng: màn hẹp chật hơn để không tràn. */
export function horizontalPadding(width: number): number {
  if (width < BREAKPOINTS.small + 20) return 12;
  if (width < BREAKPOINTS.wide) return 16;
  return 24;
}

// ---- Mặc định FlatList dùng chung cho mọi danh sách dài ----
// windowSize: số "màn hình" nội dung giữ trong bộ nhớ quanh vùng nhìn
// thấy (10 ≈ 5 màn trên + 5 dưới — đủ mượt khi cuộn nhanh, không giữ
// quá nhiều). maxToRenderPerBatch: render tối đa 10 item mỗi đợt để
// không chặn JS thread khi cuộn. initialNumToRender: đủ lấp 1 màn hình.
export const LIST_DEFAULTS = {
  windowSize: 10,
  maxToRenderPerBatch: 10,
  initialNumToRender: 10,
  updateCellsBatchingPeriod: 50,
  // removeClippedSubviews: true chỉ bật cho danh sách thuần text;
  // danh sách có audio player / video thì tắt (kẻo clip làm mất trạng thái).
  removeClippedSubviews: true,
} as const;

/** Mặc định cho danh sách có trạng thái phát (audio/video): tắt
 * removeClippedSubviews để không unmount item đang phát khi cuộn qua. */
export const LIST_DEFAULTS_WITH_MEDIA = {
  ...LIST_DEFAULTS,
  removeClippedSubviews: false,
} as const;

// ---- Spacing / bo góc chung (Pastel) ----
export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const RADIUS = { card: 16, button: 12, pill: 999 } as const;
