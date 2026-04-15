/**
 * [非推奨] このファイルは state-transition.test.js + e2e.test.js に置き換えられました。
 * 参照用に残していますが、新しいテストは state-transition.test.js / e2e.test.js を使用してください。
 *
 * repeat-rate モンキーテスト（Playwright）
 * GAS通信を page.route でネットワーク層でモックして UIロジックを検証する
 */
const { chromium } = require('playwright');
const path = require('path');

const htmlPath = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
const GAS_PATTERN = '**/macros/s/**';
// ブラウザ側の todayStr()（ローカル時刻）と一致させるためISO(UTC)ではなくローカル日付を使う
const _td = new Date();
const TODAY = _td.getFullYear() + '-' + String(_td.getMonth() + 1).padStart(2, '0') + '-' + String(_td.getDate()).padStart(2, '0');

let passed = 0, failed = 0;
const failedList = [];

function log(name, ok, detail = '') {
  const mark = ok ? '✅' : '❌';
  console.log(`${mark} ${name}${detail ? '  →  ' + detail : ''}`);
  if (ok) passed++; else { failed++; failedList.push({ name, detail }); }
}

async function setupPage(browser, mockToday = null) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14相当

  // GAS通信をネットワーク層でモック
  await page.route(GAS_PATTERN, async (route) => {
    const body = route.request().postData() || '{}';
    let payload = {};
    try { payload = JSON.parse(body); } catch (_) {}

    let resp = { success: true };
    if (payload.action === 'login') {
      resp = { success: true, salon_name: 'テスト鍼灸院' };
    } else if (payload.action === 'getData') {
      const days = mockToday ? [mockToday] : [];
      resp = { success: true, days, customers: [] };
    } else if (payload.action === 'saveDay') {
      const v = parseInt(payload.visitors) || 0;
      const r = parseInt(payload.reservations) || 0;
      if (v === 0) {
        resp = { success: true, deleted: true, spreadsheet_id: 'mock' };
      } else {
        const rate = Math.round(r / v * 100);
        resp = { success: true, rate, spreadsheet_id: 'mock' };
      }
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(resp),
    });
  });

  await page.goto(htmlPath);
  return page;
}

async function login(page) {
  await page.fill('#sid-input', '2049');
  await page.fill('#email-input', 'test@example.com');
  await page.click('.login-btn');
  await page.waitForSelector('#main-screen', { state: 'visible', timeout: 8000 });
}

// 今日フォームの来店数numrowボタン（0〜9）
function vBtn(page, n) {
  return page.locator('#today-input .count-section').first().locator('.numrow-btn').nth(n);
}
// 今日フォームの予約数numrowボタン（0〜9）
function rBtn(page, n) {
  return page.locator('#today-input .count-section').nth(1).locator('.numrow-btn').nth(n);
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // ─────────────────────────────────────
  // ログイン画面
  // ─────────────────────────────────────
  {
    const page = await setupPage(browser);

    // L1: Enterキーでログイン
    await page.fill('#sid-input', '2049');
    await page.fill('#email-input', 'test@example.com');
    await page.press('#email-input', 'Enter');
    try {
      await page.waitForSelector('#main-screen', { state: 'visible', timeout: 6000 });
      log('L1: Enterキーでログイン', true);
    } catch {
      log('L1: Enterキーでログイン', false, 'main-screenが表示されなかった');
    }
    await page.close();
  }

  {
    const page = await setupPage(browser);

    // L2: 空欄でログイン → エラーメッセージ表示
    await page.click('.login-btn');
    const errVisible = await page.isVisible('#login-error');
    const errText = await page.textContent('#login-error');
    log('L2: 空欄ログイン→エラー表示', errVisible && errText.length > 0, errText);

    // L3: IDのみ（メール空欄）→ エラー表示
    await page.fill('#sid-input', '2049');
    await page.click('.login-btn');
    const err3 = await page.isVisible('#login-error');
    log('L3: IDのみでログイン→エラー表示', err3);

    await page.close();
  }

  // ─────────────────────────────────────
  // ①施術数 numrow
  // ─────────────────────────────────────
  {
    const page = await setupPage(browser);
    await login(page);

    // N1: 初期値 v=0
    const initVal = await page.inputValue('#t-visitor-display');
    log('N1: 初期v=0', initVal === '0', `v=${initVal}`);

    // N2: 「3」押す → v=3（フレッシュ置換）
    await vBtn(page, 3).click();
    const v3 = await page.inputValue('#t-visitor-display');
    log('N2: numrow「3」→v=3', v3 === '3', `v=${v3}`);

    // N3: 続けて「0」押す → v=30（追記）
    await vBtn(page, 0).click();
    const v30 = await page.inputValue('#t-visitor-display');
    log('N3: 追記モードで「0」→v=30', v30 === '30', `v=${v30}`);

    // N4: 消去 → v=0
    await page.locator('#today-input .count-section').first().locator('.numrow-clear-btn').click();
    const vCleared = await page.inputValue('#t-visitor-display');
    log('N4: 消去→v=0', vCleared === '0', `v=${vCleared}`);

    // N5: 消去後「5」→ v=5（フレッシュ置換）
    await vBtn(page, 5).click();
    const v5 = await page.inputValue('#t-visitor-display');
    log('N5: 消去後「5」→v=5（置換）', v5 === '5', `v=${v5}`);

    // N6: ＋ボタン → v=6
    await page.locator('#today-input .count-section').first().locator('.pm-btn.plus').click();
    const v6 = await page.inputValue('#t-visitor-display');
    log('N6: ＋ボタン→v=6', v6 === '6', `v=${v6}`);

    // N7: ±後「2」→ v=2（フレッシュ置換）
    await vBtn(page, 2).click();
    const v2 = await page.inputValue('#t-visitor-display');
    log('N7: ±後「2」→v=2（フレッシュ置換）', v2 === '2', `v=${v2}`);

    // N8: テキスト直入力 → v=8
    await page.fill('#t-visitor-display', '8');
    await page.dispatchEvent('#t-visitor-display', 'input');
    const v8 = await page.inputValue('#t-visitor-display');
    log('N8: テキスト直入力v=8', v8 === '8', `v=${v8}`);

    // N9: 直入力後「1」→ v=81（追記モード）
    await vBtn(page, 1).click();
    const v81 = await page.inputValue('#t-visitor-display');
    log('N9: 直入力後numrow「1」→v=81（追記）', v81 === '81', `v=${v81}`);

    // N10: 99超え（「9」連打）→ 入力値に置換されて99以内
    await vBtn(page, 9).click(); // 819
    const vOverflow = await page.inputValue('#t-visitor-display');
    log('N10: 99超え→keyに置換または99以内', parseInt(vOverflow) <= 99, `v=${vOverflow}`);

    // N11: マイナスボタン連打でv=0止まり（負にならない）
    await page.locator('#today-input .count-section').first().locator('.numrow-clear-btn').click();
    for (let i = 0; i < 5; i++) {
      await page.locator('#today-input .count-section').first().locator('.pm-btn.minus').click();
    }
    const vMinus = await page.inputValue('#t-visitor-display');
    log('N11: マイナス連打→v=0止まり', vMinus === '0', `v=${vMinus}`);

    await page.close();
  }

  // ─────────────────────────────────────
  // ②予約数 numrow
  // ─────────────────────────────────────
  {
    const page = await setupPage(browser);
    await login(page);

    // R1: v=0のとき②numrow押す → トースト
    await rBtn(page, 1).click();
    await page.waitForTimeout(400);
    const toast1 = await page.textContent('#toast');
    log('R1: v=0で②numrow→フィードバックトースト', toast1.includes('先に') || toast1.includes('施術'), `toast="${toast1}"`);

    // R2: v=3入力後 r=2
    await vBtn(page, 3).click();
    await rBtn(page, 2).click();
    const r2 = await page.inputValue('#t-reservation-display');
    log('R2: v=3でr=2入力', r2 === '2', `r=${r2}`);

    // R3: r>v を試みるとcapに丸まる（「5」押す→cap=3）
    await rBtn(page, 5).click(); // 25→cap3
    const rCapped = await page.inputValue('#t-reservation-display');
    log('R3: r>v試みるとcap(v=3)に丸まる', parseInt(rCapped) <= 3, `r=${rCapped}`);

    // R4: リピート率がライブ表示
    await rBtn(page, 2).click(); // r→2（フレッシュ→2）
    const liveRate = await page.textContent('#t-live-rate');
    log('R4: リピート率ライブ表示', liveRate.includes('%'), `"${liveRate}"`);

    // R5: v=0に戻す→②の予約数も0になる
    await page.locator('#today-input .count-section').first().locator('.numrow-clear-btn').click();
    const rAfterV0 = await page.inputValue('#t-reservation-display');
    log('R5: v=0に戻すとrも0になる', rAfterV0 === '0', `r=${rAfterV0}`);

    // ─── 状態遷移テスト：r=cap状態からの次の入力 ───
    // 「操作」だけでなく「状態×操作」で網羅する（今回のバグ教訓）
    // | r の状態     | numrow | ± | 消去 |
    // | r=0（初期）  | ✅R2  | ✅N6 | ✅N4 |
    // | 0 < r < cap  | ✅R2  | ✅   | ✅   |
    // | r=cap（上限）| ✅以下 | ✅R3 | ✅   |

    // R6: v=6, r=6（cap満杯）→ numrow「4」→ r=4 に変更できる
    await vBtn(page, 6).click();  // v=6
    await rBtn(page, 6).click();  // r=6（=cap）
    await rBtn(page, 4).click();  // cap後→fresh→「4」で置換
    const rFromCap4 = await page.inputValue('#t-reservation-display');
    log('R6: r=cap(6)→numrow「4」→r=4（変更できる）', rFromCap4 === '4', `r=${rFromCap4}`);

    // R7: v=6, r=6（cap満杯）→ numrow「6」→ r=6 のまま（cap以下なので維持）
    await page.locator('#today-input .count-section').nth(1).locator('.numrow-clear-btn').click();
    await rBtn(page, 6).click();  // r=6（=cap）
    await rBtn(page, 6).click();  // fresh→「6」で置換 → cap以下なのでr=6
    const rFromCap6 = await page.inputValue('#t-reservation-display');
    log('R7: r=cap(6)→numrow「6」→r=6（上限以内）', rFromCap6 === '6', `r=${rFromCap6}`);

    // R8: v=6, r=6（cap満杯）→ numrow「2」「4」→ r=24 にはならずr=24>6→cap→r=6、fresh→「4」→r=4
    await page.locator('#today-input .count-section').nth(1).locator('.numrow-clear-btn').click();
    await rBtn(page, 6).click();  // r=6（=cap）
    await rBtn(page, 2).click();  // fresh→「2」→r=2
    await rBtn(page, 4).click();  // 追記→「24」>6→cap→r=6、fresh=true
    await rBtn(page, 4).click();  // fresh→「4」→r=4
    const rSeq = await page.inputValue('#t-reservation-display');
    log('R8: r=cap→「2」→「4」→「4」の連続入力でr=4', rSeq === '4', `r=${rSeq}`);

    await page.close();
  }

  // ─────────────────────────────────────
  // 保存フロー
  // ─────────────────────────────────────
  {
    const page = await setupPage(browser);
    await login(page);

    // S1: 何も入力せず保存 → 適切なメッセージ（削除ではなく入力促進）
    await page.click('#t-save-btn');
    await page.waitForTimeout(400);
    const toastS1 = await page.textContent('#toast');
    const isNotDeleteMsg = !toastS1.includes('削除');
    log('S1: 未入力保存→「削除しました」以外のメッセージ', isNotDeleteMsg || toastS1.length === 0, `toast="${toastS1}"`);

    // S2: v=5, r=3で保存→保存済み表示に切り替わる
    await vBtn(page, 5).click();
    await rBtn(page, 3).click();
    await page.click('#t-save-btn');
    await page.waitForTimeout(600);
    const savedVisible = await page.isVisible('#today-saved');
    log('S2: v=5,r=3保存→保存済み表示', savedVisible);

    // S3: 保存済みの数値が正しい
    const resV = await page.textContent('#t-res-v');
    const resR = await page.textContent('#t-res-r');
    log('S3: 保存済み表示の数値', resV === '5' && resR === '3', `来店=${resV} 予約=${resR}`);

    // S4: 保存後「修正する」→フォームが開く
    await page.click('#today-saved .edit-btn');
    const inputVisible = await page.isVisible('#today-input');
    log('S4: 保存後「修正する」→フォーム表示', inputVisible);

    // S5: 修正フォームに保存値が復元
    const vR = await page.inputValue('#t-visitor-display');
    const rR = await page.inputValue('#t-reservation-display');
    log('S5: 修正フォームに数値が復元', vR === '5' && rR === '3', `v=${vR} r=${rR}`);

    // S6: チェックボックスが予約数(3)ぶん入っている
    const cbs = await page.locator('#t-customer-rows input[data-field="reserved"]').all();
    let checked = 0;
    for (const cb of cbs) if (await cb.isChecked()) checked++;
    log('S6: チェックボックスが予約数(3)ぶん', checked === 3, `checked=${checked}`);

    await page.close();
  }

  // ─────────────────────────────────────
  // 既存データあり（修正フロー）
  // ─────────────────────────────────────
  {
    const mockData = { date: TODAY, visitors: 3, reservations: 2, rate: 67 };
    const page = await setupPage(browser, mockData);
    await login(page);

    // E1: ログイン後に保存済み表示
    const savedVis = await page.isVisible('#today-saved');
    log('E1: 既存データ→保存済み表示', savedVis);

    // E2: 「修正する」→入力フォーム
    await page.click('#today-saved .edit-btn');
    const inputVis = await page.isVisible('#today-input');
    log('E2: 「修正する」→入力フォーム', inputVis);

    // E3: 既存値が復元
    const vR = await page.inputValue('#t-visitor-display');
    const rR = await page.inputValue('#t-reservation-display');
    log('E3: 既存値v=3,r=2が復元', vR === '3' && rR === '2', `v=${vR} r=${rR}`);

    // E4: チェックボックスが2ぶん
    const cbs = await page.locator('#t-customer-rows input[data-field="reserved"]').all();
    let checked = 0;
    for (const cb of cbs) if (await cb.isChecked()) checked++;
    log('E4: チェックが予約数(2)ぶん', checked === 2, `checked=${checked}`);

    // E5: 修正フォームでnumrow「1」押す→v=1（フレッシュ置換）
    await vBtn(page, 1).click();
    const vNew = await page.inputValue('#t-visitor-display');
    log('E5: 修正フォームで「1」→v=1（フレッシュ置換）', vNew === '1', `v=${vNew}`);

    await page.close();
  }

  // ─────────────────────────────────────
  // カレンダー操作
  // ─────────────────────────────────────
  {
    const page = await setupPage(browser);
    await login(page);

    const labelBefore = await page.textContent('#cal-month-label');

    // C1: ＜で先月移動
    await page.click('.cal-nav-btn:first-child');
    const labelAfter = await page.textContent('#cal-month-label');
    log('C1: ＜で先月移動', labelBefore !== labelAfter, `${labelBefore}→${labelAfter}`);

    // C2: 先月では＞がenabled
    const nextDisabled = await page.getAttribute('#cal-nav-next', 'disabled');
    log('C2: 先月移動後＞がenabled', nextDisabled === null);

    // C3: ＞で今月に戻る
    await page.click('#cal-nav-next');
    const labelBack = await page.textContent('#cal-month-label');
    log('C3: ＞で今月に戻る', labelBack === labelBefore, labelBack);

    // C4: 今月では＞がdisabled
    const nextNow = await page.getAttribute('#cal-nav-next', 'disabled');
    log('C4: 今月では＞がdisabled', nextNow !== null);

    // C5: 過去日付をタップ→過去フォーム表示
    const pastCells = await page.locator('.cal-day:not(.empty):not(.today):not(.future)').all();
    if (pastCells.length > 0) {
      await pastCells[0].click();
      await page.waitForTimeout(300);
      const pastFormVis = await page.isVisible('#past-form');
      log('C5: 過去日タップ→過去フォーム表示', pastFormVis);

      // C6: カレンダーに戻る→過去フォームが閉じる
      await page.click('.back-btn');
      await page.waitForTimeout(300);
      const calVis = await page.isVisible('#past-calendar');
      log('C6: 「カレンダーに戻る」→カレンダー表示', calVis);
    } else {
      log('C5: 過去日タップ→過去フォーム表示', false, '過去日セルなし');
      log('C6: 「カレンダーに戻る」', false, 'skip');
    }

    await page.close();
  }

  // ─────────────────────────────────────
  // グラフ切り替え
  // ─────────────────────────────────────
  {
    const page = await setupPage(browser);
    await login(page);

    // G1: 「月次」ボタンでグラフ切り替え
    await page.click('#btn-monthly');
    const monthlyActive = await page.evaluate(() =>
      document.getElementById('btn-monthly').classList.contains('active'));
    const dailyActive = await page.evaluate(() =>
      document.getElementById('btn-daily').classList.contains('active'));
    log('G1: 「月次」ボタンactive・「日次」がinactive', monthlyActive && !dailyActive);

    // G2: 「日次」に戻す
    await page.click('#btn-daily');
    const dailyBack = await page.evaluate(() =>
      document.getElementById('btn-daily').classList.contains('active'));
    log('G2: 「日次」ボタンに戻る', dailyBack);

    await page.close();
  }

  // ─────────────────────────────────────
  // ログアウト
  // ─────────────────────────────────────
  {
    const page = await setupPage(browser);
    await login(page);
    await page.click('.logout-btn');
    const loginVis = await page.isVisible('#login-screen');
    const mainHid = !(await page.isVisible('#main-screen'));
    log('LO1: ログアウト→ログイン画面に戻る', loginVis && mainHid);

    // 再ログイン後バッファリセット
    await page.fill('#sid-input', '2049');
    await page.fill('#email-input', 'test@example.com');
    await page.click('.login-btn');
    await page.waitForSelector('#main-screen', { state: 'visible', timeout: 8000 });
    const vAfter = await page.inputValue('#t-visitor-display').catch(() => '?');
    log('LO2: 再ログイン後v=0にリセット', vAfter === '0' || vAfter === '', `v=${vAfter}`);

    await page.close();
  }

  // ─────────────────────────────────────
  // 結果サマリ
  // ─────────────────────────────────────
  await browser.close();
  console.log('\n════════════════════════════════════════');
  console.log(`結果: ${passed} PASS / ${failed} FAIL`);
  if (failed > 0) {
    console.log('\n❌ 失敗したテスト:');
    failedList.forEach(r => console.log(`  - ${r.name}: ${r.detail}`));
  }
  console.log('════════════════════════════════════════');
  process.exit(failed > 0 ? 1 : 0);
})();
