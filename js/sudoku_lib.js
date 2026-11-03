/* ═══════════════════════════════════════════════════════════════════
   sudoku_lib.js — 數獨系列（數獨4、數獨6入門／中階、數獨9入門／中階／高階）和夾心數獨共用的「畫面」
   （出題與推理在 js/sudoku_engine.js；這個檔案不是遊戲，是遊戲檔案用的零件，不會自己登記成遊戲）
   樣式：css/sudoku_lib.css（class 一律以「sudokulib-」開頭）
   ───────────────────────────────────────────────────────────────────
   · 玩法（深思篇 421）：每一橫排、每一直排、每個宮裡，1～N 各出現一次。點一格、再點下面的數字。
     沒有時間限制，也不會因為填錯而結束；全部填對就過關，換下一題。想結束就按左上角「返回」，成績＝解開幾題。
   · 重複的數字會變紅（跟一般數獨 App 一樣，只提示「重複」，不揭露答案）；填滿而且沒有重複才算解開。
   · 工具：筆記（在格子角落記候選數字）、清除、提示（每題 HINTS 次，只標出「現在可以確定」的那一格，不說數字、不說理由）、重來。
   · 提供兩個入口：
       lib.game(cfg)         一整個數獨變體（出題、畫面、結算都包好）；數獨4／6／9 的遊戲檔案各呼叫一次
       lib.mountBoard(...)   只畫「盤面＋數字鍵＋工具列」，給夾心數獨這種要自己出題、自己加外圍線索的遊戲用
   ═══════════════════════════════════════════════════════════════════ */
/* ─── 新手導讀 ───
   這個檔案是數獨系列「畫面」的共用零件（出題與推理在 sudoku_engine.js）。分三大段：
   ① 參數區；② 純函式（算尺寸、找重複、算數字出現幾次、判斷解開了沒，單元測試直接測它們）；
   ③ lib.mountBoard（畫盤面＋數字鍵＋工具列，處理點擊）與 lib.game（把「出題＋畫面＋結算」包成一款遊戲）。
   各款數獨遊戲檔案（reaction_sudoku4.js 等）只要呼叫 lib.game({...設定...}) 就完成了。 */
(function () {
    'use strict';

    var h = UI.h, kit = Reaction.kit, SE = window.SudokuEngine;  /* h：建立網頁元素的小工具；kit：闖關遊戲共用工具箱；SE：數獨引擎（sudoku_engine.js） */
    var lib = Reaction.sudokuLib = {};                  /* lib 是這個檔案對外提供的工具箱，掛在 Reaction.sudokuLib 讓遊戲檔案取用 */

    /* ═══ 可以自己調的參數 ═══ */
    var HINTS = 3;                              /* 每一題可以用幾次提示（0＝關掉提示鈕） */
    var AUTO_CLEAN_NOTES = true;                /* 填入數字時，同排／欄／宮的格子自動拿掉那個數字的筆記 */
    var SHOW_CONFLICT = true;                   /* 重複的數字標紅 */
    var BORDER = 3;                             /* 盤面外框粗細（px，跟 css 的 .sudokulib-board 一致） */
    var PASS_DELAY_MS = 1300;                   /* 解開之後停多久才換下一題 */
    var MAX_LEVEL = 90;                         /* 解到這題就全破 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 盤面的尺寸：畫面寬 W、盤面邊長 N、佔寬比例 frac、左右額外留的寬度 ring（夾心數獨的外圍線索）→ 每格邊長 */
    /* 算盤面尺寸：可用寬度 ＝ 畫面寬 × 佔寬比例 − 外圍線索的寬度，再扣掉外框，除以 N 得到「每格邊長」（取整數，盤面才不會有小數像素的縫） */
    function boardMetrics(W, N, frac, ring) {
        var width = Math.round(W * frac) - (ring || 0), cell = Math.floor((width - BORDER) / N);  /* Math.floor：無條件捨去成整數 */
        return { cell: cell, width: cell * N + BORDER, height: cell * N + BORDER };
    }
    /* 哪些格子的數字和同排／欄／宮的別格重複 → 布林陣列 */
    /* 找出重複：某格的數字跟「同排、同欄、同宮」任何一格相同，就標成 true（畫面上會變紅）。g.peers[i] 是第 i 格的所有「同單位的其他格」 */
    function conflictsOf(g, grid) {
        var bad = new Array(g.cells).fill(false), i, k; /* new Array(n).fill(v)：建立長度 n、每一格都是 v 的陣列 */
        for (i = 0; i < g.cells; i++) {
            if (!grid[i]) continue;
            for (k = 0; k < g.peers[i].length; k++) if (grid[g.peers[i][k]] === grid[i]) { bad[i] = true; break; }
        }
        return bad;
    }
    /* 每個數字在盤面上出現幾次（數字鍵變灰用） */
    /* 數每個數字在盤面上出現幾次（出現 N 次的數字，數字鍵就變灰：已經放完了） */
    function digitCounts(g, grid) { var c = new Array(g.N + 1).fill(0); grid.forEach(function (v) { if (v) c[v]++; }); return c; }  /* forEach：對陣列的每個元素各做一次 */
    /* 解開了嗎：全部填滿、沒有重複、而且跟答案一樣 */
    /* 解開了嗎：每一格都有數字、而且跟答案一樣 */
    function isSolved(g, grid, solution) {
        for (var i = 0; i < g.cells; i++) if (!grid[i] || grid[i] !== solution[i]) return false;
        return true;
    }
    /* 把純函式放進 lib.test，單元測試（test/reaction/t_sudokulib.js）才拿得到 */
    lib.test = { boardMetrics: boardMetrics, conflictsOf: conflictsOf, digitCounts: digitCounts, isSolved: isSolved, HINTS: HINTS, MAX_LEVEL: MAX_LEVEL };

    /* ═══ 盤面＋數字鍵＋工具列 ═══
       api：kit.run 給 setup 的 api；g：SE.geom 的幾何；pz：{ givens, solution }；
       o.frac：盤面佔遊戲畫面寬度的比例；o.maxLevel：提示用的推理等級；o.ring：{ top: [每欄的線索], left: [每排的線索] }（夾心數獨）；
       o.tip：盤面下方的說明文字；o.extraConflict(grid) → 額外標紅的格子（布林陣列，夾心數獨用）
       回傳控制器 { grid, paint(), fillSolution(), putWrong() }。解開時會自己呼叫 api.pass。 */
    /* 畫盤面並處理所有操作（點格子、填數字、筆記、提示、重來）。解開時會自己呼叫 api.pass 過關 */
    lib.mountBoard = function (api, g, pz, o) {
        o = o || {};
        var stage = api.stage, N = g.N, my = api.my;
        var W = stage.clientWidth || 472;
        var ringW = o.ring ? Math.round(W * 0.095) : 0; /* ringW：夾心數獨外圍線索格的寬度（沒有外圍線索就是 0） */
        var bm = boardMetrics(W, N, o.frac || 0.96, ringW);
        var grid = pz.givens.slice(), notes = new Array(g.cells).fill(0), sel = -1, noteMode = false, hintsLeft = o.hints != null ? o.hints : HINTS, hintCell = -1, solved = false;  /* grid：目前盤面（先抄一份題目，不要改到原本的題目）；notes：每格的筆記（位元遮罩，跟 sudoku_engine 一樣）； sel：目前選中的格子（−1＝沒選）；noteMode：筆記模式開關；hintsLeft：剩幾次提示；hintCell：提示標出的格子；solved：已經解開 */
        var cells = [], cellDigit = [], cellNotes = []; /* 每一格對應的網頁元素：格子本身、顯示大數字的 span、顯示筆記的小格區（建好存起來，paint 時直接改它們） */

        var wrap = h('div', { 'class': 'sudokulib-wrap' });  /* wrap：整個遊戲畫面的外框容器；下面建好的各個區塊（盤面、按鈕…）都放進它，最後再整個放進舞台 */
        wrap.style.setProperty('--sudokulib-key-h', (N >= 9 ? 52 : 64) + 'px');        /* 9×9 的盤面高，數字鍵與工具列矮一點才放得下 */  /* CSS 變數：用 JS 把算好的尺寸交給 CSS 用（CSS 裡寫 var(--sudokulib-key-h)）。9×9 的盤面比較高，數字鍵要矮一點才放得下 */
        wrap.style.setProperty('--sudokulib-tool-h', (N >= 9 ? 48 : 56) + 'px');  /* style.setProperty('--名稱', 值)：用 JS 設定 CSS 變數，CSS 裡用 var(--名稱) 取用（把算好的尺寸交給樣式） */
        var frame = h('div', { 'class': 'sudokulib-frame' });
        var board = h('div', { 'class': 'sudokulib-board' });  /* board：盤面（所有格子都放在裡面） */
        board.style.setProperty('--sudokulib-n', N);
        board.style.setProperty('--sudokulib-cell', bm.cell + 'px');
        board.style.setProperty('--sudokulib-font', Math.round(bm.cell * (N <= 6 ? 0.62 : 0.68)) + 'px');  /* Math.round：四捨五入成整數 */
        board.style.setProperty('--sudokulib-note', Math.max(9, Math.round(bm.cell / (g.R + 0.9) * 0.75)) + 'px');
        board.style.setProperty('--sudokulib-notecols', g.C);
        for (var i = 0; i < g.cells; i++) {
            /* 建立每一格：依位置加上 sudokulib-cE（宮的右邊界）、sudokulib-rE（宮的下邊界）class，CSS 才會畫出比較粗的宮分隔線 */
            var c = h('div', { 'class': 'sudokulib-cell' });
            if (g.colOf(i) % g.C === g.C - 1) c.className += ' sudokulib-cE';
            if (g.rowOf(i) % g.R === g.R - 1) c.className += ' sudokulib-rE';
            var dg = h('span', { 'class': 'sudokulib-digit' });
            var nt = h('div', { 'class': 'sudokulib-notes' });
            for (var d = 1; d <= N; d++) nt.appendChild(h('span', { 'class': 'sudokulib-note', text: String(d) }));  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
            c.appendChild(nt); c.appendChild(dg);
            (function (idx) { kit.onTap(c, function () { select(idx); }); })(i);  /* 用立即執行函式把當下的 i 存成 idx（不這樣的話，所有格子點下去都會拿到迴圈結束時的 i） */
            board.appendChild(c); cells.push(c); cellDigit.push(dg); cellNotes.push(nt);
        }
        /* 夾心數獨才有的「外圍線索」：上方每欄一個、左邊每排一個，排在盤面外面 */
        if (o.ring) {
            var top = h('div', { 'class': 'sudokulib-ring sudokulib-ring--top' }), left = h('div', { 'class': 'sudokulib-ring sudokulib-ring--left' });
            top.style.width = bm.cell * N + 'px'; left.style.height = bm.cell * N + 'px';
            top.style.marginLeft = BORDER + 'px';
            for (var k = 0; k < N; k++) {
                top.appendChild(h('div', { 'class': 'sudokulib-ringcell', text: o.ring.top[k] == null ? '' : String(o.ring.top[k]) }));
                left.appendChild(h('div', { 'class': 'sudokulib-ringcell', text: o.ring.left[k] == null ? '' : String(o.ring.left[k]) }));
            }
            [].forEach.call(top.children, function (e) { e.style.width = bm.cell + 'px'; e.style.height = ringW + 'px'; });
            [].forEach.call(left.children, function (e) { e.style.height = bm.cell + 'px'; e.style.width = ringW + 'px'; });
            frame.style.gridTemplateColumns = ringW + 'px ' + bm.width + 'px';
            frame.appendChild(h('div', { 'class': 'sudokulib-corner' }));
            frame.appendChild(top); frame.appendChild(left); frame.appendChild(board);
        } else frame.appendChild(board);
        wrap.appendChild(frame);

        var tipText = o.tip || '先點一格，再點數字';
        var tip = h('div', { 'class': 'sudokulib-tip', text: tipText });  /* tip：盤面下方的提示文字（操作說明、出錯的原因會寫在這裡） */
        wrap.appendChild(tip);

        /* 數字鍵：N≤6 排成一排（最後一顆是擦掉）；N＝9 排成 5＋5（最後一顆是擦掉） */
        var pad = h('div', { 'class': 'sudokulib-pad' });
        var padCols = N <= 6 ? N + 1 : 5;               /* 數字鍵排法：N ≤ 6 排成一排（含擦掉鍵）；N ＝ 9 排成 5 欄兩列 */
        pad.style.gridTemplateColumns = 'repeat(' + padCols + ', minmax(0, 1fr))';
        var keys = [];
        /* 一個數字一顆鍵（用立即執行函式存住 dg，原因同上） */
        for (var dd = 1; dd <= N; dd++) (function (dg) {
            var b = h('button', { 'class': 'btn btn--sky sudokulib-key', type: 'button', text: String(dg) });
            kit.onTap(b, function () { enter(dg); });   /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
            pad.appendChild(b); keys.push(b);
        })(dd);
        var eraser = h('button', { 'class': 'btn btn--line sudokulib-key sudokulib-key--erase', type: 'button', html: '⌫' });
        kit.onTap(eraser, function () { enter(0); });
        pad.appendChild(eraser);
        wrap.appendChild(pad);

        /* 工具列：筆記、提示、重來 */
        var tools = h('div', { 'class': 'sudokulib-tools' });
        var btnNote = h('button', { 'class': 'btn btn--line sudokulib-tool', type: 'button', text: '筆記：關' });
        var btnHint = h('button', { 'class': 'btn btn--line sudokulib-tool', type: 'button', text: '提示 ' + hintsLeft });  /* 「提示」按鈕（文字會顯示還剩幾次提示） */
        var btnReset = h('button', { 'class': 'btn btn--line sudokulib-tool', type: 'button', text: '重來' });  /* 「重來」按鈕 */
        kit.onTap(btnNote, function () { noteMode = !noteMode; btnNote.textContent = '筆記：' + (noteMode ? '開' : '關'); btnNote.classList.toggle('sudokulib-tool--on', noteMode); });  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
        kit.onTap(btnHint, function () { useHint(); });
        kit.onTap(btnReset, function () { reset(); });
        tools.appendChild(btnNote);
        if (hintsLeft > 0) tools.appendChild(btnHint);
        tools.appendChild(btnReset);
        wrap.appendChild(tools);
        stage.appendChild(wrap);                        /* 把整個遊戲區放進舞台（放進去，畫面上才看得到） */

        /* 點選一格：記住選中的格子並重畫 */
        function select(idx) { if (solved) return; sel = idx; paint(); }
        /* 按下數字鍵 d（0＝擦掉）：
           · 還沒選格子、或選到題目給的格子 → 只顯示提示文字；
           · 筆記模式 → 切換這格的筆記 d（用 ^= 位元運算：有就拿掉、沒有就加上）；
           · 一般模式 → 填入 d（再按一次同一個數字＝擦掉），並自動拿掉同排同欄同宮格子的 d 筆記。 */
        function enter(d) {
            if (solved) return;
            if (sel < 0) { tip.textContent = '先點一格，再點數字'; return; }  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            if (pz.givens[sel]) { tip.textContent = '這格是題目給的'; return; }
            hintCell = -1;
            if (d === 0) { grid[sel] = 0; notes[sel] = 0; }
            else if (noteMode && !grid[sel]) notes[sel] ^= (1 << d);
            else if (noteMode) { /* 已經填了數字：先不動，要改請先擦掉 */ tip.textContent = '先擦掉數字才能寫筆記'; return; }
            else if (grid[sel] === d) grid[sel] = 0;
            else {
                grid[sel] = d; notes[sel] = 0;
                if (AUTO_CLEAN_NOTES) g.peers[sel].forEach(function (p) { notes[p] &= ~(1 << d); });
            }
            paint();
            check();
        }
        /* 提示：請引擎算出「現在能確定的下一格」，用閃動標出來（不說數字、不說理由）。每題只有 hintsLeft 次 */
        function useHint() {
            if (solved || hintsLeft <= 0) return;
            var c = SE.hintCell(g, pz.givens, grid, pz.solution, o.maxLevel || 1);
            if (c < 0) return;
            hintsLeft--; btnHint.textContent = '提示 ' + hintsLeft; btnHint.disabled = hintsLeft <= 0;
            hintCell = c; sel = c;
            tip.textContent = '閃動的格子可以確定了';
            paint();
        }
        /* 重來：盤面回到題目的樣子、筆記清空 */
        function reset() {
            if (solved) return;
            grid = pz.givens.slice(); notes = new Array(g.cells).fill(0); sel = -1; hintCell = -1;  /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
            tip.textContent = tipText;
            paint();
        }
        /* 重畫整個盤面：依每格的狀態組出 class（題目／我填的／同排同欄同宮／同數字／選中／重複／提示），再更新數字與筆記，最後把「已經放完」的數字鍵變灰 */
        function paint() {
            var bad = SHOW_CONFLICT ? conflictsOf(g, grid) : new Array(g.cells).fill(false);
            var extra = o.extraConflict ? o.extraConflict(grid) : null;
            var counts = digitCounts(g, grid);
            var selDigit = sel >= 0 ? grid[sel] : 0;
            for (var i = 0; i < g.cells; i++) {
                var cl = 'sudokulib-cell' + (g.colOf(i) % g.C === g.C - 1 ? ' sudokulib-cE' : '') + (g.rowOf(i) % g.R === g.R - 1 ? ' sudokulib-rE' : '');
                if (pz.givens[i]) cl += ' sudokulib-cell--given';
                else if (grid[i]) cl += ' sudokulib-cell--mine';
                if (sel >= 0 && i !== sel && (g.rowOf(i) === g.rowOf(sel) || g.colOf(i) === g.colOf(sel) || g.boxOf(i) === g.boxOf(sel))) cl += ' sudokulib-cell--peer';
                if (selDigit && grid[i] === selDigit && i !== sel) cl += ' sudokulib-cell--same';
                if (i === sel) cl += ' sudokulib-cell--sel';
                if (bad[i] || (extra && extra[i])) cl += ' sudokulib-cell--bad';
                if (i === hintCell) cl += ' sudokulib-cell--hint';
                cells[i].className = cl;
                cellDigit[i].textContent = grid[i] ? String(grid[i]) : '';
                cellNotes[i].style.display = !grid[i] && notes[i] ? 'grid' : 'none';
                if (!grid[i] && notes[i]) for (var d = 1; d <= N; d++) cellNotes[i].children[d - 1].style.visibility = (notes[i] & (1 << d)) ? 'visible' : 'hidden';
            }
            keys.forEach(function (b, k) { b.classList.toggle('sudokulib-key--done', counts[k + 1] >= N); });
        }
        /* 每次填完檢查：解開了就鎖住盤面、全部格子變綠、閃綠光並過關 */
        function check() {
            if (!isSolved(g, grid, pz.solution)) return;
            solved = true; sel = -1; hintCell = -1; paint();
            tip.textContent = '解開了！';
            cells.forEach(function (c) { c.classList.add('sudokulib-cell--ok'); });
            kit.flash(stage, true, my);                 /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            api.pass({ delay: PASS_DELAY_MS });         /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
        }
        paint();
        /* 回傳給遊戲檔案的「遙控器」：測試與 debug 用（grid() 看盤面、fillSolution() 一鍵填答案、putWrong() 故意填錯一格…） */
        var ctl = {                                     /* ctl：給外面（遊戲檔案、測試）用的「遙控器」，裡面是可以呼叫的函式與查詢目前狀態的函式 */
            grid: function () { return grid; },
            paint: paint,
            fillSolution: function () { grid = pz.solution.slice(); paint(); check(); },
            putWrong: function () { for (var i = 0; i < g.cells; i++) if (!pz.givens[i]) { grid[i] = pz.solution[i] % N + 1; break; } paint(); },
            hintLeft: function () { return hintsLeft; },
            state: function () { return { sel: sel, hintCell: hintCell, hintsLeft: hintsLeft, solved: solved, noteMode: noteMode }; },
            select: select, enter: enter, useHint: useHint, reset: reset
        };
        return ctl;
    };

    /* ═══ 一整個數獨變體 ═══
       cfg：id、name、rule、boxR／boxC（宮的排數／欄數）、spec（SE.make 的出題條件）、frac（盤面佔寬）、ratingAt（評語門檻）*/
    /* 一整個數獨變體：依設定 cfg 組出完整的遊戲物件（出題、畫面、結算、評語） */
    lib.game = function (cfg) {
        var g = SE.geom(cfg.boxR, cfg.boxC);            /* 先用引擎算好盤面幾何（幾排幾欄、哪些格同單位…） */
        var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '解開題數', min: 1, max: MAX_LEVEL };
        /* 出一題：交給引擎 SE.make，依 cfg.spec 的條件（提示數、最高技巧等級…）挖洞 */
        function makePuzzle(rand) { return SE.make(g, cfg.spec, rand || Math.random); }
        function rating(n) {
            if (n >= 30) return '數獨大師！';
            if (n >= 15) return '推理很穩！';
            if (n >= 6) return '越來越有感覺了！';
            return '再解幾題，會越來越順！';
        }
        function mount(root, ctx) {
            kit.run(root, ctx, {
                id: cfg.id, G: G, maxLevel: MAX_LEVEL, goodAt: 5, resume: false, leaveSettle: true,
                head: function (level) { return '第 ' + level + ' 題'; },
                info: function (S) { return '已解 ' + S.cleared + ' 題'; },
                numText: function (v) { return v + ' 題'; },
                rating: rating,
                lines: function (S) { return ['解開 ' + S.cleared + ' 題']; },
                setup: setup
            });
        }
        /* 每一題開始時：出題 → 畫盤面（mountBoard）→ 把 api.solve／api.wrong 接到遙控器（測試用） */
        function setup(api) {
            var pz = makePuzzle(api.rand);
            api.info = pz;
            console.log('[' + cfg.name + '] 第 ' + api.level + ' 題：提示 ' + pz.count + ' 個，最高用到技巧等級 ' + pz.level);
            var ctl = lib.mountBoard(api, g, pz, { frac: cfg.frac, maxLevel: cfg.spec.maxLevel });
            api.solve = function () { ctl.fillSolution(); };
            api.wrong = function () { ctl.putWrong(); };
            api.ctl = ctl;
        }
        var G = {
            id: cfg.id, name: cfg.name, rule: cfg.rule, mount: mount, score: SCORE,
            test: { geom: g, spec: cfg.spec, makePuzzle: makePuzzle, rating: rating, MAX_LEVEL: MAX_LEVEL, lib: lib.test, engine: SE }
        };
        return G;
    };
})();
