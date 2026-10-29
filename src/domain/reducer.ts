import { canAddRow, canApprove, canManageColumns, canManageRowAccess, currentUser, lockReason, pendingIndex } from './permissions.ts';
import { canSeeRow } from './rowAccess.ts';
import { PAYMENT_TERMS } from './columns.ts';
import type {
  AppState, CellChange, CellValue, ChangeSet, ColumnDef, HistoryEntry, NewRow, Role, RowAccessRule, UserDrafts,
} from './types.ts';
import { cellKey, splitCellKey } from './types.ts';
import { sameValue, validateValue } from './validation.ts';

export interface CellEdit {
  rowId: string;
  colKey: string;
  value: CellValue;
  /** 指定するとセルコメントも設定する（空文字で削除） */
  comment?: string;
}

export type Action =
  | { type: 'SET_USER'; userId: string }
  | { type: 'EDIT_CELLS'; edits: CellEdit[] }
  | { type: 'ADD_ROW' }
  | { type: 'SET_CELL_COMMENT'; rowId: string; colKey: string; comment: string }
  | { type: 'REMOVE_NEW_ROW'; rowId: string }
  | { type: 'DISCARD_DRAFTS'; keys?: string[] }
  | { type: 'SUBMIT'; title: string; comment: string; at: string }
  | { type: 'APPROVE'; changeSetId: string; comment: string; at: string }
  | { type: 'REJECT'; changeSetId: string; comment: string; at: string }
  | { type: 'WITHDRAW'; changeSetId: string; at: string }
  | { type: 'UPDATE_COLUMN'; key: string; patch: Partial<Pick<ColumnDef, 'label' | 'readRoles' | 'editRoles' | 'required' | 'approvalRequired' | 'sensitive'>> }
  | { type: 'ADD_ROW_ACCESS' }
  | { type: 'UPDATE_ROW_ACCESS'; id: string; patch: Partial<Pick<RowAccessRule, 'label' | 'conditions' | 'roles'>> }
  | { type: 'REMOVE_ROW_ACCESS'; id: string }
  | { type: 'DISMISS_NOTICE' }
  | { type: 'RESET'; state: AppState };

const emptyDrafts = (): UserDrafts => ({ cells: {}, newRows: [] });

/** 入力途中の空白は残し、空のコメントは持たない */
const normComment = (c: string | undefined): string | undefined => (c && c.trim() ? c : undefined);

function setRowComment(nr: NewRow, colKey: string, comment: string): NewRow {
  const comments = { ...nr.comments };
  const c = normComment(comment);
  if (c) comments[colKey] = c;
  else delete comments[colKey];
  return { ...nr, comments };
}

function withDrafts(state: AppState, userId: string, fn: (d: UserDrafts) => UserDrafts): AppState {
  const cur = state.drafts[userId] ?? emptyDrafts();
  return { ...state, drafts: { ...state.drafts, [userId]: fn(cur) } };
}

const err = (state: AppState, text: string, details?: string[]): AppState => ({ ...state, notice: { kind: 'error', text, details } });
const info = (state: AppState, text: string): AppState => ({ ...state, notice: { kind: 'info', text } });

/** 下書き（変更セル＋新規行）の検証。エラーメッセージの配列を返す */
export function validateDrafts(state: AppState, userId: string): string[] {
  const d = state.drafts[userId] ?? emptyDrafts();
  const user = state.users.find((u) => u.id === userId);
  const errors: string[] = [];
  const rowName = (rowId: string, values?: Record<string, CellValue>) => {
    const v = values ?? state.rows.find((r) => r.id === rowId)?.values;
    return v ? `${v.code ?? '（コード未入力）'} ${v.name ?? ''}`.trim() : rowId;
  };
  for (const [k, cell] of Object.entries(d.cells)) {
    const { rowId, colKey } = splitCellKey(k);
    const col = state.columns.find((c) => c.key === colKey);
    if (!col) continue;
    const e = validateValue(col, cell.value);
    if (e) errors.push(`${rowName(rowId)}：${e}`);
  }
  const codes = new Set(state.rows.map((r) => r.values.code));
  for (const cs of state.changeSets) if (cs.status === 'pending') for (const nr of cs.newRows) codes.add(nr.values.code);
  const seenNew = new Set<CellValue>();
  for (const nr of d.newRows) {
    for (const col of state.columns) {
      if (user && !col.editRoles.includes(user.role)) continue;
      const e = validateValue(col, nr.values[col.key] ?? null);
      if (e) errors.push(`新規行 ${rowName(nr.id, nr.values)}：${e}`);
    }
    const code = nr.values.code;
    if (code !== null && code !== undefined && code !== '') {
      if (codes.has(code) || seenNew.has(code)) errors.push(`新規行 ${rowName(nr.id, nr.values)}：取引先コード ${code} は既に使われています`);
      seenNew.add(code);
    }
  }
  return errors;
}

function returnToDrafts(state: AppState, cs: ChangeSet, rejected: boolean): AppState {
  return withDrafts(state, cs.requesterId, (d) => {
    const cells = { ...d.cells };
    for (const ch of cs.changes) {
      const k = cellKey(ch.rowId, ch.colKey);
      if (cells[k]) continue;
      const cur = state.rows.find((r) => r.id === ch.rowId)?.values[ch.colKey] ?? null;
      cells[k] = { value: ch.after, base: cur, rejectedFrom: rejected ? cs.id : undefined, comment: ch.comment };
    }
    const newRows = [...d.newRows, ...cs.newRows.map((nr) => ({ ...nr, rejectedFrom: rejected ? cs.id : undefined }))];
    return { cells, newRows };
  });
}

function nextId(state: AppState, prefix: string): [string, AppState] {
  return [`${prefix}-${String(state.seq).padStart(4, '0')}`, { ...state, seq: state.seq + 1 }];
}

export function reducer(state: AppState, action: Action): AppState {
  const user = currentUser(state);
  switch (action.type) {
    case 'SET_USER':
      return state.users.some((u) => u.id === action.userId)
        ? { ...state, currentUserId: action.userId, notice: undefined }
        : state;

    case 'DISMISS_NOTICE':
      return { ...state, notice: undefined };

    case 'RESET':
      return action.state;

    case 'EDIT_CELLS': {
      const pending = pendingIndex(state);
      const drafts = state.drafts[user.id] ?? emptyDrafts();
      const cells = { ...drafts.cells };
      let newRows = drafts.newRows.map((r) => ({ ...r, values: { ...r.values } }));
      let applied = 0;
      let skipped = 0;
      for (const e of action.edits) {
        const col = state.columns.find((c) => c.key === e.colKey);
        if (!col) { skipped++; continue; }
        const nr = newRows.find((r) => r.id === e.rowId);
        if (nr) {
          if (lockReason(state, user, e.rowId, 'draft-new', col, pending)) { skipped++; continue; }
          nr.values[col.key] = e.value;
          if (e.comment !== undefined) newRows = newRows.map((r) => r.id === nr.id ? setRowComment(r, col.key, e.comment!) : r);
          applied++;
          continue;
        }
        const row = state.rows.find((r) => r.id === e.rowId);
        if (!row || !canSeeRow(state, user.role, row.id) || lockReason(state, user, row.id, 'committed', col, pending)) { skipped++; continue; }
        const k = cellKey(row.id, col.key);
        const base = row.values[col.key] ?? null;
        if (sameValue(e.value, base)) delete cells[k];
        else {
          const comment = e.comment !== undefined ? normComment(e.comment) : cells[k]?.comment;
          cells[k] = { value: e.value, base: cells[k]?.base ?? base, rejectedFrom: cells[k]?.rejectedFrom, comment };
        }
        applied++;
      }
      let next: AppState = { ...state, drafts: { ...state.drafts, [user.id]: { cells, newRows } } };
      if (skipped > 0) {
        next = info(next, applied > 0
          ? `${applied}セルを変更しました。権限・ロック・承認待ちのため${skipped}セルはスキップしました`
          : `権限・ロック・承認待ちのため変更できるセルがありませんでした`);
      } else if (state.notice?.kind === 'info') {
        next = { ...next, notice: undefined };
      }
      return next;
    }

    case 'ADD_ROW': {
      if (!canAddRow(state, user.role)) return err(state, '取引先を追加する権限がありません');
      const [id, s] = nextId(state, 'new');
      const values: Record<string, CellValue> = {};
      for (const c of state.columns) values[c.key] = null;
      values.category = '仕入先';
      values.paymentTerms = PAYMENT_TERMS[0];
      values.status = '取引中';
      return withDrafts({ ...s, notice: undefined }, user.id, (d) => ({ ...d, newRows: [...d.newRows, { id, values }] }));
    }

    case 'SET_CELL_COMMENT': {
      const col = state.columns.find((c) => c.key === action.colKey);
      if (!col) return state;
      const drafts = state.drafts[user.id] ?? emptyDrafts();
      const nr = drafts.newRows.find((r) => r.id === action.rowId);
      if (nr) {
        if (lockReason(state, user, nr.id, 'draft-new', col)) return err(state, 'このセルにはコメントを付けられません');
        return withDrafts(state, user.id, (d) => ({ ...d, newRows: d.newRows.map((r) => r.id === nr.id ? setRowComment(r, col.key, action.comment) : r) }));
      }
      const k = cellKey(action.rowId, action.colKey);
      const cell = drafts.cells[k];
      if (!cell) return err(state, 'コメントは値を変更したセルに付けられます');
      return withDrafts(state, user.id, (d) => ({ ...d, cells: { ...d.cells, [k]: { ...cell, comment: normComment(action.comment) } } }));
    }

    case 'REMOVE_NEW_ROW':
      return withDrafts(state, user.id, (d) => ({ ...d, newRows: d.newRows.filter((r) => r.id !== action.rowId) }));

    case 'DISCARD_DRAFTS': {
      if (!action.keys) return { ...withDrafts(state, user.id, () => emptyDrafts()), notice: undefined };
      const keys = new Set(action.keys);
      return withDrafts(state, user.id, (d) => ({
        cells: Object.fromEntries(Object.entries(d.cells).filter(([k]) => !keys.has(k))),
        newRows: d.newRows,
      }));
    }

    case 'SUBMIT': {
      const d = state.drafts[user.id] ?? emptyDrafts();
      const count = Object.keys(d.cells).length + d.newRows.length;
      if (count === 0) return err(state, '申請する変更がありません');
      const errors = validateDrafts(state, user.id);
      if (errors.length) return err(state, `入力エラーが${errors.length}件あります。修正してから申請してください`, errors);

      const direct: CellChange[] = [];
      const wf: CellChange[] = [];
      for (const [k, cell] of Object.entries(d.cells)) {
        const { rowId, colKey } = splitCellKey(k);
        const col = state.columns.find((c) => c.key === colKey);
        const row = state.rows.find((r) => r.id === rowId);
        if (!col || !row) continue;
        const ch: CellChange = { rowId, colKey, before: row.values[colKey] ?? null, after: cell.value };
        const comment = cell.comment?.trim();
        if (comment) ch.comment = comment;
        (col.approvalRequired ? wf : direct).push(ch);
      }

      let s: AppState = state;
      const newHistory: HistoryEntry[] = [];
      if (direct.length) {
        const byRow = new Map<string, CellChange[]>();
        for (const ch of direct) byRow.set(ch.rowId, [...(byRow.get(ch.rowId) ?? []), ch]);
        s = {
          ...s,
          rows: s.rows.map((r) => {
            const chs = byRow.get(r.id);
            if (!chs) return r;
            const values = { ...r.values };
            for (const ch of chs) values[ch.colKey] = ch.after;
            return { ...r, values, updatedAt: action.at };
          }),
        };
        for (const ch of direct) newHistory.push({ ...ch, at: action.at, by: user.id, kind: 'direct' });
      }

      let csId: string | undefined;
      if (wf.length || d.newRows.length) {
        const [id, s2] = nextId(s, 'CS');
        csId = id;
        const cs: ChangeSet = {
          id,
          title: action.title.trim() || `取引先マスタ変更（${wf.length + d.newRows.length}件）`,
          comment: action.comment.trim(),
          requesterId: user.id,
          createdAt: action.at,
          status: 'pending',
          changes: wf,
          newRows: d.newRows.map(({ rejectedFrom: _r, comments, ...nr }) => {
            const trimmed = Object.entries(comments ?? {}).map(([k, c]) => [k, c.trim()] as const).filter(([, c]) => c);
            return trimmed.length ? { ...nr, comments: Object.fromEntries(trimmed) } : nr;
          }),
        };
        s = { ...s2, changeSets: [...s2.changeSets, cs] };
      }

      s = { ...s, history: [...s.history, ...newHistory], drafts: { ...s.drafts, [user.id]: emptyDrafts() } };
      const parts: string[] = [];
      if (csId) parts.push(`変更セット ${csId} を申請しました`);
      if (direct.length) parts.push(`承認不要の${direct.length}セルを反映しました`);
      return info(s, parts.join('。'));
    }

    case 'APPROVE': {
      const cs = state.changeSets.find((c) => c.id === action.changeSetId);
      if (!cs || cs.status !== 'pending') return err(state, 'この変更セットは承認待ちではありません');
      if (!canApprove(user.role)) return err(state, '承認する権限がありません');
      if (cs.requesterId === user.id) return err(state, '自分が申請した変更セットは承認できません');
      const conflicts = cs.changes.filter((ch) => {
        const cur = state.rows.find((r) => r.id === ch.rowId)?.values[ch.colKey] ?? null;
        return !sameValue(cur, ch.before);
      });
      if (conflicts.length) {
        return err(state, `申請後に${conflicts.length}セルの値が変わっているため承認できません。差戻してください`);
      }
      const existing = new Set(state.rows.map((r) => r.values.code));
      const dup = cs.newRows.find((nr) => existing.has(nr.values.code));
      if (dup) return err(state, `取引先コード ${dup.values.code} は既に登録されています。差戻してください`);

      const byRow = new Map<string, CellChange[]>();
      for (const ch of cs.changes) byRow.set(ch.rowId, [...(byRow.get(ch.rowId) ?? []), ch]);
      const rows = state.rows.map((r) => {
        const chs = byRow.get(r.id);
        if (!chs) return r;
        const values = { ...r.values };
        for (const ch of chs) values[ch.colKey] = ch.after;
        return { ...r, values, updatedAt: action.at };
      });
      const hist: HistoryEntry[] = cs.changes.map((ch) => ({
        ...ch, at: action.at, by: cs.requesterId, changeSetId: cs.id, kind: 'approved',
      }));
      let s: AppState = state;
      for (const nr of cs.newRows) {
        const [rid, s2] = nextId(s, 'r');
        s = s2;
        rows.push({ id: rid, values: { ...nr.values }, createdAt: action.at, updatedAt: action.at });
        hist.push({ rowId: rid, colKey: 'code', before: null, after: nr.values.code ?? null, at: action.at, by: cs.requesterId, changeSetId: cs.id, kind: 'created', comment: nr.comments?.code });
        // 新規行のコード以外のセルコメントも、各セルの履歴で確認できるよう残す
        for (const [colKey, comment] of Object.entries(nr.comments ?? {})) {
          if (colKey === 'code') continue;
          hist.push({ rowId: rid, colKey, before: null, after: nr.values[colKey] ?? null, at: action.at, by: cs.requesterId, changeSetId: cs.id, kind: 'created', comment });
        }
      }
      const changeSets = s.changeSets.map((c) => c.id === cs.id
        ? { ...c, status: 'approved' as const, decidedBy: user.id, decidedAt: action.at, decisionComment: action.comment.trim() }
        : c);
      return info({ ...s, rows, changeSets, history: [...s.history, ...hist] }, `${cs.id} を承認しました`);
    }

    case 'REJECT': {
      const cs = state.changeSets.find((c) => c.id === action.changeSetId);
      if (!cs || cs.status !== 'pending') return err(state, 'この変更セットは承認待ちではありません');
      if (!canApprove(user.role)) return err(state, '差戻す権限がありません');
      if (!action.comment.trim()) return err(state, '差戻し理由を入力してください');
      const s: AppState = {
        ...state,
        changeSets: state.changeSets.map((c) => c.id === cs.id
          ? { ...c, status: 'rejected' as const, decidedBy: user.id, decidedAt: action.at, decisionComment: action.comment.trim() }
          : c),
      };
      return info(returnToDrafts(s, cs, true), `${cs.id} を差戻しました`);
    }

    case 'WITHDRAW': {
      const cs = state.changeSets.find((c) => c.id === action.changeSetId);
      if (!cs || cs.status !== 'pending') return err(state, 'この変更セットは承認待ちではありません');
      if (cs.requesterId !== user.id) return err(state, '取り下げできるのは申請者本人のみです');
      const s: AppState = {
        ...state,
        changeSets: state.changeSets.map((c) => c.id === cs.id ? { ...c, status: 'withdrawn' as const, decidedAt: action.at } : c),
      };
      return info(returnToDrafts(s, cs, false), `${cs.id} を取り下げ、下書きに戻しました`);
    }

    case 'UPDATE_COLUMN': {
      if (!canManageColumns(user.role)) return err(state, '項目設定を変更する権限がありません');
      const columns = state.columns.map((c) => {
        if (c.key !== action.key) return c;
        const n: ColumnDef = { ...c, ...action.patch };
        // 編集権限は閲覧権限を前提とする
        if (action.patch.editRoles) n.readRoles = uniq([...n.readRoles, ...action.patch.editRoles]);
        if (action.patch.readRoles) n.editRoles = n.editRoles.filter((r) => n.readRoles.includes(r));
        return n;
      });
      return { ...state, columns };
    }

    case 'ADD_ROW_ACCESS': {
      if (!canManageRowAccess(user.role)) return err(state, '閲覧範囲を変更する権限がありません');
      const [id, s] = nextId(state, 'ra');
      return { ...s, rowAccess: [...s.rowAccess, { id, label: '新しい閲覧範囲', conditions: [], roles: [] }] };
    }

    case 'UPDATE_ROW_ACCESS': {
      if (!canManageRowAccess(user.role)) return err(state, '閲覧範囲を変更する権限がありません');
      return { ...state, rowAccess: state.rowAccess.map((r) => r.id === action.id ? { ...r, ...action.patch } : r) };
    }

    case 'REMOVE_ROW_ACCESS': {
      if (!canManageRowAccess(user.role)) return err(state, '閲覧範囲を変更する権限がありません');
      return { ...state, rowAccess: state.rowAccess.filter((r) => r.id !== action.id) };
    }
  }
}

const uniq = (xs: Role[]): Role[] => [...new Set(xs)];

export function draftCount(state: AppState, userId: string): number {
  const d = state.drafts[userId];
  return d ? Object.keys(d.cells).length + d.newRows.length : 0;
}

export function newRowById(state: AppState, userId: string, rowId: string): NewRow | undefined {
  return state.drafts[userId]?.newRows.find((r) => r.id === rowId);
}
