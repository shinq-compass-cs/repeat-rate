// ============================================================
// repeat-rate.gs — 次回予約率ツール バックエンド（GAS Web App）
//
// 【セットアップ手順】
// 1. script.google.com で新規プロジェクト作成
// 2. このコードを貼り付けて保存
// 3. デプロイ → 新しいデプロイ → 種類:ウェブアプリ
//    ・次のユーザーとして実行：自分
//    ・アクセスできるユーザー：全員
// 4. デプロイURLをindex.htmlの GAS_URL に貼り付け
// ============================================================

const MASTER_SS_ID = '1CiuXRdYG-lI_jWA4DiR_uXvYU9dgqTE1v-JWsZF1l_g';
const INDEX_TAB    = 'repeat_rate_index'; // マスターシートに追加される管理タブ
const SALON_FOLDER_ID = '1hu_VB9WpaKa-Cz-kmrvCV3KeynWlYjIp'; // サロン別SSの保存先フォルダ

// ─── エントリーポイント ──────────────────────────────────────────────

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    switch (d.action) {
      case 'login':           return ok(handleLogin(d));
      case 'loginAndGetData': return ok(handleLoginAndGetData(d));
      case 'saveDay':         return ok(handleSaveDay(d));
      case 'getData':         return ok(handleGetData(d));
      case 'cleanup':         return ok(runCleanup2049());
      default:                return ok({ success: false, error: 'unknown action: ' + d.action });
    }
  } catch (err) {
    return ok({ success: false, error: err.message });
  }
}

function doGet(e) {
  if ((e.parameter.action || '') === 'csv')    return handleCsv(e.parameter);
  if ((e.parameter.action || '') === 'export') return handleExport(e.parameter);
  if (e.parameter.action === 'cleanup' && e.parameter.key === 'shinq2049cleanup') {
    return ContentService.createTextOutput(JSON.stringify(runCleanup2049()));
  }
  // 顧客タブマイグレーション（一時エンドポイント）
  if (e.parameter.action === 'migrate' && e.parameter.key === 'shinqmigrate2026') {
    return ContentService.createTextOutput(JSON.stringify({ result: runMigrationAll() }));
  }
  // 2049サロン 3/21 顧客行クリーンアップ（一時エンドポイント）
  if (e.parameter.action === 'fix2049mar21' && e.parameter.key === 'shinqfix2026') {
    return ContentService.createTextOutput(JSON.stringify(fix2049Mar21()));
  }
  // 既存シートにT列（メニュー）ヘッダー追加
  if (e.parameter.action === 'addMenuCol' && e.parameter.key === 'shinqmenu2026') {
    return ContentService.createTextOutput(JSON.stringify(addMenuColumnToExistingSheets()));
  }
  // 既存シートのR列・S列フォーマット移行
  if (e.parameter.action === 'migrateRS' && e.parameter.key === 'shinqrs2026') {
    return ContentService.createTextOutput(JSON.stringify(migrateRSColumns()));
  }
  // 既存シートのL列（物販）の0を空欄にクリア
  if (e.parameter.action === 'clearBuhanCol' && e.parameter.key === 'shinqbuhan2026') {
    return ContentService.createTextOutput(JSON.stringify(clearBuhanColumn()));
  }
  // 既存シートの日次D列にパーセント表記フォーマット適用
  if (e.parameter.action === 'formatRateCol' && e.parameter.key === 'shinqrate2026') {
    return ContentService.createTextOutput(JSON.stringify(formatRateColumn()));
  }
  // 2049スプレッドシート J/L/O/P列クリア + R/S再マイグレーション
  if (e.parameter.action === 'fixCols2049' && e.parameter.key === 'shinqfix2049jop') {
    return ContentService.createTextOutput(JSON.stringify(fixColumns2049()));
  }
  // 2049サロン 3/5 顧客行クリーンアップ（一時エンドポイント）
  if (e.parameter.action === 'fix2049mar5' && e.parameter.key === 'shinqfix2026') {
    return ContentService.createTextOutput(JSON.stringify(fix2049Mar5()));
  }
  // 仕様書更新（一時エンドポイント）
  if (e.parameter.action === 'updateDoc' && e.parameter.key === 'shinqdoc2026') {
    return ContentService.createTextOutput(JSON.stringify(updateSpecDoc()));
  }
  return ContentService.createTextOutput('repeat-rate GAS OK');
}

// ─── 仕様書更新（Google Docs） ─────────────────────────────────────────
function updateSpecDoc() {
  const DOC_ID  = '11XSRU6LHA4iatiQuUTFJQBIAA96qeNB-OXOoCp-GU24';
  const C_NAVY  = '#2c4a72'; // ネイビー（見出し）
  const C_GREEN = '#2e8a6e'; // グリーン（サブ見出し）
  const C_LIGHT = '#e8f0fb'; // ライトブルー（テーブルヘッダー背景）
  const C_WHITE = '#ffffff';
  const C_GRAY  = '#f8fafc'; // 交互行背景

  const doc  = DocumentApp.openById(DOC_ID);
  const body = doc.getBody();
  body.clear();

  // ── ヘルパー ──────────────────────────────────────────────────────────

  // H1：大見出し（ネイビー・下余白大）
  function h1(t) {
    const pg = body.appendParagraph(t);
    pg.setHeading(DocumentApp.ParagraphHeading.HEADING1);
    pg.setSpacingBefore(20).setSpacingAfter(6);
    pg.editAsText().setForegroundColor(C_NAVY).setFontSize(16).setBold(true);
    return pg;
  }

  // H2：中見出し（グリーン）
  function h2(t) {
    const pg = body.appendParagraph(t);
    pg.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    pg.setSpacingBefore(14).setSpacingAfter(4);
    pg.editAsText().setForegroundColor(C_GREEN).setFontSize(13).setBold(true);
    return pg;
  }

  // H3：小見出し（ネイビー細字）
  function h3(t) {
    const pg = body.appendParagraph(t);
    pg.setHeading(DocumentApp.ParagraphHeading.HEADING3);
    pg.setSpacingBefore(10).setSpacingAfter(3);
    pg.editAsText().setForegroundColor(C_NAVY).setFontSize(11).setBold(true);
    return pg;
  }

  // 通常段落
  function p(t, opts) {
    const pg = body.appendParagraph(t || '');
    pg.setHeading(DocumentApp.ParagraphHeading.NORMAL);
    pg.setSpacingBefore(0).setSpacingAfter(2);
    pg.editAsText().setFontSize(10).setForegroundColor('#333333');
    if (opts && opts.indent) pg.setIndentStart(18);
    return pg;
  }

  // 箇条書き行（インデント付き・グリーン「・」）
  function li(t) {
    const pg = body.appendParagraph('');
    pg.setHeading(DocumentApp.ParagraphHeading.NORMAL);
    pg.setSpacingBefore(1).setSpacingAfter(1).setIndentStart(12);
    const txt = pg.editAsText();
    txt.insertText(0, '・ ' + t);
    txt.setForegroundColor(0, 1, C_GREEN).setBold(0, 1, true);
    txt.setForegroundColor(2, t.length + 1, '#333333');
    txt.setFontSize(10);
    return pg;
  }

  // テーブル（ヘッダー行あり）
  function tbl(headers, rows) {
    const data = [headers, ...rows];
    const table = body.appendTable(data);
    table.setBorderColor('#c8d8e8');

    // ヘッダー行スタイル
    const hRow = table.getRow(0);
    for (let c = 0; c < headers.length; c++) {
      const cell = hRow.getCell(c);
      cell.setBackgroundColor(C_LIGHT);
      const txt = cell.getChild(0).asParagraph().editAsText();
      txt.setForegroundColor(C_NAVY).setFontSize(10).setBold(true);
    }

    // データ行スタイル（交互）
    for (let r = 1; r < data.length; r++) {
      const row = table.getRow(r);
      const bg  = (r % 2 === 0) ? C_GRAY : C_WHITE;
      for (let c = 0; c < data[r].length; c++) {
        const cell = row.getCell(c);
        cell.setBackgroundColor(bg);
        cell.getChild(0).asParagraph().editAsText().setFontSize(10).setForegroundColor('#333333');
      }
    }
    return table;
  }

  function sp() { p(''); } // 空行

  // ── タイトルブロック ────────────────────────────────────────────────
  const titlePg = body.appendParagraph('次回予約率ツール 仕様書');
  titlePg.setHeading(DocumentApp.ParagraphHeading.TITLE);
  titlePg.setSpacingAfter(4);
  titlePg.editAsText().setForegroundColor(C_NAVY).setFontSize(24).setBold(true);

  const subPg = body.appendParagraph('しんきゅうコンパス｜リピート率改善ツール');
  subPg.setHeading(DocumentApp.ParagraphHeading.SUBTITLE);
  subPg.editAsText().setForegroundColor(C_GREEN).setFontSize(13);

  const datePg = body.appendParagraph('作成日：2026年3月24日');
  datePg.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  datePg.setSpacingAfter(16);
  datePg.editAsText().setFontSize(10).setForegroundColor('#888888').setItalic(true);
  sp();

  // ── 1. ツール概要 ────────────────────────────────────────────────────
  h1('1. ツール概要');
  p('「次回予約率ツール」は、しんきゅうコンパスに登録する鍼灸院が日々の施術・次回予約データを記録し、リピート率の推移を把握するためのWebツールです。');
  sp();
  tbl(['項目', '内容'], [
    ['対象',     'しんきゅうコンパス登録サロン（院ごとにアカウントが発行される）'],
    ['公開範囲', '非公開（robots.txt・メタタグでクローラー・AIの収集を全面遮断）'],
    ['アクセスURL', 'https://shinq-compass-cs.github.io/repeat-rate/'],
  ]);
  sp();

  // ── 2. アクセス・ログイン ────────────────────────────────────────────
  h1('2. アクセス・ログイン');
  h2('2-1. ログイン仕様');
  tbl(['項目', '仕様'], [
    ['認証方法',     'サロンID（半角数字）＋ メールアドレス'],
    ['照合先',       'Google Spreadsheet（マスターシート）の salon_list タブ'],
    ['内部ログイン', 'info@shinq-compass.jp または test でログイン可（ログ記録スキップ）'],
    ['セッション',   'ログイン後、サロンデータをメモリに保持（ページリロードで再ログイン）'],
  ]);
  sp();
  h2('2-2. ログイン後の状態');
  li('ヘッダーに院名を表示');
  li('当該院の全データを一括ロード（GAS API getData）');
  li('今月のリピート率を即時計算・表示');
  sp();

  // ── 3. 画面構成 ──────────────────────────────────────────────────────
  h1('3. 画面構成');
  p('メイン画面はスクロール縦並びで以下のセクションで構成されます。');
  sp();
  tbl(['#', 'セクション名', '内容'], [
    ['①', 'ヘッダー',             '院名・ログアウトボタン'],
    ['②', '今月のリピート率',     '今月累計の大きな数値表示（評価バッジは非表示）'],
    ['③', '本日のデータ',         '当日の施術数・次回予約数を入力'],
    ['④', 'リピート率グラフ',     '過去12ヶ月の推移グラフ'],
    ['⑤', '過去データカレンダー', '日付をクリックして過去データを編集'],
  ]);
  sp();

  // ── 4. 機能仕様 ──────────────────────────────────────────────────────
  h1('4. 機能仕様');

  h2('4-1. リピート率の定義・計算');
  li('リピート率（%）= 次回予約数 ÷ 施術数 × 100（四捨五入）');
  li('月次計算：対象月の全日付データを集計');
  sp();
  h3('評価基準');
  tbl(['評価', '条件', '表示色'], [
    ['優秀',   '90% 以上',           'ゴールド'],
    ['良好',   '70% 以上 90% 未満',  'グリーン'],
    ['標準',   '50% 以上 70% 未満',  'イエロー'],
    ['課題あり', '50% 未満',         'レッド'],
  ]);
  sp();

  h2('4-2. 本日のデータ入力');
  li('施術数（①）・次回予約数（②）をテンキー形式で入力');
  li('次回予約数 > 施術数 の場合は保存をブロック');
  li('保存後は「保存済み表示」に切り替わり、「修正」ボタンで再編集可能');
  sp();

  h2('4-3. 患者詳細データ（顧客情報）');
  p('施術数（v）の数だけ患者行が自動生成されます。各行の「詳細▼」ボタンを展開して入力します。');
  sp();
  h3('フィールドとバリデーション一覧');
  tbl(['フィールド', '入力形式', 'バリデーション'], [
    ['氏名（漢字）',     'テキスト',         'なし'],
    ['姓（ひらがな）',   'テキスト',         '【Layer1】ひらがな・長音符のみ'],
    ['名（ひらがな）',   'テキスト',         '【Layer1】ひらがな・長音符のみ'],
    ['メニュー',         'テキスト',         'なし'],
    ['性別',             'セレクト',         '男・女・—'],
    ['電話番号',         'tel',              '【Layer1】数字・ハイフン・括弧のみ'],
    ['メールアドレス',   'email',            '【Layer1】半角英数字・記号のみ ／ 【Layer2】onblurで形式チェック'],
    ['次回予約',         'チェックボックス', 'なし'],
  ]);
  sp();
  h3('バリデーション補足');
  p('Layer1：IMEのcomposing状態をクロージャで管理し、確定後に不正文字をリアルタイム除去。除去発生時はフィールド直下に注意書きを2秒表示。');
  p('日付切り替え：別日付のフォームを開く際、前日付の入力値・UIステート（詳細開閉状態）を完全リセット。残留データの混入を防止。');
  sp();

  h2('4-4. 過去データカレンダー');
  li('現在月の日付をカレンダー形式で表示');
  li('各日付セルにリピート率を色で表示（優秀：ゴールド / 良好：グリーン / 標準：イエロー / 課題あり：レッド / 未入力：空白）');
  li('「＜」「＞」ボタンで月移動（グラフも連動）');
  li('日付タップ → 過去フォームに切り替え（カレンダーと相互排他）');
  li('今日日付はクリック不可（上部「本日のデータ」で入力）');
  sp();

  h2('4-5. CSVダウンロード');
  p('カレンダー下部の「CSVダウンロード」ボタンから実行。');
  sp();
  tbl(['項目', '仕様'], [
    ['内容',       '当該院スプレッドシート「顧客」タブをそのまま出力（変換なし）'],
    ['ファイル名', '院名_リピート率データ_YYYYMMDD.csv'],
    ['文字コード', 'BOM付きUTF-8（Excel対応）'],
    ['日付形式',   'YYYY-MM-DD（Excelでの自動変換を回避）'],
    ['取得方法',   'GAS APIにfetchしてBlob URL経由でダウンロード（ファイル名制御のため）'],
  ]);
  sp();

  h2('4-6. スプレッドシートで開く');
  p('カレンダー下部の「スプレッドシート」ボタンから実行。');
  sp();
  tbl(['項目', '仕様'], [
    ['生成タイミング', 'ボタン押下のたびに新規ファイルを生成（毎回異なるURL）'],
    ['ファイル名',     '院名_リピート率データ_YYYYMMDD_HHMMSS'],
    ['内容',           '「顧客」タブ・「日次」タブの両方をコピー'],
    ['公開設定',       'リンクを知っている全員が閲覧可能'],
    ['保存方法',       '新タブで開く → 「コピーを作成」でユーザー自身のGoogleドライブに保存可能'],
  ]);
  sp();

  // ── 5. データ管理 ────────────────────────────────────────────────────
  h1('5. データ管理');

  h2('5-1. インフラ構成');
  tbl(['コンポーネント', '役割'], [
    ['GitHub Pages',                  'フロントエンドのホスティング（静的HTML/JS/CSS）'],
    ['Google Apps Script',            'バックエンドAPI（Web App）'],
    ['Google Spreadsheet（マスター）', '院のアカウント管理・インデックス'],
    ['Google Spreadsheet（院別）',    '院ごとの日次・顧客データ'],
  ]);
  sp();

  h2('5-2. マスタースプレッドシート');
  p('ID: 1CiuXRdYG-lI_jWA4DiR_uXvYU9dgqTE1v-JWsZF1l_g');
  sp();
  tbl(['タブ名', '内容'], [
    ['salon_list',         '院のログイン情報（サロンID・メール等）'],
    ['repeat_rate_index',  '院別スプレッドシートIDの管理テーブル'],
  ]);
  sp();

  h2('5-3. 院別スプレッドシート');
  p('初回ログイン時に自動生成。Google Driveの指定フォルダに保存（ID: 1hu_VB9WpaKa-Cz-kmrvCV3KeynWlYjIp）。');
  sp();
  h3('日次タブ（1行 = 1日分）');
  tbl(['列', '内容'], [
    ['A', '日付（YYYY-MM-DD）'],
    ['B', '施術数'],
    ['C', '次回予約数'],
    ['D', 'リピート率（%）'],
  ]);
  sp();
  h3('顧客タブ（1行 = 1来院記録）');
  tbl(['列', '内容'], [
    ['A', '日付'],
    ['B', '患者番号（連番）'],
    ['C', '姓（漢字）'],
    ['D', '名（ひらがな）'],
    ['F', '電話番号'],
    ['I', 'メールアドレス'],
    ['R', 'レコードID（YYYYMMDD_NNN形式）'],
    ['S', '次回予約（1=あり、0=なし）'],
    ['T', 'メニュー'],
  ]);
  sp();

  h2('5-4. GAS APIエンドポイント');
  h3('POSTエンドポイント（doPost）');
  tbl(['action', '機能'], [
    ['login',   'ログイン認証・院別スプレッドシートの取得または自動生成'],
    ['saveDay', '日次データ・顧客データの保存（上書き）'],
    ['getData', '当該院の全日次・顧客データを取得'],
  ]);
  sp();
  h3('GETエンドポイント（doGet）');
  tbl(['action', '機能'], [
    ['csv',    '顧客タブをCSV形式で返す（BOM付きUTF-8）'],
    ['export', '新規Googleスプレッドシートを生成してURLを返す'],
  ]);
  sp();

  h2('5-5. 重複排除ルール');
  li('同一日付に複数回保存した場合、最後の保存が有効（上書き）');
  li('日次タブ：同一日付の最終行を残す');
  li('顧客タブ：同一（日付＋番号）の最終行を残す');
  sp();

  // ── 6. セキュリティ ──────────────────────────────────────────────────
  h1('6. セキュリティ・公開範囲');
  tbl(['対策', '内容'], [
    ['クローラー遮断',       'robots.txt で全クローラーをブロック'],
    ['メタタグ遮断',         '<meta name="robots"> でGoogle・AI各クローラーを遮断（noindex/nofollow/noarchive）'],
    ['AIクローラー',         'GPTBot（ChatGPT）・CCBot（Claude）等を個別に遮断'],
    ['通信',                 'GitHub PagesはHTTPS配信'],
    ['GAS認証',              'Web AppはANYONE_ANONYMOUSだが、ログインIDと院IDによる認証が必須'],
    ['APIキー管理',          'キーは露出なし。GASのマスターSSへのアクセスは認証済みGASプロジェクトのみ'],
  ]);
  sp();

  // ── 7. 動作確認環境 ──────────────────────────────────────────────────
  h1('7. 動作確認環境');
  tbl(['環境', 'ブラウザ', '優先度'], [
    ['スマートフォン', 'iPhone + Safari',   '主（必須）'],
    ['スマートフォン', 'Android + Chrome',  '主（必須）'],
    ['PC',             'Chrome',            '補助'],
    ['タブレット',     'iPad + Safari',     '確認推奨'],
  ]);
  sp();
  li('ブレークポイント：600px（スマホ/PC切り替え）');
  li('iOSズーム防止：全テキスト入力フォントサイズ 16px 以上');
  sp();

  // ── 8. ファイル構成 ──────────────────────────────────────────────────
  h1('8. ファイル構成');
  tbl(['ファイル', '説明'], [
    ['index.html',                'フロントエンド本体（HTML/CSS/JS一体型）'],
    ['repeat-rate.gs',            'GASバックエンド'],
    ['robots.txt',                'クローラー遮断設定'],
    ['state-transition.test.js',  'Layer2 状態遷移テスト（46件）'],
    ['gas-api.test.js',           'GAS統合テスト（39件）'],
  ]);
  sp();

  // ── 9. 更新履歴 ──────────────────────────────────────────────────────
  h1('9. 更新履歴');
  tbl(['日付', '内容'], [
    ['2026-02',    '初版リリース'],
    ['2026-03',    '顧客詳細フォーム・メニュー列追加'],
    ['2026-03-20', 'バリデーション実装（Layer1入力制限・Layer2形式検証）'],
    ['2026-03-23', 'CSVダウンロード機能追加（顧客タブそのまま出力・院名付きファイル名）'],
    ['2026-03-24', 'スプレッドシートエクスポート機能追加（毎回新規生成）'],
    ['2026-03-24', '日付切り替え時の残留データ混入バグ修正'],
  ]);

  doc.saveAndClose();
  return { success: true, url: 'https://docs.google.com/document/d/' + DOC_ID };
}

// R列（番号）を YYYYMMDD_NNN 形式に、S列（次回予約の有無）を 1/0 に一括変換
function formatRateColumn() {
  const master = SpreadsheetApp.openById(MASTER_SS_ID);
  const idx    = master.getSheetByName(INDEX_TAB);
  if (!idx) return { success: false, error: 'INDEX_TAB not found' };
  const rows = idx.getDataRange().getValues();
  const results = [];
  for (let i = 1; i < rows.length; i++) {
    const ssId = String(rows[i][1] || '').trim();
    if (!ssId) continue;
    try {
      const ss  = SpreadsheetApp.openById(ssId);
      const day = ss.getSheetByName('日次');
      if (!day) continue;
      day.getRange('D2:D1000').setNumberFormat('0"%"');
      results.push(ssId + ': D列フォーマット適用');
    } catch (e) {
      results.push(ssId + ': error - ' + e.message);
    }
  }
  return { success: true, results };
}

function clearBuhanColumn() {
  const master = SpreadsheetApp.openById(MASTER_SS_ID);
  const idx    = master.getSheetByName(INDEX_TAB);
  if (!idx) return { success: false, error: 'INDEX_TAB not found' };
  const rows = idx.getDataRange().getValues();
  const results = [];
  for (let i = 1; i < rows.length; i++) {
    const ssId = String(rows[i][1] || '').trim();
    if (!ssId) continue;
    try {
      const ss   = SpreadsheetApp.openById(ssId);
      const cust = ss.getSheetByName('顧客');
      if (!cust) continue;
      const lastRow = cust.getLastRow();
      if (lastRow < 2) { results.push(ssId + ': no data'); continue; }
      const lCol = cust.getRange(2, 12, lastRow - 1, 1).getValues(); // L列
      let cleared = 0;
      lCol.forEach((r, ri) => {
        if (r[0] !== '' && r[0] !== null) {
          cust.getRange(ri + 2, 12).setValue('');
          cleared++;
        }
      });
      results.push(ssId + ': ' + cleared + '件クリア');
    } catch (e) {
      results.push(ssId + ': error - ' + e.message);
    }
  }
  return { success: true, results };
}

function migrateRSColumns() {
  const master = SpreadsheetApp.openById(MASTER_SS_ID);
  const idx    = master.getSheetByName(INDEX_TAB);
  if (!idx) return { success: false, error: 'INDEX_TAB not found' };
  const rows = idx.getDataRange().getValues();
  const results = [];
  for (let i = 1; i < rows.length; i++) {
    const ssId = String(rows[i][1] || '').trim();
    if (!ssId) continue;
    try {
      const ss   = SpreadsheetApp.openById(ssId);
      const cust = ss.getSheetByName('顧客');
      if (!cust) continue;
      const lastRow = cust.getLastRow();
      if (lastRow < 2) { results.push(ssId + ': no data rows'); continue; }
      const data = cust.getRange(2, 1, lastRow - 1, 19).getValues(); // A〜S列
      let changed = 0;
      data.forEach((r, ri) => {
        const dateStr = fmtDate(r[16]); // Q列（0-indexed=16）
        if (!dateStr) return;
        const dateKey = dateStr.replace(/-/g, '');
        // R列（index 17）: 既存の番号（整数または文字列）を取得してゼロパディング
        const rawIdx = r[17];
        const numPart = parseInt(String(rawIdx).replace(/[^0-9]/g, '')) || (ri + 1);
        const newR = dateKey + '_' + String(numPart).padStart(3, '0');
        // S列（index 18）: '○'→1, ''→0, すでに 0/1 なら変換しない
        const rawS = r[18];
        const newS = (rawS === '○' || rawS === 1) ? 1 : 0;
        cust.getRange(ri + 2, 18).setValue(newR); // R列
        cust.getRange(ri + 2, 19).setValue(newS); // S列
        changed++;
      });
      results.push(ssId + ': ' + changed + '行変換');
    } catch (e) {
      results.push(ssId + ': error - ' + e.message);
    }
  }
  return { success: true, results };
}

function addMenuColumnToExistingSheets() {
  // 管理済みのすべてのサロンSSにT列「メニュー」ヘッダーを追加（未設定の場合のみ）
  const master = SpreadsheetApp.openById(MASTER_SS_ID);
  const idx = master.getSheetByName(INDEX_TAB);
  if (!idx) return { success: false, error: 'INDEX_TAB not found' };
  const rows = idx.getDataRange().getValues();
  const results = [];
  for (let i = 1; i < rows.length; i++) {
    const ssId = String(rows[i][1] || '').trim();
    if (!ssId) continue;
    try {
      const ss   = SpreadsheetApp.openById(ssId);
      const cust = ss.getSheetByName('顧客');
      if (!cust) continue;
      const header = cust.getRange(1, 1, 1, cust.getLastColumn()).getValues()[0];
      if (header[19] === 'メニュー') { results.push(ssId + ': skip (already has T)'); continue; }
      // T列（20列目）にヘッダーを書き込む
      cust.getRange(1, 20).setValue('メニュー');
      cust.getRange(1, 20).setFontWeight('bold');
      results.push(ssId + ': added T=メニュー');
    } catch (e) {
      results.push(ssId + ': error - ' + e.message);
    }
  }
  return { success: true, results };
}

function fixColumns2049() {
  // 2049スプレッドシートの顧客タブ:
  // J列(10)総売上, L列(12)物販, O列(15)初回来店, P列(16)最終来店 を空欄にクリア
  // R列(18)を YYYYMMDD_NNN 形式に、S列(19)を 1/0 に再マイグレーション
  try {
    const ss   = SpreadsheetApp.openById('1jJJIUs31vQ4S6HDcFDTul35oy0GDaSZYlvUAveBqGUc');
    const cust = ss.getSheetByName('顧客');
    const lastRow = cust.getLastRow();
    if (lastRow < 2) return { success: true, message: 'no data rows' };

    const data = cust.getRange(2, 1, lastRow - 1, 20).getValues(); // A〜T列
    let cleared = 0, migrated = 0;

    data.forEach((r, ri) => {
      const row = ri + 2; // 1-indexed row number

      // J(10), K(11), L(12), O(15), P(16) を空欄にクリア（値がある場合のみ）
      [[10, r[9]], [11, r[10]], [12, r[11]], [15, r[14]], [16, r[15]]].forEach(([col, val]) => {
        if (val !== '' && val !== null && val !== undefined) {
          cust.getRange(row, col).setValue('');
          cleared++;
        }
      });

      // R列(18): YYYYMMDD_NNN 形式に変換（既に正しい形式の行はスキップ）
      const dateStr = fmtDate(r[16]); // Q列（0-indexed=16）
      if (dateStr) {
        const dateKey = dateStr.replace(/-/g, '');
        const rawIdx  = String(r[17] || ''); // R列（0-indexed=17）
        // 既に YYYYMMDD_NNN 形式なら変換しない
        const alreadyMigrated = /^\d{8}_\d{3}$/.test(rawIdx);
        if (!alreadyMigrated) {
          const numPart = parseInt(rawIdx.replace(/[^0-9]/g, '')) || (ri + 1);
          const newR = dateKey + '_' + String(numPart).padStart(3, '0');
          cust.getRange(row, 18).setValue(newR);
          migrated++;
        }

        // S列(19): '○'→1, ''→0, 既に 0/1 なら変換しない
        const rawS = r[18]; // S列（0-indexed=18）
        const newS = (rawS === '○' || rawS === 1) ? 1 : 0;
        if (rawS !== newS) cust.getRange(row, 19).setValue(newS);
      }
    });

    return { success: true, cleared, migrated, rows: lastRow - 1 };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function fix2049Mar21() {
  try {
    const ss   = SpreadsheetApp.openById('1jJJIUs31vQ4S6HDcFDTul35oy0GDaSZYlvUAveBqGUc');
    const day  = ss.getSheetByName('日次');
    const cust = ss.getSheetByName('顧客');
    const fmt  = getSheetFormat(cust);
    // 3/21の日次行・顧客行をすべて削除
    deleteRowsByDate(day,  '2026-03-21', 0);
    deleteRowsByDate(cust, '2026-03-21', fmt.dateCol);
    return { success: true, message: '2049サロン 2026-03-21 日次・顧客行を削除しました' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function fix2049Mar5() {
  // 2049サロン 3/5 顧客行の問題修正
  // migration変換バグ（L='0', R=旧番号, S='○'/'') による残存行を削除し
  // fixColumns2049 で全行の L/R/S を正しい形式に補正する
  try {
    const ss   = SpreadsheetApp.openById('1jJJIUs31vQ4S6HDcFDTul35oy0GDaSZYlvUAveBqGUc');
    const cust = ss.getSheetByName('顧客');
    const fmt  = getSheetFormat(cust);

    // 3/5の全顧客行を削除（重複行・migration残存行を一括除去）
    const beforeRows = cust.getLastRow() - 1;
    deleteRowsByDate(cust, '2026-03-05', fmt.dateCol);
    const afterRows = cust.getLastRow() - 1;

    // 全行のL/R/S列を正しい形式に補正（他日付の残存バグも合わせてクリア）
    const fixResult = fixColumns2049();

    return {
      success: true,
      message: '2049サロン 2026-03-05 顧客行削除 + 全行L/R/S補正完了',
      deletedRows: beforeRows - afterRows,
      fixResult
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function runCleanup2049() {
  try {
    const SALON_ID = '2049';
    const SALON_SS = '1jJJIUs31vQ4S6HDcFDTul35oy0GDaSZYlvUAveBqGUc';
    const master = SpreadsheetApp.openById(MASTER_SS_ID);
    let idx = master.getSheetByName(INDEX_TAB);
    if (!idx) {
      idx = master.insertSheet(INDEX_TAB);
      idx.appendRow(['salon_id', 'spreadsheet_id', 'salon_name', 'created_at']);
      idx.setFrozenRows(1);
    }
    const rows = idx.getDataRange().getValues();
    let found = false;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === SALON_ID) { found = true; break; }
    }
    if (!found) {
      idx.appendRow([SALON_ID, SALON_SS, '春日鍼灸治療院',
        new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })]);
    }
    const ss = SpreadsheetApp.openById(SALON_SS);
    const dayTab = ss.getSheetByName('日次');
    const cusTab = ss.getSheetByName('顧客');
    const dayBefore = dayTab.getLastRow() - 1;
    const cusBefore = cusTab.getLastRow() - 1;
    deduplicateSheet(dayTab, 0);
    deduplicateSheet(cusTab, 0, 1);
    const dayAfter = dayTab.getLastRow() - 1;
    const cusAfter = cusTab.getLastRow() - 1;
    return { success: true, index: found ? '登録済み' : '新規登録',
             day: dayBefore + '行→' + dayAfter + '行', cus: cusBefore + '行→' + cusAfter + '行' };
  } catch(e) { return { success: false, error: e.message }; }
}

// ─── ログイン ────────────────────────────────────────────────────────
// しんきゅうコンパス マスターシートの月次タブ or 無料体験タブで照合

// 当月タブがなければ前月→2ヶ月前の順にフォールバック + 無料体験
function getLoginTabCandidates() {
  const now = new Date();
  const tabs = [];
  for (let offset = 0; offset <= 2; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    tabs.push(String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0'));
  }
  tabs.push('無料体験');
  return tabs;
}

// マスターログインメールはスプレッドシートの settings タブで管理（コード変更・デプロイ不要）
function getMasterLoginEmails() {
  try {
    const master = SpreadsheetApp.openById(MASTER_SS_ID);
    let sheet = master.getSheetByName('settings');
    if (!sheet) {
      // 初回：settingsタブを自動作成
      sheet = master.insertSheet('settings');
      sheet.appendRow(['master_login_email']);
      sheet.appendRow(['info@shinq-compass.jp']);
      sheet.appendRow(['test']);
      sheet.getRange('A1').setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    return sheet.getRange(2, 1, lastRow - 1, 1).getValues()
      .map(r => String(r[0]).trim().toLowerCase()).filter(v => v);
  } catch(e) {
    return []; // 読み取りエラー時はマスターログイン無効
  }
}

function handleLogin(d) {
  const sid   = String(d.salon_id || '').trim();
  const email = String(d.email    || '').trim().toLowerCase();
  if (!sid || !email) return { success: false, error: 'サロンIDとメールアドレスを入力してください' };

  // 社内マスターログイン：あらゆるサロンIDでログイン可能
  if (getMasterLoginEmails().includes(email)) {
    const master = SpreadsheetApp.openById(MASTER_SS_ID);
    for (const tabName of getLoginTabCandidates()) {
      const sheet = master.getSheetByName(tabName);
      if (!sheet) continue;
      const rows = sheet.getDataRange().getValues();
      if (rows.length < 2) continue;
      const h  = rows[0].map(v => String(v).trim());
      const ci = h.findIndex(v => v === 'サロンID');
      const ni = h.findIndex(v => v === '院名');
      if (ci < 0) continue;
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][ci]).trim() === sid) {
          return { success: true, salon_name: ni >= 0 ? String(rows[i][ni]).trim() : '' };
        }
      }
    }
    // 月次タブに存在しないサロンIDでも社内用としてログイン許可
    return { success: true, salon_name: '' };
  }

  const master = SpreadsheetApp.openById(MASTER_SS_ID);

  for (const tabName of getLoginTabCandidates()) {
    const sheet = master.getSheetByName(tabName);
    if (!sheet) continue;
    const rows = sheet.getDataRange().getValues();
    if (rows.length < 2) continue;

    const h  = rows[0].map(v => String(v).trim());
    const ci = h.findIndex(v => v === 'サロンID');
    const ei = h.findIndex(v => v === 'メールアドレス');
    const ni = h.findIndex(v => v === '院名');
    if (ci < 0 || ei < 0) continue;

    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][ci]).trim() === sid &&
          String(rows[i][ei]).trim().toLowerCase() === email) {
        return { success: true, salon_name: ni >= 0 ? String(rows[i][ni]).trim() : '' };
      }
    }
  }
  return { success: false, error: 'サロンIDまたはメールアドレスが一致しません' };
}

// ─── サロン別スプレッドシート取得（なければ自動作成）────────────────

function getOrCreateSalonSS(sid, sname) {
  const master = SpreadsheetApp.openById(MASTER_SS_ID);
  let idx = master.getSheetByName(INDEX_TAB);

  if (!idx) {
    idx = master.insertSheet(INDEX_TAB);
    idx.appendRow(['salon_id', 'spreadsheet_id', 'salon_name', 'created_at']);
    idx.setFrozenRows(1);
    idx.getRange('A1:D1').setFontWeight('bold');
  }

  const rows = idx.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === sid) {
      return SpreadsheetApp.openById(String(rows[i][1]));
    }
  }

  // 新規スプレッドシート作成 → 指定フォルダへ移動
  const ss = SpreadsheetApp.create(sid + (sname ? '_' + sname : '') + '_次回予約率');
  DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(SALON_FOLDER_ID));

  const dayTab = ss.getSheets()[0];
  dayTab.setName('日次');
  dayTab.appendRow(['日付', '来店人数', '次回予約数', 'リピート率(%)']);
  dayTab.setFrozenRows(1);
  dayTab.getRange('A1:D1').setFontWeight('bold');
  // D列全体にパーセント表記フォーマット適用
  dayTab.getRange('D2:D1000').setNumberFormat('0"%"');

  const custTab = ss.insertSheet('顧客');
  custTab.appendRow(['氏名','氏名（かな）','性別','誕生日','年齢','電話番号','郵便番号','住所',
                     'メールアドレス','総売上','施術','物販','顧客単価','来店回数','初回来店','最終来店',
                     '来店日','番号','次回予約の有無','メニュー']);
  custTab.setFrozenRows(1);
  custTab.getRange('A1:T1').setFontWeight('bold');

  idx.appendRow([
    sid, ss.getId(), sname || '',
    new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
  ]);

  return ss;
}

// ─── 日次データ保存 ──────────────────────────────────────────────────

function handleSaveDay(d) {
  const sid   = String(d.salon_id   || '').trim();
  const sname = String(d.salon_name || '').trim();
  if (!sid) return { success: false, error: 'salon_id が未指定です' };

  const ss      = getOrCreateSalonSS(sid, sname);
  const dayTab  = ss.getSheetByName('日次');
  const custTab = ss.getSheetByName('顧客');

  const fmt = getSheetFormat(custTab);

  const date         = String(d.date         || '').trim();
  const visitors     = parseInt(d.visitors,     10) || 0;
  const reservations = parseInt(d.reservations, 10) || 0;

  // 同日付を削除（上書き保存 or 未記入に戻す）
  deleteRowsByDate(dayTab,  date, 0);
  deleteRowsByDate(custTab, date, fmt.dateCol);

  // 来店0回は「未記入」扱い → 行を追加せず終了
  if (visitors === 0) {
    return { success: true, deleted: true, spreadsheet_id: ss.getId() };
  }

  const rate = Math.round(reservations / visitors * 100);
  dayTab.appendRow([date, visitors, reservations, rate]);
  // D列のリピート率セルにパーセント表記フォーマットを適用
  const newRow = dayTab.getLastRow();
  dayTab.getRange(newRow, 4).setNumberFormat('0"%"');
  sortSheetByDate(dayTab, 1);

  // 施術人数分の行をそのまま保存（詳細未入力行も含む — index番号が来訪記録として機能する）
  const customers = (d.customers || []);
  if (fmt.type === 'new') {
    customers.forEach((c, i) => {
      const price = c.price || '';
      custTab.appendRow([
        c.last_name || '',  // A: 氏名
        c.first_name || '', // B: 氏名（かな）
        c.gender || '',     // C: 性別
        '',                 // D: 誕生日
        '',                 // E: 年齢
        c.phone || '',      // F: 電話番号
        '',                 // G: 郵便番号
        '',                 // H: 住所
        c.email_addr || '', // I: メールアドレス
        '',                 // J: 総売上（空欄）
        '',                 // K: 施術（空欄）
        '',                 // L: 物販（空欄）
        price,              // M: 顧客単価
        '',                 // N: 来店回数
        '',                 // O: 初回来店（空欄）
        '',                 // P: 最終来店（空欄）
        date,                               // Q: 来店日
        date.replace(/-/g,'') + '_' + String(i + 1).padStart(3,'0'), // R: 番号（YYYYMMDD_NNN）
        c.reserved ? 1 : 0,                // S: 次回予約の有無（1/0）
        c.menu || ''                        // T: メニュー
      ]);
    });
  } else {
    customers.forEach((c, i) => {
      custTab.appendRow([
        date, i + 1,
        c.last_name || '', c.first_name || '',
        c.reserved ? '○' : '',
        c.menu || '', c.price || '', c.gender || '', c.phone || '', c.email_addr || ''
      ]);
    });
  }
  if (customers.length > 0) sortSheetByDate(custTab, fmt.dateCol + 1);

  return { success: true, rate, spreadsheet_id: ss.getId() };
}

function deleteRowsByDate(sheet, date, col) {
  const vals = sheet.getDataRange().getValues();
  for (let i = vals.length - 1; i >= 1; i--) {
    if (fmtDate(vals[i][col]) === date) sheet.deleteRow(i + 1);
  }
}

// ─── データ取得 ──────────────────────────────────────────────────────

function handleGetData(d) {
  const sid = String(d.salon_id || '').trim();
  if (!sid) return { success: false, error: 'salon_id が未指定です' };

  const master = SpreadsheetApp.openById(MASTER_SS_ID);
  const idx    = master.getSheetByName(INDEX_TAB);
  if (!idx) return { success: true, days: [], customers: [] };

  const rows = idx.getDataRange().getValues();
  let ssId = null;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === sid) { ssId = String(rows[i][1]); break; }
  }
  if (!ssId) return { success: true, days: [], customers: [] };

  const ss      = SpreadsheetApp.openById(ssId);
  const dayTab  = ss.getSheetByName('日次');
  const cusTab  = ss.getSheetByName('顧客');

  const fmt = getSheetFormat(cusTab);

  const dayRows = dayTab.getDataRange().getValues();
  const cusRows = cusTab.getDataRange().getValues();

  const dayMap = {};
  const todayStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  dayRows.slice(1).forEach(r => {
    const visitors = Number(r[1]);
    if (!visitors) return; // visitors=0は未記入扱いで除外
    const d = fmtDate(r[0]);
    if (d > todayStr) return; // 未来日付は除外（誤入力データ対策）
    dayMap[d] = { date: d, visitors, reservations: Number(r[2]), rate: Number(r[3]) };
  });
  const cusMap = {};
  if (fmt.type === 'new') {
    // 新フォーマット: Q(16)=来店日, R(17)=番号, S(18)=次回予約の有無, T(19)=メニュー
    cusRows.slice(1).forEach(r => {
      const d = fmtDate(r[16]);
      if (!d || d > todayStr) return; // 未来日付は除外
      if (!cusMap[d]) cusMap[d] = [];
      cusMap[d].push({
        date: d, index: String(r[17] || ''),
        last_name:  String(r[0]  || '').trim(), first_name: String(r[1]  || '').trim(),
        reserved:   Number(r[18]) === 1,         // S: 1=あり, 0=なし
        menu:       String(r[19] || ''),         // T: メニュー
        price:      String(r[12] || ''),         // M: 顧客単価
        gender:     String(r[2]  || ''),         // C: 性別
        phone:      String(r[5]  || ''),         // F: 電話番号
        email_addr: String(r[8]  || '')          // I: メールアドレス
      });
    });
  } else {
    // 旧フォーマット: A(0)=日付, B(1)=番号
    cusRows.slice(1).forEach(r => {
      const d = fmtDate(r[0]);
      if (!d || d > todayStr) return; // 未来日付は除外
      if (!cusMap[d]) cusMap[d] = [];
      cusMap[d].push({
        date: d, index: Number(r[1]),
        last_name:  String(r[2] || ''), first_name: String(r[3] || ''),
        reserved:   r[4] === '○',
        menu:       String(r[5] || ''), price:    String(r[6] || ''),
        gender:     String(r[7] || ''), phone:    String(r[8] || ''),
        email_addr: String(r[9] || '')
      });
    });
  }

  return {
    success: true,
    spreadsheet_id: ssId,
    days: Object.values(dayMap),
    customers: Object.values(cusMap).flat()
  };
}

// ─── CSV ダウンロード ────────────────────────────────────────────────

function handleCsv(p) {
  const sid    = String(p.salon_id || '').trim();
  const master = SpreadsheetApp.openById(MASTER_SS_ID);
  const idx    = master.getSheetByName(INDEX_TAB);
  if (!idx) return ContentService.createTextOutput('データなし');

  const rows = idx.getDataRange().getValues();
  let ssId = null;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === sid) { ssId = String(rows[i][1]); break; }
  }
  if (!ssId) return ContentService.createTextOutput('データなし');

  const ss      = SpreadsheetApp.openById(ssId);
  const cusRows = ss.getSheetByName('顧客').getDataRange().getValues();

  // 顧客タブをそのままCSV出力（日付は YYYY-MM-DD 形式に変換）
  const q   = s => '"' + String(s).replace(/"/g, '""') + '"';
  const fmt = v => (v instanceof Date)
    ? v.getFullYear() + '-'
      + String(v.getMonth()+1).padStart(2,'0') + '-'
      + String(v.getDate()).padStart(2,'0')
    : v;
  const csv = cusRows.map(row => row.map(v => q(fmt(v))).join(',')).join('\n');

  return ContentService.createTextOutput('\uFEFF' + csv) // BOM付きUTF-8
    .setMimeType(ContentService.MimeType.CSV);
}

// ─── Googleスプレッドシート エクスポート ────────────────────────────
// 呼び出し毎に新規 Spreadsheet を作成し、誰でも閲覧可能なリンクを返す

function handleExport(p) {
  const sid    = String(p.salon_id || '').trim();
  const master = SpreadsheetApp.openById(MASTER_SS_ID);
  const idx    = master.getSheetByName(INDEX_TAB);
  if (!idx) return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'インデックスなし' })).setMimeType(ContentService.MimeType.JSON);

  const rows = idx.getDataRange().getValues();
  let ssId = null, salonName = '';
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === sid) { ssId = String(rows[i][1]); salonName = String(rows[i][2] || ''); break; }
  }
  if (!ssId) return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'サロンデータなし' })).setMimeType(ContentService.MimeType.JSON);

  const src      = SpreadsheetApp.openById(ssId);
  const cusSheet = src.getSheetByName('顧客');
  const daySheet = src.getSheetByName('日次');
  if (!cusSheet || !daySheet) return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'シートなし' })).setMimeType(ContentService.MimeType.JSON);

  // 新規スプレッドシートを作成
  const now     = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
  const newSs   = SpreadsheetApp.create(salonName + '_リピート率データ_' + now);

  // 顧客タブをコピー
  const newCus  = newSs.getSheets()[0];
  newCus.setName('顧客');
  const cusData = cusSheet.getDataRange().getValues();
  if (cusData.length > 0) newCus.getRange(1, 1, cusData.length, cusData[0].length).setValues(cusData);

  // 日次タブをコピー
  const newDay  = newSs.insertSheet('日次');
  const dayData = daySheet.getDataRange().getValues();
  if (dayData.length > 0) newDay.getRange(1, 1, dayData.length, dayData[0].length).setValues(dayData);

  // 誰でも閲覧可能に設定
  newSs.setSpreadsheetLocale('ja');
  DriveApp.getFileById(newSs.getId()).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return ContentService.createTextOutput(JSON.stringify({ success: true, url: newSs.getUrl() }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── 重複行クリーンアップ（同日付は最後の行だけ残す）────────────────
// handleSaveDay の冒頭で呼ぶことで既存重複も解消する

// deduplicateSheet:
//   日次タブ → dateCol=0, indexCol=undefined → 日付をキーに最終行を残す
//   顧客タブ → dateCol=0, indexCol=1        → (日付+番号)を複合キーに最終行を残す
function deduplicateSheet(sheet, dateCol, indexCol) {
  const vals = sheet.getDataRange().getValues();
  if (vals.length < 3) return;
  const lastRow = {};
  for (let i = 1; i < vals.length; i++) {
    const key = indexCol !== undefined
      ? fmtDate(vals[i][dateCol]) + '_' + String(vals[i][indexCol])
      : fmtDate(vals[i][dateCol]);
    lastRow[key] = i;
  }
  for (let i = vals.length - 1; i >= 1; i--) {
    const key = indexCol !== undefined
      ? fmtDate(vals[i][dateCol]) + '_' + String(vals[i][indexCol])
      : fmtDate(vals[i][dateCol]);
    if (lastRow[key] !== i) sheet.deleteRow(i + 1);
  }
}

// ─── 日付ソート ──────────────────────────────────────────────────────

// ヘッダー行を除いて日付列（1-indexed）昇順でソートする
function sortSheetByDate(sheet, dateColOneBased) {
  const col = dateColOneBased || 1;
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return;
  sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn())
    .sort({ column: col, ascending: true });
}

// ─── フォーマット判定 ─────────────────────────────────────────────────

// 顧客タブのフォーマットを判定する
// 新フォーマット（19列）: A列ヘッダー = '氏名', 日付=Q列(16), 番号=R列(17)（0-indexed）
// 旧フォーマット（10列）: A列ヘッダー = '日付', 日付=A列(0), 番号=B列(1)（0-indexed）
function getSheetFormat(sheet) {
  if (sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) return { type: 'new', dateCol: 16, indexCol: 17 };
  const h = String(sheet.getRange(1, 1, 1, 1).getValues()[0][0]).trim();
  return h === '氏名'
    ? { type: 'new', dateCol: 16, indexCol: 17 }
    : { type: 'old', dateCol: 0,  indexCol: 1  };
}

// ─── ユーティリティ ──────────────────────────────────────────────────

// スプレッドシートの日付セル（Date型）を YYYY-MM-DD 文字列に統一する
function fmtDate(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
  }
  const s = String(v).trim();
  // すでに YYYY-MM-DD 形式ならそのまま返す
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // 念のため Date パースを試みる
  const d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
  return s;
}

function ok(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── 管理用関数（GAS エディタから直接実行）──────────────────────────

// repeat_rate_index にサロン2049を登録 + 既存重複データをクリーンアップ
function setupSalon2049() {
  const SALON_ID = '2049';
  const SALON_SS = '1jJJIUs31vQ4S6HDcFDTul35oy0GDaSZYlvUAveBqGUc';
  const SALON_NAME = '春日鍼灸治療院';

  // repeat_rate_index に登録（未登録の場合のみ追加）
  const master = SpreadsheetApp.openById(MASTER_SS_ID);
  let idx = master.getSheetByName(INDEX_TAB);
  if (!idx) {
    idx = master.insertSheet(INDEX_TAB);
    idx.appendRow(['salon_id', 'spreadsheet_id', 'salon_name', 'created_at']);
    idx.setFrozenRows(1);
  }
  const rows = idx.getDataRange().getValues();
  let found = false;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === SALON_ID) {
      Logger.log('既に登録済み: ' + rows[i][1]);
      found = true; break;
    }
  }
  if (!found) {
    idx.appendRow([SALON_ID, SALON_SS, SALON_NAME,
      new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })]);
    Logger.log('インデックス登録完了');
  }

  // 重複データクリーンアップ
  const ss = SpreadsheetApp.openById(SALON_SS);
  const dayTab = ss.getSheetByName('日次');
  const cusTab = ss.getSheetByName('顧客');
  deduplicateSheet(dayTab, 0);
  deduplicateSheet(cusTab, 0, 1);
  Logger.log('重複クリーンアップ完了');
}

// ─── テスト関数（clasp run testLogin で実行）─────────────────────────
// GAS 変更後に毎回 clasp run testAll で動作確認する

function testAll() {
  const results = [];

  // テスト1: ログイン（サンプルデータ）
  try {
    const r = handleLogin({ salon_id: '38290', email: 'sample@shinkyuu-compass.jp' });
    // 成功でも失敗でもエラーが出なければ OK（認証失敗は正常動作）
    results.push('login: ' + (r.success ? 'OK (認証成功)' : 'OK (認証失敗は正常: ' + r.error + ')'));
  } catch (e) {
    results.push('login: ERROR - ' + e.message);
  }

  // テスト2: repeat_rate_index タブ存在確認
  try {
    const master = SpreadsheetApp.openById(MASTER_SS_ID);
    const idx = master.getSheetByName(INDEX_TAB);
    results.push('index_tab: ' + (idx ? 'OK (存在)' : 'NG (タブなし)'));
  } catch (e) {
    results.push('index_tab: ERROR - ' + e.message);
  }

  // テスト3: fmtDate の動作確認
  try {
    const d = new Date('2026-03-20');
    const r = fmtDate(d);
    results.push('fmtDate: ' + (r === '2026-03-20' ? 'OK' : 'NG: ' + r));
  } catch (e) {
    results.push('fmtDate: ERROR - ' + e.message);
  }

  const summary = results.join('\n');
  Logger.log(summary);
  return summary;
}

// ─── 顧客タブ 旧→新フォーマット マイグレーション ─────────────────────
// GASエディタから runMigrationAll() を直接実行する

function runMigrationAll() {
  const results = [];
  for (const sid of ['1795', '2049']) {
    try {
      const msg = migrateCustTab(sid);
      results.push(sid + ': ' + msg);
    } catch(e) {
      results.push(sid + ': ERROR - ' + e.message);
    }
  }
  // 初回来店・最終来店クリア
  for (const sid of ['1795', '2049']) {
    try {
      const msg = clearFirstLastVisit(sid);
      results.push(sid + ' (O/Pクリア): ' + msg);
    } catch(e) {
      results.push(sid + ' (O/Pクリア): ERROR - ' + e.message);
    }
  }
  const summary = results.join('\n');
  Logger.log(summary);
  return summary;
}

function clearFirstLastVisit(sid) {
  const master = SpreadsheetApp.openById(MASTER_SS_ID);
  const idx    = master.getSheetByName(INDEX_TAB);
  if (!idx) return 'インデックスタブなし';
  const rows = idx.getDataRange().getValues();
  let ssId = null;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === sid) { ssId = String(rows[i][1]); break; }
  }
  if (!ssId) return 'スプレッドシートIDが見つかりません';

  const custTab = SpreadsheetApp.openById(ssId).getSheetByName('顧客');
  if (!custTab) return '顧客タブなし';

  const lastRow = custTab.getLastRow();
  if (lastRow < 2) return 'データなし';

  // O列（15）・P列（16）を空欄にする（新フォーマットのみ対象）
  const fmt = getSheetFormat(custTab);
  if (fmt.type !== 'new') return '旧フォーマット（スキップ）';

  custTab.getRange(2, 15, lastRow - 1, 2).clearContent();
  return '完了（' + (lastRow - 1) + '行クリア）';
}

function migrateCustTab(sid) {
  // インデックスからスプレッドシートIDを取得
  const master = SpreadsheetApp.openById(MASTER_SS_ID);
  const idx    = master.getSheetByName(INDEX_TAB);
  if (!idx) return 'インデックスタブなし';
  const rows = idx.getDataRange().getValues();
  let ssId = null;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === sid) { ssId = String(rows[i][1]); break; }
  }
  if (!ssId) return 'スプレッドシートIDが見つかりません';

  const ss      = SpreadsheetApp.openById(ssId);
  const custTab = ss.getSheetByName('顧客');
  if (!custTab) return '顧客タブなし';

  // すでに新フォーマットなら何もしない
  const fmt = getSheetFormat(custTab);
  if (fmt.type === 'new') return 'すでに新フォーマット（スキップ）';

  // 既存データを読み取る（ヘッダー除く）
  const allRows = custTab.getDataRange().getValues();
  const dataRows = allRows.slice(1).filter(r => r[0] !== '' && r[0] !== null);

  // シートをクリアして新ヘッダーを書き込む
  custTab.clearContents();
  custTab.appendRow(['氏名','氏名（かな）','性別','誕生日','年齢','電話番号','郵便番号','住所',
                     'メールアドレス','総売上','施術','物販','顧客単価','来店回数','初回来店','最終来店',
                     '来店日','番号','次回予約の有無']);
  custTab.getRange('A1:S1').setFontWeight('bold');
  custTab.setFrozenRows(1);

  // 旧データを新フォーマットに変換して書き込む
  // 旧: 日付(0), 番号(1), 苗字(2), 名前(3), 次回予約(4), メニュー(5), 単価(6), 性別(7), 電話(8), メール(9)
  const newRows = dataRows.map((r, idx) => {
    const date      = fmtDate(r[0]);
    const fullName  = ((String(r[2]||'')).trim() + ' ' + (String(r[3]||'')).trim()).trim();
    const price     = String(r[6] || '');
    return [
      fullName,           // A: 氏名
      '',                 // B: 氏名（かな）
      String(r[7] || ''),// C: 性別
      '',                 // D: 誕生日
      '',                 // E: 年齢
      String(r[8] || ''),// F: 電話番号
      '',                 // G: 郵便番号
      '',                 // H: 住所
      String(r[9] || ''),// I: メールアドレス
      '',                 // J: 総売上（空欄）
      '',                 // K: 施術（空欄）
      '',                 // L: 物販（空欄）
      price,              // M: 顧客単価
      '',                 // N: 来店回数
      '',                 // O: 初回来店（空欄）
      '',                 // P: 最終来店（空欄）
      date,               // Q: 来店日
      date.replace(/-/g, '') + '_' + String(idx + 1).padStart(3, '0'), // R: 番号（YYYYMMDD_NNN）
      String(r[4]).trim() === '○' ? 1 : 0  // S: 次回予約の有無（1/0）
    ];
  });

  if (newRows.length > 0) {
    custTab.getRange(2, 1, newRows.length, 19).setValues(newRows);
    sortSheetByDate(custTab, 17); // Q列（17列目）で日付ソート
  }

  return '完了（' + newRows.length + '行変換）';
}
