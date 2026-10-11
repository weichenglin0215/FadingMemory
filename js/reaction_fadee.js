/* ═══════════════════════════════════════════════════════════════════
   reaction_fadee.js — 秒反應・淡到看不見
   視力表式：一次一個 E（台灣標準 E 字，三隻腳，開口朝上／下／左／右），E 的顏色一個比一個淡，
   最後幾乎和背景灰融在一起。手指往 E 的開口方向滑（超過 SWIPE_PX 就立刻判定）。
   關卡制，答錯或逾時就結束，成績＝通過幾個 E。
   ───────────────────────────────────────────────────────────────────
   · 背景是中灰（GRAY ＝ 128），E 的灰度 ＝ 128 ＋ Δ；Δ 從 DELTA_START（40）開始，每關減 1，到 1 為止
     （共 40 個 E）。顯示的「對比」＝ Δ ÷ 128，4 位小數的百分比（Δ＝1 是 0.7813%）。
   · 背景加細微雜訊（每像素 ±1 階），只在 Δ ≥ NOISE_FROM（3）時加，不然 Δ＝1、2 完全看不到。
   · 每個 E 的方向一定和前一個不同（第 1 個固定朝右，配合操作提示）；每個 E 限時 TIME_S 秒（固定）。
   · E 用 canvas 逐像素畫（灰階值是精確的整數，不經過反鋸齒與顏色換算）。
   · 答錯：把這個 E 加強對比再畫一次，讓你知道它其實在那裡。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'fadee';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 個', label: '通過個數', min: 1, max: 40 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var GRAY = 128;                             /* 背景灰階值 */
    var DELTA_START = 40;                       /* 第 1 個 E 比背景亮幾階 */
    var NOISE_FROM = 3;                         /* Δ 大於等於這個值才加雜訊 */
    var TIME_S = 4.0;                           /* 每個 E 的限時（秒） */
    var SWIPE_PX = 24;                          /* 滑超過多少 px 就判定 */
    var CELL = 40, PANEL = 360;                 /* E 的每格大小（5×5 格）、灰色面板邊長（px） */
    var BOOST = 60;                             /* 答錯時揭曉用的加強對比（階） */
    var DIRS = ['up', 'right', 'down', 'left'];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function deltaAt(level) { return Math.max(1, DELTA_START + 1 - level); }
    function contrastPct(delta) { return delta / GRAY * 100; }
    /* 下一個方向：一定和前一個不同 */
    function nextDir(prev, rand) {
        rand = rand || Math.random;
        var c = DIRS.filter(function (d) { return d !== prev; });
        return kit.pick(c, rand);
    }
    /* E 的 5×5 格：基本款開口朝右（脊柱在左，三隻腳在第 0、2、4 列朝右）；
       dir 是開口方向，把格子座標旋轉回基本款來查 */
    function inE(dir, r, c) {
        var rr, cc;
        if (dir === 'right') { rr = r; cc = c; }
        else if (dir === 'down') { rr = 4 - c; cc = r; }
        else if (dir === 'left') { rr = 4 - r; cc = 4 - c; }
        else { rr = c; cc = 4 - r; }
        return cc === 0 || rr % 2 === 0;
    }
    /* 判定滑動方向：比較 |dx| 與 |dy|，只回傳上下左右四種 */
    function dirOf(dx, dy) {
        if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
        return dy >= 0 ? 'down' : 'up';
    }
    /* 畫一個 E 到 canvas（灰階像素）；回傳畫出的 E 的像素灰階值（給測試與除錯用） */
    function paintE(cv, dir, delta, rand) {
        rand = rand || Math.random;
        var g = cv.getContext('2d'), img = g.createImageData(PANEL, PANEL), d = img.data, off = (PANEL - 5 * CELL) / 2;
        var noisy = delta >= NOISE_FROM;
        for (var y = 0; y < PANEL; y++) for (var x = 0; x < PANEL; x++) {
            var cx = Math.floor((x - off) / CELL), cy = Math.floor((y - off) / CELL);
            var inside = x >= off && y >= off && cx >= 0 && cx < 5 && cy >= 0 && cy < 5 && inE(dir, cy, cx);
            var v = GRAY + (inside ? delta : 0) + (noisy ? Math.floor(rand() * 3) - 1 : 0), i = (y * PANEL + x) * 4;
            d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
    }
    function rating(n) {
        if (n >= 30) return '鷹眼！';
        if (n >= 20) return '高手！';
        if (n >= 10) return '不錯喔！';
        if (n >= 5) return '再接再厲！';
        return '把螢幕亮度調到中等，再試一次！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: DELTA_START, goodAt: 6,
            head: function (lv) { return '第 ' + lv + ' 個'; },
            info: function (S) { return '對比 ' + contrastPct(deltaAt(S.level)).toFixed(4) + '%'; },
            numText: function (v) { return v + ' 個'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 個 E']; },
            note: '遊戲視力，不是真正的視力檢查',
            stageClass: 'fe-stage',
            setup: setup
        });
    }

    var lastDir = null;
    function setup(api) {
        var stage = api.stage, level = api.level;
        if (level === 1) lastDir = null;
        var dir = level === 1 ? 'right' : nextDir(lastDir, api.rand), delta = deltaAt(level);
        lastDir = dir;
        api.info = { dir: dir, delta: delta };
        console.log('[淡到看不見] 第 ' + level + ' 個：開口朝' + dir + '，Δ ' + delta + ' 階（對比 ' + contrastPct(delta).toFixed(4) + '%）');

        var cv = document.createElement('canvas');
        cv.width = PANEL; cv.height = PANEL; cv.className = 'fe-canvas';
        paintE(cv, dir, delta, api.rand);
        stage.appendChild(cv);
        var note = h('div', { 'class': 'fe-note', text: '往 E 的開口方向滑動' });
        stage.appendChild(note);
        var hint = null;
        /* 操作提示（只在第一次進遊戲時）：手指＋箭頭，第一個 E 的開口朝右，手指就往右滑（第一關的正確答案） */
        if (level === 1 && kit.once('fadee.hint')) hint = kit.fingerHint(stage, { mode: 'drag', x: 236 - 50, y: 370, dx: 110, dy: 0, delay: 300 });

        var start = null, pid = null, judged = false;
        stage.addEventListener('pointerdown', function (e) {
            if (api.over || start) return;
            e.preventDefault();
            try { stage.setPointerCapture(e.pointerId); } catch (err) { }
            start = kit.localPt(e, stage); pid = e.pointerId;
            if (hint) { hint.remove(); hint = null; }
        });
        stage.addEventListener('pointermove', function (e) {
            if (!start || judged || e.pointerId !== pid || api.over) return;
            var p = kit.localPt(e, stage), dx = p.x - start.x, dy = p.y - start.y;
            if (Math.sqrt(dx * dx + dy * dy) >= SWIPE_PX) { judged = true; judge(dirOf(dx, dy)); }
        });
        function endSwipe(e) { if (e.pointerId === pid) { start = null; pid = null; } }
        stage.addEventListener('pointerup', endSwipe);
        stage.addEventListener('pointercancel', endSwipe);
        api.timer(Math.round(TIME_S * 1000), function () { judge(null); });

        function judge(d) {
            if (api.over) return;
            if (hint) { hint.remove(); hint = null; }
            if (d === dir) { cv.classList.add('fe-canvas--ok'); api.pass({ delay: 320 }); return; }
            paintE(cv, dir, BOOST, api.rand);
            cv.classList.add('fe-canvas--bad');
            note.textContent = '加強對比後：E 的開口朝' + { up: '上', down: '下', left: '左', right: '右' }[dir];
            api.fail({ delay: 1700, lines: [
                (d == null ? '時間到！' : '滑錯了！') + 'E 的開口朝' + { up: '上', down: '下', left: '左', right: '右' }[dir],
                '這個 E 的對比是 ' + contrastPct(delta).toFixed(4) + '%（背景灰階 ' + GRAY + '，E 灰階 ' + (GRAY + delta) + '）',
                '把螢幕亮度調到中等，看得更清楚'
            ] });
        }
        api.solve = function () { judge(dir); };
        api.wrong = function () { judge(DIRS.filter(function (x) { return x !== dir; })[0]); };
    }

    var G = {
        id: ID,
        name: '淡到看不見',
        rule: '灰色背景上有一個 E，開口朝上、下、左、右其中一邊，**手指往開口的方向滑**。E 一個比一個淡，最後幾乎和背景一樣。答錯或來不及就結束，看你能看清楚幾個。**請把螢幕亮度調到中等**。遊戲視力，不是真正的視力檢查。',
        mount: mount,
        score: SCORE,
        test: { deltaAt: deltaAt, contrastPct: contrastPct, nextDir: nextDir, inE: inE, dirOf: dirOf, paintE: paintE, rating: rating, DIRS: DIRS, GRAY: GRAY, DELTA_START: DELTA_START, NOISE_FROM: NOISE_FROM, PANEL: PANEL, CELL: CELL, SWIPE_PX: SWIPE_PX }
    };
    Reaction.register(G);
})();
