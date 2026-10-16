/* ═══════════════════════════════════════════════════════════════════
   reaction_twobags.js — 秒反應・兩袋一樣重
   上方有一排鑽石（大小不同、材質相同），下方是一座傳統的水平天秤（左右兩個秤盤），最下方是「確認」鈕。
   把鑽石拖到左邊或右邊的秤盤上（放上去之後還可以拖到另一邊、或拖回上方），全部放好後按「確認」，
   兩邊的重量差要在容許範圍內才過關。關卡制：第 1 關 N0[0] 顆鑽石，到極限關卡（RAMP_LEVELS）是 N0[1] 顆（線性增加），不通過就結束。
   ───────────────────────────────────────────────────────────────────
   · V1.32（玩家意見：立體容量，人類很難判斷）：重量改成跟「面積」成正比——重量 ＝ WEIGHT_K × (直徑 ÷ 10)² 克拉
     （畫面看到的大小就是直徑）。以前是直徑的三次方，直覺用面積估重量反而會被陷阱騙；現在直覺是對的，
     難度來自「用眼睛比較面積」，不是數鑽石的數量，所以鑽石數 N0 改成兩個參數 [第 1 關, 極限關卡]＝[3, 7]。
   · V1.32：電子秤改成傳統的水平天秤，重量數字寫在秤盤下方。按「確認」之前天秤是水平的、數字是「--」（不洩漏重量）；
     按下確認後天秤依兩邊的重量傾斜（輕的一邊翹起來）：在容許範圍內只微微傾斜（最多 TILT_PASS 度），
     超出範圍明顯傾斜（TILT_FAIL[0]～TILT_FAIL[1] 度，超出越多越斜），而且天秤與數字變成紅色。
   · 通過條件：|左 − 右| ≤ 總重 × TOL，TOL 由 TOL[0] 線性降到 TOL[1]（到頂關卡之後維持）。
   · 出題（程式窮舉 2ⁿ 種分法驗證）：
       1. 保證至少一種分法在容許範圍內（構造時就讓其中一顆補上差額）；
       2. 鑽石數達到 HEUR_FROM 顆起，「由大到小交錯放」與「由大到小、每顆放進較輕的那一邊（貪婪法）」都不能通過（封住偷吃步）；
       3. 最大與最小的直徑比 ≥ RATIO_MIN；所有鑽石放得進一個秤盤（Σ(d＋邊距)² ≤ FIT_AREA）。
   · 答錯時，鑽石會自動移到一種可行的分法讓你看（天秤也跟著回到接近水平），並說明「重量跟面積成正比」。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'twobags';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 30 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂（也是最後一關） */
    var GEM = '💎';                   /* 💎（V1.28 玩家意見：「石頭」改成「鑽石」，圖案改成 💎） */
    var GEM_K = 0.82;                           /* 💎 的字級 ＝ 直徑 × GEM_K（emoji 的圖案比字級略寬，這樣畫面看到的大小約等於直徑） */
    function gemPx(d) { return Math.round(d * GEM_K * 10) / 10; }
    var N0 = [4, 9];                            /* 鑽石數：第 1 關 → 極限關卡（RAMP_LEVELS），中間線性增加。重點是用眼睛比面積，不是數數量，所以不用太多顆 */
    var TOL = [0.1, 0.01];                     /* 容許誤差（占總重的比例）：第 1 關 → 到頂 */
    var D_MIN = 40, D_MAX = 100;                 /* 鑽石直徑範圍（px） */
    var RATIO_MIN = 4.0;                        /* 最大／最小直徑至少幾倍 */
    var WEIGHT_K = 0.1;                         /* 重量係數：重量 ＝ K × (d÷10)² 克拉（跟面積成正比） */
    var TILT_PASS = 3;                          /* 按「確認」後，在容許範圍內：天秤最多傾斜幾度（剛好平衡 ＝ 0 度，差到容許邊緣 ＝ 這個值） */
    var TILT_FAIL = [7, 16];                    /* 超出容許範圍：傾斜幾度（剛超出 ＝ 前者，超出越多越斜，最多後者） */
    var TILT_FAIL_SPAN = 3;                     /* 差距超過容許的幾倍時，傾斜達到 TILT_FAIL[1] */
    var TILT_MS = 1100;                         /* 傾斜動畫的時間（毫秒） */
    var FIT_AREA = 40000;                       /* 所有鑽石（含邊距）的面積和上限 */
    var PAD = 6, TRIES = 6000;
    var RELAX = [[1, 1], [0.8, 1.2], [0.6, 1.5], [0, 3]];   /* 逐階段放寬：[直徑比要求 ×, 面積上限 ×] */
    var HEUR_FROM = 5;                          /* 鑽石數達到這個值才檢查偷吃步 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function weightOf(d) { return WEIGHT_K * Math.pow(d / 10, 2); }
    function diameterOf(w) { return 10 * Math.sqrt(w / WEIGHT_K); }
    function tolAt(level) { return kit.ramp(level, TOL[0], TOL[1], RAMP_LEVELS); }
    function countAt(level) { return Math.round(kit.ramp(level, N0[0], N0[1], RAMP_LEVELS)); }
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
    /* 「貪婪法」的分法：由大到小，每一顆都放進目前較輕的那一邊（人腦最自然的做法） */
    function greedyPartition(w) {
        var idx = w.map(function (x, i) { return i; }).sort(function (a, b) { return w[b] - w[a]; }), l = 0, r = 0, m = 0;
        idx.forEach(function (i) { if (l <= r) { l += w[i]; m |= 1 << i; } else r += w[i]; });
        return m;
    }
    /* 「由大到小交錯放」的分法 */
    function altPartition(d) {
        var idx = d.map(function (x, i) { return i; }).sort(function (a, b) { return d[b] - d[a]; }), m = 0;
        idx.forEach(function (i, k) { if (k % 2 === 0) m |= 1 << i; });
        return m;
    }
    function fitArea(d) { return d.reduce(function (s, x) { return s + (x + PAD) * (x + PAD); }, 0); }
    /* 出題：回傳 { d, w, total, tol, best: {mask, diff}, n }；level 決定鑽石數與容許誤差 */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var n = countAt(level), tol = tolAt(level), wMin = weightOf(D_MIN), wMax = weightOf(D_MAX), last = null;
        /* 最大／最小直徑比：RATIO_MIN 不能設成等於（或超過）D_MAX／D_MIN——那樣只有「剛好一顆最大、一顆最小」才合格，幾乎永遠出不了題（V1.28 修正：最多要求到 90%） */
        var ratioMax = Math.min(RATIO_MIN, D_MAX / D_MIN * 0.9);
        /* 條件太嚴、出不了題時（直徑範圍小、鑽石多、面積上限緊），分幾個階段逐步放寬「直徑比」與「面積上限」，最後一階段兩個都不要求，保證一定出得了題 */
        for (var t = 0; t < TRIES * RELAX.length; t++) {
            var stage = Math.floor(t / TRIES), ratioReq = ratioMax * RELAX[stage][0], fitMax = FIT_AREA * RELAX[stage][1];
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
            if (Math.max.apply(null, d) / Math.min.apply(null, d) < ratioReq) continue;
            if (fitArea(d) > fitMax) continue;
            var total = w.reduce(function (a, b) { return a + b; }, 0), best = bestPartition(w);
            last = { d: d, w: w, total: total, tol: tol, best: best, n: n };
            if (best.diff > tol * total) continue;                                  /* 1. 一定要有解 */
            if (n >= HEUR_FROM) {
                if (diffOf(w, greedyPartition(w)) <= tol * total) continue;         /* 2. 貪婪法（由大到小放進較輕的一邊）不能過 */
                if (diffOf(w, altPartition(d)) <= tol * total) continue;            /*    由大到小交錯放也不能過 */
            }
            return last;
        }
        return last;
    }
    /* 按「確認」後天秤傾斜的角度（度；正＝右邊重、順時針轉，負＝左邊重）：
       在容許範圍內只微微傾斜（0～TILT_PASS 度，差越多越斜）；超出範圍明顯傾斜（TILT_FAIL[0]～[1] 度，超出越多越斜） */
    function tiltOf(l, r, tol) {
        var total = l + r, diff = Math.abs(l - r), lim = tol * total, sign = r > l ? 1 : (r < l ? -1 : 0);
        if (diff <= lim) return sign * TILT_PASS * (lim > 0 ? diff / lim : 0);
        var over = lim > 0 ? (diff / lim - 1) / TILT_FAIL_SPAN : 1;
        return sign * (TILT_FAIL[0] + (TILT_FAIL[1] - TILT_FAIL[0]) * Math.min(1, over));
    }
    /* 傾斜動畫的緩動：p 從 0 到 1，天秤擺過頭一點再回來停好（約 13% 的過衝），是時間的純函式（規範 T3） */
    function settle(p) { return p <= 0 ? 0 : p >= 1 ? 1 : 1 - Math.exp(-6 * p) * Math.cos(3 * Math.PI * p); }
    /* 橫樑順時針轉 deg 度時，左右兩個吊點相對於水平時的位移（HL ＝ 吊點離支點的水平距離）；左邊翹起來（y 變小）、兩邊都稍微往中間靠 */
    function hangShift(deg, HL) {
        var a = deg * Math.PI / 180, dx = HL * (1 - Math.cos(a)), dy = HL * Math.sin(a);
        return { l: { dx: dx, dy: -dy }, r: { dx: -dx, dy: dy } };
    }
    function rating(n) {
        if (n >= 10) return '分鑽石大師！全部通關！';
        if (n >= 7) return '高手！';
        if (n >= 4) return '不錯喔！';
        if (n >= 2) return '再接再厲！';
        return '重量跟面積成正比，再試一次！';
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

    /* 版面（邏輯 px）：遊戲區寬約 472、高約 666 */
    var TRAY_TOP = 30, TRAY_H = 170;            /* 上方的鑽石托盤 */
    var BEAM_Y = 250;                           /* 橫樑（支點）的高度 */
    var STRING_H = 36, PAN_H = 190, NUM_H = 38; /* 吊繩、秤盤、重量數字的高度（由上往下接在橫樑的兩端） */
    var BASE_Y = 548;                           /* 底座的高度 */
    var BAL_GAP = 14;                           /* 兩個秤盤之間的空隙（中間立一根柱子） */

    function setup(api) {
        var stage = api.stage, level = api.level, W = stage.clientWidth || 472;
        var q = makeLevel(level, api.rand), n = q.n, side = [], els = [], drag = null, hint = null, curTilt = 0;
        api.info = q;
        console.log('[兩袋一樣重] 第 ' + level + ' 關：' + n + ' 顆；直徑 ' + q.d.map(function (x) { return x.toFixed(1); }).join(',') + '；重量 ' + q.w.map(function (x) { return x.toFixed(2); }).join(',') + '；總重 ' + q.total.toFixed(2) + '；容許 ' + (q.tol * 100).toFixed(2) + '%（' + (q.tol * q.total).toFixed(3) + ' 克拉）；最佳差 ' + q.best.diff.toFixed(3) + '；貪婪法差 ' + diffOf(q.w, greedyPartition(q.w)).toFixed(3) + '，交錯分法差 ' + diffOf(q.w, altPartition(q.d)).toFixed(3));

        var tip = h('div', { 'class': 'tb-tip', text: '把鑽石拖到左右秤盤，讓兩邊一樣重' });
        var tray = h('div', { 'class': 'tb-zone tb-tray' });
        var info = h('div', { 'class': 'tb-info' });
        var okBtn = h('button', { 'class': 'btn btn--go tb-ok', text: '確認' });
        okBtn.disabled = true;
        var zw = Math.floor((W - 12 - BAL_GAP) / 2), cx = 6 + zw + BAL_GAP / 2, HL = zw / 2 + BAL_GAP / 2, panTop = BEAM_Y + STRING_H;
        tray.style.left = '6px'; tray.style.top = TRAY_TOP + 'px'; tray.style.width = (W - 12) + 'px'; tray.style.height = TRAY_H + 'px';
        info.style.top = (BASE_Y + 26) + 'px';

        /* 天秤：柱子、底座、橫樑（繞支點轉）、左右各一組「吊繩＋秤盤＋重量數字」（跟著橫樑兩端上下移動） */
        var bal = h('div', { 'class': 'tb-bal' });
        var post = h('div', { 'class': 'tb-post' }), base = h('div', { 'class': 'tb-base' }), beam = h('div', { 'class': 'tb-beam' }), pivot = h('div', { 'class': 'tb-pivot' });
        post.style.left = (cx - 4) + 'px'; post.style.top = BEAM_Y + 'px'; post.style.height = (BASE_Y - BEAM_Y) + 'px';
        base.style.left = (cx - 62) + 'px'; base.style.top = BASE_Y + 'px';
        beam.style.left = (cx - HL - 20) + 'px'; beam.style.width = (2 * HL + 40) + 'px'; beam.style.top = (BEAM_Y - 5) + 'px';
        pivot.style.left = (cx - 9) + 'px'; pivot.style.top = (BEAM_Y - 9) + 'px';
        [post, base, beam, pivot].forEach(function (e) { bal.appendChild(e); });
        function hanger(centerX) {
            var el = h('div', { 'class': 'tb-hang' });
            el.style.left = (centerX - zw / 2) + 'px'; el.style.top = BEAM_Y + 'px'; el.style.width = zw + 'px';
            var svg = kit.svg('svg', { 'class': 'tb-str', width: zw, height: STRING_H, viewBox: '0 0 ' + zw + ' ' + STRING_H }, el);
            kit.svg('line', { x1: zw / 2, y1: 0, x2: 5, y2: STRING_H }, svg);
            kit.svg('line', { x1: zw / 2, y1: 0, x2: zw - 5, y2: STRING_H }, svg);
            var pan = h('div', { 'class': 'tb-pan' }), num = h('div', { 'class': 'tb-num', text: '--' });
            pan.style.height = PAN_H + 'px'; num.style.height = NUM_H + 'px'; num.style.lineHeight = NUM_H + 'px';
            el.appendChild(pan); el.appendChild(num); bal.appendChild(el);
            return { el: el, pan: pan, num: num };
        }
        var hl = hanger(cx - HL), hr = hanger(cx + HL);
        [tip, tray, bal, info, okBtn].forEach(function (e) { stage.appendChild(e); });
        var pans = { L: hl.pan, R: hr.pan, T: tray }, nums = { L: hl.num, R: hr.num };
        var rects = {                                                      /* 放開手指時，用這些範圍判斷放進哪一邊（天秤確認前是水平的；吊繩和重量數字也算秤盤的範圍） */
            L: { x: cx - HL - zw / 2, y: BEAM_Y, w: zw, h: STRING_H + PAN_H + NUM_H },
            R: { x: cx + HL - zw / 2, y: BEAM_Y, w: zw, h: STRING_H + PAN_H + NUM_H },
            T: { x: 6, y: TRAY_TOP, w: W - 12, h: TRAY_H }
        };
        function setTilt(deg) {
            curTilt = deg;
            beam.style.transform = 'rotate(' + deg.toFixed(3) + 'deg)';
            var sh = hangShift(deg, HL);
            hl.el.style.transform = 'translate(' + sh.l.dx.toFixed(2) + 'px,' + sh.l.dy.toFixed(2) + 'px)';
            hr.el.style.transform = 'translate(' + sh.r.dx.toFixed(2) + 'px,' + sh.r.dy.toFixed(2) + 'px)';
        }
        function tiltTo(deg) { var from = curTilt; return api.my.tween(TILT_MS, function (e) { setTilt(from + (deg - from) * e); }, settle); }
        setTilt(0);

        for (var i = 0; i < n; i++) (function (i) {
            side.push('T');
            var el = h('div', { 'class': 'tb-stone', text: GEM });
            el.style.width = q.d[i].toFixed(1) + 'px'; el.style.height = q.d[i].toFixed(1) + 'px'; el.style.fontSize = gemPx(q.d[i]) + 'px';
            el.setAttribute('data-i', i);
            tray.appendChild(el); els.push(el);
        })(i);
        function place(i, where) {
            side[i] = where;
            ['T', 'L', 'R'].forEach(function (k) { els.forEach(function (el, j) { if (side[j] === k) pans[k].appendChild(el); }); });   /* 每個容器裡永遠照編號排，位置穩定 */
            okBtn.disabled = side.some(function (s) { return s === 'T'; });
        }
        /* 操作提示（只在第一次進遊戲時）：手指＋箭頭，從第一顆鑽石往「它在最佳分法裡的那一邊秤盤」重複移動（第一關的正確答案） */
        if (level === 1 && kit.once('twobags.hint')) {
            var hz = (q.best.mask & 1) ? rects.L : rects.R, hx = 6 + 14 + q.d[0] / 2, hy = TRAY_TOP + 10 + q.d[0] / 2;
            hint = kit.fingerHint(stage, { mode: 'drag', x: hx, y: hy, dx: hz.x + hz.w / 2 - hx, dy: panTop + PAN_H / 2 - hy, delay: 400, text: '請把鑽石拖進' + ((q.best.mask & 1) ? '左' : '右') + '邊的秤盤' });
        }
        function hideHint() { if (hint) { hint.remove(); hint = null; } }

        /* 拖曳：按到鑽石 → 做一顆跟著手指的「分身」，原本那顆先變透明；放開時看手指在哪個區域 */
        function zoneAt(p) {
            var list = ['L', 'R', 'T'];
            for (var k = 0; k < list.length; k++) { var z = rects[list[k]]; if (p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h) return list[k]; }
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
            var ghost = h('div', { 'class': 'tb-stone tb-ghost', text: GEM });
            ghost.style.width = q.d[i].toFixed(1) + 'px'; ghost.style.height = q.d[i].toFixed(1) + 'px'; ghost.style.fontSize = gemPx(q.d[i]) + 'px';
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
            var s = sums(side), diff = Math.abs(s.l - s.r), lim = q.tol * q.total, good = diff <= lim;
            //我手動刪除了"克拉"字樣，避免介面超過寬度
            nums.L.textContent = s.l.toFixed(4); nums.R.textContent = s.r.toFixed(4);
            info.textContent = '差 ' + diff.toFixed(4) + ' 克拉（容許 ' + lim.toFixed(4) + ' 克拉，總重的 ' + (q.tol * 100).toFixed(4) + '%）';
            bal.classList.add(good ? 'tb-bal--ok' : 'tb-bal--bad');          /* 超出範圍：天秤與數字變紅色 */
            info.classList.add(good ? 'tb-info--ok' : 'tb-info--bad');
            tiltTo(tiltOf(s.l, s.r, q.tol));                                   /* 天秤依兩邊的重量傾斜：範圍內微傾、範圍外明顯傾斜 */
            if (good) { api.pass({ delay: 2000 }); return; }
            /* 答錯：鑽石自動移到一種可行的分法，天秤也跟著回到接近水平 */
            api.after(TILT_MS + 600, function () {
                for (var i = 0; i < n; i++) place(i, q.best.mask & (1 << i) ? 'L' : 'R');
                var b = sums(side);
                //我手動刪除了"克拉"字樣，避免介面超過寬度
                nums.L.textContent = b.l.toFixed(4); nums.R.textContent = b.r.toFixed(4);
                info.textContent = '可行的分法：差只有 ' + q.best.diff.toFixed(4) + ' 克拉';
                bal.classList.remove('tb-bal--bad'); bal.classList.add('tb-bal--ok');
                tiltTo(tiltOf(b.l, b.r, q.tol));
            });
            api.fail({
                delay: 3800, lines: [
                    '兩邊差了 ' + diff.toFixed(4) + ' 克拉，超過容許的 ' + lim.toFixed(4) + ' 克拉',
                    '左 ' + s.l.toFixed(4) + ' 克拉　右 ' + s.r.toFixed(4) + ' 克拉',
                    '重量跟「面積」成正比：直徑大 1.41 倍，重量就多一倍'
                ]
            });
        }
        kit.onTap(okBtn, confirm);
        api.solve = function () { for (var i = 0; i < n; i++) place(i, q.best.mask & (1 << i) ? 'L' : 'R'); confirm(); };
        api.wrong = function () { for (var i = 0; i < n; i++) place(i, 'L'); confirm(); };
        api.place = place;
        api.tilt = function () { return curTilt; };
    }

    var G = {
        id: ID,
        name: '兩袋一樣重',
        rule: '上方有幾顆鑽石，大小不同、但材質相同，**重量和面積成正比**。把鑽石拖到下方天秤的左右兩個秤盤上，也可以在兩個秤盤之間搬來搬去。全部放好後按「確認」，**兩邊重量差要在容許範圍內才過關**。按確認之前天秤不會傾斜、也不顯示重量，要靠眼睛比較面積。',
        mount: mount,
        score: SCORE,
        test: { WEIGHT_K: WEIGHT_K, RELAX: RELAX, GEM: GEM, gemPx: gemPx, weightOf: weightOf, diameterOf: diameterOf, tolAt: tolAt, countAt: countAt, diffOf: diffOf, bestPartition: bestPartition, greedyPartition: greedyPartition, altPartition: altPartition, tiltOf: tiltOf, settle: settle, hangShift: hangShift, TILT_PASS: TILT_PASS, TILT_FAIL: TILT_FAIL, TILT_FAIL_SPAN: TILT_FAIL_SPAN, TILT_MS: TILT_MS, fitArea: fitArea, makeLevel: makeLevel, rating: rating, RAMP_LEVELS: RAMP_LEVELS, N0: N0, TOL: TOL, D_MIN: D_MIN, D_MAX: D_MAX, RATIO_MIN: RATIO_MIN, FIT_AREA: FIT_AREA, HEUR_FROM: HEUR_FROM }
    };
    Reaction.register(G);
})();
