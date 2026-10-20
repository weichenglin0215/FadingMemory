/* ═══════════════════════════════════════════════════════════════════
   reaction_gearmark.js — 秒反應・齒輪對記號（企劃 254）
   一串咬在一起的齒輪（銅色，像老時鐘的內部），每個齒輪上有一根紅色的針。手指在**最大的那個齒輪**上畫圈轉動它，
   其他齒輪跟著轉（相鄰的反方向、齒數少的轉得快）。**讓所有紅針同時指向正上方**，放手就判定。
   ───────────────────────────────────────────────────────────────────
   · 轉速：第 i 個齒輪的轉角 rot_i(θ0) = (−1)^i × θ0 × T0 ÷ T_i（T 是齒數；偶數號順時針、奇數號逆時針；齒數少的轉得快）。
   · 紅針的方向 = 初始針角 m_i + rot_i(θ0)（從正上方起算、順時針為正）；誤差 = 這個角度離「正上方」多遠（取 −180～180 的絕對值）。
     全部齒輪的誤差都在容許範圍（TOL）以內才算對準。
   · 一定有解：先決定「對準時」大齒輪轉了 θ0*（120°～500°、方向隨機），再反推每根針的初始角 m_i = −rot_i(θ0*)；
     因為每轉 P 圈（P＝各齒輪「齒數 ÷ 跟大齒輪的最大公因數」的最小公倍數）所有齒輪才會同時回到原位，所以對準的位置每 P 圈才重複一次——
     這就是企劃說的「要轉到最小公倍數那一圈」。P 隨關卡增加（PERIOD_MAX：1 圈 → 12 圈），第 1 關每一圈都對得上。
   · 齒輪咬合要「看起來對」：每個齒輪的齒相位（base）依據它和前一個齒輪的接觸方向算出，使得一個齒輪的齒永遠對著下一個的齒縫（layout／meshSum，有單元測試）。
   · 難度（線性）：齒輪數 2 → 5（GEARS）、容許誤差 8° → 3°（TOL）、全部回到原位的圈數上限 1 → 12（PERIOD_MAX）、限時 45 → 25 秒（TIME_S）。
   · 放手判定：每個齒輪的誤差（X.XXXX 度）逐一列出，超過容許誤差的標紅；全部對準時齒輪一起閃光。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'gearmark';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 24;                       /* 幾關之後難度到頂 */
    var GEARS = [2, 5];                         /* 齒輪數：第 1 關 → 到頂 */
    var TOL = [8, 3];                           /* 紅針離正上方的容許誤差（度）：第 1 關 → 到頂 */
    var PERIOD_MAX = [1, 12];                   /* 「全部回到原位」最多要轉幾圈（最小公倍數那一圈）：第 1 關 → 到頂 */
    var TIME_S = [45, 25];                      /* 每關限時（秒）：第 1 關 → 到頂 */
    var T0_LIST = [24, 30, 36, 40, 48, 60];     /* 大齒輪（最左邊）的齒數可選 */
    var TEETH_MIN = 8, TEETH_GAP = 3;           /* 其他齒輪最少幾齒；相鄰兩個齒輪齒數至少差幾齒（轉速不能太像） */
    var TARGET_TURN = [120, 500];               /* 對準時大齒輪離起點轉了幾度（絕對值範圍） */
    var MIN_TAP_MOVE = 12;                      /* 手指在畫面上至少移動幾 px 才算「畫圈」，放手才判定（避免誤點就失敗） */
    var MAX_LEVEL = 60;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }
    function nFor(level) { return Math.round(ramp(level, GEARS)); }
    function tolFor(level) { return Math.round(ramp(level, TOL) * 10) / 10; }
    function periodMaxFor(level) { return Math.round(ramp(level, PERIOD_MAX)); }
    function timeMs(level) { return Math.round(ramp(level, TIME_S) * 1000); }
    function wrap180(a) { var x = ((a + 180) % 360 + 360) % 360 - 180; return x === -180 ? 180 : x; }       /* 角度換到 (−180, 180] */
    function wrap360(a) { return ((a % 360) + 360) % 360; }
    function gcd(a, b) { return b ? gcd(b, a % b) : a; }
    function lcm(a, b) { return a / gcd(a, b) * b; }
    function rad(d) { return d * Math.PI / 180; }
    /* 第 i 個齒輪的轉角（度，順時針為正）：偶數號跟大齒輪同方向、奇數號反方向，齒數少的轉得快 */
    function rotOf(teeth, i, theta0) { return (i % 2 ? -1 : 1) * theta0 * teeth[0] / teeth[i]; }
    /* 所有齒輪回到同一個狀態要轉幾圈（大齒輪的圈數）：各齒輪「齒數 ÷ 跟大齒輪的最大公因數」的最小公倍數 */
    function ratioPeriod(teeth) {
        var p = 1;
        for (var i = 1; i < teeth.length; i++) p = lcm(p, teeth[i] / gcd(teeth[0], teeth[i]));
        return p;
    }
    /* 每根針離正上方的誤差（度，0～180）；theta0 是大齒輪現在轉了幾度 */
    function errors(q, theta0) {
        return q.teeth.map(function (t, i) { return Math.abs(wrap180(q.marks[i] + rotOf(q.teeth, i, theta0))); });
    }
    function solved(q, theta0) { return Math.max.apply(null, errors(q, theta0)) <= q.tol; }
    /* 出一關：{ teeth, marks（初始針角）, target（對準時大齒輪轉的度數）, tol, period, n, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var n = nFor(level), tol = tolFor(level), pmax = periodMaxFor(level);
        for (var tr = 0; tr < 2000; tr++) {
            var T0 = kit.pick(T0_LIST, rand), teeth = [T0], i;
            for (i = 1; i < n; i++) {
                var cand = [];
                for (var t = TEETH_MIN; t <= T0 - 2; t++) if (Math.abs(t - teeth[i - 1]) >= TEETH_GAP && teeth.indexOf(t) < 0) cand.push(t);
                if (!cand.length) break;
                teeth.push(kit.pick(cand, rand));
            }
            if (teeth.length < n) continue;
            var P = ratioPeriod(teeth);
            if (P > pmax) continue;
            var target = kit.randFloat(TARGET_TURN[0], TARGET_TURN[1], rand) * (rand() < 0.5 ? 1 : -1);
            var marks = teeth.map(function (tt, k) { return wrap360(-rotOf(teeth, k, target)); });
            var q = { teeth: teeth, marks: marks, target: target, tol: tol, period: P, n: n, level: level };
            if (Math.max.apply(null, errors(q, 0)) <= tol * 3) continue;          /* 起點附近不能已經對準 */
            return q;
        }
        var ft = [24, 12], fm = ft.map(function (tt, k) { return wrap360(-rotOf(ft, k, 200)); });
        return { teeth: ft, marks: fm, target: 200, tol: tol, period: 1, n: 2, level: level };
    }
    /* 齒輪的擺放與咬合相位（單位：以「每個齒的半徑」為 1，也就是齒輪的節圓半徑 = 齒數）。
       dirs[i]＝第 i 個齒輪指向第 i+1 個的方向（從正上方起算、順時針的度數）；
       bases[i]＝第 i 個齒輪「一個齒的中心」的方向（轉角 0 時）。
       咬合條件（推導見檔頭）：T_A (dirAB − base_A − rot_A) + T_B (dirBA − base_B − rot_B) ≡ 180°（mod 360°），
       因為相鄰兩個齒輪的 rot 反向、大小反比於齒數，這個和不隨轉動改變，所以只要轉角 0 時成立，轉到哪裡都咬得上。 */
    /* 用「之」字形的斜角 delta 擺一串齒輪：回傳 { pos, dirs }（pos＝各齒輪中心、dirs＝指向下一個齒輪的方向） */
    function chain(teeth, delta) {
        var n = teeth.length, pos = [{ x: 0, y: 0 }], dirs = [], i;
        for (i = 0; i < n - 1; i++) {
            var dir = 90 + (i % 2 === 0 ? -delta : delta), d = teeth[i] + teeth[i + 1];
            dirs.push(dir);
            pos.push({ x: pos[i].x + d * Math.sin(rad(dir)), y: pos[i].y - d * Math.cos(rad(dir)) });
        }
        return { pos: pos, dirs: dirs };
    }
    /* 不相鄰的兩個齒輪不能撞在一起（中心距要大於兩個外圓半徑相加；齒頂比節圓高 1 個單位） */
    function noOverlap(teeth, pos) {
        for (var i = 0; i < teeth.length; i++) for (var j = i + 2; j < teeth.length; j++) {
            if (Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y) < teeth[i] + teeth[j] + 4) return false;
        }
        return true;
    }
    function layout(teeth) {
        var n = teeth.length, bases = [], i, cands = n === 2 ? [0] : [60, 50, 40, 30, 20, 10, 0], c, pos, dirs;
        for (c = 0; c < cands.length; c++) {                                        /* 從最斜（最節省橫向空間）的開始試，第一個不撞的就用 */
            var ch = chain(teeth, cands[c]);
            pos = ch.pos; dirs = ch.dirs;
            if (noOverlap(teeth, pos)) break;
        }
        bases[0] = n > 1 ? dirs[0] : 0;                                              /* 大齒輪：接觸方向上剛好是齒中心 */
        for (i = 1; i < n; i++) {
            var a = teeth[i - 1] * (dirs[i - 1] - bases[i - 1]);                     /* T_A (dirAB − base_A) */
            bases[i] = (dirs[i - 1] + 180) - (180 - a) / teeth[i];
        }
        return { pos: pos, dirs: dirs, bases: bases };
    }
    /* 驗證用：第 i 與第 i+1 個齒輪的咬合量（度，應該永遠 ≡ 180 mod 360） */
    function meshSum(teeth, L, i, theta0) {
        var A = teeth[i], B = teeth[i + 1], rA = rotOf(teeth, i, theta0), rB = rotOf(teeth, i + 1, theta0);
        return wrap360(A * (L.dirs[i] - L.bases[i] - rA) + B * (L.dirs[i] + 180 - L.bases[i + 1] - rB));
    }
    function deg4(x) { return x.toFixed(4); }
    function rating(n) {
        if (n >= 25) return '鐘錶大師！';
        if (n >= 15) return '手感很準！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '慢慢轉，看紅針有沒有同時指向上！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'grm-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 一個齒輪的外形（SVG path 字串）：齒中心在 base（度）＋360/T 的整數倍；節圓半徑 R，齒頂比節圓高 add、齒根比節圓低 ded */
    function gearPath(T, R, base, add, ded) {
        var pts = [], w = 360 / T, k;
        function P(r, ang) { var a = rad(ang); return (r * Math.sin(a)).toFixed(2) + ',' + (-r * Math.cos(a)).toFixed(2); }
        for (k = 0; k < T; k++) {
            var c = base + k * w;
            pts.push(P(R - ded, c - 0.34 * w), P(R + add, c - 0.17 * w), P(R + add, c + 0.17 * w), P(R - ded, c + 0.34 * w));
        }
        return 'M' + pts.join(' L') + ' Z';
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand), teeth = q.teeth, n = q.n, L = layout(teeth);
        api.info = q;
        console.log('[齒輪對記號] 第 ' + level + ' 關：' + n + ' 個齒輪，齒數 ' + teeth.join(':') + '，全部回到原位要 ' + q.period + ' 圈；對準位置＝大齒輪轉 ' + q.target.toFixed(1) + '°；容許誤差 ' + q.tol + '°；限時 ' + timeMs(level) + ' ms');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        stage.appendChild(h('div', { 'class': 'qz-note grm-tip', text: '畫圈轉大齒輪，讓紅針全指向上' }));
        /* 縮放：讓整串齒輪放進 (W−16)×(H−330) 的範圍，置中 */
        var ext = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
        L.pos.forEach(function (p, i) { var r = teeth[i] + 2; ext.x0 = Math.min(ext.x0, p.x - r); ext.x1 = Math.max(ext.x1, p.x + r); ext.y0 = Math.min(ext.y0, p.y - r - 8); ext.y1 = Math.max(ext.y1, p.y + r); });
        var areaT = 64, areaH = Math.min(H - 250, 420);
        var s = Math.min((W - 16) / (ext.x1 - ext.x0), areaH / (ext.y1 - ext.y0), 3.2);
        var ox = (W - (ext.x1 - ext.x0) * s) / 2 - ext.x0 * s, oy = areaT + (areaH - (ext.y1 - ext.y0) * s) / 2 - ext.y0 * s;
        var svg = kit.svg('svg', { 'class': 'grm-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);
        var cx = L.pos.map(function (p) { return ox + p.x * s; }), cy = L.pos.map(function (p) { return oy + p.y * s; });
        var rot = [], gears = [], hands = [];
        teeth.forEach(function (T, i) {
            var R = T * s, g = kit.svg('g', { 'class': 'grm-gear', transform: 'translate(' + cx[i].toFixed(2) + ',' + cy[i].toFixed(2) + ')' }, svg);
            /* 固定的「正上方」記號：齒輪頂端外面一個小三角形 */
            kit.svg('path', { 'class': 'grm-tick', d: 'M-7,' + (-R - 20) + ' L7,' + (-R - 20) + ' L0,' + (-R - 6) + ' Z' }, g);
            var spin = kit.svg('g', {}, g);
            kit.svg('path', { 'class': 'grm-body' + (i === 0 ? ' grm-body--main' : ''), d: gearPath(T, R, L.bases[i], 1.0 * s, 1.15 * s) }, spin);
            kit.svg('circle', { 'class': 'grm-ring', cx: 0, cy: 0, r: R * 0.62 }, spin);
            var hand = kit.svg('g', { transform: 'rotate(' + q.marks[i].toFixed(3) + ')' }, spin);          /* 紅針：初始針角 */
            kit.svg('path', { 'class': 'grm-needle', d: 'M-5,0 L0,' + (-R * 0.9).toFixed(1) + ' L5,0 Z' }, hand);
            kit.svg('circle', { 'class': 'grm-hub', cx: 0, cy: 0, r: Math.max(6, R * 0.1) }, spin);
            rot.push(0); gears.push(spin); hands.push(hand);
        });
        var list = h('div', { 'class': 'grm-list' });
        list.style.top = (areaT + areaH + 8) + 'px';
        stage.appendChild(list);
        var tip2 = h('div', { 'class': 'qz-note grm-hint', text: '誤差要在 ' + q.tol + '° 內，放手就判定' });
        tip2.style.top = (areaT + areaH + 8) + 'px';
        stage.appendChild(tip2);

        var theta = 0, done = false, drag = null;
        function paint() { teeth.forEach(function (T, i) { gears[i].setAttribute('transform', 'rotate(' + rotOf(teeth, i, theta).toFixed(3) + ')'); }); }
        paint();
        api.timer(timeMs(level), function () { judge(); });
        if (level === 1 && kit.once('gearmark.hint')) kit.hintOn(stage, null, { mode: 'drag', x: cx[0], y: cy[0] - teeth[0] * s * 0.7, dx: teeth[0] * s * 0.7, dy: teeth[0] * s * 0.7, delay: 700, text: '在大齒輪上畫圈' });

        function ang(p) { return Math.atan2(p.x - cx[0], -(p.y - cy[0])) * 180 / Math.PI; }     /* 手指在大齒輪的哪個方向（從正上方順時針的度數） */
        svg.addEventListener('pointerdown', function (e) {
            if (done || api.over || drag) return;
            var p = kit.localPt(e, svg);
            if (kit.dist(p.x, p.y, cx[0], cy[0]) > teeth[0] * s * 1.25 + 10) return;           /* 只接大齒輪上（附近）的按下 */
            e.preventDefault();
            try { svg.setPointerCapture(e.pointerId); } catch (err) { }
            drag = { id: e.pointerId, a: ang(p), x: p.x, y: p.y, moved: 0 };
            stage.classList.add('grm-turning');
        });
        svg.addEventListener('pointermove', function (e) {
            if (!drag || e.pointerId !== drag.id || done) return;
            var p = kit.localPt(e, svg), a = ang(p);
            theta += wrap180(a - drag.a);                                                     /* 累加轉動量（不會因為轉過 360° 而跳回去） */
            drag.moved += kit.dist(p.x, p.y, drag.x, drag.y); drag.a = a; drag.x = p.x; drag.y = p.y;
            paint();
        });
        function release(e) {
            if (!drag || e.pointerId !== drag.id) return;
            var moved = drag.moved; drag = null; stage.classList.remove('grm-turning');
            if (moved >= MIN_TAP_MOVE) judge();
        }
        svg.addEventListener('pointerup', release);
        svg.addEventListener('pointercancel', release);

        /* 判定：每個齒輪的誤差逐一列出；全部在容許範圍內就過關 */
        function judge() {
            if (done || api.over) return;
            done = true; drag = null; stage.classList.remove('grm-turning');
            var errs = errors(q, theta), worst = Math.max.apply(null, errs), ok = worst <= q.tol, worstIdx = errs.indexOf(worst);
            tip2.style.display = 'none';
            errs.forEach(function (er, i) {
                var good = er <= q.tol;
                list.appendChild(h('div', { 'class': 'grm-row ' + (good ? 'grm-row--ok' : 'grm-row--bad'), text: '齒輪 ' + (i + 1) + '（' + teeth[i] + ' 齒）：差 ' + deg4(er) + ' 度' }));
                hands[i].firstChild.setAttribute('class', 'grm-needle ' + (good ? 'grm-needle--ok' : 'grm-needle--bad'));
            });
            if (ok) {
                stage.classList.add('grm-flash');
                kit.flash(stage, true, api.my);
                api.pass({ delay: 2000 });
                return;
            }
            kit.flash(stage, false, api.my);
            api.fail({ delay: 3200, lines: ['最大的誤差是齒輪 ' + (worstIdx + 1) + '：差了 ' + deg4(worst) + ' 度', '要在 ' + q.tol + ' 度以內才算對準（全部回到原位要轉 ' + q.period + ' 圈）'] });
        }
        api.solve = function () { theta = q.target; paint(); judge(); };
        api.wrong = function () { theta = q.target + 77; paint(); judge(); };
    }

    var G = {
        id: ID,
        name: '齒輪對記號',
        rule: '一串咬在一起的齒輪，每個齒輪上有一根紅針。**手指在最大的齒輪上畫圈**轉動它，其他齒輪跟著轉：相鄰的反方向、齒數少的轉得快。**讓所有紅針同時指向正上方**，放手就判定。每個齒輪轉得不一樣快，要轉到**剛好每個齒輪都回到原位的那一圈**才會全部對準。越後面，齒輪越多、允許的誤差越小！',
        mount: mount,
        score: SCORE,
        test: {
            nFor: nFor, tolFor: tolFor, periodMaxFor: periodMaxFor, timeMs: timeMs, wrap180: wrap180, wrap360: wrap360, gcd: gcd, lcm: lcm, rotOf: rotOf, ratioPeriod: ratioPeriod,
            errors: errors, solved: solved, makeLevel: makeLevel, layout: layout, meshSum: meshSum, gearPath: gearPath, deg4: deg4, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, GEARS: GEARS, TOL: TOL, PERIOD_MAX: PERIOD_MAX, TIME_S: TIME_S, T0_LIST: T0_LIST, TEETH_MIN: TEETH_MIN, TEETH_GAP: TEETH_GAP, TARGET_TURN: TARGET_TURN, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
