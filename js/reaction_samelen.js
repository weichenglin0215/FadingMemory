/* ═══════════════════════════════════════════════════════════════════
   reaction_samelen.js — 秒反應・畫一樣長
   樣式：css/games/reaction_samelen.css（這款專屬的 class 一律以「samelen-」開頭；共用元件在 css/reaction_common.css）
   上方是一條斜的題目線，下方左邊是起點：手指從起點開始往右拖，畫出一條橫線，
   長度要和上面的斜線一樣長。放開手指就是答案，只有一次機會。
   ───────────────────────────────────────────────────────────────────
   · V1.39.0（玩家回饋）：題目線以前是垂直的、長度 120～380px 差很多（太短的題目一點點誤差就變成很大的百分比）。
     現在題目線的長度是遊戲區寬度的 70%～90%（LEN_MIN_PCT～LEN_MAX_PCT），而且是斜的：
     角度（跟橫線的夾角）ANGLE_MIN～ANGLE_MAX 度，往右上或右下隨機，位置也隨機（避免用螢幕邊界當尺）。
     斜線沒辦法直接跟橫線「對齊著比」，更難目測。
   · 題目線永遠「左端在左、右端在右」（方向角 a 的 cos 恆正）：揭曉時以左端為軸轉成橫放，左端對齊你的橫線起點。
   · 起點旁有手指圖示從左往右來回移動，提醒玩家怎麼操作（第一次碰到起點後消失）。
   · 成績 ＝ |畫出的長度 − L| ÷ L × 100（%，越小越好）。
   · 揭曉：斜線轉成橫放、與你的橫線對齊左端，兩個右端標出差距。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'samelen'：選單、成績、存檔都靠它；樣式在 css/games/reaction_samelen.css，裡面的 class 名稱一律以 samelen- 開頭。 */
    'use strict';

    var ID = 'samelen';                                 /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'min', decimals: 4, format: '{v}%', label: '長度差', min: 0, max: 300 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var STAGE_W = 472;                          /* 遊戲區寬度（px）；實際以舞台的 clientWidth 為準，這裡是預設值（Node 測試用） */
    var LEN_MIN_PCT = 0.70, LEN_MAX_PCT = 0.90; /* 題目線的長度＝遊戲區寬度的 70%～90% */
    var ANGLE_MIN = 15, ANGLE_MAX = 65;         /* 題目線跟橫線的夾角範圍（度）；太小幾乎是橫的、太大幾乎是垂直的（高度不夠放） */
    var Y_TOP = 40, Y_BOT = 400;                /* 題目線（整條線）可以出現的上下範圍（y）；下面要留給橫線與揭曉時的對照 */
    var X_PAD = 16;                             /* 題目線離左右邊界至少多遠 */
    var START = { x: 40, y: 540 };              /* 起點（橫線從這裡往右畫） */
    var MAX_DRAW = 432;                         /* 橫線最長（px）：起點 x 40 ＋ 432 ＝ 舞台右緣 472；比題目線最長的 90% 寬（約 425）多一點 */
    var START_R = 56;                           /* 手指要在起點多近的地方按下才算 */
    var MIN_VALID = 20;                         /* 放開時橫線短於這個長度就當作沒畫（重來，不算一次機會） */
    var CAP = 28, CAP_L = 100;                  /* 線兩端黑色記號的半長（線加粗成 24px，記號要比線寬）；CAP_L 只給測試用的預設線長 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 出一題：W＝遊戲區寬度。回傳 { L 線長, a 方向角（弧度，從 x 軸往下量：正＝往右下、負＝往右上）, x, y 左端的位置 }；
       右端＝(x + L·cos a, y + L·sin a)。整條線一定落在 X_PAD～W−X_PAD、Y_TOP～Y_BOT 之內。 */
    function makeRound(rand, W) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        W = W || STAGE_W;
        var L = kit.randFloat(W * LEN_MIN_PCT, W * LEN_MAX_PCT, rand);
        /* 垂直方向放不下的陡角度要排除：L·sin(角) ≤ Y_BOT − Y_TOP */
        var amax = Math.min(ANGLE_MAX, Math.asin(Math.min(1, (Y_BOT - Y_TOP) / L)) * 180 / Math.PI);
        var deg = kit.randFloat(ANGLE_MIN, Math.max(ANGLE_MIN, amax), rand);
        var a = (rand() < 0.5 ? -1 : 1) * deg * Math.PI / 180;
        var span = L * Math.cos(a), rise = Math.abs(L * Math.sin(a));
        var x = kit.randFloat(X_PAD, Math.max(X_PAD, W - X_PAD - span), rand);
        var top = kit.randFloat(Y_TOP, Math.max(Y_TOP, Y_BOT - rise), rand);
        return { L: L, a: a, x: x, y: a >= 0 ? top : top + rise };
    }
    /* 線的方向角 a（弧度，從 x 軸往下量；垂直向下是 π/2、橫放向右是 0）時，上端記號與下端記號的兩個端點 [x1,y1,x2,y2]。
       記號永遠垂直於線：線的方向 (cos a, sin a)，垂直方向 (−sin a, cos a)。上端在原點、下端在 L 處。 */
    function capEnds(a, L) {
        L = L == null ? CAP_L : L;
        var dx = Math.cos(a), dy = Math.sin(a), px = -Math.sin(a), py = Math.cos(a);
        return {
            t: [-CAP * px, -CAP * py, CAP * px, CAP * py],
            b: [L * dx - CAP * px, L * dy - CAP * py, L * dx + CAP * px, L * dy + CAP * py]
        };
    }
    /* 手指位置 → 橫線長度（夾在 0～MAX_DRAW） */
    function lenFor(px) { return kit.clamp(px - START.x, 0, MAX_DRAW); }
    function errPct(len, L) { return Math.abs(len - L) / L * 100; }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(e) {
        if (e < 0.5) return '神準！';
        if (e < 2) return '很準！';
        if (e < 5) return '不錯喔！';
        if (e < 10) return '斜線不好量吧，再試一次';
        return '再試一次，會更準！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「單回合計時」的流程（開始、計時、結算、最佳紀錄）交給共用骨架 kit.single，我們只提供 setup（怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.single(root, ctx, {
            id: ID, G: G, better: 'min', max: SCORE.max,
            title: '從起點往右拖，畫出和上面斜線一樣長的橫線',
            numText: function (v) { return v.toFixed(4) + '%'; },
            rating: rating,
            sfx: function (v) { return v < 2 ? 'perfect' : (v < 6 ? 'win' : 'fail'); },
            setup: setup
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, my = api.my;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var cfg = makeRound(null, W), len = 0, drawing = false, locked = false, hint = null, pid = null;
        var sy = Math.min(START.y, H - 60);
        console.log('[畫一樣長] 斜線長度 ' + cfg.L.toFixed(2) + '（寬度的 ' + (cfg.L / W * 100).toFixed(1) + '%），角度 ' + (cfg.a * 180 / Math.PI).toFixed(1) + '°，左端 (' + cfg.x.toFixed(1) + ', ' + cfg.y.toFixed(1) + ')');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var svg = kit.svg('svg', { 'class': 'samelen-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);
        var gGuide = kit.svg('g', {}, svg);
        var ref = kit.svg('g', {}, svg);
        var refLine = kit.svg('line', { x1: 0, y1: 0, x2: (cfg.L * Math.cos(cfg.a)).toFixed(2), y2: (cfg.L * Math.sin(cfg.a)).toFixed(2), 'class': 'samelen-ref' }, ref);
        /* 兩端的黑色記號（垂直於線）：線轉成橫放時，兩個記號都要跟著轉（V1.25：以前左邊那個一直是水平的，是錯的） */
        var ends0 = capEnds(cfg.a, cfg.L);
        var capT = kit.svg('line', { x1: ends0.t[0], y1: ends0.t[1], x2: ends0.t[2], y2: ends0.t[3], 'class': 'samelen-cap' }, ref);
        var capB = kit.svg('line', { x1: ends0.b[0], y1: ends0.b[1], x2: ends0.b[2], y2: ends0.b[3], 'class': 'samelen-cap' }, ref);
        ref.setAttribute('transform', 'translate(' + cfg.x.toFixed(2) + ' ' + cfg.y.toFixed(2) + ')');
        var mine = kit.svg('line', { x1: START.x, y1: sy, x2: START.x, y2: sy, 'class': 'samelen-mine' }, svg);
        kit.svg('line', { x1: START.x, y1: sy - CAP, x2: START.x, y2: sy + CAP, 'class': 'samelen-cap' }, svg);
        var endCap = kit.svg('line', { x1: START.x, y1: sy - CAP, x2: START.x, y2: sy + CAP, 'class': 'samelen-cap', opacity: 0 }, svg);
        var dot = kit.svg('circle', { cx: START.x, cy: sy, r: 12, 'class': 'samelen-start' }, svg);
        var msg = h('div', { 'class': 'samelen-msg' });
        stage.appendChild(msg);

        /* 操作提示（只在第一次進遊戲時）：手指＋箭頭，從起點往右移動「參考線一樣長」的距離（第一次的正確答案） */
        if (kit.once('samelen.hint')) hint = kit.fingerHint(stage, { mode: 'drag', x: START.x, y: sy, dx: cfg.L, dy: 0, delay: 300 });
        function hideHint() { if (hint) { hint.remove(); hint = null; } }
        function say(t) { msg.textContent = t; msg.classList.toggle('samelen-msg--on', !!t); }
        /* 重畫畫面：依目前的狀態（選中了什麼、填了什麼、對或錯…）更新每個元素的外觀 */
        function paint() {
            mine.setAttribute('x2', START.x + len);
            endCap.setAttribute('x1', START.x + len); endCap.setAttribute('x2', START.x + len); endCap.setAttribute('opacity', len > 0 ? 1 : 0);
        }

        stage.addEventListener('pointerdown', function (e) {
            if (locked || drawing) return;
            var p = kit.localPt(e, stage), dx = p.x - START.x, dy = p.y - sy;
            if (Math.sqrt(dx * dx + dy * dy) > START_R) { say('請從左下的起點開始拖'); return; }
            e.preventDefault();
            try { stage.setPointerCapture(e.pointerId); } catch (err) { }
            drawing = true; pid = e.pointerId; hideHint(); say('');
            len = 0; paint();
        });
        stage.addEventListener('pointermove', function (e) {
            if (!drawing || e.pointerId !== pid) return;
            len = lenFor(kit.localPt(e, stage).x); paint();
        });
        function end(e) {
            if (!drawing || e.pointerId !== pid) return;
            drawing = false;
            if (len < MIN_VALID) { say('再往右拖長一點'); len = 0; paint(); Sfx.play('bad'); return; }
            submit();
        }
        stage.addEventListener('pointerup', end);
        stage.addEventListener('pointercancel', end);

        function submit() {
            if (locked) return;
            locked = true; hideHint(); dot.setAttribute('opacity', 0);
            Sfx.play('click');
            var real = errPct(len, cfg.L), tgt = sy - 70;
            /* 揭曉：斜線以左端為軸轉成橫放，移到你的橫線上方 */
            var tx0 = cfg.x, ty0 = cfg.y;
            my.tween(1000, function (e) {
                var x = tx0 + (START.x - tx0) * e, y = ty0 + (tgt - ty0) * e, a = cfg.a * (1 - e);
                refLine.setAttribute('x1', 0); refLine.setAttribute('y1', 0);
                refLine.setAttribute('x2', cfg.L * Math.cos(a)); refLine.setAttribute('y2', cfg.L * Math.sin(a));
                var ends = capEnds(a, cfg.L);
                capT.setAttribute('x1', ends.t[0]); capT.setAttribute('y1', ends.t[1]); capT.setAttribute('x2', ends.t[2]); capT.setAttribute('y2', ends.t[3]);
                capB.setAttribute('x1', ends.b[0]); capB.setAttribute('y1', ends.b[1]); capB.setAttribute('x2', ends.b[2]); capB.setAttribute('y2', ends.b[3]);
                ref.setAttribute('transform', 'translate(' + x.toFixed(2) + ' ' + y.toFixed(2) + ')');
            }, kit.easeInOutCubic).then(function () {
                /* 兩個右端的對照線 */
                kit.svg('line', { x1: START.x + cfg.L, x2: START.x + cfg.L, y1: tgt - 20, y2: sy + 20, 'class': 'samelen-guide samelen-guide--ref' }, gGuide);
                kit.svg('line', { x1: START.x + len, x2: START.x + len, y1: tgt - 20, y2: sy + 20, 'class': 'samelen-guide samelen-guide--mine' }, gGuide);
                var diff = len - cfg.L;
                say((diff < 0 ? '你畫短了 ' : '你畫長了 ') + Math.abs(diff / cfg.L * 100).toFixed(4) + '%');
                my.after(1800, function () {
                    api.finish(real, { lines: [
                        diff < 0 ? '橫線比斜線短 ' + Math.abs(diff).toFixed(4) + ' 像素' : '橫線比斜線長 ' + Math.abs(diff).toFixed(4) + ' 像素',
                        '斜線沒辦法直接跟橫線對齊著比，只能靠目測',
                        '只有一次機會，想拚更準就再挑戰一次'
                    ] });
                });
            });
        }

        function fire(type, x, y) {
            var r = stage.getBoundingClientRect(), sc = r.width / (stage.clientWidth || r.width);
            stage.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, clientX: r.left + x * sc, clientY: r.top + y * sc }));
        }
        function drawLen(L) {
            fire('pointerdown', START.x, sy);
            for (var i = 1; i <= 10; i++) fire('pointermove', START.x + L * i / 10, sy);
            fire('pointerup', START.x + L, sy);
        }
        G.debug = {
            state: function () { return { cfg: cfg, len: len, locked: locked }; },
            drawLen: drawLen,
            solve: function () { drawLen(cfg.L); },
            wrong: function () { drawLen(cfg.L * 0.8); }
        };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '畫一樣長',
        rule: '上方有一條**斜放的線**（每次角度、位置都不同）。手指從左下角的起點出發，往右拖出一條橫線，**長度要和斜線一樣長**。放開手指就是答案，只有一次機會。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            capEnds: capEnds, CAP: CAP, makeRound: makeRound, lenFor: lenFor, errPct: errPct, rating: rating, START: START, MAX_DRAW: MAX_DRAW,
            STAGE_W: STAGE_W, LEN_MIN_PCT: LEN_MIN_PCT, LEN_MAX_PCT: LEN_MAX_PCT, ANGLE_MIN: ANGLE_MIN, ANGLE_MAX: ANGLE_MAX, Y_TOP: Y_TOP, Y_BOT: Y_BOT, X_PAD: X_PAD
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
