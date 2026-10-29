/** 利用者ロール */
export type Role = 'requester' | 'accounting' | 'approver' | 'admin';

export interface User {
  id: string;
  name: string;
  role: Role;
}

export type ColumnType = 'text' | 'number' | 'select';

export type CellValue = string | number | null;

/**
 * カラム（項目）定義。業務上のプロパティをカラムというオブジェクトに付与する。
 */
export interface ColumnDef {
  key: string;
  label: string;
  type: ColumnType;
  width: number;
  options?: string[];
  required?: boolean;
  maxLength?: number;
  min?: number;
  pattern?: string;
  patternMessage?: string;
  /** 閲覧できるロール。含まれないロールにはマスク表示 */
  readRoles: Role[];
  /** 編集できるロール（閲覧権限が前提） */
  editRoles: Role[];
  /** true: 変更は承認ワークフローを通す / false: 申請時に即時反映 */
  approvalRequired: boolean;
  /** true: 登録後は変更不可（新規行でのみ入力可） */
  immutable?: boolean;
  /** 機密項目（コピー・履歴でもマスク） */
  sensitive?: boolean;
  /** 横スクロールしても固定表示 */
  frozen?: boolean;
  description?: string;
}

export interface MasterRow {
  id: string;
  values: Record<string, CellValue>;
  createdAt: string;
  updatedAt: string;
}

/** 未申請の変更（下書き）。base は編集開始時点の確定値 */
export interface DraftCell {
  value: CellValue;
  base: CellValue;
  rejectedFrom?: string;
}

export interface NewRow {
  id: string;
  values: Record<string, CellValue>;
  rejectedFrom?: string;
}

export interface UserDrafts {
  /** key = cellKey(rowId, colKey) */
  cells: Record<string, DraftCell>;
  newRows: NewRow[];
}

export type ChangeSetStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface CellChange {
  rowId: string;
  colKey: string;
  before: CellValue;
  after: CellValue;
}

/** 変更セット：まとめて申請・承認される単位 */
export interface ChangeSet {
  id: string;
  title: string;
  comment: string;
  requesterId: string;
  createdAt: string;
  status: ChangeSetStatus;
  changes: CellChange[];
  newRows: NewRow[];
  decidedBy?: string;
  decidedAt?: string;
  decisionComment?: string;
}

export interface HistoryEntry {
  at: string;
  by: string;
  rowId: string;
  colKey: string;
  before: CellValue;
  after: CellValue;
  changeSetId?: string;
  kind: 'approved' | 'direct' | 'created';
}

export interface Notice {
  kind: 'error' | 'info';
  text: string;
  details?: string[];
}

export interface AppState {
  schema: 1;
  users: User[];
  currentUserId: string;
  columns: ColumnDef[];
  rows: MasterRow[];
  drafts: Record<string, UserDrafts>;
  changeSets: ChangeSet[];
  history: HistoryEntry[];
  seq: number;
  notice?: Notice;
}

export const ROLE_LABEL: Record<Role, string> = {
  requester: '営業担当',
  accounting: '経理担当',
  approver: '承認者',
  admin: 'マスタ管理者',
};

export const ALL_ROLES: Role[] = ['requester', 'accounting', 'approver', 'admin'];

export const cellKey = (rowId: string, colKey: string): string => `${rowId}\t${colKey}`;

export const splitCellKey = (key: string): { rowId: string; colKey: string } => {
  const i = key.indexOf('\t');
  return { rowId: key.slice(0, i), colKey: key.slice(i + 1) };
};
