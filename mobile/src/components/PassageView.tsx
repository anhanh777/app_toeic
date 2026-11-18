// Đoạn văn của 1 khối câu hỏi — port của phần renderPassage /
// PassageWithBlanks trong PracticeSession/MockTest (web).
// - Đoạn đọc (TOEIC P6/P7, IELTS Reading): từ bấm được để tra từ
//   (WordText / useWordPopover — 1 popover dùng chung cho cả đoạn).
// - Part 6 (TOEIC): chỗ trống `131. ________` thành chip số có màu
//   (bấm để tới câu hỏi; đã trả lời thì chip hiện chữ cái đã chọn).
// Chip vẽ bằng <Text onPress> lồng trong <Text> (View không lồng được
// trong Text trên Android).
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { RADIUS } from '../layout';
import { useTextSize, useTheme } from '../theme';
import { renderWordNodes, useSavedWords, useWordPopover, WordLookupModal } from './WordLookup';

export interface BlankState {
  selected?: string;
  graded?: boolean | null;
}

interface Props {
  text: string;
  /** Part 6 TOEIC: chỗ trống thành chip số. */
  isP6?: boolean;
  blanks?: Record<number, BlankState>;
  onBlankClick?: (num: number) => void;
  /** Đoạn đọc: từ bấm được để tra từ. */
  wordLookup?: boolean;
}

export default function PassageView({ text, isP6, blanks, onBlankClick, wordLookup }: Props) {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const saved = useSavedWords();
  const { pop, openWord, close, save, unsave, saving, savedRow } = useWordPopover(text);
  const fontSize = scaled(16);
  const lineHeight = scaled(24);

  let nodes: ReactNode[];
  if (!isP6) {
    nodes = wordLookup
      ? renderWordNodes(text, saved, openWord, colors.text, fontSize)
      : [text];
  } else {
    // Tách văn bản thành: đoạn thường | chip chỗ trống có số | chip trống.
    const parts: ReactNode[] = [];
    const re = /(\d+)\s*\.\s*_{2,}|_{2,}/g;
    let last = 0;
    let k = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) {
        const seg = text.slice(last, m.index);
        parts.push(
          ...(wordLookup
            ? renderWordNodes(seg, saved, openWord, colors.text, fontSize)
            : [seg]),
        );
      }
      const numMatch = /^(\d+)\s*\./.exec(m[0]);
      const num = numMatch ? Number(numMatch[1]) : null;
      const st = num != null ? blanks?.[num] : undefined;
      const bg =
        st?.selected && st.graded === true
          ? colors.success
          : st?.selected && st.graded === false
            ? colors.danger
            : st?.selected
              ? colors.accent
              : colors.surfaceMuted;
      parts.push(
        <Text
          key={`blank-${k++}`}
          onPress={() => {
            if (num != null) onBlankClick?.(num);
          }}
          style={{
            color: st?.selected ? colors.onAccent : colors.text,
            fontSize,
            backgroundColor: bg,
            borderRadius: RADIUS.button,
            fontWeight: '700',
          }}
        >
          {` ${num != null ? num : '…'}${st?.selected ? ` · ${st.selected}` : ''} `}
        </Text>,
      );
      last = m.index + m[0].length;
    }
    if (last < text.length) {
      const seg = text.slice(last);
      parts.push(
        ...(wordLookup
          ? renderWordNodes(seg, saved, openWord, colors.text, fontSize)
          : [seg]),
      );
    }
    nodes = parts;
  }

  return (
    <>
      <Text style={{ color: colors.text, fontSize, lineHeight, flexWrap: 'wrap' }}>{nodes}</Text>
      <WordLookupModal
        pop={pop}
        savedRow={savedRow}
        saving={saving}
        onClose={close}
        onSave={() => void save()}
        onUnsave={() => void unsave()}
      />
    </>
  );
}
