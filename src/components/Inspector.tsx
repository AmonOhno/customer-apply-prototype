import { useState } from 'react';
import type { CellView, GridRow } from '../domain/grid.ts';
import { MASK, STATUS_LABEL } from '../domain/grid.ts';
import { canRead, currentUser, LOCK_LABEL } from '../domain/permissions.ts';
import type { AppState, ColumnDef } from '../domain/types.ts';
import { cellKey, ROLE_LABEL } from '../domain/types.ts';
import { formatValue } from '../domain/validation.ts';
import { formatDateTime } from '../store.ts';
import { Icon } from './Icon.tsx';

interface Props {
  state: AppState;
  row?: GridRow;
  col?: ColumnDef;
  view: CellView | null;
  selCount: number;
  onEdit: () => void;
  onRevert: (key: string) => void;
  onOpenChangeSet: (id: string) => void;
}

/** 選択中のセル・項目・行が持つプロパティを表示するパネル */
export function Inspector({ state, row, col, view, selCount, onEdit, onRevert, onOpenChangeSet }: Props) {
  const [open, setOpen] = useState(true);
  const user = currentUser(state);
  if (!row || !col || !view) {
    return <aside className="inspector"><p className="muted">セルを選択すると、状態・権限・変更履歴を表示します。</p></aside>;
  }
  const readable = canRead(col, user.role);
  const k = cellKey(row.id, col.key);
  const draft = state.drafts[user.id]?.cells[k];
  const committed = state.rows.find((r) => r.id === row.id);
  const history = state.history.filter((h) => h.rowId === row.id && h.colKey === col.key).slice().reverse();
  const show = (v: Parameters<typeof formatValue>[1]) => (readable ? (formatValue(col, v) || '（空）') : MASK);
  const userName = (id: string) => state.users.find((u) => u.id === id)?.name ?? id;
  const cs = view.changeSetId ? state.changeSets.find((c) => c.id === view.changeSetId) : undefined;

  return (
    <aside className={`inspector ${open ? '' : 'closed'}`} aria-label="選択中セルの詳細">
      <button type="button" className="insp-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>
          <span className="mono">{String(row.values.code ?? '新規')}</span> {String(row.values.name ?? '')}
        </span>
        <span className="muted">{open ? '閉じる' : '詳細'}</span>
      </button>

      {open && (
        <div className="insp-body">
          {selCount > 1 && <p className="selinfo">{selCount}セルを選択中。「一括編集」で選択範囲にまとめて入力できます。</p>}

          <section>
            <h3>セル</h3>
            <dl className="props">
              <dt>項目</dt><dd>{col.label}</dd>
              <dt>状態</dt>
              <dd><span className={`chip st-${view.status}`}><i />{STATUS_LABEL[view.status]}</span></dd>
              <dt>値</dt><dd className="val">{readable ? (view.text || '（空）') : <><Icon name="lock" />{LOCK_LABEL['no-read']}</>}</dd>
              {draft && <><dt>変更前</dt><dd className="val before">{show(draft.base)}</dd></>}
              {view.lock && view.lock !== 'no-read' && <><dt>編集</dt><dd className="muted">{LOCK_LABEL[view.lock]}</dd></>}
              {view.error && <><dt>エラー</dt><dd className="errtext">{view.error}</dd></>}
              {cs && (
                <>
                  <dt>変更セット</dt>
                  <dd>
                    <button type="button" className="link" onClick={() => onOpenChangeSet(cs.id)}>{cs.id}</button>
                    {cs.status === 'rejected' && cs.decisionComment && <span className="reason">差戻し理由：{cs.decisionComment}</span>}
                  </dd>
                </>
              )}
            </dl>
            <div className="insp-actions">
              {!view.lock && <button type="button" className="btn small" onClick={onEdit}><Icon name="pencil" />編集</button>}
              {draft && <button type="button" className="btn small ghost" onClick={() => onRevert(k)}><Icon name="undo" />元に戻す</button>}
            </div>
          </section>

          <section>
            <h3>項目のプロパティ</h3>
            <dl className="props">
              <dt>型</dt><dd>{col.type === 'number' ? '数値' : col.type === 'select' ? `選択（${col.options?.length ?? 0}件）` : '文字列'}{col.maxLength ? `・${col.maxLength}文字まで` : ''}</dd>
              <dt>必須</dt><dd>{col.required ? 'はい' : 'いいえ'}</dd>
              {col.patternMessage && <><dt>形式</dt><dd>{col.patternMessage}</dd></>}
              <dt>閲覧権限</dt><dd>{col.readRoles.map((r) => ROLE_LABEL[r]).join('・')}</dd>
              <dt>編集権限</dt><dd>{col.editRoles.length ? col.editRoles.map((r) => ROLE_LABEL[r]).join('・') : 'なし'}</dd>
              <dt>承認</dt><dd>{col.approvalRequired ? '承認が必要' : '承認不要（申請時に反映）'}</dd>
              {col.immutable && <><dt>変更</dt><dd>登録後は変更不可</dd></>}
              {col.sensitive && <><dt>区分</dt><dd>機密項目</dd></>}
            </dl>
            {col.description && <p className="desc">{col.description}</p>}
          </section>

          <section>
            <h3>行</h3>
            <dl className="props">
              <dt>行の状態</dt>
              <dd>{row.kind === 'committed' ? '登録済み' : row.kind === 'draft-new' ? '新規（未申請）' : '新規（承認待ち）'}</dd>
              {committed && <><dt>登録日時</dt><dd className="num">{formatDateTime(committed.createdAt)}</dd></>}
              {committed && <><dt>最終更新</dt><dd className="num">{formatDateTime(committed.updatedAt)}</dd></>}
            </dl>
          </section>

          <section>
            <h3><Icon name="history" />変更履歴</h3>
            {history.length === 0 ? <p className="muted">この項目の変更履歴はまだありません。</p> : (
              <ol className="hist">
                {history.map((h, i) => (
                  <li key={i}>
                    <div className="hist-head">
                      <span className="num">{formatDateTime(h.at)}</span>
                      <span>{userName(h.by)}</span>
                      <span className="tag mute">{h.kind === 'approved' ? '承認' : h.kind === 'direct' ? '即時反映' : '新規登録'}</span>
                    </div>
                    <div className="hist-diff">
                      {h.kind !== 'created' && <><span className="before">{show(h.before)}</span><span aria-hidden="true">→</span></>}
                      <span>{show(h.after)}</span>
                    </div>
                    {h.changeSetId && <button type="button" className="link" onClick={() => onOpenChangeSet(h.changeSetId!)}>{h.changeSetId}</button>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </aside>
  );
}
