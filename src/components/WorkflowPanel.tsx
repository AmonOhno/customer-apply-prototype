import { useEffect, useRef, useState, type Dispatch } from 'react';
import type { Action } from '../domain/reducer.ts';
import { canApprove, canRead, currentUser } from '../domain/permissions.ts';
import { MASK } from '../domain/grid.ts';
import type { AppState, ChangeSet, ChangeSetStatus } from '../domain/types.ts';
import { ROLE_LABEL } from '../domain/types.ts';
import { formatValue } from '../domain/validation.ts';
import { formatDateTime } from '../store.ts';
import { Icon } from './Icon.tsx';

const STATUS_TEXT: Record<ChangeSetStatus, string> = {
  pending: '承認待ち', approved: '承認済', rejected: '差戻し', withdrawn: '取り下げ',
};

type Filter = 'todo' | 'mine' | 'all';

export function WorkflowPanel({ state, dispatch, focusId, onShowInGrid }: {
  state: AppState;
  dispatch: Dispatch<Action>;
  focusId: string | null;
  onShowInGrid: () => void;
}) {
  const user = currentUser(state);
  const approver = canApprove(user.role);
  const [filter, setFilter] = useState<Filter>(approver ? 'todo' : 'mine');
  const [openId, setOpenId] = useState<string | null>(focusId);

  useEffect(() => {
    if (focusId) { setOpenId(focusId); setFilter('all'); }
  }, [focusId]);
  const prevRole = useRef(user.role);
  useEffect(() => {
    if (prevRole.current === user.role) return;
    prevRole.current = user.role;
    setFilter(canApprove(user.role) ? 'todo' : 'mine');
  }, [user.role]);

  const todo = state.changeSets.filter((c) => c.status === 'pending' && c.requesterId !== user.id);
  const mine = state.changeSets.filter((c) => c.requesterId === user.id);
  const list = (filter === 'todo' ? todo : filter === 'mine' ? mine : state.changeSets).slice().reverse();

  return (
    <div className="workflow">
      <div className="wf-head">
        <div className="tabs" role="tablist" aria-label="変更セットの絞り込み">
          {approver && (
            <button type="button" role="tab" aria-selected={filter === 'todo'} className={filter === 'todo' ? 'on' : ''} onClick={() => setFilter('todo')}>
              承認待ち <span className="count">{todo.length}</span>
            </button>
          )}
          <button type="button" role="tab" aria-selected={filter === 'mine'} className={filter === 'mine' ? 'on' : ''} onClick={() => setFilter('mine')}>
            自分の申請 <span className="count">{mine.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
            すべて <span className="count">{state.changeSets.length}</span>
          </button>
        </div>
        <p className="muted wf-rule">
          承認者・マスタ管理者が承認します。自分が申請した変更セットは承認できません。
        </p>
      </div>

      {list.length === 0 ? (
        <div className="wf-empty">
          <Icon name="inbox" />
          <p>
            {filter === 'todo' ? '承認待ちの変更セットはありません。'
              : filter === 'mine' ? 'まだ申請していません。マスタ画面でセルを編集し「申請する」を押すと、ここに表示されます。'
              : '変更セットはまだありません。'}
          </p>
          {!approver && <button type="button" className="btn" onClick={onShowInGrid}><Icon name="table" />マスタを編集する</button>}
        </div>
      ) : (
        <ul className="cs-list">
          {list.map((cs) => (
            <ChangeSetCard key={cs.id} cs={cs} state={state} dispatch={dispatch}
              open={openId === cs.id} onToggle={() => setOpenId(openId === cs.id ? null : cs.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ChangeSetCard({ cs, state, dispatch, open, onToggle }: {
  cs: ChangeSet;
  state: AppState;
  dispatch: Dispatch<Action>;
  open: boolean;
  onToggle: () => void;
}) {
  const user = currentUser(state);
  const [comment, setComment] = useState('');
  const ref = useRef<HTMLLIElement>(null);
  const userName = (id?: string) => state.users.find((u) => u.id === id)?.name ?? '';
  const requester = state.users.find((u) => u.id === cs.requesterId);
  const canDecide = cs.status === 'pending' && canApprove(user.role) && cs.requesterId !== user.id;
  const canWithdraw = cs.status === 'pending' && cs.requesterId === user.id;
  const companies = new Set(cs.changes.map((c) => c.rowId)).size + cs.newRows.length;
  const at = () => new Date().toISOString();

  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [open]);

  return (
    <li className={`cs cs-${cs.status} ${open ? 'open' : ''}`} ref={ref}>
      <button type="button" className="cs-summary" onClick={onToggle} aria-expanded={open}>
        <span className={`cs-status s-${cs.status}`}>{STATUS_TEXT[cs.status]}</span>
        <span className="cs-title">
          <strong>{cs.title}</strong>
          <span className="muted">
            <span className="mono">{cs.id}</span>・{requester?.name}（{requester ? ROLE_LABEL[requester.role] : ''}）・<span className="num">{formatDateTime(cs.createdAt)}</span>
          </span>
        </span>
        <span className="cs-count num">{companies}社／{cs.changes.length + cs.newRows.length}件</span>
      </button>

      {open && (
        <div className="cs-detail">
          <ol className="steps" aria-label="ワークフローの進行">
            <li className="done"><span>申請</span><small className="num">{formatDateTime(cs.createdAt)}</small></li>
            <li className={cs.status === 'pending' ? 'current' : 'done'}>
              <span>{cs.status === 'pending' ? '承認待ち' : cs.status === 'withdrawn' ? '取り下げ' : cs.status === 'approved' ? '承認' : '差戻し'}</span>
              {cs.decidedAt && <small className="num">{formatDateTime(cs.decidedAt)} {userName(cs.decidedBy)}</small>}
            </li>
            <li className={cs.status === 'approved' ? 'done' : ''}><span>マスタへ反映</span></li>
          </ol>

          {cs.comment && <p className="cs-comment"><span className="muted">申請理由</span>{cs.comment}</p>}
          {cs.decisionComment && (
            <p className={`cs-comment ${cs.status === 'rejected' ? 'rej' : ''}`}>
              <span className="muted">{cs.status === 'rejected' ? '差戻し理由' : '承認コメント'}</span>{cs.decisionComment}
            </p>
          )}

          <div className="diff-wrap">
            <table className="diff">
              <thead><tr><th>取引先</th><th>項目</th><th>変更前</th><th>変更後</th></tr></thead>
              <tbody>
                {cs.newRows.map((nr) => (
                  <tr key={nr.id} className="new">
                    <td><span className="mono">{String(nr.values.code ?? '')}</span> {String(nr.values.name ?? '')}</td>
                    <td colSpan={3}>
                      <span className="tag ok">新規登録</span>{' '}
                      <span className="muted">
                        {state.columns.filter((c) => c.key !== 'code' && c.key !== 'name' && nr.values[c.key] != null)
                          .map((c) => `${c.label}：${canRead(c, user.role) ? formatValue(c, nr.values[c.key]) : MASK}`).join('／')}
                      </span>
                    </td>
                  </tr>
                ))}
                {cs.changes.map((ch) => {
                  const col = state.columns.find((c) => c.key === ch.colKey)!;
                  const row = state.rows.find((r) => r.id === ch.rowId);
                  const readable = canRead(col, user.role);
                  return (
                    <tr key={`${ch.rowId}:${ch.colKey}`}>
                      <td><span className="mono">{String(row?.values.code ?? '')}</span> {String(row?.values.name ?? '')}</td>
                      <td>{col.label}{col.sensitive && <span className="tag warn">機密</span>}</td>
                      <td className="before">{readable ? formatValue(col, ch.before) || '（空）' : MASK}</td>
                      <td className="after">{readable ? formatValue(col, ch.after) || '（空）' : MASK}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {canDecide && (
            <div className="decide">
              <label htmlFor={`dc-${cs.id}`}>コメント（差戻し時は必須）</label>
              <textarea id={`dc-${cs.id}`} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="例：登録番号を国税庁サイトで確認済み" />
              <div className="decide-actions">
                <button type="button" className="btn danger" disabled={!comment.trim()}
                  onClick={() => dispatch({ type: 'REJECT', changeSetId: cs.id, comment, at: at() })}>
                  <Icon name="undo" />差戻す
                </button>
                <button type="button" className="btn primary"
                  onClick={() => dispatch({ type: 'APPROVE', changeSetId: cs.id, comment, at: at() })}>
                  <Icon name="check" />承認する
                </button>
              </div>
            </div>
          )}
          {cs.status === 'pending' && !canDecide && !canWithdraw && (
            <p className="muted">
              {canApprove(user.role) ? '自分の申請は承認できません。' : '承認者・マスタ管理者に切り替えると承認できます。'}
            </p>
          )}
          {canWithdraw && (
            <div className="decide-actions">
              <span className="muted">承認者の判断を待っています。修正したい場合は取り下げると下書きに戻ります。</span>
              <button type="button" className="btn ghost" onClick={() => dispatch({ type: 'WITHDRAW', changeSetId: cs.id, at: at() })}>取り下げる</button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
