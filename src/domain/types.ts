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
  /** 閲覧できるロール。含まれないロールには項目（列）自体を表示しない */
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
  /** セルコメント：申請者が記載する変更の意図。承認者も確認する */
  comment?: string;
}

export interface NewRow {
  id: string;
  values: Record<string, CellValue>;
  rejectedFrom?: string;
  /** セルコメント（key = colKey） */
  comments?: Record<string, string>;
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
  comment?: string;
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
  comment?: string;
}

/** 閲覧範囲の条件。確定値で判定する（新規行は入力値） */
export interface AccessCondition {
  colKey: string;
  op: 'in' | 'notIn' | 'empty' | 'notEmpty';
  /** in / notIn で比較する値 */
  values: string[];
}

/**
 * 閲覧範囲：マスタ管理者が定義する行の絞り込み条件（クエリ）と、それを閲覧できるロールの紐づけ。
 * 利用者は、自分のロールに紐づくいずれかの閲覧範囲に該当する行だけを閲覧・編集できる。
 */
export interface RowAccessRule {
  id: string;
  label: string;
  /** すべてを満たす行が対象（空なら全行） */
  conditions: AccessCondition[];
  roles: Role[];
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
  rowAccess: RowAccessRule[];
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
