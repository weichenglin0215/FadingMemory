/* ═══════════════════════════════════════════════════════════════════
   reaction_handsmeet.js — 秒反應・兩針重疊
   樣式：css/games/reaction_handsmeet.css（這款專屬的 class 一律以「handsmeet-」開頭；共用元件在 css/reaction_common.css）
   一個沒有刻度的圓盤，兩根指針（長針藍、短針橘）以不同速度轉，在它們剛好疊在一起的瞬間按「重疊！」。
   只有一次機會（每回合只能按一次），指針最多轉 MAX_S 秒；成績＝按下瞬間兩針的夾角（度，越小越好）。
   ───────────────────────────────────────────────────────────────────
   · 長針角速度 W1 120～300 度／秒（順時針），短針角速度 ＝ 長針 ÷ K（K 隨機 2～5）；
     相對角速度 ≥ 60 度／秒，一定會一次又一次地重疊。
   · 起始：短針在長針前方 d0 度（60～300），第一次重疊時間 ≥ FIRST_MIN 秒（不夠就多加整圈）。
   · 重疊時刻 t_n ＝ (d0 ＋ 360·n) ÷ (W1 − W2)；任何時刻的夾角是純函式，用事件的 timeStamp 判定。
   · 12 秒內沒按：這一回合作廢，自動重新開始（不算一次機會）。
   · 揭曉：指針定格在按下的瞬間，只寫兩針的夾角（V1.28 玩家意見：不顯示任何跟秒數有關的說明，也取消綠線，把重點集中在角度差異）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'handsmeet'：選單、成績、存檔都靠它；樣式在 css/games/reaction_handsmeet.css，裡面的 class 名稱一律以 handsmeet- 開頭。 */
    'use strict';

    var ID = 'handsmeet';                               /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'min', decimals: 4, format: '{v} 度', label: '夾角', min: 0, max: 180 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var W1 = [240, 300];                        /* 長針角速度範圍（度／秒） */
    var K = [4, 5];                             /* 長針是短針的幾倍快 */
    var FIRST_MIN = 1.0;                        /* 第一次重疊至少在幾秒之後 */
    var MAX_S = 30;                             /* 指針最多轉幾秒 */
    var CX = 236, CY = 270, R = 220;            /* 圓盤中心與半徑（舞台座標） */
    var LEN1 = 200, LEN2 = 160;                  /* 長針、短針長度 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 出題：回傳 { w1, w2, th1, th2, d0, rel, t0（第一次重疊的秒數）} */
    function makeRound(rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var w1 = kit.randFloat(W1[0], W1[1], rand), k = kit.randFloat(K[0], K[1], rand), w2 = w1 / k, rel = w1 - w2;  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
        var th1 = rand() * 360, d0 = kit.randFloat(60, 300, rand);  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
        while (d0 / rel < FIRST_MIN) d0 += 360;
        return { w1: w1, w2: w2, th1: th1, th2: (th1 + d0) % 360, d0: d0, rel: rel, t0: d0 / rel };
    }
    function handAngle(th, w, t) { return th + w * t; }
    /* 時刻 t（秒）兩針的夾角（0～180 度） */
    function diffAt(q, t) {
        var d = ((q.d0 - q.rel * t) % 360 + 360) % 360;
        return d > 180 ? 360 - d : d;
    }
    /* 離 t 最近的一次重疊時刻（秒） */
    function nearestOverlap(q, t) {
        var n = Math.max(0, Math.round((q.rel * t - q.d0) / 360));  /* Math.round：四捨五入成整數 */
        return (q.d0 + 360 * n) / q.rel;
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(e) {
        if (e < 0.5) return '神乎其技！';
        if (e < 2) return '高手！';
        if (e < 5) return '很準！';
        if (e < 12) return '不錯喔！';
        return '再試一次，先抓節奏再按！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「單回合計時」的流程（開始、計時、結算、最佳紀錄）交給共用骨架 kit.single，我們只提供 setup（怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.single(root, ctx, {
            id: ID, G: G, better: 'min', max: SCORE.max,
            title: '兩根指針疊在一起的瞬間，按「重疊！」',
            numText: function (v) { return v.toFixed(4) + ' 度'; },
            rating: rating,
            sfx: function (v) { return v < 2 ? 'perfect' : (v < 8 ? 'win' : 'fail'); },
            setup: setup
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, my = api.my;
        var q = makeRound(), started = false, locked = false, t0 = 0, loop = null;
        console.log('[兩針重疊] 長針 ' + q.w1.toFixed(1) + ' 度/秒、短針 ' + q.w2.toFixed(1) + ' 度/秒；第一次重疊 ' + q.t0.toFixed(3) + ' 秒；之後每 ' + (360 / q.rel).toFixed(3) + ' 秒一次');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var svg = kit.svg('svg', { 'class': 'handsmeet-svg', viewBox: '0 0 472 560', width: 472, height: 560 }, stage);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        kit.svg('circle', { cx: CX, cy: CY, r: R, 'class': 'handsmeet-dial' }, svg);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        var h2 = kit.svg('line', { x1: CX, y1: CY, x2: CX, y2: CY - LEN2, 'class': 'handsmeet-hand2' }, svg);
        var h1 = kit.svg('line', { x1: CX, y1: CY, x2: CX, y2: CY - LEN1, 'class': 'handsmeet-hand1' }, svg);
        kit.svg('circle', { cx: CX, cy: CY, r: 9, 'class': 'handsmeet-pin' }, svg);
        var msg = h('div', { 'class': 'handsmeet-msg', text: '' });
        stage.appendChild(msg);                         /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var btn = h('button', { 'class': 'btn btn--go handsmeet-btn', text: '重疊！' });
        btn.disabled = true;
        stage.appendChild(btn);                         /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        function setHands(sec) {
            h1.setAttribute('transform', 'rotate(' + handAngle(q.th1, q.w1, sec).toFixed(2) + ' ' + CX + ' ' + CY + ')');  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
            h2.setAttribute('transform', 'rotate(' + handAngle(q.th2, q.w2, sec).toFixed(2) + ' ' + CX + ' ' + CY + ')');  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
        }
        setHands(0);

        function begin() {
            if (started) return;
            started = true; btn.disabled = false; t0 = performance.now();  /* performance.now()：高精度的時間（毫秒），計時用 */
            msg.textContent = '轉動中…抓準它們疊在一起的瞬間！';       /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            loop = my.loop(function () { if (locked) return false; setHands((performance.now() - t0) / 1000); });  /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
            my.after(MAX_S * 1000, function () {
                if (locked) return;
                locked = true; loop && loop.stop(); btn.disabled = true;
                msg.textContent = MAX_S + ' 秒內沒有按，重新開始（不算一次機會）';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
                Sfx.play('bad');                        /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
                my.after(1600, function () { api.restart(); });
            });
        }
        var cover = kit.startCover(stage, { text: '兩根指針會一直轉。\n在它們剛好疊在一起的瞬間，按「重疊！」。\n只有一次機會。', onStart: begin });  /* 「準備好了按開始」的遮罩：玩家按下才開始（計時從這時才算） */

        function tapAtMs(ms) {
            if (locked || !started) return;
            locked = true; if (loop) loop.stop(); btn.disabled = true;
            Sfx.play('click');                          /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            var sec = ms / 1000, real = diffAt(q, sec);
            setHands(sec);
            msg.textContent = '兩針夾角 ' + real.toFixed(4) + ' 度';
            my.after(2200, function () {
                api.finish(real, {
                    lines: [
                        '按下的瞬間，兩針夾角 ' + real.toFixed(4) + ' 度',
                        '只有一次機會，想拚更準就再挑戰一次'
                    ]
                });
            });
        }
        kit.onTap(btn, function (e) { tapAtMs(kit.evT(e) - t0); });  /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */

        G.debug = {
            state: function () { return { q: q, started: started, locked: locked }; },
            start: function () { cover.remove(); begin(); },
            tapAtMs: function (ms) { cover.remove(); begin(); tapAtMs(ms); },
            solve: function () { cover.remove(); begin(); tapAtMs(q.t0 * 1000); },
            wrong: function () { cover.remove(); begin(); tapAtMs((q.t0 + 0.5 * 360 / q.rel) * 1000); }
        };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '兩針重疊',
        rule: '圓盤上有兩根指針，長針轉得快、短針轉得慢，圓盤沒有任何刻度。**在兩根針剛好疊在一起的瞬間按下「重疊！」**。**每次只能按一次**，不用等第一次重疊，任何一次都可以。成績是按下時兩針的夾角，目標是 0.0000 度。',
        mount: mount,
        score: SCORE,
        test: { makeRound: makeRound, handAngle: handAngle, diffAt: diffAt, nearestOverlap: nearestOverlap, rating: rating, W1: W1, K: K, FIRST_MIN: FIRST_MIN, MAX_S: MAX_S }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
