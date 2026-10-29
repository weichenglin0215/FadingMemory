/* ═══════════════════════════════════════════════════════════════════
   reaction_eyebrow.js — 秒反應・畫眉毛（企劃 408）
   化妝台的鏡子前。一張臉，**左邊的眉毛已經畫好了**。**手指在右邊畫出另一條眉毛，要跟左邊的「鏡射對稱」**（眉峰的位置、眉尾的方向都要左右反過來）。
   手指放開，就把左邊的眉毛翻過去（鏡射）疊在右邊，算出「相似度 88.3142%」；**相似度要達到及格線（70% → 93%）才過關**。
   ───────────────────────────────────────────────────────────────────
   · 臉的座標：臉有自己的座標系（u 往右、v 往下，原點在臉的中軸上）；臉可以**微微側一點**（旋轉 θ）、**不在畫面正中間**（中心 F），
     所以對稱軸不是畫面的垂直中線，而是「臉的中軸」（看鼻子和嘴巴的位置）。臉座標 (u, v) → 畫面座標：x ＝ Fx ＋ u·cosθ − v·sinθ；y ＝ Fy ＋ u·sinθ ＋ v·cosθ。
     左邊的眉毛是臉座標裡 u < 0 的一串點；它的鏡射就是把每個點的 u 變成 −u（v 不變）。
   · 相似度（similarity）：兩條曲線都先照弧長取 N 個等距的點（resample）；
       D ＝ 「A 的每個點到 B 最近的距離的平均」和「B 的每個點到 A 最近的距離的平均」，兩個方向再取平均（chamfer 距離，方向、起點終點都沒關係）；
       相似度 ＝ 100 × max(0, 1 − D ÷ (SIM_K × L))，L 是參考眉毛的長度。完全重合＝100%；平均偏 0.05 倍的眉毛長度（約 6px）大約是 90%。
   · 眉毛的形狀（browShape）：彎月眉（moon）、一字眉（flat）、拱形眉（arch）、挑眉（raise，有尖角）、波浪眉（wave，兩個起伏）五種規律的形狀，
     加上 V1.36.0 的四種**奇怪形狀**（玩家意見：眉毛形狀太規律、失去樂趣）：隨機曲線眉（odd，5 個控制點的平滑曲線，忽高忽低）、鋸齒眉（zigzag，幾個尖角折來折去）、
     鉤子眉（hook，眉尾往下勾或往上翹）、雙峰眉（twin，兩座山中間一個凹）。第 WEIRD_FROM 關起，奇怪形狀的機率從 WEIRD_P[0] 線性升到 WEIRD_P[1]。
     每個形狀都是「u 一路往外」的函數（不會折回來），所以手指從內端一筆畫到眉尾就畫得出來；高度夾在眉毛該在的範圍（不會碰到眼睛或頭頂）。
   · 難度（線性，到 RAMP_LEVELS 關到頂）：及格線 70% → 93%；臉歪的角度 0 → ±10°（第 5 關起）；臉偏離正中間 0 → ±40px；眉毛的形狀種類越來越多。
   · 畫的時候看得到自己的線（棕色眉筆）；手指放開才判定；太短（還沒畫完就放開）不算，可以重畫。
   · 揭曉：翻過去的眉毛用淡紅色疊在你畫的上面，寫出「相似度 88.3142%（及格線 83.0000%）」。
     V1.36.0：揭曉的同時，**整張臉（連同你畫的線和淡紅色的線）會繞著臉心轉回正的**（歪的角度變 0，TURN_MS 毫秒），並淡淡地畫出臉的中軸，對稱的差異一眼就看得出來。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'eyebrow';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var THRESH = [60, 90];                      /* 及格線（相似度 %）：第 1 關 → 到頂（使用者企劃 70% → 93%） */
    var TILT_DEG = [2, 180];                     /* 臉歪的角度上限（度）：第 1 關 → 到頂（但要到第 TILT_FROM 關才開始歪） */
    var TILT_FROM = 2;                          /* 第幾關起臉會歪 */
    var SHIFT_PX = [8, 80];                     /* 臉偏離正中間的最大距離（px）：第 1 關 → 到頂（但要到第 TILT_FROM 關才開始偏） */
    var BROW_LEN = 100;                         /* 眉毛的長度（px，臉座標裡沿著 u 方向的長度） */
    var BROW_GAP = 30;                          /* 眉毛的內端離中軸多遠（px） */
    var BROW_V = -66;                           /* 眉毛大約在臉中心上方多少 px（v 是往下為正，所以是負的） */
    var SIM_K = 0.5;                            /* 相似度的寬容度：平均偏差達到 SIM_K × 眉毛長度就是 0% */
    var N_RES = 48;                             /* 比對時每條曲線取幾個點 */
    var MIN_PTS = 8;                            /* 至少要畫幾個點才算一筆 */
    var MIN_LEN_FRAC = 0.4;                     /* 畫的長度至少要有眉毛長度的幾成才算一筆（太短是誤觸，不判定） */
    var SOLVE_JITTER = 1.2;                     /* 驗證用：api.solve 畫的線和標準答案的誤差（px） */
    var MAX_LEVEL = 90;
    var BASE_TYPES = ['moon', 'flat', 'arch', 'raise', 'wave'];     /* 規律的眉毛形狀種類（越後面越多種可能） */
    var WEIRD = ['odd', 'zigzag', 'hook', 'twin'];                  /* 奇怪的眉毛形狀（V1.36.0） */
    var TYPES = BASE_TYPES.concat(WEIRD);
    var WEIRD_FROM = 2;                         /* 第幾關起會出現奇怪形狀的眉毛 */
    var WEIRD_P = [0.35, 0.9];                  /* 奇怪形狀的機率：第 WEIRD_FROM 關 → 到頂 */
    var BROW_TOP = -126, BROW_BOTTOM = -46;     /* 眉毛的高度（臉座標 v）夾在這個範圍：不碰頭頂、不碰眼睛（眼睛最上緣在 v ＝ −35） */
    var TURN_MS = 900;                          /* 揭曉時，整張臉轉回正的要多久（毫秒） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }
    function threshFor(level) { return Math.round(ramp(level, THRESH) * 10000) / 10000; }
    function tiltFor(level) { return level < TILT_FROM ? 0 : Math.round(ramp(level, TILT_DEG) * 100) / 100; }
    function shiftFor(level) { return level < TILT_FROM ? 0 : Math.round(ramp(level, SHIFT_PX) * 10) / 10; }
    function typesFor(level) { return BASE_TYPES.slice(0, Math.min(BASE_TYPES.length, 2 + Math.floor(level / 4))); }
    function weirdPFor(level) { return level < WEIRD_FROM ? 0 : Math.round(ramp(level, WEIRD_P) * 10000) / 10000; }
    /* 奇怪形狀要用的隨機參數（makeLevel 挑好、存在 par 裡，browShape 才是純函式）：回傳要併進 par 的欄位 */
    function weirdPar(type, rand) {
        var i, k;
        if (type === 'odd') { var cp = []; for (i = 0; i < 5; i++) cp.push(Math.round(kit.randFloat(-0.3, 0.2, rand) * 1000) / 1000); return { cp: cp }; }
        if (type === 'zigzag') {
            var m = kit.randInt(3, 5, rand), zt = [0], zv = [kit.randFloat(-0.05, 0.12, rand)];
            for (k = 1; k < m; k++) { zt.push(k / m + kit.randFloat(-0.06, 0.06, rand)); zv.push((k % 2 ? -1 : 1) * kit.randFloat(0.08, 0.26, rand) - 0.04); }
            zt.push(1); zv.push(kit.randFloat(-0.2, 0.2, rand));
            return { zt: zt.map(function (x) { return Math.round(x * 1000) / 1000; }), zv: zv.map(function (x) { return Math.round(x * 1000) / 1000; }) };
        }
        if (type === 'hook') return { hs: kit.randFloat(0.5, 0.75, rand), hk: (rand() < 0.65 ? 1 : -1) * kit.randFloat(0.18, 0.34, rand), hh: kit.randFloat(0.1, 0.22, rand) };
        return { c1: kit.randFloat(0.18, 0.34, rand), c2: kit.randFloat(0.66, 0.82, rand), w: kit.randFloat(0.1, 0.16, rand), h1: kit.randFloat(0.1, 0.24, rand), h2: kit.randFloat(0.1, 0.24, rand) };
    }
    /* Catmull-Rom 平滑曲線：通過控制點陣列 p（等間隔），t 在 0～1，回傳那一點的值 */
    function catmull(p, t) {
        var f = Math.min(p.length - 1 - 1e-9, Math.max(0, t * (p.length - 1))), i = Math.floor(f), s = f - i;
        var p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
        return 0.5 * ((2 * p1) + (-p0 + p2) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s * s + (-p0 + 3 * p1 - 3 * p2 + p3) * s * s * s);
    }
    /* 折線插值：節點 (xs[i], ys[i])，x 由小到大 */
    function piecewise(xs, ys, x) {
        for (var i = 1; i < xs.length; i++) if (x <= xs[i]) { var d = xs[i] - xs[i - 1]; return d <= 0 ? ys[i] : ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / d; }
        return ys[ys.length - 1];
    }
    /* 一條折線的長度 */
    function pathLength(p) { var s = 0; for (var i = 1; i < p.length; i++) s += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); return s; }
    /* 照弧長把折線取成 n 個等距的點（含頭尾）；只有一個點或長度 0 時全部都是那個點 */
    function resample(p, n) {
        var L = pathLength(p), out = [];
        if (p.length === 0) return out;
        if (L === 0) { for (var k = 0; k < n; k++) out.push({ x: p[0].x, y: p[0].y }); return out; }
        var step = L / (n - 1), acc = 0, seg = 0, i;
        out.push({ x: p[0].x, y: p[0].y });
        for (i = 1; i < n - 1; i++) {
            var target = step * i;
            while (seg < p.length - 2 && acc + Math.hypot(p[seg + 1].x - p[seg].x, p[seg + 1].y - p[seg].y) < target) { acc += Math.hypot(p[seg + 1].x - p[seg].x, p[seg + 1].y - p[seg].y); seg++; }
            var dl = Math.hypot(p[seg + 1].x - p[seg].x, p[seg + 1].y - p[seg].y), f = dl === 0 ? 0 : (target - acc) / dl;
            out.push({ x: p[seg].x + (p[seg + 1].x - p[seg].x) * f, y: p[seg].y + (p[seg + 1].y - p[seg].y) * f });
        }
        out.push({ x: p[p.length - 1].x, y: p[p.length - 1].y });
        return out;
    }
    /* 點 q 到折線（線段們）的最近距離 */
    function distToPath(q, p) {
        var best = 1e18;
        if (p.length === 1) return Math.hypot(q.x - p[0].x, q.y - p[0].y);
        for (var i = 1; i < p.length; i++) {
            var ax = p[i - 1].x, ay = p[i - 1].y, bx = p[i].x, by = p[i].y, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, s = L2 > 0 ? Math.max(0, Math.min(1, ((q.x - ax) * dx + (q.y - ay) * dy) / L2)) : 0;
            var d = Math.hypot(q.x - (ax + s * dx), q.y - (ay + s * dy)); if (d < best) best = d;
        }
        return best;
    }
    /* chamfer 距離：A 的每個點到 B 的平均最近距離、B 的每個點到 A 的平均最近距離，兩個方向取平均 */
    function chamfer(A, B) {
        var ra = resample(A, N_RES), rb = resample(B, N_RES), s1 = 0, s2 = 0, i;
        for (i = 0; i < ra.length; i++) s1 += distToPath(ra[i], B);
        for (i = 0; i < rb.length; i++) s2 += distToPath(rb[i], A);
        return (s1 / ra.length + s2 / rb.length) / 2;
    }
    /* 相似度（%）：A 和 B 兩條曲線，L ＝ 參考眉毛的長度 */
    function similarity(A, B, L) { return Math.round(100 * Math.max(0, 1 - chamfer(A, B) / (SIM_K * L)) * 10000) / 10000; }
    /* 臉座標 (u, v) → 畫面座標：臉心 F、歪了 theta 弧度 */
    function toScreen(pt, F, theta) { var c = Math.cos(theta), s = Math.sin(theta); return { x: F.x + pt.u * c - pt.v * s, y: F.y + pt.u * s + pt.v * c }; }
    /* 左邊眉毛（臉座標，u < 0）的鏡射（臉座標）：u 變 −u */
    function mirrorLocal(p) { return p.map(function (q) { return { u: -q.u, v: q.v }; }); }
    /* 一條眉毛（臉座標）：從內端（靠近中軸）到外端（眉尾），n 個點；形狀 type */
    function browShape(type, par, n) {
        var out = [];
        for (var i = 0; i < n; i++) {
            var t = i / (n - 1), u = -(BROW_GAP + BROW_LEN * t), v;
            if (type === 'flat') v = BROW_V + par.slope * BROW_LEN * t;
            else if (type === 'moon') v = BROW_V - par.h * BROW_LEN * Math.sin(Math.PI * t) + par.slope * BROW_LEN * t;
            else if (type === 'arch') { var p = par.peak; v = t <= p ? BROW_V - par.h * BROW_LEN * Math.pow(t / p, 1.3) : BROW_V - par.h * BROW_LEN * (1 - Math.pow((t - p) / (1 - p), 1.4) * (1 + par.drop)); }
            else if (type === 'raise') { var pk = par.peak; v = t <= pk ? BROW_V - par.h * BROW_LEN * (t / pk) : BROW_V - par.h * BROW_LEN * (1 - (t - pk) / (1 - pk) * 1.5); }
            else if (type === 'odd') { var cp = par.cp || [0, par.h, -par.h, par.slope, 0]; v = BROW_V + catmull(cp, t) * BROW_LEN; }                                  /* 隨機曲線：忽高忽低的平滑曲線 */
            else if (type === 'zigzag') { var zt = par.zt || [0, 0.35, 0.65, 1], zv = par.zv || [0, -par.h, par.h * 0.5, -par.h]; v = BROW_V + piecewise(zt, zv, t) * BROW_LEN; }       /* 鋸齒：幾個尖角 */
            else if (type === 'hook') { var hs = par.hs || par.peak, hk = par.hk == null ? par.drop : par.hk, hh = par.hh || par.h; v = t <= hs ? BROW_V - hh * BROW_LEN * Math.pow(t / hs, 0.9) : BROW_V - hh * BROW_LEN + hk * BROW_LEN * Math.pow((t - hs) / (1 - hs), 1.6); }   /* 鉤子：眉尾往下勾（hk > 0）或往上翹 */
            else if (type === 'twin') { var c1 = par.c1 || 0.25, c2 = par.c2 || 0.75, w = par.w || 0.12, h1 = par.h1 || par.h, h2 = par.h2 || par.h; v = BROW_V - BROW_LEN * (h1 * Math.exp(-Math.pow((t - c1) / w, 2)) + h2 * Math.exp(-Math.pow((t - c2) / w, 2))) + par.slope * BROW_LEN * t; }   /* 雙峰：兩座山中間一個凹 */
            else v = BROW_V - par.h * BROW_LEN * Math.sin(2 * Math.PI * t * par.waves) * 0.6 + par.slope * BROW_LEN * t;         /* wave */
            v = Math.max(BROW_TOP, Math.min(BROW_BOTTOM, v));
            out.push({ u: Math.round(u * 10) / 10, v: Math.round(v * 10) / 10 });
        }
        return out;
    }
    /* 出一關：{ level, type, par, brow（左眉，臉座標 24 點）, mirror（鏡射後的右眉，臉座標）, F（臉心，畫面座標）, thetaDeg, theta, thresh, len（參考眉毛長度）, L（畫面上的長度）, ref（左眉，畫面座標）, target（鏡射右眉，畫面座標）} */
    function makeLevel(level, rand, W, H) {
        rand = rand || Math.random; W = W || 472; H = H || 640;
        var weird = rand() < weirdPFor(level), type = weird ? kit.pick(WEIRD, rand) : kit.pick(typesFor(level), rand), par = { h: kit.randFloat(0.08, 0.22, rand), slope: kit.randFloat(-0.1, 0.12, rand), peak: kit.randFloat(0.4, 0.72, rand), drop: kit.randFloat(0, 0.6, rand), waves: rand() < 0.5 ? 1 : 1.5 };
        if (type === 'flat') par.slope = kit.randFloat(-0.06, 0.08, rand);
        if (type === 'raise') par.h = kit.randFloat(0.12, 0.24, rand);
        if (weird) { var wp = weirdPar(type, rand); Object.keys(wp).forEach(function (key) { par[key] = wp[key]; }); }
        var brow = browShape(type, par, 24), mirror = mirrorLocal(brow);
        var tilt = tiltFor(level), thetaDeg = tilt === 0 ? 0 : (rand() < 0.5 ? -1 : 1) * kit.randFloat(tilt * 0.5, tilt, rand), shift = shiftFor(level), dx = shift === 0 ? 0 : kit.randFloat(-shift, shift, rand);
        var F = { x: Math.round((W / 2 + dx) * 10) / 10, y: Math.round(H * 0.46) }, theta = thetaDeg * Math.PI / 180;
        var ref = brow.map(function (q) { return toScreen(q, F, theta); }), target = mirror.map(function (q) { return toScreen(q, F, theta); });
        return { level: level, type: type, par: par, brow: brow, mirror: mirror, F: F, thetaDeg: Math.round(thetaDeg * 100) / 100, theta: theta, thresh: threshFor(level), len: BROW_LEN, L: pathLength(ref), ref: ref, target: target };
    }
    function fmt4(v) { return v.toFixed(4); }
    function whyText(sim, thresh) { return sim >= thresh ? '相似度 ' + fmt4(sim) + '%（及格線 ' + fmt4(thresh) + '%）——過關！' : '相似度 ' + fmt4(sim) + '%，沒達到及格線 ' + fmt4(thresh) + '%'; }
    function rating(n) {
        if (n >= 15) return '化妝大師！';
        if (n >= 9) return '手很穩！';
        if (n >= 5) return '不錯喔！';
        if (n >= 2) return '再接再厲！';
        return '眉峰、眉尾都要反過來！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'ebw-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function pts2d(p) { return p.map(function (q) { return q.x.toFixed(1) + ',' + q.y.toFixed(1); }).join(' '); }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var q = makeLevel(level, api.rand, W, H);
        api.info = q;
        console.log('[畫眉毛] 第 ' + level + ' 關：' + q.type + '眉（左眉長 ' + q.L.toFixed(0) + ' px）；臉心 (' + q.F.x + ', ' + q.F.y + ')、歪 ' + q.thetaDeg + '°；及格線 ' + q.thresh + '%');

        var field = h('div', { 'class': 'ebw-field' });
        stage.appendChild(field);
        var tip = h('div', { 'class': 'qz-note ebw-tip', text: level === 1 ? '照左邊的眉毛，在右邊畫一條左右對稱的！' : '畫出和左邊對稱的右眉（及格線 ' + q.thresh.toFixed(0) + '%）' });
        field.appendChild(tip);
        var svg = kit.svg('svg', { 'class': 'ebw-svg', width: W, height: H, viewBox: '0 0 ' + W + ' ' + H }, field);
        /* 臉：整個臉（頭、鼻、嘴、眼睛）畫在臉座標裡，用 transform 轉歪、移位 */
        var turn = kit.svg('g', { 'class': 'ebw-turn' }, svg);                     /* 揭曉時整組繞著臉心轉回正的：臉、你畫的線、淡紅色的線都放在裡面 */
        turn.style.transformOrigin = q.F.x + 'px ' + q.F.y + 'px'; turn.style.transitionDuration = TURN_MS + 'ms';
        var face = kit.svg('g', { transform: 'translate(' + q.F.x + ',' + q.F.y + ') rotate(' + q.thetaDeg + ')' }, turn);
        kit.svg('ellipse', { 'class': 'ebw-head', cx: 0, cy: 8, rx: 150, ry: 188 }, face);
        kit.svg('ellipse', { 'class': 'ebw-ear', cx: -152, cy: 10, rx: 14, ry: 34 }, face); kit.svg('ellipse', { 'class': 'ebw-ear', cx: 152, cy: 10, rx: 14, ry: 34 }, face);
        [-1, 1].forEach(function (sg) { kit.svg('ellipse', { 'class': 'ebw-eye', cx: sg * 62, cy: -22, rx: 28, ry: 13 }, face); kit.svg('circle', { 'class': 'ebw-pupil', cx: sg * 62, cy: -22, r: 9 }, face); });
        kit.svg('path', { 'class': 'ebw-nose', d: 'M0,-10 L-8,52 Q0,62 12,52' }, face);
        kit.svg('path', { 'class': 'ebw-mouth', d: 'M-44,100 Q0,128 44,100' }, face);
        /* 左邊的眉毛（已經畫好；臉座標，畫在臉的 group 裡所以會跟著臉歪） */
        kit.svg('polyline', { 'class': 'ebw-ref', points: q.brow.map(function (p) { return p.u + ',' + p.v; }).join(' ') }, face);
        var axis = kit.svg('line', { 'class': 'ebw-axis', x1: 0, y1: -190, x2: 0, y2: 205 }, face);                    /* 臉的中軸（揭曉時淡淡地顯示） */
        var mine = kit.svg('polyline', { 'class': 'ebw-mine', points: '' }, turn), ghost = kit.svg('polyline', { 'class': 'ebw-ghost', points: '' }, turn);
        var info = h('div', { 'class': 'qz-note ebw-info', text: '' }); info.style.top = Math.round(H * 0.46 + 215) + 'px'; field.appendChild(info);
        if (level === 1 && kit.once('eyebrow.hint')) { var s0 = q.target[0], s1 = q.target[q.target.length - 1]; kit.hintOn(stage, null, { mode: 'drag', x: s0.x, y: s0.y, dx: s1.x - s0.x, dy: s1.y - s0.y, delay: 800, text: '在右邊畫出對稱的眉毛' }); }

        var phase = 'draw', pts = [], down = null;
        field.addEventListener('pointerdown', function (e) {
            if (phase !== 'draw' || api.over || down) return;
            e.preventDefault(); try { field.setPointerCapture(e.pointerId); } catch (err) { }
            down = { id: e.pointerId }; var p = kit.localPt(e, field); pts = [{ x: p.x, y: p.y }]; mine.setAttribute('points', pts2d(pts));
        });
        field.addEventListener('pointermove', function (e) {
            if (!down || e.pointerId !== down.id || phase !== 'draw') return;
            var p = kit.localPt(e, field), last = pts[pts.length - 1]; if (Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
            pts.push({ x: p.x, y: p.y }); mine.setAttribute('points', pts2d(pts));
        });
        function up(e) {
            if (!down || e.pointerId !== down.id) return;
            down = null; if (phase !== 'draw') return;
            if (pts.length < MIN_PTS || pathLength(pts) < MIN_LEN_FRAC * q.L) { mine.setAttribute('points', ''); pts = []; info.textContent = '畫長一點，再畫一次'; return; }       /* 太短＝誤觸：不判定，可以重畫 */
            judge(pts);
        }
        field.addEventListener('pointerup', up); field.addEventListener('pointercancel', function (e) { if (down && e.pointerId === down.id) { down = null; if (phase === 'draw') { mine.setAttribute('points', ''); pts = []; } } });

        /* 判定：手指放開才算；把鏡射後的左眉（淡紅色）疊在你畫的上面，寫出相似度 */
        function judge(stroke) {
            if (phase !== 'draw' || api.over) return;
            phase = 'end'; mine.setAttribute('points', pts2d(stroke)); ghost.setAttribute('points', pts2d(q.target));
            turn.style.transform = 'rotate(' + (-q.thetaDeg) + 'deg)'; axis.classList.add('ebw-axis--on');         /* 整張臉轉回正的（歪的角度變 0），對稱的差異更容易看出來 */
            var sim = similarity(stroke, q.target, q.L), ok = sim >= q.thresh, why = whyText(sim, q.thresh);
            info.textContent = why; info.classList.add(ok ? 'ebw-info--ok' : 'ebw-info--bad'); tip.textContent = ok ? '畫得好！' : '淡紅色是左眉翻過去的樣子';
            if (ok) { kit.flash(stage, true, api.my); Sfx.play('ok'); api.pass({ delay: 2300 }); return; }
            kit.flash(stage, false, api.my);
            api.fail({ delay: 4200, lines: [why, '把左邊的眉毛左右翻過去（鏡射）就是淡紅色那條', '臉歪了 ' + q.thetaDeg + '°，對稱軸是臉的中軸（看鼻子），不是畫面的正中間'] });
        }
        /* 驗證用：畫出標準答案（加一點抖動）送出（solve）；畫一條橫線送出（wrong）；可重複呼叫 */
        api.solve = function () { if (phase !== 'draw') return; var r = api.rand, st = q.target.map(function (p) { return { x: p.x + (r() - 0.5) * 2 * SOLVE_JITTER, y: p.y + (r() - 0.5) * 2 * SOLVE_JITTER }; }); judge(st); };
        api.wrong = function () { if (phase !== 'draw') return; var st = []; for (var i = 0; i < 20; i++) st.push({ x: q.F.x + 30 + i * 6, y: q.F.y + 120 }); judge(st); };
    }

    var G = {
        id: ID,
        name: '畫眉毛',
        rule: '化妝台的鏡子前，一張臉，**左邊的眉毛已經畫好了**。**用手指在右邊畫出另一條眉毛，要和左邊的「鏡射對稱」**——眉峰、眉尾都要左右反過來。放手之後，左邊的眉毛會翻過去疊在右邊，算出相似度，**要達到及格線才過關**。臉有時會歪一點、不在正中間，**對稱軸是臉的中軸**（看鼻子和嘴巴）。放手之後整張臉會轉正，讓你看清楚差在哪裡。越後面，眉毛形狀越奇怪（忽高忽低、鋸齒、鉤子、雙峰），及格線也越高！',
        mount: mount,
        score: SCORE,
        test: {
            threshFor: threshFor, tiltFor: tiltFor, shiftFor: shiftFor, typesFor: typesFor, weirdPFor: weirdPFor, weirdPar: weirdPar, catmull: catmull, piecewise: piecewise, pathLength: pathLength, resample: resample, distToPath: distToPath, chamfer: chamfer, similarity: similarity, toScreen: toScreen, mirrorLocal: mirrorLocal, browShape: browShape, makeLevel: makeLevel, whyText: whyText, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, THRESH: THRESH, TILT_DEG: TILT_DEG, TILT_FROM: TILT_FROM, SHIFT_PX: SHIFT_PX, BROW_LEN: BROW_LEN, BROW_GAP: BROW_GAP, BROW_V: BROW_V, SIM_K: SIM_K, N_RES: N_RES, MIN_PTS: MIN_PTS, MIN_LEN_FRAC: MIN_LEN_FRAC, SOLVE_JITTER: SOLVE_JITTER, TYPES: TYPES, BASE_TYPES: BASE_TYPES, WEIRD: WEIRD, WEIRD_FROM: WEIRD_FROM, WEIRD_P: WEIRD_P, BROW_TOP: BROW_TOP, BROW_BOTTOM: BROW_BOTTOM, TURN_MS: TURN_MS, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
