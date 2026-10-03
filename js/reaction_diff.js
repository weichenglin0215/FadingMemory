/* ═══════════════════════════════════════════════════════════════════
   reaction_diff.js — 秒反應・哪裡怪怪的
   畫面分成上下兩格，各有 10 個一樣的幾何圖形，其中 5 個的「大小」或「顏色」或「位置」不一樣。
   上格、下格的圖形都可以點，找齊 5 個就進下一關（全新的 10 個圖形，差異變小）。
   ───────────────────────────────────────────────────────────────────
   · 每一關：10 個圖形（形狀、顏色、位置都是新的），上下兩格擺一模一樣，再挑 5 個「對應的圖形」
     動手腳：差異種類 大小／顏色／位置 隨機（保證三種都至少出現一次）；動手腳的那一邊（上或下）也隨機，
     所以不能只盯著其中一格。
   · 差異大小全部隨關卡線性縮小（第 1 關 → 第 LEVEL_RAMP 關）：
        大小：半徑差 SIZE_START(45%) → SIZE_END(5%)
        顏色：色相差 HUE_START(55°) → HUE_END(4°)
        位置：位移   POS_START(38px) → POS_END(3px)
   · 點到沒有差異的圖形：扣 PENALTY_S 秒；每一關限時從 TIME_START 線性縮到 TIME_END。
     時間到就結束，成績＝通過幾關。結束時會把沒找到的差異圈出來。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'diff';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var LEVEL_RAMP = 20;
    var SIZE_START = 0.3, SIZE_END = 0.05;
    var HUE_START = 40, HUE_END = 5;
    var POS_START = 30, POS_END = 5;
    var TIME_START = 20, TIME_END = 40;         /* 每關限時（秒） */
    var PENALTY_S = 3;                         /* 點錯扣幾秒 */
    var NEXT_MS = 700;
    var COLS = 4, ROWS = 3, N_SHAPES = 10, N_DIFF = 5;
    var BASE_R = 30;
    var SHAPES = ['circle', 'square', 'triangle', 'star', 'hexagon', 'diamond', 'pentagon'];
    var KINDS = ['size', 'hue', 'pos'];

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 關'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function amounts(level) {
        return {
            size: kit.ramp(level, SIZE_START, SIZE_END, LEVEL_RAMP),
            hue: kit.ramp(level, HUE_START, HUE_END, LEVEL_RAMP),
            pos: kit.ramp(level, POS_START, POS_END, LEVEL_RAMP)
        };
    }
    function timeFor(level) { return kit.ramp(level, TIME_START, TIME_END, LEVEL_RAMP); }

    /* 產生一關。W×Hh 是每一格（上或下）的大小。回傳：
       { items:[{shape,hue,r,x,y}] (原本的 10 個), diffs:[{i, kind, panel('top'|'bot'), amount, dh, ds, dx, dy}] } */
    function makeLevel(level, W, Hh, rand) {
        rand = rand || Math.random;
        var amt = amounts(level);
        /* 從 4×3 = 12 個格子隨機挑 10 個，每個格子裡再亂數偏移一點 */
        var cells = [];
        for (var c = 0; c < COLS * ROWS; c++) cells.push(c);
        cells = kit.shuffle(cells, rand).slice(0, N_SHAPES);
        var cw = W / COLS, ch = Hh / ROWS;
        var items = cells.map(function (cell) {
            var cx = (cell % COLS + 0.5) * cw, cy = (Math.floor(cell / COLS) + 0.5) * ch;
            return {
                shape: kit.pick(SHAPES, rand),
                hue: kit.randInt(0, 359, rand),
                r: BASE_R,
                x: cx + (rand() - 0.5) * Math.max(0, cw - 2 * BASE_R - 28),
                y: cy + (rand() - 0.5) * Math.max(0, ch - 2 * BASE_R - 28)
            };
        });
        /* 挑 5 個動手腳；差異種類：三種都至少一次，其餘隨機 */
        var idx = kit.shuffle(items.map(function (_, i) { return i; }), rand).slice(0, N_DIFF);
        var kinds = KINDS.slice();
        while (kinds.length < N_DIFF) kinds.push(kit.pick(KINDS, rand));
        kinds = kit.shuffle(kinds, rand);
        var diffs = idx.map(function (i, k) {
            var kind = kinds[k], d = { i: i, kind: kind, panel: rand() < 0.5 ? 'top' : 'bot', amount: amt[kind], dh: 0, ds: 1, dx: 0, dy: 0 };
            if (kind === 'size') d.ds = 1 + (rand() < 0.5 ? -1 : 1) * amt.size;
            if (kind === 'hue') d.dh = (rand() < 0.5 ? -1 : 1) * amt.hue;
            if (kind === 'pos') {
                var a = rand() * Math.PI * 2;
                d.dx = Math.cos(a) * amt.pos; d.dy = Math.sin(a) * amt.pos;
                /* 位移後不能跑出格子：超出就反方向 */
                var it = items[i];
                if (it.x + d.dx < BASE_R || it.x + d.dx > W - BASE_R) d.dx = -d.dx;
                if (it.y + d.dy < BASE_R || it.y + d.dy > Hh - BASE_R) d.dy = -d.dy;
            }
            return d;
        });
        return { items: items, diffs: diffs, amt: amt };
    }
    /* 某一格（'top'／'bot'）裡第 i 個圖形最終的樣子 */
    function itemIn(level, panel, i) {
        var it = level.items[i], out = { shape: it.shape, hue: it.hue, r: it.r, x: it.x, y: it.y };
        level.diffs.forEach(function (d) {
            if (d.i === i && d.panel === panel) {
                out.r = it.r * d.ds;
                out.hue = (it.hue + d.dh + 360) % 360;
                out.x = it.x + d.dx; out.y = it.y + d.dy;
            }
        });
        return out;
    }
    function polyPoints(shape, r) {
        var pts = [], n, k;
        if (shape === 'triangle') { n = 3; }
        else if (shape === 'hexagon') { n = 6; }
        else if (shape === 'pentagon') { n = 5; }
        else if (shape === 'diamond') { return [[0, -r * 1.15], [r * 0.8, 0], [0, r * 1.15], [-r * 0.8, 0]]; }
        else if (shape === 'square') { return [[-r * 0.9, -r * 0.9], [r * 0.9, -r * 0.9], [r * 0.9, r * 0.9], [-r * 0.9, r * 0.9]]; }
        else if (shape === 'star') {
            for (k = 0; k < 10; k++) {
                var rr = k % 2 ? r * 0.48 : r * 1.1, a = -Math.PI / 2 + k * Math.PI / 5;
                pts.push([rr * Math.cos(a), rr * Math.sin(a)]);
            }
            return pts;
        }
        for (k = 0; k < n; k++) { var a2 = -Math.PI / 2 + k * 2 * Math.PI / n; pts.push([r * Math.cos(a2), r * Math.sin(a2)]); }
        return pts;
    }

    function mount(root, ctx) {
        var R = null;

        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';
            var levelNo = 1, cleared = 0, newRec = false;

            var head = h('div', { 'class': 'df-head' });
            var bar = h('div', { 'class': 'ld-time' }, [h('div', { 'class': 'ld-time__fill' })]);
            var fill = bar.firstChild;
            var top = h('div', { 'class': 'df-panel' });
            var bot = h('div', { 'class': 'df-panel' });
            var flash = h('div', { 'class': 'df-penalty', text: '- ' + PENALTY_S + ' 秒' });
            root.appendChild(head);
            root.appendChild(bar);
            root.appendChild(top);
            root.appendChild(bot);
            root.appendChild(flash);

            var L = null, found = 0, svgs = {}, t0 = 0, limitMs = 0, spent = 0, state = 'idle', loop = null, timer = null, foundSet = {};

            function meta() { ctx.setMeta(kit.meta(['第 ' + levelNo + ' 關', fmtBest(Reaction.getBest(ID))])); }
            function paintHead() { head.textContent = '第 ' + levelNo + ' 關　找到 ' + found + ' / ' + N_DIFF; }

            function drawPanel(el, panel, W, Hh) {
                el.innerHTML = '';
                var svg = kit.svg('svg', { 'class': 'df-svg', viewBox: '0 0 ' + W + ' ' + Hh }, el);
                svgs[panel] = svg;
                L.items.forEach(function (_, i) {
                    var s = itemIn(L, panel, i);
                    var g = kit.svg('g', { transform: 'translate(' + s.x.toFixed(2) + ' ' + s.y.toFixed(2) + ')' }, svg);
                    var fillC = 'hsl(' + s.hue.toFixed(1) + ', 72%, 56%)';
                    if (s.shape === 'circle') kit.svg('circle', { 'class': 'df-shape', r: s.r.toFixed(2), fill: fillC }, g);
                    else kit.svg('polygon', { 'class': 'df-shape', fill: fillC, points: polyPoints(s.shape, s.r).map(function (p) { return p[0].toFixed(2) + ',' + p[1].toFixed(2); }).join(' ') }, g);
                    kit.svg('circle', { 'class': 'df-ring', r: BASE_R + 12, id: '' }, g);
                    var hit = kit.svg('circle', { 'class': 'df-hit', r: BASE_R + 14 }, g);
                    hit.addEventListener('pointerdown', function (e) { e.preventDefault(); tap(i, panel, g); });
                    g.setAttribute('data-i', i);
                });
            }

            function ringBoth(i, cls) {
                ['top', 'bot'].forEach(function (p) {
                    var g = svgs[p].querySelector('g[data-i="' + i + '"]');
                    if (g) g.querySelector('.df-ring').classList.add(cls);
                });
            }

            function startLevel() {
                if (my.dead) return;
                L = makeLevel(levelNo, top.clientWidth, top.clientHeight);
                found = 0; foundSet = {}; state = 'play';
                drawPanel(top, 'top', top.clientWidth, top.clientHeight);
                drawPanel(bot, 'bot', bot.clientWidth, bot.clientHeight);
                paintHead(); meta();
                limitMs = timeFor(levelNo) * 1000; spent = 0; t0 = performance.now();
                try {
                    console.info('[哪裡怪怪的] 第 ' + levelNo + ' 關 差異量：大小 ±' + (L.amt.size * 100).toFixed(1) + '%、色相 ±' + L.amt.hue.toFixed(1) + '°、位置 ' + L.amt.pos.toFixed(1) + 'px；' +
                        L.diffs.map(function (d) { return '圖' + (d.i + 1) + ':' + ({ size: '大小', hue: '顏色', pos: '位置' })[d.kind] + '(' + (d.panel === 'top' ? '上' : '下') + '格改)'; }).join('、'));
                } catch (e) { }
                loop = my.loop(function (now) {
                    if (state !== 'play') return false;
                    fill.style.width = (100 * Math.max(0, 1 - (now - t0 + spent) / limitMs)).toFixed(1) + '%';
                });
                armTimer();
            }
            function armTimer() {
                my.cancel(timer);
                var remain = limitMs - (performance.now() - t0 + spent);
                timer = my.after(Math.max(0, remain), timeUp);
            }

            function tap(i, panel, g) {
                if (state !== 'play' || foundSet[i]) return;
                var isDiff = L.diffs.some(function (d) { return d.i === i; });
                if (isDiff) {
                    foundSet[i] = true; found++;
                    ringBoth(i, 'df-ring--ok');
                    Sfx.play('ok');
                    paintHead();
                    if (found >= N_DIFF) levelClear();
                } else {
                    g.querySelector('.df-ring').classList.add('df-ring--bad');
                    my.after(450, function () { g.querySelector('.df-ring').classList.remove('df-ring--bad'); });
                    spent += PENALTY_S * 1000;
                    Sfx.play('bad');
                    flash.classList.remove('df-penalty--on'); void flash.offsetWidth; flash.classList.add('df-penalty--on');
                    armTimer();
                    if (limitMs - (performance.now() - t0 + spent) <= 0) timeUp();
                }
            }

            function levelClear() {
                state = 'clear';
                my.cancel(timer); loop.stop();
                fill.style.width = '0%';
                cleared = levelNo;
                if (Reaction.setBest(ID, cleared, function (v, b) { return v > b; })) newRec = true;
                Sfx.play('win');
                levelNo++;
                my.after(NEXT_MS, startLevel);
            }

            function timeUp() {
                if (state !== 'play') return;
                state = 'over';
                my.cancel(timer); loop.stop();
                fill.style.width = '0%';
                L.diffs.forEach(function (d) { if (!foundSet[d.i]) ringBoth(d.i, 'df-ring--miss'); });
                head.textContent = '時間到了！黃圈是沒找到的';
                my.after(2200, function () {
                    kit.result(root, {
                        num: cleared + ' 關', label: '時間到了',
                        lines: ['第 ' + levelNo + ' 關找到 ' + found + ' / ' + N_DIFF],
                        isNew: newRec, sfx: cleared >= 5 ? 'win' : 'fail', onAgain: round
                    });
                });
            }

            G.debug = {
                level: function () { return L; },
                state: function () { return { levelNo: levelNo, found: found, state: state, cleared: cleared }; },
                tapIdx: function (i, panel) { var g = svgs[panel || 'top'].querySelector('g[data-i="' + i + '"]'); tap(i, panel || 'top', g); },
                solve: function () { L.diffs.forEach(function (d) { if (!foundSet[d.i]) G.debug.tapIdx(d.i, d.panel === 'top' ? 'bot' : 'top'); }); },
                timeUp: timeUp
            };
            my.after(400, startLevel);
        }

        round();
    }

    var G = {
        id: ID,
        name: '哪裡怪怪的',
        rule: '畫面分成上下兩格，各有 10 個一樣的圖形，其中 5 個的大小、顏色或位置不一樣。上格、下格的圖形都可以點，找齊 5 個就進下一關，而且差異會越來越小。點到沒有差異的圖形會扣 3 秒！',
        mount: mount,
        test: { amounts: amounts, timeFor: timeFor, makeLevel: makeLevel, itemIn: itemIn, polyPoints: polyPoints, N_DIFF: N_DIFF, N_SHAPES: N_SHAPES, KINDS: KINDS, LEVEL_RAMP: LEVEL_RAMP }
    };
    Reaction.register(G);
})();
