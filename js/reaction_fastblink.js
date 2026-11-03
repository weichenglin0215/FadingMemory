/* ═══════════════════════════════════════════════════════════════════
   reaction_fastblink.js — 秒反應・誰閃得快（企劃 151）
   樣式：css/games/reaction_fastblink.css（這款專屬的 class 一律以「fastblink-」開頭；共用元件在 css/reaction_common.css）
   左右各一個圓點在閃爍，點「閃得比較快」的那一個。兩個圓點的顏色、位置、閃爍的起點都不一樣，
   一開始快的是慢的 2 倍，越後面兩邊的快慢越接近（最後只差 5％）。
   關卡制：點錯或來不及就結束，成績＝通過幾關。
   ───────────────────────────────────────────────────────────────────
   · 閃爍是「時間的純函式」（規範 T3）：isOn(頻率, 起始相位, 秒數)＝一個週期的前半亮、後半暗，
     畫面（rAF）只是每影格把同一個函式畫出來；跟影格率無關，所以 60／120 Hz 的螢幕看到的快慢一樣。
   · 難度（RAMP_LEVELS 關走到頂）：快／慢的頻率比 RATIO[0] → RATIO[1]；慢的那顆頻率每關在 SLOW_HZ 範圍內隨機，
     所以「看起來閃得快不快」不能靠記住某個絕對頻率。
   · V1.34（玩家意見：第 3 關到第 16 關幾乎感受不到難度差異）：原本頻率比用「線性」從 3.0 降到 1.05，第 3～16 關的比值是 2.84 → 1.78——
     快的比慢的快將近一倍以上，眼睛一看就分得出來，這一大段關卡的感覺都一樣簡單；難度全擠在比值低於 1.7 的最後 9 關。
     人對「快慢差多少」的感受看的是比例（差距變成一半＝難度差不多是增加固定的一步），不是相減；所以改成對「差距（比值 − 1）」做等比例縮小
     （RATIO_LOG ＝ true）：每過一關，快慢的差距都變成上一關的固定比例（約 0.86 倍），第 3 關差 147%、第 8 關差 67%、第 13 關差 31%、第 16 關差 20%、第 20 關差 10%、
     第 25 關差 5%，每一關都比前一關更難分辨。RATIO_LOG 設成 false 就回到舊的線性。
   · 左右哪邊快、哪個顏色快、閃爍起點（相位），每關都隨機。
   · 揭曉：兩邊的頻率並排（例如 4.0000 Hz 對 4.2000 Hz），閃得快的那顆圈起來。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'fastblink'：選單、成績、存檔都靠它；樣式在 css/games/reaction_fastblink.css，裡面的 class 名稱一律以 fastblink- 開頭。 */
    'use strict';

    var ID = 'fastblink';                               /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var RATIO = [3.0, 1.05];                    /* 快／慢的頻率比：第 1 關 → 到頂 */
    var RATIO_LOG = true;                       /* true＝對「差距（比值 − 1）」等比例縮小，每一關的難度感都往前一步（V1.34）；false＝比值線性縮小（舊版：前面一大段關卡都一樣簡單） */
    var SLOW_HZ = [0.33, 3.0];                   /* 慢的那顆頻率的隨機範圍（赫茲＝每秒閃幾下） */
    var ANS_S = [15, 20];                         /* 作答限時（秒）：第 1 關 → 到頂 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 第 level 關的快／慢頻率比。RATIO_LOG：差距 d ＝ 比值 − 1 從 RATIO[0] − 1 等比例縮小到 RATIO[1] − 1（d(level) ＝ d0 × (d1 ÷ d0)^t，t 從 0 走到 1）；否則線性 */
    function ratioFor(level) {
        if (!RATIO_LOG) return kit.ramp(level, RATIO[0], RATIO[1], RAMP_LEVELS);  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
        var d0 = RATIO[0] - 1, d1 = RATIO[1] - 1, t = kit.ramp(level, 0, 1, RAMP_LEVELS);  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
        return 1 + d0 * Math.pow(d1 / d0, t);
    }
    function ansMs(level) { return Math.round(kit.ramp(level, ANS_S[0], ANS_S[1], RAMP_LEVELS) * 1000); }  /* Math.round：四捨五入成整數 */
    /* 頻率 f（赫茲）、起始相位 phase（0～1）的圓點，在第 t 秒是亮的嗎？一個週期的前半亮、後半暗 */
    function isOn(f, phase, t) {
        var x = f * t + phase;
        return x - Math.floor(x) < 0.5;                 /* Math.floor：無條件捨去成整數 */
    }
    /* 出一關：{ slow, fast（頻率）, ratio, fastSide 'L'|'R', phL, phR（兩邊的起始相位）, hueSwap 左邊用不用第二種顏色 } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var ratio = ratioFor(level);
        var slow = kit.randFloat(SLOW_HZ[0], SLOW_HZ[1], rand), fast = slow * ratio;  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
        /* 慢的頻率取到小數 1 位、快的取到小數 3 位（揭曉時寫成 4.0000 Hz 這種好讀的數字；快的多留一位，慢的頻率只有 0.3 Hz 左右時，比值才不會被四捨五入吃掉 1～2％ ） */
        slow = Math.round(slow * 10) / 10; fast = Math.round(slow * ratio * 1000) / 1000;  /* Math.round：四捨五入成整數 */
        return { slow: slow, fast: fast, ratio: fast / slow, fastSide: rand() < 0.5 ? 'L' : 'R', phL: rand(), phR: rand(), swap: rand() < 0.5 };
    }
    /* 數一數：在 [0, T] 秒內，頻率 f 的圓點「亮起來」幾次（驗證用） */
    function countFlashes(f, phase, T, step) {
        step = step || 0.001;
        var n = 0, prev = isOn(f, phase, 0);
        for (var t = step; t <= T; t += step) { var cur = isOn(f, phase, t); if (cur && !prev) n++; prev = cur; }
        return n;
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 30) return '節奏感超強！';
        if (n >= 18) return '眼睛很敏銳！';
        if (n >= 10) return '不錯喔！';
        if (n >= 4) return '再接再厲！';
        return '多看幾次，節奏會越來越清楚！';
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
        console.log('[誰閃得快] 第 ' + level + ' 關：慢 ' + q.slow.toFixed(4) + ' Hz、快 ' + q.fast.toFixed(4) + ' Hz（比 ' + q.ratio.toFixed(4) + '），快的在' + (q.fastSide === 'L' ? '左' : '右') + '，限時 ' + ansMs(level) + ' ms');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var R = 70;
        function mkDot(side, cx, cy, cls) {
            var d = h('div', { 'class': 'fastblink-dot ' + cls });
            d.style.width = d.style.height = (2 * R) + 'px';
            d.style.left = (cx - R) + 'px'; d.style.top = (cy - R) + 'px';
            var lab = h('div', { 'class': 'fastblink-hz' });
            lab.style.left = (cx - 100) + 'px'; lab.style.top = (cy + R + 14) + 'px';
            stage.appendChild(d); stage.appendChild(lab);  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
            kit.onTap(d, function () { judge(side); }); /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
            return { el: d, lab: lab };
        }
        /* 兩顆圓點的位置也不一樣高（規範：亮度與位置不同），左右各自上下偏一點 */
        var yL = Math.round(H * 0.3) + kit.randInt(-30, 30, api.rand), yR = Math.round(H * 0.3) + kit.randInt(-30, 30, api.rand);  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
        var dotL = mkDot('L', Math.round(W * 0.27), yL, q.swap ? 'fastblink-dot--b' : 'fastblink-dot--a');
        var dotR = mkDot('R', Math.round(W * 0.73), yR, q.swap ? 'fastblink-dot--a' : 'fastblink-dot--b');
        var tip = h('div', { 'class': 'qz-note fastblink-tip', text: '點閃得比較快的圓點' });
        stage.appendChild(tip);                         /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var fL = q.fastSide === 'L' ? q.fast : q.slow, fR = q.fastSide === 'R' ? q.fast : q.slow;
        var t0 = performance.now();                     /* performance.now()：高精度的時間（毫秒），計時用 */
        var loop = api.my.loop(function () {            /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
            if (api.over) return false;
            var t = (performance.now() - t0) / 1000;    /* performance.now()：高精度的時間（毫秒），計時用 */
            dotL.el.classList.toggle('fastblink-dot--on', isOn(fL, q.phL, t));  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            dotR.el.classList.toggle('fastblink-dot--on', isOn(fR, q.phR, t));  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
        });
        api.timer(ansMs(level), function () { judge(null); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        if (level === 1 && kit.once('fastblink.hint')) kit.hintOn(stage, q.fastSide === 'L' ? dotL.el : dotR.el, { mode: 'tap', delay: 600, text: '請點擊閃得比較快的圓點' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */

        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(side) {
            if (api.over) return;
            loop.stop();
            var ok = side === q.fastSide;
            dotL.el.classList.remove('fastblink-dot--on'); dotR.el.classList.remove('fastblink-dot--on');
            dotL.lab.textContent = fL.toFixed(4) + ' Hz'; dotR.lab.textContent = fR.toFixed(4) + ' Hz';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            (q.fastSide === 'L' ? dotL : dotR).el.classList.add('fastblink-dot--right');
            if (side != null && !ok) (side === 'L' ? dotL : dotR).el.classList.add('fastblink-dot--wrong');
            tip.textContent = '快 ' + q.fast.toFixed(4) + ' Hz　慢 ' + q.slow.toFixed(4) + ' Hz　（快的是慢的 ' + q.ratio.toFixed(4) + ' 倍）';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 1300 }); return; }  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            kit.flash(stage, false, api.my);            /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            api.fail({                                  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
                delay: 2400, lines: [
                    (side == null ? '時間到！' : '你選到比較慢的那顆') + '，閃得快的在' + (q.fastSide === 'L' ? '左邊' : '右邊'),
                    '左邊 ' + fL.toFixed(4) + ' Hz　右邊 ' + fR.toFixed(4) + ' Hz'
                ]
            });
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { judge(q.fastSide); };
        api.wrong = function () { judge(q.fastSide === 'L' ? 'R' : 'L'); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '誰閃得快',
        rule: '左右各有一個圓點在閃爍，**點「閃得比較快」的那一個**。兩個圓點的顏色、位置、閃爍的起點都不一樣。點錯或來不及就結束，看你能過幾關。越後面，兩邊的快慢越接近，每一關都比上一關更難分辨！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            ratioFor: ratioFor, ansMs: ansMs, isOn: isOn, makeLevel: makeLevel, countFlashes: countFlashes, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, RATIO_LOG: RATIO_LOG, RATIO: RATIO, SLOW_HZ: SLOW_HZ, ANS_S: ANS_S, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
