// Trạng thái điều hướng giữa 5 tab chính — dùng chung cho BottomNav,
// TabScreen (hiệu ứng vào màn) và vuốt chuyển tab.
//
// Cơ chế: BottomNav / vuốt đặt hướng + zoom ĐỒNG BỘ ngay trước
// router.replace; màn tab đích đọc lúc render (peek) để khởi tạo giá trị
// reanimated, rồi xóa trong useEffect khi đã mount xong. Màn tab luôn
// mount mới sau mỗi lần replace nên không sợ đọc nhầm lần sau.
import { router } from 'expo-router';
export const TAB_ORDER = ['/', '/vocabulary', '/practice', '/mock', '/settings'] as const;

export type TabHref = (typeof TAB_ORDER)[number];
export type TabDirection = 'forward' | 'back' | 'none';

let pendingDirection: TabDirection = 'none';
let pendingZoom = false;
let lastTab: TabHref = '/';

/** Đặt hướng + zoom cho lần chuyển tab kế tiếp. */
export function setTabTransition(direction: TabDirection, zoom = false): void {
  pendingDirection = direction;
  pendingZoom = zoom;
}

/** Đọc (không xóa) hướng đang chờ — dùng lúc render để khởi tạo shared value. */
export function peekTabTransition(): { direction: TabDirection; zoom: boolean } {
  return { direction: pendingDirection, zoom: pendingZoom };
}

/** Xóa trạng thái chờ — gọi trong useEffect khi màn tab đã mount xong. */
export function consumeTabTransition(): void {
  pendingDirection = 'none';
  pendingZoom = false;
}

export function tabIndex(href: string): number {
  const i = TAB_ORDER.indexOf(href as TabHref);
  return i >= 0 ? i : -1;
}

/** Hướng khi đi từ tab `from` sang tab `to` (theo thứ tự TAB_ORDER). */
export function directionBetween(from: string, to: string): TabDirection {
  const a = tabIndex(from);
  const b = tabIndex(to);
  if (a < 0 || b < 0 || a === b) return 'none';
  return b > a ? 'forward' : 'back';
}

export function nextTabHref(current: string): TabHref | null {
  const i = tabIndex(current);
  return i >= 0 && i < TAB_ORDER.length - 1 ? TAB_ORDER[i + 1] : null;
}

export function prevTabHref(current: string): TabHref | null {
  const i = tabIndex(current);
  return i > 0 ? TAB_ORDER[i - 1] : null;
}

/** Ghi nhớ tab cuối cùng — để tính hướng khi đi từ màn con (vd /part-sets). */
export function setLastTab(href: TabHref): void {
  lastTab = href;
}

export function getLastTab(): TabHref {
  return lastTab;
}

// Các tab cần chọn kỳ thi trước mới vào được (giống BottomNav).
// Từ vựng không cần: màn /vocabulary tự xử lý exam bằng `exam ?? 'toeic'`.
const NEEDS_EXAM = new Set(['/practice', '/mock']);

/**
 * Chuyển sang 1 tab chính: tự tính hướng (theo thứ tự TAB_ORDER), đặt
 * hiệu ứng chờ rồi router.replace. Tab cần kỳ thi mà chưa chọn thì về
 * màn chọn kỳ thi, nhớ sẵn đích đến (giống BottomNav.go).
 * `zoom` = true chỉ khi bấm nút Luyện tập tròn ở giữa thanh dưới.
 */
export function goToTab(
  target: TabHref,
  currentPathname: string,
  hasExam: boolean,
  zoom = false,
): void {
  if (target === currentPathname) return;
  // Đang ở màn con (vd /part-sets) thì tính hướng từ tab cuối cùng.
  const from = tabIndex(currentPathname) >= 0 ? currentPathname : getLastTab();
  if (NEEDS_EXAM.has(target) && !hasExam) {
    setTabTransition(directionBetween(from, '/'), false);
    router.replace({ pathname: '/', params: { next: target } });
    return;
  }
  setTabTransition(directionBetween(from, target), zoom);
  router.replace(target as never);
}
