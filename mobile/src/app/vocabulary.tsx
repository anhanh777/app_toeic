// Từ vựng — port từ frontend/src/pages/Vocabulary.tsx. 2 kho:
// - "Từ của tôi" (mặc định): từ cá nhân, lưu khi tra từ trong đoạn văn
//   lúc luyện tập hoặc thêm tay; sửa/xóa/đánh dấu được.
// - "Từ chung": kho từ chung do admin quản (hiện đã làm trống theo
//   hướng mới — từ vựng lấy từ quá trình luyện tập); người học chỉ
//   đánh dấu đã thuộc/chưa thuộc.
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, api, type UserWord, type Vocab } from '../api';
import { useExam } from '../exam';
import { CARD_PADDING, horizontalPadding, LIST_DEFAULTS, MAX_CONTENT_WIDTH, RADIUS, SPACING } from '../layout';
import { themedCard, themedChip, themedButton, useTextSize, useTheme } from '../theme';
import { BackButton } from '../components/BackButton';
import { BottomNav } from '../components/BottomNav';
import { useConfirm } from '../components/ConfirmDialog';
import { LoadingLine } from '../components/LoadingLine';
import { TabScreen } from '../components/TabScreen';

type WordStatus = 'learning' | 'learned' | 'wrong';
const STATUS_LABEL: Record<WordStatus, string> = {
  learning: 'Đang học',
  learned: 'Đã thuộc',
  wrong: 'Chưa thuộc',
};
const STATUS_FILTERS: { id: '' | WordStatus; label: string }[] = [
  { id: '', label: 'Tất cả' },
  { id: 'learning', label: 'Đang học' },
  { id: 'learned', label: 'Đã thuộc' },
  { id: 'wrong', label: 'Chưa thuộc' },
];

const WordRow = memo(function WordRow({
  w,
  onMark,
  onEdit,
  onDelete,
}: {
  w: UserWord;
  onMark: (id: number, s: WordStatus) => void;
  onEdit: (w: UserWord) => void;
  onDelete: (w: UserWord) => void;
}) {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  return (
    <View style={[styles.wordCard, { backgroundColor: colors.surface, borderColor: colors.border }, themedCard(colors, 'compact')]}>
      <Text style={[styles.word, { color: colors.text, fontSize: scaled(16) }]}>{w.word}</Text>
      <Text style={[styles.wordMeta, { color: colors.muted, fontSize: scaled(14) }]}>
        {[w.phonetic, w.pos, STATUS_LABEL[w.status], w.topic].filter(Boolean).join(' · ')}
      </Text>
      <Text style={[styles.wordMeaning, { color: colors.text, fontSize: scaled(15) }]}>{w.meaning}</Text>
      {w.example ? (
        <Text style={[styles.wordMeta, { color: colors.muted, fontSize: scaled(14) }]}>{w.example}</Text>
      ) : null}
      <View style={styles.chipRow}>
        {(Object.keys(STATUS_LABEL) as WordStatus[]).map((s) => (
          <Pressable
            key={s}
            style={[
              styles.chip,
              { borderColor: colors.border, backgroundColor: w.status === s ? colors.accent : colors.surface },
              themedChip(colors), w.status === s && { backgroundColor: colors.accent, borderColor: colors.accent },
            ]}
            onPress={() => onMark(w.id, s)}
          >
            <Text style={{ color: w.status === s ? colors.onAccent : colors.text, fontSize: scaled(13), fontWeight: '600' }}>
              {STATUS_LABEL[s]}
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }, themedChip(colors)]}
          onPress={() => onEdit(w)}
        >
          <Text style={{ color: colors.text, fontSize: scaled(13), fontWeight: '600' }}>Sửa</Text>
        </Pressable>
        <Pressable
          style={[styles.chip, { borderColor: colors.danger, backgroundColor: colors.surface }, themedChip(colors), { borderColor: colors.danger }]}
          onPress={() => onDelete(w)}
        >
          <Text style={{ color: colors.danger, fontSize: scaled(13), fontWeight: '600' }}>Xóa</Text>
        </Pressable>
      </View>
    </View>
  );
});

export default function VocabularyScreen() {
  const { exam } = useExam();
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const { width } = useWindowDimensions();
  const ex = exam ?? 'toeic';
  const [tab, setTab] = useState<'mine' | 'shared'>('mine');
  const pad = horizontalPadding(width);

  // Màn tab chính (giống Luyện tập/Thi thử/Cá nhân): bọc TabScreen để có
  // hiệu ứng vào màn + vuốt chuyển tab, và BottomNav ở dưới cùng —
  // trước đây màn này thiếu cả hai nên vào tab Từ vựng là mất thanh
  // điều hướng dưới đáy.
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <TabScreen href="/vocabulary">
        <View style={[styles.wrap, { paddingHorizontal: pad }]}>
          <View style={styles.headerRow}>
            <BackButton />
            <Text style={[styles.title, { flex: 1, color: colors.text, fontSize: scaled(20) }]}>Từ vựng</Text>
          </View>
          {/* 2 tab dạng segmented control — 2 nửa bằng nhau, không còn 2 pill lệch. */}
          <View style={[styles.segmented, { borderColor: colors.border, backgroundColor: colors.surface }, themedCard(colors, 'compact')]}>
            <Pressable
              style={[styles.segment, tab === 'mine' && { backgroundColor: colors.accent }]}
              onPress={() => setTab('mine')}
            >
              <Text style={{ color: tab === 'mine' ? colors.onAccent : colors.text, fontSize: scaled(14), fontWeight: '700' }}>
                Từ của tôi
              </Text>
            </Pressable>
            <Pressable
              style={[styles.segment, tab === 'shared' && { backgroundColor: colors.accent }]}
              onPress={() => setTab('shared')}
            >
              <Text style={{ color: tab === 'shared' ? colors.onAccent : colors.text, fontSize: scaled(14), fontWeight: '700' }}>
                Từ chung
              </Text>
            </Pressable>
          </View>
          {tab === 'mine' ? <MyWords /> : <SharedWords exam={ex} />}
        </View>
      </TabScreen>
      <BottomNav />
    </SafeAreaView>
  );
}

function MyWords() {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const askConfirm = useConfirm();
  const [words, setWords] = useState<UserWord[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const [idx, setIdx] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'' | WordStatus>('');
  const [editing, setEditing] = useState<UserWord | null>(null);
  const [editForm, setEditForm] = useState({ phonetic: '', pos: '', meaning: '', example: '', topic: '' });
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ word: '', phonetic: '', pos: '', meaning: '', example: '', topic: '' });
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');

  const load = useCallback(() => {
    api
      .userWords('', 500, 0)
      .then((d) => {
        setWords(d.items);
        setIdx(0);
        setFlipped(false);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Không tải được từ vựng.'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () => (statusFilter ? words.filter((w) => w.status === statusFilter) : words),
    [words, statusFilter],
  );
  const safeIdx = filtered.length ? Math.min(idx, filtered.length - 1) : 0;
  const w = filtered[safeIdx];

  const mark = useCallback(async (id: number, status: WordStatus) => {
    try {
      const updated = await api.markUserWord(id, status);
      setWords((list) => list.map((x) => (x.id === id ? updated : x)));
      setMsg(`Đã đánh dấu "${updated.word}": ${STATUS_LABEL[status]}.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không đánh dấu được.');
    }
  }, []);

  const removeWord = useCallback(async (word: UserWord) => {
    const ok = await askConfirm({
      title: `Xóa từ "${word.word}"?`,
      message: 'Từ sẽ bị xóa khỏi Từ của tôi.',
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      danger: true,
    });
    if (!ok) return;
    api
      .deleteUserWord(word.id)
      .then(() => {
        setWords((list) => list.filter((x) => x.id !== word.id));
        setMsg(`Đã xóa từ "${word.word}".`);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Không xóa được từ.'));
  }, [askConfirm]);

  const startEdit = useCallback((word: UserWord) => {
    setEditing(word);
    setEditForm({
      phonetic: word.phonetic || '',
      pos: word.pos || '',
      meaning: word.meaning || '',
      example: word.example || '',
      topic: word.topic || '',
    });
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editing) return;
    if (!editForm.meaning.trim()) {
      setError('Nghĩa không được để trống.');
      return;
    }
    try {
      const updated = await api.updateUserWord(editing.id, {
        phonetic: editForm.phonetic,
        pos: editForm.pos,
        meaning: editForm.meaning,
        example: editForm.example,
        topic: editForm.topic,
      });
      setWords((list) => list.map((x) => (x.id === updated.id ? updated : x)));
      setEditing(null);
      setMsg(`Đã lưu sửa đổi cho từ "${updated.word}".`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không lưu được sửa đổi.');
    }
  }, [editing, editForm]);

  const lookupAdd = useCallback(async () => {
    const word = addForm.word.trim();
    if (!word) {
      setLookupError('Gõ từ cần thêm trước đã.');
      return;
    }
    setLookupError('');
    setLookupLoading(true);
    try {
      const entry = await api.dictionaryLookup(word);
      setAddForm((f) => ({
        ...f,
        word: entry.word,
        phonetic: entry.phonetic || '',
        pos: entry.pos || '',
        meaning: entry.meaning_vi,
        example: entry.example || '',
      }));
    } catch {
      setLookupError('Không tra được từ này, thử lại sau (hoặc tự gõ nghĩa rồi lưu).');
    } finally {
      setLookupLoading(false);
    }
  }, [addForm.word]);

  const saveAdd = useCallback(async () => {
    if (!addForm.word.trim() || !addForm.meaning.trim()) {
      setError('Cần có từ và nghĩa tiếng Việt mới lưu được.');
      return;
    }
    try {
      const row = await api.createUserWord({
        word: addForm.word.trim(),
        phonetic: addForm.phonetic || undefined,
        pos: addForm.pos || undefined,
        meaning: addForm.meaning.trim(),
        example: addForm.example || undefined,
        topic: addForm.topic || undefined,
      });
      if (row.existed) {
        setMsg(`Từ "${row.word}" đã có trong Từ của tôi rồi.`);
      } else {
        setWords((list) => [row, ...list]);
        setMsg(`Đã thêm từ "${row.word}" vào Từ của tôi.`);
      }
      setAddForm({ word: '', phonetic: '', pos: '', meaning: '', example: '', topic: '' });
      setShowAdd(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không thêm được từ.');
    }
  }, [addForm]);

  const keyExtractor = useCallback((v: UserWord) => String(v.id), []);
  const renderItem = useCallback(
    ({ item }: { item: UserWord }) => (
      <WordRow w={item} onMark={mark} onEdit={startEdit} onDelete={removeWord} />
    ),
    [mark, startEdit, removeWord],
  );

  const header = (
    <>
      {error ? (
        <Text style={[styles.error, { color: colors.danger, fontSize: scaled(14) }]}>{error}</Text>
      ) : null}
      {msg ? (
        <Text style={[styles.note, { color: colors.success, fontSize: scaled(14) }]}>{msg}</Text>
      ) : null}
      {/* Lọc trạng thái: 1 hàng trượt ngang, không còn vỡ thành 2-3 hàng lệch. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
        {STATUS_FILTERS.map((f) => (
          <Pressable
            key={f.id}
            style={[styles.chip, { borderColor: colors.border, backgroundColor: statusFilter === f.id ? colors.accent : colors.surface }, themedChip(colors), statusFilter === f.id && { backgroundColor: colors.accent, borderColor: colors.accent }]}
            onPress={() => {
              setStatusFilter(f.id);
              setIdx(0);
              setFlipped(false);
            }}
          >
            <Text style={{ color: statusFilter === f.id ? colors.onAccent : colors.text, fontSize: scaled(14), fontWeight: '600' }}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {/* Thêm từ mới: nút to cả hàng, không còn là pill chìm trong đống lọc. */}
      <Pressable
        style={[styles.addButton, { backgroundColor: colors.accent }, themedButton(colors)]}
        onPress={() => setShowAdd((v) => !v)}
      >
        <Text style={[styles.smallButtonText, { color: colors.onAccent, fontSize: scaled(14) }]}>＋ Thêm từ mới</Text>
      </Pressable>

      {showAdd && (
        <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }, themedCard(colors, 'card')]}>
          <Text style={[styles.formTitle, { color: colors.text, fontSize: scaled(16) }]}>Thêm từ mới</Text>
          <Text style={[styles.label, { color: colors.text, fontSize: scaled(14) }]}>Từ tiếng Anh</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.flexInput, { borderColor: colors.border, color: colors.text, fontSize: scaled(16) }, themedCard(colors, 'compact')]}
              value={addForm.word}
              onChangeText={(v) => setAddForm((f) => ({ ...f, word: v }))}
              placeholder="vd: supervisor"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
            />
            <Pressable
              style={[styles.smallButton, { backgroundColor: colors.accent, opacity: lookupLoading ? 0.6 : 1 }, themedButton(colors)]}
              onPress={() => void lookupAdd()}
              disabled={lookupLoading}
            >
              <Text style={[styles.smallButtonText, { color: colors.onAccent, fontSize: scaled(14) }]}>
                {lookupLoading ? 'Đang tra…' : 'Tra cứu'}
              </Text>
            </Pressable>
          </View>
          {lookupError ? (
            <Text style={[styles.error, { color: colors.danger, fontSize: scaled(14) }]}>{lookupError}</Text>
          ) : null}
          <Text style={[styles.hint, { color: colors.muted, fontSize: scaled(13) }]}>
            Bấm “Tra cứu” để tự điền phiên âm, loại từ và nghĩa — sửa lại nếu cần rồi bấm Lưu.
          </Text>
          {(
            [
              ['phonetic', 'Phiên âm', '/ˈsuːpərvaɪzər/'],
              ['pos', 'Loại từ', 'vd: danh từ'],
              ['meaning', 'Nghĩa tiếng Việt', ''],
              ['example', 'Ví dụ', ''],
              ['topic', 'Chủ đề (không bắt buộc)', 'vd: office'],
            ] as const
          ).map(([k, label, ph]) => (
            <View key={k}>
              <Text style={[styles.label, { color: colors.text, fontSize: scaled(14) }]}>{label}</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.text, fontSize: scaled(16) }, themedCard(colors, 'compact')]}
                value={addForm[k]}
                onChangeText={(v) => setAddForm((f) => ({ ...f, [k]: v }))}
                placeholder={ph}
                placeholderTextColor={colors.muted}
              />
            </View>
          ))}
          <View style={styles.row}>
            <Pressable
              style={[styles.smallButton, { backgroundColor: colors.accent, flex: 1 }, themedButton(colors)]}
              onPress={() => void saveAdd()}
            >
              <Text style={[styles.smallButtonText, { color: colors.onAccent, fontSize: scaled(14) }]}>Lưu từ</Text>
            </Pressable>
            <Pressable
              style={[styles.smallButton, styles.outlineButton, { borderColor: colors.border, flex: 1 }]}
              onPress={() => setShowAdd(false)}
            >
              <Text style={[styles.smallButtonText, { color: colors.text, fontSize: scaled(14) }]}>Đóng</Text>
            </Pressable>
          </View>
        </View>
      )}

      {w ? (
        <View style={[styles.flashcard, { backgroundColor: colors.surface, borderColor: colors.accent }, themedCard(colors, 'hero', colors.accentDark), { borderColor: colors.accent }]}>
          {/* Vùng lật thẻ RIÊNG — các nút điều hướng/đánh dấu nằm NGOÀI
              Pressable này nên bấm nút không còn lật thẻ nữa. */}
          <Pressable style={styles.flashFlip} onPress={() => setFlipped((f) => !f)}>
            {!flipped ? (
              <>
                {/* Chữ mặt trước thẻ 24 vỡ với từ dài trên màn hẹp nên giảm còn 22. */}
                {/* Từ dài tự co chữ để luôn 1 dòng (adjustsFontSizeToFit),
                    không vỡ 2 dòng ở cỡ chữ Rất lớn. */}
                <Text
                  style={[styles.flashWord, { color: colors.text, fontSize: scaled(22) }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {w.word}
                </Text>
                <Text style={[styles.flashMeta, { color: colors.muted, fontSize: scaled(15) }]}>
                  {[w.phonetic, w.pos].filter(Boolean).join(' · ')}
                </Text>
                <Text style={[styles.flashMeta, { color: colors.muted, fontSize: scaled(14) }]}>Chạm để lật thẻ</Text>
              </>
            ) : (
              <>
                <Text style={[styles.flashMeaning, { color: colors.text, fontSize: scaled(18) }]}>{w.meaning}</Text>
                {w.example ? (
                  <Text style={[styles.flashMeta, { color: colors.muted, fontSize: scaled(15) }]}>{w.example}</Text>
                ) : null}
              </>
            )}
            <Text style={[styles.flashMeta, { color: colors.muted, fontSize: scaled(13) }]}>
              Từ {safeIdx + 1}/{filtered.length} • {STATUS_LABEL[w.status]}
            </Text>
          </Pressable>
          <View style={styles.row}>
            <Pressable
              style={[styles.smallButton, styles.outlineButton, { borderColor: colors.border, flex: 1, opacity: safeIdx === 0 ? 0.5 : 1 }]}
              disabled={safeIdx === 0}
              onPress={() => {
                setIdx((i) => i - 1);
                setFlipped(false);
              }}
            >
              <Text style={[styles.smallButtonText, { color: colors.text, fontSize: scaled(14) }]}>← Từ trước</Text>
            </Pressable>
            <Pressable
              style={[styles.smallButton, styles.outlineButton, { borderColor: colors.border, flex: 1, opacity: safeIdx + 1 >= filtered.length ? 0.5 : 1 }]}
              disabled={safeIdx + 1 >= filtered.length}
              onPress={() => {
                setIdx((i) => i + 1);
                setFlipped(false);
              }}
            >
              <Text style={[styles.smallButtonText, { color: colors.text, fontSize: scaled(14) }]}>Từ tiếp →</Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            <Pressable
              style={[styles.smallButton, { backgroundColor: colors.accent, flex: 1 }, themedButton(colors)]}
              onPress={() => void mark(w.id, 'learned')}
            >
              <Text style={[styles.smallButtonText, { color: colors.onAccent, fontSize: scaled(14) }]}>Đã thuộc ✅</Text>
            </Pressable>
            <Pressable
              style={[styles.smallButton, { backgroundColor: colors.danger, flex: 1 }]}
              onPress={() => void mark(w.id, 'wrong')}
            >
              <Text style={[styles.smallButtonText, { color: colors.onAccent, fontSize: scaled(14) }]}>Chưa thuộc ❌</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        !loading && (
          <View style={[styles.formCard, styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }, themedCard(colors, 'card')]}>
            <Text style={styles.emptyIcon}>📖</Text>
            <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(15), textAlign: 'center' }]}>
              Chưa có từ nào ở đây. Khi luyện tập, bấm vào từ trong đoạn văn rồi chọn ＋ Lưu vào từ vựng —
              từ sẽ hiện ở đây. Bạn cũng có thể bấm “＋ Thêm từ mới” để tự thêm.
            </Text>
          </View>
        )
      )}

      {editing && (
        <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }, themedCard(colors, 'card')]}>
          <Text style={[styles.formTitle, { color: colors.text, fontSize: scaled(16) }]}>Sửa từ “{editing.word}”</Text>
          {(
            [
              ['phonetic', 'Phiên âm'],
              ['pos', 'Loại từ'],
              ['meaning', 'Nghĩa tiếng Việt'],
              ['example', 'Ví dụ'],
              ['topic', 'Chủ đề'],
            ] as const
          ).map(([k, label]) => (
            <View key={k}>
              <Text style={[styles.label, { color: colors.text, fontSize: scaled(14) }]}>{label}</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.text, fontSize: scaled(16) }, themedCard(colors, 'compact')]}
                value={editForm[k]}
                onChangeText={(v) => setEditForm((f) => ({ ...f, [k]: v }))}
              />
            </View>
          ))}
          <View style={styles.row}>
            <Pressable
              style={[styles.smallButton, { backgroundColor: colors.accent, flex: 1 }, themedButton(colors)]}
              onPress={() => void saveEdit()}
            >
              <Text style={[styles.smallButtonText, { color: colors.onAccent, fontSize: scaled(14) }]}>Lưu sửa đổi</Text>
            </Pressable>
            <Pressable
              style={[styles.smallButton, styles.outlineButton, { borderColor: colors.border, flex: 1 }]}
              onPress={() => setEditing(null)}
            >
              <Text style={[styles.smallButtonText, { color: colors.text, fontSize: scaled(14) }]}>Hủy</Text>
            </Pressable>
          </View>
        </View>
      )}

      {loading ? <LoadingLine location="table" /> : null}
      <Text style={[styles.section, { color: colors.text, fontSize: scaled(18) }]}>
        Danh sách từ ({filtered.length})
      </Text>
    </>
  );

  return (
    <FlatList
      data={filtered}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      {...LIST_DEFAULTS}
      style={styles.flex}
      ListHeaderComponent={header}
      contentContainerStyle={styles.list}
    />
  );
}

function SharedWords({ exam }: { exam: string }) {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const [words, setWords] = useState<Vocab[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  // Lọc theo chủ đề + flashcard (chuẩn web Vocabulary.tsx SharedWords).
  const [topic, setTopic] = useState('');
  const [flipped, setFlipped] = useState(false);
  const [idx, setIdx] = useState(0);
  const [allTopics, setAllTopics] = useState<string[]>([]);

  useEffect(() => {
    api
      .vocabulary(topic, 1000, exam)
      .then((w) => {
        setWords(w);
        setIdx(0);
        setFlipped(false);
        // Giữ lại mọi chủ đề từng thấy để bộ lọc không bị thu hẹp
        // khi đang lọc theo 1 chủ đề (bản web cũng chỉ lấy từ danh
        // sách hiện tại nên sẽ mất các chủ đề khác).
        setAllTopics((prev) => [...new Set([...prev, ...w.map((x) => x.topic || 'Chung')])]);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Không tải được từ chung.'))
      .finally(() => setLoading(false));
  }, [topic, exam]);

  const topics = useMemo(
    () => (allTopics.length ? allTopics : [...new Set(words.map((w) => w.topic || 'Chung'))]),
    [allTopics, words],
  );
  const safeIdx = words.length ? Math.min(idx, words.length - 1) : 0;
  const w = words[safeIdx];

  const mark = useCallback(async (id: string, status: 'learning' | 'learned' | 'wrong') => {
    try {
      await api.markVocab(id, status);
      setMsg(
        status === 'learned'
          ? 'Đã đánh dấu đã thuộc ✅'
          : status === 'wrong'
            ? 'Đã đưa vào danh sách ôn lại.'
            : 'Đã đánh dấu đang học.',
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không đánh dấu được.');
    }
  }, []);

  const keyExtractor = useCallback((v: Vocab) => v.id, []);
  const renderItem = useCallback(
    ({ item: v }: { item: Vocab }) => (
      <View style={[styles.wordCard, { backgroundColor: colors.surface, borderColor: colors.border }, themedCard(colors, 'compact')]}>
        <Text style={[styles.word, { color: colors.text, fontSize: scaled(16) }]}>{v.word}</Text>
        {[v.phonetic, v.topic].filter(Boolean).length ? (
          <Text style={[styles.wordMeta, { color: colors.muted, fontSize: scaled(14) }]}>
            {[v.phonetic, v.topic].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
        <Text style={[styles.wordMeaning, { color: colors.text, fontSize: scaled(15) }]}>{v.meaning}</Text>
        {v.example ? (
          <Text style={[styles.wordMeta, { color: colors.muted, fontSize: scaled(14) }]}>{v.example}</Text>
        ) : null}
        <View style={styles.chipRow}>
          <Pressable
            style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }, themedChip(colors)]}
            onPress={() => void mark(v.id, 'learned')}
          >
            <Text style={{ color: colors.text, fontSize: scaled(13), fontWeight: '600' }}>Đã thuộc ✅</Text>
          </Pressable>
          <Pressable
            style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }, themedChip(colors)]}
            onPress={() => void mark(v.id, 'wrong')}
          >
            <Text style={{ color: colors.text, fontSize: scaled(13), fontWeight: '600' }}>Chưa thuộc ❌</Text>
          </Pressable>
        </View>
      </View>
    ),
    [colors, scaled, mark],
  );

  if (loading) {
    // Khung thường, KHÔNG SafeAreaView lồng trong SafeAreaView của màn
    // (trước đây lồng 2 lớp safe-area nên lúc tải Từ chung nội dung bị
    // đẩy xuống thêm 1 khoảng notch).
    return (
      <View style={styles.flex}>
        <LoadingLine location="page" />
      </View>
    );
  }
  const header = (
    <>
      {error ? (
        <Text style={[styles.error, { color: colors.danger, fontSize: scaled(14) }]}>{error}</Text>
      ) : null}
      {msg ? (
        <Text style={[styles.note, { color: colors.success, fontSize: scaled(14) }]}>{msg}</Text>
      ) : null}
      {/* Lọc theo chủ đề: 1 hàng trượt ngang. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
        {['', ...topics].map((t) => (
          <Pressable
            key={t || 'all'}
            style={[styles.chip, { borderColor: colors.border, backgroundColor: topic === t ? colors.accent : colors.surface }, themedChip(colors), topic === t && { backgroundColor: colors.accent, borderColor: colors.accent }]}
            onPress={() => {
              setLoading(true);
              setTopic(t);
            }}
          >
            <Text style={{ color: topic === t ? colors.onAccent : colors.text, fontSize: scaled(14), fontWeight: '600' }}>
              {t === '' ? 'Tất cả chủ đề' : t}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {w ? (
        <View style={[styles.flashcard, { backgroundColor: colors.surface, borderColor: colors.accent }, themedCard(colors, 'hero', colors.accentDark), { borderColor: colors.accent }]}>
          <Pressable style={styles.flashFlip} onPress={() => setFlipped((f) => !f)}>
            {!flipped ? (
              <>
                {/* Chữ mặt trước thẻ 24 vỡ với từ dài trên màn hẹp nên giảm còn 22. */}
                <Text
                  style={[styles.flashWord, { color: colors.text, fontSize: scaled(22) }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {w.word}
                </Text>
                <Text style={[styles.flashMeta, { color: colors.muted, fontSize: scaled(15) }]}>{w.phonetic || ''}</Text>
                <Text style={[styles.flashMeta, { color: colors.muted, fontSize: scaled(14) }]}>Chạm để lật thẻ</Text>
              </>
            ) : (
              <>
                <Text style={[styles.flashMeaning, { color: colors.text, fontSize: scaled(18) }]}>{w.meaning}</Text>
                {w.example ? (
                  <Text style={[styles.flashMeta, { color: colors.muted, fontSize: scaled(15) }]}>{w.example}</Text>
                ) : null}
              </>
            )}
            <Text style={[styles.flashMeta, { color: colors.muted, fontSize: scaled(13) }]}>
              Từ {safeIdx + 1}/{words.length}
            </Text>
          </Pressable>
          <View style={styles.row}>
            <Pressable
              style={[styles.smallButton, styles.outlineButton, { borderColor: colors.border, flex: 1, opacity: safeIdx === 0 ? 0.5 : 1 }]}
              disabled={safeIdx === 0}
              onPress={() => {
                setIdx((i) => i - 1);
                setFlipped(false);
              }}
            >
              <Text style={[styles.smallButtonText, { color: colors.text, fontSize: scaled(14) }]}>← Từ trước</Text>
            </Pressable>
            <Pressable
              style={[styles.smallButton, styles.outlineButton, { borderColor: colors.border, flex: 1, opacity: safeIdx + 1 >= words.length ? 0.5 : 1 }]}
              disabled={safeIdx + 1 >= words.length}
              onPress={() => {
                setIdx((i) => i + 1);
                setFlipped(false);
              }}
            >
              <Text style={[styles.smallButtonText, { color: colors.text, fontSize: scaled(14) }]}>Từ tiếp →</Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            <Pressable
              style={[styles.smallButton, { backgroundColor: colors.accent, flex: 1 }, themedButton(colors)]}
              onPress={() => void mark(w.id, 'learned')}
            >
              <Text style={[styles.smallButtonText, { color: colors.onAccent, fontSize: scaled(14) }]}>Đã thuộc ✅</Text>
            </Pressable>
            <Pressable
              style={[styles.smallButton, { backgroundColor: colors.danger, flex: 1 }]}
              onPress={() => void mark(w.id, 'wrong')}
            >
              <Text style={[styles.smallButtonText, { color: colors.onAccent, fontSize: scaled(14) }]}>Chưa thuộc ❌</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      <Text style={[styles.section, { color: colors.text, fontSize: scaled(18) }]}>
        Danh sách từ ({words.length})
      </Text>
    </>
  );
  return (
    <View style={styles.flex}>
      <FlatList
        data={words}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        {...LIST_DEFAULTS}
        style={styles.flex}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={[styles.formCard, styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }, themedCard(colors, 'card')]}>
            <Text style={styles.emptyIcon}>📖</Text>
            <Text style={[styles.muted, { color: colors.muted, fontSize: scaled(15), textAlign: 'center' }]}>
              {topic
                ? `Không có từ chung thuộc chủ đề “${topic}”.`
                : 'Chưa có từ chung — từ vựng giờ lấy từ quá trình luyện tập của bạn: khi luyện tập, bấm vào từ trong đoạn văn rồi chọn ＋ Lưu vào từ vựng, từ sẽ nằm ở tab “Từ của tôi”.'}
            </Text>
          </View>
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Hàng tiêu đề: nút quay lại + tiêu đề cùng 1 hàng (không để nút lẻ 1 hàng gây thừa khoảng trắng).
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  safe: { flex: 1 },
  wrap: {
    flex: 1,
    paddingVertical: SPACING.md,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    gap: SPACING.sm,
  },
  flex: { flex: 1, gap: SPACING.sm, width: '100%' },
  title: { fontWeight: '700', flexWrap: 'wrap' },
  error: { flexWrap: 'wrap' },
  note: { flexWrap: 'wrap' },
  muted: { flexWrap: 'wrap' },
  hint: { flexWrap: 'wrap' },
  section: { fontWeight: '700', flexWrap: 'wrap', marginTop: SPACING.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, width: '100%' },
  // Segmented control cho 2 tab: 1 khung, 2 nửa bằng nhau.
  segmented: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: RADIUS.card,
    padding: 4,
    width: '100%',
  },
  segment: {
    flex: 1,
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Hàng lọc trạng thái: trượt ngang 1 hàng.
  filterScroll: { gap: SPACING.sm, paddingRight: SPACING.sm },
  addButton: {
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    width: '100%',
  },
  emptyCard: { alignItems: 'center', paddingVertical: SPACING.xl },
  emptyIcon: { fontSize: 36, textAlign: 'center' },
  chip: {
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  row: { flexDirection: 'row', gap: SPACING.sm, width: '100%' },
  flexInput: { flex: 1 },
  formCard: {
    borderWidth: 1,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    gap: SPACING.sm,
    width: '100%',
  },
  formTitle: { fontWeight: '700', flexWrap: 'wrap' },
  label: { fontWeight: '600', marginTop: SPACING.sm },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.button,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    width: '100%',
  },
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
  flashcard: {
    borderWidth: 1,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    gap: SPACING.sm,
    alignItems: 'center',
    width: '100%',
  },
  // Vùng lật thẻ: chỉ phần mặt thẻ nhận bấm lật, nút nằm ngoài.
  flashFlip: { alignItems: 'center', gap: SPACING.sm, width: '100%' },
  flashWord: { fontWeight: '700', textAlign: 'center', flexWrap: 'wrap' },
  flashMeaning: { fontWeight: '700', textAlign: 'center', flexWrap: 'wrap' },
  flashMeta: { textAlign: 'center', flexWrap: 'wrap' },
  list: { gap: SPACING.sm, paddingBottom: SPACING.xl },
  loader: { marginTop: SPACING.lg },
  wordCard: {
    borderWidth: 1,
    borderRadius: RADIUS.card,
    padding: CARD_PADDING,
    gap: SPACING.xs,
    width: '100%',
  },
  word: { fontWeight: '700', flexWrap: 'wrap' },
  wordMeta: { flexWrap: 'wrap' },
  wordMeaning: { flexWrap: 'wrap' },
});
