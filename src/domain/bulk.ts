/** 表計算ソフト互換のTSV（タブ区切り、"..." で改行・タブを含むセル）を解析する */
export function parseTSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let i = 0;
  let quoted = false;
  const src = text.replace(/\r\n?/g, '\n');
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      cell += ch; i++; continue;
    }
    if (ch === '"' && cell === '') { quoted = true; i++; continue; }
    if (ch === '\t') { row.push(cell); cell = ''; i++; continue; }
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
    cell += ch; i++;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function toTSV(matrix: string[][]): string {
  const esc = (s: string) => (/[\t\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return matrix.map((r) => r.map(esc).join('\t')).join('\n');
}

export interface Rect {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

export interface Pos {
  r: number;
  c: number;
}

export const rectOf = (a: Pos, b: Pos): Rect => ({
  r0: Math.min(a.r, b.r), c0: Math.min(a.c, b.c), r1: Math.max(a.r, b.r), c1: Math.max(a.c, b.c),
});

export const rectSize = (r: Rect) => (r.r1 - r.r0 + 1) * (r.c1 - r.c0 + 1);

export const inRect = (rect: Rect, r: number, c: number) => r >= rect.r0 && r <= rect.r1 && c >= rect.c0 && c <= rect.c1;

export interface PlannedCell extends Pos {
  raw: string;
}

/**
 * 貼り付け先のセルを決める（表計算ソフトと同じ挙動）
 * - コピー元が選択範囲の約数サイズなら選択範囲全体へ繰り返し貼り付け（1セル→範囲全体を含む）
 * - それ以外は選択範囲の左上からコピー元のサイズで貼り付け（表の端で切り捨て）
 */
export function planPaste(sel: Rect, matrix: string[][], maxRows: number, maxCols: number): PlannedCell[] {
  const h = matrix.length;
  const w = Math.max(0, ...matrix.map((r) => r.length));
  if (h === 0 || w === 0) return [];
  const selH = sel.r1 - sel.r0 + 1;
  const selW = sel.c1 - sel.c0 + 1;
  const tile = selH % h === 0 && selW % w === 0 && (selH > h || selW > w);
  const outH = tile ? selH : h;
  const outW = tile ? selW : w;
  const out: PlannedCell[] = [];
  for (let dr = 0; dr < outH; dr++) {
    for (let dc = 0; dc < outW; dc++) {
      const r = sel.r0 + dr;
      const c = sel.c0 + dc;
      if (r >= maxRows || c >= maxCols) continue;
      out.push({ r, c, raw: matrix[dr % h][dc % w] ?? '' });
    }
  }
  return out;
}

/** 選択範囲の先頭行の値を下方向へコピー（Ctrl+D） */
export function planFillDown(sel: Rect, read: (r: number, c: number) => string): PlannedCell[] {
  const out: PlannedCell[] = [];
  for (let c = sel.c0; c <= sel.c1; c++) {
    const raw = read(sel.r0, c);
    for (let r = sel.r0 + 1; r <= sel.r1; r++) out.push({ r, c, raw });
  }
  return out;
}

/** 選択範囲内の文字列置換 */
export function planReplace(sel: Rect, read: (r: number, c: number) => string, find: string, replace: string): PlannedCell[] {
  if (!find) return [];
  const out: PlannedCell[] = [];
  for (let r = sel.r0; r <= sel.r1; r++) {
    for (let c = sel.c0; c <= sel.c1; c++) {
      const cur = read(r, c);
      if (cur.includes(find)) out.push({ r, c, raw: cur.split(find).join(replace) });
    }
  }
  return out;
}
