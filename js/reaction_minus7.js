/* ═══════════════════════════════════════════════════════════════════
   reaction_minus7.js — 秒反應・一路減七（企劃 392，依使用者的流程）
   樣式：css/games/reaction_minus7.css（這款專屬的 class 一律以「minus7-」開頭；共用元件在 css/reaction_common.css）
   一開始顯示提示「**請從 1000 開始計數**」。然後出現大大的「**−7**」，下面是**九個數字的按鈕**（三個一組、每組三個連續數字，例如 995 996 997／985 986 987／975 976 977，位置打散）——
   **選出「目前的數字減 7」的正確答案**。答對：「−7」縮小消失，再出現大大的「**再 −7**」，下面的九個按鈕也一起縮小、換成新的數字再放大出現。
   **目前的數字不會顯示**——要自己記住剛剛的答案、一路算下去。答錯、或超過時間沒按就結束，成績＝連續答對幾題。
   ───────────────────────────────────────────────────────────────────
   · 題目的數列（stepDelta）：第 i 題（從 0 算起）的變化量：
       i < 15：−7（一路減七）；15 ≤ i < 25：−13；i ≥ 25：加 17、減 9 輪流（+17、−9、+17、−9…）。
     每次規則換了（第 15 題、第 25 題之前），會先跳出一個提示框預告「從現在起每次 −13」，提示的時候不計時。
   · 九個選項（makeOptions，V1.38.0）：玩家發現過關秘訣——**只算個位數**就能猜出答案（原本三個選項個位數都不同）。
     現在九個選項分成三組，**每組是三個連續整數、三組的個位數完全一樣**（例如 995 996 997／985 986 987／975 976 977），
     正確答案在其中一組（哪一組、組內第幾個都是隨機），九個按鈕的位置再整個打散；所以個位數、十位數都要算對才選得出來，猜不到。
   · 難度（線性，依連續答對題數 n）：每題限時 18 → 7.5 秒（到 RAMP_Q 題到頂；V1.38.0 玩家意見：選項變九個，時間延長成原本的 300%）。
   · 揭曉：把整串數字列出來（最後 10 步），錯的那一步寫出算式（例如「986 − 7 ＝ 979，你選了 989」）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'minus7'：選單、成績、存檔都靠它；樣式在 css/games/reaction_minus7.css，裡面的 class 名稱一律以 minus7- 開頭。 */
    'use strict';

    var ID = 'minus7';                                  /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '連續答對', min: 1, max: 300 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var START = 1000;                           /* 從幾開始數（使用者規定 1000） */
    var RAMP_Q = 40;                            /* 答對幾題之後難度到頂 */
    var TIME_S = [18, 7.5];                     /* 每題限時（秒）：第 0 題 → 到頂（原本 6 → 2.5，V1.38.0 九個選項、延長成 300%） */
    var DEC = 7;                                /* 一開始每次減多少 */
    var RULE2_FROM = 15, DEC2 = 13;             /* 第幾題起改成減 13 */
    var RULE3_FROM = 25, ADD3 = 17, SUB3 = 9;   /* 第幾題起改成「加 17、減 9」輪流 */
    var INTRO_MS = 2300;                        /* 一開始「請從 1000 開始計數」顯示多久 */
    var NOTICE_MS = 2200;                       /* 規則換的時候預告框顯示多久 */
    var SHRINK_MS = 190, GROW_MS = 240;         /* 縮小消失、放大出現的動畫時間 */
    var SOLVE_CAP = 10;                         /* 驗證用：api.solve 最多幫忙答對幾題 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var MINUS = '−';                            /* 減號（U+2212） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function timeMs(n) { var p = Math.min(1, Math.max(0, n / RAMP_Q)); return Math.round((TIME_S[0] + (TIME_S[1] - TIME_S[0]) * p) * 1000); }  /* Math.round：四捨五入成整數 */
    /* 第 i 題（從 0 算起）的變化量 */
    function stepDelta(i) { if (i < RULE2_FROM) return -DEC; if (i < RULE3_FROM) return -DEC2; return ((i - RULE3_FROM) % 2 === 0) ? ADD3 : -SUB3; }
    /* 答對 i 題之後的數字（i＝0 是起始值）：START ＋ 前 i 題的變化量總和 */
    function valueAfter(i) { var v = START; for (var k = 0; k < i; k++) v += stepDelta(k); return v; }
    /* 這個變化量要顯示成什麼字：「−7」「＋17」 */
    function deltaText(d) { return (d < 0 ? MINUS : '＋') + Math.abs(d); }  /* Math.abs：取絕對值（去掉負號） */
    /* 第 i 題大字：第 0 題「−7」；同一個規則的後續題目「再 −7」；規則剛換、或加減輪流時只寫「−13」「＋17」 */
    function bigText(i) { var d = stepDelta(i), t = deltaText(d); if (i === 0) return t; return (stepDelta(i - 1) === d) ? '再 ' + t : t; }
    /* 這一題前要不要先預告規則換了：回傳預告文字或 null */
    function noticeBefore(i) {
        if (i === RULE2_FROM) return '規則換了！從現在起每次 ' + deltaText(-DEC2);
        if (i === RULE3_FROM) return '規則又換了！從現在起「' + deltaText(ADD3) + '」和「' + deltaText(-SUB3) + '」輪流';
        return null;
    }
    /* 九個選項：分成三組，每組是三個連續整數、三組只差整十（個位數一樣）。
       ans 在第 g 組（0、1、2）、組內第 pos 個（0、1、2）；三組的起點是 ans − pos ＋ 10 × (k − g)（k＝0、1、2），
       所以三組各差 10（例如 975／985／995 開頭），正確答案可能在最大、中間或最小的那一組。九個數字隨機打散，回傳 { options（9 個，打散後的順序）, idx（正確答案是第幾個）} */
    function makeOptions(ans, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var pos = kit.randInt(0, 2, rand), g = kit.randInt(0, 2, rand), start = ans - pos, nums = [];  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
        for (var k = 0; k < 3; k++) for (var j = 0; j < 3; j++) nums.push(start + 10 * (k - g) + j);
        var options = kit.shuffle(nums, rand);          /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
        return { options: options, idx: options.indexOf(ans) };  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
    }
    /* 一題：{ i, from（目前的數字，不顯示）, delta, ans, options, idx, big（大字）, notice, time（毫秒）} */
    function makeQuestion(i, rand) {
        var from = valueAfter(i), d = stepDelta(i), ans = from + d, op = makeOptions(ans, rand);
        return { i: i, from: from, delta: d, ans: ans, options: op.options, idx: op.idx, big: bigText(i), notice: noticeBefore(i), time: timeMs(i) };
    }
    /* 失敗時的說明：選了 picked（null＝沒選）；算式寫出「986 − 7 ＝ 979」 */
    function formula(q) { return q.from + ' ' + (q.delta < 0 ? MINUS : '＋') + ' ' + Math.abs(q.delta) + ' ＝ ' + q.ans; }
    function whyText(q, picked) { return picked == null ? '時間到！' + formula(q) : '算錯了！' + formula(q) + '，你選了 ' + picked; }
    /* 整串數字（最後 count 步）：['1000', '993', ...] */
    function chain(upTo, count) { var out = [], from = Math.max(0, upTo - count + 1); for (var k = from; k <= upTo; k++) out.push(valueAfter(k)); return out; }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 30) return '心算天才！';
        if (n >= 20) return '腦袋很靈光！';
        if (n >= 10) return '不錯喔！';
        if (n >= 4) return '再接再厲！';
        return '記住剛剛的答案、一直算下去！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 10, stageClass: 'minus7-stage', resume: false,
            head: function () { return '一路減七'; },
            info: function (S) { return '答對 ' + S.score + ' 題'; },
            scoreOf: function (S) { return S.score; },
            numText: function (v) { return v + ' 題'; },
            rating: rating,
            lines: function (S) { return ['連續答對 ' + S.score + ' 題']; },
            setup: setup
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, S = api.S;
        var count = 0, q = null, phase = 'intro', picked = null;
        api.info = { get count() { return count; }, get q() { return q; }, get phase() { return phase; } };
        S.score = 0; api.setInfo('答對 0 題');
        console.log('[一路減七] 開始：從 ' + START + ' 開始；每題限時 ' + timeMs(0) + ' → ' + timeMs(RAMP_Q) + ' 毫秒');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var field = h('div', { 'class': 'minus7-field' });
        stage.appendChild(field);                       /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var banner = h('div', { 'class': 'minus7-banner', text: '請從 ' + START + ' 開始計數' }); field.appendChild(banner);
        var big = h('div', { 'class': 'minus7-big minus7-pop--out', text: '' }); field.appendChild(big);
        var info = h('div', { 'class': 'qz-note minus7-info', text: '' }); field.appendChild(info);
        var grid = h('div', { 'class': 'minus7-grid minus7-pop--out' }); field.appendChild(grid);
        var btns = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(function (k) { var b = h('button', { 'class': 'btn btn--line minus7-btn', text: '' }); grid.appendChild(b); kit.onTap(b, function () { answer(k); }); return b; });  /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */

        /* 開場：先顯示「請從 1000 開始計數」，然後出第 0 題 */
        api.after(INTRO_MS, function () { banner.classList.add('minus7-banner--hide'); api.after(260, function () { ask(); }); });  /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */

        function pop(inn) { big.classList.toggle('minus7-pop--out', !inn); grid.classList.toggle('minus7-pop--out', !inn); }  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
        /* 出一題：（規則換了先預告）→ 換字、換按鈕 → 放大出現 → 開始計時 */
        function ask() {
            if (api.over) return;
            q = makeQuestion(count, api.rand);
            var go = function () {
                if (api.over) return;
                big.textContent = q.big; q.options.forEach(function (v, k) { btns[k].textContent = String(v); btns[k].classList.remove('minus7-btn--ok', 'minus7-btn--bad'); });  /* forEach：對陣列的每個元素各做一次 */
                pop(true); phase = 'wait';
                api.after(GROW_MS, function () {
                    if (api.over || phase !== 'wait') return;
                    phase = 'ask'; api.stopTimer(); api.timer(q.time, function () { fail(null); });
                    if (count === 0 && kit.once('minus7.hint')) kit.hintOn(stage, btns[q.idx], { mode: 'tap', delay: 700, text: START + ' 減 7 是多少？' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
                });
            };
            if (q.notice) {
                banner.textContent = q.notice; banner.classList.remove('minus7-banner--hide'); phase = 'notice';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
                api.after(NOTICE_MS, function () { banner.classList.add('minus7-banner--hide'); api.after(260, go); });
            } else go();
        }
        function answer(k) {
            if (phase !== 'ask' || api.over) return;
            phase = 'judge'; api.stopTimer(); picked = q.options[k];
            if (k === q.idx) {
                btns[k].classList.add('minus7-btn--ok'); count++; S.score = count; api.setInfo('答對 ' + count + ' 題'); Sfx.play('ok');  /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
                api.after(120, function () { pop(false); api.after(SHRINK_MS, ask); });         /* 「−7」和三個按鈕一起縮小消失，再出新題 */
                return;
            }
            btns[k].classList.add('minus7-btn--bad'); btns[q.idx].classList.add('minus7-btn--ok'); fail(picked);
        }
        /* 結束：把整串數字列出來，錯的那一步寫出算式 */
        function fail(pk) {
            if (api.over || phase === 'end') return;
            phase = 'end'; api.stopTimer(); btns[q.idx].classList.add('minus7-btn--ok');
            big.classList.add('minus7-pop--out');                          /* 大字讓位給整串數字（同一個位置）；九個按鈕留著，標出正確答案與選錯的 */
            var why = whyText(q, pk);
            banner.textContent = why; banner.classList.remove('minus7-banner--hide'); banner.classList.add('minus7-banner--bad');          /* 結果寫在最上面的提示框（下面要留給整串數字） */
            var box = h('div', { 'class': 'minus7-chain' }), nums = chain(count, 10);
            nums.forEach(function (v, k) { var last = k === nums.length - 1; box.appendChild(h('span', { 'class': 'minus7-chain__n' + (last ? ' minus7-chain__n--now' : ''), text: String(v) })); if (!last) box.appendChild(h('span', { 'class': 'minus7-chain__a', text: '→' })); });
            box.appendChild(h('span', { 'class': 'minus7-chain__a', text: '→' })); box.appendChild(h('span', { 'class': 'minus7-chain__n minus7-chain__n--ans', text: q.ans + '？' }));
            field.appendChild(box);
            kit.flash(stage, false, api.my);            /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            api.fail({ delay: 4200, lines: [why, '數字一路是：' + chain(count, 10).join(' → ') + ' → ' + q.ans, '這一題的規則：' + deltaText(q.delta)] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 驗證用：答對目前這題（最多 SOLVE_CAP 題）／選一個錯的；可重複呼叫 */
        api.solve = function () { if (phase !== 'ask' || count >= SOLVE_CAP) return; answer(q.idx); };
        api.wrong = function () { if (phase !== 'ask') return; answer((q.idx + 1) % 9); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '一路減七',
        rule: '一開始提示「**請從 1000 開始計數**」。然後出現大大的「−7」，下面有九個數字按鈕，三個一組、每組的個位數都一樣——選出**目前的數字減 7** 的答案。答對了，就再 −7。**目前的數字不會顯示**，要自己記住答案一路算下去。每題限時越來越短；**第 15 題起改成 −13**，第 25 題起「＋17、−9」輪流。答錯或超過時間就結束，看你能連續答對幾題。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            timeMs: timeMs, stepDelta: stepDelta, valueAfter: valueAfter, deltaText: deltaText, bigText: bigText, noticeBefore: noticeBefore, makeOptions: makeOptions, makeQuestion: makeQuestion, formula: formula, whyText: whyText, chain: chain, rating: rating,
            START: START, RAMP_Q: RAMP_Q, TIME_S: TIME_S, DEC: DEC, RULE2_FROM: RULE2_FROM, DEC2: DEC2, RULE3_FROM: RULE3_FROM, ADD3: ADD3, SUB3: SUB3, INTRO_MS: INTRO_MS, NOTICE_MS: NOTICE_MS, SOLVE_CAP: SOLVE_CAP, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
