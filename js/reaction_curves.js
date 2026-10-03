/* ═══════════════════════════════════════════════════════════════════
   reaction_curves.js — 秒反應・誰先到？
   黑色畫面，左右各一條從上彎彎曲曲到下的曲線，判斷哪一條比較短。按下按鈕後，兩顆球用
   一樣的速度沿著曲線滑下來，看誰先到。
   ───────────────────────────────────────────────────────────────────
   · 曲線：x(y) = 中心 + A·sin(2π·w·(y−y0)/H + φ)，w＝來回彎的次數，A＝振幅。左右兩條起點、終點的
     高度一樣，只靠「彎得多不多、彎得大不大」造成長度不同。長度＝沿著曲線取樣的折線長度（每 2px 一點）。
   · 長度差（長的比短的多幾 %）：第 1 關 30%，每關少 3%，最低 3%（lengthDiff）。
     做法：先隨機決定短的那條的振幅，再用二分搜尋調整長的那條的振幅，讓
     L_長 = L_短 × (1 + 差)——所以每一關的差距是精確的，不是大概。
   · 越後面彎曲越多：w 從 W_START(1.5) 線性增加到 W_END(5)。後面還會刻意讓「比較短的那條彎得比較多」
     （視覺陷阱，機率隨關卡線性上升）。
   · 第 DASH_FROM 關起畫成虛線：白色底線上疊紅色虛線，左右兩條的「紅段／白段」長度明顯不同，
     沒辦法靠數虛線段數來比長度。
   · 球的位置＝沿曲線走過的弧長（兩顆球速度相同 BALL_SPEED px/s），所以短的先到，不靠任何動畫技巧；
     判定在按按鈕的瞬間就決定了（比較兩條曲線的長度）。
   · 答錯就結束，成績＝過幾關。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'curves';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var DIFF_START = 30, DIFF_STEP = 3, DIFF_MIN = 3;     /* 長度差（%）：30、27、24 … 3，之後維持 3 */
    var W_START = 1.5, W_END = 5, W_RAMP = 12;            /* 來回彎的次數（整條曲線的正弦週期數） */
    var TRAP_END = 0.7;                                   /* 「短的那條彎得比較多」的機率（線性上升到這個） */
    var DASH_FROM = 4;                                    /* 第幾關起是虛線 */
    var BALL_SPEED = 230;                                 /* 球的速度（px/秒） */
    var A_MIN = 10, A_MAX = 92;                           /* 振幅範圍 */
    var VW = 468;                                         /* SVG 寬 */
    var PAD_TOP = 36, PAD_BOT = 36;

    function diffFor(level) { return Math.max(DIFF_MIN, DIFF_START - (level - 1) * DIFF_STEP); }
    function wavesFor(level) { return kit.ramp(level, W_START, W_END, W_RAMP); }
    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 關'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 取樣一條曲線：回傳 [{x,y,s}]（s＝累積弧長）。cx 中心 x，從 y0 到 y1，振幅 A，w 個週期，相位 phi */
    function sampleCurve(cx, y0, y1, A, w, phi) {
        var pts = [], n = Math.max(2, Math.ceil((y1 - y0) / 2)), s = 0, px = null, py = null;
        for (var i = 0; i <= n; i++) {
            var y = y0 + (y1 - y0) * i / n;
            /* 淡入淡出：起點終點的振幅漸漸收到 0，讓兩條曲線的頭尾都落在中心線 */
            var u = i / n, env = Math.min(1, u * 6, (1 - u) * 6);
            var x = cx + A * env * Math.sin(2 * Math.PI * w * u + phi);
            if (px != null) s += Math.sqrt((x - px) * (x - px) + (y - py) * (y - py));
            pts.push({ x: x, y: y, s: s });
            px = x; py = y;
        }
        return pts;
    }
    function curveLen(cx, y0, y1, A, w, phi) { var p = sampleCurve(cx, y0, y1, A, w, phi); return p[p.length - 1].s; }
    /* 二分搜尋：找出振幅 A，讓這條曲線的長度等於 target；找不到（超出範圍）回傳 null */
    function solveAmp(cx, y0, y1, w, phi, target) {
        var lo = A_MIN, hi = A_MAX;
        if (curveLen(cx, y0, y1, hi, w, phi) < target || curveLen(cx, y0, y1, lo, w, phi) > target) return null;
        for (var i = 0; i < 40; i++) {
            var mid = (lo + hi) / 2;
            if (curveLen(cx, y0, y1, mid, w, phi) < target) lo = mid; else hi = mid;
        }
        return (lo + hi) / 2;
    }
    /* 產生一關：回傳 { shortSide:'L'|'R', d(%), L:{A,w,phi,len}, R:{...}, ratio } ；H 是畫面高度 */
    function makeLevel(level, H, rand, W) {
        rand = rand || Math.random;
        var VWd = W || VW;                 /* 畫面實際寬度（兩條曲線的中心在 1/4、3/4 處） */
        var d = diffFor(level) / 100;
        var y0 = PAD_TOP, y1 = H - PAD_BOT;
        var wBase = wavesFor(level);
        var trap = kit.ramp(level, 0, TRAP_END, W_RAMP);
        var shortSide = rand() < 0.5 ? 'L' : 'R';
        for (var tries = 0; tries < 200; tries++) {
            var wS = wBase + (rand() < trap ? 0.5 + rand() * 0.8 : -0.4 + rand() * 0.8);       /* 短的那條彎的次數：陷阱時比較多 */
            var wL = wBase + (rand() < trap ? -0.8 + rand() * 0.4 : -0.3 + rand() * 0.8);
            wS = Math.max(1, wS); wL = Math.max(1, wL);
            var aS = kit.randFloat(22, 58, rand);
            var phiS = rand() * Math.PI * 2, phiL = rand() * Math.PI * 2;
            var cxS = shortSide === 'L' ? VWd * 0.25 : VWd * 0.75, cxL = shortSide === 'L' ? VWd * 0.75 : VWd * 0.25;
            var lenS = curveLen(cxS, y0, y1, aS, wS, phiS);
            var aL = solveAmp(cxL, y0, y1, wL, phiL, lenS * (1 + d));
            if (aL == null) continue;
            var lenL = curveLen(cxL, y0, y1, aL, wL, phiL);
            var S = { A: aS, w: wS, phi: phiS, len: lenS, cx: cxS }, Lg = { A: aL, w: wL, phi: phiL, len: lenL, cx: cxL };
            return { shortSide: shortSide, d: d, y0: y0, y1: y1, L: shortSide === 'L' ? S : Lg, R: shortSide === 'L' ? Lg : S, ratio: lenL / lenS };
        }
        /* 保底：用最簡單的組合（理論上不會發生） */
        var cxs = shortSide === 'L' ? VWd * 0.25 : VWd * 0.75, cxl = shortSide === 'L' ? VWd * 0.75 : VWd * 0.25;
        var s0 = { A: 30, w: wBase, phi: 0, cx: cxs }; s0.len = curveLen(cxs, y0, y1, 30, wBase, 0);
        var aa = solveAmp(cxl, y0, y1, wBase, 1, s0.len * (1 + d)) || A_MAX;
        var l0 = { A: aa, w: wBase, phi: 1, cx: cxl, len: curveLen(cxl, y0, y1, aa, wBase, 1) };
        return { shortSide: shortSide, d: d, y0: y0, y1: y1, L: shortSide === 'L' ? s0 : l0, R: shortSide === 'L' ? l0 : s0, ratio: l0.len / s0.len };
    }
    /* 虛線的紅段／白段長度：左右兩條差很多 */
    function dashFor(rand) {
        rand = rand || Math.random;
        var a = kit.pick([[6, 6], [8, 5], [10, 8]], rand), b = kit.pick([[34, 20], [38, 26], [30, 34]], rand);
        return rand() < 0.5 ? { L: a, R: b } : { L: b, R: a };
    }
    /* 弧長 s 對應的位置（二分搜尋） */
    function pointAt(pts, s) {
        if (s <= 0) return pts[0];
        var last = pts[pts.length - 1];
        if (s >= last.s) return last;
        var lo = 0, hi = pts.length - 1;
        while (hi - lo > 1) { var m = (lo + hi) >> 1; if (pts[m].s <= s) lo = m; else hi = m; }
        var a = pts[lo], b = pts[hi], t = (s - a.s) / Math.max(1e-9, b.s - a.s);
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, s: s };
    }

    function mount(root, ctx) {
        var Rd = null;

        function round() {
            if (Rd) Rd.dispose();
            Rd = kit.round();
            var my = Rd;
            root.innerHTML = '';
            root.classList.add('cv-bg');
            my.onDispose(function () { root.classList.remove('cv-bg'); });
            var level = 1, cleared = 0, newRec = false, state = 'idle';

            var head = h('div', { 'class': 'cv-head' });
            var field = h('div', { 'class': 'cv-field' });
            var banner = h('div', { 'class': 'cv-banner' });
            var btns = h('div', { 'class': 'cv-btns' });
            var bL = h('button', { 'class': 'cv-btn', text: '左邊比較短' });
            var bR = h('button', { 'class': 'cv-btn', text: '右邊比較短' });
            btns.appendChild(bL); btns.appendChild(bR);
            field.appendChild(banner);
            root.appendChild(head);
            root.appendChild(field);
            root.appendChild(btns);

            var Lv = null, svg = null, balls = null, ptsL = null, ptsR = null;

            function meta() { ctx.setMeta(kit.meta(['第 ' + level + ' 關', fmtBest(Reaction.getBest(ID))])); }

            function nextLevel() {
                if (my.dead) return;
                var H = field.clientHeight, W = field.clientWidth;
                Lv = makeLevel(level, H, null, W);
                state = 'pick';
                banner.textContent = ''; banner.className = 'cv-banner';
                head.textContent = '第 ' + level + ' 關　哪一條比較短？';
                meta();
                field.querySelectorAll('svg').forEach(function (s) { s.remove(); });
                svg = kit.svg('svg', { 'class': 'cv-svg', viewBox: '0 0 ' + W + ' ' + H }, field);
                ptsL = sampleCurve(Lv.L.cx, Lv.y0, Lv.y1, Lv.L.A, Lv.L.w, Lv.L.phi);
                ptsR = sampleCurve(Lv.R.cx, Lv.y0, Lv.y1, Lv.R.A, Lv.R.w, Lv.R.phi);
                var dash = level >= DASH_FROM ? dashFor() : null;
                [[ptsL, 'L'], [ptsR, 'R']].forEach(function (pr) {
                    var d = pr[0].map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
                    if (dash) {
                        kit.svg('path', { 'class': 'cv-line cv-line--white', d: d }, svg);
                        kit.svg('path', { 'class': 'cv-line cv-line--red', d: d, 'stroke-dasharray': dash[pr[1]][0] + ' ' + dash[pr[1]][1] }, svg);
                    } else {
                        kit.svg('path', { 'class': 'cv-line cv-line--solid', d: d }, svg);
                    }
                });
                [ptsL, ptsR].forEach(function (pts) {
                    kit.svg('circle', { 'class': 'cv-start', cx: pts[0].x, cy: pts[0].y, r: 7 }, svg);
                    kit.svg('circle', { 'class': 'cv-end', cx: pts[pts.length - 1].x, cy: pts[pts.length - 1].y, r: 7 }, svg);
                });
                balls = [kit.svg('circle', { 'class': 'cv-ball', r: 13, cx: ptsL[0].x, cy: ptsL[0].y }, svg), kit.svg('circle', { 'class': 'cv-ball', r: 13, cx: ptsR[0].x, cy: ptsR[0].y }, svg)];
                bL.disabled = bR.disabled = false;
                bL.className = bR.className = 'cv-btn';
                try {
                    console.info('[誰先到？] 第 ' + level + ' 關 長度差 ' + (Lv.d * 100).toFixed(0) + '%：左 ' + Lv.L.len.toFixed(1) + ' px（彎 ' + Lv.L.w.toFixed(2) + ' 次、振幅 ' + Lv.L.A.toFixed(1) + '）／右 ' + Lv.R.len.toFixed(1) + ' px（彎 ' + Lv.R.w.toFixed(2) + ' 次、振幅 ' + Lv.R.A.toFixed(1) + '）→ ' +
                        (Lv.shortSide === 'L' ? '左' : '右') + '邊比較短，長/短 = ' + Lv.ratio.toFixed(4) + (dash ? '；虛線 左 ' + dash.L.join('/') + '、右 ' + dash.R.join('/') : '；實線'));
                } catch (e) { }
            }

            function choose(side) {
                if (state !== 'pick') return;
                state = 'run';
                bL.disabled = bR.disabled = true;
                var ok = side === Lv.shortSide;
                (side === 'L' ? bL : bR).classList.add(ok ? 'cv-btn--ok' : 'cv-btn--bad');
                Sfx.play('whoosh');
                head.textContent = '兩顆球一樣的速度，看誰先到…';
                var t0 = performance.now(), done = { L: false, R: false }, first = null;
                var lenL = Lv.L.len, lenR = Lv.R.len;
                function place(now) {
                    var s = (now - t0) / 1000 * BALL_SPEED;
                    var pl = pointAt(ptsL, s), pr = pointAt(ptsR, s);
                    balls[0].setAttribute('cx', pl.x.toFixed(1)); balls[0].setAttribute('cy', pl.y.toFixed(1));
                    balls[1].setAttribute('cx', pr.x.toFixed(1)); balls[1].setAttribute('cy', pr.y.toFixed(1));
                    if (!done.L && s >= lenL) { done.L = true; if (!first) first = 'L'; arrive(); }
                    if (!done.R && s >= lenR) { done.R = true; if (!first) first = 'R'; arrive(); }
                }
                var arrived = false;
                function arrive() {
                    if (arrived) return;
                    arrived = true;     /* 第一顆球到的瞬間就公布結果；另一顆繼續滑到底 */
                    Sfx.play('tick');
                    verdict(ok, first);
                }
                var lp = my.loop(function (now) {
                    place(now);
                    if (done.L && done.R) return false;
                });
                /* 保底：rAF 被暫停時，時間到了直接定位到終點並公布 */
                var total = Math.max(lenL, lenR) / BALL_SPEED * 1000;
                my.after(Math.min(lenL, lenR) / BALL_SPEED * 1000 + 200, function () { if (!arrived) { place(t0 + Math.min(lenL, lenR) / BALL_SPEED * 1000 + 1); } });
                my.after(total + 400, function () { lp.stop(); place(t0 + total + 1); });
            }

            function verdict(ok, first) {
                var msg = '長度：左 ' + Lv.L.len.toFixed(0) + '、右 ' + Lv.R.len.toFixed(0) + '（差 ' + ((Lv.ratio - 1) * 100).toFixed(1) + '%）';
                if (ok) {
                    cleared = level;
                    if (Reaction.setBest(ID, cleared, function (v, b) { return v > b; })) newRec = true;
                    banner.textContent = (first === 'L' ? '左' : '右') + '邊先到！答對了';
                    banner.className = 'cv-banner cv-banner--ok';
                    head.textContent = msg;
                    meta();
                    Sfx.play('win');
                    level++;
                    my.after(1900, nextLevel);
                } else {
                    banner.textContent = (first === 'L' ? '左' : '右') + '邊先到…答錯了';
                    banner.className = 'cv-banner cv-banner--bad';
                    head.textContent = msg;
                    Sfx.play('bad');
                    state = 'over';
                    my.after(2300, function () {
                        kit.result(root, {
                            num: cleared + ' 關', label: '看走眼了',
                            lines: ['第 ' + level + ' 關長度差 ' + ((Lv.ratio - 1) * 100).toFixed(1) + '%', (Lv.shortSide === 'L' ? '左' : '右') + '邊才是比較短的'],
                            isNew: newRec, sfx: cleared >= 6 ? 'win' : 'fail', onAgain: round
                        });
                    });
                }
            }

            bL.addEventListener('pointerdown', function (e) { e.preventDefault(); choose('L'); });
            bR.addEventListener('pointerdown', function (e) { e.preventDefault(); choose('R'); });

            G.debug = {
                state: function () { return { level: level, state: state, cleared: cleared }; },
                level: function () { return Lv; },
                choose: choose,
                jump: function (n) { level = n; state = 'idle'; nextLevel(); },
                chooseRight: function () { choose(Lv.shortSide); },
                chooseWrong: function () { choose(Lv.shortSide === 'L' ? 'R' : 'L'); }
            };
            my.after(400, nextLevel);
        }

        round();
    }

    var G = {
        id: ID,
        name: '誰先到？',
        rule: '黑色畫面上有左右兩條彎彎曲曲的曲線，判斷哪一條比較短，按下方的按鈕。按下去之後，兩顆球會用一樣的速度沿著曲線滑下來，看看誰先到。第 1 關長度差 30%，每關縮小 3%，後面還會變成虛線，彎得越來越多！',
        mount: mount,
        test: { diffFor: diffFor, wavesFor: wavesFor, sampleCurve: sampleCurve, curveLen: curveLen, solveAmp: solveAmp, makeLevel: makeLevel, dashFor: dashFor, pointAt: pointAt, A_MIN: A_MIN, A_MAX: A_MAX }
    };
    Reaction.register(G);
})();
