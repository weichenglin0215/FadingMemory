/* ═══════════════════════════════════════════════════════════════════
   reaction_fifteen.js — 秒反應・搶十五（深思篇 475「搶十五」）
   樣式：css/games/reaction_fifteen.css（class 一律以「fifteen-」開頭）
   ───────────────────────────────────────────────────────────────────
   · 玩法：桌上有 1～9 九張牌，**一開始你和電腦各已經拿了一張**（V1.43.1：以前一開局有 2～3 張，太簡單）。輪到你：兩人輪流各拿一張，**先湊到三張加起來剛好 15 的人贏**。
     點一張牌、按「拿這張」。你拿過的牌在左邊，電腦拿過的在右邊。**每一關都是你有必勝法的局面**，電腦每一步都用最好的防守；
     你走錯一步（不再有必勝法）也不會馬上結束：遊戲照樣玩到有人湊成、或牌拿完才結束，
     結束時才說明結果與哪一步是關鍵（V1.43.0 玩家意見：不要提前判定、每一步都要看得懂）。畫面每一手寫一行過程（誰拿了什麼、合計多少）。
     **電腦先湊成＝失敗；牌拿完沒有人湊成（和局）不算失敗，同一關重新出題**（V1.43.1）。
   · 頓悟：它和井字遊戲是**同一個遊戲**——把 1～9 放進 3×3 洛書方陣（8 1 6／3 5 7／4 9 2），任意三張和為 15 就是井字三連線。
     井字遊戲從空盤開始是和局，所以每一關都是「已經拿走幾張牌的必勝局面」；結束時畫面會把你們拿的牌放進洛書方陣，顯示成井字連線。
   · 關卡：開局固定是「各一張」，這樣的局面你一定要走 3 步（洛書）才贏，所以難度改看「第一步有幾張牌是好走法」：
     第 1～5 關 好走法有 3 張以上（隨便拿幾張都對）→ 第 6～12 關 2～3 張 → 第 13～20 關 1～2 張（要真的看出來）→
     第 21～25 關 改成「四張加起來剛好 20」（1～9，各一張開局只有 12 種，好走法都只有 1 張）→
     第 26～30 關 改成「三張加起來剛好 17」（1～11，好走法的上限從 9 張慢慢降到 2 張）。
   · 實作：不寫死策略，對「兩邊各拿了哪幾張」的局面做記憶化的完整搜尋（val）：回傳先手必勝／和局／必輸，以及要幾步（含手順）。
     出題從「你一張、電腦一張」的所有局面裡，挑出你必勝、而且第一步好走法張數落在這一關範圍內的。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'fifteen';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var VARIANTS = {
        luoshu: { N: 9, K: 3, T: 15, text: '三張牌加起來剛好 15', short: '三張加起來＝15' },
        four20: { N: 9, K: 4, T: 20, text: '四張牌加起來剛好 20', short: '四張加起來＝20' },
        eleven17: { N: 11, K: 3, T: 17, text: '三張牌加起來剛好 17（牌有 1～11）', short: '三張加起來＝17（牌 1～11）' }
    };
    var START_EACH = 1;                         /* 開局你和電腦各拿幾張（V1.43.1：各一張） */
    var STAGES = [                              /* to＝這個階段的最後一關；v＝玩法；g＝第一步好走法張數的範圍 [最少, 最多]；gTo＝階段最後一關的上限（有就逐關降） */
        { to: 5, v: 'luoshu', g: [3, 9] }, { to: 12, v: 'luoshu', g: [2, 3] }, { to: 20, v: 'luoshu', g: [1, 2] },
        { to: 25, v: 'four20', g: [1, 9] }, { to: 30, v: 'eleven17', g: [1, 9], gTo: 2 }
    ];
    var COMPUTER_THINK_MS = 800;
    var COMPUTER_SHOW_MS = 600;
    var PASS_DELAY_MS = 1500;
    var FAIL_HOLD_MS = 9000;
    var DRAW_SHOW_MS = 1200;                    /* 和局：先讓玩家看一下洛書方陣，再跳出「重新出題」 */
    var LOG_SHOW = 4;                           /* 畫面上留幾行過程記錄 */
    var MAX_LEVEL = 90;
    var LUOSHU = [8, 1, 6, 3, 5, 7, 4, 9, 2];   /* 洛書方陣：任一橫排、直行、對角線的三個數加起來都是 15 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    var cache = {};
    function prep(vk) {
        if (cache[vk]) return cache[vk];
        var V = VARIANTS[vk], cards = [], i;
        for (i = 1; i <= V.N; i++) cards.push(i);
        var wins = [];
        (function comb(s, acc) {
            if (acc.length === V.K) { if (acc.reduce(function (a, b) { return a + b; }, 0) === V.T) wins.push(acc.reduce(function (m, c) { return m | (1 << c); }, 0)); return; }
            for (var k = s; k < cards.length; k++) comb(k + 1, acc.concat(cards[k]));
        })(0, []);
        return (cache[vk] = { V: V, cards: cards, wins: wins, memo: {}, positions: null });
    }
    function hasWin(P, mask) { for (var i = 0; i < P.wins.length; i++) if ((mask & P.wins[i]) === P.wins[i]) return true; return false; }
    function winSetOf(P, mask) { for (var i = 0; i < P.wins.length; i++) if ((mask & P.wins[i]) === P.wins[i]) return P.wins[i]; return 0; }
    function maskToCards(m) { var o = []; for (var c = 1; c <= 15; c++) if (m & (1 << c)) o.push(c); return o; }
    /* val(A, B)：A（輪到的人）和 B（對方）各拿了哪些牌（位元遮罩）→ { r: 1 贏／0 和／-1 輸, d: 還要幾「手」（含雙方）} */
    function val(P, A, B) {
        var key = A * 4096 + B;
        if (key in P.memo) return P.memo[key];
        var bestWin = null, anyDraw = false, worst = null, free = 0;
        for (var i = 0; i < P.cards.length; i++) {
            var bit = 1 << P.cards[i];
            if ((A | B) & bit) continue;
            free++;
            if (hasWin(P, A | bit)) { bestWin = 1; continue; }
            var v = val(P, B, A | bit);
            if (v.r === -1) { var d = v.d + 1; bestWin = bestWin === null ? d : Math.min(bestWin, d); }
            else if (v.r === 0) anyDraw = true;
            else { var d2 = v.d + 1; worst = worst === null ? d2 : Math.max(worst, d2); }
        }
        var res;
        if (bestWin !== null) res = { r: 1, d: bestWin };
        else if (!free || anyDraw) res = { r: 0, d: 0 };
        else res = { r: -1, d: worst };
        return (P.memo[key] = res);
    }
    /* 所有「雙方輪流拿牌、還沒有人贏」的局面，其中輪到的人必勝的，依必勝步數（輪到的人自己要走幾步）分類 → positions[步數] = [{A, B, n（已拿幾張）}] */
    function positionsOf(vk) {
        var P = prep(vk);
        if (P.positions) return P.positions;
        var seen = {}, out = {};
        (function walk(A, B, n) {
            var key = A * 4096 + B;
            if (seen[key]) return; seen[key] = true;
            var v = val(P, A, B);
            if (v.r === 1) { var my = Math.ceil(v.d / 2); (out[my] = out[my] || []).push({ A: A, B: B, n: n }); }
            for (var i = 0; i < P.cards.length; i++) {
                var bit = 1 << P.cards[i];
                if ((A | B) & bit || hasWin(P, A | bit)) continue;
                walk(B, A | bit, n + 1);
            }
        })(0, 0, 0);
        return (P.positions = out);
    }
    /* 開局局面：你和電腦各 START_EACH 張、輪到你而且你必勝的所有擺法 → [{A, B, n, d（你要走幾步）, g（第一步的好走法有幾張）}] */
    function startsOf(vk) {
        var P = prep(vk);
        if (P.starts) return P.starts;
        var out = [];
        (function pick(A, B) {
            var na = bitCount(A), nb = bitCount(B);
            if (na < START_EACH || nb < START_EACH) {
                for (var c = 1; c <= P.V.N; c++) {
                    var bit = 1 << c; if ((A | B) & bit) continue;
                    if (na <= nb && na < START_EACH) pick(A | bit, B); else if (nb < START_EACH) pick(A, B | bit);
                }
                return;
            }
            if (hasWin(P, A) || hasWin(P, B)) return;
            var v = val(P, A, B);
            if (v.r === 1) out.push({ A: A, B: B, n: na + nb, d: Math.ceil(v.d / 2), g: goodMoves(vk, A, B).length });
        })(0, 0);
        /* 同一個局面會從不同拿牌順序重複走到，去掉重複 */
        var seen = {};
        return (P.starts = out.filter(function (p) { var k = p.A * 4096 + p.B; if (seen[k]) return false; seen[k] = true; return true; }));
    }
    function bitCount(m) { var n = 0; while (m) { n += m & 1; m >>= 1; } return n; }
    function specOf(level) {
        level = Math.max(1, level);
        var from = 1;
        for (var i = 0; i < STAGES.length; i++) {
            if (level <= STAGES[i].to || i === STAGES.length - 1) {
                var st = STAGES[i], gMax = st.g[1];
                if (st.gTo != null) gMax = Math.round(kit.ramp(Math.min(level, st.to) - from + 1, st.g[1], st.gTo, st.to - from + 1));
                return { v: st.v, gMin: st.g[0], gMax: gMax };
            }
            from = STAGES[i].to + 1;
        }
    }
    /* 出一關：{ v, A（你的牌）, B（電腦的牌）, n, d（你要走幾步）, g（第一步好走法張數）}；這個範圍沒有局面就挑最接近的 */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;
        var sp = specOf(level), all = startsOf(sp.v);
        var pool = all.filter(function (p) { return p.g >= sp.gMin && p.g <= sp.gMax; });
        if (!pool.length) {
            var best = 1e9;
            all.forEach(function (p) { var dist = p.g < sp.gMin ? sp.gMin - p.g : p.g - sp.gMax; if (dist < best) { best = dist; pool = [p]; } else if (dist === best) pool.push(p); });
        }
        var pick = kit.pick(pool, rand);
        return { v: sp.v, A: pick.A, B: pick.B, n: pick.n, d: pick.d, g: pick.g, level: level };
    }
    /* 你拿牌 c 之後的判定：{ win（你贏了）, keep（你還有必勝法）, reply（電腦的最佳防守，沒有就 0）} */
    function afterPlayer(vk, A, B, c) {
        var P = prep(vk), A2 = A | (1 << c);
        if (hasWin(P, A2)) return { win: true, keep: true, reply: 0, A2: A2 };
        var v = val(P, B, A2);                    /* 電腦輪到：電腦輸＝你還有必勝法 */
        if (v.r !== -1) return { win: false, keep: false, reply: 0, A2: A2 };
        return { win: false, keep: true, reply: computerPick(vk, A2, B), A2: A2 };
    }
    /* 電腦出手（在輸定的局面）：挑讓你「最久才贏」的那一張；同樣久就隨機 */
    function computerPick(vk, A, B, rand) {
        rand = rand || Math.random;
        var P = prep(vk), best = -1, pool = [];
        P.cards.forEach(function (c) {
            var bit = 1 << c; if ((A | B) & bit) return;
            var v = val(P, A, B | bit);          /* 輪到你 */
            var d = v.r === 1 ? v.d : (v.r === 0 ? 99 : 100);
            if (d > best) { best = d; pool = [c]; } else if (d === best) pool.push(c);
        });
        return kit.pick(pool, rand);
    }
    /* 電腦的一手（V1.43.0 起，你走錯之後遊戲繼續玩到結束）：能直接湊成就湊成；否則用 computerPick（優先讓你輸、其次和局、最後才讓你贏）。
       回傳 { c: 拿的牌, win: 拿了之後電腦湊成了嗎 }；桌上沒有牌了回傳 null */
    function computerMove(vk, A, B, rand) {
        var P = prep(vk), i, bit;
        for (i = 0; i < P.cards.length; i++) {
            bit = 1 << P.cards[i];
            if (!((A | B) & bit) && hasWin(P, B | bit)) return { c: P.cards[i], win: true };
        }
        for (i = 0; i < P.cards.length; i++) if (!((A | B) & (1 << P.cards[i]))) break;
        if (i >= P.cards.length) return null;
        return { c: computerPick(vk, A, B, rand), win: false };
    }
    /* 你有哪幾張牌是好的走法（拿了之後仍然必勝） */
    function goodMoves(vk, A, B) {
        var P = prep(vk), out = [];
        P.cards.forEach(function (c) { var bit = 1 << c; if ((A | B) & bit) return; var r = afterPlayer(vk, A, B, c); if (r.keep) out.push(c); });
        return out;
    }
    function rating(n) {
        if (n >= 25) return '搶十五高手！';
        if (n >= 12) return '你看穿洛書了！';
        if (n >= 5) return '越來越有感覺了！';
        return '想一想：1～9 擺成 3×3，三張和是 15 就是三連線！';
    }

    /* ═══ 畫面 ═══ */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var pz = makePuzzle(level, api.rand), vk = pz.v, P = prep(vk), V = P.V;
        api.info = pz;
        console.log('[搶十五] 第 ' + level + ' 關：' + V.text + '；你 ' + maskToCards(pz.A).join(',') + '／電腦 ' + maskToCards(pz.B).join(',') + '；必勝 ' + pz.d + ' 步，第一步好走法 ' + pz.g + ' 張');
        var A = pz.A, B = pz.B, sel = 0, busy = false, over = false;
        var mistake = null;                     /* 你第一次走錯（拿了之後就沒有必勝法）：{ before: {A, B}, c }，遊戲照樣玩到結束，最後才告訴你 */
        var winMask = 0;                        /* 湊成的那幾張牌（結束時標亮） */
        var auto = false;                       /* 驗證用：api.wrong 之後自動玩完這一局 */
        var logs = [];                          /* 過程記錄：一手一行，畫面上只留最後 LOG_SHOW 行 */

        var wrap = h('div', { 'class': 'fifteen-wrap' });
        var goal = h('div', { 'class': 'fifteen-goal' }, [h('div', { 'class': 'fifteen-goal__main', text: V.short }), h('div', { 'class': 'fifteen-goal__sub', text: '輪流各拿一張，先湊到的人贏' })]);
        var logBox = h('div', { 'class': 'fifteen-log' });
        var secret = h('div', { 'class': 'fifteen-secret' });                        /* 結束後的「小祕密」說明（洛書＝井字遊戲） */
        var cols = h('div', { 'class': 'fifteen-cols' });
        var mineBox = h('div', { 'class': 'fifteen-hand fifteen-hand--mine' }), theirBox = h('div', { 'class': 'fifteen-hand fifteen-hand--cpu' });
        var table = h('div', { 'class': 'fifteen-table' + (V.N > 9 ? ' fifteen-table--wide' : '') });
        var reveal = h('div', { 'class': 'fifteen-reveal' });                         /* 結束時放洛書方陣的地方 */
        var mid = h('div', { 'class': 'fifteen-mid' }, [table, reveal]);
        cols.appendChild(mineBox); cols.appendChild(mid); cols.appendChild(theirBox);
        var turn = h('div', { 'class': 'fifteen-turn' });
        var btns = h('div', { 'class': 'fifteen-btns' });
        var btnTake = h('button', { 'class': 'btn btn--primary fifteen-btn', type: 'button', text: '拿這張' });
        kit.onTap(btnTake, take);
        btns.appendChild(btnTake);
        wrap.appendChild(goal); wrap.appendChild(cols); wrap.appendChild(turn); wrap.appendChild(logBox); wrap.appendChild(secret); wrap.appendChild(btns);
        stage.appendChild(wrap);

        var tiles = {};
        P.cards.forEach(function (c) {
            var t = h('div', { 'class': 'fifteen-card', text: String(c) });
            kit.onTap(t, function () { choose(c); });
            tiles[c] = t; table.appendChild(t);
        });
        function sumOf(mask) { return maskToCards(mask).reduce(function (a, b) { return a + b; }, 0); }
        function listOf(mask) { return maskToCards(mask).join('、'); }
        function winText(mask) { return maskToCards(mask).join('＋') + '＝' + V.T; }
        function freeCount() { return P.cards.filter(function (c) { return !((A | B) & (1 << c)); }).length; }
        function yourTurnText() { return '輪到你：點一張牌，再按「拿這張」'; }

        /* 過程記錄：一手一行，最新的一行最黑（V1.43.0：玩家看不懂發生了什麼事，每一步都寫出來） */
        function addLog(text) { logs.push(text); paintLog(); }
        function paintLog() {
            logBox.innerHTML = '';
            logs.slice(-LOG_SHOW).forEach(function (t, i, arr) {
                logBox.appendChild(h('div', { 'class': 'fifteen-log__row' + (i === arr.length - 1 ? ' fifteen-log__row--new' : ''), text: t }));
            });
        }
        addLog(A | B
            ? '一開始已經被拿走：你拿了 ' + (A ? listOf(A) : '（沒有）') + '，電腦拿了 ' + (B ? listOf(B) : '（沒有）') + '。'
            : '一開始 ' + V.N + ' 張牌都還在桌上。');

        function paint() {
            P.cards.forEach(function (c) {
                var bit = 1 << c, cls = 'fifteen-card';
                if (A & bit) cls += ' fifteen-card--taken fifteen-card--mine';
                else if (B & bit) cls += ' fifteen-card--taken fifteen-card--theirs';
                if (winMask & bit) cls += ' fifteen-card--win';
                if (sel === c) cls += ' fifteen-card--sel';
                tiles[c].className = cls;
            });
            mineBox.innerHTML = ''; theirBox.innerHTML = '';
            mineBox.appendChild(h('div', { 'class': 'fifteen-hand__title', text: '你的牌' }));
            theirBox.appendChild(h('div', { 'class': 'fifteen-hand__title', text: '電腦的牌' }));
            maskToCards(A).forEach(function (c) { mineBox.appendChild(h('div', { 'class': 'fifteen-chip fifteen-chip--mine' + (winMask & (1 << c) ? ' fifteen-chip--win' : ''), text: String(c) })); });
            maskToCards(B).forEach(function (c) { theirBox.appendChild(h('div', { 'class': 'fifteen-chip fifteen-chip--cpu' + (winMask & (1 << c) ? ' fifteen-chip--win' : ''), text: String(c) })); });
            if (A) mineBox.appendChild(h('div', { 'class': 'fifteen-hand__sum', text: '合計 ' + sumOf(A) }));
            if (B) theirBox.appendChild(h('div', { 'class': 'fifteen-hand__sum', text: '合計 ' + sumOf(B) }));
            btnTake.textContent = sel ? '拿 ' + sel : '拿這張';
            btnTake.disabled = !sel || busy || over;
        }
        function choose(c) {
            if (busy || over || ((A | B) & (1 << c))) return;
            sel = sel === c ? 0 : c; paint();
        }
        /* 你拿一張：湊成了就贏；沒湊成就換電腦。走錯（拿了之後沒有必勝法）只記下來，照樣繼續玩到有人湊成或牌拿完 */
        function take() {
            if (!sel || busy || over) return;
            var c = sel, r = afterPlayer(vk, A, B, c), before = { A: A, B: B };
            if (!r.win && !r.keep && !mistake) mistake = { before: before, c: c };
            A = r.A2; sel = 0;
            addLog('你拿 ' + c + '，你的牌合計 ' + sumOf(A) + '。');
            if (r.win) {
                over = true; winMask = winSetOf(P, A); btns.style.display = 'none'; logBox.style.display = 'none'; paint();
                turn.textContent = '你湊成了：' + winText(winMask) + '，你贏了！';
                turn.classList.add('fifteen-turn--end');
                showBoard();
                kit.flash(stage, true, api.my); api.pass({ delay: PASS_DELAY_MS }); return;
            }
            if (!freeCount()) { paint(); finish('draw'); return; }
            busy = true; paint(); turn.textContent = '電腦思考中…';
            api.after(COMPUTER_THINK_MS, function () {
                var mv = computerMove(vk, A, B, api.rand);
                tiles[mv.c].classList.add('fifteen-card--cpu');
                turn.textContent = '電腦拿了 ' + mv.c;
                api.after(COMPUTER_SHOW_MS, function () {
                    B |= (1 << mv.c);
                    addLog('電腦拿 ' + mv.c + '，電腦的牌合計 ' + sumOf(B) + '。');
                    if (mv.win) { paint(); finish('cpu'); return; }
                    if (!freeCount()) { paint(); finish('draw'); return; }
                    busy = false; paint(); turn.textContent = yourTurnText();
                    if (auto) api.after(250, autoMove);
                });
            });
        }
        /* 一局結束但你沒贏：'cpu'＝電腦先湊成、'draw'＝牌拿完了沒有人湊成。說明結果，再告訴你哪一步是關鍵 */
        function finish(kind) {
            over = true; busy = true; btns.style.display = 'none'; logBox.style.display = 'none';
            if (kind === 'cpu') winMask = winSetOf(P, B);
            paint();
            var head = kind === 'cpu' ? '電腦先湊成了：' + winText(winMask) + '，電腦贏了。' : '牌都拿完了，沒有人湊成 ' + V.T + '，是和局。';
            var tip = '';
            if (mistake) {
                var good = goodMoves(vk, mistake.before.A, mistake.before.B);
                tip = '關鍵是你拿 ' + mistake.c + ' 的那一步：拿了之後就沒有必勝法了' + (good.length ? '，比較好的是拿 ' + good.join('、') + '。' : '。');
            }
            turn.textContent = head + tip;
            turn.classList.add('fifteen-turn--end');
            showBoard();
            if (kind === 'draw') {                 /* 和局不算失敗：說明哪一步可惜，按鈕後同一關重新出題 */
                api.my.after(DRAW_SHOW_MS, function () {
                    Dlg.open({
                        host: stage, cls: 'rx-passnext', title: '和局，不算失敗', text: head + tip + '同一關換一題，再來一次。',
                        buttons: [{ text: '重新出題', kind: 'primary', onClick: function () { api.redo(0); } }]
                    });
                });
                return;
            }
            kit.flash(stage, false, api.my);
            api.fail({ delay: FAIL_HOLD_MS, lines: [head + tip] });
        }
        /* 揭曉：玩法是洛書的話，把兩邊拿的牌放進洛書方陣，變成井字遊戲，並說明為什麼 */
        function showBoard() {
            reveal.innerHTML = '';
            if (vk !== 'luoshu') return;
            table.style.display = 'none';                  /* 洛書方陣取代桌上的牌，放在同一個位置 */
            var g = h('div', { 'class': 'fifteen-luoshu' });
            LUOSHU.forEach(function (c) {
                var bit = 1 << c, cls = 'fifteen-luoshu__cell' + (winMask & bit ? ' fifteen-luoshu__cell--win' : ''), mark = '';
                if (A & bit) mark = '○'; else if (B & bit) mark = '×';
                g.appendChild(h('div', { 'class': cls }, [h('span', { 'class': 'fifteen-luoshu__n', text: String(c) }), h('span', { 'class': 'fifteen-luoshu__m', text: mark })]));
            });
            reveal.appendChild(g);
            secret.textContent = '小祕密：把 1～9 照上面的方格擺好，三張和是 15 的牌剛好連成一直線，所以這就是井字遊戲（○你 ×電腦）。';
        }
        function autoMove() {                      /* 驗證用：隨便拿一張桌上的牌 */
            if (over || busy) return;
            var free = P.cards.filter(function (c) { return !((A | B) & (1 << c)); });
            if (free.length) { sel = free[0]; take(); }
        }
        api.solve = function () {                  /* 驗證用：走必勝的一張 */
            if (over || busy) return;
            var g = goodMoves(vk, A, B); if (!g.length) return; sel = g[0]; take();
        };
        api.wrong = function () {                  /* 驗證用：走一張會失去必勝的牌，之後自動亂拿到結束 */
            if (over || busy) return;
            var good = goodMoves(vk, A, B), bad = P.cards.filter(function (c) { return !((A | B) & (1 << c)) && good.indexOf(c) < 0; });
            auto = true; sel = bad.length ? bad[0] : good[0]; take();
        };
        api.state = function () { return { A: A, B: B, busy: busy, over: over, mistake: !!mistake }; };
        turn.textContent = yourTurnText();
        paint();
    }

    var G = {
        id: ID,
        name: '搶十五',
        rule: '桌上有 1～9 九張牌，**你和電腦一開始各已經拿了一張**，接著**兩個人輪流各拿一張，你先拿**。**誰先讓自己手上的三張牌加起來剛好 15，誰就贏**，例如你手上有 2 和 4，再拿 9：2＋4＋9＝15，你贏了！點一張牌，再按「拿這張」。電腦會擋你，也會搶著湊；畫面會一步一步寫出誰拿了什麼、合計多少，一直玩到有人湊成才結束；電腦先湊成就失敗，牌拿完了沒有人湊成是和局，**不算失敗，同一關重新出題**。每一關你都有必勝的走法，找找看！後面幾關規則會變（四張加起來 20、牌多到 11），結束後會告訴你一個小祕密。',
        mount: mount,
        score: SCORE,
        test: {
            VARIANTS: VARIANTS, STAGES: STAGES, prep: prep, hasWin: hasWin, val: val, positionsOf: positionsOf, startsOf: startsOf, START_EACH: START_EACH, specOf: specOf, makePuzzle: makePuzzle,
            afterPlayer: afterPlayer, computerPick: computerPick, computerMove: computerMove, goodMoves: goodMoves, maskToCards: maskToCards, rating: rating, LUOSHU: LUOSHU, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
