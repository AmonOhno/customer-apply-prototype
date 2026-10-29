import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTSV, planFillDown, planPaste, planReplace, toTSV } from './bulk.ts';
import { coerce, validateValue } from './validation.ts';
import { DEFAULT_COLUMNS } from './columns.ts';

test('TSV: 引用符で囲まれた改行・タブ・引用符を扱える', () => {
  const m = [['a', 'b\tc'], ['"x"', '1\n2']];
  assert.deepEqual(parseTSV(toTSV(m)), m);
  assert.deepEqual(parseTSV('a\tb\r\nc\td\r\n'), [['a', 'b'], ['c', 'd']]);
});

test('貼り付け: 1セルは選択範囲全体に入る', () => {
  const p = planPaste({ r0: 0, c0: 0, r1: 2, c1: 1 }, [['X']], 10, 10);
  assert.equal(p.length, 6);
  assert.ok(p.every((x) => x.raw === 'X'));
});

test('貼り付け: 範囲が約数でなければ左上から元のサイズで、表の端で切る', () => {
  const p = planPaste({ r0: 8, c0: 0, r1: 8, c1: 0 }, [['1', '2'], ['3', '4'], ['5', '6']], 10, 10);
  assert.deepEqual(p.map((x) => x.raw), ['1', '2', '3', '4']);
});

test('下へコピーと置換', () => {
  const grid = [['A', 'b-1'], ['B', 'b-2'], ['C', 'x']];
  const read = (r: number, c: number) => grid[r][c];
  assert.deepEqual(planFillDown({ r0: 0, c0: 0, r1: 2, c1: 0 }, read).map((x) => x.raw), ['A', 'A']);
  assert.deepEqual(planReplace({ r0: 0, c0: 1, r1: 2, c1: 1 }, read, 'b-', 'B-').map((x) => x.raw), ['B-1', 'B-2']);
});

test('数値の変換と検証', () => {
  const credit = DEFAULT_COLUMNS.find((c) => c.key === 'creditLimit')!;
  assert.equal(coerce(credit, '１,０００,０００円'), 1000000);
  assert.equal(validateValue(credit, coerce(credit, 'abc')), '与信限度額（円）は数値で入力してください');
  const kana = DEFAULT_COLUMNS.find((c) => c.key === 'kana')!;
  assert.equal(validateValue(kana, 'アオバ'), null);
  assert.notEqual(validateValue(kana, 'aoba'), null);
});
