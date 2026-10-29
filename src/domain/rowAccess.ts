import type { AccessCondition, AppState, CellValue, Role, RowAccessRule } from './types.ts';

export const DEFAULT_ROW_ACCESS: RowAccessRule[] = [
  {
    id: 'ra-active',
    label: '取引中の取引先',
    conditions: [{ colKey: 'status', op: 'in', values: ['取引中'] }],
    roles: ['requester'],
  },
  {
    id: 'ra-all',
    label: 'すべての取引先',
    conditions: [],
    roles: ['accounting', 'approver', 'admin'],
  },
];

export const OP_LABEL: Record<AccessCondition['op'], string> = {
  in: 'いずれかに一致',
  notIn: 'いずれにも一致しない',
  empty: '空',
  notEmpty: '空でない',
};

const isEmpty = (v: CellValue | undefined) => v === null || v === undefined || v === '';

export function matchCondition(values: Record<string, CellValue>, cond: AccessCondition): boolean {
  const v = values[cond.colKey];
  switch (cond.op) {
    case 'empty': return isEmpty(v);
    case 'notEmpty': return !isEmpty(v);
    case 'in': return !isEmpty(v) && cond.values.includes(String(v));
    case 'notIn': return isEmpty(v) || !cond.values.includes(String(v));
  }
}

export const matchesRule = (values: Record<string, CellValue>, rule: RowAccessRule): boolean =>
  rule.conditions.every((c) => matchCondition(values, c));

export const rulesFor = (state: AppState, role: Role): RowAccessRule[] =>
  state.rowAccess.filter((r) => r.roles.includes(role));

/** ロールに紐づくいずれかの閲覧範囲に該当すれば閲覧できる。紐づく閲覧範囲がなければ1行も閲覧できない */
export const canSeeValues = (state: AppState, role: Role, values: Record<string, CellValue>): boolean =>
  rulesFor(state, role).some((r) => matchesRule(values, r));

/** 確定済み行を閲覧できるか（下書きではなく確定値で判定するので、編集中に行が消えない） */
export function canSeeRow(state: AppState, role: Role, rowId: string): boolean {
  const row = state.rows.find((r) => r.id === rowId);
  return !!row && canSeeValues(state, role, row.values);
}
