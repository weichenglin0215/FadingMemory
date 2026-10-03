/* ═══════════════════════════════════════════════════════════════════
   reaction_cups.js — 秒反應・球在哪杯（原「杯子在哪」，三杯一球）
   球藏在其中一個杯子下面，杯子快速成對交換位置，最後點出球在哪個杯子。
   答對進下一關（杯子變多、換得更多更快），答錯就結束。成績＝通過的關卡數。
   ───────────────────────────────────────────────────────────────────
   · 先把整串交換（makeSwaps）產生成純資料，再依序播放動畫：球在哪個位置是「算出來」
     的（applySwaps），不是看動畫結果，所以不管動畫有沒有播完、rAF 有沒有被瀏覽器暫停，
     答案都是對的。動畫用 kit.round().tween（rAF 為主、setTimeout 保底）。
   · 難度全部線性：杯子數 3 → 7（每 3 關 +1）、每關交換次數 +2、每次交換時間
     從 0.6 秒線性縮到 0.18 秒；PAIRS_FROM_LEVEL 關起（且杯子 ≥ 4 個）會兩對同時換。
   · 交換時一個杯子走弧線在上、另一個走弧線在下，路徑會交叉，不是單純平移。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'cups';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var CUPS_START = 3, CUPS_MAX = 7, CUPS_EVERY = 3;   /* 每 CUPS_EVERY 關多一個杯子，最多 CUPS_MAX */
    var SWAPS_START = 5, SWAPS_STEP = 2, SWAPS_MAX = 60;
    var SWAP_SEC_START = 0.5, SWAP_SEC_END = 0.10, SWAP_RAMP_LEVELS = 20;
    var PAIRS_FROM_LEVEL = 8;   /* 這一關起，杯子 ≥ 4 個時會兩對同時交換 */
    var REVEAL_MS = 1100;       /* 開場掀開杯子露出球的時間 */
    var LIFT_PX = 54;           /* 掀開杯子的高度 */
    var ARC_PX = 34;            /* 交換時弧線的高度 */
    var GAP_MS = 40;            /* 兩次交換之間的間隔 */

    function fmtBest(v) { return v == null ? '' : '最佳 第 ' + v + ' 關'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function cupsFor(level) { return Math.min(CUPS_MAX, CUPS_START + Math.floor((level - 1) / CUPS_EVERY)); }
    function swapsFor(level) { return Math.min(SWAPS_MAX, SWAPS_START + SWAPS_STEP * (level - 1)); }
    function swapSecFor(level) { return kit.ramp(level, SWAP_SEC_START, SWAP_SEC_END, SWAP_RAMP_LEVELS); }

    /* 產生整串交換。回傳 { steps, finalBall }：
       steps＝陣列，每一項是一步，一步是 1～2 對「位置編號」[[a,b]] 或 [[a,b],[c,d]]（兩對互不重疊）。
       至少要有 minBall 次交換牽涉到「球所在的位置」，不然球整局都沒動就太簡單了。 */
    function makeSwaps(n, count, pairs, ballSlot, rand) {
        rand = rand || Math.random;
        for (var attempt = 0; attempt < 60; attempt++) {
            var steps = [];
            var ball = ballSlot, touched = 0, prevKey = '';
            var made = 0;
            while (made < count) {
                var slots = kit.shuffle(Array.apply(null, Array(n)).map(function (_, i) { return i; }), rand);
                var two = pairs && n >= 4 && made + 2 <= count && rand() < 0.5;
                var step = [[slots[0], slots[1]]];
                if (two) step.push([slots[2], slots[3]]);
                var key = JSON.stringify(step.map(function (p) { return p.slice().sort(); }).sort());
                if (key === prevKey) continue;      /* 不連續做一模一樣的交換（等於沒換） */
                prevKey = key;
                step.forEach(function (p) {
                    if (ball === p[0]) { ball = p[1]; touched++; }
                    else if (ball === p[1]) { ball = p[0]; touched++; }
                });
                steps.push(step);
                made += step.length;
            }
            if (touched >= Math.min(count, Math.max(2, Math.floor(count / 3)))) return { steps: steps, finalBall: ball };
        }
        return { steps: steps, finalBall: ball };
    }
    /* 照一串交換走一遍，回傳球最後在哪個位置（用來驗證 makeSwaps 的 finalBall） */
    function applySwaps(steps, ballSlot) {
        var ball = ballSlot;
        steps.forEach(function (step) {
            step.forEach(function (p) {
                if (ball === p[0]) ball = p[1]; else if (ball === p[1]) ball = p[0];
            });
        });
        return ball;
    }

    function mount(root, ctx) {
        var R = null;
        var bestLevel = Reaction.getBest(ID);

        function round(level) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            level = level || 1;
            root.innerHTML = '';
            ctx.setMeta(kit.meta(['第 ' + level + ' 關', fmtBest(Reaction.getBest(ID))]));

            var n = cupsFor(level);
            var hint = h('div', { 'class': 'hint', text: '記住球在哪個杯子' });
            var field = h('div', { 'class': 'cp-field' });
            root.appendChild(hint);
            root.appendChild(field);
            var FW = field.clientWidth, FH = field.clientHeight;
            var svg = kit.svg('svg', { 'class': 'cp-svg', viewBox: '0 0 ' + FW + ' ' + FH, preserveAspectRatio: 'none' }, field);

            var CW = Math.min(86, (FW - 24) / n - 10), CH = CW * 1.12;
            var baseY = FH * 0.52;
            function slotX(i) { return FW * (i + 0.5) / n; }

            var ballSlot = kit.randInt(0, n - 1);
            var plan = makeSwaps(n, swapsFor(level), level >= PAIRS_FROM_LEVEL, ballSlot);

            /* 杯子們：cups[c] 是第 c 號杯子（編號固定不變），slotOf[c] 是它目前站的位置 */
            var cups = [], slotOf = [];
            for (var c = 0; c < n; c++) {
                slotOf.push(c);
                var g = kit.svg('g', { 'class': 'cp-cup' }, svg);
                var ballEl = null;
                if (c === ballSlot) ballEl = kit.svg('circle', { 'class': 'cp-ball', cx: 0, cy: -CW * 0.2, r: CW * 0.2 }, g);
                var lift = kit.svg('g', { 'class': 'cp-lift' }, g);
                kit.svg('path', {
                    'class': 'cp-cup__body',
                    d: 'M' + (-CW / 2) + ' 0 L' + (-CW * 0.36) + ' ' + (-CH) + ' Q0 ' + (-CH - CW * 0.12) + ' ' + (CW * 0.36) + ' ' + (-CH) + ' L' + (CW / 2) + ' 0 Z'
                }, lift);
                kit.svg('ellipse', { 'class': 'cp-cup__rim', cx: 0, cy: 0, rx: CW / 2, ry: CW * 0.1 }, lift);
                kit.svg('path', { 'class': 'cp-cup__shine', d: 'M' + (-CW * 0.2) + ' ' + (-CH * 0.25) + ' L' + (-CW * 0.14) + ' ' + (-CH * 0.8) }, lift);
                cups.push({ g: g, lift: lift, ball: ballEl, id: c });
                place(cups[c], slotX(c), 0, 0);
            }
            function place(cup, x, yOff, liftPx) {
                cup.g.setAttribute('transform', 'translate(' + x.toFixed(2) + ' ' + (baseY + yOff).toFixed(2) + ')');
                cup.lift.setAttribute('transform', 'translate(0 ' + (-liftPx).toFixed(2) + ')');
            }
            /* 球一開始在第 ballSlot 號位置的杯子（杯子編號＝一開始的位置） */
            var ballCup = ballSlot;

            var state = 'reveal';

            function setLift(cupIdx, to, ms) {
                var cup = cups[cupIdx], x = slotX(slotOf[cupIdx]);
                var from = cup._lift || 0;
                return my.tween(ms, function (e) {
                    cup._lift = from + (to - from) * e;
                    place(cup, x, 0, cup._lift);
                }, kit.easeInOutCubic);
            }

            function doStep(step, sec) {
                var moves = [];
                step.forEach(function (pr, k) {
                    var ca = slotOf.indexOf(pr[0]), cb = slotOf.indexOf(pr[1]);
                    moves.push({ a: ca, b: cb, sa: pr[0], sb: pr[1], dir: k % 2 === 0 ? 1 : -1 });
                });
                /* 這一步裡「在上面的」杯子拉到最上層，路徑交叉時才不會被蓋住 */
                moves.forEach(function (m) { svg.appendChild(cups[m.b].g); svg.appendChild(cups[m.a].g); });
                return my.tween(sec * 1000, function (e) {
                    moves.forEach(function (m) {
                        var arc = Math.sin(Math.PI * e) * ARC_PX * m.dir;
                        place(cups[m.a], slotX(m.sa) + (slotX(m.sb) - slotX(m.sa)) * e, -arc, cups[m.a]._lift || 0);
                        place(cups[m.b], slotX(m.sb) + (slotX(m.sa) - slotX(m.sb)) * e, arc * 0.6, cups[m.b]._lift || 0);
                    });
                }, kit.easeInOutCubic).then(function () {
                    moves.forEach(function (m) { slotOf[m.a] = m.sb; slotOf[m.b] = m.sa; });
                });
            }

            /* ─── 流程：掀開露出球 → 蓋回 → 交換 → 玩家點 ─── */
            my.wait(500)
                .then(function () { return setLift(ballCup, LIFT_PX, 350); })
                .then(function () { Sfx.play('flip'); return my.wait(REVEAL_MS); })
                .then(function () { return setLift(ballCup, 0, 300); })
                .then(function () {
                    state = 'swap';
                    hint.textContent = '盯緊…';
                    var chain = my.wait(250), sec = swapSecFor(level);
                    plan.steps.forEach(function (step) {
                        chain = chain.then(function () { Sfx.play('whoosh'); return doStep(step, sec); }).then(function () { return my.wait(GAP_MS); });
                    });
                    return chain;
                })
                .then(function () {
                    state = 'pick';
                    hint.textContent = '球在哪個杯子？點一下！';
                    Sfx.play('go');
                });

            /* 用「位置」選：玩家看到的是位置，不是杯子編號 */
            function pickSlot(slot) {
                if (state !== 'pick') return;
                state = 'result';
                var cupIdx = slotOf.indexOf(slot);
                var correct = slot === plan.finalBall;
                var right = slotOf.indexOf(plan.finalBall);
                setLift(cupIdx, LIFT_PX + 10, 280);
                if (correct) {
                    Sfx.play('ok');
                    hint.textContent = '答對了！';
                    var passed = level;
                    Reaction.setBest(ID, passed, function (v, b) { return v > b; });
                    ctx.setMeta(kit.meta(['第 ' + level + ' 關', fmtBest(Reaction.getBest(ID))]));
                    my.after(1100, function () { round(level + 1); });
                } else {
                    Sfx.play('bad');
                    hint.textContent = '猜錯了…球在這裡';
                    my.after(500, function () { setLift(right, LIFT_PX + 10, 280); });
                    my.after(1700, function () {
                        var passed = level - 1;
                        var isNew = passed > 0 && Reaction.getBest(ID) === passed && bestLevel !== passed;
                        kit.result(root, {
                            num: '通過 ' + passed + ' 關', label: '猜錯了，球在另一個杯子', sfx: passed >= 5 ? 'win' : 'fail',
                            lines: ['這一關有 ' + n + ' 個杯子、換了 ' + swapsFor(level) + ' 次'],
                            isNew: isNew, onAgain: function () { bestLevel = Reaction.getBest(ID); round(1); }
                        });
                    });
                }
            }

            /* 點杯子：杯子的位置會一直換，所以用事件當下的位置判斷（最靠近點擊 x 的位置） */
            var onDown = function (e) {
                if (state !== 'pick') return;
                e.preventDefault();
                var rect = field.getBoundingClientRect();
                var x = (e.clientX - rect.left) * FW / rect.width;
                var best = 0, bd = 1e9;
                for (var s = 0; s < n; s++) { var d = Math.abs(slotX(s) - x); if (d < bd) { bd = d; best = s; } }
                pickSlot(best);
            };
            field.addEventListener('pointerdown', onDown);
            my.onDispose(function () { field.removeEventListener('pointerdown', onDown); });

            G.debug = {
                state: function () { return { level: level, n: n, state: state, ballSlot: ballSlot, finalBall: plan.finalBall, swaps: plan.steps.length, slotOf: slotOf.slice() }; },
                pickSlot: pickSlot
            };
        }

        round(1);
    }

    var G = {
        id: ID,
        name: '球在哪杯',
        rule: '球藏在其中一個杯子下面。先看清楚球在哪裡，杯子蓋回後會快速成對交換位置，眼睛盯緊！最後點出球在哪個杯子。答對進下一關，杯子會變多、換得更多更快。',
        mount: mount,
        test: { cupsFor: cupsFor, swapsFor: swapsFor, swapSecFor: swapSecFor, makeSwaps: makeSwaps, applySwaps: applySwaps }
    };
    Reaction.register(G);
})();
