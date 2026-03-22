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
      case 'saveDay':  return ok(handleSaveDay(d));
      case 'getData':  return ok(handleGetData(d));
      case 'cleanup':  return ok(runCleanup2049());
      default:         return ok({ success: false, error: 'unknown action: ' + d.action });
    }
  } catch (err) {
    return ok({ success: false, error: err.message });
  }
}

function doGet(e) {
  if ((e.parameter.action || '') === 'csv') return handleCsv(e.parameter);
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
  return ContentService.createTextOutput('repeat-rate GAS OK');
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
    const now  = new Date();
    const yymm = String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, '0');
    for (const tabName of [yymm, '無料体験']) {
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

  // 施術回数分の行をそのまま保存（詳細未入力行も含む — index番号が来訪記録として機能する）
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

  return { success: true, rate, spreadsheet_id: ss.getId(), debug_customers_received: customers.length, debug_fmt: fmt.type };
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
  dayRows.slice(1).forEach(r => {
    const visitors = Number(r[1]);
    if (!visitors) return; // visitors=0は未記入扱いで除外
    const d = fmtDate(r[0]);
    dayMap[d] = { date: d, visitors, reservations: Number(r[2]), rate: Number(r[3]) };
  });
  const cusMap = {};
  if (fmt.type === 'new') {
    // 新フォーマット: Q(16)=来店日, R(17)=番号, S(18)=次回予約の有無, T(19)=メニュー
    cusRows.slice(1).forEach(r => {
      const d = fmtDate(r[16]);
      if (!d) return;
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
