/* ═══════════════════════════════════════════════════════════════════
   reaction_nim.js — 秒反應・取火柴（深思篇 474「取火柴」Nim；復活 #137「搶二十一」）
   樣式：css/games/reaction_nim.css（class 一律以「nim-」開頭）
   ───────────────────────────────────────────────────────────────────
   · 玩法：桌上有幾堆火柴（一排一堆）。你和電腦輪流，每回合**只能從同一堆拿走任意根（至少 1 根）**，**拿走最後一根的人贏**
     （後面幾關改成拿最後一根的人輸）。你先手。點一根火柴＝選取它和它右邊所有的火柴，再按「拿走」。
   · **每一關的開局都是「先手必勝」**，電腦每一步都走得很準；只要你走錯一步（讓電腦有辦法一路保持必勝），這一關就結束，並告訴你錯在哪。
     電腦只會在「自己已經輸定了」的局面下亂走，所以只要你每一步都走對，一定贏。
   · 關卡：第 1～4 關 單堆、一次最多拿 3 根（搶 21）→ 第 5～10 關 兩堆 → 第 11～20 關 三堆（經典 3-5-7 那一類）→
     第 21～25 關 四堆 → 第 26～30 關 四堆而且「拿最後一根的人輸」。堆數與根數線性增加。
   · 頓悟：Nim 和——把各堆根數寫成二進位，「每一位數的 1 的個數都是偶數」的局面（XOR＝0）對下一個拿的人是輸的。
     每一步把局面拿成這樣就贏。失敗時畫面上會列出每一堆的二進位和 XOR。
   · 實作：不寫死公式，而是對「局面」做記憶化的完整搜尋（isWinning）：單堆限拿、普通規則、拿最後一根輸的規則都用同一個函式判斷。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡，裡面的變數都是這個檔案私有的。
       分三段：① 參數區（難度、秒數都在這）；② 純函式（判斷誰會贏、電腦怎麼拿，單元測試直接測）；③ 畫面（mount／setup）。
       取火柴（Nim）的核心：把每堆根數寫成二進位，全部「互斥或」（XOR）起來；結果是 0 的局面，輪到的人輸定了（對方每次都能把它拉回 0）。
       這個檔案不直接靠公式，而是用「完整搜尋」（isWinning）判斷，所以連「限拿 3 根」「拿最後一根輸」這些變體也算得出來。 */
    'use strict';

    var ID = 'nim';                                     /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴（nim-）都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var STAGES = [                              /* to＝這個階段的最後一關；piles＝幾堆；maxTake＝一次最多拿幾根（0＝不限）；misere＝拿最後一根的人輸；size＝每堆最多幾根：階段第 1 關 → 最後一關 */
        { to: 4, piles: 1, maxTake: 3, misere: false, size: [9, 21] },
        { to: 10, piles: 2, maxTake: 0, misere: false, size: [3, 8] },
        { to: 20, piles: 3, maxTake: 0, misere: false, size: [3, 7] },
        { to: 25, piles: 4, maxTake: 0, misere: false, size: [3, 8] },
        { to: 30, piles: 4, maxTake: 0, misere: true, size: [3, 8] }
    ];
    var COMPUTER_THINK_MS = 800;                /* 電腦「思考」多久才出手 */
    var COMPUTER_SHOW_MS = 700;                 /* 電腦選好要拿的火柴之後，停多久才真的拿走 */
    var PASS_DELAY_MS = 1400;                       /* 答對（過關）後停多久才換下一關（毫秒，1400 毫秒＝1.4 秒） */
    var FAIL_HOLD_MS = 6000;                    /* 失敗時顯示 XOR 說明的時間 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var MATCH_MAX_W = 26;                       /* 火柴棒最寬幾 px */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 這一關屬於哪個階段：回傳 { st 階段設定, idx 在階段裡是第幾關, len 階段共幾關 }（每堆最多幾根從階段第 1 關線性變到最後一關） */
    function stageOf(level) {
        level = Math.max(1, level);
        var from = 1;
        for (var i = 0; i < STAGES.length; i++) {
            if (level <= STAGES[i].to || i === STAGES.length - 1) return { st: STAGES[i], idx: Math.min(level, STAGES[i].to) - from + 1, len: STAGES[i].to - from + 1 };
            from = STAGES[i].to + 1;
        }
    }
    /* 局面（各堆根數）的記憶化搜尋：輪到的人是否「有辦法贏」？
       普通規則：沒有火柴可拿＝輪到的人輸（上一個人拿走最後一根）；拿最後一根輸的規則：沒有火柴可拿＝輪到的人贏。 */
    var memo = {};                                      /* 記憶表：算過的局面把答案存起來，下次直接取（同樣的局面只算一次，不然搜尋會太慢） */
    /* 把局面變成字串當記憶表的 key：只看「每堆根數」（排序後，堆的順序不影響勝負）、一次最多拿幾根、是不是「拿最後一根輸」 */
    function key(piles, maxTake, misere) { return (misere ? 'm' : 'n') + maxTake + ':' + piles.filter(function (p) { return p > 0; }).sort(function (a, b) { return a - b; }).join(','); }  /* filter：留下符合條件的元素，回傳新陣列 */
    /* 這個局面「輪到的人有辦法贏嗎」？遞迴（函式自己呼叫自己）：試每一種拿法，
       只要有一種拿法讓對方「沒辦法贏」，我就有辦法贏（res = true）。沒火柴可拿時：普通規則＝輪到的人輸；拿最後一根輸的規則＝輪到的人贏。 */
    function isWinning(piles, maxTake, misere) {
        var k = key(piles, maxTake, misere);
        if (k in memo) return memo[k];
        var total = 0; piles.forEach(function (p) { total += p; });  /* forEach：對陣列的每個元素各做一次 */
        if (total === 0) return (memo[k] = !!misere);
        var res = false;
        for (var i = 0; i < piles.length && !res; i++) {
            var lim = maxTake ? Math.min(piles[i], maxTake) : piles[i];
            for (var t = 1; t <= lim; t++) {
                var next = piles.slice(); next[i] -= t; /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
                if (!isWinning(next, maxTake, misere)) { res = true; break; }
            }
        }
        return (memo[k] = res);
    }
    /* 所有走法 [{ pile, take }]；winningMoves：走完之後對方（下一個輪到的人）輸定了的走法 */
    /* 列出所有合法拿法：[{ pile 第幾堆, take 拿幾根 }]。maxTake 不是 0 就限制一次最多拿 maxTake 根 */
    function movesOf(piles, maxTake) {
        var out = [];
        piles.forEach(function (p, i) { var lim = maxTake ? Math.min(p, maxTake) : p; for (var t = 1; t <= lim; t++) out.push({ pile: i, take: t }); });
        return out;
    }
    /* 照拿法 mv 拿走火柴，回傳「拿完後的各堆根數」（先複製陣列，不改到原本的） */
    function applyMove(piles, mv) { var n = piles.slice(); n[mv.pile] -= mv.take; return n; }
    /* 必勝走法：走完之後，對方（下一個輪到的人）已經輸定了的那些拿法 */
    function winningMoves(piles, maxTake, misere) { return movesOf(piles, maxTake).filter(function (mv) { return !isWinning(applyMove(piles, mv), maxTake, misere); }); }
    /* 把各堆根數用 XOR（^，互斥或）合起來；XOR 為 0 的局面，輪到的人輸定了（失敗說明畫面用它） */
    function xorOf(piles) { var x = 0; piles.forEach(function (p) { x ^= p; }); return x; }
    /* 把數字寫成二進位字串，前面補 0 補到 w 位（說明畫面對齊用） */
    function toBin(n, w) { var s = n.toString(2); while (s.length < w) s = '0' + s; return s; }
    function total(piles) { return piles.reduce(function (a, b) { return a + b; }, 0); }  /* reduce：把陣列的元素一個一個累積成一個值（例如加總） */

    /* 出一關：{ piles, maxTake, misere, level }——一定是「輪到你而且你有必勝走法」的局面 */
    /* 出一關：回傳 { piles 各堆根數, maxTake, misere, level }——一定是「輪到你而且你有必勝走法」的局面。
       隨機抽各堆根數，用 isWinning 檢查；不合（全部一樣大、總數太少、輸定了）就重抽，最多 500 次，再不行用保底題。 */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;
        var s = stageOf(level), st = s.st, hi = Math.round(kit.ramp(s.idx, st.size[0], st.size[1], Math.max(2, s.len)));  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
        for (var tr = 0; tr < 500; tr++) {
            var piles = [], i;
            if (st.piles === 1) piles.push(kit.randInt(Math.max(5, hi - 3), hi, rand));  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
            else for (i = 0; i < st.piles; i++) piles.push(kit.randInt(1, hi, rand));
            if (total(piles) < 4) continue;
            if (st.piles > 1 && piles.every(function (p) { return p === piles[0]; })) continue;     /* 全部一樣大太好猜 */
            if (isWinning(piles, st.maxTake, st.misere)) return { piles: piles, maxTake: st.maxTake, misere: st.misere, level: level };
        }
        return { piles: st.piles === 1 ? [hi - (hi % 4 === 0 ? 1 : 0)] : [1, 2, 3, 4].slice(0, st.piles).map(function (x) { return Math.min(x + 1, hi); }), maxTake: st.maxTake, misere: st.misere, level: level };  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
    }
    /* 電腦出手：贏得了就走必勝的那一步；輸定了就隨機走（不挑最大或最小，免得有規律） */
    /* 電腦出手：有必勝走法就走（隨機挑一種）；輸定了就隨機亂走（不挑最大或最小，免得有規律讓玩家猜） */
    function computerMove(piles, maxTake, misere, rand) {
        rand = rand || Math.random;
        var win = winningMoves(piles, maxTake, misere);
        if (win.length) return kit.pick(win, rand);     /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        return kit.pick(movesOf(piles, maxTake), rand);
    }
    /* 結算畫面的評語（依通過關數） */
    function rating(n) {
        if (n >= 25) return '取火柴高手！';
        if (n >= 12) return '你掌握二進位了！';
        if (n >= 5) return '越來越有感覺了！';
        return '想一想：把每堆根數寫成二進位，讓每一位的 1 都成雙！';
    }

    /* ═══ 畫面 ═══ */
    /* 遊戲進場：交給共用骨架 kit.run 處理闖關流程（第幾關、過關、失敗、結算、最佳紀錄） */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 每一關開始時呼叫：出題、畫出各堆火柴。api 是共用骨架給的工具（api.stage 畫面容器、api.after 延遲執行、api.pass／api.fail 過關／失敗…） */
    function setup(api) {
        var stage = api.stage, level = api.level;
        var pz = makePuzzle(level, api.rand), maxTake = pz.maxTake, misere = pz.misere;
        api.info = pz;
        console.log('[取火柴] 第 ' + level + ' 關：' + pz.piles.join('、') + (maxTake ? '（限拿 ' + maxTake + '）' : '') + (misere ? '，拿最後一根輸' : ''));
        var piles = pz.piles.slice(), sel = null, busy = false, over = false;     /* sel：{ pile, count }（從該堆右邊算起要拿幾根） */
        var maxPile = Math.max.apply(null, pz.piles);   /* 最長那一堆有幾根：用它決定每根火柴的寬度（越多根越細，才排得下） */
        var W = stage.clientWidth || 472;
        var mw = Math.min(MATCH_MAX_W, Math.floor((W - 110) / maxPile));  /* Math.floor：無條件捨去成整數 */

        var wrap = h('div', { 'class': 'nim-wrap' });   /* wrap：整個遊戲畫面的外框容器；下面建好的各個區塊（盤面、按鈕…）都放進它，最後再整個放進舞台 */
        var banner = h('div', { 'class': 'nim-banner', text: misere ? '拿到最後一根的人【輸】' : '拿到最後一根的人【贏】' });
        var note = h('div', { 'class': 'nim-note', text: maxTake ? '每回合最多拿 ' + maxTake + ' 根（一堆）' : '每回合從「同一堆」拿走任意根' });
        var rows = h('div', { 'class': 'nim-rows' });
        var turn = h('div', { 'class': 'nim-turn', text: '輪到你：點一根火柴，選它和它右邊的' });
        var reveal = h('div', { 'class': 'nim-reveal' });
        var btns = h('div', { 'class': 'nim-btns' });
        var btnTake = h('button', { 'class': 'btn btn--primary nim-btn', type: 'button', text: '拿走' });
        var btnClear = h('button', { 'class': 'btn btn--line nim-btn', type: 'button', text: '取消選取' });
        kit.onTap(btnTake, take);                       /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
        kit.onTap(btnClear, function () { if (!busy) { sel = null; paint(); } });
        btns.appendChild(btnClear); btns.appendChild(btnTake);  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        wrap.appendChild(banner); wrap.appendChild(note); wrap.appendChild(rows); wrap.appendChild(turn); wrap.appendChild(reveal); wrap.appendChild(btns);
        stage.appendChild(wrap);                        /* 把整個遊戲區放進舞台（放進去，畫面上才看得到） */
        if (level === 11 && kit.once('nim.binary')) turn.textContent = '想一想二進位：每堆根數寫成二進位，讓每一位的 1 成雙';  /* 第 11 關（第一次出現三堆以上）提醒玩家想想二進位；kit.once 保證這個提醒整個網頁只出現一次 */

        var rowEls = [], matchEls = [], origin = pz.piles.slice();
        piles.forEach(function (n, pi) {
            var row = h('div', { 'class': 'nim-row' });
            row.appendChild(h('div', { 'class': 'nim-label', text: piles.length > 1 ? String(pi + 1) : '' }));
            var ms = [];
            for (var k = 0; k < n; k++) {
                var m = h('div', { 'class': 'nim-match' }, [h('i', { 'class': 'nim-head' })]);
                m.style.width = mw + 'px';
                (function (p, kk) { kit.onTap(m, function () { choose(p, kk); }); })(pi, k);
                row.appendChild(m); ms.push(m);
            }
            rows.appendChild(row); rowEls.push(row); matchEls.push(ms);
        });

        /* 這一堆還剩幾根：火柴 0..piles[p]-1 還在桌上，之後的已被拿走 */
        /* 點一根火柴：選取「它和它右邊所有火柴」（從這堆右邊算起要拿幾根）；再點同一個位置＝取消。限拿 maxTake 根時，最多選 maxTake 根 */
        function choose(p, k) {
            if (busy || over) return;
            var cnt = piles[p] - k;
            if (k >= piles[p]) return;
            if (maxTake && cnt > maxTake) cnt = maxTake;
            if (sel && sel.pile === p && sel.count === cnt) sel = null; else sel = { pile: p, count: cnt };
            paint();
        }
        /* 重畫：被拿走的火柴變淡（gone）、被選中的標色（sel），並更新「拿走 N 根」按鈕 */
        function paint() {
            piles.forEach(function (n, p) {
                matchEls[p].forEach(function (m, k) {
                    var cls = 'nim-match';
                    if (k >= n) cls += ' nim-match--gone';
                    else if (sel && sel.pile === p && k >= n - sel.count) cls += ' nim-match--sel';
                    m.className = cls;
                });
            });
            btnTake.textContent = sel ? '拿走 ' + sel.count + ' 根' : '拿走';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            btnTake.disabled = !sel || busy;
            btnClear.disabled = !sel || busy;
        }
        /* 按「拿走」：照選取拿走火柴。拿完若沒有火柴了：普通規則＝你贏，「拿最後一根輸」規則＝你輸；
           否則檢查你有沒有走錯——拿完之後如果電腦仍然「有辦法贏」（isWinning），就是走錯了，這一關結束；沒走錯就換電腦。 */
        function take() {
            if (!sel || busy || over) return;
            var mv = { pile: sel.pile, take: sel.count }, before = piles.slice();
            piles = applyMove(piles, mv); sel = null; paint();
            var left = total(piles);
            if (left === 0) {
                over = true;
                if (!misere) { turn.textContent = '你拿走了最後一根，你贏了！'; kit.flash(stage, true, api.my); api.pass({ delay: PASS_DELAY_MS }); }  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
                else failWith(before, mv, '你拿走了最後一根——這一關拿最後一根的人輸');
                return;
            }
            if (isWinning(piles, maxTake, misere)) { failWith(before, mv, null); return; }       /* 你走錯了：電腦有辦法一路保持必勝 */
            busy = true; paint(); turn.textContent = '電腦思考中…';
            api.after(COMPUTER_THINK_MS, computerTurn); /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
        }
        /* 電腦拿火柴：先標出它要拿的火柴（停 COMPUTER_SHOW_MS 毫秒讓玩家看見），再真的拿走；電腦拿走最後一根只會發生在它輸定的「拿最後一根輸」規則 */
        function computerTurn() {
            var mv = computerMove(piles, maxTake, misere, api.rand);
            var els = matchEls[mv.pile].slice(piles[mv.pile] - mv.take, piles[mv.pile]);
            els.forEach(function (m) { m.classList.add('nim-match--cpu'); });  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            turn.textContent = '電腦從第 ' + (mv.pile + 1) + ' 堆拿 ' + mv.take + ' 根';
            api.after(COMPUTER_SHOW_MS, function () {
                piles = applyMove(piles, mv);
                els.forEach(function (m) { m.classList.remove('nim-match--cpu'); });
                busy = false; paint();
                if (total(piles) === 0) {          /* 電腦拿走最後一根：只會發生在「拿最後一根輸」的規則（它輸定了） */
                    over = true; turn.textContent = '電腦拿走了最後一根，你贏了！'; kit.flash(stage, true, api.my); api.pass({ delay: PASS_DELAY_MS }); return;  /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
                }
                turn.textContent = '輪到你：點一根火柴，選它和它右邊的';
            });
        }
        /* 失敗：顯示你走錯的那一步，以及（普通規則、不限拿幾根時）每一堆的二進位與 XOR */
        /* 失敗：顯示你走錯的那一步與比較好的走法；普通規則（不限拿幾根）再把每堆的二進位和 XOR 列出來，讓玩家看見「XOR 不是 0」 */
        function failWith(before, mv, special) {
            over = true; busy = true; btns.style.display = 'none'; paint();          /* 結束了：拿掉按鈕，讓下面的說明有位置 */
            var good = winningMoves(before, maxTake, misere), lines = [];
            var after = applyMove(before, mv);
            var text = special ? special + '。' : '你拿完之後，電腦能一路保持必勝。';
            if (good.length) text += '比較好的走法：第 ' + (good[0].pile + 1) + ' 堆拿 ' + good[0].take + ' 根。';
            turn.textContent = text;
            lines.push(text);
            if (!maxTake && !misere) {
                var w = Math.max(3, Math.max.apply(null, before).toString(2).length), x = xorOf(after);
                reveal.innerHTML = '';                  /* innerHTML = ''：把元素裡面的東西全部清掉 */
                reveal.appendChild(h('div', { 'class': 'nim-reveal__title', text: '拿完後的各堆（二進位）' }));
                after.forEach(function (n, i) { reveal.appendChild(h('div', { 'class': 'nim-reveal__row', text: '第 ' + (i + 1) + ' 堆　' + n + ' 根　' + toBin(n, w) })); });
                reveal.appendChild(h('div', { 'class': 'nim-reveal__row nim-reveal__row--xor', text: 'XOR　' + toBin(x, w) + (x === 0 ? '' : '（不是 0）') }));
                lines.push('你拿完後 XOR＝' + x + (x === 0 ? '' : '，不是 0'));
            }
            kit.flash(stage, false, api.my);
            api.fail({ delay: FAIL_HOLD_MS, lines: lines });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 給測試／debug 用：api.solve 走一步必勝的路、api.wrong 故意走一步讓電腦保持必勝的、api.state 回報目前狀態 */
        api.solve = function () {                  /* 驗證用：走一步必勝的路，直到贏 */
            if (over || busy) return;
            var good = winningMoves(piles, maxTake, misere);
            if (!good.length) return;
            var mv = good[0]; sel = { pile: mv.pile, count: mv.take }; take();
        };
        api.wrong = function () {                  /* 驗證用：走一步會讓電腦保持必勝的路 */
            if (over || busy) return;
            var bad = movesOf(piles, maxTake).filter(function (mv) { return isWinning(applyMove(piles, mv), maxTake, misere); });
            var mv = bad.length ? bad[0] : movesOf(piles, maxTake)[0]; sel = { pile: mv.pile, count: mv.take }; take();
        };
        api.state = function () { return { piles: piles.slice(), busy: busy, over: over }; };
        paint();
    }

    /* 遊戲登記資料：id、名稱、規則文字（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式 */
    var G = {
        id: ID,
        name: '取火柴',
        rule: '桌上有幾堆火柴（一排一堆）。**你和電腦輪流，每回合只能從「同一堆」拿走任意根（至少 1 根）；拿走最後一根的人贏**（後面幾關相反：拿走最後一根的人輸）。你先手，點一根火柴會選取它和它右邊所有的火柴，再按「拿走」。**每一關你都有必勝的走法**，電腦每一步都會抓住你的失誤；只要你有一步走錯，這一關就結束，並告訴你錯在哪。提示：把每堆的根數寫成二進位看看。',
        mount: mount,
        score: SCORE,
        test: {
            stageOf: stageOf, isWinning: isWinning, movesOf: movesOf, applyMove: applyMove, winningMoves: winningMoves, xorOf: xorOf, makePuzzle: makePuzzle,
            computerMove: computerMove, rating: rating, STAGES: STAGES, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
