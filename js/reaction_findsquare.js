/* ═══════════════════════════════════════════════════════════════════
   reaction_findsquare.js — 秒反應・找正方形（企劃 260）
   夜空裡撒著一堆星星。**裡面剛好有四顆星能連成一個正方形**，把這四顆點出來（點滿四顆就判定）。
   ───────────────────────────────────────────────────────────────────
   · 「正方形」的判定（quadMetrics）：四個點兩兩的距離共 6 個，排序之後前 4 個是「邊」、後 2 個是「對角線」。
     正方形 ⇔ 四條邊一樣長、兩條對角線一樣長、對角線 ÷ 邊 ＝ √2。把這三項的相對誤差取最大的當 eps（squareErr）：
     eps 越小越像正方形；eps < EPS_SQ（1%）算正方形。這個算法不用先把四個點排成順序，窮舉所有 4 個點的組合很快。
   · 唯一的正方形：出題（makeLevel）先放一個轉了 15°～75° 的正方形（大多是斜的）、再放誘餌（菱形、長方形：四個點的 eps 在 EPS_NONSQ 和 DECOY_MAX 之間，
     越後面上限越小＝越像）、最後放雜訊星星；每放一顆就窮舉檢查「含這顆的所有 4 點組合，除了真正方形以外 eps 都要 ≥ EPS_NONSQ（3%）」，
     最後再整盤窮舉一次：**剛好只有一個正方形**。
   · 難度（線性）：星星 8 → 30 顆（POINTS）、誘餌 0 → 3 組（DECOYS）、誘餌的誤差上限 20% → 6%（DECOY_MAX）、限時 20 → 10 秒（TIME_S）。
   · 揭曉：答對把正方形連起來（像一個星座）；答錯畫出你點的四邊形，寫出它哪裡不是正方形（例如「最長的邊和最短的邊差 4.2731%」），再畫出真的正方形。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'findsquare';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 24;                       /* 幾關之後難度到頂 */
    var POINTS = [8, 30];                       /* 星星總數：第 1 關 → 到頂 */
    var DECOYS = [0, 3];                        /* 誘餌（差一點的菱形／長方形）組數：第 1 關 → 到頂 */
    var DECOY_MAX = [0.20, 0.06];               /* 誘餌的誤差（eps）上限：第 1 關 → 到頂（越小越像正方形） */
    var TIME_S = [20, 10];                      /* 每關限時（秒）：第 1 關 → 到頂 */
    var EPS_SQ = 0.012;                         /* eps 小於這個就算「是正方形」（出題時真正方形只有座標四捨五入的誤差） */
    var EPS_NONSQ = 0.03;                       /* 其他任何 4 個點的 eps 都要至少這麼大（才不會有第二個「幾乎是正方形」） */
    var FIELD = { w: 440, h: 500 };             /* 虛擬的星空大小（顯示時等比例縮放） */
    var MARGIN = 24, MIN_DIST = 40;             /* 星星離邊界至少多遠、星星之間至少多遠（虛擬 px，手指才點得準） */
    var SIDE = [100, 190];                      /* 正方形的邊長範圍 */
    var ROT = [15, 75];                         /* 正方形的旋轉角（度）：大多是斜的 */
    var MAX_LEVEL = 60;
    var SQRT2 = Math.SQRT2;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }
    function pointsFor(level) { return Math.round(ramp(level, POINTS)); }
    function decoysFor(level) { return Math.round(ramp(level, DECOYS)); }
    function decoyMaxFor(level) { return ramp(level, DECOY_MAX); }
    function timeMs(level) { return Math.round(ramp(level, TIME_S) * 1000); }
    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    /* 四個點的「正方形誤差」詳情：{ side（邊長不一的程度）, diag（對角線不一的程度）, ratio（對角線÷邊 偏離 √2 的程度）, eps（三者最大）} */
    function quadMetrics(p) {
        var d = [dist(p[0], p[1]), dist(p[0], p[2]), dist(p[0], p[3]), dist(p[1], p[2]), dist(p[1], p[3]), dist(p[2], p[3])].sort(function (a, b) { return a - b; });
        var ms = (d[0] + d[1] + d[2] + d[3]) / 4, md = (d[4] + d[5]) / 2;
        if (ms < 1e-9) return { side: 1, diag: 1, ratio: 1, eps: 1 };
        var side = (d[3] - d[0]) / ms, diag = (d[5] - d[4]) / md, ratio = Math.abs(md / ms - SQRT2) / SQRT2;
        return { side: side, diag: diag, ratio: ratio, eps: Math.max(side, diag, ratio) };
    }
    function squareErr(p) { return quadMetrics(p).eps; }
    /* 把四個點依照繞重心的角度排成「一圈」的順序（回傳排好的點的編號） */
    function orderQuad(pts, idx) {
        var cx = 0, cy = 0; idx.forEach(function (i) { cx += pts[i].x; cy += pts[i].y; }); cx /= idx.length; cy /= idx.length;
        return idx.slice().sort(function (a, b) { return Math.atan2(pts[a].y - cy, pts[a].x - cx) - Math.atan2(pts[b].y - cy, pts[b].x - cx); });
    }
    /* 窮舉：所有 eps < limit 的 4 點組合（編號由小到大）。exceptSet（選填）：這一組不算 */
    function squaresIn(pts, limit) {
        var out = [], n = pts.length;
        for (var a = 0; a < n; a++) for (var b = a + 1; b < n; b++) for (var c = b + 1; c < n; c++) for (var d = c + 1; d < n; d++) {
            var e = squareErr([pts[a], pts[b], pts[c], pts[d]]);
            if (e < limit) out.push({ idx: [a, b, c, d], eps: e });
        }
        return out;
    }
    /* 含第 k 個點的所有 4 點組合裡，最小的 eps（排除 skip 這一組）；點很多也很快（只看含 k 的） */
    function minEpsWith(pts, k, skip) {
        var best = 1e9, n = pts.length, skipKey = skip ? skip.slice().sort(function (x, y) { return x - y; }).join() : null;
        for (var a = 0; a < n; a++) { if (a === k) continue;
            for (var b = a + 1; b < n; b++) { if (b === k) continue;
                for (var c = b + 1; c < n; c++) { if (c === k) continue;
                    if (skipKey && [a, b, c, k].sort(function (x, y) { return x - y; }).join() === skipKey) continue;
                    var e = squareErr([pts[a], pts[b], pts[c], pts[k]]); if (e < best) best = e;
                } } }
        return best;
    }
    /* 你點的四顆星哪裡不像正方形：回傳 { text, pct（那項誤差的百分比，X.XXXX）, kind } */
    function describeQuad(pts, idx) {
        var m = quadMetrics(idx.map(function (i) { return pts[i]; }));
        var best = Math.max(m.side, m.diag, m.ratio), kind, text;
        if (best === m.side) { kind = 'side'; text = '最長的邊和最短的邊差 ' + (m.side * 100).toFixed(4) + '%（正方形四邊要一樣長）'; }
        else if (best === m.diag) { kind = 'diag'; text = '兩條對角線差 ' + (m.diag * 100).toFixed(4) + '%（正方形的角要都是直角）'; }
        else { kind = 'ratio'; text = '對角線不是邊長的 √2 倍（差 ' + (m.ratio * 100).toFixed(4) + '%）'; }
        return { text: text, pct: best * 100, kind: kind, metrics: m };
    }
    function inField(p) { return p.x >= MARGIN && p.x <= FIELD.w - MARGIN && p.y >= MARGIN && p.y <= FIELD.h - MARGIN; }
    function r1(v) { return Math.round(v * 10) / 10; }
    /* 一個正方形的四個角（中心 c、邊長 s、旋轉 deg 度），座標取到 0.1 */
    function squareAt(cx, cy, s, deg) {
        var a = deg * Math.PI / 180, ux = Math.cos(a) * s / 2, uy = Math.sin(a) * s / 2, vx = -uy, vy = ux;
        return [{ x: r1(cx - ux - vx), y: r1(cy - uy - vy) }, { x: r1(cx + ux - vx), y: r1(cy + uy - vy) }, { x: r1(cx + ux + vx), y: r1(cy + uy + vy) }, { x: r1(cx - ux + vx), y: r1(cy - uy + vy) }];
    }
    /* 誘餌：差一點的菱形（角不是直角）或長方形（邊差一點）。中心 c、基準邊長 s、旋轉 deg；kind＝'rhombus'｜'rect'；amt＝偏離程度 */
    function decoyAt(cx, cy, s, deg, kind, amt) {
        var a = deg * Math.PI / 180, ux, uy, vx, vy;
        if (kind === 'rect') { ux = Math.cos(a) * s * (1 + amt) / 2; uy = Math.sin(a) * s * (1 + amt) / 2; vx = -Math.sin(a) * s / 2; vy = Math.cos(a) * s / 2; }
        else { var b = a + (Math.PI / 2 - amt); ux = Math.cos(a) * s / 2; uy = Math.sin(a) * s / 2; vx = Math.cos(b) * s / 2; vy = Math.sin(b) * s / 2; }
        return [{ x: r1(cx - ux - vx), y: r1(cy - uy - vy) }, { x: r1(cx + ux - vx), y: r1(cy + uy - vy) }, { x: r1(cx + ux + vx), y: r1(cy + uy + vy) }, { x: r1(cx - ux + vx), y: r1(cy - uy + vy) }];
    }
    function farEnough(pts, p) { for (var i = 0; i < pts.length; i++) if (dist(pts[i], p) < MIN_DIST) return false; return true; }
    /* 出一關：{ pts（星星座標）, sq（真正方形的四個編號：0～3）, decoys（[{ idx, eps }]）, level, field } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var N = pointsFor(level), D = decoysFor(level), dmax = decoyMaxFor(level);
        for (var tr = 0; tr < 400; tr++) {
            var s = kit.randFloat(SIDE[0], SIDE[1], rand), deg = kit.randFloat(ROT[0], ROT[1], rand);
            var ext = s * (Math.abs(Math.cos(deg * Math.PI / 180)) + Math.abs(Math.sin(deg * Math.PI / 180))) / 2;       /* 轉過之後的半寬 */
            var lo = MARGIN + ext, hiX = FIELD.w - MARGIN - ext, hiY = FIELD.h - MARGIN - ext;
            if (hiX <= lo || hiY <= lo) continue;
            var sq = squareAt(kit.randFloat(lo, hiX, rand), kit.randFloat(lo, hiY, rand), s, deg);
            if (!sq.every(inField) || squareErr(sq) >= EPS_SQ) continue;
            var pts = sq.slice(), decoys = [], g;
            /* 誘餌 */
            for (g = 0; g < 400 && decoys.length < D; g++) {
                var ds = kit.randFloat(80, 170, rand), kind = rand() < 0.5 ? 'rhombus' : 'rect', amt = kit.randFloat(EPS_NONSQ + 0.01, Math.max(EPS_NONSQ + 0.015, dmax), rand);      /* 偏離程度：長方形的邊差比例、菱形的角偏差（弧度），誤差大約就等於它 */
                var dq = decoyAt(kit.randFloat(MARGIN + 60, FIELD.w - MARGIN - 60, rand), kit.randFloat(MARGIN + 60, FIELD.h - MARGIN - 60, rand), ds, kit.randFloat(0, 90, rand), kind, amt);
                var eps = squareErr(dq);
                if (!dq.every(inField) || eps < EPS_NONSQ + 0.004 || eps > dmax) continue;
                if (!dq.every(function (p) { return farEnough(pts, p); })) continue;
                var base = pts.length; dq.forEach(function (p) { pts.push(p); });
                var okAll = true; for (var k = base; k < pts.length && okAll; k++) if (minEpsWith(pts, k, [0, 1, 2, 3]) < EPS_NONSQ) okAll = false;
                if (!okAll) { pts.length = base; continue; }
                decoys.push({ idx: [base, base + 1, base + 2, base + 3], eps: eps });
            }
            /* 雜訊星星：一顆顆放，放了之後不能出現第二個「幾乎是正方形」 */
            var tries = 0;
            while (pts.length < N && tries++ < 600) {
                var p = { x: r1(kit.randFloat(MARGIN, FIELD.w - MARGIN, rand)), y: r1(kit.randFloat(MARGIN, FIELD.h - MARGIN, rand)) };
                if (!farEnough(pts, p)) continue;
                pts.push(p);
                if (minEpsWith(pts, pts.length - 1, [0, 1, 2, 3]) < EPS_NONSQ) pts.pop();
            }
            if (pts.length < N) continue;
            /* 洗牌：星星的順序打亂（真正方形不要永遠是前 4 顆）；回傳時記住新編號 */
            var order = kit.shuffle(pts.map(function (q, i) { return i; }), rand), np = order.map(function (i) { return pts[i]; }), inv = []; order.forEach(function (o, ni) { inv[o] = ni; });
            return { pts: np, sq: [0, 1, 2, 3].map(function (i) { return inv[i]; }).sort(function (a, b) { return a - b; }), decoys: decoys.map(function (dc) { return { idx: dc.idx.map(function (i) { return inv[i]; }).sort(function (a, b) { return a - b; }), eps: dc.eps }; }), level: level, field: FIELD, rot: deg, side: s };
        }
        /* 保底（極少用到）：一個正放的正方形加幾顆星 */
        var fb = squareAt(220, 250, 140, 30); fb.push({ x: 60, y: 60 }, { x: 380, y: 90 }, { x: 60, y: 440 }, { x: 390, y: 450 });
        return { pts: fb, sq: [0, 1, 2, 3], decoys: [], level: level, field: FIELD, rot: 30, side: 140 };
    }
    function rating(n) {
        if (n >= 25) return '星座大師！';
        if (n >= 15) return '眼力很準！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '先找斜斜的、四邊一樣長的！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'fsq-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 五角星的 SVG path（中心 0,0、外半徑 R） */
    function starPath(R) {
        var p = [];
        for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * 0.45 : R; p.push((r * Math.cos(a)).toFixed(2) + ',' + (r * Math.sin(a)).toFixed(2)); }
        return 'M' + p.join(' L') + ' Z';
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand), pts = q.pts;
        api.info = q;
        console.log('[找正方形] 第 ' + level + ' 關：星星 ' + pts.length + ' 顆（誘餌 ' + q.decoys.length + ' 組' + (q.decoys.length ? '，誤差 ' + q.decoys.map(function (d) { return (d.eps * 100).toFixed(1) + '%'; }).join('、') : '') + '）；正方形 ' + q.sq.join(',') + '（邊 ' + q.side.toFixed(0) + '、轉 ' + q.rot.toFixed(0) + '°）；限時 ' + timeMs(level) + ' ms');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var sc = Math.min((W - 12) / FIELD.w, (H - 130) / FIELD.h), fw = FIELD.w * sc, fh = FIELD.h * sc, fx = Math.round((W - fw) / 2), fy = 58;
        var tip = h('div', { 'class': 'qz-note fsq-tip', text: '找出剛好連成正方形的四顆星' });
        stage.appendChild(tip);
        var sky = h('div', { 'class': 'fsq-sky' });
        sky.style.cssText = 'left:' + fx + 'px;top:' + fy + 'px;width:' + fw + 'px;height:' + fh + 'px;';
        stage.appendChild(sky);
        var svg = kit.svg('svg', { 'class': 'fsq-svg', viewBox: '0 0 ' + FIELD.w + ' ' + FIELD.h, width: fw, height: fh }, sky);
        var gLines = kit.svg('g', {}, svg), gStars = kit.svg('g', {}, svg);
        var starEls = pts.map(function (p, i) {
            var g = kit.svg('g', { 'class': 'fsq-star', transform: 'translate(' + p.x + ',' + p.y + ')' }, gStars);
            kit.svg('circle', { 'class': 'fsq-halo', cx: 0, cy: 0, r: 19 }, g);
            kit.svg('path', { 'class': 'fsq-shape', d: starPath(11) }, g);
            kit.svg('circle', { 'class': 'fsq-hit', cx: 0, cy: 0, r: 24 }, g);          /* 看不見的大圓：手指比較好點 */
            kit.onTap(g, function () { tap(i); });
            return g;
        });
        var info = h('div', { 'class': 'qz-note fsq-info', text: '已選 0／4' });
        info.style.top = (fy + fh + 8) + 'px';
        stage.appendChild(info);
        var sel = [], done = false;
        api.timer(timeMs(level), function () { judge(); });
        if (level === 1 && kit.once('findsquare.hint')) {
            var hp = pts[q.sq[0]];
            kit.hintOn(stage, null, { mode: 'tap', x: fx + hp.x * sc, y: fy + hp.y * sc, delay: 700, text: '請點出組成正方形的四顆星' });
        }
        function tap(i) {
            if (done || api.over) return;
            var at = sel.indexOf(i);
            if (at >= 0) { sel.splice(at, 1); starEls[i].classList.remove('fsq-star--on'); }
            else { sel.push(i); starEls[i].classList.add('fsq-star--on'); Sfx.play('click'); }
            info.textContent = '已選 ' + sel.length + '／4';
            if (sel.length === 4) judge();
        }
        /* 把一圈的四顆星連起來（cls：fsq-line--ok｜--bad｜--true） */
        function drawQuad(idx, cls) {
            var o = orderQuad(pts, idx);
            for (var k = 0; k < 4; k++) { var a = pts[o[k]], b = pts[o[(k + 1) % 4]]; kit.svg('line', { 'class': 'fsq-line ' + cls, x1: a.x, y1: a.y, x2: b.x, y2: b.y }, gLines); }
        }
        function judge() {
            if (done || api.over) return;
            done = true;
            var ok = sel.length === 4 && squareErr(sel.map(function (i) { return pts[i]; })) < EPS_SQ;
            if (ok) {
                drawQuad(sel, 'fsq-line--ok');
                info.textContent = '找到了！是一個正方形';
                kit.flash(stage, true, api.my);
                api.pass({ delay: 1600 });
                return;
            }
            kit.flash(stage, false, api.my);
            if (sel.length === 4) {
                var ds = describeQuad(pts, sel);
                drawQuad(sel, 'fsq-line--bad');
                info.textContent = '你選的：' + ds.text;
                api.after(1500, function () { drawQuad(q.sq, 'fsq-line--true'); q.sq.forEach(function (i) { starEls[i].classList.add('fsq-star--true'); }); info.textContent = '綠色的才是真的正方形'; });
                api.fail({ delay: 4200, lines: ['你選的四邊形：' + ds.text, '綠色的四顆星才是真的正方形'] });
            } else {
                drawQuad(q.sq, 'fsq-line--true'); q.sq.forEach(function (i) { starEls[i].classList.add('fsq-star--true'); });
                info.textContent = '時間到！綠色的是正方形';
                api.fail({ delay: 3000, lines: ['時間到！', '綠色的四顆星才是真的正方形'] });
            }
        }
        api.solve = function () { q.sq.forEach(function (i) { tap(i); }); };
        api.wrong = function () {
            if (q.decoys.length) { q.decoys[0].idx.forEach(function (i) { tap(i); }); return; }               /* 有誘餌就點誘餌（最像的錯誤） */
            var others = pts.map(function (p, i) { return i; }).filter(function (i) { return q.sq.indexOf(i) < 0; });
            [q.sq[0], q.sq[1], q.sq[2], others[0]].forEach(function (i) { tap(i); });
        };
    }

    var G = {
        id: ID,
        name: '找正方形',
        rule: '夜空裡撒著一堆星星，**剛好有四顆星能連成一個正方形**。把這四顆星點出來，點滿四顆就判定。正方形**大多是斜的**，旁邊還有**差一點點的菱形、長方形**（四邊一樣長但角不是直角，或角是直角但邊不一樣長）。點錯就結束，看你能過幾關。越後面，星星越多、假的越像、時間越短！',
        mount: mount,
        score: SCORE,
        test: {
            pointsFor: pointsFor, decoysFor: decoysFor, decoyMaxFor: decoyMaxFor, timeMs: timeMs, dist: dist, quadMetrics: quadMetrics, squareErr: squareErr, orderQuad: orderQuad, squaresIn: squaresIn, minEpsWith: minEpsWith,
            describeQuad: describeQuad, inField: inField, squareAt: squareAt, decoyAt: decoyAt, farEnough: farEnough, makeLevel: makeLevel, starPath: starPath, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, POINTS: POINTS, DECOYS: DECOYS, DECOY_MAX: DECOY_MAX, TIME_S: TIME_S, EPS_SQ: EPS_SQ, EPS_NONSQ: EPS_NONSQ, FIELD: FIELD, MARGIN: MARGIN, MIN_DIST: MIN_DIST, SIDE: SIDE, ROT: ROT, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
