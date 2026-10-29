import type { ColumnDef, Role, User } from './types.ts';

const EVERYONE: Role[] = ['requester', 'accounting', 'approver', 'admin'];
const FINANCE_READ: Role[] = ['accounting', 'approver', 'admin'];

export const DEFAULT_USERS: User[] = [
  { id: 'u-tanaka', name: '田中 美咲', role: 'requester' },
  { id: 'u-sato', name: '佐藤 健', role: 'accounting' },
  { id: 'u-suzuki', name: '鈴木 部長', role: 'approver' },
  { id: 'u-takahashi', name: '高橋 管理者', role: 'admin' },
];

export const PAYMENT_TERMS = [
  '月末締め翌月末払い',
  '20日締め翌月10日払い',
  '月末締め翌々月10日払い',
  '都度払い',
];

export const DEFAULT_COLUMNS: ColumnDef[] = [
  {
    key: 'code', label: '取引先コード', type: 'text', width: 116, frozen: true,
    required: true, immutable: true, pattern: '^[A-Z]\\d{5}$', patternMessage: '英大文字1桁＋数字5桁（例: V00031）',
    readRoles: EVERYONE, editRoles: ['requester', 'admin'], approvalRequired: true,
    description: '取引先を一意に識別するキー。登録後は変更できません。',
  },
  {
    key: 'name', label: '取引先名', type: 'text', width: 220, frozen: true,
    required: true, maxLength: 60,
    readRoles: EVERYONE, editRoles: ['requester', 'admin'], approvalRequired: true,
  },
  {
    key: 'kana', label: '取引先名カナ', type: 'text', width: 200,
    maxLength: 60, pattern: '^[ァ-ヶー\\u3000 ・（）()]*$', patternMessage: '全角カタカナで入力してください',
    readRoles: EVERYONE, editRoles: ['requester', 'admin'], approvalRequired: true,
  },
  {
    key: 'category', label: '取引先区分', type: 'select', width: 132,
    options: ['仕入先', '得意先', '仕入先・得意先'], required: true,
    readRoles: EVERYONE, editRoles: ['requester', 'admin'], approvalRequired: true,
  },
  {
    key: 'corpNo', label: '法人番号', type: 'text', width: 140,
    pattern: '^\\d{13}$', patternMessage: '数字13桁',
    readRoles: EVERYONE, editRoles: ['requester', 'admin'], approvalRequired: true,
  },
  {
    key: 'invoiceNo', label: '適格請求書発行事業者番号', type: 'text', width: 168,
    pattern: '^T\\d{13}$', patternMessage: 'T＋数字13桁',
    readRoles: EVERYONE, editRoles: ['accounting', 'admin'], approvalRequired: true,
    description: 'インボイス制度の登録番号。経理担当が管理します。',
  },
  {
    key: 'zip', label: '郵便番号', type: 'text', width: 96,
    pattern: '^\\d{3}-\\d{4}$', patternMessage: '999-9999 形式',
    readRoles: EVERYONE, editRoles: ['requester', 'admin'], approvalRequired: true,
  },
  {
    key: 'address', label: '所在地', type: 'text', width: 260, maxLength: 120,
    readRoles: EVERYONE, editRoles: ['requester', 'admin'], approvalRequired: true,
  },
  {
    key: 'tel', label: '電話番号', type: 'text', width: 128,
    pattern: '^[0-9-]{10,13}$', patternMessage: '数字とハイフン',
    readRoles: EVERYONE, editRoles: ['requester', 'admin'], approvalRequired: true,
  },
  {
    key: 'paymentTerms', label: '支払条件', type: 'select', width: 176,
    options: PAYMENT_TERMS, required: true,
    readRoles: EVERYONE, editRoles: ['accounting', 'admin'], approvalRequired: true,
  },
  {
    key: 'bank', label: '振込先口座', type: 'text', width: 220, sensitive: true, maxLength: 60,
    readRoles: FINANCE_READ, editRoles: ['accounting', 'admin'], approvalRequired: true,
    description: '機密項目。経理・承認者・管理者のみ閲覧できます。',
  },
  {
    key: 'creditLimit', label: '与信限度額（円）', type: 'number', width: 140, sensitive: true, min: 0,
    readRoles: FINANCE_READ, editRoles: ['accounting', 'admin'], approvalRequired: true,
    description: '機密項目。経理・承認者・管理者のみ閲覧できます。',
  },
  {
    key: 'status', label: '取引状態', type: 'select', width: 104,
    options: ['取引中', '取引停止'], required: true,
    readRoles: EVERYONE, editRoles: ['requester', 'accounting', 'admin'], approvalRequired: true,
  },
  {
    key: 'note', label: '社内メモ', type: 'text', width: 220, maxLength: 200,
    readRoles: EVERYONE, editRoles: ['requester', 'accounting', 'admin'], approvalRequired: false,
    description: '承認不要。申請時にそのまま反映されます。',
  },
];
