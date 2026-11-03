/* ═══════════════════════════════════════════════════════════════════
   reaction_tapback.js — 秒反應・倒著點（企劃 168）
   樣式：css/games/reaction_tapback.css（這款專屬的 class 一律以「tapback-」開頭；共用元件在 css/reaction_common.css）
   畫面上有幾個圓點的位置（淡淡的圓圈），圓點會一個一個依序亮起來（位置隨機），
   亮完之後，要「倒著」把它們依序點回去（最後亮的最先點）。是「倒背數字」的位置版。
   關卡制：點錯或來不及就結束，成績＝通過幾關。
   ───────────────────────────────────────────────────────────────────
   · 難度線性：要記的圓點數 3 個 → 8 個（每 LEN_EVERY 關多 1 個，到第 (8−3)×LEN_EVERY+1 關到頂）；
     圓點到頂之後靠「亮得更快」繼續變難：每個圓點亮起的時間 FLASH_MS 800 → 350 毫秒（SPEED_LEVELS 關走到頂）。
   · 出題（規範 Q1、Q15）：先決定「位置」——每個位置離邊緣至少 MARGIN、任兩個位置圓心至少相距 MIN_GAP（手指點得到、不會點到隔壁），
     再決定順序（隨機排列）；所以玩家一定辦得到。
   · 位置的小圓圈一開始就全部畫出來（淡淡的），玩家要記的是「順序」，不是要憑空記座標。
   · 按對時那個圓圈會變綠；按錯馬上結束，並把正確的倒著順序標上數字（1 最先點）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'tapback'：選單、成績、存檔都靠它；樣式在 css/games/reaction_tapback.css，裡面的 class 名稱一律以 tapback- 開頭。 */
    'use strict';

    var ID = 'tapback';                                 /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var LEN = [3, 8];                           /* 要記幾個圓點：第 1 關 → 最多 */
    var LEN_EVERY = 2;                          /* 每幾關多記 1 個 */
    var SPEED_LEVELS = 30;                      /* 亮得更快的難度幾關之後到頂 */
    var FLASH_MS = [800, 350];                  /* 每個圓點亮起的時間（毫秒）：第 1 關 → 到頂 */
    var GAP_MS = [260, 120];                    /* 兩個圓點之間的空檔（毫秒）：第 1 關 → 到頂 */
    var ANS_BASE = 3000, ANS_PER = 1200;        /* 作答限時（毫秒）＝ (ANS_BASE ＋ ANS_PER × 圓點數) × 倍率 */
    var ANS_MUL = [1.2, 0.85];                  /* 倍率：第 1 關 → 到頂 */
    var MARGIN = 54;                            /* 圓點離遊戲區邊緣至少多遠 */
    var MIN_GAP = 104;                          /* 任兩個圓點圓心至少相距多少 */
    var DOT_R = 38;                             /* 圓圈的半徑（命中範圍也是這個大小） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function lenFor(level) { return Math.min(LEN[1], LEN[0] + Math.floor((level - 1) / LEN_EVERY)); }  /* Math.floor：無條件捨去成整數 */
    function flashMs(level) { return Math.round(kit.ramp(level, FLASH_MS[0], FLASH_MS[1], SPEED_LEVELS)); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function gapMs(level) { return Math.round(kit.ramp(level, GAP_MS[0], GAP_MS[1], SPEED_LEVELS)); }  /* Math.round：四捨五入成整數 */
    function ansMs(level) { return Math.round((ANS_BASE + ANS_PER * lenFor(level)) * kit.ramp(level, ANS_MUL[0], ANS_MUL[1], SPEED_LEVELS)); }
    /* 出一關：{ pts:[{x,y}]（每個位置）, order（亮起的順序，pts 的索引）, back（要點的順序＝order 倒過來） } */
    function makeLevel(level, W, H, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var n = lenFor(level);
        for (var tr = 0; tr < 300; tr++) {
            var pts = [], guard = 0;
            while (pts.length < n && guard++ < 2000) {
                var x = kit.randFloat(MARGIN, W - MARGIN, rand), y = kit.randFloat(MARGIN, H - MARGIN, rand);  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
                if (pts.every(function (p) { return kit.dist(x, y, p.x, p.y) >= MIN_GAP; })) pts.push({ x: x, y: y });  /* every：陣列裡「每一個」元素都符合條件才回傳 true */
            }
            if (pts.length < n) continue;
            var idx = []; for (var i = 0; i < n; i++) idx.push(i);
            var order = kit.shuffle(idx, rand);         /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
            return { pts: pts, order: order, back: order.slice().reverse() };  /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
        }
        var fb = []; for (var k = 0; k < n; k++) fb.push({ x: MARGIN + 30 + (k % 3) * 130, y: MARGIN + 30 + Math.floor(k / 3) * 130 });
        var o = fb.map(function (p, j) { return j; });  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
        return { pts: fb, order: o, back: o.slice().reverse() };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 25) return '倒背如流！';
        if (n >= 15) return '空間記憶力很強！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '先記順序，再倒著想一遍，再來一次！';
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
        var W = stage.clientWidth || 472, H = (stage.clientHeight || 640) - 60;
        var q = makeLevel(level, W, H, api.rand);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[倒著點] 第 ' + level + ' 關：' + q.pts.length + ' 個圓點；亮起順序 ' + q.order.map(function (i) { return i + 1; }).join('→') + '；要點的順序 ' + q.back.map(function (i) { return i + 1; }).join('→') + '；每個亮 ' + flashMs(level) + ' ms，限時 ' + ansMs(level) + ' ms');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var tip = h('div', { 'class': 'qz-note tapback-tip', text: '請看圓點依序亮起來，記住順序' });
        stage.appendChild(tip);                         /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var rings = q.pts.map(function (p) {
            var r = h('div', { 'class': 'tapback-ring' });
            r.style.left = (p.x - DOT_R) + 'px'; r.style.top = (p.y + 54 - DOT_R) + 'px';
            r.style.width = r.style.height = (2 * DOT_R) + 'px';
            stage.appendChild(r);
            return r;
        });
        var phase = 'show', next = 0, picks = [];
        var t = 700, fl = flashMs(level), gp = gapMs(level);
        q.order.forEach(function (pi) {                 /* forEach：對陣列的每個元素各做一次 */
            api.after(t, function () { rings[pi].classList.add('tapback-ring--on'); Sfx.play('tick'); });  /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            api.after(t + fl, function () { rings[pi].classList.remove('tapback-ring--on'); });  /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
            t += fl + gp;
        });
        api.after(t + 100, function () {
            phase = 'tap';
            tip.textContent = '現在請「倒著」點回去：最後亮的最先點';     /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            api.timer(ansMs(level), function () { reveal(null); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
            if (level === 1 && kit.once('tapback.hint')) kit.hintOn(stage, rings[q.back[0]], { mode: 'tap', delay: 500, text: '請點擊最後亮起的圓點' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
        });
        rings.forEach(function (r, i) {
            kit.onTap(r, function () {                  /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
                if (api.over || phase !== 'tap') return;
                if (picks.indexOf(i) >= 0) return;      /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
                if (i !== q.back[next]) { reveal(i); return; }
                picks.push(i); next++;
                r.classList.add('tapback-ring--ok'); Sfx.play('ok');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
                if (next >= q.back.length) { phase = 'done'; reveal('ok'); }
            });
        });
        /* 揭曉：每個圓圈寫上「要點的第幾個」（1 最先點） */
        function reveal(i) {
            if (api.over) return;
            phase = 'done';
            q.back.forEach(function (pi, k) { rings[pi].textContent = String(k + 1); rings[pi].classList.add('tapback-ring--num'); });
            if (i === 'ok') { tip.textContent = '全部點對了！'; kit.flash(stage, true, api.my); api.pass({ delay: 1100 }); return; }  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            if (typeof i === 'number') rings[i].classList.add('tapback-ring--wrong');
            tip.textContent = '正確的倒著順序已標上數字（1 最先點）';
            kit.flash(stage, false, api.my);
            api.fail({ delay: 2500, lines: [            /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
                (i == null ? '時間到！' : '點錯了') + '，要「倒著」點回去：最後亮的最先點',
                '圓圈上的數字就是正確的點擊順序（1 最先點）'
            ] });
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { if (phase !== 'tap') return; q.back.forEach(function (pi) { rings[pi].classList.add('tapback-ring--ok'); }); phase = 'done'; reveal('ok'); };
        api.wrong = function () { if (phase !== 'tap') return; reveal(q.back[1]); };      /* 第一個該點的是 back[0]，點 back[1] 就是錯的 */
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '倒著點',
        rule: '畫面上有幾個圓圈，圓圈會一個一個依序亮起來。亮完之後，**請「倒著」把它們依序點回去**：**最後亮的最先點**。點錯或來不及就結束，看你能過幾關。越後面，圓圈越多、亮得越快！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            lenFor: lenFor, flashMs: flashMs, gapMs: gapMs, ansMs: ansMs, makeLevel: makeLevel, rating: rating,
            LEN: LEN, LEN_EVERY: LEN_EVERY, SPEED_LEVELS: SPEED_LEVELS, MARGIN: MARGIN, MIN_GAP: MIN_GAP, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
