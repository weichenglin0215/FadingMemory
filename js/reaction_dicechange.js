/* ═══════════════════════════════════════════════════════════════════
   reaction_dicechange.js — 秒反應・骰子少一點（企劃 162）
   樣式：css/games/reaction_dicechange.css（這款專屬的 class 一律以「dicechange-」開頭；共用元件在 css/reaction_common.css）
   一排骰子先亮出來讓你記住，接著全部蓋住 3 秒，再亮出來時「有幾顆的點數被換掉了（只差 1 點）」，
   把被換過點數的骰子點出來。關卡制：點錯或來不及就結束，成績＝通過幾關。
   ───────────────────────────────────────────────────────────────────
   · 三個階段，畫面下方每個階段都有文字提醒：
       ① 「請記住盤面」（顯示時間依骰子數）→ ② 「盤面蓋住了」（固定 3 秒）→ ③ 「請點擊點數被更換過的骰子」。
   · 骰子數：第 1 關 2 顆，之後每關多 1 顆，最多 16 顆（4×4）；被換掉點數的骰子數：1 顆 → 2 顆（第 6 關起）→ 3 顆（第 13 關起）→
     4 顆（第 25 關起）。被換掉的骰子點數只差 1（1↔2、5↔6…），位置完全沒變（規範：差一點點的誘餌）。
   · 記憶顯示時間 ＝ (SHOW_BASE ＋ SHOW_PER × 骰子數) × 倍率（1.0 → 0.6，MUL_LEVELS 關走到頂）；
     作答限時 ＝ (ANS_BASE ＋ ANS_PER × 骰子數) × 倍率（1.2 → 0.8）。每顆被換過的骰子都要點到，點到沒換過的骰子就失敗。
   · 揭曉：被換過點數的骰子用橘框標出，下方寫出「3 → 4」。
   · V1.29（玩家意見）：(1) 點到沒有換過的骰子（答錯）時，那一顆的外框改成紅色虛線；
     (2) 骰子的 1 點與 4 點改成紅色的圓點（像真的骰子），而且 1 點的圓點放大（PIP_R1）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'dicechange'：選單、成績、存檔都靠它；樣式在 css/games/reaction_dicechange.css，裡面的 class 名稱一律以 dicechange- 開頭。 */
    'use strict';

    var ID = 'dicechange';                              /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var DICE_FIRST = 2, DICE_MAX = 16;          /* 第 1 關有幾顆骰子；最多幾顆（之後每關多 1 顆） */
    var CHANGED_STEPS = [[1, 1], [6, 2], [13, 3], [25, 4]];   /* [從第幾關起, 被換掉幾顆] */
    var COVER_MS = 3000;                        /* 蓋住的時間（毫秒，企劃指定 3 秒） */
    var SHOW_BASE = 2000, SHOW_PER = 500;       /* 記憶顯示時間（毫秒）＝ (SHOW_BASE ＋ SHOW_PER × 骰子數) × 倍率 */
    var SHOW_MUL = [1.0, 0.6];                  /* 倍率：第 1 關 → MUL_LEVELS 關 */
    var ANS_BASE = 4000, ANS_PER = 1000;         /* 作答限時（毫秒）＝ (ANS_BASE ＋ ANS_PER × 骰子數) × 倍率 */
    var ANS_MUL = [1.2, 0.8];                       /* 答題時間的倍率：第 1 關 1.2 倍 → 到頂 0.8 倍（越後面時間越短） */
    var MUL_LEVELS = 30;                        /* 倍率幾關之後到頂 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function diceFor(level) { return Math.min(DICE_MAX, DICE_FIRST + level - 1); }
    function changedFor(level) {
        var c = 1;
        CHANGED_STEPS.forEach(function (s) { if (level >= s[0]) c = s[1]; });
        return Math.min(c, Math.floor(diceFor(level) / 2));
    }
    function showMs(level) { return Math.round((SHOW_BASE + SHOW_PER * diceFor(level)) * kit.ramp(level, SHOW_MUL[0], SHOW_MUL[1], MUL_LEVELS)); }
    function ansMs(level) { return Math.round((ANS_BASE + ANS_PER * diceFor(level)) * kit.ramp(level, ANS_MUL[0], ANS_MUL[1], MUL_LEVELS)); }
    /* 骰子排成幾欄：2～3 顆排一列、4 顆 2×2、5～9 顆 3 欄、10 顆以上 4 欄 */
    function colsFor(n) { return n <= 3 ? n : (n === 4 ? 2 : (n <= 9 ? 3 : 4)); }
    /* 在 W×H 的區域排骰子：回傳每顆骰子的位置 { x, y }（左上角）與邊長 cell；最後一列不滿時置中 */
    function layout(n, W, H) {
        var cols = colsFor(n), rows = Math.ceil(n / cols), gap = 14;
        var cell = Math.floor(Math.min((W - (cols - 1) * gap) / cols, (H - (rows - 1) * gap) / rows, 150));
        var pos = [];
        for (var i = 0; i < n; i++) {
            var r = Math.floor(i / cols), c = i % cols, inRow = (r === rows - 1) ? n - r * cols : cols;
            var rowW = inRow * cell + (inRow - 1) * gap;
            pos.push({ x: Math.round((W - rowW) / 2 + c * (cell + gap)), y: Math.round((H - (rows * cell + (rows - 1) * gap)) / 2 + r * (cell + gap)) });
        }
        return { cols: cols, rows: rows, cell: cell, gap: gap, pos: pos };
    }
    /* 出一關：{ n, before（原本的點數）, after（最後亮出來的點數）, changed（被換掉的是第幾顆，由小到大） } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var n = diceFor(level), k = changedFor(level), i;
        var before = [];
        for (i = 0; i < n; i++) before.push(kit.randInt(1, 6, rand));
        var idx = []; for (i = 0; i < n; i++) idx.push(i);
        var changed = kit.sample(idx, k, rand).sort(function (a, b) { return a - b; });
        var after = before.slice();
        changed.forEach(function (c) {
            var v = before[c], opts = [];
            if (v > 1) opts.push(v - 1);
            if (v < 6) opts.push(v + 1);
            after[c] = kit.pick(opts, rand);
        });
        return { n: n, before: before, after: after, changed: changed };
    }
    /* 骰子的點：1～6 點的位置（用 3×3 格子的代號：a b c／d e f／g h i） */
    var FACES = { 1: 'e', 2: 'ai', 3: 'aei', 4: 'acgi', 5: 'acegi', 6: 'acdfgi' };
    var PIP = { a: [28, 28], b: [50, 28], c: [72, 28], d: [28, 50], e: [50, 50], f: [72, 50], g: [28, 72], h: [50, 72], i: [72, 72] };
    var PIP_R = 9, PIP_R1 = 17;                   /* 圓點半徑：一般 9，1 點放大成 17（真骰子的一點比較大） */
    function isRedFace(v) { return v === 1 || v === 4; }    /* 1 點與 4 點的圓點是紅色 */
    function pipRadius(v) { return v === 1 ? PIP_R1 : PIP_R; }
    function dieSvg(v) {
        var s = '<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="5" y="5" width="90" height="90" rx="18" class="dicechange-face"/>';
        FACES[v].split('').forEach(function (c) { s += '<circle cx="' + PIP[c][0] + '" cy="' + PIP[c][1] + '" r="' + pipRadius(v) + '" class="dicechange-pip' + (isRedFace(v) ? ' dicechange-pip--red' : '') + '"/>'; });
        return s + '</svg>';
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 25) return '記憶力驚人！';
        if (n >= 15) return '過目不忘！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '記住每顆骰子的點數，再來一次！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 6,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makeLevel(level, api.rand);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[骰子少一點] 第 ' + level + ' 關：' + q.n + ' 顆骰子 ' + q.before.join('') + ' → ' + q.after.join('') + '，被換掉的是第 ' + q.changed.map(function (c) { return c + 1; }).join('、') + ' 顆；記憶 ' + showMs(level) + ' ms，蓋住 ' + COVER_MS + ' ms，作答 ' + ansMs(level) + ' ms');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640, areaH = H - 120;
        var lay = layout(q.n, W, areaH);
        var msg = h('div', { 'class': 'qz-note dicechange-msg' });
        stage.appendChild(msg);
        var dice = q.before.map(function (v, i) {
            var d = h('div', { 'class': 'dicechange-die', html: dieSvg(v) });
            d.style.left = lay.pos[i].x + 'px'; d.style.top = lay.pos[i].y + 'px';
            d.style.width = d.style.height = lay.cell + 'px';
            stage.appendChild(d);
            return d;
        });
        var phase = 'show', found = 0, picked = {};
        function setFaces(vals) { dice.forEach(function (d, i) { d.innerHTML = dieSvg(vals[i]); d.classList.remove('dicechange-die--cover'); }); }
        function cover() { dice.forEach(function (d) { d.innerHTML = '<div class="dicechange-back">？</div>'; d.classList.add('dicechange-die--cover'); }); }
        msg.textContent = '請記住盤面（約 ' + Math.round(showMs(level) / 1000) + ' 秒）';
        api.after(showMs(level), function () {
            phase = 'cover'; cover();
            msg.textContent = '盤面蓋住了，請在心裡記住（' + (COVER_MS / 1000) + ' 秒）';
            api.after(COVER_MS, function () {
                phase = 'answer'; setFaces(q.after);
                msg.textContent = '請點擊點數被更換過的骰子（還有 ' + (q.changed.length - found) + ' 顆）';
                api.timer(ansMs(level), function () { reveal(null); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
                if (level === 1 && kit.once('dicechange.hint')) kit.hintOn(stage, dice[q.changed[0]], { mode: 'tap', delay: 700, text: '請點擊點數不一樣的骰子' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
            });
        });
        dice.forEach(function (d, i) {
            kit.onTap(d, function () {
                if (api.over || phase !== 'answer' || picked[i]) return;
                if (q.changed.indexOf(i) < 0) { reveal(i); return; }
                picked[i] = true; found++;
                d.classList.add('dicechange-die--found');
                Sfx.play('ok');
                msg.textContent = found >= q.changed.length ? '全部找到了！' : '請點擊點數被更換過的骰子（還有 ' + (q.changed.length - found) + ' 顆）';
                if (found >= q.changed.length) { phase = 'done'; reveal('ok'); }
            });
        });

        /* 揭曉：被換過的骰子用橘框＋「原本 → 後來」標出來 */
        function reveal(i) {
            if (api.over) return;
            phase = 'done';
            q.changed.forEach(function (c) {
                dice[c].classList.add(picked[c] ? 'dicechange-die--found' : 'dicechange-die--miss');
                var lab = h('div', { 'class': 'dicechange-chg', text: q.before[c] + ' → ' + q.after[c] });
                lab.style.left = lay.pos[c].x + 'px'; lab.style.top = (lay.pos[c].y + lay.cell - 6) + 'px'; lab.style.width = lay.cell + 'px';
                stage.appendChild(lab);
            });
            if (i === 'ok') { kit.flash(stage, true, api.my); api.pass({ delay: 1500 }); return; }
            if (typeof i === 'number') dice[i].classList.add('dicechange-die--wrong');
            kit.flash(stage, false, api.my);
            api.fail({
                delay: 2600, lines: [
                    (i == null ? '時間到！' : '那一顆的點數沒有變') + '（被換掉的有 ' + q.changed.length + ' 顆）',
                    '被換掉的：' + q.changed.map(function (c) { return '第 ' + (c + 1) + ' 顆 ' + q.before[c] + ' → ' + q.after[c]; }).join('、')
                ]
            });
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () {
            /* 驗證用：把被換掉的全部點出來（必須等到進入作答階段） */
            if (phase !== 'answer') return;
            q.changed.forEach(function (c) { if (!picked[c]) { picked[c] = true; found++; } });
            reveal('ok');
        };
        api.wrong = function () {
            if (phase !== 'answer') return;
            var other = 0; while (q.changed.indexOf(other) >= 0) other++;
            reveal(other);
        };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '骰子少一點',
        rule: '**先記住盤面上的骰子**，接著全部蓋住 3 秒，再亮出來時**有幾顆骰子的點數被換掉了（只差 1 點），把它們點出來**。一開始 2 顆骰子，之後每關多一顆，被換掉的也會越來越多。點錯或來不及就結束，看你能過幾關。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            diceFor: diceFor, changedFor: changedFor, showMs: showMs, ansMs: ansMs, colsFor: colsFor, layout: layout, makeLevel: makeLevel, dieSvg: dieSvg, isRedFace: isRedFace, pipRadius: pipRadius, PIP_R: PIP_R, PIP_R1: PIP_R1, rating: rating,
            DICE_FIRST: DICE_FIRST, DICE_MAX: DICE_MAX, COVER_MS: COVER_MS, MUL_LEVELS: MUL_LEVELS, MAX_LEVEL: MAX_LEVEL, CHANGED_STEPS: CHANGED_STEPS
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
