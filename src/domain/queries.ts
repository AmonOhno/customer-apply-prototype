import { canRead } from './permissions.ts';
import { cellView, type CellStatus, type CellView, type GridContext, type GridRow } from './grid.ts';
import type { CellValue, ColumnDef } from './types.ts';

/**
 * クエリ：表に表示するレコード（行）とカラム（項目）を決める定義。
 * 条件はデータとして持つので、将来はユーザー定義クエリとして保存・共有できる。
 */
export type RowCondition =
  /** 行内に指定した状態のセルがある */
  | { kind: 'status'; statuses: CellStatus[] }
  /** 行内に入力エラーのセルがある */
  | { kind: 'error' }
  /** 確定済み行の最終更新日時。新規行（未登録）は該当しない */
  | { kind: 'updatedAt'; op: 'within' | 'olderThan'; months: number }
  /**
   * 項目の確定値で絞り込む（新規行は入力値）。編集中に行が消えないよう下書きは見ない。
   * 閲覧権限のない項目の条件は該当なしとし、値を推測させない
   */
  | { kind: 'field'; colKey: string; op: 'empty' | 'in'; values?: string[] }
  /** いずれかを満たす */
  | { kind: 'any'; of: RowCondition[] };

export type ColumnSelector =
  | { kind: 'all' }
  /** 指定した項目のみ（固定列は常に表示） */
  | { kind: 'keys'; keys: string[] }
  /** 表示行の中で、指定状態のセルを含む項目のみ（固定列は常に表示） */
  | { kind: 'changed'; statuses: CellStatus[] };

export interface QueryDef {
  id: string;
  label: string;
  description: string;
  /** すべてを満たす行を表示（空なら全行） */
  rows: RowCondition[];
  columns: ColumnSelector;
  sort?: { by: 'updatedAt'; dir: 'asc' | 'desc' };
}

const CHANGED: CellStatus[] = ['draft', 'new', 'pending', 'rejected'];

export const QUERIES: QueryDef[] = [
  {
    id: 'all',
    label: 'すべて',
    description: 'すべての取引先・項目を表示します。',
    rows: [],
    columns: { kind: 'all' },
  },
  {
    id: 'changed',
    label: '変更箇所のみ',
    description: '編集中・新規・承認待ち・差戻しのセルがある取引先と、その項目だけを表示します（コード・取引先名は常に表示）。',
    rows: [{ kind: 'status', statuses: CHANGED }],
    columns: { kind: 'changed', statuses: CHANGED },
  },
  {
    id: 'recent',
    label: '直近1ヶ月に更新',
    description: '最終更新日時が直近1ヶ月以内の取引先を、新しい順に表示します。',
    rows: [{ kind: 'updatedAt', op: 'within', months: 1 }],
    columns: { kind: 'all' },
    sort: { by: 'updatedAt', dir: 'desc' },
  },
  {
    id: 'pending',
    label: '承認待ち',
    description: '承認待ちの変更がある取引先と、申請中の項目だけを表示します。承認前の確認に使います。',
    rows: [{ kind: 'status', statuses: ['pending'] }],
    columns: { kind: 'changed', statuses: ['pending'] },
  },
  {
    id: 'todo',
    label: '要対応（差戻し・エラー）',
    description: '差戻された変更や入力エラーが残っている取引先を表示します。申請前の見直しに使います。',
    rows: [{ kind: 'any', of: [{ kind: 'status', statuses: ['rejected'] }, { kind: 'error' }] }],
    columns: { kind: 'all' },
  },
  {
    id: 'invoice-missing',
    label: 'インボイス番号未登録',
    description: '取引中の仕入先のうち、適格請求書発行事業者番号が確定値で未登録のものを表示します。仕入税額控除の確認に使います。',
    rows: [
      { kind: 'field', colKey: 'category', op: 'in', values: ['仕入先', '仕入先・得意先'] },
      { kind: 'field', colKey: 'status', op: 'in', values: ['取引中'] },
      { kind: 'field', colKey: 'invoiceNo', op: 'empty' },
    ],
    columns: { kind: 'keys', keys: ['category', 'corpNo', 'invoiceNo', 'address', 'status', 'note'] },
  },
  {
    id: 'payment',
    label: '支払・与信項目',
    description: '支払条件・振込先口座・与信限度額など経理が管理する項目だけを表示します。',
    rows: [],
    columns: { kind: 'keys', keys: ['category', 'invoiceNo', 'paymentTerms', 'bank', 'creditLimit', 'status'] },
  },
  {
    id: 'stale',
    label: '1年以上未更新',
    description: '最終更新から1年以上経過した取引中の取引先を、古い順に表示します。定期的な登録内容の棚卸しに使います。',
    rows: [
      { kind: 'updatedAt', op: 'olderThan', months: 12 },
      { kind: 'field', colKey: 'status', op: 'in', values: ['取引中'] },
    ],
    columns: { kind: 'all' },
    sort: { by: 'updatedAt', dir: 'asc' },
  },
];

export const queryById = (id: string): QueryDef => QUERIES.find((q) => q.id === id) ?? QUERIES[0];

export const monthsAgo = (now: number, months: number): number => {
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return d.getTime();
};

const isEmpty = (v: CellValue | undefined) => v === null || v === undefined || v === '';

/** 新規行のセルは状態が一律「新規／承認待ち」なので、入力済みかエラーのあるセルだけを変更とみなす */
function cellChanged(row: GridRow, v: CellView, statuses: CellStatus[]): boolean {
  if (!statuses.includes(v.status)) return false;
  return row.kind === 'committed' || !isEmpty(v.value) || !!v.error;
}

export interface QueryResult {
  rows: GridRow[];
  columns: ColumnDef[];
}

export function applyQuery(ctx: GridContext, allRows: GridRow[], q: QueryDef, now: number = Date.now()): QueryResult {
  const { state, user } = ctx;
  const cols = state.columns;
  const committed = new Map(state.rows.map((r) => [r.id, r]));
  const viewsOf = new Map<string, CellView[]>();
  const views = (row: GridRow) => {
    let v = viewsOf.get(row.id);
    if (!v) viewsOf.set(row.id, v = cols.map((c) => cellView(ctx, row, c)));
    return v;
  };

  const test = (row: GridRow, cond: RowCondition): boolean => {
    switch (cond.kind) {
      case 'status':
        return views(row).some((v) => cellChanged(row, v, cond.statuses));
      case 'error':
        return views(row).some((v) => !!v.error);
      case 'updatedAt': {
        const r = committed.get(row.id);
        if (row.kind !== 'committed' || !r) return false;
        const t = Date.parse(r.updatedAt);
        const edge = monthsAgo(now, cond.months);
        return cond.op === 'within' ? t >= edge : t < edge;
      }
      case 'field': {
        const col = cols.find((c) => c.key === cond.colKey);
        if (!col || !canRead(col, user.role)) return false;
        const value = row.kind === 'committed' ? committed.get(row.id)?.values[col.key] : row.values[col.key];
        return cond.op === 'empty' ? isEmpty(value) : !isEmpty(value) && (cond.values ?? []).includes(String(value));
      }
      case 'any':
        return cond.of.some((c) => test(row, c));
    }
  };

  let rows = allRows.filter((row) => q.rows.every((c) => test(row, c)));
  if (q.sort) {
    const sign = q.sort.dir === 'asc' ? 1 : -1;
    const at = (row: GridRow) => committed.get(row.id)?.updatedAt;
    // 確定済み行だけを並べ替え、新規行は従来どおり末尾に置く
    const sorted = rows.filter((r) => r.kind === 'committed')
      .sort((a, b) => sign * String(at(a)).localeCompare(String(at(b))));
    rows = [...sorted, ...rows.filter((r) => r.kind !== 'committed')];
  }

  const sel = q.columns;
  let columns: ColumnDef[];
  if (sel.kind === 'all') columns = cols;
  else if (sel.kind === 'keys') columns = cols.filter((c) => c.frozen || sel.keys.includes(c.key));
  else {
    columns = cols.filter((c, ci) => c.frozen || rows.some((row) => cellChanged(row, views(row)[ci], sel.statuses)));
  }
  return { rows, columns };
}
