// Google Docs APIで仕様書を更新するスクリプト
const https = require('https');
const path  = require('path');

const DOC_ID = '11XSRU6LHA4iatiQuUTFJQBIAA96qeNB-OXOoCp-GU24';
const creds  = require(path.join(process.env.USERPROFILE, '.clasprc.json')).tokens.default;

// ─── アクセストークン取得 ─────────────────────────────────────────────

async function getAccessToken() {
  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: creds.refresh_token,
    client_id:     creds.client_id,
    client_secret: creds.client_secret,
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': body.length }},
      res => { let d=''; res.on('data', c=>d+=c); res.on('end', ()=>resolve(JSON.parse(d).access_token)); });
    req.on('error', reject); req.write(body); req.end();
  });
}

// ─── APIヘルパー ─────────────────────────────────────────────────────

function docsApi(method, endpoint, body, token) {
  const data = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'docs.googleapis.com', path: '/v1/documents/' + endpoint,
      method, headers: { 'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
    }, res => { let d=''; res.on('data', c=>d+=c); res.on('end', ()=>resolve(JSON.parse(d))); });
    req.on('error', reject);
    if (data) req.write(data); req.end();
  });
}

// ─── 仕様書コンテンツ ────────────────────────────────────────────────
// 各要素: { text, style } style= HEADING_1/HEADING_2/HEADING_3/NORMAL_TEXT

const SPEC = [
  { text: '次回予約率ツール 仕様書', style: 'TITLE' },
  { text: 'しんきゅうコンパス｜リピート率改善ツール', style: 'SUBTITLE' },
  { text: '作成日：2026年3月24日', style: 'NORMAL_TEXT' },
  { text: '' },

  { text: '1. ツール概要', style: 'HEADING_1' },
  { text: '「次回予約率ツール」は、しんきゅうコンパスに登録する鍼灸院が日々の施術・次回予約データを記録し、リピート率の推移を把握するためのWebツールです。' },
  { text: '・対象：しんきゅうコンパス登録サロン（院ごとにアカウントが発行される）' },
  { text: '・公開範囲：非公開（robots.txtおよびメタタグでクローラー・AIの収集を全面遮断）' },
  { text: '・アクセス：https://shinq-compass-cs.github.io/repeat-rate/' },
  { text: '' },

  { text: '2. アクセス・ログイン', style: 'HEADING_1' },
  { text: '2-1. ログイン仕様', style: 'HEADING_2' },
  { text: '・認証方法：サロンID（半角数字）＋ メールアドレス' },
  { text: '・照合先：Google Spreadsheet（マスターシート）の salon_list タブ' },
  { text: '・内部ログイン：info@shinq-compass.jp または test でログイン可（ログ記録スキップ）' },
  { text: '・セッション：ログイン後、サロンデータをメモリに保持（ページリロードで再ログイン）' },
  { text: '' },
  { text: '2-2. ログイン後の状態', style: 'HEADING_2' },
  { text: '・ヘッダーに院名を表示' },
  { text: '・当該院の全データを一括ロード（GAS API getData）' },
  { text: '・今月のリピート率を即時計算・表示' },
  { text: '' },

  { text: '3. 画面構成', style: 'HEADING_1' },
  { text: 'メイン画面はスクロール縦並びで以下のセクションで構成されます。' },
  { text: '① ヘッダー：院名・ログアウトボタン' },
  { text: '② 今月のリピート率：今月累計の大きな数値表示（評価バッジは非表示）' },
  { text: '③ 本日のデータ：当日の施術数・次回予約数を入力' },
  { text: '④ リピート率グラフ：過去12ヶ月の推移グラフ' },
  { text: '⑤ 過去データカレンダー：日付をクリックして過去データを編集' },
  { text: '' },

  { text: '4. 機能仕様', style: 'HEADING_1' },
  { text: '4-1. リピート率の定義・計算', style: 'HEADING_2' },
  { text: '・リピート率（%）= 次回予約数 ÷ 施術数 × 100（四捨五入）' },
  { text: '・月次計算：対象月の全日付データを集計' },
  { text: '' },
  { text: '評価基準', style: 'HEADING_3' },
  { text: '・90%以上　　　→ 優秀' },
  { text: '・70%以上90%未満 → 良好' },
  { text: '・50%以上70%未満 → 標準' },
  { text: '・50%未満　　　→ 課題あり' },
  { text: '' },

  { text: '4-2. 本日のデータ入力', style: 'HEADING_2' },
  { text: '・施術数（①）・次回予約数（②）をテンキー形式で入力' },
  { text: '・次回予約数 > 施術数 の場合は保存をブロック' },
  { text: '・保存後は「保存済み表示」に切り替わり、「修正」ボタンで再編集可能' },
  { text: '' },

  { text: '4-3. 患者詳細データ（顧客情報）', style: 'HEADING_2' },
  { text: '施術数（v）の数だけ患者行が自動生成されます。各行に「詳細▼」ボタンがあり、展開すると以下を入力できます。' },
  { text: '' },
  { text: 'フィールドとバリデーション一覧', style: 'HEADING_3' },
  { text: '・氏名（漢字）：テキスト / バリデーションなし' },
  { text: '・姓（ひらがな）：【Layer1】ひらがな・長音符のみ入力可' },
  { text: '・名（ひらがな）：【Layer1】ひらがな・長音符のみ入力可' },
  { text: '・メニュー：テキスト / バリデーションなし' },
  { text: '・性別：セレクト（男・女・—）' },
  { text: '・電話番号：【Layer1】数字・ハイフン・括弧のみ入力可' },
  { text: '・メールアドレス：【Layer1】半角英数字・記号のみ / 【Layer2】onblurでx@x.x形式チェック' },
  { text: '・次回予約：チェックボックス' },
  { text: '' },
  { text: 'Layer1バリデーション：IMEのcomposing状態をクロージャで管理し、確定後に不正文字をリアルタイム除去。除去時はフィールド直下に注意書きを2秒表示。' },
  { text: '' },
  { text: '日付切り替え時の安全設計', style: 'HEADING_3' },
  { text: '別日付のフォームを開く際、前日付の入力値・UIステート（詳細の開閉状態）を完全リセットします。これにより残留データが別日付に混入するバグを防止しています。' },
  { text: '' },

  { text: '4-4. 過去データカレンダー', style: 'HEADING_2' },
  { text: '・現在月の日付をカレンダー形式で表示' },
  { text: '・各日付セルにリピート率を色で表示（優秀：ゴールド / 良好：グリーン / 標準：イエロー / 課題あり：レッド / 未入力：空白）' },
  { text: '・「＜」「＞」ボタンで月移動（グラフも連動）' },
  { text: '・日付タップ → 過去フォームに切り替え（カレンダーと相互排他）' },
  { text: '・今日日付はクリック不可（上部「本日のデータ」で入力）' },
  { text: '' },

  { text: '4-5. CSVダウンロード', style: 'HEADING_2' },
  { text: 'カレンダー下部の「CSVダウンロード」ボタンから実行。' },
  { text: '・内容：当該院のスプレッドシート「顧客」タブをそのまま出力（変換なし）' },
  { text: '・ファイル名：院名_リピート率データ_YYYYMMDD.csv' },
  { text: '・文字コード：BOM付きUTF-8（Excel対応）' },
  { text: '・日付形式：YYYY-MM-DD（Excelでの自動変換を回避）' },
  { text: '・取得方法：GAS APIにfetchしてBlob URL経由でダウンロード（ファイル名制御のため）' },
  { text: '' },

  { text: '4-6. スプレッドシートで開く', style: 'HEADING_2' },
  { text: 'カレンダー下部の「スプレッドシート」ボタンから実行。' },
  { text: '・ボタン押下のたびに新規Googleスプレッドシートを生成（ファイル名：院名_リピート率データ_YYYYMMDD_HHMMSS）' },
  { text: '・内容：「顧客」タブ・「日次」タブの両方をコピー' },
  { text: '・公開設定：「リンクを知っている全員が閲覧可能」' },
  { text: '・新タブで開く → 「コピーを作成」でユーザー自身のGoogleドライブに保存可能' },
  { text: '' },

  { text: '5. データ管理', style: 'HEADING_1' },
  { text: '5-1. インフラ構成', style: 'HEADING_2' },
  { text: '・GitHub Pages：フロントエンドのホスティング（静的HTML/JS/CSS）' },
  { text: '・Google Apps Script：バックエンドAPI（Web App）' },
  { text: '・Google Spreadsheet（マスター）：院のアカウント管理・インデックス' },
  { text: '・Google Spreadsheet（院別）：院ごとの日次・顧客データ' },
  { text: '' },

  { text: '5-2. マスタースプレッドシート', style: 'HEADING_2' },
  { text: 'ID: 1CiuXRdYG-lI_jWA4DiR_uXvYU9dgqTE1v-JWsZF1l_g' },
  { text: '・salon_list タブ：院のログイン情報（サロンID・メール等）' },
  { text: '・repeat_rate_index タブ：院別スプレッドシートIDの管理テーブル' },
  { text: '' },

  { text: '5-3. 院別スプレッドシート', style: 'HEADING_2' },
  { text: '初回ログイン時に自動生成。Google Driveの指定フォルダ（ID: 1hu_VB9WpaKa-Cz-kmrvCV3KeynWlYjIp）に保存。' },
  { text: '' },
  { text: '日次タブ（1行 = 1日分）', style: 'HEADING_3' },
  { text: '・A列：日付（YYYY-MM-DD）' },
  { text: '・B列：施術数' },
  { text: '・C列：次回予約数' },
  { text: '・D列：リピート率（%）' },
  { text: '' },
  { text: '顧客タブ（1行 = 1来院記録）', style: 'HEADING_3' },
  { text: '・A列：日付' },
  { text: '・B列：患者番号（連番）' },
  { text: '・C列：姓（漢字）' },
  { text: '・D列：名（ひらがな）' },
  { text: '・E列：姓（ひらがな）※将来用' },
  { text: '・F列：電話番号' },
  { text: '・G列：施術料金' },
  { text: '・I列：メールアドレス' },
  { text: '・R列：レコードID（YYYYMMDD_NNN形式）' },
  { text: '・S列：次回予約（1=あり、0=なし）' },
  { text: '・T列：メニュー' },
  { text: '' },

  { text: '5-4. GAS APIエンドポイント', style: 'HEADING_2' },
  { text: 'POSTエンドポイント（doPost）', style: 'HEADING_3' },
  { text: '・login：ログイン認証・院別スプレッドシートの取得または自動生成' },
  { text: '・saveDay：日次データ・顧客データの保存（上書き）' },
  { text: '・getData：当該院の全日次・顧客データを取得' },
  { text: '' },
  { text: 'GETエンドポイント（doGet）', style: 'HEADING_3' },
  { text: '・csv：顧客タブをCSV形式で返す（BOM付きUTF-8）' },
  { text: '・export：新規Googleスプレッドシートを生成してURLを返す' },
  { text: '' },

  { text: '5-5. 重複排除ルール', style: 'HEADING_2' },
  { text: '・同一日付に複数回保存した場合、最後の保存が有効（上書き）' },
  { text: '・日次タブ：同一日付の最終行を残す' },
  { text: '・顧客タブ：同一（日付＋番号）の最終行を残す' },
  { text: '' },

  { text: '6. セキュリティ・公開範囲', style: 'HEADING_1' },
  { text: '・robots.txt で全クローラーを遮断' },
  { text: '・<meta name="robots"> でGoogle・AI各クローラーを遮断（noindex/nofollow/noarchive/nosnippet）' },
  { text: '・ChatGPT (GPTBot)、Claude (CCBot) 等のAIクローラーも個別に遮断' },
  { text: '・GitHub PagesはHTTPS配信' },
  { text: '・GAS Web AppはCORSを許可（ANYONE_ANONYMOUS）だが、ログインIDと院IDによる認証が必須' },
  { text: '・APIキーは露出なし（GASのマスターSSへのアクセスは認証済みGASプロジェクトのみ）' },
  { text: '' },

  { text: '7. 動作確認環境', style: 'HEADING_1' },
  { text: '・iPhone + Safari（スマートフォン主）' },
  { text: '・Android + Chrome（スマートフォン主）' },
  { text: '・PC + Chrome（補助）' },
  { text: '・ブレークポイント：600px（スマホ/PC切り替え）' },
  { text: '・iOSズーム防止：全テキスト入力フォントサイズ 16px 以上' },
  { text: '' },

  { text: '8. ファイル構成', style: 'HEADING_1' },
  { text: '・index.html：フロントエンド本体（HTML/CSS/JS一体型）' },
  { text: '・repeat-rate.gs：GASバックエンド' },
  { text: '・robots.txt：クローラー遮断設定' },
  { text: '・state-transition.test.js：Layer2 状態遷移テスト（46件）' },
  { text: '・gas-api.test.js：GAS統合テスト（39件）' },
  { text: '' },

  { text: '9. 更新履歴', style: 'HEADING_1' },
  { text: '・2026-02：初版リリース' },
  { text: '・2026-03：顧客詳細フォーム・メニュー列追加' },
  { text: '・2026-03-20：バリデーション実装（Layer1入力制限・Layer2形式検証）' },
  { text: '・2026-03-23：CSVダウンロード機能追加（顧客タブそのまま出力・院名付きファイル名）' },
  { text: '・2026-03-24：スプレッドシートエクスポート機能追加（毎回新規生成）' },
  { text: '・2026-03-24：日付切り替え時の残留データ混入バグ修正' },
];

// ─── メイン処理 ──────────────────────────────────────────────────────

async function main() {
  console.log('アクセストークン取得中...');
  const token = await getAccessToken();

  console.log('ドキュメント取得中...');
  const doc = await docsApi('GET', DOC_ID, null, token);
  const endIndex = doc.body.content.at(-1).endIndex - 1;

  // 既存コンテンツを全削除（index 1 から endIndex-1 まで）
  const requests = [];
  if (endIndex > 1) {
    requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex } } });
  }

  // テキストを後ろから挿入（先に挿入するとインデックスがずれるため逆順）
  const paragraphs = [...SPEC].reverse();
  for (const p of paragraphs) {
    const text = (p.text || '') + '\n';
    requests.push({ insertText: { location: { index: 1 }, text } });
    if (p.style && p.style !== 'NORMAL_TEXT') {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: 1, endIndex: 1 + text.length },
          paragraphStyle: { namedStyleType: p.style },
          fields: 'namedStyleType'
        }
      });
    }
  }

  console.log(`ドキュメント更新中... (${requests.length} リクエスト)`);
  const result = await docsApi('POST', DOC_ID + ':batchUpdate', { requests }, token);

  if (result.error) {
    console.error('エラー:', JSON.stringify(result.error, null, 2));
    process.exit(1);
  }
  console.log('完了: https://docs.google.com/document/d/' + DOC_ID);
}

main().catch(e => { console.error(e); process.exit(1); });
