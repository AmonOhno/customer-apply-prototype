import type { Dispatch } from 'react';
import type { Action } from '../domain/reducer.ts';
import { canManageRowAccess, currentUser } from '../domain/permissions.ts';
import { canSeeValues, matchesRule, OP_LABEL } from '../domain/rowAccess.ts';
import type { AccessCondition, AppState, ColumnDef, Role, RowAccessRule } from '../domain/types.ts';
import { ALL_ROLES, ROLE_LABEL } from '../domain/types.ts';
import { Icon } from './Icon.tsx';

const OPS = Object.keys(OP_LABEL) as AccessCondition['op'][];
const needsValues = (op: AccessCondition['op']) => op === 'in' || op === 'notIn';
const splitValues = (text: string) => text.split(/[,、\n]/).map((v) => v.trim()).filter(Boolean);

/** 取引先（行）の閲覧範囲：管理者が行の条件（クエリ）を定義し、閲覧できるロールに紐づける */
export function RowAccessSettings({ state, dispatch }: { state: AppState; dispatch: Dispatch<Action> }) {
  const user = currentUser(state);
  const admin = canManageRowAccess(user.role);
  const total = state.rows.length;

  const update = (rule: RowAccessRule, patch: Partial<Pick<RowAccessRule, 'label' | 'conditions' | 'roles'>>) =>
    dispatch({ type: 'UPDATE_ROW_ACCESS', id: rule.id, patch });
  const setCondition = (rule: RowAccessRule, i: number, cond: AccessCondition) =>
    update(rule, { conditions: rule.conditions.map((c, j) => (j === i ? cond : c)) });
  const toggleRole = (rule: RowAccessRule, role: Role, on: boolean) => {
    const next = on ? [...rule.roles, role] : rule.roles.filter((r) => r !== role);
    update(rule, { roles: ALL_ROLES.filter((r) => next.includes(r)) });
  };

  return (
    <div className="settings">
      <div className="settings-head">
        <p>
          {'閲覧範囲は、取引先（行）を絞り込む条件と、それを閲覧できるロールの組み合わせです。'
            + '利用者は、自分のロールに紐づくいずれかの閲覧範囲に該当する取引先だけを閲覧・編集できます。'
            + '条件は確定値で判定するため、編集中・承認待ちの間に行が見えなくなることはありません。'}
        </p>
        {!admin && <p className="callout">閲覧範囲を変更できるのはマスタ管理者のみです。画面右上で「高橋 管理者」に切り替えてください。</p>}
      </div>

      <div className="diff-wrap">
        <table className="settings-table access-summary">
          <caption className="sr">ロール別の閲覧できる取引先数</caption>
          <thead>
            <tr>
              <th scope="col">ロール</th>
              <th scope="col">閲覧範囲</th>
              <th scope="col">閲覧できる取引先</th>
            </tr>
          </thead>
          <tbody>
            {ALL_ROLES.map((role) => {
              const rules = state.rowAccess.filter((r) => r.roles.includes(role));
              const n = state.rows.filter((r) => canSeeValues(state, role, r.values)).length;
              return (
                <tr key={role}>
                  <th scope="row">{ROLE_LABEL[role]}</th>
                  <td className="left">{rules.length ? rules.map((r) => r.label).join('、') : <span className="muted">なし</span>}</td>
                  <td className={n === 0 ? 'warn-text' : ''}>{n}/{total}件{n === 0 && '（閲覧できません）'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="access-list">
        {state.rowAccess.map((rule) => {
          const matched = state.rows.filter((r) => matchesRule(r.values, rule)).length;
          return (
            <li key={rule.id} className="access-rule">
              <div className="access-rule-head">
                {admin ? (
                  <input className="label-input" aria-label="閲覧範囲の名前" value={rule.label}
                    onChange={(e) => update(rule, { label: e.target.value })} />
                ) : <strong>{rule.label}</strong>}
                <span className="muted">該当 {matched}/{total}件</span>
                {admin && (
                  <button type="button" className="btn small ghost danger-text" onClick={() => dispatch({ type: 'REMOVE_ROW_ACCESS', id: rule.id })}>
                    <Icon name="x" />削除
                  </button>
                )}
              </div>

              <fieldset className="access-roles">
                <legend>閲覧できるロール</legend>
                {ALL_ROLES.map((role) => (
                  <label key={role} className="check">
                    <input type="checkbox" checked={rule.roles.includes(role)} disabled={!admin}
                      onChange={(e) => toggleRole(rule, role, e.target.checked)} />
                    {ROLE_LABEL[role]}
                  </label>
                ))}
              </fieldset>

              <div className="access-conds">
                <span className="access-conds-label">条件{rule.conditions.length > 1 && '（すべてを満たす）'}</span>
                {rule.conditions.length === 0 && <span className="muted">条件なし（すべての取引先）</span>}
                {rule.conditions.map((cond, i) => (
                  <ConditionRow key={i} cond={cond} columns={state.columns} disabled={!admin}
                    onChange={(c) => setCondition(rule, i, c)}
                    onRemove={() => update(rule, { conditions: rule.conditions.filter((_, j) => j !== i) })} />
                ))}
                {admin && (
                  <button type="button" className="btn small" onClick={() => update(rule, {
                    conditions: [...rule.conditions, { colKey: 'status', op: 'in', values: [] }],
                  })}>
                    <Icon name="plus" />条件を追加
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {admin && (
        <div>
          <button type="button" className="btn" onClick={() => dispatch({ type: 'ADD_ROW_ACCESS' })}><Icon name="plus" />閲覧範囲を追加</button>
        </div>
      )}
      <p className="muted foot-note">
        {'自分で追加した新規行と、自分が申請中の新規行は、条件にかかわらず表示されます。'
          + 'どの閲覧範囲にも紐づかないロールは、取引先を1件も閲覧できません。'}
      </p>
    </div>
  );
}

function ConditionRow({ cond, columns, disabled, onChange, onRemove }: {
  cond: AccessCondition; columns: ColumnDef[]; disabled: boolean;
  onChange: (c: AccessCondition) => void; onRemove: () => void;
}) {
  const col = columns.find((c) => c.key === cond.colKey);
  return (
    <div className="access-cond">
      <select aria-label="項目" value={cond.colKey} disabled={disabled}
        onChange={(e) => onChange({ ...cond, colKey: e.target.value, values: [] })}>
        {columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
      </select>
      <select aria-label="比較方法" value={cond.op} disabled={disabled}
        onChange={(e) => onChange({ ...cond, op: e.target.value as AccessCondition['op'] })}>
        {OPS.map((op) => <option key={op} value={op}>{OP_LABEL[op]}</option>)}
      </select>
      {needsValues(cond.op) && (col?.type === 'select' ? (
        <span className="access-values">
          {col.options?.map((o) => (
            <label key={o} className="check">
              <input type="checkbox" checked={cond.values.includes(o)} disabled={disabled}
                onChange={(e) => onChange({
                  ...cond,
                  values: e.target.checked ? [...cond.values, o] : cond.values.filter((v) => v !== o),
                })} />
              {o}
            </label>
          ))}
        </span>
      ) : (
        // 入力途中の区切り文字を消さないよう、確定はフォーカスが外れたとき
        <input key={`${cond.colKey}:${cond.values.join('\n')}`} className="access-text" aria-label="値（読点・カンマ区切り）"
          placeholder="値を読点・カンマ区切りで入力" defaultValue={cond.values.join('、')} disabled={disabled}
          onBlur={(e) => onChange({ ...cond, values: splitValues(e.target.value) })} />
      ))}
      {needsValues(cond.op) && cond.values.length === 0 && <span className="warn-text">値が未指定のため{cond.op === 'in' ? '該当なし' : 'すべて該当'}</span>}
      {!disabled && (
        <button type="button" className="icon-btn" aria-label="この条件を削除" onClick={onRemove}><Icon name="x" /></button>
      )}
    </div>
  );
}
