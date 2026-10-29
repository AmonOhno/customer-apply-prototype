import type { Dispatch } from 'react';
import type { Action } from '../domain/reducer.ts';
import { canManageColumns, currentUser } from '../domain/permissions.ts';
import type { AppState, ColumnDef, Role } from '../domain/types.ts';
import { ALL_ROLES, ROLE_LABEL } from '../domain/types.ts';

/** カラム（項目）に付与する業務プロパティの設定画面 */
export function ColumnSettings({ state, dispatch }: { state: AppState; dispatch: Dispatch<Action> }) {
  const user = currentUser(state);
  const admin = canManageColumns(user.role);

  const toggleRole = (col: ColumnDef, field: 'readRoles' | 'editRoles', role: Role, on: boolean) => {
    const cur = col[field];
    const next = on ? [...cur, role] : cur.filter((r) => r !== role);
    dispatch({ type: 'UPDATE_COLUMN', key: col.key, patch: { [field]: ALL_ROLES.filter((r) => next.includes(r)) } });
  };

  return (
    <div className="settings">
      <div className="settings-head">
        <p>
          項目ごとに、閲覧・編集できるロール、必須かどうか、承認が必要かどうかを設定します。
          閲覧権限のないロールには、その項目（列）が表示されません。取引先（行）の閲覧範囲は「閲覧範囲」画面で設定します。
        </p>
        {!admin && <p className="callout">設定を変更できるのはマスタ管理者のみです。画面右上で「高橋 管理者」に切り替えてください。</p>}
      </div>
      <div className="diff-wrap">
        <table className="settings-table">
          <thead>
            <tr>
              <th rowSpan={2} scope="col">項目</th>
              <th rowSpan={2} scope="col">必須</th>
              <th rowSpan={2} scope="col">承認</th>
              <th rowSpan={2} scope="col">機密</th>
              {ALL_ROLES.map((r) => <th key={r} colSpan={2} scope="colgroup" className="rolehead">{ROLE_LABEL[r]}</th>)}
            </tr>
            <tr>
              {ALL_ROLES.map((r) => [
                <th key={`${r}-r`} scope="col" className="sub">閲覧</th>,
                <th key={`${r}-e`} scope="col" className="sub">編集</th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {state.columns.map((col) => (
              <tr key={col.key}>
                <th scope="row">
                  {admin ? (
                    <input id={`label-${col.key}`} className="label-input" aria-label={`${col.label}の項目名`} value={col.label}
                      onChange={(e) => dispatch({ type: 'UPDATE_COLUMN', key: col.key, patch: { label: e.target.value } })} />
                  ) : col.label}
                  <span className="muted keyname mono">{col.key}</span>
                </th>
                <td><Toggle id={`req-${col.key}`} label="必須" checked={!!col.required} disabled={!admin || !!col.immutable}
                  onChange={(v) => dispatch({ type: 'UPDATE_COLUMN', key: col.key, patch: { required: v } })} /></td>
                <td><Toggle id={`apr-${col.key}`} label="承認が必要" checked={col.approvalRequired} disabled={!admin || !!col.immutable}
                  onChange={(v) => dispatch({ type: 'UPDATE_COLUMN', key: col.key, patch: { approvalRequired: v } })} /></td>
                <td><Toggle id={`sen-${col.key}`} label="機密" checked={!!col.sensitive} disabled={!admin}
                  onChange={(v) => dispatch({ type: 'UPDATE_COLUMN', key: col.key, patch: { sensitive: v } })} /></td>
                {ALL_ROLES.map((r) => [
                  <td key={`${r}-r`} className="perm">
                    <input id={`rd-${col.key}-${r}`} type="checkbox" aria-label={`${ROLE_LABEL[r]}の${col.label}閲覧`}
                      checked={col.readRoles.includes(r)} disabled={!admin || r === 'admin'}
                      onChange={(e) => toggleRole(col, 'readRoles', r, e.target.checked)} />
                  </td>,
                  <td key={`${r}-e`} className="perm">
                    <input id={`ed-${col.key}-${r}`} type="checkbox" aria-label={`${ROLE_LABEL[r]}の${col.label}編集`}
                      checked={col.editRoles.includes(r)} disabled={!admin || r === 'approver'}
                      onChange={(e) => toggleRole(col, 'editRoles', r, e.target.checked)} />
                  </td>,
                ])}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted foot-note">
        編集権限を付けると閲覧権限も付きます。承認者は職務分掌のため編集権限を持てません。取引先コードは登録後に変更できないため、承認を外せません。
      </p>
    </div>
  );
}

function Toggle({ id, label, checked, disabled, onChange }: {
  id: string; label: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className={`switch ${checked ? 'on' : ''}`} htmlFor={id}>
      <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" aria-hidden="true"><span className="knob" /></span>
    </label>
  );
}
