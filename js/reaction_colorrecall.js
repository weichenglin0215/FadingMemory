/* ═══════════════════════════════════════════════════════════════════
   reaction_colorrecall.js — 秒反應・記色調色
   先看左邊的色塊 3 秒（右上倒數、右下「請記住左邊顏色」），3 秒後左邊色塊消失，
   右邊出現一塊隨機起始色的色塊；拖曳下方橫條，讓右邊色塊變回剛剛看到的顏色。按「確定」，只有一次機會。
   每一回合只考「色相」「彩度」「明度」其中一項（隨機抽），另外兩項跟目標色一樣。
   ───────────────────────────────────────────────────────────────────
   · 色彩用 HSL 控制（色相 0～360°、彩度 0～100%、明度 L_MIN～L_MAX%）；目標色的彩度 40～90%、
     明度 35～65%（避免太灰太暗）。
   · 橫條的軌道沒有漸層（避免玩家用軌道顏色對照）；起始值離目標至少一段距離（色相 ≥ 60°、彩度／明度 ≥ 25／20 個百分點）。
   · 微調：拖曳慢速打折（kit.dragDamp）；橫條兩端的 ◀ ▶ 每按一下調 NUDGE（0.5 單位，按住會連續）。
   · 色差 ΔE：HSL → sRGB → XYZ（D65）→ CIE Lab，取 CIE76（Lab 空間的歐氏距離）。成績＝ΔE（越小越好）。
   · 背景固定中灰（HSL 0,0%,50%），避免對比錯覺干擾兩塊顏色。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'colorrecall';
    var SCORE = { better: 'min', decimals: 4, format: 'ΔE {v}', label: '色差', min: 0, max: 260 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var MEMO_S = 3;                             /* 記憶秒數 */
    var L_MIN = 20, L_MAX = 80;                 /* 明度橫條的範圍（%） */
    var TARGET_S = [40, 90], TARGET_L = [35, 65];
    var START_GAP = { hue: [60, 180], sat: [25, 45], light: [20, 30] };   /* 起始值離目標的距離範圍（度／百分點） */
    var NUDGE = 0.5;                            /* ◀ ▶ 每按一下調幾個單位 */
    var TRACK_W = 380, KNOB = 64;
    var DIMS = ['hue', 'sat', 'light'];
    var DIM_NAME = { hue: '色相', sat: '彩度', light: '明度' };
    var DIM_UNIT = { hue: '度', sat: '%', light: '%' };

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function hslToRgb(hh, s, l) {
        hh = ((hh % 360) + 360) % 360; s /= 100; l /= 100;
        var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((hh / 60) % 2 - 1)), m = l - c / 2, r = 0, g = 0, b = 0;
        if (hh < 60) { r = c; g = x; } else if (hh < 120) { r = x; g = c; } else if (hh < 180) { g = c; b = x; }
        else if (hh < 240) { g = x; b = c; } else if (hh < 300) { r = x; b = c; } else { r = c; b = x; }
        return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
    }
    function rgbToLab(rgb) {
        var lin = rgb.map(function (v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        var X = (0.4124564 * lin[0] + 0.3575761 * lin[1] + 0.1804375 * lin[2]) / 0.95047;
        var Y = 0.2126729 * lin[0] + 0.7151522 * lin[1] + 0.0721750 * lin[2];
        var Z = (0.0193339 * lin[0] + 0.1191920 * lin[1] + 0.9503041 * lin[2]) / 1.08883;
        var f = function (t) { return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116; };
        var fx = f(X), fy = f(Y), fz = f(Z);
        return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
    }
    function labOf(c) { return rgbToLab(hslToRgb(c.h, c.s, c.l)); }
    function deltaE(c1, c2) {
        var a = labOf(c1), b = labOf(c2);
        return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2));
    }
    /* 橫條位置 t（0～1）與維度數值互換 */
    function valueAt(dim, t) { return dim === 'hue' ? t * 360 : (dim === 'sat' ? t * 100 : L_MIN + t * (L_MAX - L_MIN)); }
    function tFor(dim, v) { return dim === 'hue' ? v / 360 : (dim === 'sat' ? v / 100 : (v - L_MIN) / (L_MAX - L_MIN)); }
    function unitsPerT(dim) { return dim === 'hue' ? 360 : (dim === 'sat' ? 100 : L_MAX - L_MIN); }
    function dimKey(dim) { return dim === 'hue' ? 'h' : (dim === 'sat' ? 's' : 'l'); }
    /* 把目標色的某一個維度換成 v */
    function withDim(c, dim, v) { var o = { h: c.h, s: c.s, l: c.l }; o[dimKey(dim)] = v; return o; }
    function makeRound(rand, forceDim) {
        rand = rand || Math.random;
        var target = { h: kit.randFloat(0, 360, rand), s: kit.randFloat(TARGET_S[0], TARGET_S[1], rand), l: kit.randFloat(TARGET_L[0], TARGET_L[1], rand) };
        var dim = forceDim || kit.pick(DIMS, rand), tv = target[dimKey(dim)], gap = START_GAP[dim], g = kit.randFloat(gap[0], gap[1], rand), sign = rand() < 0.5 ? 1 : -1, v;
        if (dim === 'hue') v = ((tv + sign * g) % 360 + 360) % 360;
        else {
            var lo = dim === 'sat' ? 0 : L_MIN, hi = dim === 'sat' ? 100 : L_MAX;
            v = tv + sign * g;
            if (v < lo || v > hi) v = tv - sign * g;
            v = kit.clamp(v, lo, hi);
        }
        return { target: target, dim: dim, start: v };
    }
    function rating(e) {
        if (e < 1.5) return '神乎其技！';
        if (e < 4) return '高手！';
        if (e < 8) return '很準！';
        if (e < 15) return '不錯喔！';
        return '再試一次，會更準！';
    }
    function css(c) { return 'hsl(' + c.h.toFixed(2) + ',' + c.s.toFixed(2) + '%,' + c.l.toFixed(2) + '%)'; }

    function mount(root, ctx) {
        kit.single(root, ctx, {
            id: ID, G: G, better: 'min', max: SCORE.max,
            title: '先記住左邊的顏色，再把右邊調成一樣',
            stageClass: 'cr-stage',
            numText: function (v) { return 'ΔE ' + v.toFixed(4); },
            rating: rating,
            sfx: function (v) { return v < 4 ? 'perfect' : (v < 10 ? 'win' : 'fail'); },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, my = api.my;
        var W = stage.clientWidth || 472;
        var cfg = makeRound(), t = tFor(cfg.dim, cfg.start), phase = 'memo', locked = false, hint = null;
        console.log('[記色調色] 這回合考' + DIM_NAME[cfg.dim] + '；目標 H' + cfg.target.h.toFixed(2) + ' S' + cfg.target.s.toFixed(2) + ' L' + cfg.target.l.toFixed(2) + '；起始 ' + cfg.start.toFixed(2));

        var left = h('div', { 'class': 'cr-block cr-block--l' });
        var right = h('div', { 'class': 'cr-block cr-block--r' });
        var count = h('div', { 'class': 'cr-count', text: String(MEMO_S) });
        var memo = h('div', { 'class': 'cr-memo', text: '請記住左邊顏色' });
        var dimTag = h('div', { 'class': 'cr-dim', text: '這次考：' + DIM_NAME[cfg.dim] });
        left.style.background = css(cfg.target);
        right.classList.add('cr-block--info');
        right.appendChild(count); right.appendChild(memo);
        [left, right, dimTag].forEach(function (e) { stage.appendChild(e); });

        /* 調整區（記憶結束後才出現） */
        var trackY = 420, x0 = (W - TRACK_W) / 2;
        var track = h('div', { 'class': 'cr-track' });
        track.style.left = x0 + 'px'; track.style.top = trackY + 'px'; track.style.width = TRACK_W + 'px';
        var knob = h('div', { 'class': 'cr-knob' }); knob.style.top = (trackY + 4 - KNOB / 2) + 'px';
        var bL = h('button', { 'class': 'btn btn--line cr-nudge', text: '◀' }), bR = h('button', { 'class': 'btn btn--line cr-nudge', text: '▶' });
        var nudges = h('div', { 'class': 'cr-nudges' }, [bL, bR]);
        var okBtn = h('button', { 'class': 'btn btn--go cr-ok', text: '確定' });
        var msg = h('div', { 'class': 'cr-msg' });
        var ctrl = [track, knob, nudges, okBtn];
        ctrl.forEach(function (e) { e.style.display = 'none'; stage.appendChild(e); });
        stage.appendChild(msg);
        function mine() { return withDim(cfg.target, cfg.dim, valueAt(cfg.dim, t)); }
        function paint() {
            knob.style.left = (x0 + t * TRACK_W - KNOB / 2) + 'px';
            if (phase === 'adjust') right.style.background = css(mine());
        }

        /* 倒數 */
        for (var k = 1; k <= MEMO_S; k++) (function (k) { my.after(k * 1000, function () { if (k < MEMO_S) { count.textContent = String(MEMO_S - k); Sfx.play('tick'); } else toAdjust(); }); })(k);
        function toAdjust() {
            phase = 'adjust';
            left.style.background = ''; left.classList.add('cr-block--info'); left.textContent = '請調整下方橫條，讓右邊色塊與剛剛相同';
            right.classList.remove('cr-block--info'); right.innerHTML = '';
            ctrl.forEach(function (e) { e.style.display = ''; });
            paint();
            /* 操作提示（只在第一次進遊戲時）：手指＋箭頭，從圓點現在的位置往「剛剛那個顏色的位置」重複移動（第一次的正確答案） */
            if (kit.once('colorrecall.hint')) hint = kit.fingerHint(stage, { mode: 'drag', x: x0 + t * TRACK_W, y: trackY + 4, dx: (tFor(cfg.dim, cfg.target[dimKey(cfg.dim)]) - t) * TRACK_W, dy: 0, delay: 300 });
            Sfx.play('go');
        }
        function hideHint() { if (hint) { hint.remove(); hint = null; } }

        kit.dragDamp(stage, {
            enabled: function () { return phase === 'adjust' && !locked; },
            start: function () { hideHint(); return true; },
            move: function (dx) { t = kit.clamp(t + dx / TRACK_W, 0, 1); paint(); }
        });
        function nudge(btn, dir) {
            var rep = null;
            function step() { if (phase === 'adjust' && !locked) { t = kit.clamp(t + dir * NUDGE / unitsPerT(cfg.dim), 0, 1); paint(); } }
            btn.addEventListener('pointerdown', function (e) {
                e.preventDefault(); hideHint(); step();
                var n = 0;
                (function again() { rep = my.after(n++ < 3 ? 350 : 60, function () { step(); again(); }); })();
            });
            function stop() { if (rep != null) { my.cancel(rep); rep = null; } }
            btn.addEventListener('pointerup', stop); btn.addEventListener('pointerleave', stop); btn.addEventListener('pointercancel', stop);
        }
        nudge(bL, -1); nudge(bR, 1);
        kit.onTap(okBtn, function () { submit(); });

        function submit() {
            if (locked || phase !== 'adjust') return;
            locked = true; hideHint(); okBtn.style.display = 'none'; nudges.style.display = 'none';
            Sfx.play('click');
            var m = mine(), real = deltaE(m, cfg.target);
            left.classList.remove('cr-block--info'); left.textContent = ''; left.style.background = css(cfg.target);
            var tv = cfg.target[dimKey(cfg.dim)], mv = valueAt(cfg.dim, t);
            msg.textContent = '左：剛才的顏色　右：你調的　色差 ' + real.toFixed(4);
            msg.classList.add('cr-msg--on');
            my.after(2400, function () {
                api.finish(real, { lines: [
                    '這一回合考' + DIM_NAME[cfg.dim] + '：目標 ' + tv.toFixed(4) + DIM_UNIT[cfg.dim] + '，你調到 ' + mv.toFixed(4) + DIM_UNIT[cfg.dim],
                    '色差 ΔE ＝ ' + real.toFixed(4) + '（Lab 空間的距離，越小越接近）',
                    '只有一次機會，想拚更準就再挑戰一次（下次可能考別的項目）'
                ] });
            });
        }

        G.debug = {
            state: function () { return { cfg: cfg, t: t, phase: phase, locked: locked, value: valueAt(cfg.dim, t) }; },
            skipMemo: function () { if (phase === 'memo') toAdjust(); },
            setValue: function (v) { t = kit.clamp(tFor(cfg.dim, v), 0, 1); paint(); },
            solve: function () { if (phase === 'memo') toAdjust(); t = tFor(cfg.dim, cfg.target[dimKey(cfg.dim)]); paint(); submit(); },
            wrong: function () { if (phase === 'memo') toAdjust(); t = kit.clamp(tFor(cfg.dim, cfg.start), 0, 1); paint(); submit(); }
        };
    }

    var G = {
        id: ID,
        name: '記色調色',
        rule: '先看左邊的色塊 3 秒，**記住它的顏色**。3 秒後色塊消失，右邊會出現另一塊顏色，拖曳下方橫條，**把它調回剛剛看到的顏色**。每次只考色相、彩度、明度其中一項。只有一次機會，按「確定」後會告訴你色差。',
        mount: mount,
        score: SCORE,
        test: { hslToRgb: hslToRgb, rgbToLab: rgbToLab, deltaE: deltaE, valueAt: valueAt, tFor: tFor, unitsPerT: unitsPerT, withDim: withDim, makeRound: makeRound, rating: rating, DIMS: DIMS, START_GAP: START_GAP, L_MIN: L_MIN, L_MAX: L_MAX, TARGET_S: TARGET_S, TARGET_L: TARGET_L }
    };
    Reaction.register(G);
})();
