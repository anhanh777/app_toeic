// Bang tien to / hau to / goc tu — dung cho tab "Tien to – Hau to",
// to sang affix tren flashcard + bang tu, va dang quiz "affix".
// MOI tu vi du da duoc kiem chung co that trong de thi cua app
// (grep khop ca tu, khong phan biet hoa/thuong, trong
// data/questions.json (content) + data/ielts-cam*.json
// (passageText + content)). split[0] + split[1] phai ghep dung lai
// thanh tu; phan affix la phan bang dung bareAffix(affix).

export type AffixKind = 'prefix' | 'suffix' | 'root';

export interface AffixExample {
  word: string;
  meaning: string;
  split: [string, string];
}

export interface AffixEntry {
  affix: string;
  kind: AffixKind;
  meaning: string;
  examples: AffixExample[];
}

export const AFFIX_KIND_LABEL: Record<AffixKind, string> = {
  prefix: 'tiền tố',
  suffix: 'hậu tố',
  root: 'gốc từ',
};

/** Bo dau '-' de so sanh voi 1 phan cua split (vd 'un-' -> 'un'). */
export function bareAffix(affix: string): string {
  return affix.replace(/-/g, '');
}

export const AFFIXES: AffixEntry[] = [
  // ---- Tien to ----
  { affix: 'un-', kind: 'prefix', meaning: 'không, phủ định', examples: [
    { word: 'unhappy', meaning: 'không vui', split: ['un', 'happy'] },
    { word: 'uncertain', meaning: 'không chắc chắn', split: ['un', 'certain'] },
    { word: 'unavailable', meaning: 'không có sẵn', split: ['un', 'available'] },
  ] },
  { affix: 'dis-', kind: 'prefix', meaning: 'không, trái ngược', examples: [
    { word: 'disagree', meaning: 'không đồng ý', split: ['dis', 'agree'] },
    { word: 'disappear', meaning: 'biến mất', split: ['dis', 'appear'] },
    { word: 'dissatisfied', meaning: 'không hài lòng', split: ['dis', 'satisfied'] },
  ] },
  { affix: 're-', kind: 'prefix', meaning: 'lại, làm lại', examples: [
    { word: 'return', meaning: 'trở lại, trả lại', split: ['re', 'turn'] },
    { word: 'review', meaning: 'xem lại, ôn lại', split: ['re', 'view'] },
    { word: 'replace', meaning: 'thay thế', split: ['re', 'place'] },
  ] },
  { affix: 'pre-', kind: 'prefix', meaning: 'trước', examples: [
    { word: 'prepare', meaning: 'chuẩn bị', split: ['pre', 'pare'] },
    { word: 'previous', meaning: 'trước đó', split: ['pre', 'vious'] },
    { word: 'prevent', meaning: 'ngăn ngừa', split: ['pre', 'vent'] },
  ] },
  { affix: 'mis-', kind: 'prefix', meaning: 'sai, nhầm', examples: [
    { word: 'mistake', meaning: 'lỗi, sai lầm', split: ['mis', 'take'] },
    { word: 'misunderstood', meaning: 'bị hiểu lầm', split: ['mis', 'understood'] },
    { word: 'misplaced', meaning: 'để nhầm chỗ', split: ['mis', 'placed'] },
  ] },
  { affix: 'over-', kind: 'prefix', meaning: 'quá, trên', examples: [
    { word: 'overcome', meaning: 'vượt qua', split: ['over', 'come'] },
    { word: 'overtime', meaning: 'làm thêm giờ', split: ['over', 'time'] },
    { word: 'overlook', meaning: 'bỏ qua', split: ['over', 'look'] },
  ] },
  { affix: 'under-', kind: 'prefix', meaning: 'dưới, không đủ', examples: [
    { word: 'understand', meaning: 'hiểu', split: ['under', 'stand'] },
    { word: 'underline', meaning: 'gạch dưới', split: ['under', 'line'] },
    { word: 'undergo', meaning: 'trải qua', split: ['under', 'go'] },
  ] },
  { affix: 'inter-', kind: 'prefix', meaning: 'giữa, lẫn nhau', examples: [
    { word: 'international', meaning: 'quốc tế', split: ['inter', 'national'] },
    { word: 'interview', meaning: 'phỏng vấn', split: ['inter', 'view'] },
    { word: 'interaction', meaning: 'sự tương tác', split: ['inter', 'action'] },
  ] },
  { affix: 'trans-', kind: 'prefix', meaning: 'xuyên qua, chuyển', examples: [
    { word: 'transfer', meaning: 'chuyển', split: ['trans', 'fer'] },
    { word: 'translate', meaning: 'dịch', split: ['trans', 'late'] },
    { word: 'transport', meaning: 'vận chuyển', split: ['trans', 'port'] },
  ] },
  { affix: 'sub-', kind: 'prefix', meaning: 'dưới, phụ', examples: [
    { word: 'subway', meaning: 'tàu điện ngầm', split: ['sub', 'way'] },
    { word: 'submit', meaning: 'nộp', split: ['sub', 'mit'] },
    { word: 'subscribe', meaning: 'đăng ký', split: ['sub', 'scribe'] },
  ] },
  // ---- Hau to ----
  { affix: '-tion', kind: 'suffix', meaning: 'sự, hành động (tạo danh từ)', examples: [
    { word: 'information', meaning: 'thông tin', split: ['informa', 'tion'] },
    { word: 'education', meaning: 'giáo dục', split: ['educa', 'tion'] },
    { word: 'invitation', meaning: 'lời mời', split: ['invita', 'tion'] },
  ] },
  { affix: '-ment', kind: 'suffix', meaning: 'sự, trạng thái (tạo danh từ)', examples: [
    { word: 'development', meaning: 'sự phát triển', split: ['develop', 'ment'] },
    { word: 'management', meaning: 'quản lý', split: ['manage', 'ment'] },
    { word: 'agreement', meaning: 'thỏa thuận', split: ['agree', 'ment'] },
  ] },
  { affix: '-ness', kind: 'suffix', meaning: 'tính, trạng thái (tạo danh từ)', examples: [
    { word: 'weakness', meaning: 'điểm yếu', split: ['weak', 'ness'] },
    { word: 'business', meaning: 'kinh doanh', split: ['busi', 'ness'] },
    { word: 'darkness', meaning: 'bóng tối', split: ['dark', 'ness'] },
  ] },
  { affix: '-ity', kind: 'suffix', meaning: 'tính chất, trạng thái (tạo danh từ)', examples: [
    { word: 'activity', meaning: 'hoạt động', split: ['activ', 'ity'] },
    { word: 'ability', meaning: 'khả năng', split: ['abil', 'ity'] },
    { word: 'possibility', meaning: 'khả năng xảy ra', split: ['possibil', 'ity'] },
  ] },
  { affix: '-able', kind: 'suffix', meaning: 'có thể, đáng (tạo tính từ)', examples: [
    { word: 'available', meaning: 'có sẵn', split: ['avail', 'able'] },
    { word: 'comfortable', meaning: 'thoải mái', split: ['comfort', 'able'] },
    { word: 'suitable', meaning: 'phù hợp', split: ['suit', 'able'] },
  ] },
  { affix: '-ful', kind: 'suffix', meaning: 'đầy, có nhiều (tạo tính từ)', examples: [
    { word: 'successful', meaning: 'thành công', split: ['success', 'ful'] },
    { word: 'helpful', meaning: 'hữu ích', split: ['help', 'ful'] },
    { word: 'careful', meaning: 'cẩn thận', split: ['care', 'ful'] },
  ] },
  { affix: '-less', kind: 'suffix', meaning: 'không có (tạo tính từ)', examples: [
    { word: 'harmless', meaning: 'vô hại', split: ['harm', 'less'] },
    { word: 'wireless', meaning: 'không dây', split: ['wire', 'less'] },
    { word: 'countless', meaning: 'vô số', split: ['count', 'less'] },
  ] },
  { affix: '-ous', kind: 'suffix', meaning: 'có, đầy (tạo tính từ)', examples: [
    { word: 'famous', meaning: 'nổi tiếng', split: ['fam', 'ous'] },
    { word: 'serious', meaning: 'nghiêm trọng', split: ['seri', 'ous'] },
    { word: 'dangerous', meaning: 'nguy hiểm', split: ['danger', 'ous'] },
  ] },
  { affix: '-ive', kind: 'suffix', meaning: 'có tính chất (tạo tính từ)', examples: [
    { word: 'active', meaning: 'năng động', split: ['act', 'ive'] },
    { word: 'expensive', meaning: 'đắt', split: ['expens', 'ive'] },
    { word: 'effective', meaning: 'hiệu quả', split: ['effect', 'ive'] },
  ] },
  { affix: '-ly', kind: 'suffix', meaning: 'một cách (tạo trạng từ)', examples: [
    { word: 'quickly', meaning: 'nhanh chóng', split: ['quick', 'ly'] },
    { word: 'recently', meaning: 'gần đây', split: ['recent', 'ly'] },
    { word: 'finally', meaning: 'cuối cùng', split: ['final', 'ly'] },
  ] },
  { affix: '-er', kind: 'suffix', meaning: 'người/vật làm (tạo danh từ)', examples: [
    { word: 'teacher', meaning: 'giáo viên', split: ['teach', 'er'] },
    { word: 'worker', meaning: 'công nhân', split: ['work', 'er'] },
    { word: 'manager', meaning: 'quản lý', split: ['manag', 'er'] },
  ] },
  // ---- Goc tu ----
  { affix: 'dict', kind: 'root', meaning: 'nói', examples: [
    { word: 'predict', meaning: 'dự đoán', split: ['pre', 'dict'] },
    { word: 'dictate', meaning: 'đọc cho viết', split: ['dict', 'ate'] },
  ] },
  { affix: 'spect', kind: 'root', meaning: 'nhìn', examples: [
    { word: 'inspect', meaning: 'kiểm tra', split: ['in', 'spect'] },
    { word: 'respect', meaning: 'tôn trọng', split: ['re', 'spect'] },
    { word: 'aspect', meaning: 'khía cạnh', split: ['a', 'spect'] },
  ] },
  { affix: 'port', kind: 'root', meaning: 'mang, chở', examples: [
    { word: 'import', meaning: 'nhập khẩu', split: ['im', 'port'] },
    { word: 'export', meaning: 'xuất khẩu', split: ['ex', 'port'] },
    { word: 'report', meaning: 'báo cáo', split: ['re', 'port'] },
  ] },
  { affix: 'struct', kind: 'root', meaning: 'xây dựng', examples: [
    { word: 'construct', meaning: 'xây dựng', split: ['con', 'struct'] },
    { word: 'structure', meaning: 'cấu trúc', split: ['struct', 'ure'] },
    { word: 'instruct', meaning: 'hướng dẫn', split: ['in', 'struct'] },
  ] },
  { affix: 'ject', kind: 'root', meaning: 'ném, phóng', examples: [
    { word: 'project', meaning: 'dự án', split: ['pro', 'ject'] },
    { word: 'reject', meaning: 'từ chối', split: ['re', 'ject'] },
    { word: 'object', meaning: 'vật thể', split: ['ob', 'ject'] },
  ] },
];

/** Mang phang tat ca tu vi du — dung lam ngan hang cau quiz 'affix'. */
export interface AffixQuizItem {
  word: string;
  meaning: string;
  affix: string;
  affixMeaning: string;
  kind: AffixKind;
}

export const AFFIX_EXAMPLES: AffixQuizItem[] = AFFIXES.flatMap((entry) =>
  entry.examples.map((ex) => ({
    word: ex.word,
    meaning: ex.meaning,
    affix: entry.affix,
    affixMeaning: entry.meaning,
    kind: entry.kind,
  })),
);

const EXAMPLE_INDEX = new Map<string, { entry: AffixEntry; parts: [string, string] }>();
for (const entry of AFFIXES) {
  for (const ex of entry.examples) {
    if (!EXAMPLE_INDEX.has(ex.word)) EXAMPLE_INDEX.set(ex.word, { entry, parts: ex.split });
  }
}

/** Nguon DUY NHAT cho viec to sang affix: chi tra ve khi tu khop
 * CHINH XAC (lowercase) mot tu vi du trong bang — khong doan tach
 * bang quy tac chuoi (tranh tach sai kieu 'under' -> 'un' + 'der'). */
export function findAffixSplit(word: string): { entry: AffixEntry; parts: [string, string] } | null {
  return EXAMPLE_INDEX.get(word.trim().toLowerCase()) ?? null;
}
