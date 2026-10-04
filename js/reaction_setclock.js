/* ═══════════════════════════════════════════════════════════════════
   reaction_setclock.js — 秒反應・撥時鐘
   上方是數字時鐘（12 小時制），下方是圓形時鐘。在限時之內轉動「分針」（會像真的鐘一樣帶動時針），
   撥到跟數字時鐘一樣的時間；誤差不能超過一分鐘。關卡制，時間限制越來越短，看你能挑戰幾關。
   ───────────────────────────────────────────────────────────────────
   · 用「總分鐘數」total（0 ≤ total < 720，12 小時 = 720 分鐘）表示時間：
        分針角度 ＝ (total mod 60) × 6°，時針角度 ＝ total ÷ 720 × 360°。
     所以轉分針一整圈就是 60 分鐘，時針會跟著走 30°，跟真的時鐘一樣。
   · 手指轉動：按下去之後，每次移動只看「相對於上一個點的角度變化」（最短方向），累加成分鐘數；
     所以可以連續轉很多圈、也可以倒轉，分針不會因為手指一開始位置不同而跳掉。
   · 起始時間 ＝ 目標時間 ± (15～45 分鐘 ＋ 0～hmax 小時)：前幾關只差不到一小時（轉一圈以內），
     後面差好幾個小時（要轉好幾圈，時針也要對）。
   · 判定：按「好了」，目標與目前的環狀差（mod 720 分鐘）≤ TOL（1 分鐘）才算對。
   · 難度（第 1 → LEVEL_RAMP 關線性）：限時 TIME_START → TIME_END 秒、起始時間可差的整點數 0 → HOUR_OFFSET_END；
     第 HIDE_NUM_FROM 關起隱藏 1～12 的數字、第 HIDE_TICK_FROM 關起連刻度也隱藏。
   · 有 LIVES 次機會（超時或判定錯誤扣一次），成績＝通過關數（越多越好）。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'setclock';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var LEVEL_RAMP = 20;
    var TIME_START = 5, TIME_END = 2;        /* 每關限時（秒） */
    var HOUR_OFFSET_START = 1, HOUR_OFFSET_END = 6;    /* 起始時間最多可以差幾個整點 */
    var OFFSET_MIN = 15, OFFSET_MAX = 55;      /* 除了整點之外，再差 15～45 分鐘 */
    var TOL = 1;                               /* 容許誤差（分鐘） */
    var LIVES = 3;
    var HIDE_NUM_FROM = 10, HIDE_TICK_FROM = 16;
    var DEAD_ZONE = 0.12;                      /* 離圓心小於鐘面寬度的這個比例時不理會（角度抖動太大） */
    var NEXT_MS = 1100;
    var CX = 200, CY = 200, RADIUS = 188;

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 關'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function norm(total) { return ((total % 720) + 720) % 720; }
    /* 環狀差（分鐘），範圍 (-360, 360]：a − b 繞最短方向 */
    function circDiff(a, b) { var d = norm(a - b); return d > 360 ? d - 720 : d; }
    function minuteAngle(total) { return (norm(total) % 60) * 6; }
    function hourAngle(total) { return norm(total) / 720 * 360; }
    function fmt12(total) {
        var t = Math.round(norm(total)) % 720, hh = Math.floor(t / 60), mm = t % 60;
        return (hh === 0 ? 12 : hh) + ':' + (mm < 10 ? '0' : '') + mm;
    }
    function timeLimit(level) { return kit.ramp(level, TIME_START, TIME_END, LEVEL_RAMP); }
    function hourOffsetMax(level) { return Math.round(kit.ramp(level, HOUR_OFFSET_START, HOUR_OFFSET_END, LEVEL_RAMP)); }
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var target = kit.randInt(0, 719, rand);
        var off = kit.randFloat(OFFSET_MIN, OFFSET_MAX, rand) + 60 * kit.randInt(0, hourOffsetMax(level), rand);
        var start = norm(target + (rand() < 0.5 ? -off : off));
        /* 起始時間不能剛好差不到 TOL（不然一開始就是對的） */
        if (Math.abs(circDiff(start, target)) <= TOL + 5) start = norm(start + 30);
        return { target: target, start: norm(Math.round(start * 100) / 100), limit: timeLimit(level), hideNum: level >= HIDE_NUM_FROM, hideTick: level >= HIDE_TICK_FROM };
    }
    function isRight(cur, target) { return Math.abs(circDiff(cur, target)) <= TOL + 1e-9; }
    /* 手指角度（度，12 點鐘方向＝0，順時針為正） */
    function pointerAngle(dx, dy) { return (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360; }
    /* 兩個角度之間的最短有號差（度），範圍 [-180, 180) */
    function angDelta(a, b) { return ((b - a + 540) % 360) - 180; }

    function mount(root, ctx) {
        var R = null;

        /* startAt：從第幾關開始（失敗後可從前 5 關繼續）*/
        function round(startAt) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            var level = startAt || 1, cleared = level - 1, lives = LIVES, newRec = false, state = 'idle', lvId = 0;
            var cur = 0, L = null;

            var head = h('div', { 'class': 'sc-head' });
            var digital = h('div', { 'class': 'sc-digital' });
            var dial = h('div', { 'class': 'sc-dial' });
            var tb = kit.timebar();
            var done = h('button', { 'class': 'btn btn--go sc-done', text: '好了' });
            [head, digital, dial, tb.el, done].forEach(function (n) { root.appendChild(n); });

            /* ─── 鐘面（SVG）─── */
            var svg = kit.svg('svg', { 'class': 'sc-svg', viewBox: '0 0 400 400' }, dial);
            kit.svg('circle', { 'class': 'sc-face', cx: CX, cy: CY, r: RADIUS }, svg);
            var gTicks = kit.svg('g', {}, svg), gNums = kit.svg('g', {}, svg);
            for (var i = 0; i < 60; i++) {
                var big = i % 5 === 0, a = i * 6 * Math.PI / 180;
                var r1 = RADIUS - (big ? 18 : 9), r2 = RADIUS - 2;
                kit.svg('line', { 'class': 'sc-tick' + (big ? ' sc-tick--big' : ''), x1: CX + r1 * Math.sin(a), y1: CY - r1 * Math.cos(a), x2: CX + r2 * Math.sin(a), y2: CY - r2 * Math.cos(a) }, gTicks);
            }
            for (var n = 1; n <= 12; n++) {
                var an = n * 30 * Math.PI / 180, rn = RADIUS - 44;
                var tx = kit.svg('text', { 'class': 'sc-num', x: CX + rn * Math.sin(an), y: CY - rn * Math.cos(an), 'text-anchor': 'middle', 'dominant-baseline': 'central' }, gNums);
                tx.textContent = String(n);
            }
            var ghost = kit.svg('g', { 'class': 'sc-ghost', opacity: 0 }, svg);
            var ghostH = kit.svg('line', { 'class': 'sc-hand-hour sc-ghost-line', x1: CX, y1: CY, x2: CX, y2: CY - 100 }, ghost);
            var ghostM = kit.svg('line', { 'class': 'sc-hand-min sc-ghost-line', x1: CX, y1: CY, x2: CX, y2: CY - 160 }, ghost);
            var handH = kit.svg('line', { 'class': 'sc-hand-hour', x1: CX, y1: CY, x2: CX, y2: CY - 100 }, svg);
            var handM = kit.svg('line', { 'class': 'sc-hand-min', x1: CX, y1: CY, x2: CX, y2: CY - 160 }, svg);
            kit.svg('circle', { 'class': 'sc-cap', cx: CX, cy: CY, r: 12 }, svg);

            function setHands(total) {
                handH.setAttribute('transform', 'rotate(' + hourAngle(total).toFixed(2) + ' ' + CX + ' ' + CY + ')');
                handM.setAttribute('transform', 'rotate(' + minuteAngle(total).toFixed(2) + ' ' + CX + ' ' + CY + ')');
            }

            function meta() { ctx.setMeta(kit.meta(['第 ' + level + ' 關', '機會 ' + lives])); }

            function startLevel() {
                if (my.dead) return;
                var id = ++lvId;
                L = makeLevel(level);
                cur = L.start;
                state = 'play';
                digital.textContent = fmt12(L.target);
                head.textContent = '第 ' + level + ' 關　請把時鐘撥到這個時間';
                gNums.style.display = L.hideNum ? 'none' : '';
                gTicks.style.display = L.hideTick ? 'none' : '';
                ghost.setAttribute('opacity', 0);
                dial.classList.remove('sc-dial--ok', 'sc-dial--bad');
                setHands(cur);
                meta();
                try { console.info('[撥時鐘] 第 ' + level + ' 關 目標 ' + fmt12(L.target) + '（' + L.target + ' 分）起始 ' + fmt12(L.start) + '，要轉 ' + circDiff(L.target, L.start).toFixed(1) + ' 分鐘；限時 ' + L.limit.toFixed(1) + ' 秒；隱藏數字 ' + L.hideNum + '、隱藏刻度 ' + L.hideTick); } catch (e) { }
                var t0 = performance.now(), lim = L.limit * 1000;
                my.loop(function (now) { if (id !== lvId || state !== 'play') return false; tb.set(1 - (now - t0) / lim); });
                my.after(lim, function () { if (id === lvId && state === 'play') finishLevel(isRight(cur, L.target), true); });      /* 時間到：先看撥得對不對，對就過關 */
            }

            function finishLevel(ok, timeout) {
                if (state !== 'play') return;
                state = 'judged';
                tb.set(0);
                var diff = circDiff(cur, L.target);
                if (ok) {
                    cleared = level;
                    if (Reaction.setBest(ID, cleared, function (v, b) { return v > b; })) newRec = true;
                    dial.classList.add('sc-dial--ok');
                    Sfx.play('win');
                    head.textContent = (timeout ? '時間到，剛好撥對了！' : '準確！') + '差 ' + Math.abs(diff).toFixed(1) + ' 分鐘以內';
                    level++;
                    my.after(NEXT_MS, startLevel);
                    return;
                }
                lives--;
                dial.classList.add('sc-dial--bad');
                Sfx.play('bad');
                /* 把正確的指針用綠色虛線畫出來，讓玩家看到差多少 */
                ghostH.setAttribute('transform', 'rotate(' + hourAngle(L.target).toFixed(2) + ' ' + CX + ' ' + CY + ')');
                ghostM.setAttribute('transform', 'rotate(' + minuteAngle(L.target).toFixed(2) + ' ' + CX + ' ' + CY + ')');
                ghost.setAttribute('opacity', 1);
                head.textContent = (timeout ? '時間到！' : '差了 ' + Math.abs(diff).toFixed(1) + ' 分鐘') + '　綠色虛線是正確的位置';
                meta();
                if (lives <= 0) {
                    my.after(1800, function () {
                        var back = kit.resumeFrom(level);
                        kit.result(root, {
                            num: cleared + ' 關', label: cleared >= 10 ? '時間掌握大師！' : (cleared >= 5 ? '很會看時間！' : '再試一次，會更準！'),
                            lines: ['最後一關目標 ' + fmt12(L.target), timeout ? '時間到了還沒撥好' : '你撥到 ' + fmt12(cur) + '，差 ' + Math.abs(diff).toFixed(1) + ' 分鐘'],
                            note: '遊戲成績，不是醫療檢查', isNew: newRec, sfx: cleared >= 6 ? 'win' : 'fail', onAgain: function () { round(1); },
                            resume: { level: back, run: function () { round(back); } }
                        });
                    });
                } else {
                    my.after(1800, startLevel);     /* 同一關換一個新的時間再來一次 */
                }
            }
            done.addEventListener('pointerdown', function (e) { e.preventDefault(); if (state === 'play') finishLevel(isRight(cur, L.target), false); });

            /* ─── 手指轉分針 ─── */
            var drag = null;
            function center() { var r = svg.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; }
            svg.addEventListener('pointerdown', function (e) {
                if (state !== 'play' || drag) return;
                var c = center(), dx = e.clientX - c.x, dy = e.clientY - c.y;
                if (Math.sqrt(dx * dx + dy * dy) < c.w * DEAD_ZONE) return;
                e.preventDefault();
                try { svg.setPointerCapture(e.pointerId); } catch (err) { }
                drag = { id: e.pointerId, a: pointerAngle(dx, dy) };
            });
            svg.addEventListener('pointermove', function (e) {
                if (state !== 'play' || !drag || e.pointerId !== drag.id) return;
                var c = center();
                var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
                var list = evs && evs.length ? evs : [e];
                for (var k = 0; k < list.length; k++) {
                    var dx = list[k].clientX - c.x, dy = list[k].clientY - c.y;
                    if (Math.sqrt(dx * dx + dy * dy) < c.w * DEAD_ZONE) continue;
                    var a = pointerAngle(dx, dy);
                    cur = norm(cur + angDelta(drag.a, a) / 6);
                    drag.a = a;
                }
                setHands(cur);
            });
            function end(e) { if (drag && e.pointerId === drag.id) drag = null; }
            svg.addEventListener('pointerup', end);
            svg.addEventListener('pointercancel', end);

            G.debug = {
                state: function () { return { level: level, state: state, lives: lives, cleared: cleared, cur: cur, target: L && L.target, L: L }; },
                setCur: function (t) { cur = norm(t); setHands(cur); },
                solve: function () { cur = L.target; setHands(cur); G.debug.submit(); },
                submit: function () { if (state === 'play') finishLevel(isRight(cur, L.target), false); return state; },
                /* 用真的 PointerEvent 順時針轉 deg 度（分針每度 = 1/6 分鐘） */
                spin: function (deg) {
                    var c = center(), r = c.w * 0.4, a0 = 0, n = Math.ceil(Math.abs(deg) / 10), sgn = deg < 0 ? -1 : 1;
                    function at(a) { var rad = a * Math.PI / 180; return { clientX: c.x + r * Math.sin(rad), clientY: c.y - r * Math.cos(rad) }; }
                    var p = at(a0);
                    svg.dispatchEvent(new PointerEvent('pointerdown', { clientX: p.clientX, clientY: p.clientY, bubbles: true, cancelable: true, pointerId: 11 }));
                    for (var i = 1; i <= n; i++) {
                        var p2 = at(a0 + sgn * Math.min(Math.abs(deg), i * 10));
                        svg.dispatchEvent(new PointerEvent('pointermove', { clientX: p2.clientX, clientY: p2.clientY, bubbles: true, cancelable: true, pointerId: 11 }));
                    }
                    svg.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 11 }));
                    return cur;
                }
            };
            my.after(300, startLevel);
        }

        round(1);
    }

    var G = {
        id: ID,
        name: '撥時鐘',
        rule: '上面是數字時鐘，下面是圓形時鐘。用手指轉動分針（時針會跟著走），在時間內撥到一樣的時間，按「好了」。誤差不能超過一分鐘，時間會越來越短！',
        mount: mount,
        test: { norm: norm, circDiff: circDiff, minuteAngle: minuteAngle, hourAngle: hourAngle, fmt12: fmt12, timeLimit: timeLimit, hourOffsetMax: hourOffsetMax, makeLevel: makeLevel, isRight: isRight, pointerAngle: pointerAngle, angDelta: angDelta, TOL: TOL, LEVEL_RAMP: LEVEL_RAMP }
    };
    Reaction.register(G);
})();
