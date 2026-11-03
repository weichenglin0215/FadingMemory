/* ═══════════════════════════════════════════════════════════════════
   reaction_change.js — 秒反應・找錢（企劃 400）
   樣式：css/games/reaction_change.css（這款專屬的 class 一律以「change-」開頭；共用元件在 css/reaction_common.css）
   雜貨店的收銀台。客人買了 386 元，給你 1000 元。**用下面的數字鍵輸入要找多少錢**（614）。答錯就結束。
   ───────────────────────────────────────────────────────────────────
   · 一題（makeQuestion）：客人買了 price 元，給你 paid 元，**要找的錢 ＝ paid − price**。
       一般的題目：paid 是比 price 大的整數鈔票金額（100、200、500、1000、2000、5000、10000…，挑最近的兩三個之一），
         所以常常要**借位**（1000 − 386 常常被算成 714 或 624）；
       客人多給零錢的題目（機率 0 → 0.4，答對 5 題之後才會出現）：客人在整數鈔票之外再多給一些零錢，**多給的零錢讓要找的錢剛好是 5 的倍數**
         （386 元給 1000 ＋ 11 ＝ 1011 元，要找 625）——這是台灣人很常做的。
   · 輸入：0～9 的數字鍵；輸入的位數等於答案的位數就自動判定；也可以按 ⌫ 刪掉、按 ✓ 提早送出。
   · 難度（線性，依連續答對題數 n，到 RAMP_Q 題到頂）：價錢的上限 300 → 9800（金額越來越大）、每題限時 8 → 4 秒、
     要借位的次數（直式減法裡借位的欄位數）至少 0 → 2、多給零錢的機率 0 → 0.4。
   · 揭曉：寫出直式減法，**借位的欄位標紅**；寫出你輸入的和正確的。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'change'：選單、成績、存檔都靠它；樣式在 css/games/reaction_change.css，裡面的 class 名稱一律以 change- 開頭。 */
    'use strict';

    var ID = 'change';                                  /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '連續答對', min: 1, max: 300 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_Q = 40;                            /* 答對幾題之後難度到頂 */
    var MAX_PRICE = [300, 9800];                /* 價錢的上限：第 0 題 → 到頂 */
    var MIN_FRAC = 0.2;                         /* 價錢的下限＝上限 × 這個比例（至少 15 元） */
    var TIME_S = [8, 4];                        /* 每題限時（秒）：第 0 題 → 到頂 */
    var BORROW_MIN = [0, 2];                    /* 直式減法裡至少要借位幾次：第 0 題 → 到頂（四捨五入） */
    var P_EXTRA = [0, 0.4];                     /* 客人多給零錢的機率：第 0 題 → 到頂 */
    var EXTRA_FROM = 5;                         /* 答對幾題之後才會有多給零錢的題目 */
    var NOTES = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];     /* 客人拿出來的整數鈔票金額 */
    var SOLVE_CAP = 10;                         /* 驗證用：api.solve 最多幫忙答對幾題 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var MINUS = '−';                                /* 減號（用真正的減號「−」，不是鍵盤上的連字號） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function prog(n) { return Math.min(1, Math.max(0, n / RAMP_Q)); }
    function lerp(pair, n) { return pair[0] + (pair[1] - pair[0]) * prog(n); }
    function maxPriceFor(n) { return Math.round(lerp(MAX_PRICE, n)); }  /* Math.round：四捨五入成整數 */
    function minPriceFor(n) { return Math.max(15, Math.round(maxPriceFor(n) * MIN_FRAC)); }  /* Math.round：四捨五入成整數 */
    function timeMs(n) { return Math.round(lerp(TIME_S, n) * 1000); }
    function borrowMinFor(n) { return Math.round(lerp(BORROW_MIN, n)); }
    function pExtraFor(n) { return n >= EXTRA_FROM ? Math.round(lerp(P_EXTRA, n) * 1000) / 1000 : 0; }
    /* 直式減法 a − b（a ≥ b）每一欄有沒有借位：回傳從個位數開始的陣列（true＝這一欄要向左邊借）；用小學的借位算法逐欄算 */
    function borrowCols(a, b) {
        var da = String(a).split('').reverse().map(Number), db = String(b).split('').reverse().map(Number), out = [], borrow = 0;
        for (var i = 0; i < da.length; i++) {
            var top = da[i] - borrow, bot = db[i] || 0;
            if (top < bot) { out.push(true); borrow = 1; } else { out.push(false); borrow = 0; }
        }
        return out;
    }
    function countBorrows(a, b) { return borrowCols(a, b).filter(Boolean).length; }
    /* 直式減法的各列文字：{ top（被減數）, bot（減數）, res（答案）, width（欄數）, borrow（每欄是否借位，從左邊最高位開始）} */
    function vertical(a, b) {
        var res = a - b, w = String(a).length, pad = function (v) { var s = String(v); while (s.length < w) s = ' ' + s; return s.split(''); };
        return { top: pad(a), bot: pad(b), res: pad(res), width: w, borrow: borrowCols(a, b).reverse() };
    }
    /* 一題：{ n, price, base（整數鈔票金額）, extra（多給的零錢）, paid（客人給的總額）, change（要找的錢）, digits（答案的位數）, borrows（借位次數） } */
    function makeQuestion(n, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var hi = maxPriceFor(n), lo = minPriceFor(n), need = borrowMinFor(n), best = null;
        for (var tr = 0; tr < 400; tr++) {
            var price = kit.randInt(lo, hi, rand), cands = NOTES.filter(function (v) { return v >= price + 10; }).slice(0, n < 20 ? 2 : 3);  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
            if (!cands.length) continue;
            var base = kit.pick(cands, rand), extra = 0;  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
            if (rand() < pExtraFor(n)) { extra = kit.randInt(1, 49, rand); while ((base + extra - price) % 5 !== 0) extra++; }  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
            var paid = base + extra, change = paid - price, br = countBorrows(paid, price);
            best = { n: n, price: price, base: base, extra: extra, paid: paid, change: change, digits: String(change).length, borrows: br };
            if (br >= need) return best;
        }
        return best;
    }
    function whyText(q, typed) {
        if (typed == null || typed === '') return '時間到！' + q.paid + ' ' + MINUS + ' ' + q.price + ' ＝ ' + q.change;
        return '找錯了！' + q.paid + ' ' + MINUS + ' ' + q.price + ' ＝ ' + q.change + '，你輸入 ' + typed;
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 30) return '收銀台高手！';
        if (n >= 20) return '心算很快！';
        if (n >= 10) return '不錯喔！';
        if (n >= 4) return '再接再厲！';
        return '小心借位！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 10, stageClass: 'change-stage', resume: false,
            head: function () { return '找錢'; },
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
        var W = stage.clientWidth || 472;
        var count = 0, q = null, typed = '', phase = 'ask';
        api.info = { get count() { return count; }, get q() { return q; }, get typed() { return typed; }, get phase() { return phase; } };
        S.score = 0; api.setInfo('答對 0 題');
        console.log('[找錢] 開始：價錢上限 ' + maxPriceFor(0) + ' → ' + maxPriceFor(RAMP_Q) + '；每題限時 ' + timeMs(0) + ' → ' + timeMs(RAMP_Q) + ' 毫秒');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var field = h('div', { 'class': 'change-field' });
        stage.appendChild(field);                       /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var bill = h('div', { 'class': 'change-bill' }); field.appendChild(bill);  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var lcd = h('div', { 'class': 'change-lcd' }), lcdLab = h('div', { 'class': 'change-lcd__lab', text: '要找' }), lcdNum = h('div', { 'class': 'change-lcd__num', text: '' }); lcd.appendChild(lcdLab); lcd.appendChild(lcdNum); field.appendChild(lcd);
        var info = h('div', { 'class': 'qz-note change-info', text: '' }); field.appendChild(info);
        var drawer = h('div', { 'class': 'change-drawer', text: '叮！' }); field.appendChild(drawer);
        var keys = [], items = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '⌫', '0', '✓'].map(function (k) {  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            return { text: k, kind: k === '✓' ? 'go' : (k === '⌫' ? 'sky' : 'line'), cls: 'change-key', onTap: function () { press(k); } };
        });
        var pad = kit.btnGrid(field, items, { cols: 3, h: 84, gap: 8, bottom: 8 });  /* kit.btnGrid：共用的按鈕列（一排大按鈕） */
        function paintLcd() { lcdNum.textContent = typed === '' ? '0' : typed; lcdNum.classList.toggle('change-lcd__num--empty', typed === ''); }  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
        paintLcd();

        /* 出一題 */
        function ask() {
            if (api.over) return;
            q = makeQuestion(count, api.rand); typed = ''; paintLcd(); phase = 'ask'; drawer.classList.remove('change-drawer--open');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            bill.innerHTML = '';                        /* innerHTML = ''：把元素裡面的東西全部清掉 */
            bill.appendChild(h('div', { 'class': 'change-bill__l', text: '客人買了 ' }));
            bill.lastChild.appendChild(h('span', { 'class': 'change-bill__n', text: String(q.price) })); bill.lastChild.appendChild(document.createTextNode(' 元'));
            var l2 = h('div', { 'class': 'change-bill__l', text: '給你 ' }); l2.appendChild(h('span', { 'class': 'change-bill__n change-bill__n--paid', text: String(q.paid) })); l2.appendChild(document.createTextNode(' 元')); bill.appendChild(l2);
            info.textContent = ''; api.stopTimer(); api.timer(timeMs(count), function () { fail(); });  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            if (count === 0 && kit.once('change.hint')) kit.hintOn(stage, pad.btns[items.map(function (it) { return it.text; }).indexOf(String(q.change).charAt(0))], { mode: 'tap', delay: 800, text: '輸入要找的錢' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
        }
        ask();
        /* 按鍵：數字＝加一位（位數滿了自動判定）；⌫＝刪掉最後一位；✓＝送出 */
        function press(k) {
            if (phase !== 'ask' || api.over) return;
            if (k === '⌫') { typed = typed.slice(0, -1); paintLcd(); return; }
            if (k === '✓') { if (typed !== '') judge(); return; }
            if (typed.length >= q.digits + 1) return;
            typed += k; paintLcd();
            if (typed.length >= q.digits) judge();
        }
        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge() {
            if (phase !== 'ask') return;
            phase = 'judge'; api.stopTimer();
            if (+typed === q.change && typed.charAt(0) !== '0') {
                count++; S.score = count; api.setInfo('答對 ' + count + ' 題'); Sfx.play('ok');  /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
                lcd.classList.add('change-lcd--ok'); drawer.classList.add('change-drawer--open');
                api.after(420, function () { lcd.classList.remove('change-lcd--ok'); ask(); });  /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
                return;
            }
            fail(typed);
        }
        /* 結束：直式減法、借位的欄位標紅；寫出你輸入的和正確的 */
        function fail(t) {
            if (api.over || phase === 'end') return;
            phase = 'end'; api.stopTimer();
            var why = whyText(q, t), v = vertical(q.paid, q.price);
            lcd.classList.add('change-lcd--bad'); info.textContent = t ? '找錯了！' : '時間到！'; info.classList.add('change-info--bad');          /* 完整的算式寫在下面的直式減法裡 */
            var box = h('div', { 'class': 'change-vert' });
            function row(chars, cls, sign) { var r = h('div', { 'class': 'change-vert__r ' + cls }); r.appendChild(h('span', { 'class': 'change-vert__s', text: sign || '' })); chars.forEach(function (c, i) { r.appendChild(h('span', { 'class': 'change-vert__c' + (v.borrow[i] && cls !== 'change-vert__r--res' ? ' change-vert__c--borrow' : ''), text: c === ' ' ? ' ' : c })); }); return r; }  /* forEach：對陣列的每個元素各做一次 */
            box.appendChild(row(v.top, 'change-vert__r--top')); box.appendChild(row(v.bot, 'change-vert__r--bot', MINUS)); box.appendChild(h('div', { 'class': 'change-vert__line' })); box.appendChild(row(v.res, 'change-vert__r--res'));
            box.appendChild(h('div', { 'class': 'change-vert__t', text: v.borrow.some(Boolean) ? '紅色的欄位要向左邊借位' : '這題不用借位' }));
            if (t) box.appendChild(h('div', { 'class': 'change-vert__t change-vert__t--you', text: '你輸入：' + t + '　正確：' + q.change }));
            field.appendChild(box); pad.el.style.display = 'none';                 /* 鍵盤收起來，騰出位置給直式減法 */
            kit.flash(stage, false, api.my);            /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            api.fail({ delay: 4200, lines: [why, '直式減法：' + q.paid + ' ' + MINUS + ' ' + q.price + ' ＝ ' + q.change + '（借位 ' + q.borrows + ' 次）' + (q.extra ? '；客人多給了 ' + q.extra + ' 元零錢（' + q.base + ' ＋ ' + q.extra + '）' : '')] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 驗證用：把正確答案一個數字一個數字按進去（最多 SOLVE_CAP 題）／按一個錯的；可重複呼叫 */
        api.solve = function () { if (phase !== 'ask' || count >= SOLVE_CAP) return; String(q.change).split('').forEach(function (d) { press(d); }); };  /* forEach：對陣列的每個元素各做一次 */
        api.wrong = function () { if (phase !== 'ask') return; var w = String(q.change + 1).split(''); w.forEach(function (d) { press(d); }); if (phase === 'ask') press('✓'); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '找錢',
        rule: '收銀台前，客人買了 386 元，給你 1000 元，**用數字鍵輸入要找多少錢**（614）。輸入的位數夠了就自動判定，也可以按 ⌫ 刪掉、按 ✓ 提早送出。**借位最容易錯**（1000 − 386 常常算成 714 或 624）。有時客人會**多給零錢**（給你 1011 元，要找 625）。越後面金額越大、每題限時越短（8 → 4 秒）。找錯或超過時間就結束，看你能連續答對幾題。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            maxPriceFor: maxPriceFor, minPriceFor: minPriceFor, timeMs: timeMs, borrowMinFor: borrowMinFor, pExtraFor: pExtraFor, borrowCols: borrowCols, countBorrows: countBorrows, vertical: vertical, makeQuestion: makeQuestion, whyText: whyText, rating: rating,
            RAMP_Q: RAMP_Q, MAX_PRICE: MAX_PRICE, TIME_S: TIME_S, BORROW_MIN: BORROW_MIN, P_EXTRA: P_EXTRA, EXTRA_FROM: EXTRA_FROM, NOTES: NOTES, SOLVE_CAP: SOLVE_CAP, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
