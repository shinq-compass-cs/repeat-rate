/**
 * 状態遷移テスト（Layer 2）- repeat-rate
 *
 * 設計方針：
 *   「操作できるか」ではなく「ある状態のとき、ある操作をするとどうなるか」を検証する。
 *   テストを書く前に状態空間を列挙し、状態×操作のマトリクスで MECE を担保する。
 *
 * 状態空間：
 *   v: 0（初期/消去後） / 1〜98（中間） / 99（上限）
 *   r: 0（初期） / 1〜cap-1（中間） / cap=v（上限）
 *   フラグ: フレッシュ（次 numrow=置換） / 追記（次 numrow=追記）
 *     → フレッシュになる操作: 消去・±・overflow 後の cap 丸め
 *     → 追記になる操作: numrow 通常入力・テキスト直入力
 *
 * テスト ID 命名規則：
 *   ST-V-{STATE}-{連番}     : 施術数(v)の状態遷移
 *   ST-R-{STATE}-{連番}     : 予約数(r)の状態遷移
 *   ST-SYNC-{連番}          : v 変化による r 連動
 *   REG-BUG-{YYYYMMDD}-{連番} : バグ修正後の回帰テスト（TDD）
 *
 * 単一エンジン（chromium / iPhone viewport）で実行する。
 * 環境差異の検証は e2e.test.js が担う。
 *
 * 実行: node state-transition.test.js
 */
const { chromium } = require('playwright');
const path = require('path');

const htmlPath = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
const GAS_PATTERN = '**/macros/s/**';
// ブラウザ側の todayStr()（ローカル時刻）と一致させるため ISO(UTC) ではなくローカル日付を使う
const _td = new Date();
const TODAY = _td.getFullYear() + '-' + String(_td.getMonth() + 1).padStart(2, '0') + '-' + String(_td.getDate()).padStart(2, '0');

let passed = 0, failed = 0;
const failedList = [];

function log(id, name, ok, detail = '') {
  const mark = ok ? '✅' : '❌';
  console.log(`${mark} [${id}] ${name}${detail ? '  →  ' + detail : ''}`);
  if (ok) passed++;
  else { failed++; failedList.push({ id, name, detail }); }
}

async function setupPage(browser, mockToday = null) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14 相当
  await page.route(GAS_PATTERN, async (route) => {
    const body = route.request().postData() || '{}';
    let payload = {};
    try { payload = JSON.parse(body); } catch (_) {}
    let resp = { success: true };
    if (payload.action === 'login') {
      resp = { success: true, salon_name: 'テスト鍼灸院' };
    } else if (payload.action === 'loginAndGetData') {
      resp = { success: true, salon_name: 'テスト鍼灸院', days: mockToday ? [mockToday] : [], customers: [] };
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
  await page.goto(htmlPath);
  return page;
}

async function login(page) {
  await page.fill('#sid-input', '2049');
  await page.fill('#email-input', 'test@example.com');
  await page.click('.login-btn');
  await page.waitForSelector('#main-screen', { state: 'visible', timeout: 8000 });
}

// ─────────────────────────────────────────────
// ボタンヘルパー
// ─────────────────────────────────────────────
const vBtn   = (p, n) => p.locator('#today-input .count-section').first().locator('.numrow-btn').nth(n);
const rBtn   = (p, n) => p.locator('#today-input .count-section').nth(1).locator('.numrow-btn').nth(n);
const vPlus  = p => p.locator('#today-input .count-section').first().locator('.pm-btn.plus');
const vMinus = p => p.locator('#today-input .count-section').first().locator('.pm-btn.minus');
const vClear = p => p.locator('#today-input .count-section').first().locator('.numrow-clear-btn');
const rPlus  = p => p.locator('#today-input .count-section').nth(1).locator('.pm-btn.plus');
const rMinus = p => p.locator('#today-input .count-section').nth(1).locator('.pm-btn.minus');
const rClear = p => p.locator('#today-input .count-section').nth(1).locator('.numrow-clear-btn');
const getV = p => p.inputValue('#t-visitor-display');
const getR = p => p.inputValue('#t-reservation-display');

(async () => {
  const browser = await chromium.launch({ headless: true });

  // ═══════════════════════════════════════════════════════════════
  // ST-V-ZERO: v=0（初期/消去後）状態 × 各操作
  // ─ フレッシュフラグ=true の状態
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── ST-V-ZERO: v=0（初期/消去後）状態 ───');
  {
    const page = await setupPage(browser);
    await login(page);

    // 状態確認
    log('ST-V-ZERO-00', '初期状態 v=0', await getV(page) === '0');

    // numrow[0] → 0×10=0（変化なし）
    await vBtn(page, 0).click();
    log('ST-V-ZERO-01', 'v=0 × numrow[0] → v=0', await getV(page) === '0');

    // numrow[3] → フレッシュ置換 → v=3
    await vBtn(page, 3).click();
    log('ST-V-ZERO-02', 'v=0 × numrow[3] → v=3（フレッシュ置換）', await getV(page) === '3');

    // 消去後 numrow[5] → フレッシュ置換 → v=5
    await vClear(page).click();
    await vBtn(page, 5).click();
    log('ST-V-ZERO-03', '消去後 × numrow[5] → v=5（フレッシュ置換）', await getV(page) === '5');

    // ± 後 numrow[7] → フレッシュ置換 → v=7
    await vClear(page).click();
    await vBtn(page, 3).click(); // v=3
    await vPlus(page).click();   // v=4, vf=true（フレッシュに戻る）
    await vBtn(page, 7).click(); // フレッシュ → v=7
    log('ST-V-ZERO-04', '±後 × numrow[7] → v=7（フレッシュ置換）', await getV(page) === '7');

    // マイナス連打 → 0止まり（負にならない）
    await vClear(page).click();
    for (let i = 0; i < 5; i++) await vMinus(page).click();
    log('ST-V-ZERO-05', 'v=0 × マイナス連打 → 0止まり', await getV(page) === '0');

    await page.close();
  }

  // ═══════════════════════════════════════════════════════════════
  // ST-V-MID: v=中間値（フレッシュ/追記）状態 × 各操作
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── ST-V-MID: v=中間値 状態 ───');
  {
    const page = await setupPage(browser);
    await login(page);

    // numrow 追記（v=5 → 53）
    await vBtn(page, 5).click(); // v=5, vf=false（追記）
    await vBtn(page, 3).click(); // 追記 → v=53
    log('ST-V-MID-01', 'v=5（追記）× numrow[3] → v=53（追記）', await getV(page) === '53');

    // 追記でオーバーフロー → key 値に置換（53 → 539 は 99 超え → key=9 → v=9）
    await vBtn(page, 9).click();
    log('ST-V-MID-02', 'v=53（追記）× numrow[9] → overflow → v=9（key置換）', await getV(page) === '9');

    // overflow 後のフラグ確認：
    //   np() は `buf[sec][fk] = keyInt > cap` で判定する。
    //   v の cap=99 に対してシングルキー（最大9）は常に <= cap → フラグは追記のまま。
    //   よって numrow[2] → 追記 → v = 9*10+2 = 92。
    await vBtn(page, 2).click();
    const vAfterOvf = await getV(page);
    log('ST-V-MID-03', 'v overflow（key<cap=99）× numrow[2] → v=92（追記継続）', vAfterOvf === '92', `v=${vAfterOvf}`);

    // プラス
    await vClear(page).click();
    await vBtn(page, 5).click();
    await vPlus(page).click();
    log('ST-V-MID-04', 'v=5 × プラス → v=6', await getV(page) === '6');

    // マイナス
    await vMinus(page).click();
    log('ST-V-MID-05', 'v=6 × マイナス → v=5', await getV(page) === '5');

    // 消去 → v=0
    await vClear(page).click();
    log('ST-V-MID-06', 'v=5 × 消去 → v=0', await getV(page) === '0');

    // テキスト直入力 → v=8
    await page.fill('#t-visitor-display', '8');
    await page.dispatchEvent('#t-visitor-display', 'input');
    log('ST-V-MID-07', 'テキスト直入力 → v=8', await getV(page) === '8');

    // テキスト直入力後 numrow → 追記（v=81）
    await vBtn(page, 1).click();
    log('ST-V-MID-08', 'テキスト直入力後 × numrow[1] → v=81（追記）', await getV(page) === '81');

    // テキスト「abc」→ 非数字フィルタで v=0
    await page.fill('#t-visitor-display', 'abc');
    await page.dispatchEvent('#t-visitor-display', 'input');
    const vAlpha = await getV(page);
    log('ST-V-MID-09', 'テキスト「abc」→ 非数字フィルタ v=0', vAlpha === '0' || vAlpha === '');

    // テキスト「999」→ 2桁上限で v=99
    await page.fill('#t-visitor-display', '999');
    await page.dispatchEvent('#t-visitor-display', 'input');
    log('ST-V-MID-10', 'テキスト「999」→ 2桁上限 v=99', await getV(page) === '99');

    await page.close();
  }

  // ═══════════════════════════════════════════════════════════════
  // ST-V-CAP: v=99（上限）状態 × 各操作
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── ST-V-CAP: v=99（上限）状態 ───');
  {
    const page = await setupPage(browser);
    await login(page);

    // v=99 に到達
    for (let i = 0; i < 105; i++) await vPlus(page).click();
    log('ST-V-CAP-00', 'プラス連打 → v=99（上限止まり）', await getV(page) === '99');

    // numrow[key < cap] → 1回で変更できる（フレッシュ置換）
    await vBtn(page, 4).click();
    log('ST-V-CAP-01', 'v=99 × numrow[4] → v=4（1回で変更）', await getV(page) === '4');

    // v=99 に再設定
    await page.fill('#t-visitor-display', '99');
    await page.dispatchEvent('#t-visitor-display', 'input');

    // numrow[9]（key=cap）→ フレッシュ → v=9
    await vBtn(page, 9).click();
    log('ST-V-CAP-02', 'v=99 × numrow[9] → v=9（フレッシュ置換）', await getV(page) === '9');

    // v=99 に再設定してプラス → 止まる
    await page.fill('#t-visitor-display', '99');
    await page.dispatchEvent('#t-visitor-display', 'input');
    for (let i = 0; i < 5; i++) await vPlus(page).click();
    log('ST-V-CAP-03', 'v=99 × プラス連打 → 99止まり', await getV(page) === '99');

    // マイナス → 98
    await vMinus(page).click();
    log('ST-V-CAP-04', 'v=99 × マイナス → v=98', await getV(page) === '98');

    await page.close();
  }

  // ═══════════════════════════════════════════════════════════════
  // ST-R-ZERO: r=0（v設定済み）状態 × 各操作
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── ST-R-ZERO: r=0（v設定済み）状態 ───');
  {
    const page = await setupPage(browser);
    await login(page);

    // v=0 のとき numrow → トースト（先に施術数を入力）
    await rBtn(page, 1).click();
    await page.waitForTimeout(300);
    const toast = await page.textContent('#toast');
    log('ST-R-ZERO-01', 'v=0 × r numrow → トースト表示', toast.includes('先に') || toast.includes('施術'), `"${toast}"`);

    // v=5 に設定
    await vBtn(page, 5).click();

    // numrow[0] → 0（変化なし）
    await rBtn(page, 0).click();
    log('ST-R-ZERO-02', 'r=0 × numrow[0] → r=0', await getR(page) === '0');

    // numrow[3] → フレッシュ置換 → r=3
    await rBtn(page, 3).click();
    log('ST-R-ZERO-03', 'r=0 × numrow[3] → r=3（フレッシュ置換）', await getR(page) === '3');

    await page.close();
  }

  // ═══════════════════════════════════════════════════════════════
  // ST-R-MID: r=中間値 状態 × 各操作
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── ST-R-MID: r=中間値 状態 ───');
  {
    const page = await setupPage(browser);
    await login(page);
    await vBtn(page, 5).click(); // v=5（cap=5）
    await rBtn(page, 2).click(); // r=2

    // numrow 追記でオーバーフロー（2→24 > cap=5 → cap 丸め）
    await rBtn(page, 4).click();
    const r24 = parseInt(await getR(page));
    log('ST-R-MID-01', 'r=2 × numrow[4] → 24>cap → cap に丸め', r24 <= 5, `r=${r24}`);

    // cap 丸め後はフレッシュ（次の numrow は置換）
    await rBtn(page, 3).click();
    log('ST-R-MID-02', 'cap丸め後 × numrow[3] → r=3（フレッシュ置換）', await getR(page) === '3');

    // プラス
    await rClear(page).click();
    await rBtn(page, 2).click();
    await rPlus(page).click();
    log('ST-R-MID-03', 'r=2 × プラス → r=3', await getR(page) === '3');

    // マイナス
    await rMinus(page).click();
    log('ST-R-MID-04', 'r=3 × マイナス → r=2', await getR(page) === '2');

    // マイナス連打 → 0止まり
    for (let i = 0; i < 5; i++) await rMinus(page).click();
    log('ST-R-MID-05', 'r × マイナス連打 → 0止まり', await getR(page) === '0');

    // プラス連打 → cap(v=5)止まり
    for (let i = 0; i < 10; i++) await rPlus(page).click();
    const rMax = parseInt(await getR(page));
    log('ST-R-MID-06', 'r × プラス連打 → cap(v=5)止まり', rMax <= 5, `r=${rMax}`);

    // 消去 → r=0
    await rClear(page).click();
    log('ST-R-MID-07', 'r × 消去 → r=0', await getR(page) === '0');

    await page.close();
  }

  // ═══════════════════════════════════════════════════════════════
  // ST-R-CAP: r=cap（上限=v）状態 × 各操作
  // ─ 2026-03-22 バグ発生箇所。状態×操作のマトリクスで確実に網羅する。
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── ST-R-CAP: r=cap（上限）状態 ───');
  {
    const page = await setupPage(browser);
    await login(page);
    await vBtn(page, 6).click(); // v=6（cap=6）
    await rBtn(page, 6).click(); // r=6（=cap）
    log('ST-R-CAP-00', 'r=cap(6) 状態確認', await getR(page) === '6');

    // numrow[key < cap] → 1回で変更できる（フレッシュ置換）
    await rBtn(page, 4).click();
    log('ST-R-CAP-01', 'r=cap(6) × numrow[4] → r=4（1回で変更）', await getR(page) === '4');

    // r=cap に再設定
    await rClear(page).click();
    await rBtn(page, 6).click();

    // numrow[key = cap] → フレッシュ後 key=6 < cap NG? No: key=6 <= cap=6 → r=6
    await rBtn(page, 6).click();
    log('ST-R-CAP-02', 'r=cap(6) × numrow[6] → r=6（cap以内維持）', await getR(page) === '6');

    // r=cap に再設定
    await rClear(page).click();
    await rBtn(page, 6).click();

    // numrow[key > cap] → フレッシュ後 key=9 > cap=6 → cap丸め → vf=true
    await rBtn(page, 9).click();
    const rCapped = parseInt(await getR(page));
    log('ST-R-CAP-03', 'r=cap(6) × numrow[9] → cap(6)に丸め', rCapped <= 6, `r=${rCapped}`);

    // cap丸め後はフレッシュ（次の numrow は置換）
    await rBtn(page, 3).click();
    log('ST-R-CAP-04', 'cap丸め後 × numrow[3] → r=3（フレッシュ置換）', await getR(page) === '3');

    // r=cap に再設定してプラス → 止まる
    await rClear(page).click();
    await rBtn(page, 6).click();
    await rPlus(page).click();
    log('ST-R-CAP-05', 'r=cap(6) × プラス → cap止まり', await getR(page) === '6');

    // マイナス → r=5
    await rMinus(page).click();
    log('ST-R-CAP-06', 'r=cap(6) × マイナス → r=5', await getR(page) === '5');

    await page.close();
  }

  // ═══════════════════════════════════════════════════════════════
  // ST-SYNC: v 変化による r 連動
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── ST-SYNC: v 変化による r 連動 ───');
  {
    const page = await setupPage(browser);
    await login(page);

    // v=5, r=3 → v をマイナスで 2 に → r=2 に連動（r が新 cap 以内）
    await vBtn(page, 5).click();
    await rBtn(page, 3).click();
    await vMinus(page).click(); await vMinus(page).click(); await vMinus(page).click();
    log('ST-SYNC-01', 'v=5,r=3 → v=2（マイナス）→ r=2連動', await getR(page) === '2');

    // v=5, r=5（=cap）→ v をマイナスで 3 に → r=3 に連動（cap を超えるため切り捨て）
    await vClear(page).click(); await rClear(page).click();
    await vBtn(page, 5).click(); await rBtn(page, 5).click();
    await vMinus(page).click(); await vMinus(page).click();
    log('ST-SYNC-02', 'v=5,r=5 → v=3（マイナス）→ r=3連動', await getR(page) === '3');

    // v=0 に戻す → r=0 に連動
    await vClear(page).click();
    log('ST-SYNC-03', 'v=0 に戻す → r=0連動', await getR(page) === '0');

    // テキスト直入力 r>v → cap 丸め
    await vBtn(page, 3).click();
    await page.fill('#t-reservation-display', '10');
    await page.dispatchEvent('#t-reservation-display', 'input');
    log('ST-SYNC-04', 'テキスト直入力 r=10 > v=3 → cap(3)に丸め', await getR(page) === '3');

    // v を numrow で直接変更（減少）→ r が新 cap に連動
    await vClear(page).click(); await rClear(page).click();
    await vBtn(page, 5).click(); await rBtn(page, 5).click();
    await vClear(page).click();
    await vBtn(page, 3).click(); // v=3（cap=3）
    const rSync = parseInt(await getR(page));
    log('ST-SYNC-05', 'v=5,r=5 → v=3（numrow）→ r≦3に連動', rSync <= 3, `r=${rSync}`);

    await page.close();
  }

  // ═══════════════════════════════════════════════════════════════
  // REG: バグ修正後の回帰テスト（TDD）
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── REG: 回帰テスト ───');
  {
    const page = await setupPage(browser);
    await login(page);

    // REG-BUG-0322-01: v=6,r=6(cap)状態で numrow[4] → r=4（2026-03-22 修正）
    // 修正前: cap 状態で numrow が反応せず cap に張り付いたまま
    await vBtn(page, 6).click();
    await rBtn(page, 6).click();
    await rBtn(page, 4).click();
    log('REG-BUG-0322-01', 'r=cap(6)→numrow[4]→r=4（1回で変更）', await getR(page) === '4');

    // REG-BUG-0322-02: r=cap → numrow[2]→[4]→[4] 連続 → r=4
    await rClear(page).click();
    await rBtn(page, 6).click();  // r=6（cap）
    await rBtn(page, 2).click();  // フレッシュ → r=2
    await rBtn(page, 4).click();  // 追記 → 24>6 → cap→vf=true
    await rBtn(page, 4).click();  // フレッシュ → r=4
    log('REG-BUG-0322-02', 'r=cap→「2」「4」「4」連続→r=4', await getR(page) === '4');

    await page.close();
  }

  // REG-BUG-0322-03: 削除済み（顧客詳細入力セクション削除に伴い不要）

  // ─────────────────────────────────────
  // 結果サマリ
  // ─────────────────────────────────────
  await browser.close();
  console.log('\n════════════════════════════════════════');
  console.log(`結果: ${passed} PASS / ${failed} FAIL`);
  if (failed > 0) {
    console.log('\n❌ 失敗したテスト:');
    failedList.forEach(r => console.log(`  - [${r.id}] ${r.name}: ${r.detail}`));
  }
  console.log('════════════════════════════════════════');
  process.exit(failed > 0 ? 1 : 0);
})();
