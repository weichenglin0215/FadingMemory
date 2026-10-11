/* ═══════════════════════════════════════════════════════════════════
   reaction_halfcrowd.js — 秒反應・一半的人（原企劃「009 一半的人」的復活版）
   畫面上有 80～120 個白色圓形（每個圓中間有一個黑色圓點＝中心點），圓形之間最多只能重疊 60%。
   一條豎線一開始在畫面中央，拖曳下方的橫桿把它移到「左右兩邊圓形數量一樣多」的位置，
   按「計算數量」：豎線左邊的圓形會一個一個變成綠色、右邊的一個一個變成紅色，上方同步顯示綠色與紅色的數量；
   兩邊一樣多就過關，不一樣就失敗。是否在線的左右，以「圓心」為準。
   關卡制：成績＝過了幾關。越後面圓形的分布越不平均（越擠在某一側），豎線要移得越遠、容許的位置也越窄。
   ───────────────────────────────────────────────────────────────────
   · 圓形個數 N 一定是偶數（80、82…120），所以一定有一個「剛好一半」的位置：
     把所有圓心的 x 由小到大排好，第 N／2 個與第 N／2＋1 個之間（lo～hi）的任何位置都對。
   · 「重疊最多 60%」：兩個圓心距離 d 要 ≥ 0.4 ×（r1＋r2）（兩個一樣大的圓，d ≥ 0.8r＝重疊 60%）。
   · 不平均程度 skew：從 0（平均分布）線性升到 SKEW_MAX；圓心 x 一部分來自平均分布、一部分擠在某個偏離中央的小區域。
   · 容許寬度 lo～hi 至少 GAP_MIN px（第 1 關 GAP[0]、線性縮到 GAP[1]），不夠就把中間那一顆往右推開，
     所以不會出現「要精準到 0.1 px」的題目。橫桿旁有 ◀ ▶ 可以一次移 1 px 微調。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'halfcrowd';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 40 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 14;                       /* 幾關之後難度到頂 */
    var MAX_LEVEL = 40;
    var N_RANGE = [80, 120];                    /* 圓形個數範圍（偶數） */
    var R_RANGE = [11, 16];                     /* 圓形半徑範圍（px） */
    var OVERLAP = 0.6;                          /* 兩個圓最多重疊多少（0.6＝60%） */
    var SKEW_MAX = 0.85;                        /* 最後一關的不平均程度（0＝平均分布，1＝幾乎全擠在一處） */
    var GAP = [9, 3];                           /* 容許的位置寬度（lo～hi 的距離，px）：第 1 關 → 到頂（最少值） */
    var EDGE = 18;                              /* 圓心離畫面邊緣至少多遠（px） */
    var COUNT_STEP_MS = 1500;                   /* 「計算數量」整個動畫的時間 */
    var TRIES = 60;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function skewAt(level) { return kit.ramp(level, 0, SKEW_MAX, RAMP_LEVELS); }
    function gapAt(level) { return kit.ramp(level, GAP[0], GAP[1], RAMP_LEVELS); }
    /* 兩個圓能不能放在一起：圓心距離 ≥ (1 − OVERLAP) ×（r1＋r2）／… 這裡用「距離 ≥ 0.4×(r1+r2)」（重疊最多 60%） */
    function minDist(r1, r2) { return (1 - OVERLAP) * (r1 + r2); }
    /* 圓心 x 小於線的算左邊；等於線的算右邊 */
    function countLeft(circles, lineX) { var n = 0; circles.forEach(function (c) { if (c.x < lineX) n++; }); return n; }
    /* 出一關：回傳 { circles:[{x,y,r}], N, lo, hi（第 N/2 與 N/2+1 個圓心的 x）, gap, skew, W, H } */
    function makeLevel(level, W, H, rand) {
        rand = rand || Math.random;
        var skew = skewAt(level), need = gapAt(level), last = null;
        for (var tr = 0; tr < TRIES; tr++) {
            var N = 2 * kit.randInt(N_RANGE[0] / 2, N_RANGE[1] / 2, rand);
            /* 擠在哪裡：偏離中央至少 skew×0.28 倍畫面寬，左右隨機；擠成的區域寬度＝畫面寬的 0.3～0.18（越不平均越窄） */
            var side = rand() < 0.5 ? -1 : 1, cc = W / 2 + side * kit.randFloat(0.35, 1, rand) * skew * W * 0.34, sigma = W * kit.lerp(0.14, 0.07, skew / SKEW_MAX);
            var cs = [], ok = true, i, k;
            for (i = 0; i < N && ok; i++) {
                var placed = false;
                for (k = 0; k < 400 && !placed; k++) {
                    var r = kit.randInt(R_RANGE[0], R_RANGE[1], rand), x, y = kit.randFloat(EDGE + r, H - EDGE - r, rand);
                    if (rand() < skew) {                                  /* 擠在 cc 附近（高斯分布，用兩個均勻亂數相加近似）*/
                        x = cc + (rand() + rand() + rand() - 1.5) * 2 * sigma;
                    } else x = kit.randFloat(EDGE + r, W - EDGE - r, rand);
                    if (x < EDGE + r || x > W - EDGE - r) continue;
                    var clash = false;
                    for (var j = 0; j < cs.length; j++) {
                        var dx = cs[j].x - x, dy = cs[j].y - y, md = minDist(cs[j].r, r);
                        if (dx * dx + dy * dy < md * md) { clash = true; break; }
                    }
                    if (!clash) { cs.push({ x: x, y: y, r: r }); placed = true; }
                }
                if (!placed) ok = false;
            }
            if (!ok) continue;
            /* 容許寬度不夠：把右半邊最靠左的那一顆往右推開（要沒撞到別的圓、沒出界） */
            var sorted = cs.slice().sort(function (a, b) { return a.x - b.x; }), lo = sorted[N / 2 - 1], hi = sorted[N / 2];
            last = { circles: cs, N: N, lo: lo.x, hi: hi.x, gap: hi.x - lo.x, skew: skew, W: W, H: H, need: need };
            if (hi.x - lo.x < need) {
                var nx = lo.x + need + 0.5, can = nx <= W - EDGE - hi.r;
                for (var m = 0; m < cs.length && can; m++) {
                    if (cs[m] === hi) continue;
                    var ddx = cs[m].x - nx, ddy = cs[m].y - hi.y, md2 = minDist(cs[m].r, hi.r);
                    if (ddx * ddx + ddy * ddy < md2 * md2) can = false;
                }
                if (!can) continue;
                hi.x = nx;
                sorted = cs.slice().sort(function (a, b) { return a.x - b.x; });
                if (sorted[N / 2 - 1].x >= sorted[N / 2].x || sorted[N / 2] !== hi) continue;
                last.lo = sorted[N / 2 - 1].x; last.hi = sorted[N / 2].x; last.gap = last.hi - last.lo;
                if (last.gap < need) continue;
            }
            return last;
        }
        return last;
    }
    function rating(n) {
        if (n >= 20) return '一眼看穿！';
        if (n >= 12) return '數得真準！';
        if (n >= 7) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '圓心不是均勻分布的，線不在正中間，再試一次！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            stageClass: 'hc-stage',
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level, my = api.my;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var TOP = 48, BOT = 56 + 84 + 20;                         /* 上方數量列高度、下方橫桿＋按鈕區高度 */
        var AH = H - TOP - BOT;                                   /* 圓形區高度 */
        var q = makeLevel(level, W, AH, api.rand);
        api.info = q;
        console.log('[一半的人] 第 ' + level + ' 關：' + q.N + ' 個圓、不平均程度 ' + q.skew.toFixed(2) + '；正確範圍 x＝' + q.lo.toFixed(2) + '～' + q.hi.toFixed(2) + '（寬 ' + q.gap.toFixed(2) + 'px，要求至少 ' + q.need.toFixed(1) + 'px）；線從 ' + (W / 2) + ' 開始');

        var info = h('div', { 'class': 'hc-count' }, [
            h('span', { 'class': 'hc-count__g', text: '綠色 0' }), h('span', { 'class': 'hc-count__vs', text: '：' }), h('span', { 'class': 'hc-count__r', text: '0 紅色' })
        ]);
        stage.appendChild(info);
        var svg = kit.svg('svg', { 'class': 'hc-svg', viewBox: '0 0 ' + W + ' ' + AH, width: W, height: AH }, stage);
        svg.style.top = TOP + 'px';
        var els = q.circles.map(function (c) {
            var g = kit.svg('g', {}, svg);
            var cir = kit.svg('circle', { cx: c.x.toFixed(2), cy: c.y.toFixed(2), r: c.r, 'class': 'hc-circle' }, g);
            kit.svg('circle', { cx: c.x.toFixed(2), cy: c.y.toFixed(2), r: 2.6, 'class': 'hc-dot' }, g);
            return cir;
        });
        var line = kit.svg('line', { x1: W / 2, x2: W / 2, y1: 0, y2: AH, 'class': 'hc-line' }, svg);

        /* 橫桿與微調鈕 */
        var X = W / 2, locked = false, hint = null;
        var bar = h('div', { 'class': 'hc-bar' }), knob = h('div', { 'class': 'hc-knob' });
        bar.appendChild(h('div', { 'class': 'hc-track' })); bar.appendChild(knob);
        var bL = h('button', { 'class': 'btn btn--line hc-nudge hc-nudge--l', text: '◀' }), bR = h('button', { 'class': 'btn btn--line hc-nudge hc-nudge--r', text: '▶' });
        var okBtn = h('button', { 'class': 'btn btn--go hc-ok', text: '計算數量' });
        [bar, bL, bR, okBtn].forEach(function (e) { stage.appendChild(e); });
        var KR = 22;
        function paint() {
            line.setAttribute('x1', X.toFixed(2)); line.setAttribute('x2', X.toFixed(2));
            knob.style.left = (KR + (W - 2 * KR) * X / W - KR) + 'px';
        }
        paint();
        function setX(v) { X = kit.clamp(v, 0, W); paint(); }
        var dragging = null;
        function fromPointer(e) { var p = kit.localPt(e, bar); setX((p.x - KR) / (W - 2 * KR) * W); }
        bar.addEventListener('pointerdown', function (e) {
            if (locked || dragging != null) return;
            e.preventDefault();
            try { bar.setPointerCapture(e.pointerId); } catch (err) { }
            dragging = e.pointerId; if (hint) { hint.remove(); hint = null; }
            fromPointer(e);
        });
        bar.addEventListener('pointermove', function (e) { if (dragging === e.pointerId && !locked) fromPointer(e); });
        function endDrag(e) { if (dragging === e.pointerId) dragging = null; }
        bar.addEventListener('pointerup', endDrag); bar.addEventListener('pointercancel', endDrag);
        /* ◀ ▶：按一下移 1 px，按住 0.35 秒後每 0.06 秒再移 1 px */
        function nudge(btn, d) {
            var t1 = null, t2 = null;
            function stop() { if (t1) clearTimeout(t1); if (t2) clearInterval(t2); t1 = t2 = null; }
            btn.addEventListener('pointerdown', function (e) {
                e.preventDefault(); if (locked) return;
                if (hint) { hint.remove(); hint = null; }
                setX(X + d);
                t1 = setTimeout(function () { t2 = setInterval(function () { if (locked) stop(); else setX(X + d); }, 60); }, 350);
            });
            ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { btn.addEventListener(ev, stop); });
            my.onDispose(stop);
        }
        nudge(bL, -1); nudge(bR, 1);
        /* 操作提示（只在第一次進遊戲時）：手指＋箭頭，沿著橫桿往「剛好一半」的位置移動（第一關的正確答案） */
        if (level === 1 && kit.once('halfcrowd.hint')) {
            var mid = (q.lo + q.hi) / 2, y = TOP + AH + 8 + 28;
            var x0 = KR + (W - 2 * KR) * X / W, x1 = KR + (W - 2 * KR) * mid / W;
            hint = kit.fingerHint(stage, { mode: 'drag', x: x0, y: y, dx: x1 - x0, dy: 0, delay: 400, text: '請往左右拖曳，讓兩邊一樣多' });
        }
        var msg = h('div', { 'class': 'hc-msg' });
        stage.appendChild(msg);

        /* 計算數量：左邊依序變綠、右邊依序變紅，上方同步顯示數量 */
        function count() {
            if (locked || api.over) return;
            locked = true;
            if (hint) { hint.remove(); hint = null; }
            Sfx.play('click');
            var left = [], right = [];
            q.circles.forEach(function (c, i) { (c.x < X ? left : right).push({ i: i, x: c.x }); });
            left.sort(function (a, b) { return a.x - b.x; });
            right.sort(function (a, b) { return b.x - a.x; });
            var gEl = info.querySelector('.hc-count__g'), rEl = info.querySelector('.hc-count__r');
            var shownL = 0, shownR = 0;
            function show(e) {
                var nl = Math.round(left.length * e), nr = Math.round(right.length * e);
                for (; shownL < nl; shownL++) els[left[shownL].i].classList.add('hc-circle--g');
                for (; shownR < nr; shownR++) els[right[shownR].i].classList.add('hc-circle--r');
                gEl.textContent = '綠色 ' + shownL; rEl.textContent = shownR + ' 紅色';
            }
            my.tween(COUNT_STEP_MS, show, kit.linear).then(function () {
                show(1);
                var ok = left.length === right.length;
                if (ok) {
                    Sfx.play('ok'); info.classList.add('hc-count--ok');
                    msg.textContent = '一樣多！左右各 ' + left.length + ' 個'; msg.classList.add('hc-msg--ok');
                    api.pass({ gain: 1, delay: 1100 });
                } else {
                    Sfx.play('bad'); info.classList.add('hc-count--bad');
                    msg.textContent = '左邊 ' + left.length + ' 個、右邊 ' + right.length + ' 個，不一樣多'; msg.classList.add('hc-msg--bad');
                    /* 標出正確的位置：綠色虛線 */
                    var ok2 = kit.svg('line', { x1: ((q.lo + q.hi) / 2).toFixed(2), x2: ((q.lo + q.hi) / 2).toFixed(2), y1: 0, y2: AH, 'class': 'hc-line hc-line--ans' }, svg);
                    api.fail({ delay: 1800, lines: ['這一關有 ' + q.N + ' 個圓', '你的線左邊 ' + left.length + ' 個、右邊 ' + right.length + ' 個', '剛好一半的位置在綠色虛線附近（x ' + q.lo.toFixed(4) + '～' + q.hi.toFixed(4) + '）'] });
                }
            });
        }
        kit.onTap(okBtn, count);

        /* 驗證用：solve 把線放在剛好一半的位置；wrong 放在一個一定數不一樣的位置 */
        api.solve = function () { setX((q.lo + q.hi) / 2); count(); };
        api.wrong = function () {
            var pos = W * 0.04;
            if (countLeft(q.circles, pos) === q.N / 2) pos = W * 0.96;
            setX(pos); count();
        };
    }

    var G = {
        id: ID,
        name: '一半的人',
        rule: '畫面上有 80～120 個圓形，每個圓的中間有一個黑點（圓心）。拖曳下方的橫桿，把豎線移到**「左右兩邊圓心數量一樣多」**的位置，旁邊的 ◀ ▶ 可以一次移 1 像素。按「計算數量」後，左邊的圓會一個一個變綠、右邊變紅，兩邊一樣多就過關。圓形的分布會越來越不平均，**線不會在正中間喔**！',
        mount: mount,
        score: SCORE,
        test: { skewAt: skewAt, gapAt: gapAt, minDist: minDist, countLeft: countLeft, makeLevel: makeLevel, N_RANGE: N_RANGE, R_RANGE: R_RANGE, EDGE: EDGE, OVERLAP: OVERLAP, SKEW_MAX: SKEW_MAX }
    };
    Reaction.register(G);
})();
