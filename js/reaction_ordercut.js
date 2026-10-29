/* ═══════════════════════════════════════════════════════════════════
   reaction_ordercut.js — 秒反應・照號切水果（企劃 377）
   一堆水果拋上來，每顆上面寫一個數字（1、2、3…）。**照號碼順序一顆一顆切**（用手指在畫面上劃過去）：先切 1、再切 2……
   **切錯順序就結束**，水果掉到畫面下面還沒被切到也結束。
   ───────────────────────────────────────────────────────────────────
   · 水果在空中的軌跡（fruitPos）：每顆水果從畫面下方拋出，走一條拋物線再掉下去，飛行時間 T（秒）；水平方向慢慢飄、整顆水果一直旋轉（所以 6 和 9 轉一轉會分不清——
     數字下面有一條底線，底線在下面的才是正的）。位置只由「時間」決定（不是一格一格累加），畫面和判定用同一個函式。
   · 保證切得完（makeLevel）：先排好一張「計畫切的時間表」c₁ < c₂ < … < c_N（相鄰間隔 GAP_CUT 秒左右），再決定每顆水果什麼時候拋：
     第 k 號水果在計畫切它的那一刻，剛好飛到整段飛行的 u 位置（u 在 [0.5 − 0.35·混亂度, 0.5 + 0.35·混亂度]，永遠落在 [0.15, 0.85] 之內）。
     所以每一顆在被計畫切的時間點一定在畫面上、離出現和落下都還有餘裕。混亂度越高，u 越分散，拋出的順序和號碼順序越不一樣（拋得越來越亂）。
   · 第 15 關起改成算式：每顆水果寫一個算式（2＋3、12÷4、6×7…），**照答案由小到大的順序切**；每顆算式的答案都不一樣；
     算式關卡的水果數重新從 5 顆開始往 15 顆增加；第 20 關起加入乘法和除法（除法一定整除）。
   · 切的判定（sliceSegment）：手指從上一點到這一點畫出一小段線；這一段線穿過（離線段 ≤ 水果半徑＋HIT_PAD）的水果，依「沿著線的順序」一顆一顆切。
     第一顆被切到的必須剛好是「下一號」，不是就失敗；一刀穿過兩顆（下一號、再下一號）是可以的。
   · 難度（線性，到 RAMP_LEVELS 關到頂）：飛行時間 2.8 → 1.8 秒、計畫切的間隔 0.8 → 0.4 秒、混亂度 0.1 → 1、旋轉速度 80 → 280 度／秒；水果數見上。
   · 揭曉：所有水果停在空中，每顆標上「第幾個要切」，切錯的那顆標紅、本來該切的那顆標綠（算式的也標出答案）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'ordercut';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var NUM_COUNT = [4, 15], NUM_RAMP = 14;     /* 數字關：水果數 4 → 15，在第 14 關到頂（之後維持 15；第 15 關起改成算式） */
    var EXPR_FROM = 15;                         /* 第幾關起改成算式 */
    var EXPR_COUNT = [5, 15], EXPR_RAMP = 15;   /* 算式關：水果數 5 → 15，從 EXPR_FROM 起算 15 關到頂 */
    var MULDIV_FROM = 20;                       /* 第幾關起算式加入 × 和 ÷ */
    var FLIGHT_S = [2.8, 1.8];                  /* 一顆水果從拋出到掉出畫面的時間（秒）：第 1 關 → 到頂 */
    var GAP_CUT = [0.8, 0.4];                   /* 計畫切的時間間隔（秒）：第 1 關 → 到頂 */
    var CHAOS = [0.1, 1];                       /* 混亂度（0～1）：第 1 關 → 到頂 */
    var OMEGA_DEG = [80, 280];                  /* 旋轉速度（度／秒）：第 1 關 → 到頂 */
    var U_MIN = 0.15, U_MAX = 0.85, U_SPREAD = 0.35;   /* 計畫切的時刻在飛行的哪個位置（比例）：中心 0.5、最多偏 U_SPREAD × 混亂度 */
    var APEX = [0.28, 0.62];                    /* 拋物線頂點的高度（占畫面高度的比例，從畫面底算起） */
    var VX = 70;                                /* 水平飄移速度的最大值（px／秒） */
    var R_NUM = 36, R_EXPR = 56;                /* 水果半徑（px）：數字關／算式關（算式字比較多，水果比較大） */
    var HIT_PAD = 8;                            /* 手指劃過去離水果邊緣這麼近也算切到（px） */
    var LEAD_S = 0.8;                           /* 開場等多久才拋第一顆（秒） */
    var MAX_LEVEL = 90;
    var FRUITS = 6;                             /* 水果的顏色種數（CSS 的 ocf-f0～5） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair, maxLevel) { return kit.ramp(level, pair[0], pair[1], maxLevel == null ? RAMP_LEVELS : maxLevel); }
    function isExpr(level) { return level >= EXPR_FROM; }
    function countFor(level) { return isExpr(level) ? Math.round(ramp(level - EXPR_FROM + 1, EXPR_COUNT, EXPR_RAMP)) : Math.round(ramp(level, NUM_COUNT, NUM_RAMP)); }
    function flightFor(level) { return Math.round(ramp(level, FLIGHT_S) * 1000) / 1000; }
    function gapFor(level) { return Math.round(ramp(level, GAP_CUT) * 1000) / 1000; }
    function chaosFor(level) { return Math.round(ramp(level, CHAOS) * 1000) / 1000; }
    function omegaFor(level) { return Math.round(ramp(level, OMEGA_DEG)); }
    function radiusFor(level, W) { return Math.round((isExpr(level) ? R_EXPR : R_NUM) * Math.min(1, (W || 472) / 472)); }
    /* 一個算式：{ text, value }。ops＝可用的運算（'+'、'-'、'*'、'/'），除法保證整除、減法不會是負數、答案在 1～99 */
    function makeExpr(ops, rand) {
        for (var tr = 0; tr < 200; tr++) {
            var op = kit.pick(ops, rand), a, b, v;
            if (op === '+') { a = kit.randInt(1, 60, rand); b = kit.randInt(1, 60, rand); v = a + b; return v <= 99 ? { text: a + '＋' + b, value: v } : makeExpr(ops, rand); }
            if (op === '-') { a = kit.randInt(5, 99, rand); b = kit.randInt(1, a - 1, rand); return { text: a + '－' + b, value: a - b }; }
            if (op === '*') { a = kit.randInt(2, 12, rand); b = kit.randInt(2, 12, rand); v = a * b; if (v <= 99) return { text: a + '×' + b, value: v }; continue; }
            b = kit.randInt(2, 12, rand); v = kit.randInt(1, Math.floor(99 / b), rand); return { text: (v * b) + '÷' + b, value: v };
        }
        return { text: '1＋1', value: 2 };
    }
    /* n 個「答案都不一樣」的算式 */
    function makeExprs(n, ops, rand) {
        var out = [], seen = {}, guard = 0;
        while (out.length < n && guard++ < 5000) { var e = makeExpr(ops, rand); if (!seen[e.value]) { seen[e.value] = 1; out.push(e); } }
        return out;
    }
    /* 出一關：{
         level, expr（是不是算式關）, N, flight（飛行時間）, plan（計畫切的時間 c₁…c_N，秒）,
         fruits（依「要切的順序」排好；每顆 { rank（1～N，要切的順序）, label（寫在水果上的字）, value（數字或算式的答案）, color, x0（0～1，占畫面寬）, vx（占畫面寬／秒）, A（拋物線高度，占畫面高）, t（拋出時間）, T（飛行時間）, u（計畫切的時刻在飛行的位置）, a0（起始角度）, w（旋轉速度，度／秒）}）} */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var expr = isExpr(level), N = countFor(level), T = flightFor(level), gap = gapFor(level), chaos = chaosFor(level), om = omegaFor(level), labels, values;
        if (expr) { var ops = level >= MULDIV_FROM ? ['+', '-', '*', '/'] : ['+', '-'], es = makeExprs(N, ops, rand); labels = es.map(function (e) { return e.text; }); values = es.map(function (e) { return e.value; }); }
        else { values = []; for (var i = 1; i <= N; i++) values.push(i); labels = values.map(String); }
        /* 照答案由小到大排：第 k 個要切的是第 k 小的 */
        var idx = values.map(function (v, i) { return i; }).sort(function (a, b) { return values[a] - values[b]; });
        var plan = [], c = T * U_MAX + 0.2, fruits = [];
        for (var k = 0; k < N; k++) {
            if (k > 0) c += gap * kit.randFloat(0.85, 1.2, rand);
            plan.push(Math.round(c * 1000) / 1000);
            var j = idx[k], u = kit.clamp(0.5 + (rand() * 2 - 1) * U_SPREAD * chaos, U_MIN, U_MAX);
            var sg = rand() < 0.5 ? -1 : 1, x0 = kit.randFloat(0.18, 0.82, rand);
            fruits.push({ rank: k + 1, label: labels[j], value: values[j], color: kit.randInt(0, FRUITS - 1, rand), x0: Math.round(x0 * 1000) / 1000, vx: Math.round(sg * kit.randFloat(0.02, VX / 472, rand) * 1000) / 1000,
                A: Math.round(kit.randFloat(APEX[0], APEX[1], rand) * 1000) / 1000, t: Math.round((plan[k] - u * T) * 1000) / 1000, T: T, u: Math.round(u * 1000) / 1000, a0: Math.round(kit.randFloat(0, 360, rand)), w: Math.round((rand() < 0.5 ? -1 : 1) * kit.randFloat(om * 0.6, om, rand)) });
        }
        return { level: level, expr: expr, N: N, flight: T, plan: plan, fruits: fruits };
    }
    /* 水果 f 在時間 t 的位置：geom ＝ { W, H, R }；飛行之外（還沒拋、已經掉出去）回傳 null。
       飛行進度 u ＝ (t − 拋出時間) ÷ 飛行時間（0～1）。
       x：W·x0 ＋ W·vx·(t − 拋出時間)，限制在 R～W−R 之內（不會飄出左右邊界）；
       y（水果中心）：從畫面底下 yb ＝ H ＋ R 拋出、再掉回 yb；中間走拋物線 y ＝ yb − 4·(A·H)·u·(1−u)，頂點（u＝0.5）在 yb − A·H。 */
    function fruitPos(f, t, geom) {
        var tau = t - f.t; if (tau < 0 || tau > f.T) return null;
        var u = tau / f.T, yb = geom.H + geom.R, y = yb - 4 * (f.A * geom.H) * u * (1 - u);
        var x = geom.W * f.x0 + geom.W * f.vx * tau; x = Math.max(geom.R, Math.min(geom.W - geom.R, x));
        return { x: x, y: y, ang: f.a0 + f.w * tau, u: u };
    }
    /* 這個位置的水果有沒有在畫面上（至少有一半露出來） */
    function onScreen(p, geom) { return p && p.y <= geom.H + geom.R * 0.2 && p.y >= -geom.R; }
    /* 點到線段的距離 */
    function distToSeg(px, py, ax, ay, bx, by) {
        var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, s = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
        return { d: Math.hypot(px - (ax + s * dx), py - (ay + s * dy)), s: s };
    }
    /* 手指這一段線（a→b）切到的水果：依沿著線的順序（s 由小到大）；cand＝[{ id, x, y }]，R＝水果半徑 */
    function sliceSegment(cand, ax, ay, bx, by, R) {
        var hits = [];
        cand.forEach(function (c) { var r = distToSeg(c.x, c.y, ax, ay, bx, by); if (r.d <= R + HIT_PAD) hits.push({ id: c.id, s: r.s, d: r.d }); });
        hits.sort(function (p, q) { return p.s - q.s || p.d - q.d; });
        return hits.map(function (x) { return x.id; });
    }
    /* 切到 hitIds（依順序）而「下一號」是 next：回傳 { ok（有沒有照順序）, cut（切成功的顆數）, wrong（切錯的那一顆，沒有就 null）} */
    function judgeCuts(hitIds, next, rankOf) {
        var cut = 0, n = next;
        for (var i = 0; i < hitIds.length; i++) { if (rankOf(hitIds[i]) !== n) return { ok: false, cut: cut, wrong: hitIds[i] }; cut++; n++; }
        return { ok: true, cut: cut, wrong: null };
    }
    function whyText(kind, q, expected, got) {
        if (kind === 'wrong') return '切錯順序了！先要切「' + expected.label + '」' + (q.expr ? '（答案 ' + expected.value + '）' : '') + '，你切了「' + got.label + '」' + (q.expr ? '（答案 ' + got.value + '）' : '');
        return '「' + expected.label + '」' + (q.expr ? '（答案 ' + expected.value + '）' : '') + '掉下去了，還沒被切到';
    }
    function rating(n) {
        if (n >= 20) return '切水果大師！';
        if (n >= 12) return '眼明手快！';
        if (n >= 6) return '不錯喔！';
        if (n >= 2) return '再接再厲！';
        return '照號碼順序一顆一顆切！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'ocf-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand);
        api.info = q;
        console.log('[照號切水果] 第 ' + level + ' 關：' + (q.expr ? '算式' : '數字') + '、' + q.N + ' 顆；飛行 ' + q.flight + ' 秒；計畫切的時間 ' + q.plan.map(function (v) { return v.toFixed(1); }).join('、') + '；混亂度 ' + chaosFor(level));

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640, R = radiusFor(level, W), geom = { W: W, H: H, R: R };
        var field = h('div', { 'class': 'ocf-field' });
        stage.appendChild(field);
        var tip = h('div', { 'class': 'qz-note ocf-tip', text: q.expr ? '照答案由小到大，一顆一顆切！' : (level === 1 ? '照號碼 1、2、3… 的順序，用手指劃過去切！' : '照號碼順序切（6 和 9 看底線）') });
        field.appendChild(tip);
        var next = h('div', { 'class': 'ocf-next', text: '下一個：' + (q.expr ? '最小的' : '1') }); field.appendChild(next);
        var svg = kit.svg('svg', { 'class': 'ocf-trail', width: W, height: H, viewBox: '0 0 ' + W + ' ' + H }, field), trail = kit.svg('polyline', { 'class': 'ocf-trail__l', points: '' }, svg);
        var els = q.fruits.map(function (f, i) {
            var el = h('div', { 'class': 'ocf-fruit ocf-f' + f.color + (q.expr ? ' ocf-fruit--expr' : '') });
            el.style.cssText = 'width:' + 2 * R + 'px;height:' + 2 * R + 'px;display:none;';
            el.appendChild(h('div', { 'class': 'ocf-leaf' }));
            el.appendChild(h('div', { 'class': 'ocf-label', text: f.label }));
            field.appendChild(el); return el;
        });
        var state = q.fruits.map(function () { return 'wait'; });       /* 'wait'（還沒拋）｜'fly'（在空中）｜'cut'（已切）｜'gone'（掉出去了） */
        var nextRank = 1, phase = 'play', t0 = performance.now() + LEAD_S * 1000, pts = [], down = null, tFreeze = 0, posOf = [];
        function nowT() { return (performance.now() - t0) / 1000; }
        function rankOf(id) { return q.fruits[id].rank; }
        function expectedFruit() { return q.fruits[nextRank - 1]; }
        function paint(t) {
            q.fruits.forEach(function (f, i) {
                if (state[i] === 'cut' || state[i] === 'gone') return;
                var p = fruitPos(f, t, geom); posOf[i] = p;
                if (!p) { els[i].style.display = 'none'; return; }
                els[i].style.display = 'block'; els[i].style.transform = 'translate3d(' + (p.x - R).toFixed(1) + 'px,' + (p.y - R).toFixed(1) + 'px,0) rotate(' + p.ang.toFixed(1) + 'deg)';
                state[i] = 'fly';
            });
        }
        /* api.over：這一關已經結束（例如測試用 debug.goto 跳關）就不要再動作——kit 的 api.fail／api.pass 是對「目前這一關」生效，舊關卡的迴圈如果還在跑會誤殺新的一關 */
        api.my.loop(function (now) {
            if (phase !== 'play' || api.over || !stage.isConnected) return false;
            var t = nowT(); paint(t);
            /* 掉出畫面還沒被切：失敗 */
            for (var i = 0; i < q.fruits.length; i++) if (state[i] === 'fly' && t > q.fruits[i].t + q.fruits[i].T - 0.02) { state[i] = 'gone'; els[i].style.display = 'none'; lost(i); return; }
        });
        /* 保底：rAF 被暫停時，用計時器檢查有沒有水果掉出去 */
        (function guard() { api.after(300, function () { if (phase !== 'play' || api.over) return; var t = nowT(); for (var i = 0; i < q.fruits.length; i++) if (state[i] !== 'cut' && state[i] !== 'gone' && t > q.fruits[i].t + q.fruits[i].T + 0.05) { state[i] = 'gone'; lost(i); return; } guard(); }); })();
        if (level === 1 && kit.once('ordercut.hint')) api.after(Math.round((LEAD_S + q.plan[0] - 0.9) * 1000), function () {
            if (phase !== 'play') return; var f = q.fruits[0], p = fruitPos(f, q.plan[0] - 0.4, geom) || { x: W / 2, y: H / 2 };
            kit.hintOn(stage, null, { mode: 'drag', x: Math.max(40, p.x - 90), y: p.y, dx: 180, dy: 0, delay: 100, text: '劃過 1 號水果' });
        });

        /* 手指劃過畫面：每一小段線檢查切到哪些水果 */
        field.addEventListener('pointerdown', function (e) {
            if (phase !== 'play' || api.over || down) return;
            e.preventDefault(); try { field.setPointerCapture(e.pointerId); } catch (err) { }
            var p = kit.localPt(e, field); down = { id: e.pointerId, x: p.x, y: p.y }; pts = [[p.x, p.y]]; drawTrail();
        });
        field.addEventListener('pointermove', function (e) {
            if (!down || e.pointerId !== down.id || phase !== 'play') return;
            var p = kit.localPt(e, field); slice(down.x, down.y, p.x, p.y); down.x = p.x; down.y = p.y; pts.push([p.x, p.y]); if (pts.length > 10) pts.shift(); drawTrail();
        });
        function up(e) { if (down && e.pointerId === down.id) { down = null; api.after(160, function () { pts = []; drawTrail(); }); } }
        field.addEventListener('pointerup', up); field.addEventListener('pointercancel', up);
        function drawTrail() { trail.setAttribute('points', pts.map(function (p) { return p[0].toFixed(0) + ',' + p[1].toFixed(0); }).join(' ')); }
        function slice(ax, ay, bx, by) {
            var t = nowT(), cand = [];
            q.fruits.forEach(function (f, i) { if (state[i] !== 'fly') return; var p = fruitPos(f, t, geom); if (onScreen(p, geom)) cand.push({ id: i, x: p.x, y: p.y }); });
            var hits = sliceSegment(cand, ax, ay, bx, by, R); if (!hits.length) return;
            var r = judgeCuts(hits, nextRank, rankOf);
            for (var k = 0; k < r.cut; k++) cutFruit(hits[k]);
            if (!r.ok) wrongCut(r.wrong);
            else if (nextRank > q.N) win();
        }
        function cutFruit(i) {
            state[i] = 'cut'; nextRank++; Sfx.play('click');
            var p = posOf[i] || fruitPos(q.fruits[i], nowT(), geom); els[i].style.display = 'none';
            if (p) [-1, 1].forEach(function (s) { var half = h('div', { 'class': 'ocf-half ocf-f' + q.fruits[i].color + (s < 0 ? ' ocf-half--l' : ' ocf-half--r') }); half.style.cssText = 'width:' + R + 'px;height:' + 2 * R + 'px;left:' + (p.x - (s < 0 ? R : 0)).toFixed(1) + 'px;top:' + (p.y - R).toFixed(1) + 'px;'; field.appendChild(half); api.after(30, function () { half.style.transform = 'translate(' + (s * 40) + 'px,60px) rotate(' + (s * 40) + 'deg)'; half.style.opacity = '0'; }); api.after(700, function () { if (half.parentNode) half.parentNode.removeChild(half); }); });
            next.textContent = nextRank > q.N ? '全部切完！' : '下一個：' + (q.expr ? '第 ' + nextRank + ' 小的' : q.fruits[nextRank - 1].label);
        }
        function win() {
            if (phase !== 'play' || api.over) return; phase = 'end'; info('全部照順序切完了！', true);
            kit.flash(stage, true, api.my); Sfx.play('ok'); api.pass({ delay: 1500 });
        }
        function wrongCut(id) { fail('wrong', q.fruits[id], id); }
        function lost(i) { fail('lost', q.fruits[i], i); }
        function info(text, ok) { var el = h('div', { 'class': 'qz-note ocf-info ' + (ok ? 'ocf-info--ok' : 'ocf-info--bad'), text: text }); field.appendChild(el); }
        /* 結束：所有水果停在空中，每顆標上「第幾個要切」，切錯的標紅、本來該切的標綠 */
        function fail(kind, got, gotId) {
            if (phase !== 'play' || api.over) return; phase = 'end'; tFreeze = nowT();
            var exp = expectedFruit(), why = whyText(kind, q, kind === 'lost' ? got : exp, got);
            q.fruits.forEach(function (f, i) {
                if (state[i] === 'cut' || state[i] === 'gone') return;                    /* 已經切掉的、掉出去的不畫 */
                var p = fruitPos(f, tFreeze, geom); if (!p || !onScreen(p, geom)) return;
                els[i].style.display = 'block'; els[i].style.transform = 'translate3d(' + (p.x - R).toFixed(1) + 'px,' + (p.y - R).toFixed(1) + 'px,0) rotate(0deg)';
                var b = h('div', { 'class': 'ocf-badge' + (i === gotId && kind === 'wrong' ? ' ocf-badge--bad' : (f.rank === nextRank ? ' ocf-badge--ok' : '')), text: '第 ' + f.rank + (q.expr ? '＝' + f.value : '') }); b.style.cssText = 'left:' + (p.x - 36).toFixed(1) + 'px;top:' + (p.y + R * 0.4).toFixed(1) + 'px;'; field.appendChild(b);
                if (i === gotId && kind === 'wrong') els[i].classList.add('ocf-fruit--bad'); else if (f.rank === nextRank) els[i].classList.add('ocf-fruit--ok');
            });
            if (kind === 'lost') { els[gotId].style.display = 'none'; }
            info(why, false); kit.flash(stage, false, api.my);
            api.fail({ delay: 4000, lines: [why, '已經照順序切了 ' + (nextRank - 1) + ' 顆（一共 ' + q.N + ' 顆）', q.expr ? '答案由小到大：' + q.fruits.map(function (f) { return f.value; }).join('、') : '順序：1 到 ' + q.N] });
        }
        /* 驗證用：在計畫的時間依序切（solve，直接呼叫切水果）；故意先切第 2 號（wrong）；只排一次 */
        var armed = false;
        api.solve = function () {
            if (armed || phase !== 'play') return; armed = true;
            q.fruits.forEach(function (f, k) { api.after(Math.max(0, Math.round((q.plan[k] - nowT()) * 1000)), function () { if (phase !== 'play') return; var i = f.rank - 1; if (state[i] !== 'fly') { paint(nowT()); } if (nextRank === f.rank && state[i] === 'fly') { cutFruit(i); if (nextRank > q.N) win(); } }); });
        };
        api.wrong = function () {
            if (armed || phase !== 'play') return; armed = true;
            api.after(Math.max(0, Math.round((q.plan[0] - nowT()) * 1000)), function () { if (phase !== 'play') return; paint(nowT()); var i = Math.min(1, q.N - 1); if (q.fruits[i].rank !== nextRank && state[i] === 'fly') wrongCut(i); else if (state[i] !== 'fly') { state[i] = 'fly'; wrongCut(i); } });
        };
    }

    var G = {
        id: ID,
        name: '照號切水果',
        rule: '水果一顆一顆拋上來，每顆上面寫一個數字。**照號碼 1、2、3… 的順序**，用手指在畫面上劃過去切它。**切錯順序就結束**，水果掉到畫面下面還沒切到也結束。水果會在空中旋轉，**6 和 9 看底線**（底線在下面才是正的）。**第 15 關起**，水果上面改成算式（像「2＋3」「12÷4」），要照答案由小到大的順序切！',
        mount: mount,
        score: SCORE,
        test: {
            isExpr: isExpr, countFor: countFor, flightFor: flightFor, gapFor: gapFor, chaosFor: chaosFor, omegaFor: omegaFor, radiusFor: radiusFor, makeExpr: makeExpr, makeExprs: makeExprs, makeLevel: makeLevel, fruitPos: fruitPos, onScreen: onScreen, distToSeg: distToSeg, sliceSegment: sliceSegment, judgeCuts: judgeCuts, whyText: whyText, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, NUM_COUNT: NUM_COUNT, NUM_RAMP: NUM_RAMP, EXPR_FROM: EXPR_FROM, EXPR_COUNT: EXPR_COUNT, EXPR_RAMP: EXPR_RAMP, MULDIV_FROM: MULDIV_FROM, FLIGHT_S: FLIGHT_S, GAP_CUT: GAP_CUT, CHAOS: CHAOS, OMEGA_DEG: OMEGA_DEG, U_MIN: U_MIN, U_MAX: U_MAX, U_SPREAD: U_SPREAD, APEX: APEX, VX: VX, R_NUM: R_NUM, R_EXPR: R_EXPR, HIT_PAD: HIT_PAD, LEAD_S: LEAD_S, MAX_LEVEL: MAX_LEVEL, FRUITS: FRUITS
        }
    };
    Reaction.register(G);
})();
