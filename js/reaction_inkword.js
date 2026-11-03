/* ═══════════════════════════════════════════════════════════════════
   reaction_inkword.js — 秒反應・字的顏色（企劃 315）
   樣式：css/games/reaction_inkword.css（這款專屬的 class 一律以「inkword-」開頭；共用元件在 css/reaction_common.css）
   一個字一個字閃過：每個字是一種顏色的名字，用**另一種**顏色寫（例如用藍色寫的「紅」）。閃完 3 → 7 個字之後，問一個問題——
   「第 3 個字寫的是什麼？」（要記字）或「第 3 個字是什麼顏色？」（要記墨水的顏色），點下面的顏色按鈕。
   ───────────────────────────────────────────────────────────────────
   · 要記兩樣東西：問「寫的字」還是「墨水顏色」是隨機的，而且要等閃完才知道，所以兩個都要記——封住「只記一種」的偷吃步。
   · 後面的關卡（第 WHICH_FROM 關起，一部分題目）會問「第幾個字是用 X 色寫的？」——按鈕變成數字 1～N。
     這種題一定保證那個墨水顏色在整串字裡只出現一次（答案才唯一）。
   · 每個字的「字」和「墨水顏色」一定不同（用另一種顏色寫，不會有一致的字讓你偷懶）。
   · 難度（線性）：字數 3 → 7（LEN）、每個字停留 800 → 380 毫秒（FLASH_MS）、空檔 200 → 100 毫秒（GAP_MS）、作答時間 10 → 5 秒（RESP_S）。
   · 答錯時把整串字並排（每個字用它的墨水顏色寫、下面寫出「字／墨色」），被問的那一個標起來。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'inkword'：選單、成績、存檔都靠它；樣式在 css/games/reaction_inkword.css，裡面的 class 名稱一律以 inkword- 開頭。 */
    'use strict';

    var ID = 'inkword';                                 /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var LEN = [3, 7];                           /* 閃幾個字：第 1 關 → 到頂 */
    var FLASH_MS = [800, 380];                  /* 每個字停留多久（毫秒）：第 1 關 → 到頂 */
    var GAP_MS = [200, 100];                    /* 字與字之間的空檔（毫秒）：第 1 關 → 到頂 */
    var RESP_S = [10, 5];                       /* 作答的時間（秒）：第 1 關 → 到頂 */
    var WHICH_FROM = 8, WHICH_P = [0.15, 0.4];  /* 第幾關起會問「第幾個字是用 X 色寫的」、機率（第 WHICH_FROM 關 → 到頂） */
    var LEAD_MS = 600;                              /* 出第一個字之前先等多久（毫秒） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var COLORS = [                              /* 六種顏色：id 對應 CSS 的 .inkword-c--id 與 theme 的 --ikw-id */
        { id: 'red', name: '紅' }, { id: 'yellow', name: '黃' }, { id: 'green', name: '綠' }, { id: 'blue', name: '藍' }, { id: 'purple', name: '紫' }, { id: 'orange', name: '橘' }
    ];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }
    function lenFor(level) { return Math.round(ramp(level, LEN)); }
    function flashMsFor(level) { return Math.round(ramp(level, FLASH_MS)); }
    function gapMsFor(level) { return Math.round(ramp(level, GAP_MS)); }
    function respMs(level) { return Math.round(ramp(level, RESP_S) * 1000); }
    function whichPFor(level) { return level < WHICH_FROM ? 0 : kit.ramp(level, WHICH_P[0], WHICH_P[1], RAMP_LEVELS); }
    /* 出一關：{ seq（[{ w（字＝哪個顏色的名字）, c（墨水顏色）}]，w ≠ c）, q: { type: 'word'｜'ink'｜'which', idx（被問第幾個字，0 起算；which 題是答案的位置）, color（which 題問哪個顏色）, answer（顏色編號；which 題是位置）}, len, flashMs, gapMs, respMs, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var len = lenFor(level), seq = [], i;
        for (i = 0; i < len; i++) {
            var w = kit.randInt(0, 5, rand), c; do { c = kit.randInt(0, 5, rand); } while (c === w);
            seq.push({ w: w, c: c });
        }
        var q;
        if (rand() < whichPFor(level)) {
            /* which 題：挑一個「墨水顏色在整串裡只出現一次」的字；沒有就改問 word／ink */
            var uniq = []; seq.forEach(function (s, k) { if (seq.filter(function (t) { return t.c === s.c; }).length === 1) uniq.push(k); });
            if (uniq.length) { var at = kit.pick(uniq, rand); q = { type: 'which', idx: at, color: seq[at].c, answer: at }; }
        }
        if (!q) { var idx = kit.randInt(0, len - 1, rand), type = rand() < 0.5 ? 'word' : 'ink'; q = { type: type, idx: idx, answer: type === 'word' ? seq[idx].w : seq[idx].c }; }
        return { seq: seq, q: q, len: len, flashMs: flashMsFor(level), gapMs: gapMsFor(level), respMs: respMs(level), level: level };
    }
    function ordinal(i) { return '第 ' + (i + 1) + ' 個'; }
    function questionText(q) {
        if (q.type === 'word') return ordinal(q.idx) + '字，寫的是什麼字？';
        if (q.type === 'ink') return ordinal(q.idx) + '字，是什麼顏色寫的？';
        return '第幾個字是用「' + COLORS[q.color].name + '」色寫的？';
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 15) return '眼明手快、過目不忘！';
        if (n >= 10) return '字和顏色都記得住！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '字和顏色兩樣都要記！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'inkword-stage',
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
        var q = makeLevel(level, api.rand), len = q.len, Q = q.q;
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[字的顏色] 第 ' + level + ' 關：' + q.seq.map(function (s) { return COLORS[s.w].name + '(' + COLORS[s.c].name + ')'; }).join(' ') + '（字(墨色)）；' + questionText(Q) + ' 答案 ' + (Q.type === 'which' ? '第 ' + (Q.answer + 1) + ' 個' : COLORS[Q.answer].name) + '；每個停 ' + q.flashMs + ' 毫秒');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var field = h('div', { 'class': 'inkword-field' });
        stage.appendChild(field);
        var tip = h('div', { 'class': 'qz-note inkword-tip', text: '看每個字寫了什麼、用什麼顏色寫' });
        field.appendChild(tip);
        var paper = h('div', { 'class': 'inkword-paper' });
        var glyph = h('div', { 'class': 'inkword-glyph', text: '' });
        paper.appendChild(glyph); field.appendChild(paper);
        var dots = h('div', { 'class': 'inkword-dots' });
        for (var i = 0; i < len; i++) dots.appendChild(h('span', { 'class': 'inkword-dot' }));
        field.appendChild(dots);
        var ask = h('div', { 'class': 'inkword-ask', text: '' });
        field.appendChild(ask);
        var info = h('div', { 'class': 'qz-note inkword-info', text: '' });
        field.appendChild(info);
        var phase = 'show', done = false, grid = null, k = 0;

        /* 一個一個閃：每個字停 flashMs、空檔 gapMs */
        function showNext() {
            if (api.over) return;
            if (k >= len) { glyph.textContent = ''; askNow(); return; }
            var s = q.seq[k]; glyph.textContent = COLORS[s.w].name; glyph.className = 'inkword-glyph inkword-c--' + COLORS[s.c].id;
            dots.children[k].classList.add('inkword-dot--on'); Sfx.play('click');
            api.after(q.flashMs, function () { glyph.textContent = ''; api.after(q.gapMs, function () { k++; showNext(); }); });
        }
        api.after(LEAD_MS, showNext);

        /* 問問題：6 個顏色按鈕（寫的字／墨水顏色），或數字按鈕（第幾個字） */
        function askNow() {
            phase = 'ask'; tip.textContent = '回答問題'; ask.textContent = questionText(Q); dots.style.display = 'none'; paper.style.display = 'none';
            var items;
            if (Q.type === 'which') items = q.seq.map(function (s, i) { return { text: String(i + 1), kind: 'line', cls: 'inkword-num', onTap: function () { judge(i); } }; });
            else items = COLORS.map(function (c, i) { return { text: c.name, kind: 'line', cls: 'inkword-sw inkword-sw--' + c.id, onTap: function () { judge(i); } }; });
            var cols = Q.type === 'which' ? Math.min(len, 4) : 3;
            grid = kit.btnGrid(field, items, { cols: cols, h: Q.type === 'which' ? 96 : 100, gap: 10 });
            api.timer(q.respMs, function () { judge(-1); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
            if (level === 1 && kit.once('inkword.hint')) kit.hintOn(stage, grid.btns[Q.answer], { mode: 'tap', delay: 2000, text: '請點答案的顏色' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
        }
        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(pick) {
            if (done || api.over || phase !== 'ask') return;
            done = true; phase = 'end';
            var ok = pick === Q.answer;
            grid.btns[Q.answer].classList.add('inkword-ok');
            if (pick >= 0 && !ok) grid.btns[pick].classList.add('inkword-bad');
            var ansText = Q.type === 'which' ? '第 ' + (Q.answer + 1) + ' 個' : COLORS[Q.answer].name;
            if (ok) { info.textContent = '答對了！'; kit.flash(stage, true, api.my); api.pass({ delay: 1200 }); return; }
            /* 答錯：把整串字並排，被問的標起來 */
            ask.style.display = 'none';
            var strip = h('div', { 'class': 'inkword-strip' });
            q.seq.forEach(function (s, i) {
                var cell = h('div', { 'class': 'inkword-cell' + (i === Q.idx ? ' inkword-cell--ask' : '') });
                cell.appendChild(h('div', { 'class': 'inkword-cell__no', text: String(i + 1) }));
                cell.appendChild(h('div', { 'class': 'inkword-cell__ch inkword-c--' + COLORS[s.c].id, text: COLORS[s.w].name }));
                cell.appendChild(h('div', { 'class': 'inkword-cell__txt', text: '字 ' + COLORS[s.w].name }));
                cell.appendChild(h('div', { 'class': 'inkword-cell__txt', text: '墨 ' + COLORS[s.c].name }));
                strip.appendChild(cell);
            });
            field.insertBefore(strip, info);
            info.textContent = questionText(Q) + ' 答案是「' + ansText + '」' + (pick >= 0 ? '，你選了「' + (Q.type === 'which' ? '第 ' + (pick + 1) + ' 個' : COLORS[pick].name) + '」' : '（時間到）');
            kit.flash(stage, false, api.my);
            api.fail({ delay: 3800, lines: [questionText(Q) + ' 答案是「' + ansText + '」', pick >= 0 ? '你選了「' + (Q.type === 'which' ? '第 ' + (pick + 1) + ' 個' : COLORS[pick].name) + '」' : '時間到！'] });
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { if (phase === 'ask') judge(Q.answer); };
        api.wrong = function () { if (phase === 'ask') judge(Q.type === 'which' ? (Q.answer + 1) % len : (Q.answer + 1) % 6); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '字的顏色',
        rule: '一個字一個字閃過：每個字是一種顏色的名字，卻用另一種顏色寫（例如用藍色寫的「紅」）。閃完之後會問一個問題：「第幾個字**寫的是什麼字**？」或「第幾個字是什麼顏色寫的？」，**點下面的顏色按鈕**。問哪一種要等閃完才知道，所以**字和顏色兩樣都要記**。後面的關卡還會問「第幾個字是用某個顏色寫的」，要點數字。答錯或來不及就結束，看你能過幾關。越後面，字越多、閃得越快！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            lenFor: lenFor, flashMsFor: flashMsFor, gapMsFor: gapMsFor, respMs: respMs, whichPFor: whichPFor, makeLevel: makeLevel, questionText: questionText, ordinal: ordinal, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, LEN: LEN, FLASH_MS: FLASH_MS, GAP_MS: GAP_MS, RESP_S: RESP_S, WHICH_FROM: WHICH_FROM, WHICH_P: WHICH_P, LEAD_MS: LEAD_MS, COLORS: COLORS, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
