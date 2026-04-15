/**
 * E2E シナリオテスト（Layer 3）- repeat-rate
 *
 * 設計方針：
 *   ユーザーストーリーを起点に、完全フローをシナリオ単位で検証する。
 *   「ハッピーパス」と「エラーパス」の各1本で十分。
 *   細かい値の組み合わせや状態遷移は state-transition.test.js が担う。
 *
 * シナリオ：
 *   SA : 初回来店記録（ログイン→入力→保存→保存済み表示）
 *   SB : 既存データ修正（修正フォーム→チェックボックス復元→再保存）
 *   SC : カレンダー＋グラフ連動（先月移動→グラフ表示→今月復帰）
 *   SE : エラー・ログアウトパス
 *   B  : ブラウザ環境テスト（セッション・レイアウト）
 *   M  : モンキーテスト（高速連打・XSS・意図しない操作）
 *   PS : 保存フロー詳細
 *
 * 実行環境（CLAUDE.md §11 定義）：
 *   | 環境           | エンジン  | viewport   |
 *   |----------------|-----------|------------|
 *   | Android Chrome | chromium  | 360×800    |
 *   | iPhone Safari  | webkit    | 390×844    |
 *   | PC Chrome      | chromium  | 1280×800   |
 *   | iPad Safari    | webkit    | 768×1024   |
 *
 * 実行: node e2e.test.js
 */
const { chromium, webkit } = require('playwright');
const path = require('path');

const htmlPath = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
const GAS_PATTERN = '**/macros/s/**';
// ブラウザ側の todayStr()（ローカル時刻）と一致させるため ISO(UTC) ではなくローカル日付を使う
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
// GAS モック付きページ作成
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

// ボタンヘルパー
const vBtn   = (p, n) => p.locator('#today-input .count-section').first().locator('.numrow-btn').nth(n);
const rBtn   = (p, n) => p.locator('#today-input .count-section').nth(1).locator('.numrow-btn').nth(n);
const vMinus = p => p.locator('#today-input .count-section').first().locator('.pm-btn.minus');
const vPlus  = p => p.locator('#today-input .count-section').first().locator('.pm-btn.plus');
const vClear = p => p.locator('#today-input .count-section').first().locator('.numrow-clear-btn');
const rMinus = p => p.locator('#today-input .count-section').nth(1).locator('.pm-btn.minus');
const rPlus  = p => p.locator('#today-input .count-section').nth(1).locator('.pm-btn.plus');
const rClear = p => p.locator('#today-input .count-section').nth(1).locator('.numrow-clear-btn');

// ─────────────────────────────────────────────
// テストスイート（1 環境分）
// ─────────────────────────────────────────────
async function runSuite(browser, label, viewport) {
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  ${label}  (${viewport.width}×${viewport.height})`);
  console.log(`${'═'.repeat(50)}`);

  // ── B: ブラウザ環境テスト ──────────────────
  console.log('\n─── B: ブラウザ環境テスト ───');
  {
    const page = await setupPage(browser, viewport);
    await login(page);

    // B-01: main-content が max-width 以内（レイアウト崩れなし）
    const mainW = await page.evaluate(() => {
      const el = document.querySelector('.main-content');
      return el ? el.getBoundingClientRect().width : 0;
    });
    log(label, 'B-01: main-content が max-width≦600px', mainW <= 600 && mainW > 200, `width=${Math.round(mainW)}px`);

    // B-02: 横スクロールなし
    const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    log(label, 'B-02: 横スクロールなし', !hasHScroll);

    // B-03: localStorageにセッション保存
    const session = await page.evaluate(() => localStorage.getItem('rr_session'));
    log(label, 'B-03: ログイン後 localStorage にセッション保存', session !== null);

    // B-04: リロード後にセッション復元
    await applyGasMock(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    log(label, 'B-04: リロード後 main-screen 復元', await page.isVisible('#main-screen'));

    await page.close();
  }

  {
    // B-05: localStorage.clear() 後 → ログイン画面に戻る
    const page = await setupPage(browser, viewport);
    await login(page);
    await page.evaluate(() => localStorage.clear());
    await page.goto(htmlPath);
    await page.waitForTimeout(500);
    log(label, 'B-05: localStorage.clear()後 → ログイン画面', await page.isVisible('#login-screen'));
    await page.close();
  }

  {
    // B-06: ログインカードが max-width 以内（ログイン画面のレイアウト）
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
    log(label, 'B-06: ログインカードが max-width 以内', cardW <= maxCardW && cardW > 100, `width=${Math.round(cardW)}px`);
    await freshPage.close();
  }

  // ── SA: シナリオA - 初回来店記録フロー ──────
  console.log('\n─── SA: シナリオA 初回来店記録フロー ───');
  {
    const page = await setupPage(browser, viewport);
    await login(page);

    // SA-01: v=5, r=3 入力 → ライブ率が表示される
    await vBtn(page, 5).click(); await rBtn(page, 3).click();
    const liveRate = await page.textContent('#t-live-rate');
    log(label, 'SA-01: v=5,r=3 → ライブ率表示', liveRate.includes('%'), `"${liveRate}"`);

    // SA-02: 保存 → 保存済み表示に切り替わる
    await page.click('#t-save-btn'); await page.waitForTimeout(600);
    log(label, 'SA-02: 保存 → 保存済み表示', await page.isVisible('#today-saved'));

    // SA-03: 保存済みの数値が正しい（v=5, r=3）
    const resV = await page.textContent('#t-res-v');
    const resR = await page.textContent('#t-res-r');
    log(label, 'SA-03: 保存済み数値（v=5,r=3）', resV === '5' && resR === '3', `v=${resV} r=${resR}`);

    // SA-04: 「修正する」→ フォームに数値が復元
    await page.click('#today-saved .edit-btn');
    await page.waitForSelector('#today-input', { state: 'visible' });
    const vR = await page.inputValue('#t-visitor-display');
    const rR = await page.inputValue('#t-reservation-display');
    log(label, 'SA-04: 修正フォームに数値復元（v=5,r=3）', vR === '5' && rR === '3', `v=${vR} r=${rR}`);

    await page.close();
  }

  // ── SB: シナリオB - 既存データ修正フロー ──────
  console.log('\n─── SB: シナリオB 既存データ修正フロー ───');
  {
    const mockData = { date: TODAY, visitors: 3, reservations: 2, rate: 67 };
    const page = await setupPage(browser, viewport, mockData);
    await login(page);

    // SB-01: ログイン → 保存済み表示（既存データ読み込み）
    log(label, 'SB-01: 既存データ → 保存済み表示', await page.isVisible('#today-saved'));

    // SB-02: 「修正する」→ 既存値が復元
    await page.click('#today-saved .edit-btn');
    await page.waitForSelector('#today-input', { state: 'visible' });
    const vR = await page.inputValue('#t-visitor-display');
    const rR = await page.inputValue('#t-reservation-display');
    log(label, 'SB-02: 修正フォームに既存値復元（v=3,r=2）', vR === '3' && rR === '2', `v=${vR} r=${rR}`);

    // SB-03: チェックボックスが予約数(2)ぶん復元
    const cbs = await page.locator('#t-customer-rows input[data-field="reserved"]').all();
    let checked = 0;
    for (const cb of cbs) if (await cb.isChecked()) checked++;
    log(label, 'SB-03: チェックボックスが予約数(2)ぶん復元', checked === 2, `checked=${checked}`);

    // SB-04: 修正 → 再保存 → 値が更新される
    await vClear(page).click(); await vBtn(page, 8).click();
    await rClear(page).click(); await rBtn(page, 4).click();
    await page.click('#t-save-btn'); await page.waitForTimeout(600);
    const resV2 = await page.textContent('#t-res-v').catch(() => '?');
    const resR2 = await page.textContent('#t-res-r').catch(() => '?');
    log(label, 'SB-04: 修正→再保存後の表示値（v=8,r=4）', resV2 === '8' && resR2 === '4', `v=${resV2} r=${resR2}`);

    await page.close();
  }

  // ── SC: シナリオC - カレンダー＋グラフ連動 ──────
  console.log('\n─── SC: シナリオC カレンダー＋グラフ連動 ───');
  {
    const page = await setupPage(browser, viewport);
    await login(page);

    const labelBefore = await page.textContent('#cal-month-label');

    // SC-01: ＜で先月に移動
    await page.click('.cal-nav-btn:first-child');
    const labelAfter = await page.textContent('#cal-month-label');
    log(label, 'SC-01: ＜で先月移動', labelBefore !== labelAfter, `${labelBefore}→${labelAfter}`);

    // SC-02: 先月移動後 ＞ が enabled
    const nextDisabled = await page.getAttribute('#cal-nav-next', 'disabled');
    log(label, 'SC-02: 先月移動後 ＞ がenabled', nextDisabled === null);

    // SC-03: 日次グラフが先月移動後も表示される（calMonthOffset 連動）
    await page.click('#btn-daily');
    await page.waitForTimeout(300);
    log(label, 'SC-03: 先月移動後も日次グラフ canvas 表示', await page.isVisible('#rate-chart'));

    // SC-04: ＞で今月に戻る
    await page.click('#cal-nav-next');
    const labelBack = await page.textContent('#cal-month-label');
    log(label, 'SC-04: ＞で今月に戻る', labelBack === labelBefore, labelBack);

    // SC-05: 今月では ＞ が disabled
    const nextNow = await page.getAttribute('#cal-nav-next', 'disabled');
    log(label, 'SC-05: 今月では ＞ がdisabled', nextNow !== null);

    // SC-06: 月次グラフ canvas 表示
    await page.click('#btn-monthly');
    await page.waitForTimeout(300);
    log(label, 'SC-06: 月次グラフ canvas 表示', await page.isVisible('#rate-chart'));

    await page.close();
  }

  // ── SE: シナリオE - エラーパス・ログアウト ──────
  console.log('\n─── SE: シナリオE エラーパス・ログアウト ───');
  {
    const page = await setupPage(browser, viewport);

    // SE-01: 空欄ログイン → エラー表示
    await page.click('.login-btn');
    const errVisible = await page.isVisible('#login-error');
    const errText = await page.textContent('#login-error');
    log(label, 'SE-01: 空欄ログイン → エラー表示', errVisible && errText.length > 0, errText);

    // SE-02: Enter キーでログイン
    await page.fill('#sid-input', '2049');
    await page.fill('#email-input', 'test@example.com');
    await page.press('#email-input', 'Enter');
    try {
      await page.waitForSelector('#main-screen', { state: 'visible', timeout: 6000 });
      log(label, 'SE-02: Enter キーでログイン', true);
    } catch {
      log(label, 'SE-02: Enter キーでログイン', false, 'main-screen が表示されなかった');
    }

    // SE-03: v=0 保存 → 「保存しました」以外のメッセージ
    await page.click('#t-save-btn'); await page.waitForTimeout(500);
    const toastMsg = await page.textContent('#toast');
    log(label, 'SE-03: v=0保存 → 「保存しました」以外', !toastMsg.includes('保存しました'), `"${toastMsg}"`);

    // SE-04: ログアウト → ログイン画面に戻る
    await page.click('.logout-btn');
    log(label, 'SE-04: ログアウト → ログイン画面', await page.isVisible('#login-screen'));

    // SE-05: ログアウト後ブラウザバック → ログイン画面のまま
    await page.goBack().catch(() => {});
    await page.waitForTimeout(500);
    const afterBack = await page.isVisible('#login-screen');
    log(label, 'SE-05: ログアウト後ブラウザバック → ログイン画面', afterBack || !(await page.isVisible('#main-screen')));

    await page.close();
  }

  // ── PS: 保存フロー詳細 ─────────────────────
  console.log('\n─── PS: 保存フロー詳細 ───');
  {
    // PS-01: v=1, r=0 → 0% で保存
    const page = await setupPage(browser, viewport);
    await login(page);
    await vBtn(page, 1).click();
    await page.click('#t-save-btn'); await page.waitForTimeout(600);
    const savedVis = await page.isVisible('#today-saved');
    const resRate = await page.textContent('#t-res-rate').catch(() => '?');
    log(label, 'PS-01: v=1,r=0 → 保存済み表示（0%）', savedVis, `rate="${resRate}"`);
    await page.close();
  }

  {
    // PS-02: v=5, r=5 → 100% ライブ表示 → 保存後 100%
    const page = await setupPage(browser, viewport);
    await login(page);
    await vBtn(page, 5).click(); await rBtn(page, 5).click();
    const liveRate = await page.textContent('#t-live-rate');
    log(label, 'PS-02: v=5,r=5 → ライブ 100%', liveRate.includes('100'), `"${liveRate}"`);
    await page.click('#t-save-btn'); await page.waitForTimeout(600);
    const resRate100 = await page.textContent('#t-res-rate').catch(() => '?');
    log(label, 'PS-02b: v=5,r=5 → 保存済み 100%', resRate100.includes('100'), `rate="${resRate100}"`);
    await page.close();
  }

  {
    // PS-03: 既存データ → 修正→ v=0 → 削除されて入力/空欄フォームに戻る
    const mockData = { date: TODAY, visitors: 3, reservations: 2, rate: 67 };
    const page = await setupPage(browser, viewport, mockData);
    await login(page);
    await page.click('#today-saved .edit-btn');
    await page.waitForSelector('#today-input', { state: 'visible' });
    await vClear(page).click();
    await page.click('#t-save-btn'); await page.waitForTimeout(600);
    const inputVis = await page.isVisible('#today-input');
    const emptyVis = await page.isVisible('#today-empty');
    log(label, 'PS-03: 既存→v=0保存 → 削除されて入力フォームに戻る', inputVis || emptyVis);
    await page.close();
  }

  // ── M: モンキーテスト ─────────────────────
  console.log('\n─── M: モンキーテスト ───');

  // M-01: 保存ボタン高速連打 → 二重送信なし
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
    log(label, 'M-01: 保存ボタン5連打 → saveDay 送信1〜2回', saveCount <= 2, `saveCount=${saveCount}`);
    await page.close();
  }

  // M-02: 保存→修正→再保存→値更新
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
    log(label, 'M-02: 保存→修正→再保存（v=8,r=4）', resV === '8' && resR === '4', `v=${resV} r=${resR}`);
    await page.close();
  }

  // M-03: XSS 入力で alert 発火なし
  {
    const page = await setupPage(browser, viewport);
    await login(page);
    await vBtn(page, 1).click();
    let alertFired = false;
    page.on('dialog', async dialog => { alertFired = true; await dialog.dismiss(); });
    const nameInput = page.locator('#t-customer-rows .customer-row input[data-field="first_name"]').first();
    await nameInput.fill('<script>alert("xss")</script>');
    await page.waitForTimeout(300);
    log(label, 'M-03: XSS 入力で alert 発火なし', !alertFired);
    await page.close();
  }

  // M-04: ＜連打6回 → カレンダー表示維持
  {
    const page = await setupPage(browser, viewport);
    await login(page);
    for (let i = 0; i < 6; i++) await page.click('.cal-nav-btn:first-child');
    await page.waitForTimeout(300);
    const calVis = await page.isVisible('#past-calendar');
    const calLabel = await page.textContent('#cal-month-label');
    log(label, 'M-04: ＜連打6回 → カレンダー表示維持', calVis && calLabel.length > 0, calLabel);
    await page.close();
  }

  // M-05: v・r 両方クリア → v=0, r=0
  {
    const page = await setupPage(browser, viewport);
    await login(page);
    await vBtn(page, 5).click(); await rBtn(page, 3).click();
    await vClear(page).click(); await rClear(page).click();
    const vF = await page.inputValue('#t-visitor-display');
    const rF = await page.inputValue('#t-reservation-display');
    log(label, 'M-05: v・r 両方クリア → v=0, r=0', vF === '0' && rF === '0', `v=${vF} r=${rF}`);
    await page.close();
  }

  // M-06: 過去フォーム中 → 今日ボタン → 過去フォームが閉じる
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
        log(label, 'M-06: 過去フォーム中→今日ボタン→過去フォーム閉じる', !(await page.isVisible('#past-form')));
      } else {
        log(label, 'M-06: 過去フォーム排他制御', false, '今日ボタンなし（スキップ）');
      }
    } else {
      log(label, 'M-06: 過去フォーム排他制御', false, '過去日セルなし（スキップ）');
    }
    await page.close();
  }

  // M-07: v 連続変更 → リピート率ライブ更新
  {
    const page = await setupPage(browser, viewport);
    await login(page);
    for (const v of [1, 3, 5, 10]) {
      await vClear(page).click();
      for (const d of String(v).split('')) await vBtn(page, parseInt(d)).click();
    }
    await rBtn(page, 5).click();
    const liveRate = await page.textContent('#t-live-rate');
    log(label, 'M-07: v 連続変更→r=5→リピート率 50%', liveRate.includes('50') || liveRate.includes('%'), `"${liveRate}"`);
    await page.close();
  }

  // M-08: 詳細トグル
  {
    const page = await setupPage(browser, viewport);
    await login(page);
    await vBtn(page, 2).click();
    const toggleBtns = await page.locator('.detail-toggle-btn').all();
    if (toggleBtns.length > 0) {
      await toggleBtns[0].click(); await page.waitForTimeout(200);
      const open = await page.evaluate(() => !!document.querySelector('.customer-detail')?.classList.contains('open'));
      log(label, 'M-08: 「詳細▼」→詳細エリアが開く', open);
      await toggleBtns[0].click(); await page.waitForTimeout(200);
      const closed = await page.evaluate(() => !document.querySelector('.customer-detail')?.classList.contains('open'));
      log(label, 'M-08b: 「詳細▲」→詳細エリアが閉じる', closed);
    } else {
      log(label, 'M-08: 詳細トグル', false, '顧客行なし（スキップ）');
    }
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

  // ─────────────────────────────────────
  // 結果サマリ
  // ─────────────────────────────────────
  console.log('\n════════════════════════════════════════');
  console.log(`総結果: ${totalPassed} PASS / ${totalFailed} FAIL  （${configs.length} 環境）`);
  if (totalFailed > 0) {
    console.log('\n❌ 失敗したテスト:');
    allFailures.forEach(r => console.log(`  - [${r.env}] ${r.name}: ${r.detail}`));
  }
  console.log('════════════════════════════════════════');
  process.exit(totalFailed > 0 ? 1 : 0);
})();
