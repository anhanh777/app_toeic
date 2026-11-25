// Hộp thoại xác nhận theo kiểu giao diện của app (thay Alert.alert của hệ thống).
// Dùng chung: bọc <ConfirmProvider> ở gốc (_layout.tsx), màn nào cần thì gọi
// useConfirm() — trả về Promise<boolean>, true khi bấm nút chính.
// Hình thức theo đúng mẫu bottom-sheet ⋮ trong app/mock.tsx: nền mờ, sheet
// bo tròn, nút chính accent (hoặc đỏ khi danger), Sống động thì viền 2px +
// viền dưới cứng qua themedCard/themedButton.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAX_CONTENT_WIDTH, RADIUS, SPACING } from '../layout';
import { themedCard, themedButton, useTextSize, useTheme } from '../theme';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  /** Nút chính màu đỏ (Xóa/Thoát). */
  danger?: boolean;
}

type PendingConfirm = ConfirmOptions & { resolve: (ok: boolean) => void };

const ConfirmContext = createContext<(opts: ConfirmOptions) => Promise<boolean>>(
  () => Promise.resolve(false),
);

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const insets = useSafeAreaInsets();
  const [req, setReq] = useState<PendingConfirm | null>(null);
  const reqRef = useRef<PendingConfirm | null>(null);

  const ask = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      // Không bao giờ để hộp thoại cũ treo: đang mở mà gọi thêm thì coi như hủy cái cũ.
      reqRef.current?.resolve(false);
      const next: PendingConfirm = { ...opts, resolve };
      reqRef.current = next;
      setReq(next);
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    const r = reqRef.current;
    reqRef.current = null;
    setReq(null);
    r?.resolve(ok);
  }, []);

  const value = useMemo(() => ask, [ask]);
  const confirmBg = req?.danger ? colors.danger : colors.accent;
  const confirmBottom = req?.danger
    ? themedButton(colors, colors.redInk)
    : themedButton(colors);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        visible={!!req}
        transparent
        animationType="slide"
        statusBarTranslucent={false}
        onRequestClose={() => close(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => close(false)}>
          <Pressable
            style={[
              styles.sheet,
              { backgroundColor: colors.surface, borderColor: colors.border },
              colors.style === 'lively' && styles.sheetLively,
              { paddingBottom: Math.max(insets.bottom, SPACING.lg) },
            ]}
            onPress={() => {
              /* bấm trong sheet không đóng modal */
            }}
          >
            <Text style={[styles.title, { color: colors.text, fontSize: scaled(17) }]}>{req?.title}</Text>
            {req?.message ? (
              <Text style={[styles.message, { color: colors.muted, fontSize: scaled(15), lineHeight: scaled(21) }]}>{req.message}</Text>
            ) : null}
            <View style={styles.row}>
              <Pressable
                style={[
                  styles.button,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                  themedCard(colors, 'compact'),
                ]}
                onPress={() => close(false)}
                accessibilityRole="button"
              >
                <Text style={[styles.buttonText, { color: colors.text, fontSize: scaled(14) }]}>
                  {req?.cancelText ?? 'Hủy'}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.button,
                  styles.buttonPrimary,
                  { backgroundColor: confirmBg },
                  confirmBottom,
                ]}
                onPress={() => close(true)}
                accessibilityRole="button"
              >
                <Text style={[styles.buttonText, { color: colors.onAccent, fontSize: scaled(14) }]}>
                  {req?.confirmText ?? 'Đồng ý'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ConfirmContext.Provider>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    alignSelf: 'center',
    maxWidth: MAX_CONTENT_WIDTH,
    borderTopLeftRadius: RADIUS.card,
    borderTopRightRadius: RADIUS.card,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  sheetLively: { borderWidth: 2, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  title: { fontWeight: '800' },
  // lineHeight của message đặt inline = scaled(21) để giãn theo cỡ chữ
  // (lineHeight cố định 21 sẽ chật khi chữ phóng to ×1.25).
  message: {},
  row: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    minHeight: 48,
  },
  buttonPrimary: { borderWidth: 0 },
  buttonText: { fontWeight: '700', flexShrink: 1, textAlign: 'center' },
});
