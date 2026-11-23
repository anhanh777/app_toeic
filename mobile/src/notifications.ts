// Nhắc ôn tập (Giai đoạn 3) — local notification qua expo-notifications.
//
// Chỉ dùng local notification (lên lịch ngay trên máy): nhắc ôn tập hằng
// ngày + nhắc câu đến hạn review. Remote push (FCM/APNs) CHƯA làm — cần
// dev build + Firebase, để sau khi phát hành bản đầu.
// Local notification chạy được cả trong Expo Go (Android).
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

// Hiển thị banner + phát âm báo khi app đang mở.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const DAILY_ID = 'daily-review-reminder';
const DUE_ID = 'due-review-reminder';
const DUE_STAMP_KEY = 'notif_due_scheduled_date';

/** Xin quyền nhận thông báo (Android 13+ bắt buộc). Trả về true nếu được phép. */
export async function ensureReminderPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/** Lên lịch nhắc ôn tập hằng ngày lúc `hour` giờ (mặc định 20:00). Ghi đè lịch cũ.
 *  `checkinPending` = true: thêm dòng nhắc điểm danh hôm nay vào nội dung. */
export async function scheduleDailyReminder(hour = 20, checkinPending = false): Promise<boolean> {
  if (!(await ensureReminderPermission())) return false;
  await Notifications.cancelScheduledNotificationAsync(DAILY_ID);
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_ID,
    content: {
      title: 'Đến giờ luyện thi rồi 📚',
      body: checkinPending
        ? 'Mở app làm vài câu hôm nay nhé — nhớ điểm danh hôm nay nữa 📅.'
        : 'Mở app làm vài câu hôm nay nhé — giữ chuỗi ngày luyện tập của bạn.',
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute: 0 },
  });
  return true;
}

const CHECKIN_STAMP_KEY = 'notif_checkin_pending_date';

/**
 * Nhắc 20:00 thêm dòng điểm danh nếu hôm nay chưa điểm danh.
 * Chỉ lên lịch lại khi trạng thái đổi (ghi dấu theo ngày) và chỉ khi nhắc
 * hằng ngày đang bật (reminder_daily_on = '1' trong Settings).
 */
export async function maybeRescheduleCheckinReminder(checkedInToday: boolean): Promise<void> {
  try {
    if ((await AsyncStorage.getItem('reminder_daily_on')) !== '1') return;
    const today = new Date().toDateString();
    const stamp = await AsyncStorage.getItem(CHECKIN_STAMP_KEY);
    const pending = !checkedInToday;
    if (stamp === `${today}:${pending ? '1' : '0'}`) return;
    await scheduleDailyReminder(20, pending);
    await AsyncStorage.setItem(CHECKIN_STAMP_KEY, `${today}:${pending ? '1' : '0'}`);
  } catch {
    /* nhắc điểm danh là phụ — không chặn màn chính */
  }
}

/** Hủy nhắc ôn tập hằng ngày. */
export async function cancelDailyReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(DAILY_ID);
}

/**
 * Nhắc 1 lần lúc 8:00 sáng mai khi có `dueCount` câu đến hạn review.
 * Chỉ lên lịch tối đa 1 lần/ngày (ghi dấu ngày vào AsyncStorage) để mở
 * màn Sổ lỗi nhiều lần trong ngày không tạo nhiều thông báo trùng.
 */
export async function maybeScheduleDueReminder(dueCount: number): Promise<void> {
  if (dueCount <= 0) return;
  const today = new Date().toDateString();
  if ((await AsyncStorage.getItem(DUE_STAMP_KEY)) === today) return;
  if (!(await ensureReminderPermission())) return;
  await Notifications.cancelScheduledNotificationAsync(DUE_ID);
  const when = new Date();
  when.setDate(when.getDate() + 1);
  when.setHours(8, 0, 0, 0);
  await Notifications.scheduleNotificationAsync({
    identifier: DUE_ID,
    content: {
      title: `Có ${dueCount} câu đến hạn ôn lại 🔁`,
      body: 'Mở Sổ lỗi để ôn các câu đến hạn hôm nay nhé.',
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
  });
  await AsyncStorage.setItem(DUE_STAMP_KEY, today);
}
