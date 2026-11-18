// Bối cảnh kỳ thi đang chọn (TOEIC / IELTS Academic) — port từ
// frontend/src/exam.tsx (web). Lưu AsyncStorage thay cho localStorage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export type ExamId = 'toeic' | 'ielts';

const KEY = 'app_exam';

interface ExamCtx {
  exam: ExamId | null;
  setExam: (e: ExamId) => void;
  clearExam: () => void;
}
const Ctx = createContext<ExamCtx | null>(null);

export function ExamProvider({ children }: { children: ReactNode }) {
  const [exam, setExamState] = useState<ExamId | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === 'toeic' || v === 'ielts') setExamState(v);
      })
      .catch(() => {
        /* AsyncStorage không dùng được thì bắt chọn lại */
      });
  }, []);

  const setExam = useCallback((e: ExamId) => {
    AsyncStorage.setItem(KEY, e).catch(() => {
      /* bỏ qua */
    });
    setExamState(e);
  }, []);
  const clearExam = useCallback(() => {
    AsyncStorage.removeItem(KEY).catch(() => {
      /* bỏ qua */
    });
    setExamState(null);
  }, []);

  return <Ctx.Provider value={{ exam, setExam, clearExam }}>{children}</Ctx.Provider>;
}

export function useExam(): ExamCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useExam phải dùng trong ExamProvider');
  return c;
}
