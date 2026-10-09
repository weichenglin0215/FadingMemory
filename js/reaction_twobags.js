/* ═══════════════════════════════════════════════════════════════════
   reaction_twobags.js — 秒反應・兩袋一樣重
   上方有一排石頭（大小不同、密度相同），下方左右各有一個電子秤，最下方是「確認」鈕。
   把石頭拖到左邊或右邊的電子秤上（放上去之後還可以拖到另一邊、或拖回上方），全部放好後按「確認」，
   兩邊的重量差要在容許範圍內才過關。關卡制：第 1 關 3 顆石頭，每關多 1 顆（第 10 關 12 顆），不通過就結束。
   ───────────────────────────────────────────────────────────────────
   · 石頭是球體、密度相同：重量 ＝ WEIGHT_K × (直徑 ÷ 10)³ 公斤（直徑 D_MIN～D_MAX px，畫面看到的大小就是直徑）。
     直覺會用「面積」（直徑²）估重量，結果大石頭被低估——這是這款的陷阱。
   · 電子秤在「確認」之前顯示「--」，秤盤也不會下沉或傾斜（不洩漏重量），確認後才顯示重量（4 位小數）。
   · 通過條件：|左 − 右| ≤ 總重 × TOL，TOL 由 TOL[0]（8%）線性降到 TOL[1]（1%）（第 10 關起 1%）。
   · 出題（程式窮舉 2ⁿ 種分法驗證）：
       1. 保證至少一種分法在容許範圍內（構造時就讓其中一顆補上差額）；
       2. 第 3 關起（5 顆以上），「面積平分」的分法與「由大到小交錯放」的分法都不能通過（封住偷吃步）；
       3. 最大與最小的直徑比 ≥ RATIO_MIN；所有石頭放得進一個秤盤（Σ(d＋邊距)² ≤ FIT_AREA）。
   · 答錯時，石頭會自動移到一種可行的分法讓你看，並說明「重量跟直徑的三次方成正比」。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'twobags';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 20 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 10;                       /* 幾關之後難度到頂（也是最後一關） */
    var N0 = 3;                                 /* 第 1 關的石頭數（每關 +1） */
    var TOL = [0.08, 0.01];                     /* 容許誤差（占總重的比例）：第 1 關 → 到頂 */
    var D_MIN = 18, D_MAX = 66;                 /* 石頭直徑範圍（px） */
    var RATIO_MIN = 2.5;                        /* 最大／最小直徑至少幾倍 */
    var WEIGHT_K = 0.5;                         /* 重量係數：重量 ＝ K × (d÷10)³ 公斤 */
    var FIT_AREA = 40000;                       /* 所有石頭（含邊距）的面積和上限 */
    var PAD = 6, TRIES = 6000;
    var HEUR_FROM = 5;                          /* 石頭數達到這個值才檢查偷吃步 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function weightOf(d) { return WEIGHT_K * Math.pow(d / 10, 3); }
    function diameterOf(w) { return 10 * Math.cbrt(w / WEIGHT_K); }
    function tolAt(level) { return kit.ramp(level, TOL[0], TOL[1], RAMP_LEVELS); }
    function countAt(level) { return N0 + level - 1; }
    /* 分法：mask 的第 i 位是 1 ＝ 第 i 顆放左邊。回傳左右重量差的絕對值 */
    function diffOf(w, mask) {
        var l = 0, r = 0;
        for (var i = 0; i < w.length; i++) if (mask & (1 << i)) l += w[i]; else r += w[i];
        return Math.abs(l - r);
    }
    /* 最佳分法：差最小的 mask 與差 */
    function bestPartition(w) {
        var best = { mask: 0, diff: Infinity };
        for (var m = 0; m < (1 << w.length); m++) { var d = diffOf(w, m); if (d < best.diff) best = { mask: m, diff: d }; }
        return best;
    }
    /* 「面積平分」的分法：用 d² 當重量去找差最小的分法（人眼用面積估重量） */
    function areaPartition(d) { return bestPartition(d.map(function (x) { return x * x; })).mask; }
    /* 「由大到小交錯放」的分法 */
    function altPartition(d) {
        var idx = d.map(function (x, i) { return i; }).sort(function (a, b) { return d[b] - d[a]; }), m = 0;
        idx.forEach(function (i, k) { if (k % 2 === 0) m |= 1 << i; });
        return m;
    }
    function fitArea(d) { return d.reduce(function (s, x) { return s + (x + PAD) * (x + PAD); }, 0); }
    /* 出題：回傳 { d, w, total, tol, best: {mask, diff}, n }；level 決定石頭數與容許誤差 */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var n = countAt(level), tol = tolAt(level), wMin = weightOf(D_MIN), wMax = weightOf(D_MAX), last = null;
        for (var t = 0; t < TRIES; t++) {
            /* 構造：先隨機 n−1 顆（對數均勻），隨機分左右，最後一顆補上差額（再加一點雜訊，讓答案有一個小範圍） */
            var w = [], i;
            for (i = 0; i < n - 1; i++) w.push(Math.exp(kit.randFloat(Math.log(wMin), Math.log(wMax), rand)));
            var maskL = 0, sl = 0, sr = 0;
            for (i = 0; i < n - 1; i++) { if (rand() < 0.5) { maskL |= 1 << i; sl += w[i]; } else sr += w[i]; }
            var gap = Math.abs(sl - sr), tot0 = sl + sr + gap;
            var noise = (rand() - 0.5) * tol * tot0 * 0.6, wl = gap + noise;
            if (wl < wMin || wl > wMax) continue;
            w.push(wl);
            var d = w.map(diameterOf);
            if (Math.max.apply(null, d) / Math.min.apply(null, d) < RATIO_MIN) continue;
            if (fitArea(d) > FIT_AREA) continue;
            var total = w.reduce(function (a, b) { return a + b; }, 0), best = bestPartition(w);
            last = { d: d, w: w, total: total, tol: tol, best: best, n: n };
            if (best.diff > tol * total) continue;                                  /* 1. 一定要有解 */
            if (n >= HEUR_FROM) {
                if (diffOf(w, areaPartition(d)) <= tol * total) continue;           /* 2. 面積平分不能過 */
                if (diffOf(w, altPartition(d)) <= tol * total) continue;            /*    交錯放也不能過 */
            }
            return last;
        }
        return last;
    }
    function rating(n) {
        if (n >= 10) return '分石頭大師！全部通關！';
        if (n >= 7) return '高手！';
        if (n >= 4) return '不錯喔！';
        if (n >= 2) return '再接再厲！';
        return '體積是直徑的三次方，再試一次！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: RAMP_LEVELS, goodAt: 4,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level, W = stage.clientWidth || 472;
        var q = makeLevel(level, api.rand), n = q.n, side = [], els = [], drag = null, hint = null;
        api.info = q;
        console.log('[兩袋一樣重] 第 ' + level + ' 關：' + n + ' 顆；直徑 ' + q.d.map(function (x) { return x.toFixed(1); }).join(',') + '；重量 ' + q.w.map(function (x) { return x.toFixed(2); }).join(',') + '；總重 ' + q.total.toFixed(2) + '；容許 ' + (q.tol * 100).toFixed(2) + '%（' + (q.tol * q.total).toFixed(3) + ' 公斤）；最佳差 ' + q.best.diff.toFixed(3) + '；面積分法差 ' + diffOf(q.w, areaPartition(q.d)).toFixed(3) + '，交錯分法差 ' + diffOf(q.w, altPartition(q.d)).toFixed(3));

        var tip = h('div', { 'class': 'tb-tip', text: '把石頭拖到左右電子秤，讓兩邊一樣重' });
        var tray = h('div', { 'class': 'tb-zone tb-tray' });
        var zl = h('div', { 'class': 'tb-zone tb-scale' }, [h('div', { 'class': 'tb-disp', text: '--' }), h('div', { 'class': 'tb-pan' })]);
        var zr = h('div', { 'class': 'tb-zone tb-scale' }, [h('div', { 'class': 'tb-disp', text: '--' }), h('div', { 'class': 'tb-pan' })]);
        var cap = h('div', { 'class': 'tb-cap', text: '左　　　　　　　　　　右' });
        var info = h('div', { 'class': 'tb-info' });
        var okBtn = h('button', { 'class': 'btn btn--go tb-ok', text: '確認' });
        okBtn.disabled = true;
        [tip, tray, zl, zr, info, okBtn].forEach(function (e) { stage.appendChild(e); });
        var gap = 10, zw = Math.floor((W - 12 - gap) / 2);
        tray.style.left = '6px'; tray.style.top = '64px'; tray.style.width = (W - 12) + 'px'; tray.style.height = '150px';
        zl.style.left = '6px'; zr.style.left = (6 + zw + gap) + 'px';
        [zl, zr].forEach(function (z) { z.style.top = '232px'; z.style.width = zw + 'px'; z.style.height = '270px'; });
        var pans = { L: zl.querySelector('.tb-pan'), R: zr.querySelector('.tb-pan'), T: tray };
        var disps = { L: zl.querySelector('.tb-disp'), R: zr.querySelector('.tb-disp') };
        for (var i = 0; i < n; i++) (function (i) {
            side.push('T');
            var el = h('div', { 'class': 'tb-stone' });
            el.style.width = q.d[i].toFixed(1) + 'px'; el.style.height = q.d[i].toFixed(1) + 'px';
            el.setAttribute('data-i', i);
            tray.appendChild(el); els.push(el);
        })(i);
        function place(i, where) {
            side[i] = where; pans[where].appendChild(els[i]);
            okBtn.disabled = side.some(function (s) { return s === 'T'; });
        }
        if (level === 1) hint = kit.fingerHint(stage, { mode: 'drag', x: 6 + 14 + q.d[0] / 2, y: 64 + 10 + q.d[0] / 2, dx: 90, dy: 190, delay: 400 });
        function hideHint() { if (hint) { hint.remove(); hint = null; } }

        /* 拖曳：按到石頭 → 做一顆跟著手指的「分身」，原本那顆先變透明；放開時看手指在哪個區域 */
        function zoneAt(p) {
            var list = [['L', zl], ['R', zr], ['T', tray]];
            for (var k = 0; k < list.length; k++) { var z = list[k][1]; if (p.x >= z.offsetLeft && p.x <= z.offsetLeft + z.offsetWidth && p.y >= z.offsetTop && p.y <= z.offsetTop + z.offsetHeight) return list[k][0]; }
            return null;
        }
        var locked = false;
        stage.addEventListener('pointerdown', function (e) {
            if (locked || api.over || drag) return;
            var t = e.target.closest ? e.target.closest('.tb-stone') : null;
            if (!t) return;
            e.preventDefault();
            try { stage.setPointerCapture(e.pointerId); } catch (err) { }
            var i = Number(t.getAttribute('data-i')), p = kit.localPt(e, stage);
            var ghost = h('div', { 'class': 'tb-stone tb-ghost' });
            ghost.style.width = q.d[i].toFixed(1) + 'px'; ghost.style.height = q.d[i].toFixed(1) + 'px';
            stage.appendChild(ghost);
            els[i].classList.add('tb-stone--lift');
            drag = { id: e.pointerId, i: i, ghost: ghost };
            move(p); hideHint(); Sfx.play('click');
        });
        function move(p) { drag.ghost.style.left = (p.x - q.d[drag.i] / 2) + 'px'; drag.ghost.style.top = (p.y - q.d[drag.i] / 2) + 'px'; }
        stage.addEventListener('pointermove', function (e) { if (drag && e.pointerId === drag.id) move(kit.localPt(e, stage)); });
        function drop(e) {
            if (!drag || e.pointerId !== drag.id) return;
            var p = kit.localPt(e, stage), z = zoneAt(p), i = drag.i;
            stage.removeChild(drag.ghost); els[i].classList.remove('tb-stone--lift');
            if (z) place(i, z);
            drag = null;
        }
        stage.addEventListener('pointerup', drop);
        stage.addEventListener('pointercancel', drop);

        function sums(sd) {
            var l = 0, r = 0; sd.forEach(function (s, i) { if (s === 'L') l += q.w[i]; else if (s === 'R') r += q.w[i]; });
            return { l: l, r: r };
        }
        function confirm() {
            if (api.over || locked || side.some(function (s) { return s === 'T'; })) return;
            locked = true; hideHint(); okBtn.style.display = 'none';
            Sfx.play('click');
            var s = sums(side), diff = Math.abs(s.l - s.r), lim = q.tol * q.total;
            disps.L.textContent = s.l.toFixed(4) + ' 公斤'; disps.R.textContent = s.r.toFixed(4) + ' 公斤';
            info.textContent = '差 ' + diff.toFixed(4) + ' 公斤（容許 ' + lim.toFixed(4) + ' 公斤，總重的 ' + (q.tol * 100).toFixed(4) + '%）';
            if (diff <= lim) { info.classList.add('tb-info--ok'); api.pass({ delay: 2000 }); return; }
            info.classList.add('tb-info--bad');
            /* 答錯：石頭自動移到一種可行的分法 */
            api.after(1400, function () {
                for (var i = 0; i < n; i++) place(i, q.best.mask & (1 << i) ? 'L' : 'R');
                var b = sums(side);
                disps.L.textContent = b.l.toFixed(4) + ' 公斤'; disps.R.textContent = b.r.toFixed(4) + ' 公斤';
                info.textContent = '可行的分法：差只有 ' + q.best.diff.toFixed(4) + ' 公斤';
            });
            api.fail({ delay: 3800, lines: [
                '兩邊差了 ' + diff.toFixed(4) + ' 公斤，超過容許的 ' + lim.toFixed(4) + ' 公斤',
                '左 ' + s.l.toFixed(4) + ' 公斤　右 ' + s.r.toFixed(4) + ' 公斤',
                '重量跟直徑的「三次方」成正比：直徑大 1.26 倍，重量就多一倍'
            ] });
        }
        kit.onTap(okBtn, confirm);
        api.solve = function () { for (var i = 0; i < n; i++) place(i, q.best.mask & (1 << i) ? 'L' : 'R'); confirm(); };
        api.wrong = function () { for (var i = 0; i < n; i++) place(i, 'L'); confirm(); };
        api.place = place;
    }

    var G = {
        id: ID,
        name: '兩袋一樣重',
        rule: '上方有幾顆石頭，大小不同、但密度相同。把石頭拖到下方左右兩個電子秤上，也可以在兩個秤之間搬來搬去。全部放好後按「確認」，兩邊重量差要在容許範圍內才過關。按確認之前秤不會顯示重量，要靠眼睛估。注意：重量和直徑的三次方成正比！',
        mount: mount,
        score: SCORE,
        test: { weightOf: weightOf, diameterOf: diameterOf, tolAt: tolAt, countAt: countAt, diffOf: diffOf, bestPartition: bestPartition, areaPartition: areaPartition, altPartition: altPartition, fitArea: fitArea, makeLevel: makeLevel, rating: rating, RAMP_LEVELS: RAMP_LEVELS, N0: N0, TOL: TOL, D_MIN: D_MIN, D_MAX: D_MAX, RATIO_MIN: RATIO_MIN, FIT_AREA: FIT_AREA, HEUR_FROM: HEUR_FROM }
    };
    Reaction.register(G);
})();
