import { useEffect, useReducer } from 'react';
import { reducer } from './domain/reducer.ts';
import { createInitialState } from './domain/seed.ts';
import type { AppState } from './domain/types.ts';

const STORAGE_KEY = 'torihikisaki-master:v1';

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as AppState;
      if (s.schema === 1 && Array.isArray(s.rows)) return { ...s, notice: undefined };
    }
  } catch {
    // ストレージが使えない環境では初期データで動かす
  }
  return createInitialState();
}

export function useAppStore() {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, notice: undefined }));
    } catch {
      // 保存できなくても画面は動かす
    }
  }, [state]);
  return [state, dispatch] as const;
}

export const nowIso = () => new Date().toISOString();

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
