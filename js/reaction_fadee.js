/* ═══════════════════════════════════════════════════════════════════
   reaction_fadee.js — 秒反應・淡到看不見
   樣式：css/games/reaction_fadee.css（這款專屬的 class 一律以「fadee-」開頭；共用元件在 css/reaction_common.css）
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
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'fadee'：選單、成績、存檔都靠它；樣式在 css/games/reaction_fadee.css，裡面的 class 名稱一律以 fadee- 開頭。 */
    'use strict';

    var ID = 'fadee';                                   /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 個', label: '通過個數', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var MAX_LEVEL = 90;                         /* 共幾個 E（要跟 SCORE.max 一致） */
    var FADE_LEVELS = 25;                       /* 第幾個 E 暗到最低；之後維持最低 */
    var FASE_RATE = 0.95;                        /* 每關的亮度遞減百分比 */
    var PCT_MAX = 50, PCT_MIN = 1;             /* E 的白色百分比：第 1 個 → 第 FADE_LEVELS 個 */
    var TIME_S = 30.0;                           /* 每個 E 的限時（秒） */
    var SWIPE_PX = 24;                          /* 滑超過多少 px 就判定 */
    var CELL = 60, PANEL = 360;                 /* E 的每格大小（5×5 格）、灰色面板邊長（px） */
    var BOOST_PCT = 100;                        /* 答錯時揭曉用的白色百分比 */
    var DIRS = ['up', 'right', 'down', 'left'];     /* 開口的四個方向（上、右、下、左），依順時針排列 */

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
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
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
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 60) return '鷹眼！';
        if (n >= 40) return '高手！';
        if (n >= 20) return '不錯喔！';
        if (n >= 5) return '再接再厲！';
        return '把螢幕亮度調到中等，再試一次！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 6,
            head: function (lv) { return '第 ' + lv + ' 個'; },
            info: function (S) { return '亮度 ' + pctAt(S.level).toFixed(4) + '%'; },
            numText: function (v) { return v + ' 個'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 個 E']; },
            note: '遊戲視力，不是真正的視力檢查',
            stageClass: 'fadee-stage',
            setup: setup
        });
    }

    var lastDir = null;
    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        if (level === 1) lastDir = null;
        var dir = level === 1 ? 'right' : nextDir(lastDir, api.rand), pct = pctAt(level), value = valueOf(pct);
        lastDir = dir;
        api.info = { dir: dir, pct: pct, value: value };
        console.log('[淡到看不見] 第 ' + level + ' 個：開口朝' + dir + '，白色 ' + pct.toFixed(4) + '%（灰階 ' + value + '）');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var cv = document.createElement('canvas');
        cv.width = PANEL; cv.height = PANEL; cv.className = 'fadee-canvas';
        paintE(cv, dir, value);
        stage.appendChild(cv);
        var note = h('div', { 'class': 'fadee-note', text: '往 E 的開口方向滑動' });
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
        api.timer(Math.round(TIME_S * 1000), function () { judge(null); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */

        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(d) {
            if (api.over) return;
            if (hint) { hint.remove(); hint = null; }
            if (d === dir) { cv.classList.add('fadee-canvas--ok'); api.pass({ delay: 320 }); return; }
            paintE(cv, dir, valueOf(BOOST_PCT));
            cv.classList.add('fadee-canvas--bad');
            note.textContent = '加亮之後：E 的開口朝' + { up: '上', down: '下', left: '左', right: '右' }[dir];
            api.fail({
                delay: 1700, lines: [
                    (d == null ? '時間到！' : '滑錯了！') + 'E 的開口朝' + { up: '上', down: '下', left: '左', right: '右' }[dir],
                    '這個 E 是 ' + pct.toFixed(4) + '% 的白色（灰階 ' + value + '，背景是純黑 0）',
                    '把螢幕亮度調到中等，看得更清楚'
                ]
            });
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { judge(dir); };
        api.wrong = function () { judge(DIRS.filter(function (x) { return x !== dir; })[0]); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '淡到看不見',
        rule: '黑色背景上有一個白色的 E，開口朝上、下、左、右其中一邊，**手指往開口的方向滑**。E 一個比一個暗，最後幾乎和背景一樣黑。答錯或來不及就結束，看你能看清楚幾個。**請把螢幕亮度調到中等**。遊戲視力，不是真正的視力檢查。',
        mount: mount,
        score: SCORE,
        test: { pctAt: pctAt, valueOf: valueOf, nextDir: nextDir, inE: inE, dirOf: dirOf, paintE: paintE, rating: rating, DIRS: DIRS, MAX_LEVEL: MAX_LEVEL, FADE_LEVELS: FADE_LEVELS, PCT_MAX: PCT_MAX, PCT_MIN: PCT_MIN, FASE_RATE: FASE_RATE, PANEL: PANEL, CELL: CELL, SWIPE_PX: SWIPE_PX }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
