import { canRead, lockReason, pendingIndex, type LockReason } from './permissions.ts';
import type { AppState, CellValue, ColumnDef, User } from './types.ts';
import { cellKey } from './types.ts';
import { formatValue, validateValue } from './validation.ts';

export type RowKind = 'committed' | 'draft-new' | 'pending-new';

export interface GridRow {
  id: string;
  kind: RowKind;
  /** 下書きを重ねた表示用の値 */
  values: Record<string, CellValue>;
  changeSetId?: string;
  rejectedFrom?: string;
}

export type CellStatus = 'clean' | 'draft' | 'pending' | 'rejected' | 'approved' | 'new';

export interface CellView {
  value: CellValue;
  text: string;
  masked: boolean;
  status: CellStatus;
  lock: LockReason;
  error: string | null;
  changeSetId?: string;
}

export const STATUS_LABEL: Record<CellStatus, string> = {
  clean: '確定',
  draft: '編集中',
  pending: '承認待ち',
  rejected: '差戻し',
  approved: '承認済（24時間以内）',
  new: '新規（未申請）',
};

export const MASK = '••••••';

export function userDrafts(state: AppState, userId: string) {
  return state.drafts[userId] ?? { cells: {}, newRows: [] };
}

export function buildGridRows(state: AppState, user: User): GridRow[] {
  const drafts = userDrafts(state, user.id);
  const committed: GridRow[] = state.rows
    .map((r) => {
      const values = { ...r.values };
      let rejectedFrom: string | undefined;
      for (const col of state.columns) {
        const d = drafts.cells[cellKey(r.id, col.key)];
        if (d) {
          values[col.key] = d.value;
          rejectedFrom ??= d.rejectedFrom;
        }
      }
      return { id: r.id, kind: 'committed' as const, values, rejectedFrom };
    })
    .sort((a, b) => String(a.values.code ?? '').localeCompare(String(b.values.code ?? '')));

  const pendingNew: GridRow[] = state.changeSets
    .filter((cs) => cs.status === 'pending')
    .flatMap((cs) => cs.newRows.map((nr) => ({ id: nr.id, kind: 'pending-new' as const, values: nr.values, changeSetId: cs.id })));

  const draftNew: GridRow[] = drafts.newRows.map((nr) => ({
    id: nr.id, kind: 'draft-new' as const, values: nr.values, rejectedFrom: nr.rejectedFrom,
  }));

  return [...committed, ...pendingNew, ...draftNew];
}

export interface GridContext {
  state: AppState;
  user: User;
  pending: Map<string, string>;
  recentApproved: Set<string>;
}

export function buildContext(state: AppState, user: User, now: number = Date.now()): GridContext {
  const recentApproved = new Set<string>();
  const seen = new Set<string>();
  for (let i = state.history.length - 1; i >= 0; i--) {
    const h = state.history[i];
    const k = cellKey(h.rowId, h.colKey);
    if (seen.has(k)) continue;
    seen.add(k);
    if (h.kind === 'approved' && now - Date.parse(h.at) < 24 * 3600 * 1000) recentApproved.add(k);
  }
  return { state, user, pending: pendingIndex(state), recentApproved };
}

export function cellView(ctx: GridContext, row: GridRow, col: ColumnDef): CellView {
  const { state, user } = ctx;
  const value = row.values[col.key] ?? null;
  const masked = !canRead(col, user.role);
  const lock = lockReason(state, user, row.id, row.kind, col, ctx.pending);
  const k = cellKey(row.id, col.key);
  let status: CellStatus = 'clean';
  let changeSetId: string | undefined;
  let error: string | null = null;

  if (row.kind === 'draft-new') {
    status = row.rejectedFrom ? 'rejected' : 'new';
    changeSetId = row.rejectedFrom;
    if (!lock) error = validateValue(col, value);
  } else if (row.kind === 'pending-new') {
    status = 'pending';
    changeSetId = row.changeSetId;
  } else {
    const d = userDrafts(state, user.id).cells[k];
    if (d) {
      status = d.rejectedFrom ? 'rejected' : 'draft';
      changeSetId = d.rejectedFrom;
      error = validateValue(col, d.value);
    } else if (ctx.pending.has(k)) {
      status = 'pending';
      changeSetId = ctx.pending.get(k);
    } else if (ctx.recentApproved.has(k)) {
      status = 'approved';
    }
  }

  return {
    value,
    text: masked ? (value === null ? '' : MASK) : formatValue(col, value),
    masked,
    status,
    lock,
    error: masked ? null : error,
    changeSetId,
  };
}
