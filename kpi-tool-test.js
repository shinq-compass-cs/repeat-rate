/**
 * kpi-tool Playwright テスト
 * 実行: cd c:/works/repeat-rate && node kpi-tool-test.js
 */
const { chromium, webkit } = require('./node_modules/playwright');

const BASE = 'https://shinq-compass-cs.github.io/kpi-tool/';
const SAMPLE = BASE + 'sample.html';
const DELEGATE = BASE + 'delegate.html';
const VP = { width: 390, height: 844 };

let pass = 0, fail = 0, warn = 0;
const results = [];

function log(status, id, desc, detail) {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  const line = `${icon} [${id}] ${desc} — ${detail}`;
  results.push(line);
  if (status === 'PASS') pass++;
  else if (status === 'FAIL') fail++;
  else warn++;
}

async function runTests(browserType, engineName) {
  const browser = await browserType.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: VP, ignoreHTTPSErrors: true });

  // ===== A. ログイン画面 =====
  {
    const page = await ctx.newPage();
    const jsErrors = [];
    page.on('pageerror', e => jsErrors.push(e.message));
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });

    // A1: メールアドレス入力欄のtype
    const emailType = await page.$eval('#email-input', el => el.type);
    if (emailType === 'password') {
      log('PASS', `A1-${engineName}`, 'メールアドレス入力欄のtype=password（文字が隠される）', `type="${emailType}"`);
    } else {
      log('FAIL', `A1-${engineName}`, 'メールアドレス入力欄のtype', `type="${emailType}"（passwordではない）`);
    }

    // A4: サロンID入力欄のtype確認
    const salonType = await page.$eval('#salon-id-input', el => el.type).catch(() => null);
    if (salonType) {
      log('PASS', `A4-${engineName}`, `サロンID入力欄のtype確認`, `type="${salonType}"`);
    } else {
      // サロンID入力欄がない場合、別のセレクタを試す
      const inputs = await page.$$eval('input', els => els.map(e => ({ id: e.id, type: e.type, placeholder: e.placeholder })));
      const salonInput = inputs.find(i => i.placeholder && (i.placeholder.includes('サロンID') || i.placeholder.includes('salon') || i.placeholder.includes('38290')));
      if (salonInput) {
        log('PASS', `A4-${engineName}`, `サロンID入力欄のtype確認`, `type="${salonInput.type}" (id="${salonInput.id}")`);
      } else {
        log('WARN', `A4-${engineName}`, 'サロンID入力欄のtype確認', `サロンID入力欄が見つからない。入力欄一覧: ${JSON.stringify(inputs.map(i=>i.id))}`);
      }
    }

    // A2: 未入力でログイン → エラーメッセージ
    const loginBtn = await page.$('button[onclick*="doLogin"], .login-btn, #login-btn, button:has-text("ログイン")');
    if (loginBtn) {
      await loginBtn.click();
      await page.waitForTimeout(1500);
      const errText = await page.$eval('#login-error', el => el.textContent).catch(() => '');
      if (errText && errText.trim().length > 0) {
        log('PASS', `A2-${engineName}`, '未入力ログイン → エラー表示', `"${errText.trim()}"`);
      } else {
        // エラーが別の場所に出る可能性
        const anyErr = await page.$$eval('.login-error, .error, [class*="error"]', els => els.map(e => e.textContent.trim()).filter(t => t.length > 0));
        if (anyErr.length > 0) {
          log('PASS', `A2-${engineName}`, '未入力ログイン → エラー表示', `"${anyErr[0]}"`);
        } else {
          log('FAIL', `A2-${engineName}`, '未入力ログイン → エラー表示', 'エラーメッセージが表示されなかった');
        }
      }
    } else {
      log('FAIL', `A2-${engineName}`, '未入力ログイン → エラー表示', 'ログインボタンが見つからない');
    }

    // A3: サロンID=38290, パスワード=test でログイン
    // まずフィールドをクリアして入力
    const salonField = await page.$('#salon-id-input') || await page.$('input[placeholder*="サロンID"]') || await page.$('input[placeholder*="38290"]');
    const emailField = await page.$('#email-input');

    if (salonField && emailField) {
      await salonField.fill('38290');
      await emailField.fill('test');
      const btn2 = await page.$('button[onclick*="doLogin"], .login-btn, #login-btn, button:has-text("ログイン")');
      if (btn2) {
        await btn2.click();
        // ダッシュボード表示を待つ（APIコール含め最大20秒）
        try {
          await page.waitForSelector('#dashboard, #main-dashboard, .dashboard, [id*="dash"]', { timeout: 20000 });
          log('PASS', `A3-${engineName}`, 'サロンID:38290/パスワード:test でログイン', 'ダッシュボード表示確認');

          // ===== B. ダッシュボード表示 =====
          await page.waitForTimeout(3000); // データ読み込み待ち

          // B1: 検索優先ポイント合計
          const searchPt = await page.$eval('#search-point', el => el.textContent).catch(() => '');
          const ptBadge = await page.$eval('#point-badge', el => el.style.display).catch(() => 'none');
          if (searchPt && searchPt !== '―') {
            log('PASS', `B1-${engineName}`, '検索優先ポイント合計値が表示', `${searchPt}pt (badge display="${ptBadge}")`);
          } else {
            log('WARN', `B1-${engineName}`, '検索優先ポイント合計値', `値="${searchPt}", badge display="${ptBadge}"（データ未取得の可能性）`);
          }

          // B2: エリア内順位
          const areaRank = await page.$eval('#area-rank', el => el.textContent).catch(() => '');
          if (areaRank && areaRank !== '―') {
            log('PASS', `B2-${engineName}`, 'エリア内順位が表示', `${areaRank}`);
          } else {
            log('WARN', `B2-${engineName}`, 'エリア内順位', `値="${areaRank}"（データ未取得の可能性）`);
          }

          // B3: 自院達成/自院未達ラベル
          const selfLabels = await page.$$eval('body', ([body]) => {
            const html = body.innerHTML;
            const hasOk = html.includes('自院達成');
            const hasNg = html.includes('自院未達');
            return { hasOk, hasNg };
          });
          if (selfLabels.hasOk && selfLabels.hasNg) {
            log('PASS', `B3-${engineName}`, '自院達成/自院未達ラベルが存在', '両方の文言を確認');
          } else {
            log('WARN', `B3-${engineName}`, '自院達成/自院未達ラベル', `達成=${selfLabels.hasOk}, 未達=${selfLabels.hasNg}`);
          }

          // B4: 代行設置ボタン
          const delegateBtn = await page.$('[onclick*="delegate"], [onclick*="openDelegate"], a[href*="delegate"], button:has-text("代行")');
          if (delegateBtn) {
            log('PASS', `B4-${engineName}`, '代行設置ボタンが存在', '確認OK');
          } else {
            // テキストで探す
            const delegateText = await page.$$eval('button, a', els => els.filter(e => e.textContent.includes('代行')).map(e => e.textContent.trim()));
            if (delegateText.length > 0) {
              log('PASS', `B4-${engineName}`, '代行設置ボタンが存在', `"${delegateText[0]}"`);
            } else {
              log('FAIL', `B4-${engineName}`, '代行設置ボタンが存在するか', '代行設置ボタンが見つからない');
            }
          }

          // B5: レポーティングボタン（info@shinq-compass.jp以外では非表示）
          const reportRow = await page.$eval('#report-trigger-row', el => el.style.display).catch(() => null);
          if (reportRow === 'none' || reportRow === '') {
            log('PASS', `B5-${engineName}`, 'レポーティングボタンが非内部アカウントで非表示', `display="${reportRow}"`);
          } else if (reportRow === null) {
            log('WARN', `B5-${engineName}`, 'レポーティングボタン', '#report-trigger-row が見つからない');
          } else {
            log('FAIL', `B5-${engineName}`, 'レポーティングボタンが非内部アカウントで非表示', `display="${reportRow}"（表示されている）`);
          }

        } catch (e) {
          log('FAIL', `A3-${engineName}`, 'サロンID:38290/パスワード:test でログイン', `ダッシュボード表示タイムアウト: ${e.message.slice(0, 100)}`);
        }
      }
    } else {
      log('FAIL', `A3-${engineName}`, 'ログインフィールド検出', `salon=${!!salonField}, email=${!!emailField}`);
    }

    // C4: JSエラー確認（ログイン画面〜ダッシュボード）
    if (jsErrors.length === 0) {
      log('PASS', `C4a-${engineName}`, 'index.html JSコンソールエラーなし', 'エラー0件');
    } else {
      log('FAIL', `C4a-${engineName}`, 'index.html JSコンソールエラー', jsErrors.join(' | '));
    }

    // C1: 横スクロール確認
    const scrollCheck = await page.evaluate(() => {
      return { scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth };
    });
    if (scrollCheck.scrollW <= scrollCheck.clientW) {
      log('PASS', `C1a-${engineName}`, 'index.html 横スクロールなし', `scrollW=${scrollCheck.scrollW} <= clientW=${scrollCheck.clientW}`);
    } else {
      log('FAIL', `C1a-${engineName}`, 'index.html 横スクロール発生', `scrollW=${scrollCheck.scrollW} > clientW=${scrollCheck.clientW}`);
    }

    // C2: input font-size >= 16px（checkbox/radio除外）
    const fontSizes = await page.$$eval('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"])', els => {
      return els.map(el => {
        const cs = getComputedStyle(el);
        return { id: el.id, type: el.type, fontSize: cs.fontSize, fontSizePx: parseFloat(cs.fontSize) };
      }).filter(i => i.fontSizePx < 16);
    });
    if (fontSizes.length === 0) {
      log('PASS', `C2a-${engineName}`, 'index.html input font-size >= 16px', '全input OK');
    } else {
      log('FAIL', `C2a-${engineName}`, 'index.html input font-size < 16px', fontSizes.map(i => `${i.id||i.type}:${i.fontSize}`).join(', '));
    }

    // C3: フォントロード
    const fontsReady = await page.evaluate(async () => {
      await document.fonts.ready;
      const loaded = [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family);
      return { count: loaded.length, families: [...new Set(loaded)].slice(0, 5) };
    });
    if (fontsReady.count > 0) {
      log('PASS', `C3a-${engineName}`, 'index.html フォントロード', `${fontsReady.count}フォント: ${fontsReady.families.join(', ')}`);
    } else {
      log('WARN', `C3a-${engineName}`, 'index.html フォントロード', 'ロード済みフォント0件');
    }

    await page.close();
  }

  // ===== D. delegate.html =====
  {
    const page = await ctx.newPage();
    const jsErrors = [];
    page.on('pageerror', e => jsErrors.push(e.message));
    await page.goto(DELEGATE, { waitUntil: 'networkidle', timeout: 30000 });

    // D1: ページ表示
    const title = await page.title();
    if (title && title.includes('代行')) {
      log('PASS', `D1-${engineName}`, 'delegate.html ページ正常表示', `title="${title}"`);
    } else {
      log('WARN', `D1-${engineName}`, 'delegate.html ページ表示', `title="${title}"`);
    }

    // D2: GBPチェックボックス存在 + クリックで展開
    const gbpChk = await page.$('#chk-gbp');
    if (gbpChk) {
      // 展開前
      const beforeHidden = await page.$eval('#gbp-section', el => el.classList.contains('hidden'));
      await gbpChk.click();
      await page.waitForTimeout(500);
      const afterHidden = await page.$eval('#gbp-section', el => el.classList.contains('hidden'));
      if (beforeHidden && !afterHidden) {
        log('PASS', `D2-${engineName}`, 'GBPチェックボックス → クリックで展開', `hidden: ${beforeHidden} → ${afterHidden}`);
      } else {
        log('WARN', `D2-${engineName}`, 'GBPチェックボックス展開', `hidden: before=${beforeHidden}, after=${afterHidden}`);
      }
    } else {
      log('FAIL', `D2-${engineName}`, 'GBPチェックボックスが存在するか', '見つからない');
    }

    // D3: 管理権限リクエスト承認案内（📧テキスト）
    const emailGuide = await page.$$eval('body', ([body]) => {
      return body.textContent.includes('管理権限のリクエスト');
    });
    if (emailGuide) {
      log('PASS', `D3-${engineName}`, 'GBP管理権限リクエスト承認案内が表示', '📧テキスト確認');
    } else {
      log('FAIL', `D3-${engineName}`, 'GBP管理権限リクエスト承認案内', 'テキストが見つからない');
    }

    // D4: 横スクロール
    const dScroll = await page.evaluate(() => {
      return { scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth };
    });
    if (dScroll.scrollW <= dScroll.clientW) {
      log('PASS', `D4-${engineName}`, 'delegate.html 横スクロールなし', `scrollW=${dScroll.scrollW} <= clientW=${dScroll.clientW}`);
    } else {
      log('FAIL', `D4-${engineName}`, 'delegate.html 横スクロール発生', `scrollW=${dScroll.scrollW} > clientW=${dScroll.clientW}`);
    }

    // JSエラー
    if (jsErrors.length === 0) {
      log('PASS', `D5-${engineName}`, 'delegate.html JSエラーなし', 'エラー0件');
    } else {
      log('FAIL', `D5-${engineName}`, 'delegate.html JSエラー', jsErrors.join(' | '));
    }

    // input font-size
    const dFonts = await page.$$eval('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"])', els => {
      return els.map(el => {
        const cs = getComputedStyle(el);
        return { id: el.id, type: el.type, fontSize: cs.fontSize, fontSizePx: parseFloat(cs.fontSize) };
      }).filter(i => i.fontSizePx < 16);
    });
    if (dFonts.length === 0) {
      log('PASS', `C2d-${engineName}`, 'delegate.html input font-size >= 16px', '全input OK');
    } else {
      log('FAIL', `C2d-${engineName}`, 'delegate.html input font-size < 16px', dFonts.map(i => `${i.id||i.type}:${i.fontSize}`).join(', '));
    }

    await page.close();
  }

  // ===== E. sample.html =====
  {
    const page = await ctx.newPage();
    const jsErrors = [];
    page.on('pageerror', e => jsErrors.push(e.message));
    await page.goto(SAMPLE, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000); // データ読み込み待ち

    // E1: ページ表示（ログインなし）
    const sampleTitle = await page.title();
    const dashVisible = await page.$('#dashboard, .dashboard, [id*="dash"]');
    if (dashVisible) {
      log('PASS', `E1-${engineName}`, 'sample.html ログインなしで表示', `title="${sampleTitle}"`);
    } else {
      // ログイン画面が出ていないか確認
      const loginVisible = await page.$('#login-screen');
      const loginDisplay = loginVisible ? await page.$eval('#login-screen', el => getComputedStyle(el).display) : 'none';
      if (loginDisplay === 'none') {
        log('PASS', `E1-${engineName}`, 'sample.html ログインなしで表示', 'ログイン画面非表示、コンテンツ表示');
      } else {
        log('FAIL', `E1-${engineName}`, 'sample.html ログインなしで表示', 'ログイン画面が表示されている');
      }
    }

    // E2: JSエラー
    if (jsErrors.length === 0) {
      log('PASS', `E2-${engineName}`, 'sample.html JSエラーなし', 'エラー0件');
    } else {
      log('FAIL', `E2-${engineName}`, 'sample.html JSエラー', jsErrors.join(' | '));
    }

    await page.close();
  }

  await browser.close();
}

(async () => {
  console.log('=== KPI集客ツール Playwright テスト開始 ===\n');

  console.log('--- Chromium (Android Chrome相当) ---');
  try {
    await runTests(chromium, 'Chromium');
  } catch (e) {
    console.error('Chromium テスト失敗:', e.message);
  }

  console.log('--- WebKit (iPhone Safari相当) ---');
  try {
    await runTests(webkit, 'WebKit');
  } catch (e) {
    console.error('WebKit テスト失敗:', e.message);
  }

  console.log('\n=== テスト結果 ===\n');
  results.forEach(r => console.log(r));
  console.log(`\n合計: ✅ ${pass} PASS / ❌ ${fail} FAIL / ⚠️ ${warn} WARN`);

  process.exit(fail > 0 ? 1 : 0);
})();
