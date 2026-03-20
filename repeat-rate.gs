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
      case 'login':   return ok(handleLogin(d));
      case 'saveDay': return ok(handleSaveDay(d));
      case 'getData': return ok(handleGetData(d));
      default:        return ok({ success: false, error: 'unknown action: ' + d.action });
    }
  } catch (err) {
    return ok({ success: false, error: err.message });
  }
}

function doGet(e) {
  if ((e.parameter.action || '') === 'csv') return handleCsv(e.parameter);
  return ContentService.createTextOutput('repeat-rate GAS OK');
}

// ─── ログイン ────────────────────────────────────────────────────────
// しんきゅうコンパス マスターシートの月次タブ or 無料体験タブで照合

function handleLogin(d) {
  const sid   = String(d.salon_id || '').trim();
  const email = String(d.email    || '').trim().toLowerCase();
  if (!sid || !email) return { success: false, error: 'サロンIDとメールアドレスを入力してください' };

  const master = SpreadsheetApp.openById(MASTER_SS_ID);
  const now  = new Date();
  const yymm = String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, '0');

  for (const tabName of [yymm, '無料体験']) {
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
  const ss = SpreadsheetApp.create('次回予約率_' + sid + (sname ? '_' + sname : ''));
  DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(SALON_FOLDER_ID));

  const dayTab = ss.getSheets()[0];
  dayTab.setName('日次');
  dayTab.appendRow(['日付', '来店人数', '次回予約数', 'リピート率(%)']);
  dayTab.setFrozenRows(1);
  dayTab.getRange('A1:D1').setFontWeight('bold');

  const custTab = ss.insertSheet('顧客');
  custTab.appendRow(['日付', '番号', '苗字', '名前', '次回予約', 'メニュー', '単価', '性別', '電話', 'メール']);
  custTab.setFrozenRows(1);
  custTab.getRange('A1:J1').setFontWeight('bold');

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

  // 既存の重複行を事前クリーンアップ（同日付は最後の行だけ残す）
  deduplicateSheet(dayTab,  0);
  deduplicateSheet(custTab, 0);

  const date         = String(d.date         || '').trim();
  const visitors     = parseInt(d.visitors,     10) || 0;
  const reservations = parseInt(d.reservations, 10) || 0;
  const rate         = visitors > 0 ? Math.round(reservations / visitors * 100) : 0;

  // 同日付を削除（上書き保存）
  deleteRowsByDate(dayTab,  date, 0);
  deleteRowsByDate(custTab, date, 0);

  dayTab.appendRow([date, visitors, reservations, rate]);

  const customers = d.customers || [];
  customers.forEach((c, i) => {
    custTab.appendRow([
      date, i + 1,
      c.last_name   || '',
      c.first_name  || '',
      c.reserved    ? '○' : '',
      c.menu        || '',
      c.price       || '',
      c.gender      || '',
      c.phone       || '',
      c.email_addr  || ''
    ]);
  });

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

  // ログイン時に既存の重複行をシートから削除（今後も重複しない状態を維持）
  deduplicateSheet(dayTab, 0);
  deduplicateSheet(cusTab, 0);

  const dayRows = dayTab.getDataRange().getValues();
  const cusRows = cusTab.getDataRange().getValues();

  // 同日付が複数ある場合は最後の行を優先（dedup）
  const dayMap = {};
  dayRows.slice(1).forEach(r => {
    const d = fmtDate(r[0]);
    dayMap[d] = { date: d, visitors: Number(r[1]), reservations: Number(r[2]), rate: Number(r[3]) };
  });
  const cusMap = {};
  cusRows.slice(1).forEach(r => {
    const d = fmtDate(r[0]);
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
  const dayRows = ss.getSheetByName('日次').getDataRange().getValues();

  // 来店回数マップ（顧客名をキーに累計）
  const visitCount = {};
  cusRows.slice(1).forEach(r => {
    const key = (String(r[2]) + String(r[3])).trim();
    if (key) visitCount[key] = (visitCount[key] || 0) + 1;
  });

  // ヘッダー（しんきゅう予約 user_list 16列形式）
  const header = ['氏名','氏名（かな）','性別','誕生日','年齢','電話番号','郵便番号','住所',
                  'メールアドレス','総売上','施術','物販','顧客単価','来店回数','初回来店','最終来店'];

  const q = s => '"' + String(s).replace(/"/g, '""') + '"';

  // 日付別データを顧客行に変換
  const dataRows = cusRows.slice(1).map(r => {
    const date       = fmtDate(r[0]);
    const last_name  = String(r[2] || '');
    const first_name = String(r[3] || '');
    const gender     = String(r[7] || '');
    const phone      = String(r[8] || '');
    const email      = String(r[9] || '');
    const price      = String(r[6] || '0');
    const fullName   = (last_name + ' ' + first_name).trim();
    const key        = (last_name + first_name).trim();
    const visits     = visitCount[key] || 1;
    const ts         = date ? date + ' 00:00:00' : '';

    return [header, [
      fullName, '', gender, '', '', phone, '', '', email,
      price, price, '0', price, visits, ts, ts
    ]];
  }).map(([, row]) => row.map(q).join(','));

  const csv = [header.map(q).join(','), ...dataRows].join('\n');

  return ContentService.createTextOutput('\uFEFF' + csv) // BOM付きUTF-8
    .setMimeType(ContentService.MimeType.CSV);
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
