import type { AppState, ColumnDef, Role, User } from './types.ts';
import { cellKey } from './types.ts';

export const canRead = (col: ColumnDef, role: Role): boolean => col.readRoles.includes(role);

export const canEditColumn = (col: ColumnDef, role: Role): boolean =>
  canRead(col, role) && col.editRoles.includes(role);

export const canApprove = (role: Role): boolean => role === 'approver' || role === 'admin';

export const canManageColumns = (role: Role): boolean => role === 'admin';

/** 新規行を追加できるのは、取引先コードを入力できるロール */
export const canAddRow = (state: AppState, role: Role): boolean => {
  const code = state.columns.find((c) => c.key === 'code');
  return !!code && canEditColumn(code, role);
};

export function currentUser(state: AppState): User {
  return state.users.find((u) => u.id === state.currentUserId) ?? state.users[0];
}

/** 承認待ちの変更セットに含まれるセル → 変更セットID */
export function pendingIndex(state: AppState): Map<string, string> {
  const m = new Map<string, string>();
  for (const cs of state.changeSets) {
    if (cs.status !== 'pending') continue;
    for (const ch of cs.changes) m.set(cellKey(ch.rowId, ch.colKey), cs.id);
  }
  return m;
}

export type LockReason = 'no-read' | 'no-edit' | 'immutable' | 'pending' | null;

/**
 * セルを編集できない理由（null なら編集可）。
 * rowKind: committed=確定済み行 / draft-new=自分の新規行 / pending-new=申請中の新規行
 */
export function lockReason(
  state: AppState,
  user: User,
  rowId: string,
  rowKind: 'committed' | 'draft-new' | 'pending-new',
  col: ColumnDef,
  pending: Map<string, string> = pendingIndex(state),
): LockReason {
  if (!canRead(col, user.role)) return 'no-read';
  if (!canEditColumn(col, user.role)) return 'no-edit';
  if (rowKind === 'pending-new') return 'pending';
  if (rowKind === 'committed') {
    if (col.immutable) return 'immutable';
    if (pending.has(cellKey(rowId, col.key))) return 'pending';
  }
  return null;
}

export const LOCK_LABEL: Record<Exclude<LockReason, null>, string> = {
  'no-read': '閲覧権限がありません',
  'no-edit': '編集権限がありません',
  immutable: '登録後は変更できない項目です',
  pending: '承認待ちのため編集できません',
};
