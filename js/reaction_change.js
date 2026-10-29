/* ═══════════════════════════════════════════════════════════════════
   reaction_change.js — 秒反應・找錢（企劃 400）
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
    'use strict';

    var ID = 'change';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '連續答對', min: 1, max: 300 };
    var h = UI.h, kit = Reaction.kit;

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
    var MAX_LEVEL = 90;
    var MINUS = '−';

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function prog(n) { return Math.min(1, Math.max(0, n / RAMP_Q)); }
    function lerp(pair, n) { return pair[0] + (pair[1] - pair[0]) * prog(n); }
    function maxPriceFor(n) { return Math.round(lerp(MAX_PRICE, n)); }
    function minPriceFor(n) { return Math.max(15, Math.round(maxPriceFor(n) * MIN_FRAC)); }
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
        rand = rand || Math.random;
        var hi = maxPriceFor(n), lo = minPriceFor(n), need = borrowMinFor(n), best = null;
        for (var tr = 0; tr < 400; tr++) {
            var price = kit.randInt(lo, hi, rand), cands = NOTES.filter(function (v) { return v >= price + 10; }).slice(0, n < 20 ? 2 : 3);
            if (!cands.length) continue;
            var base = kit.pick(cands, rand), extra = 0;
            if (rand() < pExtraFor(n)) { extra = kit.randInt(1, 49, rand); while ((base + extra - price) % 5 !== 0) extra++; }
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
    function rating(n) {
        if (n >= 30) return '收銀台高手！';
        if (n >= 20) return '心算很快！';
        if (n >= 10) return '不錯喔！';
        if (n >= 4) return '再接再厲！';
        return '小心借位！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 10, stageClass: 'chg-stage', resume: false,
            head: function () { return '找錢'; },
            info: function (S) { return '答對 ' + S.score + ' 題'; },
            scoreOf: function (S) { return S.score; },
            numText: function (v) { return v + ' 題'; },
            rating: rating,
            lines: function (S) { return ['連續答對 ' + S.score + ' 題']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, S = api.S;
        var W = stage.clientWidth || 472;
        var count = 0, q = null, typed = '', phase = 'ask';
        api.info = { get count() { return count; }, get q() { return q; }, get typed() { return typed; }, get phase() { return phase; } };
        S.score = 0; api.setInfo('答對 0 題');
        console.log('[找錢] 開始：價錢上限 ' + maxPriceFor(0) + ' → ' + maxPriceFor(RAMP_Q) + '；每題限時 ' + timeMs(0) + ' → ' + timeMs(RAMP_Q) + ' 毫秒');

        var field = h('div', { 'class': 'chg-field' });
        stage.appendChild(field);
        var bill = h('div', { 'class': 'chg-bill' }); field.appendChild(bill);
        var lcd = h('div', { 'class': 'chg-lcd' }), lcdLab = h('div', { 'class': 'chg-lcd__lab', text: '要找' }), lcdNum = h('div', { 'class': 'chg-lcd__num', text: '' }); lcd.appendChild(lcdLab); lcd.appendChild(lcdNum); field.appendChild(lcd);
        var info = h('div', { 'class': 'qz-note chg-info', text: '' }); field.appendChild(info);
        var drawer = h('div', { 'class': 'chg-drawer', text: '叮！' }); field.appendChild(drawer);
        var keys = [], items = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '⌫', '0', '✓'].map(function (k) {
            return { text: k, kind: k === '✓' ? 'go' : (k === '⌫' ? 'sky' : 'line'), cls: 'chg-key', onTap: function () { press(k); } };
        });
        var pad = kit.btnGrid(field, items, { cols: 3, h: 84, gap: 8, bottom: 8 });
        function paintLcd() { lcdNum.textContent = typed === '' ? '0' : typed; lcdNum.classList.toggle('chg-lcd__num--empty', typed === ''); }
        paintLcd();

        /* 出一題 */
        function ask() {
            if (api.over) return;
            q = makeQuestion(count, api.rand); typed = ''; paintLcd(); phase = 'ask'; drawer.classList.remove('chg-drawer--open');
            bill.innerHTML = '';
            bill.appendChild(h('div', { 'class': 'chg-bill__l', text: '客人買了 ' }));
            bill.lastChild.appendChild(h('span', { 'class': 'chg-bill__n', text: String(q.price) })); bill.lastChild.appendChild(document.createTextNode(' 元'));
            var l2 = h('div', { 'class': 'chg-bill__l', text: '給你 ' }); l2.appendChild(h('span', { 'class': 'chg-bill__n chg-bill__n--paid', text: String(q.paid) })); l2.appendChild(document.createTextNode(' 元')); bill.appendChild(l2);
            info.textContent = ''; api.stopTimer(); api.timer(timeMs(count), function () { fail(); });
            if (count === 0 && kit.once('change.hint')) kit.hintOn(stage, pad.btns[items.map(function (it) { return it.text; }).indexOf(String(q.change).charAt(0))], { mode: 'tap', delay: 800, text: '輸入要找的錢' });
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
        function judge() {
            if (phase !== 'ask') return;
            phase = 'judge'; api.stopTimer();
            if (+typed === q.change && typed.charAt(0) !== '0') {
                count++; S.score = count; api.setInfo('答對 ' + count + ' 題'); Sfx.play('ok');
                lcd.classList.add('chg-lcd--ok'); drawer.classList.add('chg-drawer--open');
                api.after(420, function () { lcd.classList.remove('chg-lcd--ok'); ask(); });
                return;
            }
            fail(typed);
        }
        /* 結束：直式減法、借位的欄位標紅；寫出你輸入的和正確的 */
        function fail(t) {
            if (api.over || phase === 'end') return;
            phase = 'end'; api.stopTimer();
            var why = whyText(q, t), v = vertical(q.paid, q.price);
            lcd.classList.add('chg-lcd--bad'); info.textContent = t ? '找錯了！' : '時間到！'; info.classList.add('chg-info--bad');          /* 完整的算式寫在下面的直式減法裡 */
            var box = h('div', { 'class': 'chg-vert' });
            function row(chars, cls, sign) { var r = h('div', { 'class': 'chg-vert__r ' + cls }); r.appendChild(h('span', { 'class': 'chg-vert__s', text: sign || '' })); chars.forEach(function (c, i) { r.appendChild(h('span', { 'class': 'chg-vert__c' + (v.borrow[i] && cls !== 'chg-vert__r--res' ? ' chg-vert__c--borrow' : ''), text: c === ' ' ? ' ' : c })); }); return r; }
            box.appendChild(row(v.top, 'chg-vert__r--top')); box.appendChild(row(v.bot, 'chg-vert__r--bot', MINUS)); box.appendChild(h('div', { 'class': 'chg-vert__line' })); box.appendChild(row(v.res, 'chg-vert__r--res'));
            box.appendChild(h('div', { 'class': 'chg-vert__t', text: v.borrow.some(Boolean) ? '紅色的欄位要向左邊借位' : '這題不用借位' }));
            if (t) box.appendChild(h('div', { 'class': 'chg-vert__t chg-vert__t--you', text: '你輸入：' + t + '　正確：' + q.change }));
            field.appendChild(box); pad.el.style.display = 'none';                 /* 鍵盤收起來，騰出位置給直式減法 */
            kit.flash(stage, false, api.my);
            api.fail({ delay: 4200, lines: [why, '直式減法：' + q.paid + ' ' + MINUS + ' ' + q.price + ' ＝ ' + q.change + '（借位 ' + q.borrows + ' 次）' + (q.extra ? '；客人多給了 ' + q.extra + ' 元零錢（' + q.base + ' ＋ ' + q.extra + '）' : '')] });
        }
        /* 驗證用：把正確答案一個數字一個數字按進去（最多 SOLVE_CAP 題）／按一個錯的；可重複呼叫 */
        api.solve = function () { if (phase !== 'ask' || count >= SOLVE_CAP) return; String(q.change).split('').forEach(function (d) { press(d); }); };
        api.wrong = function () { if (phase !== 'ask') return; var w = String(q.change + 1).split(''); w.forEach(function (d) { press(d); }); if (phase === 'ask') press('✓'); };
    }

    var G = {
        id: ID,
        name: '找錢',
        rule: '收銀台前，客人買了 386 元，給你 1000 元，**用數字鍵輸入要找多少錢**（614）。輸入的位數夠了就自動判定，也可以按 ⌫ 刪掉、按 ✓ 提早送出。**借位最容易錯**（1000 − 386 常常算成 714 或 624）。有時客人會**多給零錢**（給你 1011 元，要找 625）。越後面金額越大、每題限時越短（8 → 4 秒）。找錯或超過時間就結束，看你能連續答對幾題。',
        mount: mount,
        score: SCORE,
        test: {
            maxPriceFor: maxPriceFor, minPriceFor: minPriceFor, timeMs: timeMs, borrowMinFor: borrowMinFor, pExtraFor: pExtraFor, borrowCols: borrowCols, countBorrows: countBorrows, vertical: vertical, makeQuestion: makeQuestion, whyText: whyText, rating: rating,
            RAMP_Q: RAMP_Q, MAX_PRICE: MAX_PRICE, TIME_S: TIME_S, BORROW_MIN: BORROW_MIN, P_EXTRA: P_EXTRA, EXTRA_FROM: EXTRA_FROM, NOTES: NOTES, SOLVE_CAP: SOLVE_CAP, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
