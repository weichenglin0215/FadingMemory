/* ═══════════════════════════════════════════════════════════════════
   reaction_rotary.js — 秒反應・轉盤電話（企劃 309）
   上方閃過一組電話號碼（3 → 2 秒），然後收起來。下面是一台老式轉盤電話：**手指伸進數字的洞，順時針畫圈拉到金屬擋片，放手，轉盤自己轉回來**，
   就撥了一個數字。照順序把號碼撥完。撥錯一碼就結束。
   ───────────────────────────────────────────────────────────────────
   · 轉盤的幾何（角度都是從正上方起算、順時針為正）：金屬擋片固定在 STOP_ANGLE（右下方）。數字 d 的洞，要把轉盤順時針轉 rotationFor(d) 度，
     洞才會轉到擋片的位置：數字 1 轉 60°、每多一個數字多轉 27°（9 轉 276°），0 排在最後（轉 303°）——離擋片越遠的數字，要轉越大一圈（真的轉盤也是這樣）。
     洞在轉盤上的位置 = STOP_ANGLE − rotationFor(d)。
   · 撥號：手指按在洞裡（hitHole），轉盤跟著手指繞中心轉（累加手指的角度變化，只能順時針，轉到擋片就卡住）；放手時轉到底（差 PULL_TOL 度以內）才算撥了這個數字，
     沒轉到底就彈回去（不算）。算撥了之後，轉盤用固定的速度（RETURN_DEG_S 度／秒）自己轉回來，每轉 30° 發出一聲「嗒」——**轉回來的時候不能撥**，
     所以撥 0（轉得最多）要等最久（returnTimeMs），這段時間要靠記憶撐住後面的號碼。
   · 號碼（makeLevel）：長度 3 → 10 碼（DIGITS）；看的時間 3 → 2 秒（VIEW_S）；容易混的數字串隨關卡增加：
     連續相同的數字（「22」、「2255」）、頭尾相同的短串（「0920」對「0902」那種：a b c a，只差中間兩碼的順序）。
   · 撥錯一碼就結束：把正確號碼和你撥的並排，錯的那一碼標紅。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'rotary';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 24;                       /* 幾關之後難度到頂 */
    var DIGITS = [3, 10];                       /* 號碼長度：第 1 關 → 到頂 */
    var VIEW_S = [3, 2];                        /* 號碼閃現的時間（秒）：第 1 關 → 到頂 */
    var REPEATS = [0, 2];                       /* 號碼裡「連續相同數字」的組數：第 1 關 → 到頂 */
    var MIRRORS = [0, 2];                       /* 號碼裡「a b c a」型（頭尾相同、中間容易順序弄反）的組數：第 1 關 → 到頂 */
    var STOP_ANGLE = 120;                       /* 金屬擋片的位置（度，從正上方順時針；120＝右下方） */
    var ROT_FIRST = 60, ROT_STEP = 27;          /* 數字 1 要轉幾度、每多一個數字多轉幾度（0 當作第 10 個） */
    var PULL_TOL = 8;                           /* 放手時離擋片差幾度以內算「拉到底」 */
    var RETURN_DEG_S = 240;                     /* 轉盤自己轉回來的速度（度／秒） */
    var TICK_DEG = 30;                          /* 轉回來時每轉幾度發一聲「嗒」 */
    var HOLE_R = 25;                            /* 手指洞的半徑（px，在標準大小的轉盤上；實際依畫面縮放） */
    var MAX_LEVEL = 60;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }
    function digitsFor(level) { return Math.round(ramp(level, DIGITS)); }
    function viewMs(level) { return Math.round(ramp(level, VIEW_S) * 1000); }
    function repeatsFor(level) { return Math.round(ramp(level, REPEATS)); }
    function mirrorsFor(level) { return Math.round(ramp(level, MIRRORS)); }
    function wrap180(a) { var x = ((a + 180) % 360 + 360) % 360 - 180; return x === -180 ? 180 : x; }
    function wrap360(a) { return ((a % 360) + 360) % 360; }
    /* 撥數字 d 要把轉盤順時針轉幾度（1 最少、0 最多） */
    function rotationFor(d) { var k = d === 0 ? 10 : d; return ROT_FIRST + (k - 1) * ROT_STEP; }
    /* 數字 d 的洞，在轉盤沒轉的時候的位置（度，從正上方順時針）：轉 rotationFor(d) 度之後剛好到擋片 */
    function holeAngle(d) { return wrap360(STOP_ANGLE - rotationFor(d)); }
    /* 轉盤自己轉回來要多久（毫秒）：轉越多越久 */
    function returnTimeMs(d) { return Math.round(rotationFor(d) / RETURN_DEG_S * 1000); }
    /* 放手時轉了 rot 度：算不算「拉到底」（撥了數字 d） */
    function isDialed(rot, d) { return rot >= rotationFor(d) - PULL_TOL; }
    /* 點在 (x, y)，轉盤現在轉了 rot 度，落在哪個數字的洞裡（沒有回傳 −1）；center 是轉盤中心、ring 是洞所在的圓的半徑、holeR 是洞的半徑 */
    function hitHole(x, y, cx, cy, ring, holeR, rot) {
        for (var d = 0; d <= 9; d++) {
            var a = (holeAngle(d) + rot) * Math.PI / 180, hx = cx + ring * Math.sin(a), hy = cy - ring * Math.cos(a);
            if (Math.hypot(x - hx, y - hy) <= holeR) return d;
        }
        return -1;
    }
    /* 點相對於轉盤中心的方向（度，從正上方順時針） */
    function angleOf(x, y, cx, cy) { return Math.atan2(x - cx, -(y - cy)) * 180 / Math.PI; }
    /* 號碼裡「連續相同數字」的組數（22 算 1 組、222 算 2 組…簡單用相鄰相同的對數） */
    function repeatCount(num) { var n = 0; for (var i = 1; i < num.length; i++) if (num[i] === num[i - 1]) n++; return n; }
    /* 號碼裡「a b c a」型（第 i 碼和第 i+3 碼相同，而中間兩碼不同於 a）的個數 */
    function mirrorCount(num) { var n = 0; for (var i = 0; i + 3 < num.length; i++) if (num[i] === num[i + 3] && num[i + 1] !== num[i] && num[i + 2] !== num[i] && num[i + 1] !== num[i + 2]) n++; return n; }
    /* 長度 len 的號碼裡，最多放得下幾組（連續相同要 2 碼、a b c a 型要 4 碼；不重疊）：回傳實際能放的 { reps, mirrors } */
    function feasible(len, reps, mirrors) {
        var m = Math.max(0, Math.min(mirrors, Math.floor(len / 4))), r = Math.max(0, Math.min(reps, Math.floor((len - 4 * m) / 2)));
        return { reps: r, mirrors: m };
    }
    /* 出一組號碼（字串）：長度 len，含至少 reps 組連續相同、mirrors 組 a b c a 型（放不下的組數會自動減少，見 feasible）。
       做法：把「a b c a」（4 碼）、「x x」（2 碼）、單獨的一碼當成積木，隨機排順序再填數字；回傳 { num, reps, mirrors, want } */
    function makeNumber(len, reps, mirrors, rand) {
        rand = rand || Math.random;
        var f = feasible(len, reps, mirrors), segs = [], i;
        for (i = 0; i < f.mirrors; i++) segs.push(4);
        for (i = 0; i < f.reps; i++) segs.push(2);
        for (i = len - f.mirrors * 4 - f.reps * 2; i > 0; i--) segs.push(1);
        segs = kit.shuffle(segs, rand);
        var d = [];
        segs.forEach(function (n) {
            if (n === 4) {
                var a = kit.randInt(0, 9, rand), b, c;
                do { b = kit.randInt(0, 9, rand); } while (b === a);
                do { c = kit.randInt(0, 9, rand); } while (c === a || c === b);
                d.push(a, b, c, a);
            } else if (n === 2) { var x = kit.randInt(0, 9, rand); d.push(x, x); }
            else d.push(kit.randInt(0, 9, rand));
        });
        var num = d.join('');
        return { num: num, reps: repeatCount(num), mirrors: mirrorCount(num), want: f };
    }
    /* 出一關：{ num（號碼字串）, len, viewMs, reps, mirrors, level } */
    function makeLevel(level, rand) {
        var len = digitsFor(level), nm = makeNumber(len, repeatsFor(level), mirrorsFor(level), rand);
        return { num: nm.num, len: len, viewMs: viewMs(level), reps: nm.reps, mirrors: nm.mirrors, want: nm.want, level: level };
    }
    function rating(n) {
        if (n >= 20) return '電話總機！';
        if (n >= 12) return '記性很好！';
        if (n >= 7) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '邊看邊在心裡唸出來！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'rtr-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 轉盤上的洞所在的圓：位置 (cx + ring·sin a, cy − ring·cos a) */
    function polar(cx, cy, r, deg) { var a = deg * Math.PI / 180; return [cx + r * Math.sin(a), cy - r * Math.cos(a)]; }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand), len = q.len;
        api.info = q;
        console.log('[轉盤電話] 第 ' + level + ' 關：號碼 ' + q.num + '（' + len + ' 碼，連續相同 ' + q.reps + ' 組、abca 型 ' + q.mirrors + ' 組）；看 ' + q.viewMs + ' ms');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var R = Math.min(W / 2 - 18, (H - 300) / 2, 190), cx = W / 2, cy = H - R - 18, ring = R * 0.72, holeR = R * 0.135, sc = R / 190;
        var field = h('div', { 'class': 'rtr-field' });
        stage.appendChild(field);
        var tip = h('div', { 'class': 'qz-note rtr-tip', text: '記住號碼，等一下照順序撥出來' });
        field.appendChild(tip);
        var numEl = h('div', { 'class': 'rtr-num', text: q.num.split('').join(' ') });
        field.appendChild(numEl);
        var gotEl = h('div', { 'class': 'rtr-got', text: '' });
        field.appendChild(gotEl);
        var info = h('div', { 'class': 'qz-note rtr-info', text: '' });
        field.appendChild(info);

        /* 轉盤（SVG）：固定的底板（黑色，上面印著數字）→ 會轉的金屬盤（挖了十個洞）→ 固定的擋片 → 中心蓋子 */
        var svg = kit.svg('svg', { 'class': 'rtr-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, field);
        kit.svg('circle', { 'class': 'rtr-plate', cx: cx, cy: cy, r: R }, svg);
        for (var d = 0; d <= 9; d++) {
            var pp = polar(cx, cy, ring, holeAngle(d));
            var t = kit.svg('text', { 'class': 'rtr-digit', x: pp[0], y: pp[1] + R * 0.07, 'text-anchor': 'middle' }, svg); t.textContent = String(d);
            t.style.fontSize = Math.round(R * 0.2) + 'px';
        }
        var disc = kit.svg('g', { 'class': 'rtr-disc' }, svg);
        var holes = ''; for (var k = 0; k <= 9; k++) { var hp = polar(cx, cy, ring, holeAngle(k)); holes += 'M' + (hp[0] + holeR).toFixed(2) + ',' + hp[1].toFixed(2) + ' a' + holeR.toFixed(2) + ',' + holeR.toFixed(2) + ' 0 1,0 ' + (-2 * holeR).toFixed(2) + ',0 a' + holeR.toFixed(2) + ',' + holeR.toFixed(2) + ' 0 1,0 ' + (2 * holeR).toFixed(2) + ',0 Z '; }
        var body = kit.svg('path', { 'class': 'rtr-metal', 'fill-rule': 'evenodd', d: 'M' + (cx + R * 0.98) + ',' + cy + ' a' + R * 0.98 + ',' + R * 0.98 + ' 0 1,0 ' + (-2 * R * 0.98) + ',0 a' + R * 0.98 + ',' + R * 0.98 + ' 0 1,0 ' + (2 * R * 0.98) + ',0 Z ' + holes }, disc);
        kit.svg('circle', { 'class': 'rtr-rim', cx: cx, cy: cy, r: R * 0.98 }, disc);
        var sp0 = polar(cx, cy, R * 0.9, STOP_ANGLE), sp1 = polar(cx, cy, R * 1.04, STOP_ANGLE);
        kit.svg('line', { 'class': 'rtr-stop', x1: sp0[0], y1: sp0[1], x2: sp1[0], y2: sp1[1] }, svg);
        kit.svg('circle', { 'class': 'rtr-cap', cx: cx, cy: cy, r: R * 0.2 }, svg);
        var holeEls = [];
        for (var m = 0; m <= 9; m++) { var hh = polar(cx, cy, ring, holeAngle(m)); holeEls[m] = kit.svg('circle', { 'class': 'rtr-hole', cx: hh[0], cy: hh[1], r: holeR, 'data-d': m }, disc); }

        var rot = 0, grabbed = -1, drag = null, busy = true, step = 0, over = false, done = false, loop = null;
        function paint() { disc.setAttribute('transform', 'rotate(' + rot.toFixed(2) + ' ' + cx + ' ' + cy + ')'); }
        paint();
        function placeholders() { return q.num.split('').map(function (c, i) { return i < step ? c : '＿'; }).join(' '); }
        /* 看號碼 */
        info.textContent = '看 ' + (q.viewMs / 1000).toFixed(0) + ' 秒';
        api.timer(q.viewMs, begin);
        if (level === 1 && kit.once('rotary.hint')) {
            var p0 = polar(cx, cy, ring, holeAngle(Number(q.num[0]))), tgt = polar(cx, cy, ring, STOP_ANGLE);
            api.after(q.viewMs + 300, function () { kit.hintOn(stage, null, { mode: 'drag', x: p0[0], y: p0[1], dx: tgt[0] - p0[0], dy: tgt[1] - p0[1], text: '手指伸進洞，順時針拉到底' }); });
        }
        function begin() {
            numEl.textContent = placeholders(); numEl.classList.add('rtr-num--hidden'); tip.textContent = '照順序撥號（順時針拉到底）';
            info.textContent = ''; busy = false;
        }
        svg.addEventListener('pointerdown', function (e) {
            if (busy || over || done || api.over || drag) return;
            var p = kit.localPt(e, svg), d2 = hitHole(p.x, p.y, cx, cy, ring, holeR + 8 * sc, rot);
            if (d2 < 0) return;
            e.preventDefault();
            try { svg.setPointerCapture(e.pointerId); } catch (err) { }
            drag = { id: e.pointerId, d: d2, a: angleOf(p.x, p.y, cx, cy) };
            holeEls[d2].classList.add('rtr-hole--on');
        });
        svg.addEventListener('pointermove', function (e) {
            if (!drag || e.pointerId !== drag.id) return;
            var p = kit.localPt(e, svg), a = angleOf(p.x, p.y, cx, cy);
            rot = kit.clamp(rot + wrap180(a - drag.a), 0, rotationFor(drag.d)); drag.a = a;     /* 只能順時針，轉到擋片就卡住 */
            paint();
        });
        function release(e) {
            if (!drag || e.pointerId !== drag.id) return;
            var d2 = drag.d; drag = null; holeEls[d2].classList.remove('rtr-hole--on');
            if (isDialed(rot, d2)) dial(d2);
            else { busy = true; info.textContent = '要拉到金屬擋片才算！'; springBack(0.25, function () { busy = false; }); }
        }
        svg.addEventListener('pointerup', release);
        svg.addEventListener('pointercancel', release);
        /* 轉盤轉回來：固定速度，每 TICK_DEG 度「嗒」一聲；轉回來的時候不能撥 */
        function springBack(fast, onEnd) {
            var lastTick = rot;
            loop = api.my.loop(function (now, dt) {
                if (!svg.isConnected) return false;
                var dd = (fast ? RETURN_DEG_S * 1.6 : RETURN_DEG_S) * Math.min(dt, 50) / 1000;
                rot = Math.max(0, rot - dd); paint();
                if (!fast && lastTick - rot >= TICK_DEG) { Sfx.play('tick'); lastTick = rot; }
                if (rot <= 0) { onEnd(); return false; }
            });
        }
        function dial(d2) {
            if (over || done) return;
            busy = true; info.textContent = '';
            var ok = String(d2) === q.num[step];
            if (!ok) { fail(d2); return; }
            step++; numEl.textContent = placeholders(); gotEl.textContent = '';
            springBack(false, function () {
                if (step >= len) { done = true; numEl.classList.remove('rtr-num--hidden'); numEl.classList.add('rtr-num--ok'); info.textContent = '撥通了！'; kit.flash(stage, true, api.my); api.pass({ delay: 1400 }); return; }
                busy = false;
            });
        }
        /* 撥錯了：把正確號碼和你撥的並排，錯的那一碼標紅 */
        function fail(wrong) {
            over = true;
            var right = q.num.split(''), mine = q.num.slice(0, step).split('').concat([String(wrong)]);
            numEl.classList.remove('rtr-num--hidden');
            numEl.innerHTML = ''; numEl.appendChild(h('div', { 'class': 'rtr-cmp__label', text: '正確號碼' }));
            numEl.appendChild(h('div', { 'class': 'rtr-cmp' }, right.map(function (c, i) { return h('span', { 'class': 'rtr-cmp__d' + (i === step ? ' rtr-cmp__d--ok' : ''), text: c }); })));
            gotEl.innerHTML = ''; gotEl.appendChild(h('div', { 'class': 'rtr-cmp__label', text: '你撥的' }));
            gotEl.appendChild(h('div', { 'class': 'rtr-cmp' }, mine.map(function (c, i) { return h('span', { 'class': 'rtr-cmp__d' + (i === step ? ' rtr-cmp__d--bad' : ''), text: c }); })));
            info.textContent = '第 ' + (step + 1) + ' 碼撥錯了：應該是 ' + q.num[step] + '，你撥了 ' + wrong;
            springBack(true, function () { });
            kit.flash(stage, false, api.my);
            api.fail({ delay: 3600, lines: ['第 ' + (step + 1) + ' 碼撥錯了：應該是 ' + q.num[step] + '，你撥了 ' + wrong, '號碼是 ' + q.num] });
        }
        var solving = false;                                                       /* 驗證用的 solve 可能被重複呼叫：只跑一次 */
        api.solve = function () { if (solving || over || done) return; solving = true; rot = 0; doSolve(); };
        function doSolve() {
            /* 驗證用：一次撥完（每碼直接進 dial；轉盤回轉動畫仍然會跑，所以不能同時呼叫多次，改成依序等待） */
            var i = 0;
            (function next() {
                if (i >= len || over || done) return;
                busy = false; var d2 = Number(q.num[i]); rot = rotationFor(d2); paint(); i++;
                dial(d2);
                api.after(returnTimeMs(d2) + 80, next);
            })();
        }
        api.wrong = function () { if (over || done || solving) return; busy = false; var d2 = (Number(q.num[0]) + 1) % 10; rot = rotationFor(d2); paint(); dial(d2); };
    }

    var G = {
        id: ID,
        name: '轉盤電話',
        rule: '上方會閃過一組電話號碼，然後收起來。下面是一台老式轉盤電話：**手指伸進數字的洞，順時針畫圈拉到金屬擋片，放手**，轉盤會自己轉回來，這樣就撥了一個數字。**照順序把號碼撥完**，撥錯一碼就結束。注意：數字越大（0 最大）要轉越大一圈，**轉盤轉回來的時候不能撥**，要靠記憶撐住後面的號碼。號碼裡有容易混的數字串（像 0920 和 0902、連續的 2255）。越後面，號碼越長、看的時間越短！',
        mount: mount,
        score: SCORE,
        test: {
            digitsFor: digitsFor, viewMs: viewMs, repeatsFor: repeatsFor, mirrorsFor: mirrorsFor, wrap180: wrap180, wrap360: wrap360, rotationFor: rotationFor, holeAngle: holeAngle, returnTimeMs: returnTimeMs, isDialed: isDialed, hitHole: hitHole, angleOf: angleOf,
            repeatCount: repeatCount, mirrorCount: mirrorCount, feasible: feasible, makeNumber: makeNumber, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, DIGITS: DIGITS, VIEW_S: VIEW_S, REPEATS: REPEATS, MIRRORS: MIRRORS, STOP_ANGLE: STOP_ANGLE, ROT_FIRST: ROT_FIRST, ROT_STEP: ROT_STEP, PULL_TOL: PULL_TOL, RETURN_DEG_S: RETURN_DEG_S, TICK_DEG: TICK_DEG, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
