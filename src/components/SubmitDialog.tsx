import { useMemo, useState } from 'react';
import { currentUser } from '../domain/permissions.ts';
import { validateDrafts } from '../domain/reducer.ts';
import type { AppState } from '../domain/types.ts';
import { splitCellKey } from '../domain/types.ts';
import { formatValue } from '../domain/validation.ts';
import { Modal } from './Modal.tsx';

export function SubmitDialog({ state, onSubmit, onClose }: {
  state: AppState;
  onSubmit: (title: string, comment: string) => void;
  onClose: () => void;
}) {
  const user = currentUser(state);
  const d = state.drafts[user.id] ?? { cells: {}, newRows: [] };
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const errors = useMemo(() => validateDrafts(state, user.id), [state, user.id]);

  const lines = Object.entries(d.cells).map(([k, cell]) => {
    const { rowId, colKey } = splitCellKey(k);
    const row = state.rows.find((r) => r.id === rowId);
    const col = state.columns.find((c) => c.key === colKey)!;
    return { k, row, col, before: row?.values[colKey] ?? null, after: cell.value };
  }).sort((a, b) => String(a.row?.values.code).localeCompare(String(b.row?.values.code)));

  const direct = lines.filter((l) => !l.col.approvalRequired);
  const wfCount = lines.length - direct.length + d.newRows.length;
  const rowCount = new Set(lines.map((l) => l.row?.id)).size;

  return (
    <Modal
      title="変更を申請"
      onClose={onClose}
      wide
      footer={
        <>
          <span className="muted">
            {wfCount > 0 ? `${wfCount}件を承認者へ回します` : ''}
            {wfCount > 0 && direct.length > 0 ? '／' : ''}
            {direct.length > 0 ? `承認不要の${direct.length}件は即時反映` : ''}
          </span>
          <button type="button" className="btn ghost" onClick={onClose}>戻る</button>
          <button type="button" className="btn primary" disabled={errors.length > 0} onClick={() => onSubmit(title, comment)}>申請する</button>
        </>
      }
    >
      {errors.length > 0 && (
        <div className="callout error" role="alert">
          <strong>入力エラーが{errors.length}件あります。表に戻って修正してください。</strong>
          <ul>{errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}</ul>
          {errors.length > 8 && <p>ほか{errors.length - 8}件</p>}
        </div>
      )}
      <div className="form-grid">
        <label htmlFor="cs-title">件名</label>
        <input id="cs-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`取引先マスタ変更（${wfCount}件）`} />
        <label htmlFor="cs-comment">申請理由</label>
        <textarea id="cs-comment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="例：取引先からの住所変更届（10/28受領）に基づく修正" />
      </div>

      <h3 className="sub">変更内容（{rowCount}社・{lines.length}セル{d.newRows.length ? `／新規${d.newRows.length}社` : ''}）</h3>
      <div className="diff-wrap">
        <table className="diff">
          <thead><tr><th>取引先</th><th>項目</th><th>変更前</th><th>変更後</th></tr></thead>
          <tbody>
            {d.newRows.map((nr) => (
              <tr key={nr.id} className="new">
                <td><span className="mono">{String(nr.values.code ?? '')}</span> {String(nr.values.name ?? '')}</td>
                <td colSpan={3}><span className="tag ok">新規登録</span></td>
              </tr>
            ))}
            {lines.map((l) => (
              <tr key={l.k}>
                <td><span className="mono">{String(l.row?.values.code ?? '')}</span> {String(l.row?.values.name ?? '')}</td>
                <td>{l.col.label}{!l.col.approvalRequired && <span className="tag ok">承認不要</span>}</td>
                <td className="before">{formatValue(l.col, l.before) || '（空）'}</td>
                <td className="after">{formatValue(l.col, l.after) || '（空）'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
