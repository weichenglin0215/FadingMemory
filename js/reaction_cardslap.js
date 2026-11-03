/* ═══════════════════════════════════════════════════════════════════
   reaction_cardslap.js — 秒反應・心臟病（企劃 353）
   樣式：css/games/reaction_cardslap.css（這款專屬的 class 一律以「cardslap-」開頭；共用元件在 css/reaction_common.css）
   小時候玩的撲克牌遊戲。牌一張一張翻出來，同時要在心裡數「A、2、3、4…K、A、2…」（**數到第幾個，畫面只在前 3 張顯示，之後就不顯示，要自己數**）。
   **翻出來的牌剛好等於你心裡數到的那個數字，就拍下去**（點畫面）。拍錯、或該拍沒拍，就結束。成績＝拍對幾次（越多越好）。
   ───────────────────────────────────────────────────────────────────
   · 這是「持續進行」的遊戲：用 kit.run 的 scoreOf（S.score ＝拍對的次數）；難度隨「拍對了幾次（hits）」增加。
   · 數數：第 k 張牌（k 從 1 起）要數到 countFor(k)：順著數是 A、2、…、K、A…（1～13 循環）；拍對 REVERSE_AT 次之後改成「倒著數」K、Q、J、10…A、K…
     （改的時候畫面會告訴你，而且下一張牌重新從 K 開始，前 3 張再顯示一次數到哪）。
   · 發牌（nextCard）：這張牌的點數是「剛好等於現在該數的數字」（要拍）的機率是 MATCH_P；而且連續不會超過 MAX_GAP 張都不用拍。
     不用拍的牌，有 CONFUSE_P 的機率故意挑一張「跟上一張長得像」的點數（6 和 9、3 和 8、2 和 7、10 和 J…），讓你手滑。
   · 難度（隨 hits 線性，到 RAMP_HITS 次為止）：翻牌的間隔 1400 → 650 毫秒（INTERVAL）。
   · 判定：這張牌翻出來之後、下一張翻出來之前，要拍的牌沒拍 → 結束；不用拍的牌拍了 → 結束。
   · 結束時把那一張牌和「你應該數到的數字」並排。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'cardslap'：選單、成績、存檔都靠它；樣式在 css/games/reaction_cardslap.css，裡面的 class 名稱一律以 cardslap- 開頭。 */
    'use strict';

    var ID = 'cardslap';                                /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 次', label: '拍對幾次', min: 1, max: 300 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_HITS = 40;                         /* 拍對幾次之後難度到頂 */
    var INTERVAL = [1400, 650];                 /* 翻牌的間隔（毫秒）：0 次 → 到頂 */
    var MATCH_P = 0.28, MAX_GAP = 6;            /* 每張牌是「要拍的」的機率；連續最多幾張不用拍 */
    var CONFUSE_P = [0.1, 0.5];                 /* 不用拍的牌，挑「跟上一張長得像」的機率：0 次 → 到頂 */
    var REVERSE_AT = 15;                        /* 拍對幾次之後改成倒著數 */
    var SHOW_COUNT = 3;                         /* 每次開始數（或改倒著數）的前幾張，畫面會顯示數到哪 */
    var LEAD_MS = 1200;                         /* 開始後多久翻第一張 */
    var SOLVE_CAP = 5;                          /* 驗證用：api.solve 最多幫你拍到幾次（再多就故意漏拍，遊戲才會結束） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];  /* 撲克牌的點數：A、2～10、J、Q、K */
    var SUITS = ['spade', 'heart', 'diamond', 'club'];  /* 四種花色（CSS／圖示用的英文名稱）：黑桃、紅心、方塊、梅花 */
    var LOOK = { 6: [9], 9: [6], 3: [8], 8: [3, 5], 5: [8, 6], 2: [7], 7: [2], 10: [11], 11: [10, 12], 12: [11, 13], 13: [12], 1: [4] };       /* 長得像的點數（11＝J、12＝Q、13＝K、1＝A） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function prog(hits) { return Math.min(1, Math.max(0, hits / RAMP_HITS)); }
    function intervalFor(hits) { return Math.round(INTERVAL[0] + (INTERVAL[1] - INTERVAL[0]) * prog(hits)); }  /* Math.round：四捨五入成整數 */
    function confuseP(hits) { return CONFUSE_P[0] + (CONFUSE_P[1] - CONFUSE_P[0]) * prog(hits); }
    function dirFor(hits) { return hits >= REVERSE_AT ? -1 : 1; }                       /* 1＝順著數、−1＝倒著數 */
    function rankName(r) { return RANKS[r - 1]; }
    /* 這個數數的階段裡，第 k 張（k 從 1 起）要數到幾（1～13）：順著數 1、2、…、13、1…；倒著數 13、12、…、1、13… */
    function countFor(k, dir) { return dir > 0 ? ((k - 1) % 13) + 1 : 13 - ((k - 1) % 13); }
    /* 發下一張牌。st = { k（這個階段的第幾張）, dir, gap（連續幾張不用拍）, prev（上一張的點數）}；回傳 { rank, suit, count, isMatch } */
    function nextCard(st, hits, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var count = countFor(st.k, st.dir), match = st.gap >= MAX_GAP || rand() < MATCH_P, rank;
        if (match) rank = count;
        else {
            var cands = LOOK[st.prev] ? LOOK[st.prev].filter(function (x) { return x !== count; }) : [];  /* filter：留下符合條件的元素，回傳新陣列 */
            if (cands.length && rand() < confuseP(hits)) rank = kit.pick(cands, rand);  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
            else { do { rank = kit.randInt(1, 13, rand); } while (rank === count); }  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
        }
        return { rank: rank, suit: kit.pick(SUITS, rand), count: count, isMatch: rank === count };  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 50) return '心臟病高手！';
        if (n >= 30) return '反應和記性都超強！';
        if (n >= 15) return '不錯喔！';
        if (n >= 6) return '再接再厲！';
        return '在心裡一直數，別停下來！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 12, stageClass: 'cardslap-stage', resume: false,
            head: function () { return '心臟病'; },
            info: function (S) { return '拍對 ' + S.score + ' 次'; },
            scoreOf: function (S) { return S.score; },
            numText: function (v) { return v + ' 次'; },
            rating: rating,
            lines: function (S) { return ['一共拍對 ' + S.score + ' 次']; },
            setup: setup
        });
    }

    /* 花色（SVG path，viewBox 0 0 24 24） */
    var SUIT_PATH = {
        heart: 'M12 21 C4 14 2 9 2 6.5 C2 3.5 4.5 2 7 2 C9 2 11 3.2 12 5 C13 3.2 15 2 17 2 C19.5 2 22 3.5 22 6.5 C22 9 20 14 12 21 Z',
        diamond: 'M12 1.5 L21 12 L12 22.5 L3 12 Z',
        spade: 'M12 1.5 C12 1.5 3 9 3 14 C3 17 5.5 18.5 8 18 C9.5 17.8 10.7 17 11 16 C10.8 19 10 21 8 22.5 L16 22.5 C14 21 13.2 19 13 16 C13.3 17 14.5 17.8 16 18 C18.5 18.5 21 17 21 14 C21 9 12 1.5 12 1.5 Z',
        club: 'M12 2 C9.5 2 8 3.8 8 5.8 C8 7 8.6 8 9.5 8.8 C8.8 8.6 8.2 8.5 7.5 8.5 C5 8.5 3 10.3 3 12.8 C3 15.3 5 17 7.3 17 C9 17 10.4 16.3 11.2 15.2 C11 18.5 10 21 8 22.5 L16 22.5 C14 21 13 18.5 12.8 15.2 C13.6 16.3 15 17 16.7 17 C19 17 21 15.3 21 12.8 C21 10.3 19 8.5 16.5 8.5 C15.8 8.5 15.2 8.6 14.5 8.8 C15.4 8 16 7 16 5.8 C16 3.8 14.5 2 12 2 Z'
    };
    function suitSvg(suit, size) {
        var s = kit.svg('svg', { 'class': 'cardslap-suit cardslap-suit--' + suit, viewBox: '0 0 24 24', width: size, height: size });  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        kit.svg('path', { d: SUIT_PATH[suit] }, s);     /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        return s;
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, S = api.S;
        var hits = 0, st = { k: 1, dir: 1, gap: 0, prev: 0 }, cur = null, slapped = false, over = false, shownSince = 0, since = 0, flips = 0;
        api.info = { get hits() { return hits; }, get card() { return cur; }, get flips() { return flips; } };
        S.score = 0; api.setInfo('拍對 0 次');
        console.log('[心臟病] 開始：翻牌間隔 ' + intervalFor(0) + ' 毫秒');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var field = h('div', { 'class': 'cardslap-field' });
        stage.appendChild(field);                       /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        field.appendChild(h('div', { 'class': 'qz-note cardslap-tip', text: '牌＝你數到的數字就拍（點畫面）' }));  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var countBox = h('div', { 'class': 'cardslap-count', text: '' }); field.appendChild(countBox);
        var table = h('div', { 'class': 'cardslap-table' }); field.appendChild(table);
        var cardEl = h('div', { 'class': 'cardslap-card cardslap-card--back' }); table.appendChild(cardEl);
        var info = h('div', { 'class': 'qz-note cardslap-info', text: '準備好，牌要翻了！' }); field.appendChild(info);
        if (kit.once('cardslap.hint')) kit.hintOn(stage, null, { mode: 'tap', x: 236, y: 330, delay: 2600, text: '牌＝數到的數字就點' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */

        /* 翻下一張：檢查上一張有沒有漏拍；發新牌；排下一次翻牌 */
        function flip() {
            if (over || api.over) return;
            if (cur && cur.isMatch && !slapped) { finish('missed'); return; }
            if (hits === REVERSE_AT && st.dir > 0) { st = { k: 1, dir: -1, gap: st.gap, prev: st.prev }; since = 0; info.textContent = '改成倒著數！K、Q、J、10…'; }  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            cur = nextCard(st, hits, api.rand); slapped = false; flips++;
            st.gap = cur.isMatch ? 0 : st.gap + 1; st.prev = cur.rank; since++;
            showCard(cur);
            countBox.textContent = since <= SHOW_COUNT ? '數到：' + rankName(cur.count) : '';                        /* 只有前幾張顯示數到哪，之後要自己數 */
            st.k++;
            shownSince = performance.now();             /* performance.now()：高精度的時間（毫秒），計時用 */
            api.after(intervalFor(hits), flip);         /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
        }
        function showCard(c) {
            var el = h('div', { 'class': 'cardslap-card cardslap-card--' + (c.suit === 'heart' || c.suit === 'diamond' ? 'red' : 'black') });
            el.appendChild(h('div', { 'class': 'cardslap-card__r', text: rankName(c.rank) }));
            var big = h('div', { 'class': 'cardslap-card__big' }); big.appendChild(suitSvg(c.suit, 96)); el.appendChild(big);
            el.appendChild(h('div', { 'class': 'cardslap-card__r cardslap-card__r--b', text: rankName(c.rank) }));
            table.replaceChild(el, cardEl); cardEl = el; el.classList.add('cardslap-card--flip'); Sfx.play('flip');  /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
        }
        api.after(LEAD_MS, flip);                       /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
        /* 拍：點畫面任何地方。這張是要拍的 → 加一分；不是 → 結束 */
        kit.onTap(field, function () {                  /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
            if (over || api.over || !cur) return;
            if (slapped) return;
            if (cur.isMatch) { slapped = true; hits++; S.score = hits; api.setInfo('拍對 ' + hits + ' 次'); cardEl.classList.add('cardslap-card--ok'); Sfx.play('pop'); info.textContent = ''; }  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            else finish('wrong');
        });
        /* 這一局結束：算出成績並進入結算畫面 */
        function finish(kind) {
            if (over) return;
            over = true; cardEl.classList.add(kind === 'wrong' ? 'cardslap-card--bad' : 'cardslap-card--miss');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            var msg = kind === 'wrong' ? '這張是「' + rankName(cur.rank) + '」，你該數到「' + rankName(cur.count) + '」，不用拍！' : '這張「' + rankName(cur.rank) + '」剛好是你該數到的，卻沒拍！';
            info.textContent = msg; countBox.textContent = '你該數到：' + rankName(cur.count);  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            kit.flash(stage, false, api.my);            /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            api.fail({ delay: 3200, lines: [msg, '一共拍對 ' + hits + ' 次'] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 驗證用（會被重複呼叫，要冪等）：solve＝該拍的牌就拍（最多 SOLVE_CAP 次，之後故意漏拍讓遊戲結束）、wrong＝不用拍的牌就拍 */
        api.solve = function () { if (over || !cur || slapped || !cur.isMatch || hits >= SOLVE_CAP) return; field.dispatchEvent(new Event('pointerdown')); };
        api.wrong = function () { if (over || !cur || slapped || cur.isMatch) return; field.dispatchEvent(new Event('pointerdown')); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '心臟病',
        rule: '小時候玩的撲克牌遊戲。牌一張一張翻出來，你要在心裡一直數「A、2、3…K、A、2…」——**畫面只在前 3 張告訴你數到哪，之後要自己數**。**翻出來的牌剛好等於你心裡數到的數字，就拍下去**（點畫面任何地方）。**拍錯，或該拍沒拍，就結束**。成績是拍對幾次。小心：翻牌會越來越快，還會故意挑長得像的牌（6 後面接 9），拍對 15 次之後**要倒著數**（K、Q、J…）！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            intervalFor: intervalFor, confuseP: confuseP, dirFor: dirFor, rankName: rankName, countFor: countFor, nextCard: nextCard, rating: rating,
            RAMP_HITS: RAMP_HITS, INTERVAL: INTERVAL, MATCH_P: MATCH_P, MAX_GAP: MAX_GAP, CONFUSE_P: CONFUSE_P, REVERSE_AT: REVERSE_AT, SHOW_COUNT: SHOW_COUNT, LEAD_MS: LEAD_MS, SOLVE_CAP: SOLVE_CAP, RANKS: RANKS, SUITS: SUITS, LOOK: LOOK, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
