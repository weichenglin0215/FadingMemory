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

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'cups';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 cups 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 200 };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 杯子數：3 個起，每 3 關多一個，最多 7 個 */
    var CUPS_START = 3, CUPS_MAX = 7, CUPS_EVERY = 3;   /* 每 CUPS_EVERY 關多一個杯子，最多 CUPS_MAX */
    /* 交換次數：5 次起，每關 +2，最多 60 */
    var SWAPS_START = 5, SWAPS_STEP = 2, SWAPS_MAX = 60;
    /* 每次交換的時間（秒）：隨關卡線性縮短（越來越快） */
    var SWAP_SEC_START = 0.5, SWAP_SEC_END = 0.10, SWAP_RAMP_LEVELS = 20;
    var PAIRS_FROM_LEVEL = 8;   /* 這一關起，杯子 ≥ 4 個時會兩對同時交換 */
    var REVEAL_MS = 1100;       /* 開場掀開杯子露出球的時間 */
    var LIFT_PX = 54;           /* 掀開杯子的高度 */
    var ARC_PX = 34;            /* 交換時弧線的高度 */
    var GAP_MS = 40;            /* 兩次交換之間的間隔 */

    /* 最佳紀錄文字 */
    function fmtBest(v) { return v == null ? '' : '最佳 第 ' + v + ' 關'; }

    /* 純函式（也給 Node 測試用） */
    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 這一關有幾個杯子 */
    function cupsFor(level) { return Math.min(CUPS_MAX, CUPS_START + Math.floor((level - 1) / CUPS_EVERY)); }
    /* 這一關要交換幾次 */
    function swapsFor(level) { return Math.min(SWAPS_MAX, SWAPS_START + SWAPS_STEP * (level - 1)); }
    /* 這一關每次交換花幾秒 */
    function swapSecFor(level) { return kit.ramp(level, SWAP_SEC_START, SWAP_SEC_END, SWAP_RAMP_LEVELS); }

    /* 產生整串交換：先用資料算好，再播放動畫。球在哪裡是「算出來」的，不是看動畫結果，所以動畫沒播完或畫面卡住，答案都是對的 */
    /* 產生整串交換。回傳 { steps, finalBall }：
       steps＝陣列，每一項是一步，一步是 1～2 對「位置編號」[[a,b]] 或 [[a,b],[c,d]]（兩對互不重疊）。
       至少要有 minBall 次交換牽涉到「球所在的位置」，不然球整局都沒動就太簡單了。 */
    /* n 杯子數、count 交換次數、pairs 能不能兩對同時換、ballSlot 球一開始的位置 */
    function makeSwaps(n, count, pairs, ballSlot, rand) {
        rand = rand || Math.random;
        /* 最多重試 60 次，直到球被牽涉到足夠多次（不然球整局都沒動就太簡單） */
        for (var attempt = 0; attempt < 60; attempt++) {
            var steps = [];
            var ball = ballSlot, touched = 0, prevKey = '';
            var made = 0;
            /* while：還沒湊滿 count 次就繼續產生下一步 */
            while (made < count) {
                /* 把位置編號洗牌，取前兩個（或前四個）當要交換的杯子 */
                var slots = kit.shuffle(Array.apply(null, Array(n)).map(function (_, i) { return i; }), rand);
                var two = pairs && n >= 4 && made + 2 <= count && rand() < 0.5;
                var step = [[slots[0], slots[1]]];
                if (two) step.push([slots[2], slots[3]]);
                /* 不連續做一模一樣的交換（等於沒換）；JSON.stringify 把交換內容轉成字串好比較 */
                var key = JSON.stringify(step.map(function (p) { return p.slice().sort(); }).sort());
                if (key === prevKey) continue;      /* 不連續做一模一樣的交換（等於沒換） */
                prevKey = key;
                /* 照這一步交換，更新球的位置 */
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
    /* 照一串交換走一遍，回傳球最後在哪個位置（驗證 makeSwaps 用） */
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

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        var R = null;
        /* bestLevel：進場時的最佳紀錄，用來判斷這次有沒有破紀錄 */
        var bestLevel = Reaction.getBest(ID);

        /* round：開一關 */
        function round(level) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            level = level || 1;
            root.innerHTML = '';
            ctx.setMeta(kit.meta(['第 ' + level + ' 關', fmtBest(Reaction.getBest(ID))]));

            /* n 這關杯子數 */
            var n = cupsFor(level);
            /* 建立畫面元素：提示、場地 */
            var hint = h('div', { 'class': 'hint', text: '記住球在哪個杯子' });
            var field = h('div', { 'class': 'cp-field' });
            root.appendChild(hint);
            root.appendChild(field);
            var FW = field.clientWidth, FH = field.clientHeight;
            /* SVG 畫布 */
            var svg = kit.svg('svg', { 'class': 'cp-svg', viewBox: '0 0 ' + FW + ' ' + FH, preserveAspectRatio: 'none' }, field);

            /* CW 杯子寬、CH 杯子高；baseY 杯子的基準高度；slotX(i) 第 i 個位置的 x 座標 */
            var CW = Math.min(86, (FW - 24) / n - 10), CH = CW * 1.12;
            var baseY = FH * 0.52;
            function slotX(i) { return FW * (i + 0.5) / n; }

            /* 隨機決定球一開始在哪個位置，並先算好整串交換 */
            var ballSlot = kit.randInt(0, n - 1);
            var plan = makeSwaps(n, swapsFor(level), level >= PAIRS_FROM_LEVEL, ballSlot);

            /* 杯子們：cups[c] 是第 c 號杯子（編號固定不變），slotOf[c] 是它目前站在第幾個位置 */
            /* 杯子們：cups[c] 是第 c 號杯子（編號固定不變），slotOf[c] 是它目前站的位置 */
            var cups = [], slotOf = [];
            for (var c = 0; c < n; c++) {
                slotOf.push(c);
                /* 每個杯子是一個 SVG 群組 <g>：包含球（只有一個杯子有）和杯身 */
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
            /* 放置一個杯子到 x，yOff 是垂直偏移（走弧線用），liftPx 是掀開的高度 */
            function place(cup, x, yOff, liftPx) {
                cup.g.setAttribute('transform', 'translate(' + x.toFixed(2) + ' ' + (baseY + yOff).toFixed(2) + ')');
                cup.lift.setAttribute('transform', 'translate(0 ' + (-liftPx).toFixed(2) + ')');
            }
            /* 球一開始在第 ballSlot 號位置的杯子（杯子編號＝一開始的位置） */
            var ballCup = ballSlot;

            var state = 'reveal';

            /* 掀開或蓋回杯子的動畫（用 tween 逐步改變高度） */
            function setLift(cupIdx, to, ms) {
                var cup = cups[cupIdx], x = slotX(slotOf[cupIdx]);
                var from = cup._lift || 0;
                return my.tween(ms, function (e) {
                    cup._lift = from + (to - from) * e;
                    place(cup, x, 0, cup._lift);
                }, kit.easeInOutCubic);
            }

            /* 執行一步交換：兩個杯子的路徑一個走弧線在上、一個在下，路徑交叉 */
            function doStep(step, sec) {
                var moves = [];
                step.forEach(function (pr, k) {
                    var ca = slotOf.indexOf(pr[0]), cb = slotOf.indexOf(pr[1]);
                    moves.push({ a: ca, b: cb, sa: pr[0], sb: pr[1], dir: k % 2 === 0 ? 1 : -1 });
                });
                /* 這一步裡「在上面的」杯子拉到最上層，路徑交叉時才不會被蓋住 */
                /* 這一步裡「在上面的」杯子拉到最上層，路徑交叉時才不會被蓋住 */
                moves.forEach(function (m) { svg.appendChild(cups[m.b].g); svg.appendChild(cups[m.a].g); });
                /* my.tween(毫秒, 回呼, 緩動函式)：在指定時間內每個畫面呼叫一次回呼，e 從 0 走到 1 */
                return my.tween(sec * 1000, function (e) {
                    moves.forEach(function (m) {
                        /* 弧線高度：用 sin 函數讓中間最高、兩端為 0 */
                        var arc = Math.sin(Math.PI * e) * ARC_PX * m.dir;
                        place(cups[m.a], slotX(m.sa) + (slotX(m.sb) - slotX(m.sa)) * e, -arc, cups[m.a]._lift || 0);
                        place(cups[m.b], slotX(m.sb) + (slotX(m.sa) - slotX(m.sb)) * e, arc * 0.6, cups[m.b]._lift || 0);
                    });
                }, kit.easeInOutCubic).then(function () {
                    moves.forEach(function (m) { slotOf[m.a] = m.sb; slotOf[m.b] = m.sa; });
                });
            }

            /* 整個流程用 Promise 串起來：掀開露出球 → 蓋回 → 逐步交換 → 讓玩家點。.then() 會等前一個動作完成才執行下一個 */
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

            /* 用「位置」選杯子：玩家看到的是位置，不是杯子編號 */
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
                            score: passed,        /* 世界排行榜成績（跟 setBest 存的同一個數字） */
                            num: '通過 ' + passed + ' 關', label: '猜錯了，球在另一個杯子', sfx: passed >= 5 ? 'win' : 'fail',
                            lines: ['這一關有 ' + n + ' 個杯子、換了 ' + swapsFor(level) + ' 次'],
                            isNew: isNew, onAgain: function () { bestLevel = Reaction.getBest(ID); round(1); }
                        });
                    });
                }
            }

            /* 點杯子：杯子位置一直換，所以用事件當下點擊的 x 座標，找最近的位置 */
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
            /* 綁定點擊（pointerdown 一碰就觸發） */
            field.addEventListener('pointerdown', onDown);
            /* 這一局結束時把事件監聽拿掉 */
            my.onDispose(function () { field.removeEventListener('pointerdown', onDown); });

            /* G.debug：測試用後門 */
            G.debug = {
                state: function () { return { level: level, n: n, state: state, ballSlot: ballSlot, finalBall: plan.finalBall, swaps: plan.steps.length, slotOf: slotOf.slice() }; },
                pickSlot: pickSlot
            };
        }

        round(1);
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '球在哪杯',
        rule: '球藏在其中一個杯子下面。先看清楚球在哪裡，杯子蓋回後會快速成對交換位置，眼睛盯緊！最後點出球在哪個杯子。答對進下一關，杯子會變多、換得更多更快。',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式給 Node 自動測試 */
        test: { cupsFor: cupsFor, swapsFor: swapsFor, swapSecFor: swapSecFor, makeSwaps: makeSwaps, applySwaps: applySwaps }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();
