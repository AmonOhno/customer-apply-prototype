import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reducer, type Action } from './reducer.ts';
import { createInitialState } from './seed.ts';
import { buildContext, buildGridRows } from './grid.ts';
import { applyQuery, queryById } from './queries.ts';
import { currentUser } from './permissions.ts';
import type { AppState } from './types.ts';

const AT = '2026-10-29T10:00:00.000Z';
const NOW = Date.parse(AT);
const run = (s: AppState, ...actions: Action[]) => actions.reduce(reducer, s);
const as = (userId: string): Action => ({ type: 'SET_USER', userId });
const query = (s: AppState, id: string) => {
  const user = currentUser(s);
  return applyQuery(buildContext(s, user, NOW), buildGridRows(s, user), queryById(id), NOW);
};
const keys = (r: ReturnType<typeof query>) => r.columns.map((c) => c.key);

test('すべて: 閲覧範囲内の全行と、閲覧権限のある全項目を表示する', () => {
  const s = createInitialState(AT);
  const r = query(s, 'all'); // 営業担当：取引中のみ、口座・与信は閲覧不可
  assert.equal(r.rows.length, s.rows.filter((x) => x.values.status === '取引中').length);
  assert.ok(!keys(r).includes('bank') && !keys(r).includes('creditLimit'));
  assert.equal(r.columns.length, s.columns.length - 2);
  const admin = query(run(s, as('u-takahashi')), 'all');
  assert.equal(admin.rows.length, s.rows.length);
  assert.equal(admin.columns.length, s.columns.length);
});

test('変更箇所のみ: 変更した行と項目だけ（固定列は常に表示）', () => {
  const s0 = createInitialState(AT);
  const [a, b] = s0.rows;
  const s = run(s0, { type: 'EDIT_CELLS', edits: [
    { rowId: a.id, colKey: 'address', value: '東京都港区1-1' },
    { rowId: b.id, colKey: 'tel', value: '03-0000-0000' },
  ] });
  const r = query(s, 'changed');
  assert.deepEqual(r.rows.map((x) => x.id).sort(), [a.id, b.id].sort());
  assert.deepEqual(keys(r), ['code', 'name', 'address', 'tel']);
});

test('変更箇所のみ: 新規行は入力済み・エラーの項目だけを表示し、承認待ちも含む', () => {
  let s = run(createInitialState(AT), { type: 'ADD_ROW' });
  const id = s.drafts['u-tanaka'].newRows[0].id;
  s = run(s, { type: 'EDIT_CELLS', edits: [{ rowId: id, colKey: 'kana', value: 'テスト' }] });
  let r = query(s, 'changed');
  assert.deepEqual(r.rows.map((x) => x.id), [id]);
  // 既定値の入る区分・支払条件・取引状態と、入力した項目。必須未入力のコード・名称はエラーで表示
  assert.deepEqual(keys(r), ['code', 'name', 'kana', 'category', 'paymentTerms', 'status']);

  const row = s.rows[0];
  s = run(s,
    { type: 'REMOVE_NEW_ROW', rowId: id },
    { type: 'EDIT_CELLS', edits: [{ rowId: row.id, colKey: 'zip', value: '100-0001' }] },
    { type: 'SUBMIT', title: '', comment: '', at: AT },
  );
  r = query(s, 'changed');
  assert.deepEqual(r.rows.map((x) => x.id), [row.id]);
  assert.deepEqual(keys(r), ['code', 'name', 'zip']);
  // 承認者にも申請中の項目として見える
  assert.deepEqual(keys(query(run(s, as('u-suzuki')), 'pending')), ['code', 'name', 'zip']);
});

test('直近1ヶ月に更新: 最終更新日時で絞り込み、新しい順に並べる', () => {
  const s = createInitialState(AT);
  const r = query(s, 'recent');
  const edge = new Date(AT);
  edge.setMonth(edge.getMonth() - 1);
  const expected = s.rows.filter((x) => Date.parse(x.updatedAt) >= edge.getTime());
  assert.ok(expected.length > 0 && expected.length < s.rows.length);
  assert.equal(r.rows.length, expected.length);
  const times = r.rows.map((x) => Date.parse(s.rows.find((y) => y.id === x.id)!.updatedAt));
  assert.deepEqual(times, [...times].sort((p, q) => q - p));
});

test('直近1ヶ月に更新: 承認で最終更新日時が更新されると該当する', () => {
  const s0 = createInitialState(AT);
  const old = query(s0, 'stale').rows[0];
  assert.ok(old);
  const s = run(s0,
    { type: 'EDIT_CELLS', edits: [{ rowId: old.id, colKey: 'tel', value: '03-1111-2222' }] },
    { type: 'SUBMIT', title: '', comment: '', at: AT },
    as('u-suzuki'),
    { type: 'APPROVE', changeSetId: 'CS-0001', comment: '', at: AT },
  );
  assert.ok(query(s, 'recent').rows.some((x) => x.id === old.id));
  assert.ok(!query(s, 'stale').rows.some((x) => x.id === old.id));
});

test('インボイス番号未登録: 確定値で判定し、下書き入力中も行は消えない', () => {
  const s0 = createInitialState(AT);
  const r0 = query(s0, 'invoice-missing');
  assert.ok(r0.rows.length > 0);
  for (const row of r0.rows) {
    assert.equal(row.values.invoiceNo, null);
    assert.equal(row.values.status, '取引中');
    assert.notEqual(row.values.category, '得意先');
  }
  const target = r0.rows[0];
  const s = run(s0, as('u-sato'), { type: 'EDIT_CELLS', edits: [{ rowId: target.id, colKey: 'invoiceNo', value: 'T1234567890123' }] });
  assert.ok(query(s, 'invoice-missing').rows.some((x) => x.id === target.id));
});

test('支払・与信項目: 指定項目のみ。閲覧権限のない項目は列として表示しない', () => {
  const s = createInitialState(AT);
  assert.deepEqual(keys(query(s, 'payment')), ['code', 'name', 'category', 'invoiceNo', 'paymentTerms', 'status']);
  assert.deepEqual(keys(query(run(s, as('u-sato')), 'payment')), ['code', 'name', 'category', 'invoiceNo', 'paymentTerms', 'bank', 'creditLimit', 'status']);
});

test('閲覧権限のない項目の条件には該当しない', () => {
  const s = createInitialState(AT);
  const user = currentUser(s); // 営業担当：与信限度額は閲覧不可
  const q = { id: 'x', label: '', description: '', rows: [{ kind: 'field' as const, colKey: 'creditLimit', op: 'empty' as const }], columns: { kind: 'all' as const } };
  const sNoLimit = { ...s, rows: s.rows.map((r) => ({ ...r, values: { ...r.values, creditLimit: null } })) };
  assert.equal(applyQuery(buildContext(sNoLimit, user, NOW), buildGridRows(sNoLimit, user), q, NOW).rows.length, 0);
});
