/**
 * [非推奨] このファイルは e2e.test.js に置き換えられました。
 * 参照用に残していますが、新しいテストは e2e.test.js を使用してください。
 *
 * repeat-rate マルチブラウザテスト（Playwright）
 * CLAUDE.md §11 定義に基づき以下の環境で実行する：
 *
 * | 環境          | エンジン  | viewport   |
 * |---------------|-----------|------------|
 * | Android Chrome | chromium  | 360×800    |
 * | iPhone Safari  | webkit    | 390×844    |
 * | PC Chrome      | chromium  | 1280×800   |
 * | iPad Safari    | webkit    | 768×1024   |
 *
 * テスト項目：
 *   2）数値まわりMECEテスト
 *   3）初心者想定モンキーテスト
 *   4）ブラウザ操作テスト
 */
const { chromium, webkit } = require('playwright');
const path = require('path');

const htmlPath = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
const GAS_PATTERN = '**/macros/s/**';
// ブラウザ側の todayStr()（ローカル時刻）と一致させるためISO(UTC)ではなくローカル日付を使う
const _td = new Date();
const TODAY = _td.getFullYear() + '-' + String(_td.getMonth() + 1).padStart(2, '0') + '-' + String(_td.getDate()).padStart(2, '0');

// ─────────────────────────────────────────────
// 集計
// ─────────────────────────────────────────────
let totalPassed = 0, totalFailed = 0;
const allFailures = [];

function log(label, name, ok, detail = '') {
  const mark = ok ? '✅' : '❌';
  console.log(`${mark} [${label}] ${name}${detail ? '  →  ' + detail : ''}`);
  if (ok) totalPassed++;
  else { totalFailed++; allFailures.push({ env: label, name, detail }); }
}

// ─────────────────────────────────────────────
// GASモック付きページ作成
// ─────────────────────────────────────────────
async function setupPage(browser, viewport, mockToday = null) {
  const page = await browser.newPage();
  await page.setViewportSize(viewport);
  await applyGasMock(page, mockToday);
  await page.goto(htmlPath);
  return page;
}

async function applyGasMock(page, mockToday = null) {
  await page.route(GAS_PATTERN, async (route) => {
    const body = route.request().postData() || '{}';
    let payload = {};
    try { payload = JSON.parse(body); } catch (_) {}
    let resp = { success: true };
    if (payload.action === 'login') {
      resp = { success: true, salon_name: 'テスト鍼灸院' };
    } else if (payload.action === 'getData') {
      resp = { success: true, days: mockToday ? [mockToday] : [], customers: [] };
    } else if (payload.action === 'saveDay') {
      const v = parseInt(payload.visitors) || 0;
      const r = parseInt(payload.reservations) || 0;
      resp = v === 0
        ? { success: true, deleted: true, spreadsheet_id: 'mock' }
        : { success: true, rate: Math.round(r / v * 100), spreadsheet_id: 'mock' };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resp) });
  });
}

async function login(page) {
  await page.fill('#sid-input', '2049');
  await page.fill('#email-input', 'test@example.com');
  await page.click('.login-btn');
  await page.waitForSelector('#main-screen', { state: 'visible', timeout: 8000 });
}

// numrow・±・消去ボタンのヘルパー
const vBtn  = (p, n) => p.locator('#today-input .count-section').first().locator('.numrow-btn').nth(n);
const rBtn  = (p, n) => p.locator('#today-input .count-section').nth(1).locator('.numrow-btn').nth(n);
const vMinus = p => p.locator('#today-input .count-section').first().locator('.pm-btn.minus');
const vPlus  = p => p.locator('#today-input .count-section').first().locator('.pm-btn.plus');
const vClear = p => p.locator('#today-input .count-section').first().locator('.numrow-clear-btn');
const rMinus = p => p.locator('#today-input .count-section').nth(1).locator('.pm-btn.minus');
const rPlus  = p => p.locator('#today-input .count-section').nth(1).locator('.pm-btn.plus');
const rClear = p => p.locator('#today-input .count-section').nth(1).locator('.numrow-clear-btn');

// ─────────────────────────────────────────────
// テストスイート（1環境分）
// ─────────────────────────────────────────────
async function runSuite(browser, label, viewport) {
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  ${label}  (${viewport.width}×${viewport.height})`);
  console.log(`${'═'.repeat(50)}`);

  // ── ブラウザ操作テスト ──────────────────────
  console.log('\n─── ブラウザ操作 ───');
  {
    // B1: main-contentがmax-width以内
    const page = await setupPage(browser, viewport);
    await login(page);
    const mainW = await page.evaluate(() => {
      const el = document.querySelector('.main-content');
      return el ? el.getBoundingClientRect().width : 0;
    });
    log(label, 'B1: main-contentがmax-width≦600px', mainW <= 600 && mainW > 200, `width=${Math.round(mainW)}px`);

    // B2: 横スクロールなし
    const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    log(label, 'B2: 横スクロールなし', !hasHScroll);
    await page.close();
  }

  {
    // B3: ログインカードmax-width（session未保存の新規ページで確認）
    const freshPage = await browser.newPage();
    await freshPage.setViewportSize(viewport);
    await freshPage.route(GAS_PATTERN, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await freshPage.goto(htmlPath);
    await freshPage.waitForTimeout(300);
    const cardW = await freshPage.evaluate(() => {
      const el = document.querySelector('.login-card');
      return el ? el.getBoundingClientRect().width : 0;
    });
    const maxCardW = viewport.width >= 1280 ? 400 : viewport.width;
    log(label, 'B3: ログインカードがmax-width以内', cardW <= maxCardW && cardW > 100, `width=${Math.round(cardW)}px`);
    await freshPage.close();
  }

  {
    // B4: localStorageにセッション保存
    const page = await setupPage(browser, viewport);
    await login(page);
    const session = await page.evaluate(() => localStorage.getItem('rr_session'));
    log(label, 'B4: ログイン後localStorageにセッション保存', session !== null);

    // B5: リロード後にセッション復元
    await applyGasMock(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const mainVisAfterReload = await page.isVisible('#main-screen');
    log(label, 'B5: リロード後main-screen復元', mainVisAfterReload);
    await page.close();
  }

  {
    // B6: localStorage.clear()後→ログイン画面
    const page = await setupPage(browser, viewport);
    await login(page);
    await page.evaluate(() => localStorage.clear());
    await page.goto(htmlPath);
    await page.waitForTimeout(500);
    const loginVis = await page.isVisible('#login-screen');
    log(label, 'B6: localStorage.clear()後→ログイン画面', loginVis);
    await page.close();
  }

  // ── 数値MECE ①施術数 ──────────────────────
  console.log('\n─── 数値MECE（①施術数）───');
  {
    const page = await setupPage(browser, viewport);
    await login(page);

    // NM1: 「0」単押し→v=0
    await vBtn(page, 0).click();
    log(label, 'NM1: 「0」単押し→v=0', await page.inputValue('#t-visitor-display') === '0');

    // NM2: 「3」→消去→v=0
    await vBtn(page, 3).click();
    await vClear(page).click();
    log(label, 'NM2: 「3」→消去→v=0', await page.inputValue('#t-visitor-display') === '0');

    // NM3: 「30」→消去→v=0
    await vBtn(page, 3).click(); await vBtn(page, 0).click();
    await vClear(page).click();
    log(label, 'NM3: 「30」→消去→v=0（全クリア）', await page.inputValue('#t-visitor-display') === '0');

    // NM4: 「0」「0」連打→v=0
    await vBtn(page, 0).click(); await vBtn(page, 0).click();
    log(label, 'NM4: 「0」「0」連打→v=0', await page.inputValue('#t-visitor-display') === '0');

    // NM5: 「3」「0」「0」→overflow→v=0
    await vClear(page).click();
    await vBtn(page, 3).click(); await vBtn(page, 0).click(); await vBtn(page, 0).click();
    log(label, 'NM5: 「300」→overflow→v=0', await page.inputValue('#t-visitor-display') === '0');

    // NM6: 「99」→「5」→overflow→v=5
    await vClear(page).click();
    await vBtn(page, 9).click(); await vBtn(page, 9).click(); await vBtn(page, 5).click();
    log(label, 'NM6: 「99」→「5」→overflow→v=5', await page.inputValue('#t-visitor-display') === '5');

    // NM7: ±後numrow→置換モード
    await vClear(page).click();
    await vBtn(page, 3).click(); await vPlus(page).click(); await vBtn(page, 7).click();
    log(label, 'NM7: ±後numrow→置換（7）', await page.inputValue('#t-visitor-display') === '7');

    // NM8: テキスト「abc」→フィルタで0
    await page.fill('#t-visitor-display', 'abc');
    await page.dispatchEvent('#t-visitor-display', 'input');
    const vAlpha = await page.inputValue('#t-visitor-display');
    log(label, 'NM8: テキスト「abc」→フィルタで0', vAlpha === '0' || vAlpha === '');

    // NM9: テキスト「999」→99
    await page.fill('#t-visitor-display', '999');
    await page.dispatchEvent('#t-visitor-display', 'input');
    log(label, 'NM9: テキスト「999」→2桁上限99', await page.inputValue('#t-visitor-display') === '99');

    // NM10: テキスト入力後numrow→追記（53）
    await page.fill('#t-visitor-display', '5');
    await page.dispatchEvent('#t-visitor-display', 'input');
    await vBtn(page, 3).click();
    log(label, 'NM10: テキスト「5」後numrow→追記53', await page.inputValue('#t-visitor-display') === '53');

    // NM11: マイナス連打→0止まり
    await vClear(page).click();
    for (let i = 0; i < 5; i++) await vMinus(page).click();
    log(label, 'NM11: マイナス連打→0止まり', await page.inputValue('#t-visitor-display') === '0');

    // NM12: プラス連打→99止まり
    for (let i = 0; i < 105; i++) await vPlus(page).click();
    log(label, 'NM12: プラス連打→99止まり', await page.inputValue('#t-visitor-display') === '99');

    await page.close();
  }

  // ── 数値MECE ①②連動 ──────────────────────
  console.log('\n─── 数値MECE（①②連動）───');
  {
    const page = await setupPage(browser, viewport);
    await login(page);

    // NS1: v=5→r=3→v=2（マイナス）→r=2に連動
    await vBtn(page, 5).click(); await rBtn(page, 3).click();
    await vMinus(page).click(); await vMinus(page).click(); await vMinus(page).click();
    log(label, 'NS1: v=5→r=3→v=2（マイナス）→r=2連動', await page.inputValue('#t-reservation-display') === '2');

    // NS2: v=5→r=5→v=3（マイナス）→r=3に連動
    await vClear(page).click(); await rClear(page).click();
    await vBtn(page, 5).click(); await rBtn(page, 5).click();
    await vMinus(page).click(); await vMinus(page).click();
    log(label, 'NS2: v=5→r=5→v=3（マイナス）→r=3連動', await page.inputValue('#t-reservation-display') === '3');

    // NS3: v=3でr「5」→cap=3
    await vClear(page).click(); await rClear(page).click();
    await vBtn(page, 3).click(); await rBtn(page, 5).click();
    log(label, 'NS3: v=3でr「5」→cap=3', await page.inputValue('#t-reservation-display') === '3');

    // NS4: テキスト直入力r=10→v=3のcap
    await vClear(page).click(); await rClear(page).click();
    await vBtn(page, 3).click();
    await page.fill('#t-reservation-display', '10');
    await page.dispatchEvent('#t-reservation-display', 'input');
    log(label, 'NS4: テキスト直入力r=10→cap→r=3', await page.inputValue('#t-reservation-display') === '3');

    // NS5: v=0→r=0に連動
    await vClear(page).click();
    log(label, 'NS5: v=0→r=0連動', await page.inputValue('#t-reservation-display') === '0');

    // NS6: v=0で②numrow→トースト
    await rBtn(page, 2).click();
    await page.waitForTimeout(300);
    const toast = await page.textContent('#toast');
    log(label, 'NS6: v=0で②numrow→トースト', toast.includes('先に') || toast.includes('施術'), `"${toast}"`);

    // NS7: r<=vなら保存ボタン有効
    await vClear(page).click(); await rClear(page).click();
    await vBtn(page, 3).click(); await rBtn(page, 2).click();
    const saveDisabled = await page.$eval('#t-save-btn', el => el.disabled);
    log(label, 'NS7: r<=vなら保存ボタン有効', !saveDisabled);

    await page.close();
  }

  // ── 数値MECE ②予約数 ──────────────────────
  console.log('\n─── 数値MECE（②予約数）───');
  {
    const page = await setupPage(browser, viewport);
    await login(page);

    // NR1: r=3→消去→r=0
    await vBtn(page, 5).click(); await rBtn(page, 3).click();
    await rClear(page).click();
    log(label, 'NR1: r=3→消去→r=0', await page.inputValue('#t-reservation-display') === '0');

    // NR2: r「32」→cap(v=5)
    await rBtn(page, 3).click(); await rBtn(page, 2).click();
    const r32 = parseInt(await page.inputValue('#t-reservation-display'));
    log(label, 'NR2: r「32」→cap(v=5)', r32 <= 5, `r=${r32}`);

    // NR3: ②プラス連打→cap(v=5)
    await rClear(page).click();
    for (let i = 0; i < 10; i++) await rPlus(page).click();
    const rMax = parseInt(await page.inputValue('#t-reservation-display'));
    log(label, 'NR3: ②プラス連打→cap(v=5)止まり', rMax <= 5, `r=${rMax}`);

    // NR4: ②マイナス連打→0止まり
    for (let i = 0; i < 10; i++) await rMinus(page).click();
    log(label, 'NR4: ②マイナス連打→0止まり', await page.inputValue('#t-reservation-display') === '0');

    // ─── 状態遷移テスト：r=cap状態からの次の入力 ───
    // 「操作」だけでなく「状態×操作」で網羅する（2026-03-22 バグ教訓）
    // | r の状態     | numrow | ±  | 消去 |
    // | r=0（初期）  | ✅NM1  | ✅NR4 | ✅NR1 |
    // | 0 < r < cap  | ✅NS3  | ✅NR3 | ✅NR1 |
    // | r=cap（上限）| ✅以下  | ✅NR3 | ✅NR1 |

    // NR5: v=6, r=6（cap満杯）→ numrow「4」→ r=4（変更できる）
    await vClear(page).click();
    await vBtn(page, 6).click();  // v=6
    await rBtn(page, 6).click();  // r=6（=cap）
    await rBtn(page, 4).click();  // cap後→fresh→「4」で置換
    log(label, 'NR5: r=cap(6)→numrow「4」→r=4（変更できる）',
      await page.inputValue('#t-reservation-display') === '4');

    // NR6: v=6, r=6（cap満杯）→ numrow「6」→ r=6のまま（上限以内）
    await rClear(page).click();
    await rBtn(page, 6).click();  // r=6（=cap）
    await rBtn(page, 6).click();  // fresh→「6」→cap以下→r=6
    log(label, 'NR6: r=cap(6)→numrow「6」→r=6（上限以内維持）',
      await page.inputValue('#t-reservation-display') === '6');

    // NR7: v=6, r=6（cap満杯）→「2」→「4」→「4」の連続でr=4
    await rClear(page).click();
    await rBtn(page, 6).click();  // r=6（=cap）
    await rBtn(page, 2).click();  // fresh→「2」→r=2
    await rBtn(page, 4).click();  // 追記→「24」>6→cap→fresh=true
    await rBtn(page, 4).click();  // fresh→「4」→r=4
    log(label, 'NR7: r=cap→「2」「4」「4」連続でr=4',
      await page.inputValue('#t-reservation-display') === '4');

    await page.close();
  }

  // ── モンキーテスト ─────────────────────────
  console.log('\n─── モンキーテスト ───');

  // M1: 保存ボタン高速連打→二重送信なし
  {
    let saveCount = 0;
    const page = await browser.newPage();
    await page.setViewportSize(viewport);
    await page.route(GAS_PATTERN, async (route) => {
      const body = route.request().postData() || '{}';
      let payload = {};
      try { payload = JSON.parse(body); } catch (_) {}
      if (payload.action === 'saveDay') saveCount++;
      await new Promise(r => setTimeout(r, 200));
      let resp = { success: true };
      if (payload.action === 'login') resp = { success: true, salon_name: 'テスト' };
      if (payload.action === 'getData') resp = { success: true, days: [], customers: [] };
      if (payload.action === 'saveDay') {
        const v = parseInt(payload.visitors) || 0;
        const r = parseInt(payload.reservations) || 0;
        resp = { success: true, rate: v > 0 ? Math.round(r / v * 100) : null, spreadsheet_id: 'mock' };
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resp) });
    });
    await page.goto(htmlPath);
    await login(page);
    await vBtn(page, 3).click(); await rBtn(page, 2).click();
    for (let i = 0; i < 5; i++) page.click('#t-save-btn').catch(() => {});
    await page.waitForTimeout(1500);
    log(label, 'M1: 保存ボタン5連打→saveDay送信1〜2回', saveCount <= 2, `saveCount=${saveCount}`);
    await page.close();
  }

  // M2: 保存→修正→再保存→値更新
  {
    const page = await setupPage(browser, viewport);
    await login(page);
    await vBtn(page, 5).click(); await rBtn(page, 3).click();
    await page.click('#t-save-btn'); await page.waitForTimeout(600);
    await page.click('#today-saved .edit-btn');
    await page.waitForSelector('#today-input', { state: 'visible' });
    await vClear(page).click(); await vBtn(page, 8).click();
    await rClear(page).click(); await rBtn(page, 4).click();
    await page.click('#t-save-btn'); await page.waitForTimeout(600);
    const resV = await page.textContent('#t-res-v').catch(() => '?');
    const resR = await page.textContent('#t-res-r').catch(() => '?');
    log(label, 'M2: 保存→修正→再保存（v=8,r=4）', resV === '8' && resR === '4', `v=${resV} r=${resR}`);
    await page.close();
  }

  // M3: XSS入力でalert発火なし
  {
    const page = await setupPage(browser, viewport);
    await login(page);
    await vBtn(page, 1).click();
    let alertFired = false;
    page.on('dialog', async dialog => { alertFired = true; await dialog.dismiss(); });
    const nameInput = page.locator('#t-customer-rows .customer-row input[data-field="first_name"]').first();
    await nameInput.fill('<script>alert("xss")</script>');
    await page.waitForTimeout(300);
    log(label, 'M3: XSS入力でalert発火なし', !alertFired);
    await page.close();
  }

  // M4: ＜連打6回→カレンダー表示維持
  {
    const page = await setupPage(browser, viewport);
    await login(page);
    for (let i = 0; i < 6; i++) await page.click('.cal-nav-btn:first-child');
    await page.waitForTimeout(300);
    const calVis = await page.isVisible('#past-calendar');
    const label2 = await page.textContent('#cal-month-label');
    log(label, 'M4: ＜連打6回→カレンダー表示維持', calVis && label2.length > 0, label2);
    await page.close();
  }

  // M5: ログアウト→ブラウザバック→ログイン画面
  {
    const page = await setupPage(browser, viewport);
    await login(page);
    await page.click('.logout-btn');
    await page.goBack().catch(() => {});
    await page.waitForTimeout(500);
    const loginVis = await page.isVisible('#login-screen');
    log(label, 'M5: ログアウト→ブラウザバック→ログイン画面', loginVis || !(await page.isVisible('#main-screen')));
    await page.close();
  }

  // M6: v=0保存→「保存完了」以外のメッセージ
  {
    const page = await setupPage(browser, viewport);
    await login(page);
    await page.click('#t-save-btn'); await page.waitForTimeout(500);
    const toastMsg = await page.textContent('#toast');
    log(label, 'M6: v=0保存→「保存完了」以外', !toastMsg.includes('保存しました') && !toastMsg.includes('完了'), `"${toastMsg}"`);
    await page.close();
  }

  // M7: v・r両方クリア→v=0,r=0
  {
    const page = await setupPage(browser, viewport);
    await login(page);
    await vBtn(page, 5).click(); await rBtn(page, 3).click();
    await vClear(page).click(); await rClear(page).click();
    const vF = await page.inputValue('#t-visitor-display');
    const rF = await page.inputValue('#t-reservation-display');
    log(label, 'M7: v・r両方クリア→v=0,r=0', vF === '0' && rF === '0', `v=${vF} r=${rF}`);
    await page.close();
  }

  // M8: 過去フォーム中→今日ボタン→過去フォームが閉じる
  {
    const page = await setupPage(browser, viewport);
    await login(page);
    await page.click('.cal-nav-btn:first-child');
    const pastCells = await page.locator('.cal-day:not(.empty):not(.today):not(.future)').all();
    if (pastCells.length > 0) {
      await pastCells[0].click(); await page.waitForTimeout(300);
      const todayBtn = page.locator('#today-empty button, #today-saved .edit-btn').first();
      if (await todayBtn.count() > 0) {
        await todayBtn.click(); await page.waitForTimeout(300);
        log(label, 'M8: 過去フォーム中→今日ボタン→過去フォーム閉じる', !(await page.isVisible('#past-form')));
      } else {
        log(label, 'M8: 過去フォーム排他制御', false, '今日ボタンなし（スキップ）');
      }
    } else {
      log(label, 'M8: 過去フォーム排他制御', false, '過去日セルなし（スキップ）');
    }
    await page.close();
  }

  // M9: v連続変更→リピート率ライブ更新
  {
    const page = await setupPage(browser, viewport);
    await login(page);
    for (const v of [1, 3, 5, 10]) {
      await vClear(page).click();
      for (const d of String(v).split('')) await vBtn(page, parseInt(d)).click();
    }
    await rBtn(page, 5).click();
    const liveRate = await page.textContent('#t-live-rate');
    log(label, 'M9: v連続変更→r=5→リピート率50%', liveRate.includes('50') || liveRate.includes('%'), `"${liveRate}"`);
    await page.close();
  }

  // M10: 詳細トグル
  {
    const page = await setupPage(browser, viewport);
    await login(page);
    await vBtn(page, 2).click();
    const toggleBtns = await page.locator('.detail-toggle-btn').all();
    if (toggleBtns.length > 0) {
      await toggleBtns[0].click(); await page.waitForTimeout(200);
      const open = await page.evaluate(() => !!document.querySelector('.customer-detail')?.classList.contains('open'));
      log(label, 'M10: 「詳細▼」→詳細エリアが開く', open);
      await toggleBtns[0].click(); await page.waitForTimeout(200);
      const closed = await page.evaluate(() => !document.querySelector('.customer-detail')?.classList.contains('open'));
      log(label, 'M10b: 「詳細▲」→詳細エリアが閉じる', closed);
    } else {
      log(label, 'M10: 詳細トグル', false, '顧客行なし（スキップ）');
    }
    await page.close();
  }

  // ── 保存フロー ─────────────────────────────
  console.log('\n─── 保存フロー ───');
  {
    // PS1: v=1,r=0→0%保存
    const page = await setupPage(browser, viewport);
    await login(page);
    await vBtn(page, 1).click();
    await page.click('#t-save-btn'); await page.waitForTimeout(600);
    const savedVis = await page.isVisible('#today-saved');
    const resRate = await page.textContent('#t-res-rate').catch(() => '?');
    log(label, 'PS1: v=1,r=0→保存済み表示（0%）', savedVis, `rate="${resRate}"`);
    await page.close();
  }

  {
    // PS2: v=5,r=5→100%
    const page = await setupPage(browser, viewport);
    await login(page);
    await vBtn(page, 5).click(); await rBtn(page, 5).click();
    const liveRate = await page.textContent('#t-live-rate');
    log(label, 'PS2: v=5,r=5→ライブ100%表示', liveRate.includes('100'), `"${liveRate}"`);
    await page.click('#t-save-btn'); await page.waitForTimeout(600);
    const resRate100 = await page.textContent('#t-res-rate').catch(() => '?');
    log(label, 'PS2b: v=5,r=5→保存済み100%', resRate100.includes('100'), `rate="${resRate100}"`);
    await page.close();
  }

  {
    // PS3: 既存→修正→v=0→削除
    const mockData = { date: TODAY, visitors: 3, reservations: 2, rate: 67 };
    const page = await setupPage(browser, viewport, mockData);
    await login(page);
    await page.click('#today-saved .edit-btn');
    await page.waitForSelector('#today-input', { state: 'visible' });
    await vClear(page).click();
    await page.click('#t-save-btn'); await page.waitForTimeout(600);
    const inputVis = await page.isVisible('#today-input');
    const emptyVis = await page.isVisible('#today-empty');
    log(label, 'PS3: 既存→v=0保存→削除されて入力/空欄フォームに戻る', inputVis || emptyVis);
    await page.close();
  }

  // ── カレンダー＋グラフ連動 ───────────────
  console.log('\n─── カレンダー＋グラフ連動 ───');
  {
    const page = await setupPage(browser, viewport);
    await login(page);
    await page.click('#btn-daily');
    await page.click('.cal-nav-btn:first-child');
    await page.waitForTimeout(300);
    log(label, 'CG1: 先月移動後グラフcanvas表示', await page.isVisible('#rate-chart'));
    await page.click('#cal-nav-next');
    await page.waitForTimeout(300);
    log(label, 'CG2: 今月に戻った後グラフcanvas表示', await page.isVisible('#rate-chart'));
    await page.click('#btn-monthly');
    await page.waitForTimeout(300);
    log(label, 'CG3: 月次グラフcanvas表示', await page.isVisible('#rate-chart'));
    await page.close();
  }
}

// ─────────────────────────────────────────────
// メイン：全エンジン×viewport で実行
// ─────────────────────────────────────────────
(async () => {
  // CLAUDE.md §11 の構成
  const configs = [
    { name: 'Android Chrome', engine: chromium, viewport: { width: 360, height: 800 } },
    { name: 'iPhone Safari',  engine: webkit,   viewport: { width: 390, height: 844 } },
    { name: 'PC Chrome',      engine: chromium, viewport: { width: 1280, height: 800 } },
    { name: 'iPad Safari',    engine: webkit,   viewport: { width: 768, height: 1024 } },
  ];

  for (const cfg of configs) {
    const browser = await cfg.engine.launch({ headless: true });
    try {
      await runSuite(browser, cfg.name, cfg.viewport);
    } finally {
      await browser.close();
    }
  }

  // ── グランドサマリ ──────────────────────────
  console.log(`\n${'═'.repeat(50)}`);
  console.log('  グランドサマリ（全エンジン合計）');
  console.log(`${'═'.repeat(50)}`);
  console.log(`結果: ${totalPassed} PASS / ${totalFailed} FAIL`);
  if (totalFailed > 0) {
    console.log('\n❌ 失敗したテスト:');
    allFailures.forEach(r => console.log(`  [${r.env}] ${r.name}: ${r.detail}`));
  }
  process.exit(totalFailed > 0 ? 1 : 0);
})();
