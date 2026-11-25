// TierBadge + XpBar — port từ frontend/src/components.tsx (tierOf,
// xpLevel, TierBadge, XpBar). Ngưỡng/mốc giữ đúng bản web:
// tier theo tổng điểm TOEIC, 100 XP = 1 cấp.
import { StyleSheet, Text, View } from 'react-native';
import { themedBarTrack, useTextSize, useTheme, type Palette } from '../theme';

export interface Tier {
  name: string;
  icon: string;
}

/** Rank tier từ tổng điểm TOEIC (cùng ngưỡng với scoreLevel). */
export function tierOf(total?: number | null): Tier {
  if (total == null) return { name: 'Chưa xếp hạng', icon: '✦' };
  if (total < 450) return { name: 'Đồng', icon: '🥉' };
  if (total < 600) return { name: 'Bạc', icon: '🥈' };
  if (total < 750) return { name: 'Vàng', icon: '🥇' };
  if (total < 900) return { name: 'Bạch kim', icon: '💎' };
  return { name: 'Kim cương', icon: '👑' };
}

/** Màu huy hiệu theo tier — dùng token màu mới trong Palette. */
function tierColors(name: string, colors: Palette): { bg: string; fg: string } {
  switch (name) {
    case 'Đồng':
      return { bg: colors.amberBg, fg: colors.bronze };
    case 'Bạc':
      return { bg: colors.surfaceMuted, fg: colors.silver };
    case 'Vàng':
      return { bg: colors.amberBg, fg: colors.goldInk };
    case 'Bạch kim':
      return { bg: colors.sky, fg: colors.examBlue };
    case 'Kim cương':
      return { bg: colors.lavender, fg: colors.examBlue };
    default:
      return { bg: colors.surfaceMuted, fg: colors.muted };
  }
}

export function TierBadge({ total }: { total?: number | null }) {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const t = tierOf(total);
  const c = tierColors(t.name, colors);
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg, fontSize: scaled(14) }]}>
        {t.icon} {t.name}
      </Text>
    </View>
  );
}

/** Level từ tổng XP: 100 XP = 1 cấp. */
export function xpLevel(totalXp: number): { level: number; progress: number } {
  const xp = Math.max(0, totalXp || 0);
  return { level: Math.floor(xp / 100) + 1, progress: xp % 100 };
}

export function XpBar({ xp, gold }: { xp: number; gold?: boolean }) {
  const { colors } = useTheme();
  const { scaled } = useTextSize();
  const { level, progress } = xpLevel(xp);
  return (
    <View style={styles.xpWrap}>
      <View style={styles.xpLabelRow}>
        <Text style={[styles.xpLabel, { color: colors.text, fontSize: scaled(13) }]}>⭐ Cấp {level}</Text>
        <Text style={[styles.xpLabel, { color: colors.muted, fontSize: scaled(13) }]}>{progress}/100 XP</Text>
      </View>
      <View style={[styles.xpTrack, { backgroundColor: colors.surfaceMuted }, themedBarTrack(colors)]}>
        <View
          style={[
            styles.xpFill,
            { width: `${progress}%`, backgroundColor: gold ? colors.gold : colors.accent },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignSelf: 'center',
  },
  badgeText: { fontWeight: '700', textAlign: 'center' },
  xpWrap: { gap: 4, width: '100%' },
  xpLabelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, width: '100%' },
  xpLabel: { fontWeight: '700' },
  xpTrack: { height: 8, borderRadius: 4, overflow: 'hidden', width: '100%' },
  xpFill: { height: '100%', borderRadius: 4 },
});
