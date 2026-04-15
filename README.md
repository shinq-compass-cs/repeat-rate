# 次回予約率ツール（repeat-rate）

しんきゅうコンパス加盟サロン向けの日次予約率管理ツール。
施術人数と次回予約人数を日次入力し、月次リピート率を自動集計する。

## 概要

- **UI：** [index.html](index.html) — ログイン → カレンダー入力 → Chart.js可視化（SPA構成）
- **バックエンド：** [repeat-rate.gs](repeat-rate.gs) — GAS Web App（サロン別スプレッドシートをDBとして利用）
- **デプロイ先：** Google Apps Script Web App（`executeAs: USER_DEPLOYING` / `access: ANYONE_ANONYMOUS`）

## アーキテクチャ

```
┌─────────────┐   HTTPS POST    ┌──────────────────┐
│  index.html │ ──────────────▶ │  GAS Web App     │
│  （SPA）     │ ◀────────────── │  (repeat-rate.gs)│
└─────────────┘   JSON response  └──────────────────┘
                                          │
                                          │ SpreadsheetApp
                                          ▼
                                 ┌──────────────────┐
                                 │ マスターSS        │
                                 │ repeat_rate_index │──┐
                                 └──────────────────┘  │ 参照
                                                       ▼
                                 ┌──────────────────┐
                                 │ サロン別SS        │
                                 │ （フォルダに集約） │
                                 └──────────────────┘
```

### データストア

| 種別 | ID | 用途 |
|---|---|---|
| マスターSS | `1CiuXRdYG-lI_jWA4DiR_uXvYU9dgqTE1v-JWsZF1l_g` | サロンID⇔メール⇔個別SS_IDの対応表（`repeat_rate_index`タブ） |
| サロン別SSフォルダ | `1hu_VB9WpaKa-Cz-kmrvCV3KeynWlYjIp` | サロン単位のスプレッドシートを自動作成・集約 |

## 主要エンドポイント

### POST（doPost）
| action | 関数 | 用途 |
|---|---|---|
| `login` | `handleLogin` | サロンID+メールで認証 |
| `loginAndGetData` | `handleLoginAndGetData` | 認証+初期データを1リクエストで取得（体感速度優先） |
| `saveDay` | `handleSaveDay` | 日次データ保存（施術人数・予約人数・物販・メニュー等） |
| `getData` | `handleGetData` | セッション復元時の差分取得 |

### GET（doGet）
| action | 用途 |
|---|---|
| `csv` | 日次データCSVエクスポート |
| `export` | スプレッドシートのExcel形式エクスポート |
| `updateDoc`（key必須） | 仕様書Google Docs自動生成 |

## セットアップ

### 初回デプロイ
1. [clasp](https://github.com/google/clasp) インストール（`npm i -g @google/clasp`）
2. `clasp login` でGoogleアカウント認証
3. `clasp push` でGASへコードを送信
4. GASエディタでデプロイ → 新しいデプロイ → ウェブアプリ
   - 実行ユーザー：**自分**
   - アクセスできるユーザー：**全員**
5. 発行されたWeb App URLを [index.html:457](index.html) の `GAS_URL` に設定

> ⚠️ `clasp deploy` は使用禁止（アクセス設定がリセットされる）。
> 詳細は [memory/feedback_gas_deploy.md](../.claude/CLAUDE.md) または CLAUDE.md §10 参照。

### ウォームアップトリガー設定
コールドスタート回避のため、`warmup()` を5分ごとに実行するタイムドリガーをGASエディタで登録：
- 関数：`warmup`
- イベントソース：時間主導型
- トリガータイプ：分タイマー / 5分おき

## 開発

### 依存関係
```bash
npm install
```
Playwrightがインストールされる（E2E・状態遷移テスト用）。

### テスト
CLAUDE.md §11 準拠の13種テスト体系。代表的なスイート：

| ファイル | 種別 | 実行タイミング |
|---|---|---|
| [state-transition.test.js](state-transition.test.js) | 状態遷移 | Edit後自動（PostToolUseフック） |
| [gas-api.test.js](gas-api.test.js) | GAS API単体 | `.gs`変更後自動 |
| [e2e.test.js](e2e.test.js) | E2Eシナリオ | 機能追加・リリース前 |
| [kpi-tool-test.js](kpi-tool-test.js) | KPI算出ロジック | ロジック変更後 |
| [test-pc.js](test-pc.js) | PC向けレスポンシブ | UI変更後 |

### 仕様書更新
[update-doc.js](update-doc.js) でGoogle Docs仕様書を自動生成：
```bash
curl 'https://script.google.com/macros/s/{DEPLOY_ID}/exec?action=updateDoc&key=shinqdoc2026'
```

## セキュリティ方針

- 認証：GAS側でサロンID+メールの照合（マスターSS参照）
- PII：氏名・連絡先等の顧客個人情報は本ツール外で管理
- インデックス：全クローラー（AI学習含む）を [robots.txt](robots.txt) + metaタグで拒否
- APIキー：本リポジトリには含めない（`.gitignore` で秘密情報を除外）

## ファイル構成

```
repeat-rate/
├── index.html              フロントエンドSPA（1,050行）
├── repeat-rate.gs          GASバックエンド（~1,200行）
├── appsscript.json         GASマニフェスト
├── robots.txt              クローラー制御
├── update-doc.js           仕様書生成ヘルパー
├── *.test.js               テストスイート
├── package.json            Node依存（Playwright）
├── .claspignore            clasp pushで除外するファイル
├── .gitignore              Git管理から除外するファイル
└── README.md               本ドキュメント
```
