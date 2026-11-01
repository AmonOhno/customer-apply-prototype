# アーキテクチャ（C4 モデル）

本書はリポジトリのコード（`package.json`、`vite.config.ts`、`scripts/build-single.mjs`、`.github/workflows/deploy-pages.yml`、`src/` 配下）を調査して作成したものです。コードから確認できない点は「未確認」と明記しています。

## 概要

| 項目 | 内容 |
| --- | --- |
| 目的 | 取引先マスタを Excel のような表で編集し、変更を「変更セット」単位で申請・承認するワークフローのプロトタイプ |
| 主な利用者 | 営業担当・経理担当（編集・申請）、承認者（承認・差戻し）、マスタ管理者（全編集・承認・項目設定・閲覧範囲設定）。画面右上のセレクトでロールを切り替えるデモ形式 |
| 実行形態 | ブラウザだけで完結する SPA。**バックエンド API・DB・認証基盤は存在しない**（状態はブラウザの `localStorage` に保存） |
| 配信 | GitHub Actions でビルドし GitHub Pages に公開。別途 `npm run build:single` で 1 ファイル HTML 版も生成可能 |

### 技術スタック

| 区分 | 技術 | 根拠 |
| --- | --- | --- |
| 言語 | TypeScript 5.8 | `package.json`, `tsconfig.json` |
| UI | React 18.3（`useReducer` による状態管理、外部状態管理ライブラリなし） | `package.json`, `src/store.ts` |
| ビルド | Vite 6 + `@vitejs/plugin-react` / esbuild（1ファイル版） | `vite.config.ts`, `scripts/build-single.mjs` |
| テスト | Node 標準テストランナー（`node --test`、Node 22.18+ の型除去） | `package.json` の `test` |
| 永続化 | ブラウザ `localStorage`（キー `torihikisaki-master:v1`） | `src/store.ts` |
| CI/CD | GitHub Actions → GitHub Pages | `.github/workflows/deploy-pages.yml` |
| 外部配信リソース | Google Fonts（IBM Plex Sans JP / Mono）、1ファイル版のみ cdnjs の React UMD | `index.html`, `scripts/build-single.mjs` |
| 認証 | なし（ユーザー切替は画面上のセレクト。実認証は未実装） | `src/App.tsx` |
| Docker / IaC | なし | リポジトリ内に該当ファイルなし |

---

## Level 1: System Context 図

```mermaid
C4Context
  title System Context: 取引先マスタ（表形式マスタ保守＋承認ワークフロー）

  Person(requester, "営業担当 / 経理担当", "取引先情報を編集し変更を申請する")
  Person(approver, "承認者", "変更セットを承認・差戻しする")
  Person(admin, "マスタ管理者", "全項目の編集・承認、項目設定、閲覧範囲設定")

  System(app, "取引先マスタ SPA", "ブラウザ内で完結する表形式マスタ保守・承認ワークフロー")

  System_Ext(pages, "GitHub Pages", "静的ファイルの配信")
  System_Ext(fonts, "Google Fonts", "Web フォント配信")
  System_Ext(gha, "GitHub / GitHub Actions", "ソース管理・テスト・ビルド・デプロイ")

  Rel(requester, app, "編集・申請・取り下げ")
  Rel(approver, app, "承認・差戻し")
  Rel(admin, app, "編集・承認・設定")
  Rel(app, pages, "HTML/JS/CSS を取得", "HTTPS")
  Rel(app, fonts, "フォントを取得", "HTTPS")
  Rel(gha, pages, "dist/ をデプロイ")
```

| 名前 | 種別 | 技術 | 責務 |
| --- | --- | --- | --- |
| 営業担当 / 経理担当 | Person | — | 権限のある項目を編集し、変更セットとして申請する（申請者本人は承認不可） |
| 承認者 | Person | — | 承認待ちの変更セットを承認・差戻し。編集権限は持たない |
| マスタ管理者 | Person | — | 全編集・承認（自分の申請以外）、項目プロパティと行の閲覧範囲の設定 |
| 取引先マスタ SPA | Software System | React + TypeScript | マスタ編集、申請・承認ワークフロー、権限・閲覧範囲制御、監査履歴 |
| GitHub Pages | External System | 静的ホスティング | ビルド成果物の配信（`https://amonohno.github.io/customer-apply-prototype/`） |
| Google Fonts | External System | CDN | IBM Plex Sans JP / Mono の配信 |
| GitHub / GitHub Actions | External System | CI/CD | `main` への push でテスト→ビルド→Pages デプロイ |

> 業務システム（会計システム、法人番号・インボイス登録番号の照会 API 等）との連携はコード上に存在しない（未実装）。

---

## Level 2: Container 図

```mermaid
C4Container
  title Container: 取引先マスタ

  Person(user, "利用者", "営業 / 経理 / 承認者 / 管理者")

  System_Boundary(sys, "取引先マスタ") {
    Container(spa, "Web アプリ (SPA)", "React 18, TypeScript, Vite", "表編集・申請・承認・設定の全 UI と業務ロジック")
    ContainerDb(ls, "localStorage", "ブラウザ Web Storage (JSON)", "AppState 全体（行・下書き・変更セット・履歴・設定）を保存")
    Container(single, "1ファイル HTML 版", "esbuild + React UMD", "共有・配布用の単一 HTML（dist-single/index.html）")
  }

  System_Ext(pages, "GitHub Pages", "静的配信")
  System_Ext(gha, "GitHub Actions", "CI/CD")
  System_Ext(fonts, "Google Fonts", "Web フォント")
  System_Ext(cdnjs, "cdnjs", "React UMD 配信（1ファイル版のみ）")

  Rel(user, spa, "操作", "ブラウザ")
  Rel(spa, ls, "状態を読み書き", "JSON")
  Rel(pages, spa, "配信", "HTTPS")
  Rel(gha, pages, "npm test / build 後にデプロイ")
  Rel(spa, fonts, "フォント取得", "HTTPS")
  Rel(single, cdnjs, "React 取得", "HTTPS")
```

| 名前 | 種別 | 技術 | 責務 |
| --- | --- | --- | --- |
| Web アプリ (SPA) | Container | React 18 / TypeScript / Vite 6 | 画面（マスタ・ワークフロー・項目設定・閲覧範囲）と全業務ロジック。ハッシュ（`#master` 等）で画面切替 |
| localStorage | Container (DB) | Web Storage | `AppState` を JSON で丸ごと保存。読込失敗時はシードデータで起動 |
| 1ファイル HTML 版 | Container | esbuild（`scripts/build-single.mjs`） | アプリ JS/CSS をインライン化し、React を cdnjs から読む配布用 HTML |
| GitHub Pages | External | 静的ホスティング | `dist/` を配信（`--base=/<repo>/`） |
| GitHub Actions | External | `deploy-pages.yml` | `npm ci` → `npm test` → `npm run build` → Pages デプロイ |
| Google Fonts / cdnjs | External | CDN | フォント / React UMD の配信 |

> API サーバー・DB・オブジェクトストレージ・バッチ・認証基盤はいずれも存在しない。README には「API／DB を付ける場合は reducer の各アクションをサーバー側のユースケースに移す」方針が記載されている。

---

## Level 3: Component 図（Web アプリ SPA）

```mermaid
C4Component
  title Component: Web アプリ (SPA)

  Person(user, "利用者")
  ContainerDb(ls, "localStorage", "Web Storage")

  Container_Boundary(ui, "UI 層 (src/App.tsx, src/components)") {
    Component(app, "App", "React", "画面切替・ユーザー切替・通知・デモ初期化")
    Component(grid, "MasterGrid", "React", "表編集・範囲選択・クエリ・コピー&貼り付け")
    Component(dialogs, "BulkEditDialog / SubmitDialog / Inspector", "React", "一括編集・申請・セルのプロパティ表示")
    Component(wfp, "WorkflowPanel", "React", "変更セット一覧・承認/差戻し/取り下げ")
    Component(settings, "ColumnSettings / RowAccessSettings", "React", "項目プロパティ・行の閲覧範囲の設定")
  }

  Component(store, "store.ts", "useReducer + localStorage", "状態の保持と永続化")

  Container_Boundary(domain, "ドメイン層 (src/domain) ※UI 非依存・テスト対象") {
    Component(reducer, "reducer.ts", "純粋関数", "編集・申請・承認・差戻し・取り下げ・設定の状態遷移")
    Component(perm, "permissions.ts / rowAccess.ts", "純粋関数", "閲覧・編集・承認可否、ロック理由、行の閲覧範囲")
    Component(gridm, "grid.ts / queries.ts", "純粋関数", "表示用行モデル・セル状態、クエリ適用")
    Component(valid, "validation.ts / bulk.ts", "純粋関数", "型変換・入力チェック、TSV 解析・一括操作の計画")
    Component(model, "types.ts / columns.ts / seed.ts", "型・定数", "データモデル、項目定義、初期データ")
  }

  Rel(user, app, "操作")
  Rel(app, grid, "描画")
  Rel(app, wfp, "描画")
  Rel(app, settings, "描画")
  Rel(grid, dialogs, "開く")
  Rel(app, store, "useAppStore()")
  Rel(store, reducer, "dispatch(Action)")
  Rel(store, ls, "load / save")
  Rel(grid, gridm, "行モデル・クエリ")
  Rel(grid, valid, "coerce / TSV")
  Rel(reducer, perm, "権限判定")
  Rel(reducer, valid, "入力チェック")
  Rel(gridm, perm, "ロック理由・閲覧可否")
```

| 名前 | 種別 | 技術 | 責務 |
| --- | --- | --- | --- |
| App (`src/App.tsx`) | Component | React | ヘッダー（画面切替・承認バッジ・操作ユーザー切替）、通知トースト、デモ初期化 |
| MasterGrid (`components/MasterGrid.tsx`) | Component | React | 表編集、キーボード操作、範囲選択、クエリ・検索、クリップボード TSV 連携、申請ダイアログ起動 |
| BulkEditDialog / SubmitDialog / Inspector / Modal | Component | React | 一括入力・置換、申請（件名・理由・コメント）、選択セルのプロパティ・履歴表示 |
| WorkflowPanel (`components/WorkflowPanel.tsx`) | Component | React | 変更セットの一覧・詳細、承認・差戻し（理由必須）・取り下げ |
| ColumnSettings / RowAccessSettings | Component | React | 項目ごとの権限・必須・形式・承認要否等、ロール別の行閲覧範囲の編集（管理者のみ） |
| store.ts | Component | React `useReducer` | `reducer` で状態を更新し、変更のたびに `localStorage` へ保存 |
| reducer.ts | Component | TypeScript 純粋関数 | 全 `Action`（`EDIT_CELLS` / `ADD_ROW` / `SUBMIT` / `APPROVE` / `REJECT` / `WITHDRAW` / `UPDATE_COLUMN` / `*_ROW_ACCESS` 等）の状態遷移。職務分掌・競合検知・コード重複チェック |
| permissions.ts / rowAccess.ts | Component | TypeScript | 列の閲覧・編集権限、承認可否、セルのロック理由、ロール別の行閲覧条件 |
| grid.ts / queries.ts | Component | TypeScript | 確定値＋下書き＋承認待ちから表示用セル状態を算出、クエリ（行条件・表示項目・並び順）の適用 |
| validation.ts / bulk.ts | Component | TypeScript | 型変換・必須/正規表現/文字数チェック、TSV 解析、貼り付け・下へコピー・置換の計画 |
| types.ts / columns.ts / seed.ts | Component | TypeScript | `AppState` 等のデータモデル、取引先マスタの項目定義・ユーザー、デモ初期データ |

---

## 主要なデータフロー

### 1. セル編集 → 申請（変更セット作成）

```mermaid
sequenceDiagram
  actor U as 申請者
  participant G as MasterGrid
  participant S as store (useReducer)
  participant R as reducer.ts
  participant L as localStorage

  U->>G: セルを編集 / 貼り付け
  G->>S: dispatch(EDIT_CELLS)
  S->>R: reducer(state, action)
  R->>R: lockReason・権限判定、下書きに保存
  S->>L: AppState を JSON 保存
  U->>G: 申請（件名・理由）
  G->>S: dispatch(SUBMIT)
  S->>R: validateDrafts → 承認要否で振り分け
  R-->>S: 承認不要セルは即時反映＋履歴 / 承認要は変更セット(pending)作成
  S->>L: 保存
```

### 2. 承認

```mermaid
sequenceDiagram
  actor A as 承認者
  participant W as WorkflowPanel
  participant R as reducer.ts
  participant L as localStorage

  A->>W: 変更セットを承認
  W->>R: dispatch(APPROVE)
  R->>R: 承認権限・本人申請でないか確認
  R->>R: 申請時の値と現在の確定値を比較（競合検知）
  R->>R: 新規行の取引先コード重複チェック
  R-->>W: 確定値へ反映・セル単位の変更履歴を追加
  W->>L: 保存
```

差戻し（`REJECT`、理由必須）・取り下げ（`WITHDRAW`）では変更内容が申請者の下書きに戻る。

### 3. 起動時の状態読み込み

`store.ts` の `load()` が `localStorage['torihikisaki-master:v1']` を読み、`schema === 1` なら復元（閲覧範囲が無い旧データには既定値を補完）、それ以外や読込失敗時は `seed.ts` の `createInitialState()` で初期化する。

---

## ディレクトリ構成

```
.
├── .github/workflows/deploy-pages.yml  # main への push でテスト・ビルドし GitHub Pages に公開
├── docs/architecture.md                # 本書
├── index.html                          # Vite のエントリ HTML（Google Fonts 読み込み）
├── package.json / package-lock.json    # 依存とスクリプト（dev / build / build:single / test）
├── scripts/build-single.mjs            # 1ファイル HTML 版（dist-single/）を生成
├── tsconfig.json / vite.config.ts      # TypeScript / Vite 設定
└── src/
    ├── main.tsx                        # React エントリポイント
    ├── App.tsx                         # 画面全体（ヘッダー・画面切替・通知）
    ├── store.ts                        # useReducer + localStorage 永続化
    ├── styles.css                      # 全スタイル
    ├── components/                     # React UI コンポーネント
    └── domain/                         # UI 非依存の業務ロジック（*.test.ts でテスト）
```

| ディレクトリ | 役割 |
| --- | --- |
| `src/domain/` | データモデル、権限・閲覧範囲、入力チェック、状態遷移、表示モデル、クエリ、一括操作。React に依存せず `node --test` でテスト |
| `src/components/` | 表（MasterGrid）、ダイアログ、ワークフロー、設定画面などの React コンポーネント |
| `scripts/` | ビルド補助スクリプト（1ファイル HTML 生成） |
| `.github/workflows/` | GitHub Pages への CI/CD |
| `docs/` | 設計ドキュメント |

## 未確認・未実装事項

- 本番運用向けのバックエンド API、DB、認証・認可基盤：未実装（プロトタイプのため）
- 外部業務システムとの連携：未実装
- GitHub Pages の公開設定（Settings → Pages → Source）がリポジトリ側で有効化済みか：リポジトリ内からは未確認
