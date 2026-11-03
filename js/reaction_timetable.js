/* ═══════════════════════════════════════════════════════════════════
   reaction_timetable.js — 秒反應・時刻表補字（原創篇 523「時刻表補字」）
   樣式：css/games/reaction_timetable.css（class 一律以「timetable-」開頭）；數字鍵盤：js/numpad_lib.js
   ───────────────────────────────────────────────────────────────────
   · 玩法：站牌上的公車時刻表被雨淋糊了。每一欄是一班車、每一列是一站，格子裡是「幾點幾分到站」。
     規則只有一條：**每一班車從這一站開到下一站，花的時間都一樣**（所以每一站「離起點幾分鐘」對每班車都一樣）。
     點糊掉的格子、用數字鍵填「幾點幾分」（打 758 就是 7:58、打 1005 就是 10:05）。
   · 頓悟：長方形法則——任意兩站 × 任意兩班圍成的長方形，「左上＋右下＝右上＋左下」，三個角知道就推得出第四個角；
     再加上時間要進位（7:58 再過 9 分是 8:07）。各班的發車間隔**刻意不固定**，不能只看一班就照間隔加。
   · 沒有時間限制、不會失敗（自由解題）：全部填對就過關；按「檢查」把填錯的格子標紅；按左上角「返回」結束，成績＝解開幾題。
   · 出題：亂數產生「每站離起點幾分鐘」與「每班發車時間」→ 時刻表；看得到的格子先挑「站 × 班」的一棵生成樹
     （剛好推得完、少一格就推不出來），前面的關卡再多露幾格暖身。第 15 關起有一班「區間車」跳過中間某一站（那格寫「不停」）。
   · 提示（每題 HINTS 次）：挑一格「現在就推得出來」的空格，把它和推它用的長方形另外三個角一起閃出來（不填答案）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡，裡面的變數都是這個檔案私有的。
       分三段：① 參數區（難度在這）；② 純函式（出題、判斷填得對不對、提示，單元測試直接測）；③ 畫面（mount／setup）。
       核心觀念「長方形法則」：每班車從一站開到下一站花的時間都一樣，所以表格裡任意四格圍成長方形，左上＋右下 ＝ 右上＋左下。
       知道其中三個角，就能算出第四個角——玩家就靠這個把糊掉的格子一格一格推出來。 */
    'use strict';

    var ID = 'timetable';                               /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴（timetable-）都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 第幾關到頂（之後維持最難） */
    var STATIONS = [3, 7];                      /* 站數：第 1 關 → 到頂 */
    var TRAINS = [3, 6];                        /* 班次：第 1 關 → 到頂 */
    var BLANK_P = [0.3, 0.72];                  /* 糊掉的比例：第 1 關 → 到頂（最多糊到「只剩一棵生成樹」；7 站 × 6 班時 72% 剛好只剩生成樹） */
    var HOP_MIN = [3, 12];                      /* 相鄰兩站之間開幾分鐘（亂數範圍） */
    var GAP_MIN = [7, 26];                      /* 相鄰兩班的發車間隔（亂數範圍，刻意不固定） */
    var FIRST_DEP = [330, 1080];                /* 第一班發車時間的範圍（分鐘：5:30～18:00） */
    var EXPRESS_FROM = 15;                      /* 第幾關起有一班「區間車」跳過一站 */
    var HINTS = 3;                              /* 每一題可以用幾次提示（0＝關掉提示鈕） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var PASS_DELAY_MS = 1400;                       /* 答對（過關）後停多久才換下一關（毫秒，1400 毫秒＝1.4 秒） */
    var HINT_SHOW_MS = 4000;                    /* 提示的長方形閃多久 */
    var STOP_NAMES = ['火車站', '市場', '國小', '醫院', '區公所', '廟口', '農會', '圖書館', '公園', '里民館', '郵局', '老街'];      /* 站名最多 3 個字（7 站 × 6 班時站名欄只有 74px） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 這一關的表格大小：站數 S（列數）與班次 T（欄數），各自從第 1 關的數字線性變到到頂的數字 */
    function sizeFor(level) {
        return {
            S: Math.round(kit.ramp(level, STATIONS[0], STATIONS[1], RAMP_LEVELS)),
            T: Math.round(kit.ramp(level, TRAINS[0], TRAINS[1], RAMP_LEVELS))
        };
    }
    /* 分鐘 → 「7:58」；24 點以後也照樣往上加（實際上不會出現） */
    /* 分鐘數換成顯示用的時間字串，例如 478 分鐘 → 「7:58」（分鐘不足兩位要補 0） */
    function fmt(min) { var hh = Math.floor(min / 60), mm = min % 60; return hh + ':' + (mm < 10 ? '0' : '') + mm; }
    /* 玩家打的數字字串（最多 4 位）→ 分鐘；最後兩位是分。分超過 59 或空字串回傳 null */
    /* 玩家用數字鍵打的字串 → 分鐘數：最後兩位是「分」，前面是「時」（打 758 ＝ 7 時 58 分）。不足三位、分超過 59、時超過 23 都算無效，回傳 null */
    function parseTyped(s) {
        if (!s) return null;
        var n = parseInt(s, 10), mm = n % 100, hh = Math.floor(n / 100);
        if (s.length < 3 || mm > 59 || hh > 23) return null;
        return hh * 60 + mm;
    }
    /* 打到一半的顯示：「7」「75」「7:58」「10:05」 */
    /* 打到一半時格子裡顯示的字：打了三位以上就在倒數第二位前面補「:」（例如 758 → 7:58） */
    function typedText(s) { return s.length >= 3 ? s.slice(0, s.length - 2) + ':' + s.slice(-2) : s; }

    /* 用 union-find（並查集）挑一棵「站 × 班」的生成樹：節點是 S 個站＋T 班車，一格（站 s, 班 t）就是一條邊 */
    /* 挑一棵「站 × 班」的生成樹（最少需要保留的格子）。把 S 個站和 T 班車都當成「節點」，
       一格（站 s、班 t）就是連接這兩個節點的一條「邊」。用「並查集」（union-find）一條一條加邊，已經連通的就跳過，
       最後留下的邊剛好把所有節點連成一棵樹——只要保留這些格子，整張表就一定推得出來（不多不少）。 */
    function spanningCells(S, T, usable, rand) {
        var parent = [], i;
        for (i = 0; i < S + T; i++) parent.push(i);
        function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }  /* find：找一個節點屬於哪個群（沿著 parent 一路往上找到「代表」；順便縮短路徑讓下次更快） */
        var cells = kit.shuffle(usable, rand), tree = [];
        cells.forEach(function (k) {
            var s = Math.floor(k / T), t = k % T, a = find(s), b = find(S + t);
            if (a !== b) { parent[a] = b; tree.push(k); }
        });
        return tree;
    }
    /* 出一題：{ S, T, names, times[k]（分鐘，k＝s*T+t）, shown[k]（true＝看得到）, skip[k]（true＝區間車不停）, offset, dep } */
    /* 出一題：先隨機決定「每站離第一站多久（offset）」「每班車的發車時間（dep）」，每格的時間＝發車時間＋到那一站的時間；
       再決定哪一格是「區間車不停」（skip）；最後用生成樹保證「糊掉之後仍然推得出來」，其餘格子依糊掉的比例（BLANK_P）隨機糊掉。
       回傳 { S, T, names 站名, times 每格的正確分鐘, shown 看得到的格子, skip 不停的格子, offset, dep }。 */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;
        var sz = sizeFor(level), S = sz.S, T = sz.T, s, t, k;
        var offset = [0], dep = [kit.randInt(FIRST_DEP[0], FIRST_DEP[1], rand)];
        for (s = 1; s < S; s++) offset.push(offset[s - 1] + kit.randInt(HOP_MIN[0], HOP_MIN[1], rand));
        var gaps = [];
        for (t = 1; t < T; t++) { var g = kit.randInt(GAP_MIN[0], GAP_MIN[1], rand); gaps.push(g); dep.push(dep[t - 1] + g); }
        if (gaps.every(function (x) { return x === gaps[0]; })) { dep[T - 1] += 3; }      /* 發車間隔不能全部一樣 */  /* 發車間隔不能每班都一樣（那就變成猜規律而不是推理），一樣的話把最後一班晚 3 分鐘 */
        var times = [], skip = [];
        for (s = 0; s < S; s++) for (t = 0; t < T; t++) { times.push(dep[t] + offset[s]); skip.push(false); }
        if (level >= EXPRESS_FROM && S >= 4) skip[kit.randInt(1, S - 2, rand) * T + kit.randInt(1, T - 1, rand)] = true;  /* 第 EXPRESS_FROM 關起（而且站夠多）有一班「區間車」跳過一站：那一格顯示「不停」，不用填 */
        var usable = [];
        for (k = 0; k < S * T; k++) if (!skip[k]) usable.push(k);
        var tree = spanningCells(S, T, usable, rand);
        var blanksWant = Math.round(usable.length * kit.ramp(level, BLANK_P[0], BLANK_P[1], RAMP_LEVELS));
        var shownCount = Math.max(tree.length, usable.length - blanksWant);
        var shown = times.map(function () { return false; });
        tree.forEach(function (c) { shown[c] = true; });
        var extra = kit.shuffle(usable.filter(function (c) { return !shown[c]; }), rand);
        for (var e = 0; e < shownCount - tree.length; e++) shown[extra[e]] = true;
        var names = kit.shuffle(STOP_NAMES, rand).slice(0, S);
        return { S: S, T: T, names: names, times: times, shown: shown, skip: skip, offset: offset, dep: dep };
    }
    /* 看得到的格子能不能把整張表推出來（連通＝推得出來）。known[k]＝true 的格子當作已知 */
    /* 看得到的格子能不能把整張表推出來？把已知的格子當邊，看所有站與班是不是連成同一群（連通＝推得出來）。測試用它確認出的題目一定有解 */
    function solvable(pz, known) {
        var S = pz.S, T = pz.T, parent = [], i;
        for (i = 0; i < S + T; i++) parent.push(i);
        function find(x) { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; }
        var comps = S + T;
        for (var k = 0; k < S * T; k++) if (known[k] && !pz.skip[k]) {
            var a = find(Math.floor(k / T)), b = find(S + k % T);
            if (a !== b) { parent[a] = b; comps--; }
        }
        return comps === 1;
    }
    /* 「現在就推得出來」的空格與它的長方形：known 裡找三個角 (s,t2)、(s2,t2)、(s2,t) 都知道的 (s,t)。
       回傳 { cell, rect:[另外三格] } 或 null */
    /* 提示：找一個「現在就推得出來」的空格——它對面三個角的格子（同一排或同一列的另外三格）都已經知道。回傳 { cell 空格, rect 另外三格 }，找不到回傳 null */
    function hintRect(pz, known) {
        var S = pz.S, T = pz.T, s, t, s2, t2;
        for (s = 0; s < S; s++) for (t = 0; t < T; t++) {
            var k = s * T + t;
            if (known[k] || pz.skip[k]) continue;
            for (s2 = 0; s2 < S; s2++) for (t2 = 0; t2 < T; t2++) {
                if (s2 === s || t2 === t) continue;
                var a = s * T + t2, b = s2 * T + t2, c = s2 * T + t;
                if (known[a] && known[b] && known[c]) return { cell: k, rect: [a, b, c] };
            }
        }
        return null;
    }
    /* 目前每一格的狀態：answers[k]＝玩家填的分鐘數（null＝還沒填）→ { wrong:[k…], empty: 幾格空著, done } */
    /* 檢查目前的填法：回傳 { wrong 填錯的格子, empty 還有幾格空著, done 全部填對 }。answers[k] 是玩家填的分鐘數（null＝還沒填） */
    function checkAll(pz, answers) {
        var wrong = [], empty = 0;
        for (var k = 0; k < pz.S * pz.T; k++) {
            if (pz.shown[k] || pz.skip[k]) continue;
            if (answers[k] == null) empty++;
            else if (answers[k] !== pz.times[k]) wrong.push(k);
        }
        return { wrong: wrong, empty: empty, done: !wrong.length && !empty };
    }
    /* 結算畫面的評語（依解開題數） */
    function rating(n) {
        if (n >= 25) return '時刻表達人！';
        if (n >= 12) return '長方形法則很熟了！';
        if (n >= 5) return '越來越有感覺了！';
        return '找四格圍成長方形：左上＋右下＝右上＋左下！';
    }

    /* ═══ 畫面 ═══ */
    /* 遊戲進場：交給共用骨架 kit.run 處理闖關流程。leaveSettle: true 代表「沒有失敗」的自由解題——按返回會先結算再離開 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, resume: false, leaveSettle: true,
            head: function (level) { return '第 ' + level + ' 關'; },
            info: function (S) { return '已解 ' + S.cleared + ' 關'; },
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['解開 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 每一關開始時呼叫：出題、建立表格、按鈕與數字鍵。api 是共用骨架給的工具（api.stage 畫面容器、api.after 延遲執行、api.pass 過關…） */
    function setup(api) {
        var stage = api.stage, level = api.level;
        var pz = makePuzzle(level, api.rand), S = pz.S, T = pz.T;
        api.info = pz;
        console.log('[時刻表補字] 第 ' + level + ' 關：' + S + ' 站 × ' + T + ' 班，糊掉 ' + pz.shown.filter(function (v, k) { return !v && !pz.skip[k]; }).length + ' 格');
        var W = stage.clientWidth || 472, H = stage.clientHeight || 700;
        /* 版面：舞台高 667px 要放下「表格（S＋1 列）＋提示文字＋兩顆工具鈕＋4 排數字鍵」，站多的時候數字鍵與每列都變矮 */
        var nameW = 74, keyH = S >= 6 ? 46 : 54;        /* 算版面：站名欄寬 nameW、數字鍵高 keyH（站多時要矮一點才放得下）；下面再算每格的寬 cellW 與每列的高 rowH */
        var cellW = Math.min(96, Math.floor((W * 0.97 - nameW - 16 - T * 4) / T));
        var rowH = Math.max(36, Math.min(58, Math.floor((H - (4 * keyH + 24) - 50 - 28 - 24 - 6 - 16 - S * 4) / (S + 1))));
        var answers = pz.times.map(function () { return null; }), typed = '', sel = -1, hintsLeft = HINTS, solved = false;  /* answers：玩家填的答案（分鐘，null＝沒填）；typed：打到一半的數字字串；sel：選中的格子；hintsLeft：剩幾次提示；solved：已解開 */
        var marks = {};                          /* k → 'wrong'｜'hint'｜'rect'：暫時的標記 */  /* marks：暫時的標記（k → 錯誤 wrong／提示格 hint／提示的長方形 rect），換格子或再按鍵就清掉 */

        var wrap = h('div', { 'class': 'timetable-wrap' });
        var board = h('div', { 'class': 'timetable-board' });
        board.style.setProperty('--timetable-t', T);
        board.style.setProperty('--timetable-name', nameW + 'px');
        board.style.setProperty('--timetable-cell', cellW + 'px');
        board.style.setProperty('--timetable-row', rowH + 'px');
        board.style.setProperty('--timetable-font', cellW < 64 ? 'var(--fs-xs)' : 'var(--fs-sm)');     /* 格子窄的時候「17:47」用小一號的字才放得下 */
        board.appendChild(h('div', { 'class': 'timetable-corner', text: '站＼班' }));
        var t, s;
        for (t = 0; t < T; t++) board.appendChild(h('div', { 'class': 'timetable-colhead', text: (T >= 5 ? '' : '第') + (t + 1) + '班' }));
        var cells = [];
        for (s = 0; s < S; s++) {
            board.appendChild(h('div', { 'class': 'timetable-name', text: pz.names[s] }));
            for (t = 0; t < T; t++) {
                var k = s * T + t;
                var cl = h('div', { 'class': 'timetable-cell' });
                (function (kk) { kit.onTap(cl, function () { choose(kk); }); })(k);  /* 用立即執行函式存住這一格的編號 kk（不這樣寫，每格點下去都會拿到迴圈結束時的值） */
                board.appendChild(cl); cells.push(cl);
            }
        }
        var tip = h('div', { 'class': 'timetable-tip', text: '點灰色的格子，打 758＝7:58' });
        var tools = h('div', { 'class': 'timetable-tools' });
        var btnHint = h('button', { 'class': 'btn btn--line timetable-tool', type: 'button', text: '提示 ' + hintsLeft });
        var btnCheck = h('button', { 'class': 'btn btn--line timetable-tool', type: 'button', text: '檢查' });
        kit.onTap(btnHint, useHint);
        kit.onTap(btnCheck, check);
        if (HINTS > 0) tools.appendChild(btnHint);
        tools.appendChild(btnCheck);
        wrap.appendChild(board); wrap.appendChild(tip); wrap.appendChild(tools);
        stage.appendChild(wrap);
        var pad = Reaction.numpad(wrap, { keyH: keyH, onKey: onKey });  /* 共用的數字鍵盤（7 8 9／4 5 6／1 2 3／清除 0 ⌫）：按下去會呼叫 onKey */

        /* 重畫整張表：每格依狀態（不停／題目給的／糊掉的、選中、已填、錯誤、提示、解開）設 class 與文字 */
        function paint() {
            for (var k = 0; k < S * T; k++) {
                var el = cells[k], cls = 'timetable-cell';
                if (pz.skip[k]) { cls += ' timetable-cell--skip'; el.textContent = '不停'; }
                else if (pz.shown[k]) { cls += ' timetable-cell--given'; el.textContent = fmt(pz.times[k]); }
                else {
                    cls += ' timetable-cell--blank';
                    if (k === sel && typed) el.textContent = typedText(typed);
                    else el.textContent = answers[k] != null ? fmt(answers[k]) : '';
                    if (answers[k] != null) cls += ' timetable-cell--filled';
                    if (k === sel) cls += ' timetable-cell--sel';
                }
                if (marks[k]) cls += ' timetable-cell--' + marks[k];
                if (solved) cls += ' timetable-cell--ok';
                el.className = cls;
            }
        }
        /* 點一格：只有糊掉的格子能選；換格子前先把打到一半的時間存起來（commitTyped） */
        function choose(k) {
            if (solved || pz.shown[k] || pz.skip[k]) return;
            commitTyped();
            sel = sel === k ? -1 : k; typed = ''; marks = {}; paint();
        }
        /* 打到一半換格子：把打好的時間存起來（打不完整就丟掉） */
        /* 打到一半換格子：把打好的時間存起來（打得不完整就丟掉） */
        function commitTyped() {
            if (sel < 0 || !typed) return;
            var v = parseTyped(typed);
            if (v != null) answers[sel] = v;
            typed = '';
        }
        /* 處理數字鍵：清除／倒退／輸入數字。開頭的 0 不算；打滿 4 位、或 3 位數而且第一位 ≥ 3（例如 758 → 7:58，不可能再接第四位）就自動跳到下一個空格。
           每次輸入後檢查是不是全部填對了。 */
        function onKey(key) {
            if (solved) return;
            if (sel < 0) { tip.textContent = '先點一格灰色的格子'; return; }
            marks = {};
            if (key === 'clr') { typed = ''; answers[sel] = null; }
            else if (key === 'del') { if (typed) typed = typed.slice(0, -1); else if (answers[sel] != null) { typed = String(Math.floor(answers[sel] / 60) * 100 + answers[sel] % 60).slice(0, -1); answers[sel] = null; } }
            else if (typed.length < 4) {
                if (!typed && key === '0') { paint(); return; }          /* 開頭的 0 不算 */
                typed += key;
                var v = parseTyped(typed);
                answers[sel] = v;
                if (typed.length === 4 || (v != null && typed.length === 3 && parseInt(typed.charAt(0), 10) >= 3)) {   /* 3:00 以後的三位數、或打滿四位，就換下一格空格 */
                    typed = ''; nextBlank();
                }
            }
            paint();
            var c = checkAll(pz, answers);
            if (c.done) win();
        }
        /* 找下一個還沒填的糊掉格子（由目前格子往後繞一圈），找不到就取消選取 */
        function nextBlank() {
            for (var d = 1; d <= S * T; d++) {
                var k = (sel + d) % (S * T);
                if (!pz.shown[k] && !pz.skip[k] && answers[k] == null) { sel = k; return; }
            }
            sel = -1;
        }
        /* 按「檢查」：把填錯的格子標紅並告訴玩家有幾格錯、幾格空著；全對就過關 */
        function check() {
            if (solved) return;
            commitTyped();
            var c = checkAll(pz, answers);
            marks = {};
            c.wrong.forEach(function (k) { marks[k] = 'wrong'; });
            paint();
            if (c.done) { win(); return; }
            tip.textContent = c.wrong.length ? '紅色的 ' + c.wrong.length + ' 格算錯了' + (c.empty ? '，還有 ' + c.empty + ' 格空著' : '') : '目前填的都對，還有 ' + c.empty + ' 格空著';
        }
        /* 提示：用 hintRect 找一個現在就推得出來的格子，標出它和另外三個角（黃色長方形），停 HINT_SHOW_MS 毫秒後自動取消標記（每題 HINTS 次） */
        function useHint() {
            if (solved || hintsLeft <= 0) return;
            commitTyped();
            var known = pz.times.map(function (v, k) { return pz.shown[k] || answers[k] === v; });
            var r = hintRect(pz, known);
            if (!r) return;
            hintsLeft--; btnHint.textContent = '提示 ' + hintsLeft; btnHint.disabled = hintsLeft <= 0;
            marks = {}; marks[r.cell] = 'hint'; r.rect.forEach(function (k) { marks[k] = 'rect'; });
            sel = r.cell; typed = '';
            tip.textContent = '黃框四格：左上＋右下＝右上＋左下';
            paint();
            api.after(HINT_SHOW_MS, function () { if (marks[r.cell] === 'hint') { marks = {}; paint(); } });
        }
        /* 解開：數字鍵停用、全部變綠、閃綠光並過關 */
        function win() {
            solved = true; sel = -1; marks = {}; paint(); pad.setEnabled(false);
            tip.textContent = '時刻表補好了！';
            kit.flash(stage, true, api.my);
            api.pass({ delay: PASS_DELAY_MS });
        }
        /* 給測試／debug 用：api.solve 一鍵填成答案、api.wrong 故意填錯一格、api.state 回報目前狀態 */
        api.solve = function () { answers = pz.times.slice(); typed = ''; paint(); if (checkAll(pz, answers).done) win(); };
        api.wrong = function () { var k = pz.shown.indexOf(false); while (k >= 0 && pz.skip[k]) k = pz.shown.indexOf(false, k + 1); if (k >= 0) { answers[k] = pz.times[k] + 1; paint(); } };
        api.state = function () { return { answers: answers.slice(), sel: sel, typed: typed, solved: solved, hintsLeft: hintsLeft }; };
        paint();
    }

    /* 遊戲登記資料：id、名稱、規則文字（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式 */
    var G = {
        id: ID,
        name: '時刻表補字',
        rule: '站牌上的公車時刻表被雨淋糊了：**每一欄是一班車、每一列是一站**，格子裡是到站時間。規則只有一條：**每一班車從這一站開到下一站，花的時間都一樣。**點灰色的格子，用數字鍵填「幾點幾分」（打 758 就是 7:58）。按「檢查」會把填錯的格子標紅。沒有時間限制，也不會失敗；全部填對就過關，想結束就按左上角「返回」，成績是解開幾題。',
        mount: mount,
        score: SCORE,
        test: {
            sizeFor: sizeFor, fmt: fmt, parseTyped: parseTyped, typedText: typedText, spanningCells: spanningCells, makePuzzle: makePuzzle,
            solvable: solvable, hintRect: hintRect, checkAll: checkAll, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, STATIONS: STATIONS, TRAINS: TRAINS, BLANK_P: BLANK_P, EXPRESS_FROM: EXPRESS_FROM, HINTS: HINTS, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
