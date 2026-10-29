import { useMemo, useState } from 'react';
import type { PlannedCell, Rect } from '../domain/bulk.ts';
import { planReplace } from '../domain/bulk.ts';
import type { CellView, GridRow } from '../domain/grid.ts';
import { canEditColumn, LOCK_LABEL } from '../domain/permissions.ts';
import type { ColumnDef, Role } from '../domain/types.ts';
import { coerce, validateValue } from '../domain/validation.ts';
import { Modal } from './Modal.tsx';

type Mode = 'keep' | 'set' | 'clear';

interface Props {
  rect: Rect;
  rows: GridRow[];
  cols: ColumnDef[];
  views: CellView[][];
  role: Role;
  /** comment: 反映するセルすべてに付けるコメント（未入力なら既存のコメントを残す） */
  onApply: (cells: PlannedCell[], comment?: string) => void;
  onClose: () => void;
}

/** 選択範囲に対する一括入力・一括置換 */
export function BulkEditDialog({ rect, rows, cols, views, role, onApply, onClose }: Props) {
  const colIdx = useMemo(() => {
    const xs: number[] = [];
    for (let c = rect.c0; c <= rect.c1; c++) xs.push(c);
    return xs;
  }, [rect]);
  const rowCount = rect.r1 - rect.r0 + 1;

  const [modes, setModes] = useState<Record<string, Mode>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<'set' | 'replace'>('set');
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [comment, setComment] = useState('');

  const targets = (c: number) => {
    let n = 0;
    for (let r = rect.r0; r <= rect.r1; r++) if (!views[r][c].lock) n++;
    return n;
  };

  const editableCols = colIdx.filter((c) => canEditColumn(cols[c], role));
  const lockedCols = colIdx.filter((c) => !canEditColumn(cols[c], role));

  const readRaw = (r: number, c: number) => {
    const v = views[r][c];
    if (v.lock || v.masked || v.value === null || cols[c].type !== 'text') return '';
    return String(v.value);
  };

  const planned: PlannedCell[] = useMemo(() => {
    if (tab === 'replace') return planReplace(rect, readRaw, find, replace);
    const out: PlannedCell[] = [];
    for (const c of editableCols) {
      const mode = modes[cols[c].key] ?? 'keep';
      if (mode === 'keep') continue;
      const raw = mode === 'clear' ? '' : values[cols[c].key] ?? '';
      for (let r = rect.r0; r <= rect.r1; r++) if (!views[r][c].lock) out.push({ r, c, raw });
    }
    return out;
  }, [tab, rect, find, replace, modes, values, editableCols.join(','), views]);

  const errors = useMemo(() => {
    if (tab !== 'set') return [];
    const out: string[] = [];
    for (const c of editableCols) {
      const col = cols[c];
      const mode = modes[col.key] ?? 'keep';
      if (mode === 'keep') continue;
      const e = validateValue(col, coerce(col, mode === 'clear' ? '' : values[col.key] ?? ''));
      if (e) out.push(e);
    }
    return out;
  }, [tab, modes, values, editableCols.join(',')]);

  const setMode = (key: string, m: Mode) => setModes((x) => ({ ...x, [key]: m }));
  const setValue = (key: string, v: string) => {
    setValues((x) => ({ ...x, [key]: v }));
    setMode(key, 'set');
  };

  const firstName = String(rows[rect.r0]?.values.name ?? '');
  const scope = rowCount === 1 ? firstName : `${firstName} ほか${rowCount - 1}件`;

  return (
    <Modal
      title="一括編集"
      onClose={onClose}
      wide
      footer={
        <>
          <span className="muted">
            {planned.length ? `${planned.length}セルを下書きに反映します` : '変更する項目を選んでください'}
            {errors.length > 0 && '（入力エラーがあっても下書きには入り、申請前に修正できます）'}
          </span>
          <button type="button" className="btn ghost" onClick={onClose}>キャンセル</button>
          <button type="button" className="btn primary" disabled={!planned.length} onClick={() => onApply(planned, comment.trim() ? comment : undefined)}>反映する</button>
        </>
      }
    >
      <p className="scope">対象：<strong>{scope}</strong>（{rowCount}行 × {colIdx.length}項目）</p>
      <div className="tabs small" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'set'} className={tab === 'set' ? 'on' : ''} onClick={() => setTab('set')}>値を設定</button>
        <button type="button" role="tab" aria-selected={tab === 'replace'} className={tab === 'replace' ? 'on' : ''} onClick={() => setTab('replace')}>文字列を置換</button>
      </div>

      {tab === 'set' ? (
        <div className="bulk-list">
          {editableCols.length === 0 && <p className="muted">選択範囲に編集できる項目がありません。</p>}
          {editableCols.map((c) => {
            const col = cols[c];
            const mode = modes[col.key] ?? 'keep';
            const n = targets(c);
            const id = `bulk-${col.key}`;
            const err = mode !== 'keep' ? validateValue(col, coerce(col, mode === 'clear' ? '' : values[col.key] ?? '')) : null;
            return (
              <div className={`bulk-row ${mode !== 'keep' ? 'active' : ''}`} key={col.key}>
                <label htmlFor={id} className="bulk-label">
                  {col.label}{col.required && <span className="req">*</span>}
                  <span className="muted">{n}/{rowCount}セル{n < rowCount ? '（承認待ち等を除く）' : ''}</span>
                </label>
                <div className="bulk-input">
                  {col.type === 'select' ? (
                    <select id={id} value={mode === 'set' ? values[col.key] ?? '' : ''} onChange={(e) => e.target.value ? setValue(col.key, e.target.value) : setMode(col.key, 'keep')}>
                      <option value="">変更しない</option>
                      {col.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input id={id} value={mode === 'set' ? values[col.key] ?? '' : ''} placeholder={mode === 'clear' ? '空にします' : '変更しない'}
                      inputMode={col.type === 'number' ? 'numeric' : undefined}
                      onChange={(e) => e.target.value === '' ? setMode(col.key, 'keep') : setValue(col.key, e.target.value)} />
                  )}
                  {!col.required && (
                    <label className="check">
                      <input id={`${id}-clear`} type="checkbox" checked={mode === 'clear'} onChange={(e) => setMode(col.key, e.target.checked ? 'clear' : 'keep')} />
                      空にする
                    </label>
                  )}
                </div>
                {err && <p className="errtext">{err}</p>}
              </div>
            );
          })}
          {lockedCols.length > 0 && (
            <p className="muted locked-note">
              編集できない項目：{lockedCols.map((c) => cols[c].label).join('、')}
              （{LOCK_LABEL['no-edit']}）
            </p>
          )}
        </div>
      ) : (
        <div className="replace">
          <label htmlFor="bulk-find">検索する文字列</label>
          <input id="bulk-find" value={find} onChange={(e) => setFind(e.target.value)} placeholder="例：株式会社" />
          <label htmlFor="bulk-replace">置換後の文字列</label>
          <input id="bulk-replace" value={replace} onChange={(e) => setReplace(e.target.value)} placeholder="空欄なら削除" />
          <p className="muted">選択範囲内の、編集できる文字列項目が対象です。{find && `一致：${planned.length}セル`}</p>
          {planned.length > 0 && (
            <ul className="preview">
              {planned.slice(0, 5).map((p) => (
                <li key={`${p.r}:${p.c}`}>
                  <span className="before">{readRaw(p.r, p.c)}</span> → <span>{p.raw}</span>
                </li>
              ))}
              {planned.length > 5 && <li className="muted">ほか{planned.length - 5}セル</li>}
            </ul>
          )}
        </div>
      )}

      <div className="bulk-comment">
        <label htmlFor="bulk-comment">コメント（任意）</label>
        <textarea id="bulk-comment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)}
          placeholder="例：本社移転に伴う住所変更（移転通知 10/28受領）" />
        <p className="muted">反映する各セルに、申請の意図として付けます。承認者も確認できます。</p>
      </div>
    </Modal>
  );
}
