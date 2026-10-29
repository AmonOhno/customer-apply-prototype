import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reducer, draftCount, type Action } from './reducer.ts';
import { createInitialState } from './seed.ts';
import { buildGridRows } from './grid.ts';
import { currentUser } from './permissions.ts';
import type { AppState } from './types.ts';

const AT = '2026-10-29T10:00:00.000Z';
const run = (s: AppState, ...actions: Action[]) => actions.reduce(reducer, s);
const as = (userId: string): Action => ({ type: 'SET_USER', userId });
const TANAKA = 'u-tanaka', SATO = 'u-sato', ADMIN = 'u-takahashi';
const visible = (s: AppState) => buildGridRows(s, currentUser(s)).map((r) => r.id);
const stopped = (s: AppState) => s.rows.filter((r) => r.values.status === '取引停止');

test('既定の閲覧範囲: 営業担当は取引中のみ、経理担当はすべての取引先を閲覧できる', () => {
  const s = createInitialState(AT);
  const ids = visible(s);
  assert.ok(stopped(s).length > 0);
  for (const r of stopped(s)) assert.ok(!ids.includes(r.id));
  assert.equal(ids.length, s.rows.length - stopped(s).length);
  assert.equal(visible(run(s, as(SATO))).length, s.rows.length);
});

test('閲覧範囲外の行は編集できない', () => {
  const s0 = createInitialState(AT);
  const hidden = stopped(s0)[0];
  const s = run(s0, { type: 'EDIT_CELLS', edits: [{ rowId: hidden.id, colKey: 'note', value: 'x' }] });
  assert.equal(draftCount(s, TANAKA), 0);
});

test('閲覧範囲は確定値で判定し、下書きで条件から外れても行は消えない', () => {
  const s0 = createInitialState(AT);
  const r = s0.rows[0];
  const s = run(s0, { type: 'EDIT_CELLS', edits: [{ rowId: r.id, colKey: 'status', value: '取引停止' }] });
  assert.equal(draftCount(s, TANAKA), 1);
  assert.ok(visible(s).includes(r.id));
});

test('管理者が閲覧範囲を追加・変更・削除でき、ロールの表示行に反映される', () => {
  let s = run(createInitialState(AT), as(ADMIN), { type: 'ADD_ROW_ACCESS' });
  const added = s.rowAccess.at(-1)!;
  s = run(s, { type: 'UPDATE_ROW_ACCESS', id: added.id, patch: {
    label: '停止中の取引先',
    roles: ['requester'],
    conditions: [{ colKey: 'status', op: 'in', values: ['取引停止'] }],
  } });
  assert.equal(visible(run(s, as(TANAKA))).length, s.rows.length);

  // 営業担当の閲覧範囲を「得意先」に限定する
  s = run(s,
    { type: 'REMOVE_ROW_ACCESS', id: added.id },
    { type: 'UPDATE_ROW_ACCESS', id: 'ra-active', patch: { conditions: [{ colKey: 'category', op: 'notIn', values: ['仕入先'] }] } },
  );
  const ids = visible(run(s, as(TANAKA)));
  assert.deepEqual(ids, s.rows.filter((r) => r.values.category !== '仕入先').map((r) => r.id).sort((a, b) => {
    const code = (id: string) => String(s.rows.find((x) => x.id === id)!.values.code);
    return code(a).localeCompare(code(b));
  }));
});

test('紐づく閲覧範囲がないロールは1行も閲覧できない。管理者以外は変更できない', () => {
  let s = run(createInitialState(AT), as(ADMIN), { type: 'UPDATE_ROW_ACCESS', id: 'ra-active', patch: { roles: [] } });
  assert.equal(visible(run(s, as(TANAKA))).length, 0);
  s = run(s, as(SATO), { type: 'REMOVE_ROW_ACCESS', id: 'ra-all' });
  assert.equal(s.notice?.kind, 'error');
  assert.ok(s.rowAccess.some((r) => r.id === 'ra-all'));
});

test('自分の新規行・自分が申請中の新規行は閲覧範囲外でも表示する', () => {
  let s = run(createInitialState(AT), { type: 'ADD_ROW' });
  const id = s.drafts[TANAKA].newRows[0].id;
  s = run(s, { type: 'EDIT_CELLS', edits: [
    { rowId: id, colKey: 'code', value: 'V99991' },
    { rowId: id, colKey: 'name', value: '株式会社テスト' },
    { rowId: id, colKey: 'status', value: '取引停止' },
  ] });
  assert.ok(visible(s).includes(id));
  s = run(s, { type: 'SUBMIT', title: '', comment: '', at: AT });
  assert.equal(s.changeSets[0].status, 'pending');
  assert.ok(visible(s).includes(id));
  // 他の営業担当相当（同ロールの別ユーザー）には閲覧範囲で判定される
  const other = { ...s, users: [...s.users, { id: 'u-other', name: '他の営業', role: 'requester' as const }], currentUserId: 'u-other' };
  assert.ok(!visible(other).includes(id));
});
