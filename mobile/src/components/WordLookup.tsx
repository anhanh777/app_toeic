// Tra từ nhanh trong đoạn văn (Reading) — port của
// frontend/src/wordLookup.tsx sang React Native.
// - WordText tách văn bản thành các từ bấm được. Chạm vào từ → popover
//   (Modal bottom-sheet, luôn nằm trong màn hình): phiên âm, loại từ,
//   nghĩa tiếng Việt — KHÔNG hiện câu ví dụ (theo yêu cầu 2026-11-17).
// - Tra bằng Gemini qua backend (có cache nên mỗi từ chỉ tra 1 lần);
//   tra lỗi thì hiện "Không tra được" — KHÔNG bao giờ hiện nghĩa tự bịa.
// - Nút "＋ Lưu vào từ vựng": bấm mới lưu (không tự lưu); đã lưu thì
//   nút đổi thành "Đã lưu ✓", bấm lại thì bỏ lưu. Từ đã lưu được gạch
//   chân chấm trong bài.
// - Danh sách từ đã lưu cache ở module-level (1 lần gọi API mỗi lần mở
//   trang); các WordText trên cùng trang dùng chung.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { api, type DictionaryEntry, type UserWord } from '../api';
import { MAX_CONTENT_WIDTH, RADIUS, SPACING } from '../layout';
import { useTextSize, useTheme } from '../theme';

/* ---- cache từ đã lưu (module-level) ---- */

let savedMap = new Map<string, UserWord>();
let savedLoaded = false;
let savedLoading: Promise<void> | null = null;
const savedListeners = new Set<() => void>();
function notifySaved() {
  savedListeners.forEach((fn) => fn());
}

export function loadSavedWords(force = false): Promise<void> {
  if (savedLoaded && !force) return Promise.resolve();
  if (savedLoading) return savedLoading;
  savedLoading = api
    .userWords('', 500, 0)
    .then((d) => {
      savedMap = new Map(d.items.map((w) => [w.word.toLowerCase(), w]));
      savedLoaded = true;
    })
    .catch(() => {
      /* giữ cache cũ; lần mở sau thử lại */
    })
    .finally(() => {
      savedLoading = null;
    });
  return savedLoading;
}

export function useSavedWords(): Map<string, UserWord> {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    savedListeners.add(fn);
    void loadSavedWords();
    return () => {
      savedListeners.delete(fn);
    };
  }, []);
  return savedMap;
}

export async function saveWordFromLookup(entry: DictionaryEntry, context?: string): Promise<UserWord> {
  const row = await api.createUserWord({
    word: entry.word,
    phonetic: entry.phonetic ?? undefined,
    pos: entry.pos ?? undefined,
    meaning: entry.meaning_vi,
    example: entry.example ?? undefined,
    context: context || undefined,
  });
  savedMap.set(row.word.toLowerCase(), row);
  notifySaved();
  return row;
}

export async function unsaveWord(word: string): Promise<void> {
  const row = savedMap.get(word.toLowerCase());
  if (!row) return;
  await api.deleteUserWord(row.id);
  savedMap.delete(word.toLowerCase());
  notifySaved();
}

/* ---- tách câu chứa từ (làm ngữ cảnh cho tra từ) ---- */

function sentenceAround(text: string, index: number): string {
  let start = -1;
  for (const ch of ['.', '!', '?', '\n']) start = Math.max(start, text.lastIndexOf(ch, index - 1));
  let end = text.length;
  for (const ch of ['.', '!', '?', '\n']) {
    const i = text.indexOf(ch, index);
    if (i !== -1) end = Math.min(end, i + 1);
  }
  const s = text.slice(start + 1, end).trim().replace(/\s+/g, ' ');
  return s.length > 300 ? s.slice(0, 300) : s;
}

export interface PopState {
  word: string;
  context: string;
  entry: DictionaryEntry | null;
  loading: boolean;
  error: string | null;
}

export function useWordPopover(text: string) {
  const saved = useSavedWords();
  const [pop, setPop] = useState<PopState | null>(null);
  const [saving, setSaving] = useState(false);
  const popWordRef = useRef('');

  const openWord = useCallback(
    (word: string, index: number) => {
      const lower = word.toLowerCase();
      popWordRef.current = lower;
      // Từ này đang mở rồi thì không tra lại.
      if (pop && pop.word.toLowerCase() === lower && (pop.entry || pop.loading)) return;
      const context = sentenceAround(text, index);
      const existing = saved.get(lower) ?? null;
      if (existing) {
        // Đã lưu rồi: hiện thẳng dữ liệu đã lưu, khỏi gọi tra từ.
        setPop({
          word,
          context,
          entry: {
            word: existing.word,
            phonetic: existing.phonetic,
            pos: existing.pos,
            meaning_vi: existing.meaning,
            example: existing.example,
          },
          loading: false,
          error: null,
        });
        return;
      }
      setPop({ word, context, entry: null, loading: true, error: null });
      api
        .dictionaryLookup(word, context)
        .then((entry) => {
          // API trả thay từ đã lưu (map saved của trang này đang cũ) —
          // đồng bộ lại để nút hiện "Đã lưu ✓".
          if (entry.saved && entry.id) {
            savedMap.set(lower, {
              id: entry.id,
              word: entry.word,
              phonetic: entry.phonetic ?? null,
              pos: entry.pos ?? null,
              meaning: entry.meaning_vi,
              example: entry.example ?? null,
              status: entry.status ?? 'learning',
            });
            notifySaved();
          }
          setPop((p) => (p && p.word.toLowerCase() === lower ? { ...p, entry, loading: false } : p));
        })
        .catch(() =>
          setPop((p) => (p && p.word.toLowerCase() === lower ? { ...p, loading: false, error: 'Không tra được, thử lại sau.' } : p)),
        );
    },
    [pop, saved, text],
  );

  const close = useCallback(() => setPop(null), []);

  const save = useCallback(async () => {
    if (!pop || !pop.entry) return;
    setSaving(true);
    try {
      await saveWordFromLookup(pop.entry, pop.context);
    } catch {
      setPop((p) => (p ? { ...p, error: 'Không lưu được, thử lại sau.' } : p));
    } finally {
      setSaving(false);
    }
  }, [pop]);

  const unsave = useCallback(async () => {
    if (!pop) return;
    setSaving(true);
    try {
      await unsaveWord(pop.word);
    } catch {
      setPop((p) => (p ? { ...p, error: 'Không bỏ lưu được, thử lại sau.' } : p));
    } finally {
      setSaving(false);
    }
  }, [pop]);

  const savedRow = pop ? saved.get(pop.word.toLowerCase()) ?? null : null;
  return { pop, openWord, close, save, unsave, saving, savedRow };
}

/** Tách văn bản thành chuỗi + các từ bấm được (giữ nguyên khoảng trắng,
 * dấu câu, số; chỉ từ chữ cái mới bấm được). Dùng chung cho WordText và
 * PassageView (đoạn Part 6 có chip chỗ trống xen kẽ). */
export function renderWordNodes(
  text: string,
  saved: Map<string, UserWord>,
  onWordPress: (word: string, index: number) => void,
  textColor: string,
  fontSize: number,
): ReactNode[] {
  const wordRe = /([A-Za-z]+(?:['’\-][A-Za-z]+)*)/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = wordRe.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const w = m[0];
    const idx = m.index;
    const isSaved = saved.has(w.toLowerCase());
    nodes.push(
      <Text
        key={k++}
        onPress={() => onWordPress(w, idx)}
        style={{
          color: textColor,
          fontSize,
          textDecorationLine: isSaved ? 'underline' : 'none',
          textDecorationStyle: isSaved ? 'dotted' : 'solid',
        }}
      >
        {w}
      </Text>,
    );
    last = m.index + w.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Popover tra từ: Modal bottom-sheet — luôn nằm trong màn hình, không
 * tràn như popover định vị tuyệt đối trên web. */
export function WordLookupModal({
  pop, savedRow, saving, onClose, onSave, onUnsave,
}: {
  pop: PopState | null;
  savedRow: UserWord | null;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onUnsave: () => void;
}) {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const { height } = useWindowDimensions();
  return (
    <Modal visible={!!pop} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              maxHeight: Math.round(height * 0.7),
              maxWidth: MAX_CONTENT_WIDTH,
            },
          ]}
          onPress={() => {
            /* bấm trong sheet không đóng modal */
          }}
        >
          {pop ? (
            <>
              <View style={styles.sheetHead}>
                <Text style={[styles.sheetWord, { color: colors.text, fontSize: scaled(20) }]}>{pop.word}</Text>
                {pop.entry?.phonetic ? (
                  <Text style={[styles.sheetPhonetic, { color: colors.muted, fontSize: scaled(15) }]}>{pop.entry.phonetic}</Text>
                ) : null}
                <Pressable onPress={onClose} style={[styles.closeButton, { borderColor: colors.border }]} accessibilityLabel="Đóng">
                  <Text style={{ color: colors.text, fontSize: scaled(15) }}>✕</Text>
                </Pressable>
              </View>
              {pop.loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={{ color: colors.muted, fontSize: scaled(15) }}>Đang tra từ…</Text>
                </View>
              ) : null}
              {pop.error ? (
                <Text style={{ color: colors.danger, fontSize: scaled(15) }}>{pop.error}</Text>
              ) : null}
              {pop.entry ? (
                <>
                  {pop.entry.pos ? (
                    <Text style={[styles.sheetLine, { color: colors.text, fontSize: scaled(15) }]}>
                      <Text style={{ color: colors.muted }}>Loại từ: </Text>
                      {pop.entry.pos}
                    </Text>
                  ) : null}
                  <Text style={[styles.sheetLine, { color: colors.text, fontSize: scaled(16), fontWeight: '700' }]}>
                    {pop.entry.meaning_vi}
                  </Text>
                  {savedRow ? (
                    <Pressable
                      style={[styles.saveButton, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }, saving && styles.disabled]}
                      disabled={saving}
                      onPress={onUnsave}
                    >
                      <Text style={[styles.saveText, { color: colors.text, fontSize: scaled(15) }]}>Đã lưu ✓ — bấm để bỏ lưu</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={[styles.saveButton, { backgroundColor: colors.accent }, saving && styles.disabled]}
                      disabled={saving}
                      onPress={onSave}
                    >
                      <Text style={[styles.saveText, { color: colors.onAccent, fontSize: scaled(15) }]}>＋ Lưu vào từ vựng</Text>
                    </Pressable>
                  )}
                </>
              ) : null}
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Văn bản có các từ bấm được để tra từ. Chỉ dùng cho ĐOẠN VĂN ĐỌC
 * (TOEIC P6/P7, IELTS Reading) — không dùng cho đề bài, giải thích,
 * transcript trong bản này.
 */
export function WordText({ text }: { text: string }) {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const saved = useSavedWords();
  const { pop, openWord, close, save, unsave, saving, savedRow } = useWordPopover(text);
  return (
    <>
      <Text style={{ color: colors.text, fontSize: scaled(16), lineHeight: scaled(24), flexWrap: 'wrap' }}>
        {renderWordNodes(text, saved, openWord, colors.text, scaled(16))}
      </Text>
      <WordLookupModal pop={pop} savedRow={savedRow} saving={saving} onClose={close} onSave={() => void save()} onUnsave={() => void unsave()} />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    alignSelf: 'center',
    borderTopLeftRadius: RADIUS.card,
    borderTopRightRadius: RADIUS.card,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  sheetWord: { fontWeight: '700' },
  sheetPhonetic: { flexShrink: 1, flexWrap: 'wrap' },
  closeButton: {
    marginLeft: 'auto',
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  sheetLine: { flexWrap: 'wrap' },
  saveButton: {
    borderWidth: 1,
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
    marginTop: SPACING.sm,
  },
  saveText: { fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.6 },
});
