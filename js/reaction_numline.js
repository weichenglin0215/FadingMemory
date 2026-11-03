/* ═══════════════════════════════════════════════════════════════════
   reaction_numline.js — 秒反應・數線落點（原企劃「031 數線落點」的復活版）
   樣式：css/games/reaction_numline.css（這款專屬的 class 一律以「numline-」開頭；共用元件在 css/reaction_common.css）
   出現一個 0～1 之間的數（可能寫成小數 0.37、分數 3/8、或百分比 37%），數線上只標了 0 和 1，
   用手指把圓點拖到你覺得它該在的位置，按「確定」。誤差在容許範圍內才過關，容許範圍一關比一關小。
   關卡制：答錯就結束，成績＝過了幾關。
   ───────────────────────────────────────────────────────────────────
   · 一關只用一種寫法（不再混雜）：小數／分數／百分比隨機。前幾關的數字比較「整」（0.35、1/4、40%），
     越後面越「碎」（0.37、5/13、37%）。數字一律離 0 與 1 至少 0.05，也離「畫面中央的起點」至少 0.12，
     所以圓點一開始不會剛好就在答案附近。
   · 容許誤差 TOL：第 1 關 ±0.10（10%）→ 第 TOL_RAMP 關 ±0.01（1%），線性。
   · 圓點跟著手指的橫向位置走（手指在數線下方的拖曳區，不會擋住圓點）；可以反覆拖、按「確定」才算。
   · 揭曉：正確位置畫一根綠色刻度並標出數字，你的圓點與它的距離用 4 位小數寫出來。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'numline'：選單、成績、存檔都靠它；樣式在 css/games/reaction_numline.css，裡面的 class 名稱一律以 numline- 開頭。 */
    'use strict';

    var ID = 'numline';                                 /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var TOL = [0.10, 0.01];                     /* 容許誤差（數線全長 ＝ 1）：第 1 關 → 到頂 */
    var TOL_RAMP = 15;                          /* 幾關之後容許誤差縮到最小 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var V_MIN = 0.05, V_MAX = 0.95;             /* 數字離 0 與 1 至少多遠 */
    var START = 0.5;                            /* 圓點一開始的位置 */
    var START_GAP = 0.12;                       /* 答案離起點至少多遠 */
    var LINE_PAD = 36;                          /* 數線左右兩端離畫面邊緣 */
    var FORMS = ['decimal', 'fraction', 'percent'];  /* 數字的三種寫法：decimal 小數、fraction 分數、percent 百分比 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function tolAt(level) { return kit.ramp(level, TOL[0], TOL[1], TOL_RAMP); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function gcd(a, b) { return b ? gcd(b, a % b) : a; }
    /* 這一關的題目：{ form, v（0～1 的真值）, text（畫面上的寫法）, tol } */
    function makeQuestion(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var form = kit.pick(FORMS, rand), tol = tolAt(level), fine = kit.ramp(level, 0, 1, 10);   /* fine：0＝整齊的數、1＝零碎的數 */
        for (var tr = 0; tr < 200; tr++) {
            var v, text;
            if (form === 'decimal') {
                var k = fine < 0.5 ? kit.randInt(1, 19, rand) * 5 : kit.randInt(5, 95, rand);  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
                v = k / 100; text = v.toFixed(2);
            } else if (form === 'percent') {
                var p = fine < 0.5 ? kit.randInt(1, 19, rand) * 5 : kit.randInt(5, 95, rand);  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
                v = p / 100; text = p + '%';
            } else {
                var dens = fine < 0.5 ? [2, 3, 4, 5, 6, 8, 10] : [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16];
                var d = kit.pick(dens, rand), n = kit.randInt(1, d - 1, rand);  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
                if (gcd(n, d) !== 1) continue;
                v = n / d; text = n + '/' + d;
            }
            if (v < V_MIN || v > V_MAX || Math.abs(v - START) < START_GAP) continue;  /* Math.abs：取絕對值（去掉負號） */
            return { form: form, v: v, text: text, tol: tol };
        }
        return { form: 'decimal', v: 0.75, text: '0.75', tol: tol };
    }
    /* 判定：誤差在容許範圍內（含邊界）就過 */
    function judge(pos, v, tol) { var err = Math.abs(pos - v); return { ok: err <= tol + 1e-12, err: err }; }  /* Math.abs：取絕對值（去掉負號） */
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 25) return '數感大師！';
        if (n >= 15) return '數感很好！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '多想想它大概是幾分之幾，再試一次！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 6,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            stageClass: 'numline-stage',
            setup: setup
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makeQuestion(level, api.rand);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var X0 = LINE_PAD, X1 = W - LINE_PAD, LY = Math.round(H * 0.36), LEN = X1 - X0;  /* Math.round：四捨五入成整數 */
        console.log('[數線落點] 第 ' + level + ' 關：' + q.text + '（＝' + q.v.toFixed(4) + '）；容許 ±' + q.tol.toFixed(4) + '（±' + (q.tol * LEN).toFixed(1) + 'px）');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var big = h('div', { 'class': 'numline-big', text: q.text });
        var tip = h('div', { 'class': 'numline-tip', text: '拖到這個數該在的位置，再按「確定」' });  /* tip：盤面下方的提示文字（操作說明、出錯的原因會寫在這裡） */
        stage.appendChild(big); stage.appendChild(tip); /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var svg = kit.svg('svg', { 'class': 'numline-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        kit.svg('line', { x1: X0, x2: X1, y1: LY, y2: LY, 'class': 'numline-line' }, svg);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        [[X0, '0'], [X1, '1']].forEach(function (t) {   /* forEach：對陣列的每個元素各做一次 */
            kit.svg('line', { x1: t[0], x2: t[0], y1: LY - 16, y2: LY + 16, 'class': 'numline-tick' }, svg);
            var tx = kit.svg('text', { x: t[0], y: LY + 46, 'text-anchor': 'middle', 'class': 'numline-label' }, svg); tx.textContent = t[1];  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
        });
        var gAns = kit.svg('g', {}, svg);
        var pos = START;
        var stem = kit.svg('line', { x1: 0, x2: 0, y1: LY - 70, y2: LY, 'class': 'numline-stem' }, svg);
        var dot = kit.svg('circle', { cx: 0, cy: LY - 70, r: 20, 'class': 'numline-dot' }, svg);
        function xOf(v) { return X0 + v * LEN; }
        /* 重畫畫面：依目前的狀態（選中了什麼、填了什麼、對或錯…）更新每個元素的外觀 */
        function paint() {
            var x = xOf(pos);
            stem.setAttribute('x1', x); stem.setAttribute('x2', x); dot.setAttribute('cx', x);  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
        }
        paint();
        /* 拖曳區：數線下方一大塊，手指在這裡橫向移動，圓點跟著走（手指不會擋住圓點） */
        var pad = h('div', { 'class': 'numline-pad' });
        pad.style.top = (LY + 100) + 'px'; pad.style.height = (H - LY - 70 - 84 - 12 - 30) + 'px';
        var okBtn = h('button', { 'class': 'btn btn--go numline-ok', text: '確定' });
        stage.appendChild(pad); stage.appendChild(okBtn);  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var locked = false, hint = null, dragging = null;
        function fromPointer(e) { var p = kit.localPt(e, pad); pos = kit.clamp((p.x - X0) / LEN, 0, 1); paint(); }  /* kit.clamp(值, 最小, 最大)：把數值限制在範圍內（太小就取最小、太大就取最大） */
        pad.addEventListener('pointerdown', function (e) {  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
            if (locked || dragging != null) return;
            e.preventDefault();                         /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
            try { pad.setPointerCapture(e.pointerId); } catch (err) { }  /* setPointerCapture：手指移出元素範圍後，仍然持續收到這個元素的移動事件（拖曳才不會中斷） */
            dragging = e.pointerId; if (hint) { hint.remove(); hint = null; }
            fromPointer(e);
        });
        pad.addEventListener('pointermove', function (e) { if (dragging === e.pointerId && !locked) fromPointer(e); });  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
        function endDrag(e) { if (dragging === e.pointerId) dragging = null; }
        pad.addEventListener('pointerup', endDrag); pad.addEventListener('pointercancel', endDrag);
        pad.appendChild(h('div', { 'class': 'numline-pad__text', text: '在這裡左右拖曳' }));
        /* 操作提示（只在第一次進遊戲時）：手指＋箭頭，從圓點現在的位置往「正確的位置」重複移動（第一關的正確答案）；手指擺在數線下方的拖曳區 */
        if (level === 1 && kit.once('numline.hint')) {  /* kit.once(key)：同一個頁面只有第一次回傳 true（用來讓提示只出現一次） */
            var y = LY + 70 + 60;
            hint = kit.fingerHint(stage, { mode: 'drag', x: xOf(pos), y: y, dx: xOf(q.v) - xOf(pos), dy: 0, delay: 400, text: '請往左右拖曳圓點' });
        }
        var msg = h('div', { 'class': 'numline-msg' });
        stage.appendChild(msg);

        function submit() {
            if (locked || api.over) return;
            locked = true; if (hint) { hint.remove(); hint = null; }
            Sfx.play('click');                          /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            var r = judge(pos, q.v, q.tol);
            /* 揭曉：綠色刻度標出正確位置，還有容許範圍（淡綠色底） */
            var ax = xOf(q.v);
            kit.svg('rect', { x: Math.max(X0, xOf(q.v - q.tol)), y: LY - 16, width: Math.min(X1, xOf(q.v + q.tol)) - Math.max(X0, xOf(q.v - q.tol)), height: 32, 'class': 'numline-tol' }, gAns);
            kit.svg('line', { x1: ax, x2: ax, y1: LY - 34, y2: LY + 34, 'class': 'numline-ans' }, gAns);
            var tx = kit.svg('text', { x: ax, y: LY + 78, 'text-anchor': 'middle', 'class': 'numline-anslabel' }, gAns); tx.textContent = q.text + '＝' + q.v.toFixed(4);  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            msg.textContent = (r.ok ? '落在容許範圍內！' : '超出容許範圍了') + '　差 ' + r.err.toFixed(4) + '（容許 ' + q.tol.toFixed(4) + '）';
            msg.classList.add(r.ok ? 'numline-msg--ok' : 'numline-msg--bad');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            if (r.ok) { Sfx.play('ok'); api.pass({ gain: 1, delay: 1500 }); }  /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
            else api.fail({ delay: 2200, lines: ['第 ' + level + ' 關：' + q.text + '＝' + q.v.toFixed(4), '你的圓點在 ' + pos.toFixed(4) + '，差 ' + r.err.toFixed(4) + '（容許 ±' + q.tol.toFixed(4) + '）'] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        kit.onTap(okBtn, submit);                       /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */

        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { pos = q.v; paint(); submit(); };
        api.wrong = function () { pos = kit.clamp(q.v + (q.v > 0.5 ? -1 : 1) * Math.max(0.2, q.tol * 3), 0, 1); paint(); submit(); };  /* kit.clamp(值, 最小, 最大)：把數值限制在範圍內（太小就取最小、太大就取最大） */
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '數線落點',
        rule: '畫面上有一條數線，只標了 0 和 1。上方出現一個 0 到 1 之間的數（可能是小數、分數或百分比），在數線下方的拖曳區左右拖曳，**把圓點移到你覺得它該在的位置**，按「確定」。**誤差在容許範圍內才過關**，容許範圍一關比一關小，答錯就結束。',
        mount: mount,
        score: SCORE,
        test: { tolAt: tolAt, makeQuestion: makeQuestion, judge: judge, gcd: gcd, TOL: TOL, TOL_RAMP: TOL_RAMP, V_MIN: V_MIN, V_MAX: V_MAX, START: START, START_GAP: START_GAP }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
