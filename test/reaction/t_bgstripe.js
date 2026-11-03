// 干擾用的動態條紋背景共用元件（js/reaction_bgstripe.js 的 kit.bgStripe）：純函式部分的單元測試。
// 畫面部分（SVG 花紋、Web Animations）要在瀏覽器裡看；這裡測「這一關要不要出現、顏色、週期、動畫計畫、圖層大小」。
const fs = require('fs');
const { rng, seedOf } = require('./load.js');
const B = Reaction.kit.bgStripe, T = B.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const rnd = rng(seedOf(20261103));
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-6 : e);

// ① 出現的關卡：from 之前不出現、from 開始出現、to 之後不出現；from 為 0／null／false 就是不出現
ok(T.resolve({ from: 10 }, 9, rnd).show === false, 'from=10：第 9 關不出現');
ok(T.resolve({ from: 10 }, 10, rnd).show === true, 'from=10：第 10 關出現');
ok(T.resolve({ from: 10 }, 30, rnd).show === true, 'from=10：之後一直出現');
ok(T.resolve({ from: 3, to: 5 }, 6, rnd).show === false && T.resolve({ from: 3, to: 5 }, 5, rnd).show === true, 'to=5：第 6 關起不出現');
ok(T.resolve({}, 1, rnd).show === true, '沒寫 from：第 1 關就出現（預設）');
ok(T.resolve({}, undefined, rnd).show === true, '單回合遊戲不傳 level：當作第 1 關，出現');
for (const off of [0, null, false]) ok(T.resolve({ from: off }, 5, rnd).show === false, 'from=' + off + '：不出現');

// ② 預設值與合併：遊戲沒寫的欄位用預設值，寫了的用遊戲的
{
  const c = T.resolve({ type: 'hex', width: 40 }, 1, rnd);
  ok(c.type === 'hex' && c.width === 40 && c.diff === T.DEF.diff && c.sat === T.DEF.sat, '合併預設值');
  ok(T.resolve({ type: '亂寫的' }, 1, rnd).type === 'vstripe', '花紋名字寫錯：退回直條紋');
  ok(T.resolve({ move: '亂寫的' }, 1, rnd).move === 'none', '移動方向寫錯：不動');
  ok(T.resolve({ width: 1 }, 1, rnd).width >= 4, '寬度太小：至少 4px');
  ok(T.resolve({ diff: -3 }, 1, rnd).diff === 0, '亮度差不能是負的');
  ok(T.resolve({ hue: null }, 1, rnd).hue === 46 && T.resolve({ hue: 200 }, 1, rnd).hue === 200, 'hue=null 用主題紙色 46 度，數字照用');
}

// ③ 隨機項目：'random' 會在範圍內，陣列會從裡面抽；擲 400 次每一種都會出現
{
  const seen = {}, hueSeen = {}; let angOk = true, dirs = {};
  for (let i = 0; i < 400; i++) {
    const c = T.resolve({ type: 'random', hue: 'random', angle: 'random', dir: 'random' }, 1, rnd);
    seen[c.type] = 1; angOk = angOk && c.angle >= 0 && c.angle <= 179 && c.hue >= 0 && c.hue <= 359; dirs[c.dir] = 1; hueSeen[c.hue] = 1;
  }
  ok(B.TYPES.every(t => seen[t]), "type:'random' 七種花紋都會抽到：" + Object.keys(seen));
  ok(angOk, '隨機角度 0～179、隨機色相 0～359');
  { let good = true, lo = 999, hi = -1, mirrored = {}; for (let i = 0; i < 500; i++) { const g = T.resolve({ angle: 'skew' }, 1, rnd).angle; lo = Math.min(lo, g); hi = Math.max(hi, g); mirrored[g < 90 ? 'a' : 'b'] = 1; if (!((g >= 15 && g <= 75) || (g >= 105 && g <= 165))) good = false; }
    ok(good && mirrored.a && mirrored.b, "angle:'skew' 只會在 15～75 或 105～165 度（避開水平垂直），兩邊都會出現：" + lo + '～' + hi); }
  ok(dirs[1] && dirs[-1], '方向 1 與 -1 都會出現');
  ok(Object.keys(hueSeen).length > 100, '隨機色相夠分散：' + Object.keys(hueSeen).length + ' 種');
  const s2 = {}; for (let i = 0; i < 200; i++) s2[T.resolve({ type: ['vstripe', 'hex'] }, 1, rnd).type] = 1;
  ok(Object.keys(s2).sort().join() === 'hex,vstripe', '陣列只從裡面抽：' + Object.keys(s2));
}

// ④ [起, 終] 漸變：從 from 那一關開始，到第 from + rampLevels − 1 關到頂，之後維持
{
  const o = { from: 10, diff: [3, 8], rampLevels: 11, speed: [10, 30] };
  ok(near(T.resolve(o, 10, rnd).diff, 3) && near(T.resolve(o, 20, rnd).diff, 8) && near(T.resolve(o, 15, rnd).diff, 5.5), 'diff 3→8：第 10 關 3、第 20 關 8、中間 5.5');
  ok(near(T.resolve(o, 99, rnd).diff, 8), '到頂之後維持終值');
  ok(near(T.resolve(o, 10, rnd).speed, 10) && near(T.resolve(o, 20, rnd).speed, 30), 'speed 也可以漸變');
  ok(near(T.val([1, 5], 1, 1, 5), 1) && near(T.val([1, 5], 5, 1, 5), 5) && T.val(7, 3, 1, 5) === 7, 'val：陣列漸變、單一數字原樣');
}

// ⑤ 顏色：亮色 − 暗色的亮度差剛好是 diff；diff=0 兩色一樣；亮度在範圍內
{
  const lum = s => Number(/,([\d.]+)%\)$/.exec(s)[1]);
  for (const d of [0, 2, 5, 8, 10]) {
    const c = T.resolve({ diff: d, light: 92 }, 1, rnd), k = c.colors;
    ok(near(lum(k[0]) - lum(k[1]), d, 0.11), 'diff=' + d + '：亮度差 ' + (lum(k[0]) - lum(k[1])).toFixed(2));
    ok(lum(k[2]) <= lum(k[0]) + 1e-9 && lum(k[2]) >= lum(k[1]) - 1e-9, '中間色在亮暗之間');
  }
  ok(T.resolve({ diff: 0 }, 1, rnd).colors[0] === T.resolve({ diff: 0 }, 1, rnd).colors[1], 'diff=0：兩色相同（完全看不到）');
  const hs = T.resolve({ hue: 100, hueShift: 30 }, 1, rnd).colors;
  ok(/^hsl\(100,/.test(hs[0]) && /^hsl\(130,/.test(hs[1]) && /^hsl\(115,/.test(hs[2]), '色相差 30 度：100 / 130 / 115 → ' + hs.join(' '));
  ok(/^hsl\(/.test(T.resolve({ hue: 'random' }, 1, rnd).colors[0]), '色碼是 hsl(…)');
  const edge = T.resolve({ light: 99, diff: 30 }, 1, rnd).colors; ok(lum(edge[0]) <= 99, '亮度不超過 99%（接近純白看不出花紋）');
}

// ⑥ 重複週期：條紋 2w；六角形 3√3·w × 3w；圓圈與螺紋沒有週期
{
  const p = T.periodOf('vstripe', 30); ok(p.px === 60 && p.py === 60, '直條紋週期 2w');
  for (const t of ['hstripe', 'checker', 'dots']) ok(T.periodOf(t, 25).px === 50, t + ' 週期 2w');
  const h = T.periodOf('hex', 20); ok(near(h.px, 3 * Math.sqrt(3) * 20) && h.py === 60, '六角形週期 3√3w × 3w');
  ok(T.periodOf('circles', 30).px === 0 && T.periodOf('spiral', 30).px === 0, '圓圈、螺紋沒有週期（0）');
}

// ⑦ 動畫計畫
{
  const plan = o => { const c = T.resolve(Object.assign({ dir: 1 }, o), 1, rnd); return { c, p: T.motionPlan(c) }; };
  let r = plan({ move: 'none', spin: 0 }); ok(r.p.kind === 'none' && !r.p.x && !r.p.y && !r.p.spin, '不動就沒有動畫');
  r = plan({ type: 'vstripe', width: 30, move: 'x', speed: 30 });
  ok(r.p.kind === 'scroll' && r.p.x && !r.p.y && near(r.p.x.to, 60) && near(r.p.x.ms, 2000), '直條紋左右捲動：走一個週期 60px、速度 30px/s → 2 秒');
  r = plan({ type: 'vstripe', width: 30, move: 'x', speed: 30, dir: -1 }); ok(r.p.x.to === -60, 'dir=-1：往反方向捲');
  r = plan({ type: 'checker', width: 30, move: 'y', speed: 60 }); ok(r.p.y && !r.p.x && near(r.p.y.ms, 1000), '上下捲動只有 y');
  r = plan({ type: 'checker', width: 30, move: 'all', speed: 60 });
  ok(r.p.x && r.p.y && near(r.p.x.ms, r.p.y.ms) && near(r.p.x.ms, Math.sqrt(2) * 60 / 60 * 1000), '全部：x、y 同時走完一圈（合起來斜著走，路徑長 ÷ 速度）');
  r = plan({ type: 'hex', width: 20, move: 'all', speed: 40 }); ok(r.p.x && r.p.y && near(r.p.x.ms, r.p.y.ms), '六角形也是');
  r = plan({ type: 'circles', move: 'x', path: 'scroll', speed: 20 }); ok(r.p.kind === 'swing', '圓圈沒有週期：scroll 自動改成擺動');
  r = plan({ type: 'spiral', move: 'all', speed: 20 }); ok(r.p.kind === 'swing' && r.p.x && r.p.y && r.p.y.ms > r.p.x.ms, '螺紋：全部＝x、y 擺動週期不同（y 慢 1.31 倍）');
  r = plan({ type: 'vstripe', move: 'x', path: 'swing', speed: 30, swing: 90 });
  ok(r.p.kind === 'swing' && r.p.x.from === -90 && r.p.x.to === 90 && near(r.p.x.ms, Math.PI * 90 / 30 * 1000), '擺動：−90…+90，半週期 π·A/speed');
  r = plan({ type: 'vstripe', width: 30, move: 'x', path: 'swing' }); ok(r.c.swingAmp === 90, '擺幅 0＝自動（寬度 3 倍 = 90）');
  r = plan({ type: 'vstripe', width: 10, move: 'x', path: 'swing' }); ok(r.c.swingAmp === 60, '自動擺幅至少 60');
  r = plan({ move: 'x', speed: 0 }); ok(r.p.kind === 'none', '速度 0：不動');
  r = plan({ spin: 90, dir: 1 }); ok(r.p.spin && r.p.spin.deg === 360 && near(r.p.spin.ms, 4000), '旋轉 90°/s：一圈 4 秒、順時針');
  r = plan({ spin: -90, dir: 1 }); ok(r.p.spin.deg === -360, '負的旋轉速度：逆時針');
  r = plan({ spin: 90, dir: -1 }); ok(r.p.spin.deg === -360, 'dir=-1 會反轉旋轉方向');
  // move: 'both' 是 'all' 的別名（以前不認得、變成 'none'，圓圈與螺紋完全不動）
  for (const type of B.TYPES) {
    const a = plan({ type, move: 'both', speed: 20, width: 30 }), b = plan({ type, move: 'all', speed: 20, width: 30 });
    ok(a.c.move === 'all' && a.p.kind !== 'none' && a.p.x && a.p.y && near(a.p.x.ms, b.p.x.ms) && near(a.p.y.ms, b.p.y.ms), type + "：move 'both' ＝ 'all'，x、y 都會動");
  }
  r = plan({ type: 'circles', move: 'both', speed: 20 }); ok(r.p.kind === 'swing' && r.p.x && r.p.y, "圓圈 move 'both'：左右、上下一起擺動");
  r = plan({ type: 'circles', move: 'both', speed: 20 }); const r2 = plan({ type: 'circles', move: 'both', speed: 80 }); ok(r2.p.x.ms < r.p.x.ms && near(r.p.x.ms / r2.p.x.ms, 4), 'speed 加大 → 擺動週期變短（4 倍速＝週期 1/4）');
  ok(plan({ move: 'sideways' }).c.move === 'none', '不認得的 move 還是 none');
  // 螺紋的旋轉速度 ×10，其他花紋不變
  r = plan({ type: 'spiral', spin: 6, dir: 1 }); ok(r.c.spin === 60 && near(r.p.spin.ms, 6000) && r.p.spin.deg === 360, '螺紋 spin 6 → 實際 60°/s（一圈 6 秒）');
  r = plan({ type: 'spiral', spin: -4, dir: 1 }); ok(r.c.spin === -40 && r.p.spin.deg === -360 && near(r.p.spin.ms, 9000), '螺紋逆時針也 ×10');
  r = plan({ type: 'spiral', spin: [2, 4] }); ok(r.c.spin === 20, '螺紋 [起, 終] 的漸變值也 ×10（第 1 關＝起）');
  r = plan({ type: 'spiral', spin: 0 }); ok(!r.p.spin, '螺紋 spin 0 還是不轉');
  for (const type of ['vstripe', 'hstripe', 'checker', 'hex', 'dots', 'circles']) { r = plan({ type, spin: 6, dir: 1 }); ok(r.c.spin === 6 && near(r.p.spin.ms, 60000), type + '：spin 不乘倍率'); }
}

// ⑧ 圖層大小：要蓋得住旋轉後的遊戲區；位移量越大圖層越大；有上限
{
  const W = 472, H = 640, diag = Math.sqrt(W * W + H * H);
  for (const type of B.TYPES) for (const mv of ['none', 'x', 'y', 'all']) {
    const c = T.resolve({ type, move: mv, dir: 1, width: 30, speed: 30 }, 1, rnd), p = T.motionPlan(c), D = T.layerSize(c, p, W, H);
    ok(D >= diag, type + '/' + mv + '：圖層邊長 ' + D + ' ≥ 對角線 ' + diag.toFixed(0));
    const sx = p.x ? Math.abs(p.x.to) : 0, sy = p.y ? Math.abs(p.y.to) : 0;
    ok(D >= diag + 2 * Math.sqrt(sx * sx + sy * sy), type + '/' + mv + '：移到最遠也蓋得住');
  }
  const c = T.resolve({ type: 'checker', width: 2000, move: 'all' }, 1, rnd); ok(T.layerSize(c, T.motionPlan(c), W, H) <= 3000, '圖層邊長有上限 3000');
}

// ⑨ 檔案層面：每款要加背景的遊戲都有呼叫 kit.bgStripe，參數區有一組 BG 設定；boot.js／sw.js 有登記共用元件
{
  const ROOT = require('path').resolve(__dirname, '../../') + '/', read = f => fs.readFileSync(ROOT + f, 'utf8');
  const boot = read('js/boot.js'), sw = read('sw.js');
  ok(boot.indexOf("'js/reaction_bgstripe.js'") > boot.indexOf("'js/reaction_kit4.js'") && boot.indexOf("'js/reaction_bgstripe.js'") < boot.indexOf("'js/reaction_speed.js'"), 'boot.js：bgstripe 排在 kit4 之後、遊戲之前');
  ok(sw.indexOf("'js/reaction_bgstripe.js'") > 0, 'sw.js 預先快取清單有 bgstripe');
  const css = read('css/reaction_common.css').replace(/[ \t]*\/\*[\s\S]*?\*\//g, '');
  ok(/\.rx-bgstripe\s*\{[^}]*z-index:\s*-1[^}]*pointer-events:\s*none/.test(css), '.rx-bgstripe：z-index -1、不吃觸控');
  const GAMES = ['illusion', 'hangpic', 'area', 'halfvol', 'blindcircle', 'samelen', 'rightangle', 'stamp', 'stackup', 'bridge', 'halfcrowd', 'numline', 'copycurve', 'sneakmove', 'farpair', 'spingap', 'findsquare', 'slicechar', 'ordercut'];
  for (const id of GAMES) {
    const src = read('js/reaction_' + id + '.js').replace(/\/\*[\s\S]*?\*\//g, '');
    ok(/var BG = \{[^}]*from:/.test(src), id + '：有 BG 設定（含 from）');
    ok(/kit\.bgStripe\(/.test(src), id + '：有呼叫 kit.bgStripe');
  }
  // 照抄曲線：判定時兩塊板子疊在一起，背景花紋會蓋住左邊的題目曲線 → 兩塊板子的背景都要在疊合之前 hide()
  { const src = read('js/reaction_copycurve.js').replace(/\/\*[\s\S]*?\*\//g, '');
    ok(/var bgL = kit\.bgStripe\(L\.el[^;]*bgR = kit\.bgStripe\(R\.el/.test(src), 'copycurve：左右兩塊板子的背景都留著控制物件');
    const fin = src.slice(src.indexOf('function finishWith')), iHide = fin.indexOf('bgL.hide()'), iMerge = fin.indexOf("classList.add('copycurve-stage--merge')");
    ok(iHide > 0 && fin.indexOf('bgR.hide()') > 0 && iMerge > iHide && /if \(bgL\) bgL\.hide\(\);/.test(fin) && /if \(bgR\) bgR\.hide\(\);/.test(fin), 'copycurve：判定（finishWith）時先把兩塊板子的背景收起來、再疊合（沒有背景的關卡 bgL／bgR 是 null，要先檢查）'); }
}

console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
process.exit(bad ? 1 : 0);
