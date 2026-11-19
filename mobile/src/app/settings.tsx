// Hồ sơ cá nhân / Cài đặt — port từ frontend/src/pages/Settings.tsx.
// Ảnh đại diện: chọn ảnh bằng expo-image-picker → upload trực tiếp lên
// Cloudinary (unsigned preset, folder toeic/avatars) → PATCH /api/users/me.
// Thêm phần giao diện (dark mode + cỡ chữ) của app mobile.
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, api, hideOnLbOf, targetScoreOf, type IeltsProfile, type QuitReason } from '../api';
import { useAuth } from '../auth';
import { useBrand } from '../brand';
import { useExam } from '../exam';
import { horizontalPadding, MAX_CONTENT_WIDTH, RADIUS, SPACING } from '../layout';
import {
  cancelDailyReminder,
  scheduleDailyReminder,
} from '../notifications';
import { TEXT_SIZE_LABELS, useTextSize, useTheme } from '../theme';
import { BottomNav } from '../components/BottomNav';
import { TabScreen } from '../components/TabScreen';
import { BackButton } from '../components/BackButton';

const QUIT_REASON_OPTIONS: { value: '' | QuitReason; label: string }[] = [
  { value: '', label: '— Chưa chọn —' },
  { value: 'chan', label: 'Chán, mất hứng học' },
  { value: 'met', label: 'Mệt, không có thời gian' },
  { value: 'khong_thay_tien_bo', label: 'Không thấy tiến bộ' },
];

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const bandOrNull = (s: string): number | null => (s.trim() === '' ? null : Number(s));

/** Upload ảnh lên Cloudinary (unsigned preset) — port từ
 * frontend/src/cloudinary.ts sang React Native (file = {uri, name, type}). */
async function uploadAvatarToCloudinary(
  uri: string,
  cloudName: string,
  uploadPreset: string,
): Promise<string> {
  const form = new FormData();
  form.append('file', {
    uri,
    name: 'avatar.jpg',
    type: 'image/jpeg',
  } as unknown as Blob);
  form.append('upload_preset', uploadPreset);
  form.append('folder', 'toeic/avatars');
  let res: Response;
  try {
    res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
      method: 'POST',
      body: form,
    });
  } catch {
    throw new Error('Không kết nối được tới Cloudinary. Kiểm tra mạng rồi thử lại.');
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* không phải JSON */
  }
  if (!res.ok) {
    const msg = (data as { error?: { message?: string } })?.error?.message;
    throw new Error(msg ? `Upload lên Cloudinary thất bại: ${msg}` : `Upload lên Cloudinary thất bại (mã ${res.status}).`);
  }
  const url = (data as { secure_url?: string })?.secure_url;
  if (!url) throw new Error('Upload lên Cloudinary thất bại: máy chủ không trả về đường dẫn file.');
  return url;
}

export default function SettingsScreen() {
  const { user, setUser, logout } = useAuth();
  const { exam } = useExam();
  const { colors, theme, toggleTheme } = useTheme();
  const { scaled, label: textSizeLabel, level: textSizeLevel, setLevel: setTextSizeLevel } = useTextSize();
  const { brand } = useBrand();
  const { width } = useWindowDimensions();

  const displayName = (user?.name || '').trim() || (user?.email || '').split('@')[0] || 'Tài khoản';
  const avatarUrl = user?.avatarUrl ?? user?.avatar_url ?? null;

  const [name, setName] = useState(user?.name ?? '');
  const [target, setTarget] = useState(String(targetScoreOf(user)));
  const [hide, setHide] = useState(hideOnLbOf(user));
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState('');

  const [ieltsLoaded, setIeltsLoaded] = useState(false);
  const [hasIelts, setHasIelts] = useState(false);
  const [ieltsDate, setIeltsDate] = useState('');
  const [tL, setTL] = useState('');
  const [tR, setTR] = useState('');
  const [tW, setTW] = useState('');
  const [tS, setTS] = useState('');
  const [quitReason, setQuitReason] = useState<'' | QuitReason>('');
  const [ieltsMsg, setIeltsMsg] = useState('');
  const [savingIelts, setSavingIelts] = useState(false);

  const [changingPw, setChangingPw] = useState(false);

  // Nhắc ôn tập hằng ngày (Giai đoạn 3): local notification lúc 20:00,
  // bật/tắt ở đây, trạng thái lưu AsyncStorage.
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderMsg, setReminderMsg] = useState('');
  useEffect(() => {
    AsyncStorage.getItem('reminder_daily_on').then((v) => setReminderOn(v === '1')).catch(() => undefined);
  }, []);
  const toggleReminder = useCallback(async () => {
    setReminderMsg('');
    if (reminderOn) {
      await cancelDailyReminder();
      await AsyncStorage.setItem('reminder_daily_on', '0');
      setReminderOn(false);
      setReminderMsg('Đã tắt nhắc ôn tập hằng ngày.');
      return;
    }
    const ok = await scheduleDailyReminder(20);
    if (!ok) {
      setReminderMsg('Chưa cấp quyền thông báo — bật quyền trong cài đặt máy rồi thử lại.');
      return;
    }
    await AsyncStorage.setItem('reminder_daily_on', '1');
    setReminderOn(true);
    setReminderMsg('Đã bật nhắc ôn tập lúc 20:00 hằng ngày.');
  }, [reminderOn]);

  useEffect(() => {
    let alive = true;
    api
      .ieltsProfile()
      .then((p) => {
        if (!alive) return;
        const has = !!(
          p &&
          (p.setupDone ||
            p.skipped ||
            p.examDate ||
            p.targetListening != null ||
            p.targetReading != null ||
            p.targetWriting != null ||
            p.targetSpeaking != null ||
            p.quitReason)
        );
        setHasIelts(has);
        if (has) {
          setIeltsDate(p.examDate ? p.examDate.slice(0, 10) : '');
          setTL(p.targetListening != null ? String(p.targetListening) : '');
          setTR(p.targetReading != null ? String(p.targetReading) : '');
          setTW(p.targetWriting != null ? String(p.targetWriting) : '');
          setTS(p.targetSpeaking != null ? String(p.targetSpeaking) : '');
          setQuitReason(p.quitReason || '');
        }
        setIeltsLoaded(true);
      })
      .catch(() => {
        if (alive) setIeltsLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const saveProfile = async () => {
    if (savingProfile) return;
    setSavingProfile(true);
    setError('');
    setMsg('');
    try {
      const u = await api.updateMe({
        name: name.trim() || undefined,
        targetScore: Number(target) || 650,
        hideOnLeaderboard: hide,
      });
      setUser(u);
      setMsg('Đã lưu hồ sơ.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không lưu được hồ sơ.');
    } finally {
      setSavingProfile(false);
    }
  };

  const pickAvatar = async () => {
    if (avatarBusy) return;
    setError('');
    setAvatarMsg('');
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Không có quyền truy cập thư viện ảnh. Hãy cho phép trong cài đặt rồi thử lại.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setAvatarBusy(true);
    try {
      const cfg = await api.mediaConfigPublic();
      if (!cfg.configured) throw new Error('Chưa cấu hình Cloudinary trên máy chủ.');
      const url = await uploadAvatarToCloudinary(asset.uri, cfg.cloudName, cfg.uploadPreset);
      const u = await api.updateMe({ avatarUrl: url });
      setUser(u);
      setAvatarMsg('Đã đổi ảnh đại diện.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không đổi được ảnh đại diện.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const removeAvatar = async () => {
    if (avatarBusy) return;
    setAvatarBusy(true);
    setError('');
    setAvatarMsg('');
    try {
      const u = await api.updateMe({ avatarUrl: null });
      setUser(u);
      setAvatarMsg('Đã gỡ ảnh đại diện.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không gỡ được ảnh đại diện.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const saveIelts = async () => {
    if (savingIelts) return;
    setSavingIelts(true);
    setError('');
    setIeltsMsg('');
    try {
      const body: Partial<IeltsProfile> = {
        examDate: ieltsDate.trim() || null,
        targetListening: bandOrNull(tL),
        targetReading: bandOrNull(tR),
        targetWriting: bandOrNull(tW),
        targetSpeaking: bandOrNull(tS),
        quitReason: quitReason || null,
      };
      await api.saveIeltsProfile(body);
      setIeltsMsg('Đã lưu hồ sơ IELTS.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không lưu được hồ sơ IELTS.');
    } finally {
      setSavingIelts(false);
    }
  };

  const changePw = async () => {
    if (changingPw) return;
    if (!current || next.length < 6) {
      setError('Nhập mật khẩu hiện tại và mật khẩu mới (tối thiểu 6 ký tự).');
      return;
    }
    setChangingPw(true);
    setError('');
    setMsg('');
    try {
      await api.changePassword(current, next);
      setMsg('Đã đổi mật khẩu.');
      setCurrent('');
      setNext('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không đổi được mật khẩu.');
    } finally {
      setChangingPw(false);
    }
  };

  const showIelts = ieltsLoaded && (hasIelts || exam === 'ielts');
  const pad = horizontalPadding(width);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <TabScreen href="/settings">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.scroll, { paddingHorizontal: pad }]}>
        <View style={styles.headerRow}>
          <BackButton />
          <Text style={[styles.title, { flex: 1, color: colors.text, fontSize: scaled(24) }]}>Hồ sơ cá nhân</Text>
        </View>
        <Text style={[styles.sub, { color: colors.muted, fontSize: scaled(15) }]}>
          Xem và cập nhật thông tin tài khoản của bạn.
        </Text>
        {error ? (
          <Text style={[styles.error, { color: colors.danger, fontSize: scaled(14) }]}>{error}</Text>
        ) : null}
        {msg ? (
          <Text style={[styles.note, { color: colors.success, fontSize: scaled(14) }]}>{msg}</Text>
        ) : null}
        {avatarMsg ? (
          <Text style={[styles.note, { color: colors.success, fontSize: scaled(14) }]}>{avatarMsg}</Text>
        ) : null}
        {ieltsMsg ? (
          <Text style={[styles.note, { color: colors.success, fontSize: scaled(14) }]}>{ieltsMsg}</Text>
        ) : null}

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>Thông tin tài khoản</Text>
          <View style={styles.avatarRow}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.surfaceMuted }]}>
                <Text style={[styles.avatarLetter, { color: colors.muted, fontSize: scaled(28) }]}>
                  {displayName[0]?.toUpperCase() ?? '👤'}
                </Text>
              </View>
            )}
            <View style={styles.avatarActions}>
              <Pressable
                style={[styles.smallButton, styles.outlineButton, { borderColor: colors.border, opacity: avatarBusy ? 0.6 : 1 }]}
                onPress={() => void pickAvatar()}
                disabled={avatarBusy}
              >
                <Text style={[styles.smallButtonText, { color: colors.text, fontSize: scaled(14) }]}>
                  {avatarBusy ? 'Đang tải ảnh…' : 'Đổi ảnh đại diện'}
                </Text>
              </Pressable>
              {avatarUrl ? (
                <Pressable
                  style={[styles.smallButton, styles.outlineButton, { borderColor: colors.border, opacity: avatarBusy ? 0.6 : 1 }]}
                  onPress={() => void removeAvatar()}
                  disabled={avatarBusy}
                >
                  <Text style={[styles.smallButtonText, { color: colors.text, fontSize: scaled(14) }]}>Gỡ ảnh</Text>
                </Pressable>
              ) : null}
              <Text style={[styles.hint, { color: colors.muted, fontSize: scaled(13) }]}>Ảnh .png/.jpg, tối đa 5MB.</Text>
            </View>
          </View>
          <Text style={[styles.kv, { color: colors.text, fontSize: scaled(15) }]}>
            Email: <Text style={{ fontWeight: '700' }}>{user?.email || '—'}</Text>
          </Text>
          <Text style={[styles.kv, { color: colors.text, fontSize: scaled(15) }]}>
            Vai trò: {user?.role === 'admin' ? 'Quản trị viên' : 'Học viên'}
          </Text>
          <Text style={[styles.kv, { color: colors.text, fontSize: scaled(15) }]}>
            Ngày tạo tài khoản: {formatDate(user?.createdAt)}
          </Text>
          <Text style={[styles.kv, { color: colors.text, fontSize: scaled(15) }]}>
            Đăng nhập: {user?.googleId ? 'Đã liên kết tài khoản Google' : 'Email và mật khẩu'}
          </Text>
          <Text style={[styles.label, { color: colors.text, fontSize: scaled(14) }]}>Tên hiển thị</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, fontSize: scaled(16) }]}
            value={name}
            onChangeText={setName}
            placeholder="Tên bạn muốn hiện trên app"
            placeholderTextColor={colors.muted}
          />
          <Text style={[styles.label, { color: colors.text, fontSize: scaled(14) }]}>Mục tiêu điểm TOEIC (10–990)</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, fontSize: scaled(16) }]}
            value={target}
            onChangeText={(v) => setTarget(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            placeholder="650"
            placeholderTextColor={colors.muted}
          />
          <Pressable style={styles.checkRow} onPress={() => setHide((v) => !v)}>
            <View style={[styles.checkbox, { borderColor: colors.border, backgroundColor: hide ? colors.accent : colors.surface }]}>
              {hide ? <Text style={[styles.checkMark, { color: colors.onAccent }]}>✓</Text> : null}
            </View>
            <Text style={[styles.checkLabel, { color: colors.text, fontSize: scaled(15) }]}>
              Ẩn tên trên bảng xếp hạng (hiện là “Người dùng ẩn danh”)
            </Text>
          </Pressable>
          <Pressable
            style={[styles.button, { backgroundColor: colors.accent, opacity: savingProfile ? 0.6 : 1 }]}
            onPress={() => void saveProfile()}
            disabled={savingProfile}
          >
            <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(16) }]}>
              {savingProfile ? 'Đang lưu…' : 'Lưu hồ sơ'}
            </Text>
          </Pressable>
        </View>

        {showIelts && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>Hồ sơ IELTS</Text>
            {!hasIelts ? (
              <View style={styles.row}>
                <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(15) }]}>
                  Bạn chưa thiết lập hồ sơ IELTS.
                </Text>
                <Pressable
                  style={[styles.smallButton, { backgroundColor: colors.accent }]}
                  onPress={() => router.push('/ielts-setup')}
                >
                  <Text style={[styles.smallButtonText, { color: colors.onAccent, fontSize: scaled(14) }]}>
                    Thiết lập ngay →
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={[styles.label, { color: colors.text, fontSize: scaled(14) }]}>Ngày thi dự kiến</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.text, fontSize: scaled(16) }]}
                  value={ieltsDate}
                  onChangeText={setIeltsDate}
                  placeholder="VD: 2027-03-15 (năm-tháng-ngày)"
                  placeholderTextColor={colors.muted}
                />
                <View style={styles.bandGrid}>
                  {(
                    [
                      ['tL', 'Band mục tiêu — Nghe', tL, setTL],
                      ['tR', 'Band mục tiêu — Đọc', tR, setTR],
                      ['tW', 'Band mục tiêu — Viết', tW, setTW],
                      ['tS', 'Band mục tiêu — Nói', tS, setTS],
                    ] as const
                  ).map(([key, label, value, setter]) => (
                    <View key={key} style={styles.bandCell}>
                      <Text style={[styles.label, { color: colors.text, fontSize: scaled(14) }]}>{label}</Text>
                      <TextInput
                        style={[styles.input, { borderColor: colors.border, color: colors.text, fontSize: scaled(16) }]}
                        value={value}
                        onChangeText={(v) => setter(v.replace(/[^0-9.]/g, ''))}
                        keyboardType="decimal-pad"
                        placeholder="VD: 7.5"
                        placeholderTextColor={colors.muted}
                      />
                    </View>
                  ))}
                </View>
                <Text style={[styles.label, { color: colors.text, fontSize: scaled(14) }]}>Lý do hay bỏ cuộc</Text>
                <View style={styles.chipRow}>
                  {QUIT_REASON_OPTIONS.map((o) => (
                    <Pressable
                      key={o.value}
                      style={[styles.chip, { borderColor: colors.border, backgroundColor: quitReason === o.value ? colors.accent : colors.surface }]}
                      onPress={() => setQuitReason(o.value)}
                    >
                      <Text style={{ color: quitReason === o.value ? colors.onAccent : colors.text, fontSize: scaled(14), fontWeight: '600' }}>
                        {o.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  style={[styles.button, { backgroundColor: colors.accent, opacity: savingIelts ? 0.6 : 1 }]}
                  onPress={() => void saveIelts()}
                  disabled={savingIelts}
                >
                  <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(16) }]}>
                    {savingIelts ? 'Đang lưu…' : 'Lưu hồ sơ IELTS'}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        )}

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>Đổi mật khẩu</Text>
          <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(14) }]}>
            Tài khoản đăng nhập bằng Google không có mật khẩu — bỏ qua mục này.
          </Text>
          <Text style={[styles.label, { color: colors.text, fontSize: scaled(14) }]}>Mật khẩu hiện tại</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, fontSize: scaled(16) }]}
            value={current}
            onChangeText={setCurrent}
            secureTextEntry
            placeholder="Mật khẩu hiện tại"
            placeholderTextColor={colors.muted}
          />
          <Text style={[styles.label, { color: colors.text, fontSize: scaled(14) }]}>Mật khẩu mới</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, fontSize: scaled(16) }]}
            value={next}
            onChangeText={setNext}
            secureTextEntry
            placeholder="Mật khẩu mới (tối thiểu 6 ký tự)"
            placeholderTextColor={colors.muted}
          />
          <Pressable
            style={[styles.button, { backgroundColor: colors.accent, opacity: changingPw ? 0.6 : 1 }]}
            onPress={() => void changePw()}
            disabled={changingPw}
          >
            <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(16) }]}>
              {changingPw ? 'Đang đổi…' : 'Đổi mật khẩu'}
            </Text>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>Giao diện</Text>
          <View style={styles.row}>
            <Pressable
              style={[styles.smallButton, styles.outlineButton, { borderColor: colors.border, flex: 1 }]}
              onPress={toggleTheme}
            >
              <Text style={[styles.smallButtonText, { color: colors.text, fontSize: scaled(15) }]}>
                {theme === 'dark' ? '☀️ Chế độ sáng' : '🌙 Chế độ tối'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.smallButton, styles.outlineButton, { borderColor: colors.border, flex: 1 }]}
              onPress={() => setTextSizeLevel(textSizeLevel >= 3 ? 0 : textSizeLevel + 1)}
            >
              <Text style={[styles.smallButtonText, { color: colors.text, fontSize: scaled(15) }]}>
                🔠 Cỡ chữ: {textSizeLabel}
              </Text>
            </Pressable>
          </View>
          <Text style={[styles.hint, { color: colors.muted, fontSize: scaled(13) }]}>
            Các mức cỡ chữ: {TEXT_SIZE_LABELS.join(' · ')}.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaled(18) }]}>Nhắc nhở</Text>
          <Pressable
            style={[styles.smallButton, styles.outlineButton, { borderColor: colors.border, flex: 1 }]}
            onPress={() => void toggleReminder()}
          >
            <Text style={[styles.smallButtonText, { color: colors.text, fontSize: scaled(15) }]}>
              {reminderOn ? '🔔 Đang nhắc ôn tập lúc 20:00 — bấm để tắt' : '🔕 Nhắc ôn tập hằng ngày (20:00)'}
            </Text>
          </Pressable>
          {reminderMsg ? (
            <Text style={[styles.hint, { color: colors.muted, fontSize: scaled(13) }]}>{reminderMsg}</Text>
          ) : null}
          <Text style={[styles.hint, { color: colors.muted, fontSize: scaled(13) }]}>
            Câu đến hạn ôn trong Sổ lỗi sẽ được nhắc 1 lần lúc 8:00 sáng hôm sau.
          </Text>
        </View>

        <Pressable
          style={[styles.button, styles.outlineButton, { borderColor: colors.danger }]}
          onPress={logout}
        >
          <Text style={[styles.buttonText, { color: colors.danger, fontSize: scaled(16) }]}>Đăng xuất</Text>
        </Pressable>
        <Text style={[styles.version, { color: colors.muted, fontSize: scaled(13) }]}>
          {brand.name} — Luyện TOEIC IELTS (mobile)
        </Text>
      </ScrollView>
      </TabScreen>
      <BottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Hàng tiêu đề: nút quay lại + tiêu đề cùng 1 hàng (không để nút lẻ 1 hàng gây thừa khoảng trắng).
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingVertical: SPACING.md,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    gap: SPACING.sm,
  },
  title: { fontWeight: '700', flexWrap: 'wrap' },
  sub: { flexWrap: 'wrap' },
  error: { flexWrap: 'wrap' },
  note: { flexWrap: 'wrap' },
  muted: { flexWrap: 'wrap' },
  hint: { flexWrap: 'wrap' },
  card: {
    borderWidth: 1,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    gap: SPACING.xs,
    width: '100%',
  },
  cardTitle: { fontWeight: '700', flexWrap: 'wrap' },
  avatarRow: { flexDirection: 'row', gap: SPACING.md, alignItems: 'center', width: '100%' },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontWeight: '700' },
  avatarActions: { flex: 1, gap: SPACING.xs, alignItems: 'flex-start' },
  kv: { flexWrap: 'wrap' },
  label: { fontWeight: '600', marginTop: SPACING.sm },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.button,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    width: '100%',
  },
  checkRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'flex-start', width: '100%', marginTop: SPACING.sm },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { fontWeight: '700', fontSize: 16, lineHeight: 20 },
  checkLabel: { flex: 1, flexWrap: 'wrap' },
  bandGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, width: '100%' },
  bandCell: { flexGrow: 1, flexBasis: '45%', minWidth: 140, gap: SPACING.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, width: '100%' },
  chip: {
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  row: { flexDirection: 'row', gap: SPACING.sm, width: '100%', alignItems: 'center' },
  smallButton: {
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: SPACING.md,
  },
  outlineButton: { borderWidth: 1, backgroundColor: 'transparent' },
  smallButtonText: { fontWeight: '700', textAlign: 'center' },
  button: {
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: SPACING.sm,
  },
  buttonText: { fontWeight: '700', textAlign: 'center' },
  version: { textAlign: 'center', marginTop: SPACING.sm },
});
