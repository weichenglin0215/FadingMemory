/* ═══════════════════════════════════════════════════════════════════
   reaction_fadee.js — 秒反應・淡到看不見
   視力表式：一次一個 E（台灣標準 E 字，三隻腳，開口朝上／下／左／右），E 的顏色一個比一個暗，
   最後幾乎和背景黑融在一起。手指往 E 的開口方向滑（超過 SWIPE_PX 就立刻判定）。
   關卡制，答錯或逾時就結束，成績＝通過幾個 E。
   ───────────────────────────────────────────────────────────────────
   · 背景是完全的黑色（沒有灰色方框）；E 是白色，第 1 個 E 是 100% 白，線性變暗，第 FADE_LEVELS（25）個 E 是 1% 白，
     之後（到第 40 個）維持 1% 白。E 的灰階值 ＝ round(255 × 百分比)，1% 白＝灰階 3。
     顯示的「對比」＝ 這個百分比（4 位小數）。
   · 每個 E 的方向一定和前一個不同（第 1 個固定朝右，配合操作提示）；每個 E 限時 TIME_S 秒（固定）。
   · E 用 canvas 逐像素畫（灰階值是精確的整數，不經過反鋸齒與顏色換算），沒有雜訊。
   · 答錯：把這個 E 畫成 100% 白再畫一次，讓你知道它其實在那裡。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'fadee';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 個', label: '通過個數', min: 1, max: 40 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var MAX_LEVEL = 80;                         /* 共幾個 E（要跟 SCORE.max 一致） */
    var FADE_LEVELS = 25;                       /* 第幾個 E 暗到最低；之後維持最低 */
    var FASE_RATE = 0.95;                        /* 每關的亮度遞減百分比 */
    var PCT_MAX = 50, PCT_MIN = 1;             /* E 的白色百分比：第 1 個 → 第 FADE_LEVELS 個 */
    var TIME_S = 30.0;                           /* 每個 E 的限時（秒） */
    var SWIPE_PX = 24;                          /* 滑超過多少 px 就判定 */
    var CELL = 60, PANEL = 360;                 /* E 的每格大小（5×5 格）、灰色面板邊長（px） */
    var BOOST_PCT = 100;                        /* 答錯時揭曉用的白色百分比 */
    var DIRS = ['up', 'right', 'down', 'left'];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 已取消，第 level 個 E 的白色百分比：第 1 個 100%，線性降到第 FADE_LEVELS 個的 1%，之後維持 1% */
    function pctAt(level) {
        //var t = Math.min(1, Math.max(0, (level - 1) / (FADE_LEVELS - 1)));
        //return PCT_MAX + (PCT_MIN - PCT_MAX) * t;
        /* 第 level 個 E 的白色百分比：第 1 個 100%，指數遞減 0.95，最低是1%*/
        var t = Math.pow(FASE_RATE, level - 1);
        return Math.max(PCT_MIN, PCT_MAX * t);
    }
    /* 百分比 → 灰階值（0～255 的整數） */
    function valueOf(pct) { return Math.round(255 * pct / 100); }
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
    /* 畫一個 E 到 canvas（灰階像素）：背景純黑（0），E 是灰階值 value（0～255） */
    function paintE(cv, dir, value) {
        var g = cv.getContext('2d'), img = g.createImageData(PANEL, PANEL), d = img.data, off = (PANEL - 5 * CELL) / 2;
        for (var y = 0; y < PANEL; y++) for (var x = 0; x < PANEL; x++) {
            var cx = Math.floor((x - off) / CELL), cy = Math.floor((y - off) / CELL);
            var inside = x >= off && y >= off && cx >= 0 && cx < 5 && cy >= 0 && cy < 5 && inE(dir, cy, cx);
            var v = inside ? value : 0, i = (y * PANEL + x) * 4;
            d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
    }
    function rating(n) {
        if (n >= 60) return '鷹眼！';
        if (n >= 40) return '高手！';
        if (n >= 20) return '不錯喔！';
        if (n >= 5) return '再接再厲！';
        return '把螢幕亮度調到中等，再試一次！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 6,
            head: function (lv) { return '第 ' + lv + ' 個'; },
            info: function (S) { return '亮度 ' + pctAt(S.level).toFixed(4) + '%'; },
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
        var dir = level === 1 ? 'right' : nextDir(lastDir, api.rand), pct = pctAt(level), value = valueOf(pct);
        lastDir = dir;
        api.info = { dir: dir, pct: pct, value: value };
        console.log('[淡到看不見] 第 ' + level + ' 個：開口朝' + dir + '，白色 ' + pct.toFixed(4) + '%（灰階 ' + value + '）');

        var cv = document.createElement('canvas');
        cv.width = PANEL; cv.height = PANEL; cv.className = 'fe-canvas';
        paintE(cv, dir, value);
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
            paintE(cv, dir, valueOf(BOOST_PCT));
            cv.classList.add('fe-canvas--bad');
            note.textContent = '加亮之後：E 的開口朝' + { up: '上', down: '下', left: '左', right: '右' }[dir];
            api.fail({
                delay: 1700, lines: [
                    (d == null ? '時間到！' : '滑錯了！') + 'E 的開口朝' + { up: '上', down: '下', left: '左', right: '右' }[dir],
                    '這個 E 是 ' + pct.toFixed(4) + '% 的白色（灰階 ' + value + '，背景是純黑 0）',
                    '把螢幕亮度調到中等，看得更清楚'
                ]
            });
        }
        api.solve = function () { judge(dir); };
        api.wrong = function () { judge(DIRS.filter(function (x) { return x !== dir; })[0]); };
    }

    var G = {
        id: ID,
        name: '淡到看不見',
        rule: '黑色背景上有一個白色的 E，開口朝上、下、左、右其中一邊，**手指往開口的方向滑**。E 一個比一個暗，最後幾乎和背景一樣黑。答錯或來不及就結束，看你能看清楚幾個。**請把螢幕亮度調到中等**。遊戲視力，不是真正的視力檢查。',
        mount: mount,
        score: SCORE,
        test: { pctAt: pctAt, valueOf: valueOf, nextDir: nextDir, inE: inE, dirOf: dirOf, paintE: paintE, rating: rating, DIRS: DIRS, MAX_LEVEL: MAX_LEVEL, FADE_LEVELS: FADE_LEVELS, PCT_MAX: PCT_MAX, PCT_MIN: PCT_MIN, PANEL: PANEL, CELL: CELL, SWIPE_PX: SWIPE_PX }
    };
    Reaction.register(G);
})();
