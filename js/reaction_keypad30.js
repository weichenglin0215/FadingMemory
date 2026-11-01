/* ═══════════════════════════════════════════════════════════════════
   reaction_keypad30.js — 秒反應・按鍵搶三十（原創篇 582「按鍵搶三十」）
   樣式：css/games/reaction_keypad30.css（class 一律以「keypad30-」開頭）
   ───────────────────────────────────────────────────────────────────
   · 玩法：一台計算機，螢幕上是目前的數字。你和電腦輪流按一個數字鍵（1～9），按的數字加到螢幕上；
     **下一個人只能按「上一個鍵」的上下左右鄰居**（按了 5，下一個人只能按 2、4、6、8；鍵盤排法跟計算機一樣，7 8 9 在最上面）。
     **剛好湊到目標（例如 30）的人贏**；輪到你時，能按的鍵都會超過目標＝沒有鍵可以按，就輸了。
   · 每一關是一個「輪到你、而且你有必勝走法」的局面；電腦每一步都走得很準。**你走錯一步（讓電腦有辦法一定贏），這一關就結束**，
     並把剛才那個局面的每個鍵標成「按了必勝／按了會輸」。
   · 頓悟：倒推——先找「輪到對手時，他怎麼按都輸」的螢幕數字＋上一鍵；不是每次按最大的就好（會被逼到沒鍵可按）。
   · 關卡：目標 20、25（第 1～8 關）→ 30（第 9～16 關）→ 35（第 17～24 關）→ 第 25 關起從 0 開始整盤（目標 30、35、40 隨機）。
     殘局的「必勝步數」（你要按幾次才贏，電腦盡量拖）從 1 步走到 5 步（線性）；2 步以上的局面「按最大的鍵」一定不是必勝走法。
     實測（note/原創篇實驗/exp_impl8.cjs ④）：目標 30 時先手第一鍵只有按 1、3、9 才必勝，最快 4 步；目標 20～40 從 0 開始先手都必勝。
   · 實作：狀態只有「螢幕數字 × 上一鍵」（最多 41×10 種），用記憶化的完整搜尋算每個局面的勝負與步數，不寫死答案。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'keypad30';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var STAGES = [                              /* to＝這個階段的最後一關；targets＝目標從這些挑；full＝從 0 開始整盤 */
        { to: 8, targets: [20, 25], full: false },
        { to: 16, targets: [30], full: false },
        { to: 24, targets: [35], full: false },
        { to: 9999, targets: [30, 35, 40], full: true }
    ];
    var RAMP_LEVELS = 24;                       /* 殘局的必勝步數走幾關到頂 */
    var DEPTH = [1, 5];                         /* 殘局的必勝步數：第 1 關 → 到頂 */
    var COMPUTER_THINK_MS = 900;                /* 電腦「思考」多久才按 */
    var PASS_DELAY_MS = 1500;
    var FAIL_HOLD_MS = 6500;
    var MAX_LEVEL = 90;
    var LAYOUT = [7, 8, 9, 4, 5, 6, 1, 2, 3];   /* 計算機的鍵盤排法（由上而下、由左而右） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function stageOf(level) { level = Math.max(1, level); for (var i = 0; i < STAGES.length; i++) if (level <= STAGES[i].to || i === STAGES.length - 1) return STAGES[i]; }
    var NB = (function () {                     /* 每個鍵的上下左右鄰居 */
        var pos = {}, out = {}, a, b;
        LAYOUT.forEach(function (k, i) { pos[k] = [Math.floor(i / 3), i % 3]; });
        for (a = 1; a <= 9; a++) { out[a] = []; for (b = 1; b <= 9; b++) if (Math.abs(pos[a][0] - pos[b][0]) + Math.abs(pos[a][1] - pos[b][1]) === 1) out[a].push(b); }
        return out;
    })();
    /* 輪到的人現在可以按哪些鍵（last＝0 表示還沒有人按過，九個鍵都可以） */
    function legalKeys(sum, last, target) { return (last ? NB[last] : [1, 2, 3, 4, 5, 6, 7, 8, 9]).filter(function (k) { return sum + k <= target; }); }
    /* 局面的完整搜尋：輪到的人 { win：有沒有必勝, plies：雙方都走最好時，還要按幾下才分勝負（兩人合計） }
       贏的一方挑最快贏的、輸的一方挑撐最久的；沒有鍵可按＝輸、0 下 */
    var memo = {};
    function solveState(sum, last, target) {
        var key = target + ':' + sum + ':' + last;
        if (key in memo) return memo[key];
        var keys = legalKeys(sum, last, target), i, bestWin = Infinity, worstLose = 0;
        if (!keys.length) return (memo[key] = { win: false, plies: 0 });
        for (i = 0; i < keys.length; i++) if (sum + keys[i] === target) return (memo[key] = { win: true, plies: 1 });
        for (i = 0; i < keys.length; i++) {
            var ch = solveState(sum + keys[i], keys[i], target);
            if (!ch.win) bestWin = Math.min(bestWin, ch.plies + 1); else worstLose = Math.max(worstLose, ch.plies + 1);
        }
        return (memo[key] = bestWin < Infinity ? { win: true, plies: bestWin } : { win: false, plies: worstLose });
    }
    /* 局面的值：>0＝輪到的人必勝，數字是「自己最少要按幾下才贏」；<0＝必輸，−（自己最多還能按幾下＋1） */
    function value(sum, last, target) {
        var r = solveState(sum, last, target);
        return r.win ? (r.plies + 1) / 2 : -(Math.floor(r.plies / 2) + 1);
    }
    /* 按這個鍵之後是不是必勝（剛好湊到目標，或讓對手必輸） */
    function isWinningKey(sum, last, target, k) { return sum + k === target || value(sum + k, k, target) < 0; }
    function winningKeys(sum, last, target) { return legalKeys(sum, last, target).filter(function (k) { return isWinningKey(sum, last, target, k); }); }
    /* 電腦按哪一鍵：贏得了就挑最快贏的；輸定了就挑撐最久的（同樣好的隨機挑） */
    function computerKey(sum, last, target, rand) {
        rand = rand || Math.random;
        var keys = legalKeys(sum, last, target), best = [], bestScore = -Infinity;
        keys.forEach(function (k) {
            var sc;
            if (sum + k === target) sc = 1000;
            else { var ch = solveState(sum + k, k, target); sc = !ch.win ? 500 - ch.plies : ch.plies; }      /* 讓對手必輸：越快分勝負越好；否則：讓對手越晚贏越好 */
            if (sc > bestScore) { bestScore = sc; best = [k]; } else if (sc === bestScore) best.push(k);
        });
        return best.length ? kit.pick(best, rand) : 0;
    }
    /* 出一關：{ target, sum, last }——輪到玩家，而且玩家必勝 */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;
        var st = stageOf(level), target = kit.pick(st.targets, rand);
        if (st.full) return { target: target, sum: 0, last: 0, depth: value(0, 0, target) };
        var want = Math.round(kit.ramp(level, DEPTH[0], DEPTH[1], RAMP_LEVELS)), pool = [], best = Infinity;
        for (var s = 1; s < target; s++) for (var l = 1; l <= 9; l++) {
            var v = value(s, l, target);
            if (v <= 0 || s < l) continue;
            if (v >= 2) {                         /* 2 步以上：按最大的鍵不能剛好是必勝走法 */
                var keys = legalKeys(s, l, target), big = Math.max.apply(null, keys);
                if (isWinningKey(s, l, target, big)) continue;
            }
            var d = Math.abs(v - want);
            if (d < best) { best = d; pool = []; }
            if (d === best) pool.push({ target: target, sum: s, last: l, depth: v });
        }
        return kit.pick(pool, rand);
    }
    function rating(n) {
        if (n >= 25) return '計算機軍師！';
        if (n >= 12) return '倒推得很準！';
        if (n >= 5) return '越來越有感覺了！';
        return '從目標往回想：讓電腦怎麼按都湊不到、又沒鍵可按！';
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
        var pz = makePuzzle(level, api.rand), T = pz.target;
        api.info = pz;
        console.log('[按鍵搶三十] 第 ' + level + ' 關：目標 ' + T + '，從 ' + pz.sum + (pz.last ? '（上一鍵 ' + pz.last + '）' : '') + ' 開始，必勝 ' + pz.depth + ' 步');
        var sum = pz.sum, last = pz.last, busy = false, over = false, tape = [];

        var wrap = h('div', { 'class': 'keypad30-wrap' });
        var goal = h('div', { 'class': 'keypad30-goal', text: '剛好湊到 ' + T + ' 的人贏' });
        var calc = h('div', { 'class': 'keypad30-calc' });
        var lcd = h('div', { 'class': 'keypad30-lcd' });
        var lcdNum = h('div', { 'class': 'keypad30-lcd__num' });
        var lcdGoal = h('div', { 'class': 'keypad30-lcd__goal', text: '／' + T });
        lcd.appendChild(lcdNum); lcd.appendChild(lcdGoal);
        var pad = h('div', { 'class': 'keypad30-pad' });
        var keyEls = {};
        LAYOUT.forEach(function (k) {
            var b = h('button', { 'class': 'keypad30-key', type: 'button' }, [h('span', { 'class': 'keypad30-key__n', text: String(k) }), h('span', { 'class': 'keypad30-key__tag' })]);
            kit.onTap(b, function () { press(k); });
            pad.appendChild(b); keyEls[k] = b;
        });
        calc.appendChild(lcd); calc.appendChild(pad);
        var turn = h('div', { 'class': 'keypad30-turn' });
        var tapeEl = h('div', { 'class': 'keypad30-tape' });
        wrap.appendChild(goal); wrap.appendChild(calc); wrap.appendChild(turn); wrap.appendChild(tapeEl);
        stage.appendChild(wrap);
        if (pz.last) tape.push('（已經按到 ' + pz.sum + '，上一鍵 ' + pz.last + '）');

        function paint() {
            lcdNum.textContent = String(sum);
            var legal = legalKeys(sum, last, T);
            LAYOUT.forEach(function (k) {
                var cls = 'keypad30-key';
                if (k === last) cls += ' keypad30-key--last';
                if (legal.indexOf(k) < 0 || busy || over) cls += ' keypad30-key--off';
                keyEls[k].className = cls + (keyEls[k].dataset.mark ? ' keypad30-key--' + keyEls[k].dataset.mark : '');
            });
            tapeEl.textContent = tape.join('　');
        }
        function setTurn() {
            if (over) return;
            var legal = legalKeys(sum, last, T);
            turn.textContent = busy ? '電腦思考中…' : last ? '輪到你：只能按 ' + legal.join('、') + (legal.length < NB[last].length ? '（其他會超過 ' + T + '）' : '') : '輪到你：九個鍵都可以按';
        }
        function press(k) {
            if (busy || over) return;
            var legal = legalKeys(sum, last, T);
            if (legal.indexOf(k) < 0) { turn.textContent = last ? '只能按 ' + NB[last].join('、') + ' 裡面不超過 ' + T + ' 的' : '這個鍵會超過 ' + T; return; }
            var before = { sum: sum, last: last };
            sum += k; last = k; tape.push('你 ' + k);
            if (sum === T) { over = true; paint(); turn.textContent = '剛好 ' + T + '，你贏了！'; kit.flash(stage, true, api.my); api.pass({ delay: PASS_DELAY_MS }); return; }
            if (value(sum, last, T) > 0) { failWith(before, k); return; }        /* 走錯了：換電腦時它有必勝走法 */
            busy = true; paint(); setTurn();
            api.after(COMPUTER_THINK_MS, computerTurn);
        }
        function computerTurn() {
            var k = computerKey(sum, last, T, api.rand);
            busy = false;
            if (!k) { over = true; paint(); turn.textContent = '電腦沒有鍵可以按（都會超過 ' + T + '），你贏了！'; kit.flash(stage, true, api.my); api.pass({ delay: PASS_DELAY_MS }); return; }
            sum += k; last = k; tape.push('電腦 ' + k);
            keyEls[k].classList.add('keypad30-key--cpu');
            paint(); setTurn();
            if (!legalKeys(sum, last, T).length) {      /* 照理不會發生：玩家在必勝局面不會被逼到沒鍵可按 */
                over = true; turn.textContent = '你沒有鍵可以按了'; kit.flash(stage, false, api.my); api.fail({ delay: FAIL_HOLD_MS, lines: ['沒有鍵可以按'] }); return;
            }
        }
        /* 失敗：把剛才那個局面每個能按的鍵標成「必勝」（綠）或「會輸」（紅） */
        function failWith(before, k) {
            over = true;
            var good = winningKeys(before.sum, before.last, T);
            legalKeys(before.sum, before.last, T).forEach(function (q) { keyEls[q].dataset.mark = good.indexOf(q) >= 0 ? 'good' : 'bad'; keyEls[q].querySelector('.keypad30-key__tag').textContent = good.indexOf(q) >= 0 ? '必勝' : '會輸'; });
            paint();
            var text = '按 ' + k + ' 到 ' + sum + ' 之後，電腦有辦法一定贏。' + (good.length ? '剛才要按 ' + good.join(' 或 ') + ' 才對。' : '');
            turn.textContent = text;
            kit.flash(stage, false, api.my);
            api.fail({ delay: FAIL_HOLD_MS, lines: [text] });
        }
        api.solve = function () { if (busy || over) return; var g = winningKeys(sum, last, T); if (g.length) press(g[0]); };
        api.wrong = function () {
            if (busy || over) return;
            var bad = legalKeys(sum, last, T).filter(function (k) { return !isWinningKey(sum, last, T, k); });
            if (bad.length) press(bad[0]);
        };
        api.state = function () { return { sum: sum, last: last, busy: busy, over: over }; };
        paint(); setTurn();
    }

    var G = {
        id: ID,
        name: '按鍵搶三十',
        rule: '計算機的螢幕上是目前的數字。你和電腦輪流按一個數字鍵，**按的數字加到螢幕上**；**下一個人只能按上一個鍵的上下左右鄰居**（按了 5，下一個人只能按 2、4、6、8）。**剛好湊到目標的人贏**；輪到你時能按的鍵都會超過目標，就輸了。每一關你都有必勝的按法，電腦每一步都很準；**你按錯一步就結束**，會告訴你剛才該按哪一鍵。',
        mount: mount,
        score: SCORE,
        test: {
            stageOf: stageOf, NB: NB, legalKeys: legalKeys, solveState: solveState, value: value, isWinningKey: isWinningKey, winningKeys: winningKeys, computerKey: computerKey,
            makePuzzle: makePuzzle, rating: rating, STAGES: STAGES, RAMP_LEVELS: RAMP_LEVELS, DEPTH: DEPTH, LAYOUT: LAYOUT, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
