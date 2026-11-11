// 泡泡掃射（bubblespray，Ball Blast 玩法）的純函式檢查：一層一個顏色（紅→橘→黃…）、每層一分為二、半徑越來越小、越重（越後面）重力與飄移越快、
// 每層要被打中的次數（32／16／8／4／2／1／1）、打中就少 1 次、第 0／5／10 秒各出現一顆紅球、滿分、
// 球落地會彈回最上緣（重的彈得快）、砲彈掃掠碰撞（線段對圓、取最先碰到的）、擊破第 2／4／6 顆紅球變雙／三／四發並排、砲塔尺寸與間隙參數
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_bubblespray.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261111), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 層、顏色、大小、速度、重力 ──
ok(T.LAYERS === T.COLORS.length && T.LAYERS >= 5 && new Set(T.COLORS).size === T.LAYERS, '一層一個顏色（' + T.LAYERS + ' 層）');
for (let L = 1; L < T.LAYERS; L++) ok(T.radiusOf(L) < T.radiusOf(L - 1) && T.speedOf(L) > T.speedOf(L - 1) && T.gravityOf(L) > T.gravityOf(L - 1) && T.colorOf(L) !== T.colorOf(L - 1), '第 ' + (L + 1) + ' 層：更小、更重（重力更大）、飄得更快、換顏色');
ok(near(T.gravityOf(0), T.GRAVITY[0]) && near(T.gravityOf(T.LAYERS - 1), T.GRAVITY[1]) && T.GRAVITY[0] < T.GRAVITY[1], '紅球最輕、紫球最重');
ok(near(T.radiusOf(0), T.R0) && near(T.radiusOf(2), T.R0 * T.R_SHRINK * T.R_SHRINK) && T.radiusOf(T.LAYERS - 1) > T.BULLET_R, '球的大小仍由 R0／R_SHRINK 控制，最小的球還是比砲彈大：' + T.radiusOf(T.LAYERS - 1).toFixed(1));
ok(T.perRed() === Math.pow(2, T.LAYERS) - 1, '一顆紅球全部打完 ' + T.perRed() + ' 顆');
// ── 每層要被打中幾次 ──
ok(JSON.stringify(Array.from({ length: T.LAYERS }, (_, L) => T.hitsOf(L))) === JSON.stringify([32, 16, 8, 4, 2, 1, 1]), '紅 32、橘 16、黃 8、綠 4、藍 2、靛 1、紫 1');
ok(T.hitsOf(T.LAYERS + 3) === 1, 'HITS 沒寫到的層當作 1 次');
{ let want = 0; for (let L = 0; L < T.LAYERS; L++) want += Math.pow(2, L) * T.hitsOf(L); ok(T.hitsPerRed() === want && want === 256, '一顆紅球全部打完要 ' + want + ' 發'); }
{ const b = T.makeBall(0, 100, 100, 0, 0); ok(b.hp === 32 && near(b.r, T.R0), '新紅球剩 32 次');
  let broke = -1; for (let i = 1; i <= 40 && broke < 0; i++) { const was = b.hp; const done = T.strike(b); ok(b.hp === was - 1 && b.flash > 0, '打中一次少 1 次（第 ' + i + ' 發）'); if (done) broke = i; }
  ok(broke === 32, '第 32 發才打破，實際第 ' + broke + ' 發'); }
{ const p = T.makeBall(T.LAYERS - 1, 0, 0, 0, 0); ok(T.strike(p), '紫球 1 發就消失'); }
// 一顆紅球實際分裂：第 n 層剛好 2^n 顆，且每顆的剩餘次數都對
{ let all = [T.makeBall(0, 200, 200, 30, 0)], count = {}, total = 0, shots = 0;
  while (all.length) { const b = all.pop(); count[b.layer] = (count[b.layer] || 0) + 1; total++; shots += b.hp; const kids = T.split(b, rnd);
    ok(b.layer === T.LAYERS - 1 ? kids.length === 0 : kids.length === 2 && kids.every(k => k.layer === b.layer + 1 && near(k.r, T.radiusOf(b.layer + 1)) && k.hp === T.hitsOf(b.layer + 1)), '一分為二、下一層、次數重新算（最後一層不再分）');
    all.push(...kids); }
  ok(total === T.perRed(), '全部打完一共 ' + total + ' 顆');
  ok(shots === T.hitsPerRed(), '全部打完一共要 ' + shots + ' 發');
  for (let L = 0; L < T.LAYERS; L++) ok(count[L] === Math.pow(2, L), '第 ' + (L + 1) + ' 層有 ' + Math.pow(2, L) + ' 顆（' + T.colorOf(L) + '）'); }
{ const kids = T.split(T.makeBall(0, 200, 200, 0, 0), () => 0.5);
  ok(kids[0].vx * kids[1].vx < 0 && kids[0].x < 200 && kids[1].x > 200, '分裂：兩顆小球往左右兩邊彈開');
  ok(kids.every(k => k.vy < 0), '分裂：兩顆小球同時往上蹦一下'); }
// ── 出現時間、滿分 ──
ok(T.spawnTimes().every((s, i) => s === i * T.SPAWN_EVERY) && T.spawnTimes()[0] === 0 && T.spawnTimes().slice(-1)[0] < T.TIME_S && T.spawnTimes().slice(-1)[0] + T.SPAWN_EVERY >= T.TIME_S, '第 0 秒起每 ' + T.SPAWN_EVERY + ' 秒出現一顆紅球（限時 ' + T.TIME_S + ' 秒）');
ok(T.maxScore() === T.spawnTimes().length * T.perRed(), '滿分 ' + T.maxScore());
// ── 擊破紅球的獎勵：連射與砲彈變快、有上限；第 2／4／6 顆起變 2／3／4 發 ──
{ const g0 = T.gunAfter(0), g1 = T.gunAfter(1), big = T.gunAfter(1000);
  ok(g0.rate === T.FIRE_RATE && g0.v === T.BULLET_V && g0.shots === 1, '還沒擊破紅球：原本的射速 ' + g0.rate + ' 次／秒、' + g0.v + ' px／秒、一次 1 發');
  ok(near(g1.rate, T.FIRE_RATE + T.RED_FIRE_BONUS) && near(g1.v, T.BULLET_V + T.RED_SPEED_BONUS), '擊破 1 顆：每秒多 ' + T.RED_FIRE_BONUS + ' 次、砲彈快 ' + T.RED_SPEED_BONUS);
  ok(big.rate === T.FIRE_RATE_MAX && big.v === T.BULLET_V_MAX, '加到上限就停');
  for (let r = 1; r <= 40; r++) { const a = T.gunAfter(r - 1), b = T.gunAfter(r); ok(b.rate >= a.rate && b.v >= a.v && b.shots >= a.shots, '只增不減（第 ' + r + ' 顆）'); } }
ok(JSON.stringify(T.MULTI_AT) === JSON.stringify([2, 4, 6]), '預設第 2、4、6 顆紅球各多一發');
ok([0, 1, 2, 3, 4, 5, 6, 7, 12].map(T.shotsAfter).join() === '1,1,2,2,3,3,4,4,4', '一次幾發：擊破 0／1／2／3／4／5／6／7／12 顆紅球 → ' + [0, 1, 2, 3, 4, 5, 6, 7, 12].map(T.shotsAfter).join());
// ── 並排砲彈：左右對稱、間隙＝BULLET_GAP（邊到邊） ──
{ const step = 2 * T.BULLET_R + T.BULLET_GAP;
  ok(T.volley(200, 1).length === 1 && near(T.volley(200, 1)[0], 200), '一發：就在砲塔正上方');
  for (let n = 2; n <= 4; n++) { const xs = T.volley(200, n);
    ok(xs.length === n && near(xs.reduce((a, b) => a + b, 0) / n, 200) && xs.every((x, i) => i === 0 || near(x - xs[i - 1], step)), n + ' 發：以砲塔為中心左右對稱、相鄰間隔 ' + step + ' px'); }
  ok(near(T.volley(0, 2)[1] - T.volley(0, 2)[0] - 2 * T.BULLET_R, T.BULLET_GAP), '兩發砲彈邊到邊的間隙就是 BULLET_GAP＝' + T.BULLET_GAP); }
// ── 砲塔尺寸：TURRET_SCALE 目前是 1，整體等比例縮放 ──
ok(typeof T.TURRET_SCALE === 'number' && T.TURRET_SCALE > 0, '砲塔尺寸比例 TURRET_SCALE＝' + T.TURRET_SCALE + '（1＝原本大小）');
{ const a = T.turretSize(1), b = T.turretSize(2), c = T.turretSize(0.5), d = T.turretSize();
  ok(near(b.w, a.w * 2) && near(b.h, a.h * 2) && near(c.w, a.w / 2) && near(c.h, a.h / 2), '比例 2 倍／0.5 倍：寬高一起放大縮小');
  ok(near(d.w, T.turretSize(T.TURRET_SCALE).w) && near(d.h, T.turretSize(T.TURRET_SCALE).h), '不傳比例就用 TURRET_SCALE'); }
ok(near(T.TOUCH_ZONE, 0.2), '畫面最下面 1/5 留給手指');
// ── 球碰到砲塔：砲管、砲口、車身、輪子都算，剛好貼著不算（用比例 1、半徑 6 的小球測，不受 R0／TURRET_SCALE 的手動調整影響） ──
{ const x = 236, y0 = 572, s = 1, r = 6, th = T.turretSize(1).h;
  const ball = (bx, by, rr) => ({ x: bx, y: by, r: rr == null ? r : rr });
  const hit = (b, scale, shots) => T.turretHit(b, x, y0, scale == null ? 1 : scale, shots);
  ok(hit(ball(x, y0 - th - r + 1)), '球壓到砲口頂端：撞到');
  ok(!hit(ball(x, y0 - th - r - 1)), '球在砲口上方一點點：沒撞到');
  ok(hit(ball(x + 9 + r - 1, y0 - 45)), '球壓到砲管側面：撞到');
  ok(!hit(ball(x + 9 + r + 1, y0 - 45)), '球離砲管側面一點點：沒撞到');
  ok(hit(ball(x + 28 + r - 1, y0 - 20)), '球撞到車身側面');
  ok(hit(ball(x + 20 + 10 + r - 2, y0 - r)), '球落在輪子旁邊的地板上：撞到輪子');
  ok(!hit(ball(x + 80, y0 - r)) && !hit(ball(x, 100)) && !hit(ball(x - 120, y0 - 200)), '離得遠的球沒撞到');
  ok(hit(ball(x, y0 - 30)) && hit(ball(x, y0 - 100, 50)), '球蓋住砲塔：撞到（大球也一樣）');
  // 砲塔放大兩倍：同一顆球原本沒撞到、放大之後撞到
  const far = ball(x + 28 + r + 20, y0 - 20); ok(!hit(far, 1) && hit(far, 2), '砲塔尺寸比例放大後，碰撞範圍跟著變大');
  // 同時射出四發時砲口變寬：砲口邊上的球撞到
  const mw4 = T.muzzleWidth(4, 1), edge = ball(x + mw4 / 2 + r - 1, y0 - th + 2);
  ok(mw4 > T.muzzleWidth(1, 1) && T.muzzleWidth(1, 1) >= 24 && hit(edge, 1, 4) && !hit(edge, 1, 1), '四發齊射時砲口比較寬，畫面看得到的地方就算撞到');
  // 畫面與碰撞用同一份形狀：形狀都在地板上方、輪子底部剛好貼地
  const sh = T.turretShapes(x, y0, 1); ok(sh.rects.every(q => q.b <= y0 && q.t < q.b) && sh.circles.every(c => near(c.y + c.r, y0)) && near(Math.min(...sh.rects.map(q => q.t)), y0 - th), '砲塔的形狀站在地板上、高度 ' + th);
  const sh2 = T.turretShapes(x, y0, 0.5); ok(near(Math.min(...sh2.rects.map(q => q.t)), y0 - th / 2), '比例 0.5：高度減半'); }
// ── 撞到砲塔後砲塔的閃爍：淺灰、粉紅輪流 ──
{ const c0 = T.CRASH_COLORS[0], c1 = T.CRASH_COLORS[1], f = T.CRASH_FLASH_S;
  ok(T.crashColorAt(0) === c0 && T.crashColorAt(f * 0.99) === c0 && T.crashColorAt(f * 1.01) === c1 && T.crashColorAt(f * 2.01) === c0 && T.crashColorAt(f * 3.01) === c1, '閃爍：每 ' + f + ' 秒在淺灰與粉紅之間換');
  ok(T.crashColorAt(-1) === c0 && T.crashColorAt(1e6) !== undefined, '負數、很大的時間也不會出錯');
  const seq = []; for (let i = 0; i < 12; i++) seq.push(T.crashColorAt(i * f + f / 2)); ok(seq.every((c, i) => c === (i % 2 ? c1 : c0)), '連續 12 格一灰一粉交替'); }
// ── 砲彈碰撞 ──
ok(near(T.segHit(0, 100, 0, -100, 0, 0, 10), 0.45) && T.segHit(20, 100, 20, -100, 0, 0, 10) === -1 && T.segHit(0, 5, 0, -100, 0, 0, 10) === 0 && T.segHit(0, 100, 0, 50, 0, 0, 10) === -1, '線段對圓：交點、擦過、起點在裡面、還沒到');
{ const bs = [{ x: 0, y: -50, r: 20 }, { x: 0, y: 30, r: 10 }, { x: 0, y: 10, r: 40 }];
  ok(T.firstHit(0, 100, 0, -200, bs, 5) === 2, '同一格碰到好幾顆，取最先碰到的（重疊的球也一樣）');
  ok(T.firstHit(100, 100, 100, -200, bs, 5) === -1, '沒碰到');
  ok(T.firstHit(0, 100, 0, 75, [{ x: 0, y: 30, r: 10 }], 5) === -1 && T.firstHit(0, 100, 0, 44, [{ x: 0, y: 30, r: 10 }], 5) === 0, '球半徑加砲彈半徑才算碰到'); }
// 很快的砲彈也不會穿過最小的球（一小格的距離遠大於球直徑也打得中）
{ const r = T.radiusOf(T.LAYERS - 1), step = T.BULLET_V_MAX * 0.05; ok(step > 2 * r && T.firstHit(0, step / 2, 0, -step / 2, [{ x: 0, y: 0, r }], T.BULLET_R) === 0, '掃掠：一格跳過整顆球也打得中'); }
// ── 重力彈跳：落地彈起、每顆都彈回最上緣、越重越快、不出界 ──
{ const W = 472, H = 700, floor = H * 0.8; const dt = 1 / 120;
  const periods = [];
  for (let L = 0; L < T.LAYERS; L++) {
    const b = T.makeBall(L, 100 + 20 * L, T.radiusOf(L), T.speedOf(L), 0);
    let minY = 1e9, maxY = -1e9, bounces = 0, lastBounce = null, gaps = [], peaks = [], prevVy = 0, outside = 0, t = 0, topSince = 0;
    for (let k = 0; k < 120 * 30; k++) {
      T.fall(b, W, floor, dt); t += dt;
      if (b.y < T.radiusOf(L) - 1e-6 || b.y > floor - T.radiusOf(L) + 1e-6 || b.x < b.r - 1e-6 || b.x > W - b.r + 1e-6) outside++;
      if (prevVy > 0 && b.vy < 0) { bounces++; if (lastBounce != null) gaps.push(t - lastBounce); lastBounce = t; }   // 落地的瞬間：速度由正轉負
      if (t > 8) { minY = Math.min(minY, b.y); }
      prevVy = b.vy;
    }
    periods.push(gaps.length ? gaps.reduce((a, c) => a + c, 0) / gaps.length : 0);
    ok(outside === 0, '第 ' + (L + 1) + ' 層：球不會出界（左右牆、最上緣、地板）');
    ok(bounces >= 3, '第 ' + (L + 1) + ' 層：一直彈（' + bounces + ' 次）');
    ok(minY <= T.radiusOf(L) + 1.5, '第 ' + (L + 1) + ' 層：每次都彈回最上緣（最高點 y＝' + minY.toFixed(2) + '，球頂 ' + (minY - T.radiusOf(L)).toFixed(2) + ' px）');
  }
  for (let L = 1; L < T.LAYERS; L++) ok(periods[L] < periods[L - 1], '越重彈得越快：第 ' + (L + 1) + ' 層一次 ' + periods[L].toFixed(2) + ' 秒 < 第 ' + L + ' 層 ' + periods[L - 1].toFixed(2) + ' 秒');
  // 落地時的速度：v ＝ √(2·g·高度)
  const b = T.makeBall(0, 200, floor - T.radiusOf(0) - 1, 0, 900); T.fall(b, W, floor, dt);
  ok(near(b.vy, -Math.sqrt(2 * T.gravityOf(0) * (floor - 2 * T.radiusOf(0))), 1e-6), '落地彈起的速度剛好夠彈到最上緣：' + b.vy.toFixed(1)); }
// 往上蹦的小球（分裂出來的）貼著地板時不會被硬拉成大彈跳，碰到最上緣會往下
{ const floor = 560, b = T.makeBall(3, 200, floor - T.radiusOf(3), 0, -150); T.fall(b, 472, floor, 1 / 120); ok(b.vy < 0 && b.vy > -160, '蹦起來的小球保有自己的向上速度：' + b.vy.toFixed(1));
  const c = T.makeBall(2, 200, T.radiusOf(2) + 0.2, 0, -300); T.fall(c, 472, floor, 1 / 60); ok(c.y >= c.r - 1e-9 && c.vy > 0, '碰到最上緣往下'); }
// 分裂時被踢開的左右速度，慢慢回到這一層的飄移速度
{ const kids = T.split(T.makeBall(0, 236, 300, 0, 0), rnd);
  for (const k of kids) { for (let i = 0; i < 60 * 8; i++) T.fall(k, 4720, 560, 1 / 60); ok(near(Math.abs(k.vx), T.speedOf(k.layer), 3), '彈開的速度慢慢回到這一層的飄移速度：' + Math.abs(k.vx).toFixed(1) + ' ≈ ' + T.speedOf(k.layer).toFixed(1)); } }
// ── 程式裡的接線 ──
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_bubblespray.js'), css = rd('../../css/games/reaction_bubblespray.css').replace(/[ \t]*\/\*[\s\S]*?\*\//g, ''), boot = rd('../../js/boot.js'), menu = rd('../../js/menu.js');
  ok(boot.indexOf("'js/reaction_bubblespray.js'") > 0 && boot.indexOf("'css/games/reaction_bubblespray.css'") > 0, 'boot.js 有載入 js 與 css');
  ok(/id: 'bubblespray', name: '泡泡掃射'/.test(menu) && G.name === '泡泡掃射', '選單有這一款');
  ok(/b\.layer === 0\)[^}]*gun = gunAfter\(reds\)/.test(src) && /fireAcc \+= d \* gun\.rate/.test(src) && /volley\(tx, gun\.shots\)/.test(src) && /v: gun\.v/.test(src), '擊破紅球就換成更快的連射、更多發並排的砲彈');
  ok(/bullets\.splice\(i, 1\); hitBall\(/.test(src) && /strike\(b\)/.test(src) && /molecules\(b\)/.test(src), '砲彈打中就消失、球上的次數少 1、打破有分子特效');
  ok(/function follow\(p\)/.test(src) && /pointermove/.test(src) && !/aimAngle/.test(src), '砲塔跟著手指左右移動（不再瞄準）');
  ok(/GROUND = Math\.round\(H \* \(1 - TOUCH_ZONE\)\)/.test(src) && /fall\(b, W, GROUND, sd\)/.test(src), '地板在畫面的 4/5 高度，下面 1/5 留給手指');
  { const db = src.split('function drawBubble')[1].split('function drawPart')[0]; ok(!/createRadialGradient|ellipse|globalAlpha/.test(db) && /lineWidth = BALL_BORDER/.test(db) && /String\(b\.hp\)/.test(db) && /#FFFFFF/.test(db), '球：不透明純色（沒有漸層、反光、半透明）、白框、白色剩餘次數'); }
  ok(T.BALL_BORDER === 1, '球的白框 1px');
  { const db = src.split('function drawBubble')[1].split('function drawPart')[0]; ok(/b\.layer >= LAYERS - 1\) \{ g\.restore\(\); return; \}/.test(db) && db.indexOf('b.layer >= LAYERS - 1') < db.indexOf('String(b.hp)'), '最後一層（紫球）不寫數字，其他層才寫'); }
  ok(/turretHit\(bubbles\[j\], tx, GROUND, TURRET_SCALE, gun\.shots\)\) \{ crash\(bubbles\[j\]\)/.test(src) && /function crash\(b\)[\s\S]*api\.fail\(\{ delay: CRASH_PAUSE_S \* 1000, lines: \['球撞到砲塔了！'\]/.test(src), '球碰到砲塔：失敗（顯示「球撞到砲塔了」）');
  // 撞到的那一刻畫面定格、標出是哪一顆、砲塔淺灰／粉紅快速閃爍；砲塔用多種鮮豔顏色
  { const lp = src.split('api.my.loop')[1].split('function addRed')[0]; ok(/else if \(crashed\) crashT \+= d;/.test(lp) && !/crashed[^\n]*(update|bubbles|bullets)/.test(lp), '撞到之後整個畫面定格：只有閃爍計時在走，球、砲彈、特效都不再更新'); }
  { const dc = src.split('function drawCrash()')[1].split('function drawBubble')[0]; ok(/rgba\(6, 10, 24, 0\.45\)/.test(dc) && /drawBubble\(b\)/.test(dc) && /strokeText\('撞到了！'/.test(dc) && /drawTurret\(crashColorAt\(crashT\)\)/.test(dc), '定格時：畫面壓暗、撞到的那顆球圈起來並寫「撞到了！」、砲塔閃爍'); }
  ok(T.CRASH_COLORS.length === 2 && /#D9D9D9/i.test(T.CRASH_COLORS[0]) && /#FF8CC6/i.test(T.CRASH_COLORS[1]) && T.CRASH_FLASH_S <= 0.15 && T.CRASH_PAUSE_S >= 1, '閃爍＝淺灰＋粉紅、每 ' + T.CRASH_FLASH_S + ' 秒換一次、定格 ' + T.CRASH_PAUSE_S + ' 秒');
  { const tc = Object.values(T.TURRET_COLORS).filter((c, i, a) => a.indexOf(c) === i); ok(tc.length >= 6, '砲塔由多個鮮豔顏色組成（' + tc.length + ' 種）');
    ok(!/shadowBlur|shadowColor|TURRET_GLOW/.test(require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_bubblespray.js'), 'utf8')), '砲塔沒有光暈（沒有 shadowBlur）');
    // 每個顏色都夠鮮豔夠亮：HSL 飽和度 ≥ 70%、亮度 ≥ 45%（白色外框、輪軸除外）
    const hsl = (hex) => { const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, s = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1)); return { s, l }; };
    for (const k of ['barrel', 'muzzle', 'body', 'stripe', 'wheel']) { const c = hsl(T.TURRET_COLORS[k]); ok(c.s >= 0.7 && c.l >= 0.45, '砲塔 ' + k + ' 的顏色 ' + T.TURRET_COLORS[k] + ' 夠鮮豔夠亮（飽和 ' + (c.s * 100).toFixed(0) + '%、亮度 ' + (c.l * 100).toFixed(0) + '%）'); } }
  ok(/fall\(b, W, GROUND, sd\)/.test(src) && /g = gravityOf\(b\.layer\)/.test(src) && /b\.y \+= b\.vy \* dt \+ 0\.5 \* g \* dt \* dt/.test(src) && /b\.vy \+= g \* dt/.test(src) && /Math\.sqrt\(2 \* g \* /.test(src), '上下移動用重力加速度算，彈起的速度＝√(2·g·高度)');
  ok(/球碰到砲塔就失敗/.test(G.rule), '玩法說明有寫「球碰到砲塔就失敗」、紫球沒有數字');
  ok(/api\.timer\(TIME_S \* 1000/.test(src) && /scoreOf/.test(src), '限時用 api.timer、成績用 scoreOf');
  ok(/root\.classList\.add\('bubblespray-screen'\)/.test(src) && /root\.classList\.remove\('bubblespray-screen'\)/.test(src), '上方標題與時間條的緊湊版面 class 有加、有拿掉');
  ok(/\.screen\.bubblespray-screen\s*\{[^}]*gap:\s*2px/.test(css) && /padding-top:\s*4px/.test(css), '標題列、時間條、遊戲區之間的空隙很小'); }
{ const labels = []; for (let n = 0; n <= 3000; n += 5) labels.push(T.rating(n)); ok(new Set(labels).size >= 5 && labels.every((l, i) => i === 0 || l === labels[i - 1] || !labels.slice(0, i).includes(l)), '評語分級（至少 5 級，成績越高級別越高、不會來回跳）：' + Array.from(new Set(labels)).join(' → ')); }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
