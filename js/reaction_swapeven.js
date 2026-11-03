/* ═══════════════════════════════════════════════════════════════════
   reaction_swapeven.js — 秒反應・換一張就平（企劃 252）
   樣式：css/games/reaction_swapeven.css（這款專屬的 class 一律以「swapeven-」開頭；共用元件在 css/reaction_common.css）
   兩個小朋友各拿一排數字牌，頭上的對話泡泡寫著各自的總和（例如 上 43、下 37）。
   **上排點一張、下排點一張，兩張交換**，交換後兩排的總和要一樣。答案唯一。
   ───────────────────────────────────────────────────────────────────
   · 算式：上排總和 sA、下排總和 sB。交換上排第 i 張（值 a）與下排第 j 張（值 b）之後：
         上排 = sA − a + b、下排 = sB − b + a；兩排一樣 ⇔ a − b = (sA − sB) ÷ 2（「差的一半」）。
     所以兩排差 6，要找的是「上面的牌比下面的牌大 3」的一對，不是「差 6」的一對（最常見的錯，程式刻意放好幾對差 6 的誘餌）。
   · 出題（makeLevel）：先決定答案那一對（a* − b* = g，g = 差的一半，正負隨機），再讓其他牌湊出需要的總和（有界的隨機分割），
     最後洗牌；窮舉所有「上 i、下 j」確認**剛好一對**能交換成功。
     誘餌：「差整整 2g」的對數至少 FULL_DECOYS、「反方向差 g」的對數至少 REV_DECOYS（太難湊到時會放寬，題目一定會出）。
   · 難度（線性）：每排牌數 3 → 8（CARDS）、數字上限 9 → 60（VMAX）、限時 12 → 6 秒（TIME_S）、
     差的一半的範圍：第 1 關固定 3（兩排差 6），之後下限 3 → 2、上限 3 → 15（HALF_MIN／HALF_MAX）、誘餌對數 1 → 3 與 0 → 2。
   · 揭曉：交換動畫照做，泡泡裡的總和換成交換後的數字；答錯時再用綠框標出正確的兩張，並說明「差的一半」。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'swapeven'：選單、成績、存檔都靠它；樣式在 css/games/reaction_swapeven.css，裡面的 class 名稱一律以 swapeven- 開頭。 */
    'use strict';

    var ID = 'swapeven';                                /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var CARDS = [3, 8];                         /* 每排幾張牌：第 1 關 → 到頂 */
    var VMAX = [9, 60];                         /* 牌上的數字範圍 1～VMAX：第 1 關 → 到頂 */
    var TIME_S = [12, 6];                       /* 每題限時（秒）：第 1 關 → 到頂 */
    var HALF_MIN = [3, 2], HALF_MAX = [3, 15];  /* 「差的一半」的下限／上限（第 1 關固定 3，也就是兩排差 6） */
    var FULL_DECOYS = [1, 3];                   /* 誘餌：「差整整 2g（＝兩排的差）」的牌對數至少幾對 */
    var REV_DECOYS = [0, 2];                    /* 誘餌：「反方向差 g」的牌對數至少幾對 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var TRIES = 4000, RELAX_AT = 2000;          /* 出題最多試幾次；試超過 RELAX_AT 次還湊不到誘餌就放寬 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return Math.round(kit.ramp(level, pair[0], pair[1], RAMP_LEVELS)); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function cardsFor(level) { return ramp(level, CARDS); }
    function vmaxFor(level) { return ramp(level, VMAX); }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }  /* Math.round：四捨五入成整數 */
    function halfRange(level) { return [ramp(level, HALF_MIN), ramp(level, HALF_MAX)]; }
    function fullDecoysFor(level) { return ramp(level, FULL_DECOYS); }
    function revDecoysFor(level) { return ramp(level, REV_DECOYS); }
    function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
    /* 交換上排第 i 張、下排第 j 張之後，「上排總和 − 下排總和」（0 ＝ 一樣＝答對） */
    function gapAfter(A, B, i, j) { return (sum(A) - sum(B)) - 2 * (A[i] - B[j]); }
    /* 所有能讓兩排一樣的 (i, j) */
    function answers(A, B) {
        var out = [];
        for (var i = 0; i < A.length; i++) for (var j = 0; j < B.length; j++) if (gapAfter(A, B, i, j) === 0) out.push({ i: i, j: j });
        return out;
    }
    /* 有幾對 (i, j) 滿足 A[i] − B[j] ＝ diff */
    function countDiff(A, B, diff) {
        var n = 0;
        for (var i = 0; i < A.length; i++) for (var j = 0; j < B.length; j++) if (A[i] - B[j] === diff) n++;
        return n;
    }
    /* 把 total 隨機分成 count 個 1～V 的整數（總和剛好是 total）；不可能就回傳 null */
    function composition(total, count, V, rand) {
        if (total < count || total > count * V) return null;
        var out = [], rem = total;
        for (var i = 0; i < count; i++) {
            var left = count - 1 - i, lo = Math.max(1, rem - V * left), hi = Math.min(V, rem - left);
            var v = kit.randInt(lo, hi, rand);          /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
            out.push(v); rem -= v;
        }
        return out;
    }
    /* 出一關：{ A, B（兩排的數字）, sA, sB, half（差的一半，有正負：A 答案牌 − B 答案牌）, ans: { i, j }, full, rev（誘餌對數）, k, V, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var k = cardsFor(level), V = vmaxFor(level), hr = halfRange(level);
        for (var tr = 0; tr < TRIES; tr++) {            /* 用亂數一直重抽，最多 TRIES 次，抽到符合條件的題目就收下 */
            var hh = Math.min(kit.randInt(hr[0], hr[1], rand), V - 1), g = (rand() < 0.5 ? 1 : -1) * hh;
            var bLo = Math.max(1, 1 - g), bHi = Math.min(V, V - g);
            if (bLo > bHi) continue;
            var bStar = kit.randInt(bLo, bHi, rand), aStar = bStar + g;
            var restA = []; for (var q = 0; q < k - 1; q++) restA.push(kit.randInt(1, V, rand));
            /* 總和要求：sA − sB = 2g ⇒ (其餘上排) − (其餘下排) = g */
            var restB = composition(sum(restA) - g, k - 1, V, rand);
            if (!restB) continue;
            var A = kit.shuffle([aStar].concat(restA), rand), B = kit.shuffle([bStar].concat(restB), rand);  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
            var ans = answers(A, B);
            if (ans.length !== 1) continue;
            var needFull = 2 * hh <= V - 1 ? fullDecoysFor(level) : 0, needRev = revDecoysFor(level);
            if (tr >= RELAX_AT) { needFull = Math.min(needFull, 1); needRev = 0; }
            var full = countDiff(A, B, 2 * g), rev = countDiff(A, B, -g);
            if (full < needFull || rev < needRev) continue;
            return { A: A, B: B, sA: sum(A), sB: sum(B), half: g, ans: ans[0], full: full, rev: rev, k: k, V: V, level: level };
        }
        /* 保底（極少用到）：固定的一題 */
        var fa = [9, 3, 5], fb = [6, 1, 4];
        return { A: fa, B: fb, sA: 17, sB: 11, half: 3, ans: answers(fa, fb)[0], full: countDiff(fa, fb, 6), rev: countDiff(fa, fb, -3), k: 3, V: 9, level: level };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 25) return '心算高手！';
        if (n >= 15) return '算得很準！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '記得：要換的是「差的一半」！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'swapeven-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 小朋友的臉：圓臉、兩個眼睛、微笑（SVG） */
    function face(parent) {
        var s = kit.svg('svg', { 'class': 'swapeven-face', viewBox: '0 0 40 40', width: 44, height: 44 }, parent);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        kit.svg('circle', { 'class': 'swapeven-face__head', cx: 20, cy: 20, r: 17 }, s);
        kit.svg('circle', { 'class': 'swapeven-face__eye', cx: 14, cy: 17, r: 2.4 }, s);
        kit.svg('circle', { 'class': 'swapeven-face__eye', cx: 26, cy: 17, r: 2.4 }, s);
        kit.svg('path', { 'class': 'swapeven-face__mouth', d: 'M12 25 Q20 32 28 25' }, s);
        return s;
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makeLevel(level, api.rand), k = q.k, A = q.A, B = q.B;
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[換一張就平] 第 ' + level + ' 關：每排 ' + k + ' 張（1～' + q.V + '）上 ' + A.join(',') + '＝' + q.sA + '、下 ' + B.join(',') + '＝' + q.sB + '；答案 上' + A[q.ans.i] + '↔下' + B[q.ans.j] + '（差的一半 ' + q.half + '）；誘餌 差' + (2 * Math.abs(q.half)) + ' ' + q.full + ' 對、反向 ' + q.rev + ' 對；限時 ' + timeMs(level) + ' ms');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var W = stage.clientWidth || 472, gap = 6, cw = Math.min(78, Math.floor((W - 16 - (k - 1) * gap) / k)), ch = Math.round(cw * 1.35);  /* Math.floor：無條件捨去成整數 */
        var x0 = Math.round((W - (k * cw + (k - 1) * gap)) / 2);
        var yA = 144, yB = yA + ch + 112;
        var tip = h('div', { 'class': 'qz-note swapeven-tip', text: '上下各點一張交換，讓兩排總和一樣' });
        stage.appendChild(tip);                         /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        stage.appendChild(h('div', { 'class': 'swapeven-table' }));
        stage.lastChild.style.cssText = 'left:6px;right:6px;top:' + (yA - 16) + 'px;height:' + (yB + ch + 16 - (yA - 16)) + 'px;';

        /* 對話泡泡（總和）：小朋友的臉＋泡泡 */
        function bubble(top, who, sum0) {
            var wrap = h('div', { 'class': 'swapeven-who' });
            wrap.style.top = top + 'px';
            face(wrap);
            var b = h('div', { 'class': 'swapeven-bub', text: who + ' 總和 ' + sum0 });
            wrap.appendChild(b);
            stage.appendChild(wrap);                    /* 把整個遊戲區放進舞台（放進去，畫面上才看得到） */
            return b;
        }
        var bubA = bubble(56, '上排', q.sA), bubB = bubble(yB + ch + 30, '下排', q.sB);

        function pos(row, idx) { return { left: x0 + idx * (cw + gap), top: row === 0 ? yA : yB }; }
        var cards = [[], []], sel = [-1, -1], locked = false;
        [A, B].forEach(function (arr, row) {            /* forEach：對陣列的每個元素各做一次 */
            arr.forEach(function (v, idx) {
                var el = h('div', { 'class': 'swapeven-card', text: String(v) });
                var p = pos(row, idx);
                el.style.cssText = 'left:' + p.left + 'px;top:' + p.top + 'px;width:' + cw + 'px;height:' + ch + 'px;font-size:' + Math.round(cw * (q.V >= 10 ? 0.46 : 0.58)) + 'px;';
                stage.appendChild(el);
                cards[row].push(el);
                kit.onTap(el, function () { choose(row, idx); });  /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
            });
        });
        var info = h('div', { 'class': 'qz-note swapeven-info', text: '' });
        info.style.top = (yB + ch + 100) + 'px';
        stage.appendChild(info);
        api.timer(timeMs(level), function () { timeout(); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        if (level === 1 && kit.once('swapeven.hint')) kit.hintOn(stage, cards[0][q.ans.i], { mode: 'tap', delay: 700, text: '兩排差 ' + Math.abs(q.sA - q.sB) + '：換差 ' + Math.abs(q.half) + ' 的兩張' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */

        function choose(row, idx) {
            if (locked || api.over) return;
            if (sel[row] === idx) { sel[row] = -1; cards[row][idx].classList.remove('swapeven-card--sel'); return; }  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            if (sel[row] >= 0) cards[row][sel[row]].classList.remove('swapeven-card--sel');
            sel[row] = idx; cards[row][idx].classList.add('swapeven-card--sel');
            Sfx.play('click');                          /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            if (sel[0] >= 0 && sel[1] >= 0) doSwap(sel[0], sel[1]);
        }
        /* 換牌動畫＋判定 */
        function doSwap(i, j) {
            locked = true; api.stopTimer();
            var a = A[i], b = B[j], elA = cards[0][i], elB = cards[1][j], pa = pos(0, i), pb = pos(1, j);
            elA.style.left = pb.left + 'px'; elA.style.top = pb.top + 'px';
            elB.style.left = pa.left + 'px'; elB.style.top = pa.top + 'px';
            var sA2 = q.sA - a + b, sB2 = q.sB - b + a, ok = sA2 === sB2;
            api.after(560, function () {                /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
                bubA.textContent = '上排 總和 ' + sA2; bubB.textContent = '下排 總和 ' + sB2;  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
                bubA.classList.add(ok ? 'swapeven-bub--ok' : 'swapeven-bub--bad'); bubB.classList.add(ok ? 'swapeven-bub--ok' : 'swapeven-bub--bad');
                if (ok) {
                    info.textContent = '兩排都是 ' + sA2 + '，一樣了！（換的是差 ' + Math.abs(a - b) + ' 的兩張）';  /* Math.abs：取絕對值（去掉負號） */
                    kit.flash(stage, true, api.my);     /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
                    api.pass({ delay: 1500 });          /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
                    return;
                }
                reveal();
                info.textContent = '上排 ' + q.sA + '→' + sA2 + '、下排 ' + q.sB + '→' + sB2 + '，不一樣！';
                api.after(1300, function () { info.textContent = explain(); });
                kit.flash(stage, false, api.my);
                api.fail({ delay: 3600, lines: ['你換了 ' + a + ' 和 ' + b + '：上排 ' + q.sA + '→' + sA2 + '、下排 ' + q.sB + '→' + sB2 + '，不一樣', explainLong()] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
            });
        }
        /* 說明：兩排差 d，要換「差 d 的一半」的兩張 */
        function explain() {
            var d = Math.abs(q.sA - q.sB), a = A[q.ans.i], b = B[q.ans.j];
            return '差 ' + d + '，要換差 ' + (d / 2) + ' 的：' + a + ' 和 ' + b;
        }
        function explainLong() { var d = Math.abs(q.sA - q.sB); return '兩排差 ' + d + '，要換「差的一半」' + (d / 2) + ' 的兩張：' + A[q.ans.i] + ' 和 ' + B[q.ans.j]; }
        /* 標出正確的兩張牌（綠框；牌會跟著動畫換位，所以標在牌上） */
        function reveal() {
            cards[0][q.ans.i].classList.add('swapeven-card--ans'); cards[1][q.ans.j].classList.add('swapeven-card--ans');
        }
        /* 時間到：算失敗（api.fail），通常會把正確答案亮出來 */
        function timeout() {
            if (locked || api.over) return;
            locked = true; reveal();
            info.textContent = '時間到！' + explain();
            kit.flash(stage, false, api.my);
            api.fail({ delay: 2800, lines: ['時間到！', explainLong()] });
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { choose(0, q.ans.i); choose(1, q.ans.j); };
        api.wrong = function () {
            for (var i = 0; i < k; i++) for (var j = 0; j < k; j++) if (gapAfter(A, B, i, j) !== 0) { choose(0, i); choose(1, j); return; }
        };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '換一張就平',
        rule: '上下兩排數字牌，頭上的泡泡寫著各自的總和。**上排點一張、下排點一張，兩張交換**，要讓**交換後兩排的總和一樣**。答案只有一組。小心：兩排差多少，不是找差多少的牌，要找的是「**差的一半**」！選錯或來不及就結束，看你能過幾關。越後面，牌越多、數字越大、時間越短。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            cardsFor: cardsFor, vmaxFor: vmaxFor, timeMs: timeMs, halfRange: halfRange, fullDecoysFor: fullDecoysFor, revDecoysFor: revDecoysFor,
            sum: sum, gapAfter: gapAfter, answers: answers, countDiff: countDiff, composition: composition, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, CARDS: CARDS, VMAX: VMAX, TIME_S: TIME_S, HALF_MIN: HALF_MIN, HALF_MAX: HALF_MAX, FULL_DECOYS: FULL_DECOYS, REV_DECOYS: REV_DECOYS, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
