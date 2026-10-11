/* ═══════════════════════════════════════════════════════════════════
   reaction_scratch.js — 秒反應・刮刮樂推理
   12 格刮刮樂（3 列 × 4 行），藏著「三個一模一樣」的圖案。每格先露出左上角的一小塊碎片，
   手指在格子上來回刮，刮開 SCRATCH_PCT 以上就整格翻開；找到三個相同圖案就結束。
   成績＝結束時刮開了幾格（最少 3 格，越少越好）。
   ───────────────────────────────────────────────────────────────────
   · 6 種圖案（圓、愛心、三角、菱形、方、十字）。碎片設計成「兩兩長得像」：
     圓／愛心（都是弧線）、三角／菱形（都是斜邊）、方／十字（都是直角）——要靠推理，不是純運氣。
   · 牌面：目標圖案 3 個；其他 5 種圖案共 9 個，每種最多 2 個（4 種各 2 個、1 種 1 個），所以只有
     目標圖案會出現第三個；位置隨機。
   · 刮開判定：用 canvas 的透明度算「被刮掉的面積比例」（扣掉一開始就透明的碎片窗），
     ≥ SCRATCH_PCT 才算刮開，自動整格翻開（刮一點點偷看不算）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'scratch';
    var SCORE = { better: 'min', decimals: 0, format: '{v} 格', label: '刮開格數', min: 3, max: 12 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var COLS = 3, ROWS = 4, CELL = 140, GAP = 10;     /* 格子排列與大小（px） */
    var WINDOW = 64;                                   /* 左上角碎片窗的邊長（約 45% 格寬） */
    var SCRATCH_PCT = 0.35;                            /* 刮掉多少比例就整格翻開 */
    var BRUSH = 34;                                    /* 刮刀寬度（px） */
    var TARGET_COUNT = 3;
    var SYMBOLS = ['circle', 'heart', 'triangle', 'diamond', 'square', 'cross'];
    /* 碎片相似的組別（要靠碎片之外的線索或刮開別格才能分辨） */
    var LOOKALIKE = [['circle', 'heart'], ['triangle', 'diamond'], ['square', 'cross']];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 出牌：回傳 { cells: [圖案名 × 12], target } */
    function makeBoard(rand) {
        rand = rand || Math.random;
        var order = kit.shuffle(SYMBOLS, rand), target = order[0], others = order.slice(1);
        /* 其他 5 種：4 種各 2 個、1 種 1 個（共 9 個） */
        var single = kit.randInt(0, 4, rand), cells = [target, target, target];
        others.forEach(function (s, i) { cells.push(s); if (i !== single) cells.push(s); });
        return { cells: kit.shuffle(cells, rand), target: target };
    }
    /* 目前翻開的格子中，有沒有任何圖案達到 3 個 */
    function winner(cells, revealed) {
        var cnt = {};
        revealed.forEach(function (i) { cnt[cells[i]] = (cnt[cells[i]] || 0) + 1; });
        for (var k in cnt) if (cnt[k] >= TARGET_COUNT) return k;
        return null;
    }
    /* 圖案的 SVG 內容（100×100 座標） */
    function symbolMarkup(name) {
        switch (name) {
            case 'circle': return '<circle cx="50" cy="50" r="40"/>';
            case 'heart': return '<path d="M50 86 C8 56 8 18 32 16 C42 15 48 22 50 29 C52 22 58 15 68 16 C92 18 92 56 50 86 Z"/>';
            case 'triangle': return '<polygon points="50,8 93,88 7,88"/>';
            case 'diamond': return '<polygon points="50,6 94,50 50,94 6,50"/>';
            case 'square': return '<rect x="12" y="12" width="76" height="76"/>';
            default: return '<polygon points="36,8 64,8 64,36 92,36 92,64 64,64 64,92 36,92 36,64 8,64 8,36 36,36"/>';
        }
    }
    function rating(n) {
        if (n <= 3) return '神準！三格就找到！';
        if (n <= 5) return '高手！';
        if (n <= 7) return '不錯喔！';
        return '再來一張，會更少！';
    }
    /* 刮掉的比例：data 是 RGBA 陣列，只算窗以外的區域；step 是取樣間隔（像素） */
    function clearedRatio(data, size, win, step) {
        var total = 0, clear = 0;
        for (var y = 0; y < size; y += step) {
            for (var x = 0; x < size; x += step) {
                if (x < win && y < win) continue;
                total++;
                if (data[(y * size + x) * 4 + 3] < 128) clear++;
            }
        }
        return total ? clear / total : 0;
    }

    function mount(root, ctx) {
        kit.single(root, ctx, {
            id: ID, G: G, better: 'min', fake4: false,
            title: '找出 3 個一模一樣的圖案，刮越少越好',
            numText: function (v) { return v + ' 格'; },
            rating: rating,
            sfx: function (v) { return v <= 5 ? 'perfect' : (v <= 8 ? 'win' : 'fail'); },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, my = api.my;
        var W = stage.clientWidth || 472;
        var bd = makeBoard(), N = COLS * ROWS;
        var revealed = [], done = false, hint = null, cells = [];
        var coat = '#E0AA25', coat2 = '#C9921C';
        try {
            var cs = getComputedStyle(document.documentElement);
            coat = cs.getPropertyValue('--c-yellow').trim() || coat; coat2 = cs.getPropertyValue('--c-orange').trim() || coat2;
        } catch (e) { }
        console.log('[刮刮樂推理] 目標圖案 ' + bd.target + '；牌面 ' + bd.cells.join(','));

        var x0 = Math.round((W - (COLS * CELL + (COLS - 1) * GAP)) / 2), y0 = 6;
        var board = h('div', { 'class': 'sc-board' });
        board.style.left = x0 + 'px'; board.style.top = y0 + 'px';
        board.style.width = (COLS * CELL + (COLS - 1) * GAP) + 'px'; board.style.height = (ROWS * CELL + (ROWS - 1) * GAP) + 'px';
        stage.appendChild(board);
        var info = h('div', { 'class': 'sc-info', text: '已刮開 0 格' });
        stage.appendChild(info);

        for (var i = 0; i < N; i++) (function (i) {
            var col = i % COLS, row = Math.floor(i / COLS);
            var el = h('div', { 'class': 'sc-cell' });
            el.style.left = (col * (CELL + GAP)) + 'px'; el.style.top = (row * (CELL + GAP)) + 'px';
            el.innerHTML = '<svg viewBox="0 0 100 100" width="' + CELL + '" height="' + CELL + '" class="sc-sym">' + symbolMarkup(bd.cells[i]) + '</svg>';
            var cv = document.createElement('canvas');
            cv.width = CELL; cv.height = CELL; cv.className = 'sc-coat';
            var g = cv.getContext('2d');
            var grad = g.createLinearGradient(0, 0, CELL, CELL); grad.addColorStop(0, coat); grad.addColorStop(1, coat2);
            g.fillStyle = grad; g.fillRect(0, 0, CELL, CELL);
            g.fillStyle = 'rgba(255,255,255,0.18)';
            for (var k = 0; k < 14; k++) g.fillRect(((k * 53) % CELL), ((k * 37) % CELL), 22, 3);   /* 一點紋路，看起來像刮刮漆 */
            g.clearRect(0, 0, WINDOW, WINDOW);                                                      /* 左上角碎片窗 */
            el.appendChild(cv);
            board.appendChild(el);
            cells.push({ el: el, cv: cv, g: g, open: false, tick: 0 });
        })(i);

        /* 操作提示（只在第一次進遊戲時）：手指＋箭頭，在第一格上左右來回刮（刮哪一格沒有標準答案，只是示範怎麼刮） */
        if (kit.once('scratch.hint')) hint = kit.fingerHint(stage, { mode: 'drag', x: x0 + CELL / 2 - 40, y: y0 + CELL / 2 + 20, dx: 80, dy: 0, delay: 400, text: '請在格子上左右刮' });
        function hideHint() { if (hint) { hint.remove(); hint = null; } }

        function openCell(i) {
            var c = cells[i];
            if (c.open) return;
            c.open = true; c.el.classList.add('sc-cell--open');
            revealed.push(i);
            info.textContent = '已刮開 ' + revealed.length + ' 格';
            Sfx.play('pop');
            var w = winner(bd.cells, revealed);
            if (w) finish(w);
        }
        function finish(sym) {
            if (done) return;
            done = true; hideHint();
            Sfx.play('ok');
            cells.forEach(function (c, i) {
                if (!c.open) { c.open = true; c.el.classList.add('sc-cell--open', 'sc-cell--rest'); }
                if (bd.cells[i] === sym) c.el.classList.add('sc-cell--hit');
            });
            var n = revealed.length;
            my.after(1900, function () {
                api.finish(n, { lines: [
                    '你刮了 ' + n + ' 格，找到三個相同的圖案（最少只要 3 格）',
                    '每格的左上角碎片是線索：圓與愛心、三角與菱形、方與十字的碎片很像',
                    '想更少就再來一張'
                ] });
            });
        }

        /* 刮：只刮手指所在的那一格；每刮一小段就算一次已刮比例 */
        function cellAt(p) {
            var lx = p.x - x0, ly = p.y - y0;
            if (lx < 0 || ly < 0) return -1;
            var col = Math.floor(lx / (CELL + GAP)), row = Math.floor(ly / (CELL + GAP));
            if (col >= COLS || row >= ROWS) return -1;
            var inx = lx - col * (CELL + GAP), iny = ly - row * (CELL + GAP);
            if (inx > CELL || iny > CELL) return -1;
            return row * COLS + col;
        }
        function scratchAt(i, p, q) {
            var c = cells[i];
            if (c.open) return;
            var bx = x0 + (i % COLS) * (CELL + GAP), by = y0 + Math.floor(i / COLS) * (CELL + GAP);
            c.g.globalCompositeOperation = 'destination-out';
            c.g.lineWidth = BRUSH; c.g.lineCap = 'round'; c.g.lineJoin = 'round';
            c.g.beginPath(); c.g.moveTo((q || p).x - bx, (q || p).y - by); c.g.lineTo(p.x - bx, p.y - by); c.g.stroke();
            c.g.globalCompositeOperation = 'source-over';
            if (++c.tick % 3 === 0) checkCell(i);
        }
        function checkCell(i) {
            var c = cells[i];
            if (c.open) return;
            var data = c.g.getImageData(0, 0, CELL, CELL).data;
            if (clearedRatio(data, CELL, WINDOW, 4) >= SCRATCH_PCT) openCell(i);
        }
        var last = null, pid = null;
        stage.addEventListener('pointerdown', function (e) {
            if (done || last) return;
            var p = kit.localPt(e, stage), i = cellAt(p);
            if (i < 0) return;
            e.preventDefault();
            try { stage.setPointerCapture(e.pointerId); } catch (err) { }
            pid = e.pointerId; last = p; hideHint(); scratchAt(i, p, null);
        });
        stage.addEventListener('pointermove', function (e) {
            if (!last || e.pointerId !== pid || done) return;
            var p = kit.localPt(e, stage), i = cellAt(p);
            if (i >= 0) scratchAt(i, p, cellAt(last) === i ? last : null);
            last = p;
        });
        function end(e) {
            if (!last || e.pointerId !== pid) return;
            last = null;
            for (var i = 0; i < N; i++) checkCell(i);
        }
        stage.addEventListener('pointerup', end);
        stage.addEventListener('pointercancel', end);

        /* 驗證用：用真的 PointerEvent 在第 i 格上來回刮 */
        function fire(type, x, y) {
            var r = stage.getBoundingClientRect(), sc = r.width / (stage.clientWidth || r.width);
            stage.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, clientX: r.left + x * sc, clientY: r.top + y * sc }));
        }
        function scratchCell(i, full) {
            var bx = x0 + (i % COLS) * (CELL + GAP), by = y0 + Math.floor(i / COLS) * (CELL + GAP);
            var rows = full ? 5 : 1;
            fire('pointerdown', bx + 10, by + 10);
            for (var r = 0; r < rows; r++) {
                var y = by + 10 + r * 30;
                for (var s = 0; s <= 6; s++) fire('pointermove', bx + (r % 2 ? 130 - s * 20 : 10 + s * 20), y);
            }
            fire('pointerup', bx + 70, by + 70);
        }
        G.debug = {
            state: function () { return { board: bd, revealed: revealed.slice(), done: done }; },
            scratchCell: scratchCell,
            open: openCell,
            solve: function () {
                bd.cells.forEach(function (s, i) { if (s === bd.target) openCell(i); });
            },
            wrong: function () {
                /* 先把非目標的格子刮開（最多 9 個），最後才碰到目標 */
                bd.cells.forEach(function (s, i) { if (s !== bd.target) openCell(i); });
                bd.cells.forEach(function (s, i) { if (s === bd.target) openCell(i); });
            }
        };
    }

    var G = {
        id: ID,
        name: '刮刮樂推理',
        rule: '12 格刮刮樂裡**藏著 3 個一模一樣的圖案**。每一格的左上角先露出一小塊碎片，是線索。用手指在格子上來回刮，刮開超過三分之一就整格翻開。找到 3 個相同的就結束，**刮開的格數越少越好**！',
        mount: mount,
        score: SCORE,
        test: { makeBoard: makeBoard, winner: winner, symbolMarkup: symbolMarkup, clearedRatio: clearedRatio, rating: rating, SYMBOLS: SYMBOLS, LOOKALIKE: LOOKALIKE, COLS: COLS, ROWS: ROWS, CELL: CELL, WINDOW: WINDOW, SCRATCH_PCT: SCRATCH_PCT }
    };
    Reaction.register(G);
})();
