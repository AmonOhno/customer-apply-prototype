import { useEffect, useState } from 'react';
import { useAppStore } from './store.ts';
import { canApprove, currentUser } from './domain/permissions.ts';
import { createInitialState } from './domain/seed.ts';
import { ROLE_LABEL } from './domain/types.ts';
import { MasterGrid } from './components/MasterGrid.tsx';
import { WorkflowPanel } from './components/WorkflowPanel.tsx';
import { ColumnSettings } from './components/ColumnSettings.tsx';
import { RowAccessSettings } from './components/RowAccessSettings.tsx';
import { Icon } from './components/Icon.tsx';

type View = 'master' | 'workflow' | 'columns' | 'access';
const VIEWS: View[] = ['master', 'workflow', 'columns', 'access'];

const viewFromHash = (): View => {
  const h = location.hash.replace('#', '') as View;
  return VIEWS.includes(h) ? h : 'master';
};

export function App() {
  const [state, dispatch] = useAppStore();
  const [view, setView] = useState<View>(viewFromHash);
  const [focusCs, setFocusCs] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const user = currentUser(state);

  useEffect(() => {
    const on = () => setView(viewFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const go = (v: View) => {
    setView(v);
    if (location.hash !== `#${v}`) history.replaceState(null, '', `#${v}`);
  };

  const todo = state.changeSets.filter((c) => c.status === 'pending' && c.requesterId !== user.id).length;
  const myPending = state.changeSets.filter((c) => c.status === 'pending' && c.requesterId === user.id).length;
  const badge = canApprove(user.role) ? todo : myPending;

  useEffect(() => {
    if (!state.notice || state.notice.kind === 'error') return;
    const t = setTimeout(() => dispatch({ type: 'DISMISS_NOTICE' }), 5000);
    return () => clearTimeout(t);
  }, [state.notice, dispatch]);

  return (
    <div className="app">
      <header className="appbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">取</span>
          <div>
            <h1>取引先マスタ</h1>
            <p className="muted">マスタ保守・変更承認</p>
          </div>
        </div>
        <nav className="views" aria-label="画面切替">
          <button type="button" className={view === 'master' ? 'on' : ''} aria-current={view === 'master' ? 'page' : undefined} onClick={() => go('master')}>
            <Icon name="table" />マスタ
          </button>
          <button type="button" className={view === 'workflow' ? 'on' : ''} aria-current={view === 'workflow' ? 'page' : undefined} onClick={() => { setFocusCs(null); go('workflow'); }}>
            <Icon name="inbox" />承認<span className="long">ワークフロー</span>{badge > 0 && <span className="badge">{badge}</span>}
          </button>
          <button type="button" className={view === 'columns' ? 'on' : ''} aria-current={view === 'columns' ? 'page' : undefined} onClick={() => go('columns')}>
            <Icon name="sliders" />項目設定
          </button>
          <button type="button" className={view === 'access' ? 'on' : ''} aria-current={view === 'access' ? 'page' : undefined} onClick={() => go('access')}>
            <Icon name="filter" />閲覧範囲
          </button>
        </nav>
        <div className="who">
          <label htmlFor="user-switch" className="muted">操作ユーザー</label>
          <select id="user-switch" value={state.currentUserId} onChange={(e) => dispatch({ type: 'SET_USER', userId: e.target.value })}>
            {state.users.map((u) => <option key={u.id} value={u.id}>{u.name}（{ROLE_LABEL[u.role]}）</option>)}
          </select>
        </div>
      </header>

      <main className="main">
        {view === 'master' && (
          <MasterGrid state={state} dispatch={dispatch} onOpenChangeSet={(id) => { setFocusCs(id); go('workflow'); }} />
        )}
        {view === 'workflow' && (
          <WorkflowPanel state={state} dispatch={dispatch} focusId={focusCs} onShowInGrid={() => go('master')} />
        )}
        {view === 'columns' && <ColumnSettings state={state} dispatch={dispatch} />}
        {view === 'access' && <RowAccessSettings state={state} dispatch={dispatch} />}
      </main>

      <footer className="appfoot">
        <span className="muted">デモ用の架空データです。データはこのブラウザ内にのみ保存されます。</span>
        {confirmReset ? (
          <span className="reset-confirm">
            下書き・申請・履歴をすべて消して初期データに戻しますか？
            <button type="button" className="btn small danger" onClick={() => { dispatch({ type: 'RESET', state: createInitialState() }); setConfirmReset(false); }}>初期化する</button>
            <button type="button" className="btn small ghost" onClick={() => setConfirmReset(false)}>やめる</button>
          </span>
        ) : (
          <button type="button" className="btn small ghost" onClick={() => setConfirmReset(true)}>デモを初期化</button>
        )}
      </footer>

      {state.notice && (
        <div className={`toast ${state.notice.kind}`} role={state.notice.kind === 'error' ? 'alert' : 'status'}>
          <div>
            <p>{state.notice.text}</p>
            {state.notice.details && (
              <ul>
                {state.notice.details.slice(0, 5).map((d, i) => <li key={i}>{d}</li>)}
                {state.notice.details.length > 5 && <li>ほか{state.notice.details.length - 5}件</li>}
              </ul>
            )}
          </div>
          <button type="button" className="icon-btn" aria-label="閉じる" onClick={() => dispatch({ type: 'DISMISS_NOTICE' })}><Icon name="x" /></button>
        </div>
      )}
    </div>
  );
}
