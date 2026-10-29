import {
  useCallback, useEffect, useMemo, useRef, useState,
  type ClipboardEvent, type Dispatch, type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import type { Action, CellEdit } from '../domain/reducer.ts';
import { draftCount } from '../domain/reducer.ts';
import type { AppState, CellValue, ColumnDef, Role } from '../domain/types.ts';
import { buildContext, buildGridRows, cellView, STATUS_LABEL, type CellView, type GridRow } from '../domain/grid.ts';
import { canAddRow, canEditColumn, canRead, currentUser, LOCK_LABEL } from '../domain/permissions.ts';
import {
  inRect, parseTSV, planFillDown, planPaste, rectOf, rectSize, toTSV, type PlannedCell, type Pos, type Rect,
} from '../domain/bulk.ts';
import { coerce } from '../domain/validation.ts';
import { BulkEditDialog } from './BulkEditDialog.tsx';
import { SubmitDialog } from './SubmitDialog.tsx';
import { Inspector } from './Inspector.tsx';
import { Icon } from './Icon.tsx';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
  onOpenChangeSet: (id: string) => void;
}

interface Selection {
  anchor: Pos;
  focus: Pos;
}

interface Editing extends Pos {
  text: string;
}

const ROW_HEAD_W = 52;

const rawText = (v: CellView): string => (v.masked || v.value === null ? '' : String(v.value));

export function MasterGrid({ state, dispatch, onOpenChangeSet }: Props) {
  const user = currentUser(state);
  const [query, setQuery] = useState('');
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [rangeMode, setRangeMode] = useState(false);
  const [sel, setSel] = useState<Selection | null>({ anchor: { r: 0, c: 1 }, focus: { r: 0, c: 1 } });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [dialog, setDialog] = useState<'bulk' | 'submit' | null>(null);
  const dragging = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const cols = state.columns;
  const ctx = useMemo(() => buildContext(state, user), [state, user]);
  const allRows = useMemo(() => buildGridRows(state, user), [state, user]);

  const rows: GridRow[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows.filter((row) => {
      if (onlyChanged) {
        const changed = row.kind !== 'committed' || cols.some((c) => {
          const s = cellView(ctx, row, c).status;
          return s === 'draft' || s === 'pending' || s === 'rejected';
        });
        if (!changed) return false;
      }
      if (!q) return true;
      return cols.some((c) => canRead(c, user.role) && String(row.values[c.key] ?? '').toLowerCase().includes(q));
    });
  }, [allRows, query, onlyChanged, cols, ctx, user.role]);

  const views = useMemo(() => rows.map((row) => cols.map((c) => cellView(ctx, row, c))), [rows, cols, ctx]);

  // 表示行が変わったら選択位置を範囲内に収める
  useEffect(() => {
    if (!sel) return;
    const maxR = Math.max(0, rows.length - 1);
    const clamp = (p: Pos): Pos => ({ r: Math.min(p.r, maxR), c: Math.min(p.c, cols.length - 1) });
    if (sel.anchor.r > maxR || sel.focus.r > maxR) setSel({ anchor: clamp(sel.anchor), focus: clamp(sel.focus) });
  }, [rows.length, cols.length, sel]);

  useEffect(() => {
    const up = () => { dragging.current = false; };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  const rect: Rect | null = sel && rows.length ? rectOf(sel.anchor, sel.focus) : null;
  const focusView = sel && views[sel.focus.r] ? views[sel.focus.r][sel.focus.c] : null;
  const focusRow = sel ? rows[sel.focus.r] : undefined;
  const focusCol = sel ? cols[sel.focus.c] : undefined;

  const frozenLeft = useMemo(() => {
    const m = new Map<string, number>();
    let x = ROW_HEAD_W;
    for (const c of cols) {
      if (!c.frozen) continue;
      m.set(c.key, x);
      x += c.width;
    }
    return m;
  }, [cols]);

  const applyPlanned = useCallback((cells: PlannedCell[], comment?: string) => {
    const edits: CellEdit[] = [];
    for (const p of cells) {
      const row = rows[p.r];
      const col = cols[p.c];
      if (!row || !col) continue;
      const v = views[p.r][p.c];
      if (v.masked) continue;
      edits.push({ rowId: row.id, colKey: col.key, value: coerce(col, p.raw), comment });
    }
    if (edits.length) dispatch({ type: 'EDIT_CELLS', edits });
  }, [rows, cols, views, dispatch]);

  const applyValueToRect = (r: Rect, value: CellValue | string) => {
    const cells: PlannedCell[] = [];
    for (let i = r.r0; i <= r.r1; i++) for (let j = r.c0; j <= r.c1; j++) cells.push({ r: i, c: j, raw: value === null ? '' : String(value) });
    applyPlanned(cells);
  };

  const scrollIntoView = (p: Pos) => {
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-cell="${p.r}:${p.c}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const moveTo = (p: Pos, extend: boolean) => {
    const q = { r: Math.max(0, Math.min(rows.length - 1, p.r)), c: Math.max(0, Math.min(cols.length - 1, p.c)) };
    setSel((s) => (extend && s ? { anchor: s.anchor, focus: q } : { anchor: q, focus: q }));
    requestAnimationFrame(() => scrollIntoView(q));
  };

  const startEdit = (p: Pos, initial?: string) => {
    const v = views[p.r]?.[p.c];
    if (!v) return;
    if (v.lock) return;
    setEditing({ ...p, text: initial ?? rawText(v) });
  };

  const commitEdit = (text: string, opts: { toSelection?: boolean; move?: 'down' | 'right' | null }) => {
    if (!editing) return;
    const at = { r: editing.r, c: editing.c };
    setEditing(null);
    if (opts.toSelection && rect && rectSize(rect) > 1) applyValueToRect(rect, text);
    else applyPlanned([{ ...at, raw: text }]);
    if (opts.move === 'down') moveTo({ r: at.r + 1, c: at.c }, false);
    else if (opts.move === 'right') moveTo({ r: at.r, c: at.c + 1 }, false);
    gridRef.current?.focus({ preventScroll: true });
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (editing || dialog || !sel || !rect) return;
    const mod = e.ctrlKey || e.metaKey;
    const f = sel.focus;
    const arrows: Record<string, Pos> = {
      ArrowUp: { r: f.r - 1, c: f.c }, ArrowDown: { r: f.r + 1, c: f.c },
      ArrowLeft: { r: f.r, c: f.c - 1 }, ArrowRight: { r: f.r, c: f.c + 1 },
    };
    if (arrows[e.key]) {
      e.preventDefault();
      moveTo(arrows[e.key], e.shiftKey);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      moveTo({ r: f.r, c: f.c + (e.shiftKey ? -1 : 1) }, false);
    } else if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault();
      startEdit(f);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      applyValueToRect(rect, null);
    } else if (mod && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      applyPlanned(planFillDown(rect, (r, c) => rawText(views[r][c])));
    } else if (mod && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      setSel({ anchor: { r: 0, c: 0 }, focus: { r: rows.length - 1, c: cols.length - 1 } });
    } else if (e.key === 'Escape') {
      setSel({ anchor: f, focus: f });
    } else if (!mod && !e.altKey && (e.key.length === 1 || e.key === 'Process')) {
      const col = cols[f.c];
      if (col.type === 'select') { e.preventDefault(); startEdit(f); return; }
      if (e.key !== 'Process') e.preventDefault();
      startEdit(f, e.key === 'Process' ? '' : e.key);
    }
  };

  const onCopy = (e: ClipboardEvent<HTMLDivElement>) => {
    if (editing || !rect) return;
    e.preventDefault();
    const m: string[][] = [];
    for (let r = rect.r0; r <= rect.r1; r++) {
      const line: string[] = [];
      for (let c = rect.c0; c <= rect.c1; c++) line.push(rawText(views[r][c]));
      m.push(line);
    }
    e.clipboardData.setData('text/plain', toTSV(m));
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    if (editing || !rect) return;
    e.preventDefault();
    const matrix = parseTSV(e.clipboardData.getData('text/plain'));
    applyPlanned(planPaste(rect, matrix, rows.length, cols.length));
  };

  const onCellDown = (p: Pos, shift: boolean) => {
    if (editing && (editing.r !== p.r || editing.c !== p.c)) return;
    dragging.current = true;
    const extend = shift || rangeMode;
    setSel((s) => (extend && s ? { anchor: s.anchor, focus: p } : { anchor: p, focus: p }));
    gridRef.current?.focus({ preventScroll: true });
  };

  const selectColumn = (c: number) => {
    if (!rows.length) return;
    setSel({ anchor: { r: 0, c }, focus: { r: rows.length - 1, c } });
    gridRef.current?.focus({ preventScroll: true });
  };
  const selectRow = (r: number) => {
    setSel({ anchor: { r, c: 0 }, focus: { r, c: cols.length - 1 } });
    gridRef.current?.focus({ preventScroll: true });
  };

  const drafts = draftCount(state, user.id);
  const selCount = rect ? rectSize(rect) : 0;
  const canAdd = canAddRow(state, user.role);
  const editableInSel = rect
    ? cols.slice(rect.c0, rect.c1 + 1).some((c) => canEditColumn(c, user.role))
    : false;

  const addRow = () => {
    dispatch({ type: 'ADD_ROW' });
    setQuery('');
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  // 新規行追加直後、その行の先頭を選択する
  const prevNewCount = useRef(0);
  const newCount = state.drafts[user.id]?.newRows.length ?? 0;
  useEffect(() => {
    if (newCount > prevNewCount.current) {
      const r = rows.length - 1;
      if (r >= 0) { setSel({ anchor: { r, c: 0 }, focus: { r, c: 0 } }); gridRef.current?.focus({ preventScroll: true }); }
    }
    prevNewCount.current = newCount;
  }, [newCount, rows.length]);

  return (
    <div className="master">
      <div className="toolbar" role="toolbar" aria-label="編集操作">
        <div className="tool-group">
          <button type="button" className="btn" onClick={addRow} disabled={!canAdd} title={canAdd ? '' : '取引先を追加する権限がありません'}>
            <Icon name="plus" />行を追加
          </button>
          <button type="button" className="btn" onClick={() => setDialog('bulk')} disabled={!rect || !editableInSel}>
            <Icon name="grid" />一括編集{selCount > 1 ? `（${selCount}セル）` : ''}
          </button>
          <button type="button" className="btn" disabled={!rect || rect.r1 === rect.r0}
            onClick={() => rect && applyPlanned(planFillDown(rect, (r, c) => rawText(views[r][c])))} title="選択範囲の先頭行を下へコピー（Ctrl+D）">
            <Icon name="down" />下へコピー
          </button>
          <button type="button" className="btn" disabled={!rect} onClick={() => rect && applyValueToRect(rect, null)} title="選択範囲を空にする（Delete）">
            <Icon name="eraser" />クリア
          </button>
          <button type="button" className={`btn toggle ${rangeMode ? 'on' : ''}`} aria-pressed={rangeMode} onClick={() => setRangeMode((v) => !v)}
            title="オンの間はタップしたセルまで選択範囲を広げます（タッチ操作向け）">
            <Icon name="range" />範囲選択
          </button>
        </div>
        <div className="tool-group grow">
          <label className="search">
            <Icon name="search" />
            <input id="grid-search" type="search" placeholder="取引先名・コード・所在地で絞り込み" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <label className="check">
            <input id="only-changed" type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />
            変更がある行のみ
          </label>
        </div>
        <div className="tool-group submit-group">
          <span className="draft-count" aria-live="polite">
            未申請 <strong>{drafts}</strong> 件
          </span>
          <button type="button" className="btn ghost" disabled={!drafts} onClick={() => dispatch({ type: 'DISCARD_DRAFTS' })}>破棄</button>
          <button type="button" className="btn primary" disabled={!drafts} onClick={() => setDialog('submit')}>
            <Icon name="send" />申請する
          </button>
        </div>
      </div>

      <div className="legend" aria-label="セル状態の凡例">
        {(['draft', 'new', 'pending', 'rejected', 'approved'] as const).map((s) => (
          <span key={s} className={`chip st-${s}`}><i />{STATUS_LABEL[s]}</span>
        ))}
        <span className="chip locked-chip"><Icon name="lock" />閲覧権限なし</span>
        <span className="chip comment-chip"><i />コメントあり</span>
        <span className="hint">ドラッグ・Shift+クリックで範囲選択／入力後 Ctrl+Enter で範囲に一括入力／Excel から貼り付け可</span>
      </div>

      <div className="master-body">
        <div className="grid-scroll" ref={scrollRef}>
          <div
            className="grid"
            ref={gridRef}
            tabIndex={0}
            role="grid"
            aria-label="取引先マスタ"
            aria-rowcount={rows.length + 1}
            onKeyDown={onKeyDown}
            onCopy={onCopy}
            onPaste={onPaste}
          >
            <table>
              <colgroup>
                <col style={{ width: ROW_HEAD_W }} />
                {cols.map((c) => <col key={c.key} style={{ width: c.width }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th className="corner rowhead" scope="col"><span className="sr">行</span></th>
                  {cols.map((c, ci) => (
                    <ColumnHeader key={c.key} col={c} role={user.role} left={frozenLeft.get(c.key)}
                      active={!!rect && ci >= rect.c0 && ci <= rect.c1} onSelect={() => selectColumn(ci)} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={row.id} className={`row-${row.kind}`}>
                    <th scope="row" className={`rowhead ${rect && ri >= rect.r0 && ri <= rect.r1 ? 'active' : ''}`} onClick={() => selectRow(ri)}>
                      {row.kind === 'draft-new' ? (
                        <span className="rowtag">
                          新規
                          <button type="button" className="rm" aria-label="この新規行を削除" onClick={(e) => { e.stopPropagation(); dispatch({ type: 'REMOVE_NEW_ROW', rowId: row.id }); }}>×</button>
                        </span>
                      ) : row.kind === 'pending-new' ? <span className="rowtag pend">申請中</span> : ri + 1}
                    </th>
                    {cols.map((c, ci) => {
                      const v = views[ri][ci];
                      const isFocus = !!sel && sel.focus.r === ri && sel.focus.c === ci;
                      const inSel = !!rect && inRect(rect, ri, ci);
                      const left = frozenLeft.get(c.key);
                      const isEditing = editing && editing.r === ri && editing.c === ci;
                      const cls = [
                        'cell', `st-${v.status}`, c.type === 'number' ? 'num' : '', c.key === 'code' ? 'mono' : '',
                        inSel ? 'sel' : '', isFocus ? 'focus' : '', v.lock ? 'locked' : '', v.masked ? 'masked' : '',
                        v.error ? 'err' : '', v.comment ? 'has-comment' : '', left !== undefined ? 'frozen' : '',
                      ].filter(Boolean).join(' ');
                      return (
                        <td
                          key={c.key}
                          data-cell={`${ri}:${ci}`}
                          className={cls}
                          style={left !== undefined ? { left } : undefined}
                          title={[
                            v.error ?? (v.lock && v.lock !== 'no-read' ? LOCK_LABEL[v.lock] : v.masked ? LOCK_LABEL['no-read'] : undefined),
                            v.comment && `コメント：${v.comment}`,
                          ].filter(Boolean).join('\n') || undefined}
                          aria-selected={inSel}
                          onMouseDown={(e) => { if (e.button === 0) onCellDown({ r: ri, c: ci }, e.shiftKey); }}
                          onMouseEnter={() => { if (dragging.current && sel) setSel({ anchor: sel.anchor, focus: { r: ri, c: ci } }); }}
                          onDoubleClick={() => startEdit({ r: ri, c: ci })}
                        >
                          {isEditing ? (
                            <CellEditor col={c} initial={editing.text} multi={selCount > 1}
                              onCommit={commitEdit} onCancel={() => { setEditing(null); gridRef.current?.focus({ preventScroll: true }); }} />
                          ) : (
                            <span className="cell-text">
                              {v.masked && <Icon name="lock" />}
                              {v.text}
                              {v.error && <span className="err-mark" aria-label={v.error}>!</span>}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && (
              <p className="empty">条件に合う取引先がありません。検索語を変えるか「変更がある行のみ」を外してください。</p>
            )}
          </div>
        </div>

        <Inspector
          state={state}
          row={focusRow}
          col={focusCol}
          view={focusView}
          selCount={selCount}
          onEdit={() => sel && startEdit(sel.focus)}
          onRevert={(k) => dispatch({ type: 'DISCARD_DRAFTS', keys: [k] })}
          onComment={(comment) => focusRow && focusCol && dispatch({ type: 'SET_CELL_COMMENT', rowId: focusRow.id, colKey: focusCol.key, comment })}
          onOpenChangeSet={onOpenChangeSet}
        />
      </div>

      {dialog === 'bulk' && rect && (
        <BulkEditDialog
          rect={rect}
          rows={rows}
          cols={cols}
          views={views}
          role={user.role}
          onApply={(cells, comment) => { applyPlanned(cells, comment); setDialog(null); }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'submit' && (
        <SubmitDialog
          state={state}
          onComment={(rowId, colKey, comment) => dispatch({ type: 'SET_CELL_COMMENT', rowId, colKey, comment })}
          onSubmit={(title, comment) => {
            dispatch({ type: 'SUBMIT', title, comment, at: new Date().toISOString() });
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function ColumnHeader({ col, role, left, active, onSelect }: {
  col: ColumnDef; role: Role; left?: number; active: boolean; onSelect: () => void;
}) {
  const readable = canRead(col, role);
  const editable = canEditColumn(col, role);
  return (
    <th scope="col" className={`colhead ${left !== undefined ? 'frozen' : ''} ${active ? 'active' : ''} ${readable ? '' : 'noread'}`}
      style={left !== undefined ? { left } : undefined}>
      <button type="button" onClick={onSelect} title={`${col.label}の列を選択`}>
        <span className="colname">
          {col.label}
          {col.required && <span className="req" aria-label="必須">*</span>}
        </span>
        <span className="colmeta">
          {!readable ? <span className="tag mute"><Icon name="lock" />閲覧不可</span>
            : !editable ? <span className="tag mute">参照のみ</span>
            : col.immutable ? <span className="tag mute">新規時のみ</span> : null}
          {col.sensitive && readable && <span className="tag warn">機密</span>}
          {!col.approvalRequired && <span className="tag ok">承認不要</span>}
        </span>
      </button>
    </th>
  );
}

function CellEditor({ col, initial, multi, onCommit, onCancel }: {
  col: ColumnDef;
  initial: string;
  multi: boolean;
  onCommit: (text: string, opts: { toSelection?: boolean; move?: 'down' | 'right' | null }) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const done = useRef(false);
  const ref = useRef<HTMLInputElement & HTMLSelectElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    if (el instanceof HTMLInputElement) {
      const n = el.value.length;
      el.setSelectionRange(n, n);
    }
  }, []);
  const commit = (t: string, opts: { toSelection?: boolean; move?: 'down' | 'right' | null }) => {
    if (done.current) return;
    done.current = true;
    onCommit(t, opts);
  };
  const onKey = (e: ReactKeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(text, { toSelection: (e.ctrlKey || e.metaKey) && multi, move: e.ctrlKey || e.metaKey ? null : 'down' });
    } else if (e.key === 'Tab') {
      e.preventDefault();
      commit(text, { move: 'right' });
    } else if (e.key === 'Escape') {
      e.preventDefault();
      done.current = true;
      onCancel();
    }
    e.stopPropagation();
  };
  if (col.type === 'select') {
    return (
      <select ref={ref} className="editor" value={text} aria-label={col.label}
        onChange={(e) => { setText(e.target.value); commit(e.target.value, { move: null }); }}
        onKeyDown={onKey} onBlur={() => commit(text, { move: null })}>
        {!col.required && <option value="">（未設定）</option>}
        {col.required && text === '' && <option value="" disabled>選択してください</option>}
        {col.options?.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  return (
    <input ref={ref} className="editor" value={text} aria-label={col.label}
      inputMode={col.type === 'number' ? 'numeric' : undefined}
      onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
      onBlur={() => commit(text, { move: null })} />
  );
}

