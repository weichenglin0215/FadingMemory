/* ═══════════════════════════════════════════════════════════════════
   reaction_whofirst.js — 秒反應・誰先亮
   樣式：css/games/reaction_whofirst.css（這款專屬的 class 一律以「whofirst-」開頭；共用元件在 css/reaction_common.css）
   左右兩盞燈先後亮起，點先亮的那一盞。時間差一關比一關小，縮到螢幕影格的極限。
   關卡制，答錯或逾時就結束，成績＝通過關數。
   ───────────────────────────────────────────────────────────────────
   · 時間差以「影格數」表示：第 1 關 FRAMES[0]＝18 影格（60Hz 約 0.3 秒）→ 到頂 FRAMES[1]＝2 影格（約 0.033 秒），線性。
     遊戲開始時先用 rAF 量 FRAME_SAMPLES 個影格的間隔取中位數當「1 影格＝幾毫秒」（量不到就當 60Hz）；
     顯示的時間差用實際量到的亮燈時刻差（4 位小數的秒）。
   · 兩盞燈都亮了才能按（不然只按已經亮的那盞就一定對）；按鈕在兩燈都亮之後才亮起。
   · V1.28（玩家意見）：燈的大小每一關慢慢縮小：第 1 關 LAMP[0]（220px）→ 第 RAMP_LEVELS 關 LAMP[1]（10px），線性；
     兩盞燈永遠貼近左右邊緣（離邊緣 EDGE＝20px），等於把兩盞燈拉開距離增加辨識難度；
     兩盞燈的大小依然故意有差異（一大一小，差 SIZE_JIT×(0.5～1)，大的一盞在左或右隨機）。
   · 兩盞燈的位置（靠兩側）、大小略有不同，不能靠亮度判斷；先亮的一側隨機，同側最多連續 3 次。
   · rAF 被暫停（分頁在背景）時有 setTimeout 保底：照設計的時間差亮第二盞燈。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'whofirst'：選單、成績、存檔都靠它；樣式在 css/games/reaction_whofirst.css，裡面的 class 名稱一律以 whofirst- 開頭。 */
    'use strict';

    var ID = 'whofirst';                                /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var FRAMES = [15, 1];                       /* 兩盞燈相差的影格數：第 1 關 → 到頂 */
    var WAIT_MS = [1200, 3000];                 /* 開始後隔多久第一盞燈亮 */
    var ANS_MS = 3000;                          /* 兩盞燈都亮之後的作答限時 */
    var LAMP = [220, 10];                       /* 燈的直徑（px）：第 1 關 → 到頂（最小 10px） */
    var EDGE = 20;                              /* 燈離畫面左右邊緣的距離（px） */
    var SIZE_JIT = 0.1;                        /* 兩盞燈大小的差：一盞是基準的 (1 − JIT×u)、另一盞是 (1 + JIT×u)，u 在 0.5～1 */
    var GAP_MIN = 8;                            /* 兩盞燈中間至少留的空隙（px；第 1 關兩盞 220 放不下時會自動縮到放得下） */
    var SAME_MAX = 3, FRAME_SAMPLES = 40;           /* SAME_MAX：同一側最多連續先亮幾次；FRAME_SAMPLES：測量畫面更新速度時取幾個影格當樣本 */
    var frameMs = 1000 / 60;                    /* 1 影格幾毫秒（開始時量測） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 第 level 關的燈基準直徑（px） */
    function lampAt(level) { return kit.ramp(level, LAMP[0], LAMP[1], RAMP_LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function framesAt(level) { return Math.round(kit.ramp(level, FRAMES[0], FRAMES[1], RAMP_LEVELS)); }  /* Math.round：四捨五入成整數 */
    function median(arr) { var a = arr.slice().sort(function (x, y) { return x - y; }); return a.length ? a[Math.floor(a.length / 2)] : 0; }  /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
    /* 由量到的影格間隔（毫秒）算出「1 影格」：離譜的值（< 4 或 > 34）退回 60Hz */
    function frameFrom(samples) { var m = median(samples); return m >= 4 && m <= 34 ? m : 1000 / 60; }
    /* 先亮的一側：同側最多連續 SAME_MAX 次 */
    function nextSide(hist, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var n = hist.length;
        if (n >= SAME_MAX) {
            var last = hist[n - 1], same = true;
            for (var i = 1; i <= SAME_MAX; i++) if (hist[n - i] !== last) { same = false; break; }
            if (same) return last === 'L' ? 'R' : 'L';
        }
        return rand() < 0.5 ? 'L' : 'R';
    }
    /* 出一關：sizeL／sizeR 是左右兩盞燈的直徑（px，一大一小、貼近兩側、放得進畫面寬 W、不小於 LAMP[1]） */
    function makeLevel(level, rand, hist, W) {
        rand = rand || Math.random; W = W || 472;
        var base = lampAt(level), cap = (W - 2 * EDGE - GAP_MIN) / 2;
        var u = kit.randFloat(0.5, 1, rand), small = base * (1 - SIZE_JIT * u), large = base * (1 + SIZE_JIT * u);  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
        large = Math.min(large, cap); small = Math.min(small, large - 1);                /* 放不下時，大的縮到放得下，小的再比它小一點 */
        small = Math.max(small, LAMP[1]); large = Math.max(large, small + 1);
        var leftBig = rand() < 0.5;
        return {
            first: nextSide(hist || [], rand), frames: framesAt(level), wait: Math.round(kit.randFloat(WAIT_MS[0], WAIT_MS[1], rand)),  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
            sizeL: leftBig ? large : small, sizeR: leftBig ? small : large, base: base
        };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 25) return '時間感知大師！';
        if (n >= 15) return '高手！';
        if (n >= 8) return '不錯喔！';
        if (n >= 4) return '再接再厲！';
        return '先抓住「誰先」的感覺，再來一次！';
    }
    /* 開始時量測影格間隔（rAF 不動就維持 60Hz） */
    function measureFrame() {
        var last = null, samples = [];
        function tick(now) {
            if (last != null) samples.push(now - last);
            last = now;
            if (samples.length < FRAME_SAMPLES) window.requestAnimationFrame(tick);  /* requestAnimationFrame：請瀏覽器在下一次畫面更新前呼叫函式（做動畫用，約每秒 60 次） */
            else frameMs = frameFrom(samples);
        }
        window.requestAnimationFrame(tick);             /* requestAnimationFrame：請瀏覽器在下一次畫面更新前呼叫函式（做動畫用，約每秒 60 次） */
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        measureFrame();
        var hist = [];
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關', '1 影格約 ' + (frameMs / 1000).toFixed(4) + ' 秒']; },
            setup: function (api) { if (api.level === 1) hist.length = 0; setup(api, hist); }
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api, hist) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makeLevel(level, api.rand, hist, stage.clientWidth || 472);
        hist.push(q.first);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[誰先亮] 第 ' + level + ' 關：' + (q.first === 'L' ? '左' : '右') + '邊先亮；時間差 ' + q.frames + ' 影格（約 ' + (q.frames * frameMs / 1000).toFixed(4) + ' 秒）；等 ' + q.wait + ' ms');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var lampL = h('div', { 'class': 'whofirst-lamp whofirst-lamp--a' }), lampR = h('div', { 'class': 'whofirst-lamp whofirst-lamp--b' });
        [[lampL, q.sizeL], [lampR, q.sizeR]].forEach(function (p) {  /* forEach：對陣列的每個元素各做一次 */
            p[0].style.width = p[1].toFixed(1) + 'px'; p[0].style.height = p[1].toFixed(1) + 'px';
            p[0].style.borderWidth = Math.max(1, Math.min(5, p[1] / 8)).toFixed(1) + 'px';          /* 燈很小的時候邊框也要細 */
        });
        var lamps = { L: lampL, R: lampR };
        var tip = h('div', { 'class': 'whofirst-tip', text: '兩盞燈會先後亮起，哪一盞先亮？' });  /* tip：盤面下方的提示文字（操作說明、出錯的原因會寫在這裡） */
        var row = h('div', { 'class': 'whofirst-row' }, [lampL, lampR]);
        var info = h('div', { 'class': 'whofirst-info', text: '準備…' });
        var bL = h('button', { 'class': 'btn btn--primary', text: '左邊先亮' }), bR = h('button', { 'class': 'btn btn--go', text: '右邊先亮' });
        bL.disabled = bR.disabled = true;
        stage.appendChild(tip); stage.appendChild(row); stage.appendChild(info);  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        stage.appendChild(h('div', { 'class': 'rx-btnrow' }, [bL, bR]));  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */

        var second = q.first === 'L' ? 'R' : 'L', lit = 0, tA = 0, tB = 0, ready = false, delta = q.frames * frameMs;
        function light(side) { lamps[side].classList.add('whofirst-lamp--on'); lit++; }  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
        function arm() {
            if (ready) return; ready = true;
            if (tB && tA) delta = tB - tA;
            bL.disabled = bR.disabled = false; info.textContent = '哪一盞先亮？';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            api.timer(ANS_MS, function () { judge(null); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        }
        function begin() {
            var k = 0, loop = api.my.loop(function (now) {  /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
                if (api.over || ready) return false;
                if (k === 0) { light(q.first); tA = now; }
                if (k === q.frames) { light(second); tB = now; arm(); return false; }
                k++;
            });
            /* 保底：rAF 被暫停時，照設計的時間差亮第二盞燈 */
            api.after(Math.round(q.frames * frameMs) + 400, function () { if (!ready) { loop.stop(); if (lit < 1) light(q.first); if (lit < 2) light(second); arm(); } });  /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
        }
        api.after(q.wait, begin);                       /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */

        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(side) {
            if (api.over) return;
            if (!ready) { if (lit < 1) light(q.first); if (lit < 2) light(second); ready = true; }
            var txt = '時間差 ' + (delta / 1000).toFixed(4) + ' 秒（' + q.frames + ' 影格）';
            info.textContent = txt;                     /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            lamps[q.first].classList.add('whofirst-lamp--first');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            lamps[q.first].style.borderWidth = Math.max(2, Math.min(8, (q.first === 'L' ? q.sizeL : q.sizeR) / 5)).toFixed(1) + 'px';
            if (side === q.first) { api.pass({ delay: 800 }); return; }  /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
            api.fail({                                  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
                delay: 1900, lines: [
                    (side == null ? '時間到！' : '選錯了！') + '先亮的是' + (q.first === 'L' ? '左邊' : '右邊') + '那一盞',
                    txt, '這一關的極限是 ' + q.frames + ' 影格；螢幕更新率越高，能分辨的時間越短'
                ]
            });
        }
        kit.onTap(bL, function () { judge('L'); });     /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
        kit.onTap(bR, function () { judge('R'); });     /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { judge(q.first); };
        api.wrong = function () { judge(second); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '誰先亮',
        rule: '左右兩盞燈會先後亮起，兩盞都亮了之後，**點「先亮的那一盞」**。兩盞燈的時間差一關比一關短，最後只差幾個畫面影格。答錯或來不及就結束，看你能過幾關。請讓畫面保持在前景。',
        mount: mount,
        score: SCORE,
        test: { lampAt: lampAt, LAMP: LAMP, EDGE: EDGE, GAP_MIN: GAP_MIN, framesAt: framesAt, median: median, frameFrom: frameFrom, nextSide: nextSide, makeLevel: makeLevel, rating: rating, RAMP_LEVELS: RAMP_LEVELS, MAX_LEVEL: MAX_LEVEL, FRAMES: FRAMES, WAIT_MS: WAIT_MS, SAME_MAX: SAME_MAX, SIZE_JIT: SIZE_JIT, MAX_LEVEL: MAX_LEVEL }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
