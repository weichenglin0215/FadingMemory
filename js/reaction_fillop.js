/* ═══════════════════════════════════════════════════════════════════
   reaction_fillop.js — 秒反應・挑加減乘除（企劃 131「補一對括號」的改版）
   樣式：css/games/reaction_fillop.css（這款專屬的 class 一律以「fillop-」開頭；共用元件在 css/reaction_common.css）
   一道橫式的算式，其中一個（或好幾個）加減乘除符號不見了，換成直排的四顆按鈕（＋ − × ÷），
   請選出正確的符號，讓等號成立。例如  8 [？] 2 ＋ 2 × 3 ＝ 18  →  選「÷」。
   關卡制：選錯或來不及就結束，成績＝連續過幾關。
   ───────────────────────────────────────────────────────────────────
   · 出題（規範 Q1、Q2：先決定結果、再驗證唯一解）：先隨機排出數字與「真正的符號」，照數學規則（先乘除、後加減）
     算出等號右邊的數字；再挑幾個符號藏起來，然後把「所有可能的填法」（4 的 b 次方種，最多 256 種）一個一個代進去算，
     只有「剛好一種填法」讓等式成立才出這一題，所以答案唯一，不靠運氣。（算式用「分數」精確計算，不會有小數誤差。）
   · 空格只有 1 個時：點哪顆符號就直接判定。有 2 個以上時：每個空格各選一顆，全部選好之後，畫面會立刻告訴你
     「目前算出來是多少」，確認之後按「確定」才判定（可以改選）。
   · 難度線性（RAMP_LEVELS 關走到頂）：數字 3 → 5 個、空格 1 → 4 個（最多是符號數）；限時＝(基本秒數＋每個空格秒數×空格數)×倍率。
   · 答錯／逾時：把正確的算式完整寫出來。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡，裡面的變數都是這個檔案私有的。
       分三段：① 參數區（難度、秒數在這）；② 純函式（用「分數」精確算式子、數有幾種填法、出題，單元測試直接測）；③ 畫面（mount／setup）。
       為什麼用分數：除法會除不盡（例如 7 ÷ 2），用小數會有誤差；這個檔案把數字都存成「分子／分母」（{n, d}），算出來才準確。 */
    'use strict';

    var ID = 'fillop';                                  /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴（fillop-）都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var NUMS = [3, 5];                          /* 算式裡有幾個數字：第 1 關 → 到頂 */
    var BLANKS = [1, 4];                        /* 有幾個符號被藏起來：第 1 關 → 到頂（不會超過「符號數」） */
    var BIG_NUM_LEVELS = 10;                    /* 前幾關（而且空格少時）數字可以到 12，之後一律 1～9（版面放得下） */
    var TIME_BASE = 20, TIME_PER_BLANK = 3;      /* 限時（秒）＝ (TIME_BASE ＋ TIME_PER_BLANK × 空格數) × 倍率 */
    var TIME_MUL = [1.0, 3.0];                  /* 倍率：第 1 關 → 到頂 */
    var TARGET_MAX = 200;                       /* 等號右邊最大是多少 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var OPS = ['+', '-', '*', '/'];                 /* 四則運算符號（程式內部用）：加、減、乘、除 */
    var OP_TEXT = { '+': '+', '-': '−', '*': '×', '/': '÷' };  /* 畫面上顯示的符號（減、乘、除用數學符號 − × ÷） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 這一關算式裡有幾個數字：從 NUMS 的第一個數字線性變到第二個，並限制在範圍內（kit.clamp） */
    function numsFor(level) { return kit.clamp(Math.round(kit.ramp(level, NUMS[0], NUMS[1], RAMP_LEVELS)), NUMS[0], NUMS[1]); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    /* 這一關有幾個符號被藏起來：從 BLANKS 線性增加，但不能超過「符號數」（數字數 − 1） */
    function blanksFor(level) { return kit.clamp(Math.round(kit.ramp(level, BLANKS[0], BLANKS[1], RAMP_LEVELS)), BLANKS[0], numsFor(level) - 1); }  /* kit.clamp(值, 最小, 最大)：把數值限制在範圍內（太小就取最小、太大就取最大） */
    /* 這一關的作答限時（毫秒）＝（基本秒數 ＋ 每個空格的秒數 × 空格數）× 倍率 × 1000 */
    function ansMs(level) { return Math.round((TIME_BASE + TIME_PER_BLANK * blanksFor(level)) * kit.ramp(level, TIME_MUL[0], TIME_MUL[1], RAMP_LEVELS) * 1000); }  /* Math.round：四捨五入成整數 */
    /* 最大公因數（輾轉相除法）：用來把分數約到最簡 */
    function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a; }  /* Math.abs：取絕對值（去掉負號） */
    /* 分數 {n,d}（d>0）：加減乘除，除以 0 回傳 null */
    /* 建立最簡分數 { n 分子, d 分母 }：分母一定是正的（負號放分子），再除以最大公因數 */
    function rat(n, d) { if (d < 0) { n = -n; d = -d; } var g = gcd(n, d) || 1; return { n: n / g, d: d / g }; }
    /* 對兩個分數做一次運算（+ − × ÷）：通分相加減、直接相乘、除法＝乘倒數；除以 0 回傳 null */
    function rop(op, a, b) {
        if (a == null || b == null) return null;
        if (op === '+') return rat(a.n * b.d + b.n * a.d, a.d * b.d);
        if (op === '-') return rat(a.n * b.d - b.n * a.d, a.d * b.d);
        if (op === '*') return rat(a.n * b.n, a.d * b.d);
        if (b.n === 0) return null;
        return rat(a.n * b.d, a.d * b.n);
    }
    /* 算式 nums（整數陣列）＋ ops（符號陣列，長度比 nums 少 1）→ 結果（分數），照數學規則：先乘除、後加減；除以 0 回傳 null。
       exact 為 true 時，只要有一個除法「除不盡」也回傳 null（出題時要求真正的算式每一步都是整數） */
    /* 算式 nums（整數）與符號 ops（比數字少一個）算出結果（分數）。照數學規則：先乘除、後加減；除以 0 回傳 null。
       exact 為 true 時，只要有任何一個除法「除不盡」也回傳 null（出題時要求真正的算式每一步都是整數）。 */
    function evalOps(nums, ops, exact) {
        var vals = nums.map(function (x) { return rat(x, 1); }), os = ops.slice(), i;  /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
        for (i = 0; i < os.length;) {
            if (os[i] === '*' || os[i] === '/') {
                var r = rop(os[i], vals[i], vals[i + 1]);
                if (r == null || (exact && r.d !== 1)) return null;
                vals.splice(i, 2, r); os.splice(i, 1);
            } else i++;
        }
        var acc = vals[0];
        for (i = 0; i < os.length; i++) acc = rop(os[i], acc, vals[i + 1]);
        return acc;
    }
    /* 這個分數剛好等於整數 v 嗎（分母要是 1、分子要是 v） */
    function ratEqInt(r, v) { return r != null && r.d === 1 && r.n === v; }
    /* 數一數：把 blanks（要藏起來的符號位置）的所有填法都代進去，有幾種讓結果等於 target？（出題要求剛好 1 種） */
    /* 數一數：把被藏起來的位置（blanks）所有可能的填法（每格 4 種符號）都代進去，有幾種讓結果等於 target？
       出題要求剛好 1 種——這樣玩家才有唯一的答案可推理。rec 是遞迴：每層決定一個空格填哪個符號。 */
    function countSolutions(nums, ops, blanks, target) {
        var total = 0, combo = [];
        function rec(k) {
            if (k === blanks.length) {
                var os = ops.slice();                   /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
                blanks.forEach(function (bi, j) { os[bi] = combo[j]; });  /* forEach：對陣列的每個元素各做一次 */
                if (ratEqInt(evalOps(nums, os), target)) total++;
                return;
            }
            for (var i = 0; i < OPS.length; i++) { combo[k] = OPS[i]; rec(k + 1); }
        }
        rec(0);
        return total;
    }
    /* 出一題：{ nums, ops（真正的符號）, blanks（被藏起來的符號位置，由小到大）, target, text（完整算式） } */
    /* 出一題：隨機抽數字和符號，要求算出來是 1～TARGET_MAX 的整數、每一步除法都除得盡；再隨機挑幾個符號藏起來，
       用 countSolutions 確認「只有一種填法」才收。試 800 次不行就用一題固定的保底題。 */
    function makeQuestion(level, rand) {
        rand = rand || Math.random;
        var n = numsFor(level), b = blanksFor(level);
        var numMax = (level <= BIG_NUM_LEVELS && b <= 2 && n <= 4) ? 12 : 9;
        for (var tr = 0; tr < 800; tr++) {
            var nums = [], ops = [], i;
            for (i = 0; i < n; i++) nums.push(kit.randInt(1, numMax, rand));  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
            for (i = 0; i < n - 1; i++) ops.push(kit.pick(OPS, rand));  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
            var t = evalOps(nums, ops, true);
            if (t == null || t.d !== 1 || t.n < 1 || t.n > TARGET_MAX) continue;
            var idx = []; for (i = 0; i < n - 1; i++) idx.push(i);
            var blanks = kit.sample(idx, b, rand).sort(function (x, y) { return x - y; });  /* kit.sample(陣列, n, rand)：從陣列隨機取 n 個不重複的元素 */
            if (countSolutions(nums, ops, blanks, t.n) !== 1) continue;
            return { nums: nums, ops: ops, blanks: blanks, target: t.n, text: toText(nums, ops, t.n) };
        }
        var fb = { nums: [8, 2, 2, 3], ops: ['/', '+', '*'], blanks: [0], target: 10 };
        fb.target = evalOps(fb.nums, fb.ops).n; fb.text = toText(fb.nums, fb.ops, fb.target);
        return fb;
    }
    /* 把算式組成文字，例如「8 ÷ 2 ＋ 2 × 3 ＝ 10」（符號換成畫面用的數學符號） */
    function toText(nums, ops, target) {
        var s = '';
        nums.forEach(function (x, i) { s += (i ? ' ' + OP_TEXT[ops[i - 1]] + ' ' : '') + x; });  /* forEach：對陣列的每個元素各做一次 */
        return s + ' ＝ ' + target;
    }
    /* 玩家的填法 → 算出來是多少？（分數轉成字串；除不盡就寫 ≈ 小數 4 位；除以 0 寫「不能算」） */
    /* 玩家的填法算出來是多少：整數直接寫；除不盡寫「≈ 小數 4 位」；除以 0 寫「不能算」 */
    function valueText(r) {
        if (r == null) return '不能算';
        if (r.d === 1) return String(r.n);
        return '≈ ' + (r.n / r.d).toFixed(4);
    }
    /* 結算畫面的評語（依通過關數） */
    function rating(n) {
        if (n >= 40) return '符號魔術師！';
        if (n >= 25) return '算式高手！';
        if (n >= 12) return '不錯喔！';
        if (n >= 5) return '再接再厲！';
        return '先熟悉一下，再來一次！';
    }

    /* 遊戲進場：交給共用骨架 kit.run 處理闖關流程（第幾關、過關、失敗、結算、最佳紀錄） */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 8,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 每一關開始時呼叫：出題、畫出算式與按鈕。api 是共用骨架給的工具（api.stage 畫面容器、api.timer 倒數、api.pass／api.fail 過關／失敗…） */
    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeQuestion(level, api.rand);
        api.info = q;
        console.log('[挑加減乘除] 第 ' + level + ' 關：' + q.text + '，藏起來的符號位置 ' + q.blanks.join(',') + '，限時 ' + ansMs(level) + ' ms');

        var row = h('div', { 'class': 'fillop-row' });
        var chosen = q.blanks.map(function () { return null; });        /* 每個空格目前選了哪個符號（null＝還沒選） */  /* chosen：每個空格目前選了哪個符號（null＝還沒選） */
        var cols = [];                                                  /* 每個空格的四顆按鈕 */  /* cols：每個空格的四顆符號按鈕（之後揭曉時要依序標出對錯） */
        q.nums.forEach(function (x, i) {
            if (i > 0) {
                var bi = q.blanks.indexOf(i - 1);       /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
                if (bi < 0) row.appendChild(h('div', { 'class': 'fillop-fixed', text: OP_TEXT[q.ops[i - 1]] }));  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
                else {
                    var col = h('div', { 'class': 'fillop-col' });
                    var bs = OPS.map(function (op) {    /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
                        var b = h('button', { 'class': 'fillop-op', text: OP_TEXT[op] });
                        kit.onTap(b, function () { choose(bi, op); });  /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
                        col.appendChild(b);             /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
                        return b;
                    });
                    cols.push(bs);
                    row.appendChild(col);
                }
            }
            row.appendChild(h('div', { 'class': 'fillop-num', text: String(x) }));
        });
        var eqLine = h('div', { 'class': 'qz-big fillop-target', text: '＝ ' + q.target });
        var live = h('div', { 'class': 'qz-note fillop-live', text: q.blanks.length > 1 ? '每個空格選一個符號' : '選出正確的符號' });
        stage.appendChild(row); stage.appendChild(eqLine); stage.appendChild(live);
        var okBtn = null;
        if (q.blanks.length > 1) {
            var grid = kit.btnGrid(stage, [{ text: '確定', kind: 'go', cls: 'fillop-ok fillop-ok--off', onTap: function () { if (allChosen()) judge(); } }], { h: 84 });  /* kit.btnGrid：共用的按鈕列（一排大按鈕） */
            okBtn = grid.btns[0];
        }
        api.timer(ansMs(level), function () { judge(); });  /* 開始倒數：時間到就直接判定（沒選好就算錯）；上方的時間條由共用骨架畫 */
        if (level === 1 && kit.once('fillop.hint')) {   /* kit.once(key)：同一個頁面只有第一次回傳 true（用來讓提示只出現一次） */
            var hint = kit.hintOn(stage, cols[0][OPS.indexOf(q.ops[q.blanks[0]])], { mode: 'tap', delay: 500, text: '請點擊正確的符號' });  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
            if (hint.label) { hint.label.style.top = '4px'; }                  /* 提示文字放在最上面，才不會蓋住算式裡的數字 */
        }

        /* 所有空格都選了符號嗎 */
        function allChosen() { return chosen.every(function (c) { return c != null; }); }  /* every：陣列裡「每一個」元素都符合條件才回傳 true */
        /* 把玩家目前選的符號填進真正的符號陣列（沒被藏起來的符號維持原樣），拿去算結果 */
        function currentOps() {
            var os = q.ops.slice();
            q.blanks.forEach(function (bi, j) { if (chosen[j] != null) os[bi] = chosen[j]; });
            return os;
        }
        /* 玩家點某個空格的某個符號：記下並標亮；只有一個空格就直接判定，多個空格要等全部選好再按「確定」；全選好時順便顯示「現在算出來是多少」 */
        function choose(j, op) {
            if (api.over) return;
            Sfx.play('click');                          /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            chosen[j] = op;
            cols[j].forEach(function (b, k) { b.classList.toggle('fillop-op--on', OPS[k] === op); });  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            if (q.blanks.length === 1) { judge(); return; }
            if (allChosen()) {
                live.textContent = '現在算出來是 ' + valueText(evalOps(q.nums, currentOps())) + '（目標 ' + q.target + '）';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
                okBtn.classList.remove('fillop-ok--off');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            } else live.textContent = '每個空格選一個符號';      /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
        }
        /* 判定：結果等於目標才算對。揭曉時把正確的符號標綠、玩家選錯的標紅，並寫出完整的正確算式；對就過關、錯就失敗 */
        function judge() {
            if (api.over) return;
            var ok = allChosen() && ratEqInt(evalOps(q.nums, currentOps()), q.target);
            /* 揭曉：把正確的符號填回空格 */
            q.blanks.forEach(function (bi, j) {
                cols[j].forEach(function (b, k) {
                    b.classList.remove('fillop-op--on');
                    if (OPS[k] === q.ops[bi]) b.classList.add('fillop-op--right');
                    else if (chosen[j] === OPS[k]) b.classList.add('fillop-op--wrong');
                });
            });
            live.textContent = '正確的算式：' + q.text;
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 1100 }); return; }  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            kit.flash(stage, false, api.my);            /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            api.fail({                                  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
                delay: 2400, lines: [
                    allChosen() ? '你的填法算出 ' + valueText(evalOps(q.nums, currentOps())) + '，目標是 ' + q.target : (chosen.some(function (c) { return c != null; }) ? '時間到，還有空格沒選！' : '時間到！'),  /* some：陣列裡「只要有一個」元素符合條件就回傳 true */
                    '正確的算式：' + q.text
                ]
            });
        }
        /* 給測試／debug 用：api.solve 全部選對並判定、api.wrong 故意把第一個空格選錯並判定 */
        api.solve = function () { q.blanks.forEach(function (bi, j) { chosen[j] = q.ops[bi]; }); judge(); };
        api.wrong = function () {
            var j = 0, bad = OPS.filter(function (o) { return o !== q.ops[q.blanks[0]]; })[0];  /* filter：留下符合條件的元素，回傳新陣列 */
            q.blanks.forEach(function (bi, k) { chosen[k] = q.ops[bi]; });
            chosen[j] = bad;
            judge();
        };
    }

    /* 遊戲登記資料：id、名稱、規則文字（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式 */
    var G = {
        id: ID,
        name: '挑加減乘除',
        rule: '算式裡有加減乘除符號不見了，換成直排的四顆按鈕（＋ − × ÷）。**請選出正確的符號，讓等號成立**。**只有一種填法是對的**。空格有好幾個時，每個空格各選一個，確認算出來的數字再按「確定」。選錯或來不及就結束，看你能過幾關。',
        mount: mount,
        score: SCORE,
        test: {
            numsFor: numsFor, blanksFor: blanksFor, ansMs: ansMs, rat: rat, rop: rop, evalOps: evalOps, ratEqInt: ratEqInt, countSolutions: countSolutions,
            makeQuestion: makeQuestion, toText: toText, valueText: valueText, rating: rating, OPS: OPS,
            RAMP_LEVELS: RAMP_LEVELS, NUMS: NUMS, BLANKS: BLANKS, TARGET_MAX: TARGET_MAX, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
