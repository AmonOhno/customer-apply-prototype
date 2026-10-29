import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reducer, draftCount, type Action } from './reducer.ts';
import { createInitialState } from './seed.ts';
import { buildContext, buildGridRows, cellView } from './grid.ts';
import type { AppState } from './types.ts';
import { cellKey } from './types.ts';

const AT = '2026-10-29T10:00:00.000Z';
const run = (s: AppState, ...actions: Action[]) => actions.reduce(reducer, s);
const as = (userId: string): Action => ({ type: 'SET_USER', userId });
const TANAKA = 'u-tanaka', SATO = 'u-sato', SUZUKI = 'u-suzuki', ADMIN = 'u-takahashi';

const base = () => createInitialState(AT);
const row1 = (s: AppState) => s.rows[0];

test('一括編集: 権限のあるセルだけが下書きになり、権限外はスキップされる', () => {
  const s0 = base();
  const [a, b] = s0.rows;
  const s = run(s0, {
    type: 'EDIT_CELLS',
    edits: [
      { rowId: a.id, colKey: 'address', value: '東京都港区1-1' },
      { rowId: b.id, colKey: 'address', value: '東京都港区1-1' },
      { rowId: a.id, colKey: 'creditLimit', value: 1 }, // 営業担当は閲覧不可
      { rowId: a.id, colKey: 'code', value: 'V99999' }, // 登録後変更不可
    ],
  });
  assert.equal(draftCount(s, TANAKA), 2);
  assert.equal(s.notice?.kind, 'info');
  assert.match(s.notice!.text, /2セル/);
});

test('元の値に戻すと下書きから消える', () => {
  const s0 = base();
  const r = row1(s0);
  const s = run(s0,
    { type: 'EDIT_CELLS', edits: [{ rowId: r.id, colKey: 'tel', value: '03-0000-0000' }] },
    { type: 'EDIT_CELLS', edits: [{ rowId: r.id, colKey: 'tel', value: r.values.tel }] },
  );
  assert.equal(draftCount(s, TANAKA), 0);
});

test('申請 → 承認で確定値に反映され、履歴が残る', () => {
  const s0 = base();
  const r = row1(s0);
  let s = run(s0,
    { type: 'EDIT_CELLS', edits: [{ rowId: r.id, colKey: 'address', value: '東京都港区芝公園4-2-8' }] },
    { type: 'SUBMIT', title: '移転', comment: '', at: AT },
  );
  assert.equal(s.changeSets.length, 1);
  assert.equal(s.changeSets[0].status, 'pending');
  assert.notEqual(row1(s).values.address, '東京都港区芝公園4-2-8');

  // 承認待ちセルはロックされる
  s = run(s, { type: 'EDIT_CELLS', edits: [{ rowId: r.id, colKey: 'address', value: 'x' }] });
  assert.equal(draftCount(s, TANAKA), 0);

  s = run(s, as(SUZUKI), { type: 'APPROVE', changeSetId: s.changeSets[0].id, comment: 'OK', at: AT });
  assert.equal(s.changeSets[0].status, 'approved');
  assert.equal(row1(s).values.address, '東京都港区芝公園4-2-8');
  assert.equal(s.history.at(-1)?.kind, 'approved');
});

test('申請者本人は承認できない（職務分掌）', () => {
  const s0 = base();
  const r = row1(s0);
  const s = run(s0,
    as(ADMIN),
    { type: 'EDIT_CELLS', edits: [{ rowId: r.id, colKey: 'name', value: '新社名株式会社' }] },
    { type: 'SUBMIT', title: '', comment: '', at: AT },
  );
  const s2 = run(s, { type: 'APPROVE', changeSetId: s.changeSets[0].id, comment: '', at: AT });
  assert.equal(s2.changeSets[0].status, 'pending');
  assert.equal(s2.notice?.kind, 'error');
});

test('差戻しで申請者の下書きに「差戻し」状態で戻る', () => {
  const s0 = base();
  const r = row1(s0);
  let s = run(s0,
    { type: 'EDIT_CELLS', edits: [{ rowId: r.id, colKey: 'tel', value: '03-1111-2222' }] },
    { type: 'SUBMIT', title: '', comment: '', at: AT },
  );
  const id = s.changeSets[0].id;
  const noReason = run(s, as(SUZUKI), { type: 'REJECT', changeSetId: id, comment: '', at: AT });
  assert.equal(noReason.notice?.kind, 'error');

  s = run(s, as(SUZUKI), { type: 'REJECT', changeSetId: id, comment: '番号を再確認してください', at: AT }, as(TANAKA));
  assert.equal(s.changeSets[0].status, 'rejected');
  const d = s.drafts[TANAKA].cells[cellKey(r.id, 'tel')];
  assert.equal(d.value, '03-1111-2222');
  assert.equal(d.rejectedFrom, id);

  const ctx = buildContext(s, s.users[0], Date.parse(AT));
  const gr = buildGridRows(s, s.users[0]).find((g) => g.id === r.id)!;
  const telCol = s.columns.find((c) => c.key === 'tel')!;
  assert.equal(cellView(ctx, gr, telCol).status, 'rejected');
});

test('承認不要の項目は申請時に即時反映される', () => {
  const s0 = base();
  const r = row1(s0);
  const s = run(s0,
    { type: 'EDIT_CELLS', edits: [{ rowId: r.id, colKey: 'note', value: '電話は午前中' }] },
    { type: 'SUBMIT', title: '', comment: '', at: AT },
  );
  assert.equal(s.changeSets.length, 0);
  assert.equal(row1(s).values.note, '電話は午前中');
  assert.equal(s.history.at(-1)?.kind, 'direct');
});

test('入力エラーがあると申請できない', () => {
  const s0 = base();
  const r = row1(s0);
  const s = run(s0,
    { type: 'EDIT_CELLS', edits: [{ rowId: r.id, colKey: 'zip', value: '1234567' }] },
    { type: 'SUBMIT', title: '', comment: '', at: AT },
  );
  assert.equal(s.changeSets.length, 0);
  assert.equal(s.notice?.kind, 'error');
  assert.equal(s.notice?.details?.length, 1);
});

test('新規行: コード重複は申請不可、正しければ承認で行が追加される', () => {
  const s0 = base();
  let s = run(s0, { type: 'ADD_ROW' });
  const nr = s.drafts[TANAKA].newRows[0];
  s = run(s, { type: 'EDIT_CELLS', edits: [
    { rowId: nr.id, colKey: 'code', value: s0.rows[0].values.code },
    { rowId: nr.id, colKey: 'name', value: '株式会社テスト' },
  ] }, { type: 'SUBMIT', title: '', comment: '', at: AT });
  assert.equal(s.changeSets.length, 0);
  assert.ok(s.notice?.details?.some((d) => d.includes('既に使われています')));

  s = run(s, { type: 'EDIT_CELLS', edits: [{ rowId: nr.id, colKey: 'code', value: 'V90001' }] },
    { type: 'SUBMIT', title: '新規', comment: '', at: AT });
  assert.equal(s.changeSets.length, 1);
  const n = s.rows.length;
  s = run(s, as(SUZUKI), { type: 'APPROVE', changeSetId: s.changeSets[0].id, comment: '', at: AT });
  assert.equal(s.rows.length, n + 1);
  assert.equal(s.rows.at(-1)?.values.code, 'V90001');
});

test('承認前に同じセルが別の変更で確定した場合は承認できない（競合検知）', () => {
  const s0 = base();
  const r = row1(s0);
  let s = run(s0,
    { type: 'EDIT_CELLS', edits: [{ rowId: r.id, colKey: 'status', value: '取引停止' }] },
    { type: 'SUBMIT', title: '', comment: '', at: AT },
  );
  // 別経路で値が変わったことを再現
  s = { ...s, rows: s.rows.map((x) => x.id === r.id ? { ...x, values: { ...x.values, status: '取引停止' } } : x) };
  s = run(s, as(SUZUKI), { type: 'APPROVE', changeSetId: s.changeSets[0].id, comment: '', at: AT });
  assert.equal(s.changeSets[0].status, 'pending');
  assert.equal(s.notice?.kind, 'error');
});

test('項目設定: 閲覧権限を外すと編集権限も外れ、マスク表示になる', () => {
  let s = run(base(), as(ADMIN), { type: 'UPDATE_COLUMN', key: 'tel', patch: { readRoles: ['accounting', 'approver', 'admin'] } });
  const tel = s.columns.find((c) => c.key === 'tel')!;
  assert.deepEqual(tel.editRoles, ['admin']);
  s = run(s, as(TANAKA));
  const ctx = buildContext(s, s.users[0]);
  const v = cellView(ctx, buildGridRows(s, s.users[0])[0], tel);
  assert.equal(v.masked, true);
  assert.equal(v.lock, 'no-read');
});

test('項目設定は管理者のみ', () => {
  const s = run(base(), as(SATO), { type: 'UPDATE_COLUMN', key: 'tel', patch: { required: true } });
  assert.equal(s.columns.find((c) => c.key === 'tel')!.required, undefined);
  assert.equal(s.notice?.kind, 'error');
});

test('取り下げで下書きに戻る（差戻し扱いではない）', () => {
  const s0 = base();
  const r = row1(s0);
  let s = run(s0,
    { type: 'EDIT_CELLS', edits: [{ rowId: r.id, colKey: 'tel', value: '03-1111-2222' }] },
    { type: 'SUBMIT', title: '', comment: '', at: AT },
  );
  s = run(s, { type: 'WITHDRAW', changeSetId: s.changeSets[0].id, at: AT });
  assert.equal(s.changeSets[0].status, 'withdrawn');
  assert.equal(s.drafts[TANAKA].cells[cellKey(r.id, 'tel')].rejectedFrom, undefined);
});

test('セルコメント: 申請 → 変更セット → 承認後の履歴まで引き継がれ、承認者のセル表示でも見える', () => {
  const s0 = base();
  const r = row1(s0);
  let s = run(s0,
    { type: 'EDIT_CELLS', edits: [{ rowId: r.id, colKey: 'address', value: '東京都港区芝公園4-2-8' }] },
    { type: 'SET_CELL_COMMENT', rowId: r.id, colKey: 'address', comment: '  本社移転の通知（10/28受領） ' },
    { type: 'SUBMIT', title: '', comment: '', at: AT },
  );
  assert.equal(s.changeSets[0].changes[0].comment, '本社移転の通知（10/28受領）');

  s = run(s, as(SUZUKI));
  const suzuki = s.users.find((u) => u.id === SUZUKI)!;
  const addr = s.columns.find((c) => c.key === 'address')!;
  const gr = buildGridRows(s, suzuki).find((g) => g.id === r.id)!;
  assert.equal(cellView(buildContext(s, suzuki), gr, addr).comment, '本社移転の通知（10/28受領）');

  s = run(s, { type: 'APPROVE', changeSetId: s.changeSets[0].id, comment: '', at: AT });
  assert.equal(s.history.at(-1)?.comment, '本社移転の通知（10/28受領）');
});

test('セルコメント: 値を変更していないセルには付けられない／値の再編集では消えない／差戻しで下書きに戻る', () => {
  const s0 = base();
  const r = row1(s0);
  const none = run(s0, { type: 'SET_CELL_COMMENT', rowId: r.id, colKey: 'tel', comment: 'x' });
  assert.equal(none.notice?.kind, 'error');

  let s = run(s0,
    { type: 'EDIT_CELLS', edits: [{ rowId: r.id, colKey: 'tel', value: '03-1111-2222' }] },
    { type: 'SET_CELL_COMMENT', rowId: r.id, colKey: 'tel', comment: '代表番号の変更' },
    { type: 'EDIT_CELLS', edits: [{ rowId: r.id, colKey: 'tel', value: '03-1111-3333' }] },
  );
  assert.equal(s.drafts[TANAKA].cells[cellKey(r.id, 'tel')].comment, '代表番号の変更');

  s = run(s, { type: 'SUBMIT', title: '', comment: '', at: AT },
    as(SUZUKI), { type: 'REJECT', changeSetId: 'CS-0001', comment: '番号を再確認', at: AT });
  assert.equal(s.drafts[TANAKA].cells[cellKey(r.id, 'tel')].comment, '代表番号の変更');
});

test('セルコメント: 新規行のセルにも付けられ、閲覧権限のない項目のコメントはマスクされる', () => {
  let s = run(base(), as(ADMIN), { type: 'ADD_ROW' });
  const nr = s.drafts[ADMIN].newRows[0];
  s = run(s,
    { type: 'EDIT_CELLS', edits: [
      { rowId: nr.id, colKey: 'code', value: 'V90002' },
      { rowId: nr.id, colKey: 'name', value: '株式会社テスト' },
      { rowId: nr.id, colKey: 'bank', value: 'みずほ銀行 本店 普通 1234567', comment: '口座開設届に基づく' },
    ] },
  );
  if (s.notice?.kind === 'error') assert.fail(s.notice.text);
  assert.equal(s.drafts[ADMIN].newRows[0].comments?.bank, '口座開設届に基づく');
  s = run(s, { type: 'SUBMIT', title: '', comment: '', at: AT });
  assert.equal(s.changeSets.at(-1)?.newRows[0].comments?.bank, '口座開設届に基づく');

  s = run(s, as(TANAKA));
  const tanaka = s.users[0];
  const bank = s.columns.find((c) => c.key === 'bank')!;
  const gr = buildGridRows(s, tanaka).find((g) => g.id === nr.id)!;
  assert.equal(cellView(buildContext(s, tanaka), gr, bank).comment, undefined);
});
