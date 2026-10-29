import type { CellValue, ColumnDef } from './types.ts';

export const isEmpty = (v: CellValue): boolean => v === null || v === '';

export const sameValue = (a: CellValue, b: CellValue): boolean =>
  (isEmpty(a) && isEmpty(b)) || a === b;

/** 入力文字列をカラム型に沿った値へ変換する。不正な数値は文字列のまま残し検証で弾く */
export function coerce(col: ColumnDef, raw: string): CellValue {
  const s = raw.replace(/\r?\n$/, '');
  if (col.type === 'number') {
    const t = s.replace(/[,，\s円]/g, '').replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : s;
  }
  if (s.trim() === '') return null;
  return s;
}

export function validateValue(col: ColumnDef, v: CellValue): string | null {
  if (isEmpty(v)) return col.required ? `${col.label}は必須です` : null;
  if (col.type === 'number') {
    if (typeof v !== 'number') return `${col.label}は数値で入力してください`;
    if (col.min !== undefined && v < col.min) return `${col.label}は${col.min}以上で入力してください`;
    return null;
  }
  const s = String(v);
  if (col.type === 'select' && col.options && !col.options.includes(s)) {
    return `${col.label}は選択肢（${col.options.join('／')}）から選んでください`;
  }
  if (col.maxLength !== undefined && [...s].length > col.maxLength) {
    return `${col.label}は${col.maxLength}文字以内で入力してください`;
  }
  if (col.pattern && !new RegExp(col.pattern).test(s)) {
    return `${col.label}の形式が正しくありません（${col.patternMessage ?? col.pattern}）`;
  }
  return null;
}

export function formatValue(col: ColumnDef, v: CellValue): string {
  if (v === null) return '';
  if (col.type === 'number' && typeof v === 'number') return v.toLocaleString('ja-JP');
  return String(v);
}
