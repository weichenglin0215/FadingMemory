/* ═══════════════════════════════════════════════════════════════════
   reaction_halfvol.js — 秒反應・容量一半
   一個花瓶（每次曲線都不一樣），拖曳水位線，讓「線以下」的容量剛好是整個花瓶的一半——
   不是一半的高度！只有一次機會。
   ───────────────────────────────────────────────────────────────────
   · 花瓶是旋轉體：半徑 r(y)（y 從瓶底往上）由 NODES 個隨機控制點用 Catmull-Rom 平滑連起來；
     容量 V(y) ＝ ∫ π r² dy，用 1px 一格的數值積分（累積陣列），找出一半容量的高度 h*。
   · 出題限制：h* 與「一半高度」至少差 MIN_GAP（相對瓶高），不然拉到一半高度就接近正確。
   · 成績 ＝ |V(線以下) − V總÷2| ÷ V總 × 100（%，越小越好，最大 50）。
   · 揭曉：水從底部倒到你的線，標出線以下／以上的容量 %，再用綠線標出真正的一半容量位置、
     灰色虛線標出一半高度。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'halfvol';
    var SCORE = { better: 'min', decimals: 4, format: '{v}%', label: '容量差', min: 0, max: 50 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var VASE_H = 480;                       /* 瓶高（px） */
    var NODES = 7;                          /* 輪廓控制點數 */
    var R_MIN = 22, R_MAX = 105;            /* 控制點半徑範圍 */
    var R_FLOOR = 14;                       /* 任何高度的半徑下限（避免瓶頸細成一條線） */
    var MIN_GAP = 0.08;                     /* 一半容量的高度與一半高度至少差瓶高的幾倍 */
    var START_GAP = 0.15;                   /* 起始水位離答案至少差瓶高的幾倍 */
    var CX = 236, BOTTOM = 575;             /* 花瓶中軸 x、瓶底 y（舞台座標） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* Catmull-Rom 內插：四個相鄰控制點 p0 p1 p2 p3，t 在 p1～p2 之間 */
    function cr(p0, p1, p2, p3, t) {
        var t2 = t * t, t3 = t2 * t;
        return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    }
    /* 半徑 r(y)：y 在 0～VASE_H（從瓶底往上），rs 是 NODES 個控制點半徑 */
    function radiusAt(rs, y) {
        var u = kit.clamp(y / VASE_H, 0, 1) * (rs.length - 1);
        var i = Math.min(rs.length - 2, Math.floor(u)), t = u - i;
        var p0 = rs[Math.max(0, i - 1)], p1 = rs[i], p2 = rs[i + 1], p3 = rs[Math.min(rs.length - 1, i + 2)];
        return Math.max(R_FLOOR, cr(p0, p1, p2, p3, t));
    }
    /* 累積容量陣列：cum[k] ＝ 從瓶底到高度 k px 的容量（單位：px³×π，只比較比例所以不用乘 π 以外的東西） */
    function cumulative(rs) {
        var cum = [0];
        for (var k = 1; k <= VASE_H; k++) {
            var r = radiusAt(rs, k - 0.5);
            cum.push(cum[k - 1] + Math.PI * r * r);
        }
        return cum;
    }
    /* 高度 y（可以有小數）的容量：在累積陣列上線性內插 */
    function volumeAt(cum, y) {
        y = kit.clamp(y, 0, VASE_H);
        var i = Math.min(VASE_H - 1, Math.floor(y)), t = y - i;
        return cum[i] + (cum[i + 1] - cum[i]) * t;
    }
    /* 一半容量的高度 h*：二分搜尋 */
    function halfHeight(cum) {
        var half = cum[VASE_H] / 2, lo = 0, hi = VASE_H;
        for (var it = 0; it < 50; it++) { var mid = (lo + hi) / 2; if (volumeAt(cum, mid) < half) lo = mid; else hi = mid; }
        return (lo + hi) / 2;
    }
    /* 誤差（%）：線以下的容量與一半總容量的差 ÷ 總容量 */
    function errPct(cum, y) { return Math.abs(volumeAt(cum, y) - cum[VASE_H] / 2) / cum[VASE_H] * 100; }
    /* 出題：隨機控制點半徑；h* 要離一半高度夠遠；起始水位離答案與一半高度都夠遠 */
    function makeRound(rand) {
        rand = rand || Math.random;
        for (var tries = 0; tries < 800; tries++) {
            var rs = [];
            for (var i = 0; i < NODES; i++) rs.push(kit.randFloat(R_MIN, R_MAX, rand));
            var cum = cumulative(rs), hs = halfHeight(cum);
            if (Math.abs(hs - VASE_H / 2) < MIN_GAP * VASE_H) continue;
            var start = null;
            for (var k = 0; k < 40 && start == null; k++) {
                var c = kit.randFloat(0.08, 0.92, rand) * VASE_H;
                if (Math.abs(c - hs) >= START_GAP * VASE_H && Math.abs(c - VASE_H / 2) >= 0.1 * VASE_H) start = c;
            }
            if (start == null) continue;
            return { rs: rs, cum: cum, hs: hs, start: start, total: cum[VASE_H] };
        }
        /* 保底：瓶底肥、瓶口細 → 一半容量遠低於一半高度 */
        var fb = [100, 95, 70, 40, 28, 24, 30], cumF = cumulative(fb);
        return { rs: fb, cum: cumF, hs: halfHeight(cumF), start: 0.85 * VASE_H, total: cumF[VASE_H] };
    }
    function rating(e) {
        if (e < 0.3) return '神準！';
        if (e < 1) return '很準！';
        if (e < 3) return '不錯喔！';
        return '容量不等於高度，再試一次！';
    }

    function mount(root, ctx) {
        kit.single(root, ctx, {
            id: ID, G: G, better: 'min', max: SCORE.max,
            title: '拖曳水位線，讓線以下的容量剛好是整個花瓶的一半',
            numText: function (v) { return v.toFixed(4) + '%'; },
            rating: rating,
            sfx: function (v) { return v < 1 ? 'perfect' : (v < 4 ? 'win' : 'fail'); },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, my = api.my;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var cfg = makeRound(), L = cfg.start, locked = false, hint = null;
        console.log('[容量一半] 一半容量的高度 ' + cfg.hs.toFixed(2) + '（一半高度 ' + (VASE_H / 2) + '），起始水位 ' + cfg.start.toFixed(2));
        var base = Math.min(BOTTOM, H - 100);
        function yOf(level) { return base - level; }

        var svg = kit.svg('svg', { 'class': 'hv-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);
        /* 瓶身輪廓（每 4px 取一點） */
        function side(sign) {
            var pts = [];
            for (var y = 0; y <= VASE_H; y += 4) pts.push([CX + sign * radiusAt(cfg.rs, y), yOf(y)]);
            return pts;
        }
        var left = side(-1), right = side(1);
        var outline = left.concat(right.slice().reverse());
        kit.svg('polygon', { points: outline.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '), 'class': 'hv-vase' }, svg);
        var water = kit.svg('polygon', { 'class': 'hv-water' }, svg);
        kit.svg('polygon', { points: outline.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '), 'class': 'hv-rim' }, svg);
        var refHalfH = kit.svg('line', { x1: CX - 150, x2: CX + 150, y1: yOf(VASE_H / 2), y2: yOf(VASE_H / 2), 'class': 'hv-ref hv-ref--h', opacity: 0 }, svg);
        var refHalfV = kit.svg('line', { x1: CX - 150, x2: CX + 150, y1: yOf(cfg.hs), y2: yOf(cfg.hs), 'class': 'hv-ref hv-ref--v', opacity: 0 }, svg);
        var line = kit.svg('line', { x1: CX - 150, x2: CX + 150, 'class': 'hv-line' }, svg);
        var hl = kit.svg('circle', { cx: CX - 150, r: 20, 'class': 'hv-knob' }, svg);
        var hr = kit.svg('circle', { cx: CX + 150, r: 20, 'class': 'hv-knob' }, svg);
        var msg = h('div', { 'class': 'hv-msg' });
        stage.appendChild(msg);
        var okBtn = h('button', { 'class': 'btn btn--go hv-ok', text: '確定' });
        stage.appendChild(okBtn);

        function waterPoly(level) {
            var pts = [];
            for (var y = 0; y <= level; y += 4) pts.push([CX - radiusAt(cfg.rs, y), yOf(y)]);
            pts.push([CX - radiusAt(cfg.rs, level), yOf(level)]);
            for (var y2 = level; y2 >= 0; y2 -= 4) pts.push([CX + radiusAt(cfg.rs, y2), yOf(y2)]);
            pts.push([CX + radiusAt(cfg.rs, 0), yOf(0)]);
            return pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
        }
        function paint() {
            water.setAttribute('points', waterPoly(L));
            line.setAttribute('y1', yOf(L)); line.setAttribute('y2', yOf(L));
            hl.setAttribute('cy', yOf(L)); hr.setAttribute('cy', yOf(L));
        }
        paint();

        /* 操作提示（只在第一次進遊戲時）：手指＋箭頭，從水位線右邊的把手往「剛好一半容量的高度」重複移動（第一次的正確答案） */
        if (kit.once('halfvol.hint')) hint = kit.fingerHint(stage, { mode: 'drag', x: CX + 150, y: yOf(L), dx: 0, dy: yOf(cfg.hs) - yOf(L), delay: 400 });
        function hideHint() { if (hint) { hint.remove(); hint = null; } }

        kit.dragDamp(stage, {
            enabled: function () { return !locked; },
            start: function () { hideHint(); return true; },
            move: function (dx, dy) { L = kit.clamp(L - dy, 0, VASE_H); paint(); }
        });
        kit.onTap(okBtn, function () { submit(); });

        function submit() {
            if (locked) return;
            locked = true; hideHint();
            okBtn.style.display = 'none';
            Sfx.play('click');
            var real = errPct(cfg.cum, L);
            var below = volumeAt(cfg.cum, L) / cfg.total * 100;
            /* 揭曉：水從底部倒到你的線 */
            var target = L; L = 0; paint();
            my.tween(900, function (e) { L = target * e; paint(); }, kit.easeOutCubic).then(function () {
                L = target; paint();
                refHalfH.setAttribute('opacity', 1); refHalfV.setAttribute('opacity', 1);
                msg.innerHTML = '';
                msg.appendChild(h('div', { text: '線以下 ' + below.toFixed(4) + '%　線以上 ' + (100 - below).toFixed(4) + '%' }));
                msg.appendChild(h('div', { 'class': 'hv-msg__sub', text: '綠線＝真正的一半容量　灰虛線＝一半高度' }));
                msg.classList.add('hv-msg--on');
                my.after(1900, function () {
                    api.finish(real, { lines: [
                        '線以下的容量是 ' + below.toFixed(4) + '%（目標 50.0000%）',
                        '真正的一半容量在 ' + (cfg.hs / VASE_H * 100).toFixed(4) + '% 高度，一半高度是 50.0000%',
                        '只有一次機會，想拚更準就再挑戰一次'
                    ] });
                });
            });
        }

        G.debug = {
            state: function () { return { L: L, cfg: cfg, locked: locked }; },
            setLevel: function (v) { L = kit.clamp(v, 0, VASE_H); paint(); },
            solve: function () { L = cfg.hs; paint(); submit(); },
            wrong: function () { L = VASE_H / 2; paint(); submit(); },
            submit: submit
        };
    }

    var G = {
        id: ID,
        name: '容量一半',
        rule: '畫面上是一個花瓶。上下拖曳水位線，**讓線以下的容量剛好是整個花瓶的一半**。注意：**一半的高度不等於一半的容量**！每次花瓶都不一樣，只有一次機會，按「確定」後水會倒進去告訴你差了幾 %。',
        mount: mount,
        score: SCORE,
        test: { radiusAt: radiusAt, cumulative: cumulative, volumeAt: volumeAt, halfHeight: halfHeight, errPct: errPct, makeRound: makeRound, rating: rating, VASE_H: VASE_H, NODES: NODES, R_FLOOR: R_FLOOR, MIN_GAP: MIN_GAP, START_GAP: START_GAP }
    };
    Reaction.register(G);
})();
