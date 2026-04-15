// =====================================================================
// gas-api.test.js — GAS API 統合テスト（日次データの保存・取得・削除）
//
// handleGetData は日次データのみ返す（顧客タブ読み込みは廃止済み）。
// 顧客データの書き込みは handleSaveDay が行うが、取得テストは日次のみ。
//
// 実行方法: node gas-api.test.js
// テスト日付: 2025-01-01, 2025-01-02（本番データと衝突しない過去日）
// =====================================================================

const GAS_URL = 'https://script.google.com/macros/s/AKfycbw5teJV0bHH5PREhswvYyvx9OInMHL48Gzshq7kwLUpzGWLNuksKXp3l75vzLXX2mw4AA/exec';
const TEST_SALON_ID   = '2049';
const TEST_SALON_NAME = 'テスト院（自動テスト）';
const TEST_DATE       = '2025-01-01';
const TEST_DATE2      = '2025-01-02';

// ─── ユーティリティ ──────────────────────────────────────────────────

let passed = 0, failed = 0, total = 0;

function assert(id, desc, cond, detail = '') {
  total++;
  if (cond) {
    console.log(`  ✓ [${id}] ${desc}`);
    passed++;
  } else {
    console.error(`  ✗ [${id}] ${desc}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

async function gasPost(payload) {
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload),
    redirect: 'follow'
  });
  return res.json();
}

// 指定日付の日次データを取得
async function getDayForDate(date) {
  const res = await gasPost({ action: 'getData', salon_id: TEST_SALON_ID });
  if (!res.success) throw new Error('getData failed: ' + res.error);
  return (res.days || []).find(d => d.date === date) || null;
}

// テストデータをクリーンアップ（v=0 で削除）
async function cleanup(date) {
  await gasPost({
    action: 'saveDay', salon_id: TEST_SALON_ID, salon_name: TEST_SALON_NAME,
    date, visitors: 0, reservations: 0, customers: []
  });
}

// ─── テスト定義 ───────────────────────────────────────────────────────

async function runTests() {
  console.log('=== GAS API 統合テスト ===');
  console.log(`対象: ${GAS_URL.slice(-40)}...`);
  console.log(`テスト日付: ${TEST_DATE}, ${TEST_DATE2}\n`);

  await cleanup(TEST_DATE);
  await cleanup(TEST_DATE2);

  // ─────────────────────────────────────────────
  // TC-01: 新規保存 → 日次データが正しく返る
  // ─────────────────────────────────────────────
  console.log('【TC-01】新規保存・日次データ検証');
  const saveRes01 = await gasPost({
    action: 'saveDay', salon_id: TEST_SALON_ID, salon_name: TEST_SALON_NAME,
    date: TEST_DATE, visitors: 5, reservations: 3,
    customers: []
  });
  assert('TC-01-1', 'saveDay が success:true を返す', saveRes01.success === true);

  const day01 = await getDayForDate(TEST_DATE);
  assert('TC-01-2', '日次データが取得できる', day01 !== null, `実際: ${JSON.stringify(day01)}`);
  if (day01) {
    assert('TC-01-3', 'visitors=5', day01.visitors === 5, `実際: ${day01.visitors}`);
    assert('TC-01-4', 'reservations=3', day01.reservations === 3, `実際: ${day01.reservations}`);
    assert('TC-01-5', 'rate=60', day01.rate === 60, `実際: ${day01.rate}`);
  }

  // ─────────────────────────────────────────────
  // TC-02: 上書き保存 → 最新データのみ残る
  // ─────────────────────────────────────────────
  console.log('\n【TC-02】上書き保存');
  await gasPost({
    action: 'saveDay', salon_id: TEST_SALON_ID, salon_name: TEST_SALON_NAME,
    date: TEST_DATE, visitors: 10, reservations: 8, customers: []
  });
  const day02 = await getDayForDate(TEST_DATE);
  assert('TC-02-1', '上書き後 visitors=10', day02 && day02.visitors === 10, `実際: ${day02 && day02.visitors}`);
  assert('TC-02-2', '上書き後 reservations=8', day02 && day02.reservations === 8, `実際: ${day02 && day02.reservations}`);
  assert('TC-02-3', '上書き後 rate=80', day02 && day02.rate === 80, `実際: ${day02 && day02.rate}`);

  // ─────────────────────────────────────────────
  // TC-03: 他日付への非干渉
  // ─────────────────────────────────────────────
  console.log('\n【TC-03】他日付への非干渉');
  await gasPost({
    action: 'saveDay', salon_id: TEST_SALON_ID, salon_name: TEST_SALON_NAME,
    date: TEST_DATE2, visitors: 2, reservations: 1, customers: []
  });
  // TEST_DATE を再保存
  await gasPost({
    action: 'saveDay', salon_id: TEST_SALON_ID, salon_name: TEST_SALON_NAME,
    date: TEST_DATE, visitors: 7, reservations: 7, customers: []
  });
  const day03_other = await getDayForDate(TEST_DATE2);
  assert('TC-03-1', `${TEST_DATE} 保存が ${TEST_DATE2} データを壊さない`, day03_other !== null);
  assert('TC-03-2', `${TEST_DATE2} の visitors=2 が維持`, day03_other && day03_other.visitors === 2, `実際: ${day03_other && day03_other.visitors}`);

  const day03_self = await getDayForDate(TEST_DATE);
  assert('TC-03-3', `${TEST_DATE} が最新値(7)に更新`, day03_self && day03_self.visitors === 7, `実際: ${day03_self && day03_self.visitors}`);

  // ─────────────────────────────────────────────
  // TC-04: v=0 削除
  // ─────────────────────────────────────────────
  console.log('\n【TC-04】v=0 削除');
  const before04 = await getDayForDate(TEST_DATE);
  assert('TC-04-0', '削除前にデータが存在', before04 !== null);

  await gasPost({
    action: 'saveDay', salon_id: TEST_SALON_ID, salon_name: TEST_SALON_NAME,
    date: TEST_DATE, visitors: 0, reservations: 0, customers: []
  });
  const day04 = await getDayForDate(TEST_DATE);
  assert('TC-04-1', '日次行が削除されている', day04 === null, `実際: ${JSON.stringify(day04)}`);

  const day04_other = await getDayForDate(TEST_DATE2);
  assert('TC-04-2', `v=0 削除が ${TEST_DATE2} を壊さない`, day04_other !== null && day04_other.visitors === 2);

  // ─────────────────────────────────────────────
  // TC-05: getData ラウンドトリップ
  // ─────────────────────────────────────────────
  console.log('\n【TC-05】getData ラウンドトリップ');
  await gasPost({
    action: 'saveDay', salon_id: TEST_SALON_ID, salon_name: TEST_SALON_NAME,
    date: TEST_DATE, visitors: 3, reservations: 2, customers: []
  });
  const res05 = await gasPost({ action: 'getData', salon_id: TEST_SALON_ID });
  assert('TC-05-1', 'getData が success:true', res05.success === true);
  const days05 = (res05.days || []).filter(d => d.date === TEST_DATE || d.date === TEST_DATE2);
  assert('TC-05-2', 'テスト日付のデータが2件取得できる', days05.length === 2, `実際: ${days05.length}件`);

  const d1 = days05.find(d => d.date === TEST_DATE);
  const d2 = days05.find(d => d.date === TEST_DATE2);
  assert('TC-05-3', `${TEST_DATE} visitors=3`, d1 && d1.visitors === 3, `実際: ${d1 && d1.visitors}`);
  assert('TC-05-4', `${TEST_DATE} rate=67`, d1 && d1.rate === 67, `実際: ${d1 && d1.rate}`);
  assert('TC-05-5', `${TEST_DATE2} visitors=2`, d2 && d2.visitors === 2, `実際: ${d2 && d2.visitors}`);

  // ─────────────────────────────────────────────
  // TC-06: loginAndGetData 統合API
  // ─────────────────────────────────────────────
  console.log('\n【TC-06】loginAndGetData 統合API');
  const res06 = await gasPost({ action: 'loginAndGetData', salon_id: TEST_SALON_ID, email: 'test' });
  assert('TC-06-1', 'loginAndGetData が success:true', res06.success === true);
  assert('TC-06-2', 'salon_name が返る', typeof res06.salon_name === 'string');
  assert('TC-06-3', 'days が配列で返る', Array.isArray(res06.days));
  const d06 = (res06.days || []).find(d => d.date === TEST_DATE);
  assert('TC-06-4', `${TEST_DATE} のデータが含まれる`, d06 !== null && d06 !== undefined);

  // ─────────────────────────────────────────────
  // クリーンアップ
  // ─────────────────────────────────────────────
  await cleanup(TEST_DATE);
  await cleanup(TEST_DATE2);
  console.log('\n✓ テストデータをクリーンアップしました');

  // 結果表示
  console.log(`\n${'='.repeat(50)}`);
  if (failed === 0) {
    console.log(`結果: ${passed}/${total} PASSED  \n\n✓ 全テスト PASS`);
  } else {
    console.log(`結果: ${passed}/${total} PASSED  ${failed} FAILED\n\n⚠ 失敗したテストがあります。上記の「✗」行を確認してください。`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('テスト実行エラー:', err);
  process.exit(1);
});
