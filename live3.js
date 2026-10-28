const { chromium } = require('/Users/Apple/.npm-global/lib/node_modules/playwright');
const URL = 'https://yjw94ss.github.io/business-sim/';

(async () => {
  const errors = [], fails = [];
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const p = await b.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  p.on('requestfailed', r => fails.push(r.url() + ' :: ' + (r.failure() || {}).errorText));
  p.on('response', r => { if (r.status() >= 400) fails.push('HTTP ' + r.status() + ' ' + r.url()); });

  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForSelector('#d_settle', { timeout: 15000 });
  await p.waitForTimeout(1200);

  const boot = await p.evaluate(() => ({
    title: document.title,
    imgs: [...document.querySelectorAll('img')].map(i => ({ src: i.getAttribute('src'), w: i.naturalWidth })),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  console.log('标题:', boot.title);
  console.log('图片:', boot.imgs.length, '| 破图:', boot.imgs.filter(i => !i.w).map(i => i.src));
  console.log('横向溢出:', boot.overflow, 'px');

  // 升级门店 → 验证 shop1.webp 在 HTTPS 下加载
  await p.click('#d_up');
  await p.waitForTimeout(1000);
  const afterUp = await p.evaluate(() => ({
    scenes: document.querySelectorAll('.scene').length,
    lv: document.getElementById('shopLv').textContent,
    broken: [...document.querySelectorAll('img')].filter(i => !i.naturalWidth).map(i => i.getAttribute('src')),
  }));
  console.log('升级后:', JSON.stringify(afterUp));
  await p.screenshot({ path: 'shot-live3-upgrade.png' });

  // 结算 6 个月：轮询状态（卡片重建期间元素会短暂不存在）
  const state = () => p.evaluate(() => {
    const s = document.getElementById('d_settle');
    return {
      ready: !!(s && !s.disabled),
      month: (document.getElementById('hMonth') || {}).textContent,
      cash: (document.getElementById('hCash') || {}).textContent,
      net: (document.getElementById('hNet') || {}).textContent,
      broken: [...document.querySelectorAll('img')].filter(i => !i.naturalWidth).length,
    };
  });
  const waitReady = async (ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const st = await state();
      if (st.ready) return st;
      const btn = await p.$('.opt:not([disabled])');
      if (btn) await btn.click();
      await p.waitForTimeout(700);
    }
    return null;
  };

  let months = 0;
  for (let i = 0; i < 6; i++) {
    const st = await waitReady(30000);
    if (!st) { console.log('❌ 第', i + 1, '月卡住:', JSON.stringify(await state())); break; }
    await p.click('#d_settle');
    await p.waitForTimeout(1200);
    for (let k = 0; k < 10; k++) {
      const btn = await p.$('.opt:not([disabled])');
      if (!btn) break;
      await btn.click();
      await p.waitForTimeout(800);
    }
    months++;
  }
  await waitReady(20000);
  const end = await state();
  console.log('已结算', months, '个月 →', JSON.stringify(end));
  await p.screenshot({ path: 'shot-live3-play.png' });

  console.log('页面错误:', errors.length, errors.slice(0, 5));
  console.log('请求失败:', fails.length, fails.slice(0, 5));
  await b.close();
})();
