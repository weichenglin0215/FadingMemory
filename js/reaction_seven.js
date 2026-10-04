/* ═══════════════════════════════════════════════════════════════════
   reaction_seven.js — 秒反應・逢七過
   上面的格子顯示的數字一個一個往上加。不是 7、也不是 7 的倍數、數字裡也沒有 7 的，要點上面的數字格子；
   遇到 7、7 的倍數（14、21、28、35、42、49、56、63…）或是數字裡有 7（17、27、37、47、57、67、70～79、87、97…）的，
   要按下面的「跳過」鈕。錯一次就結束，看你能數到幾。
   ───────────────────────────────────────────────────────────────────
   · 判定（isSkip）：n % 7 === 0 或 n 的十進位寫法含有 7 ＝ 要跳過；其他都要點數字。
     例：7、14、17、21、27、28、35、37、42、47、49、56、57、63、67、70～79、84、87、91、97、98 …
   · 每個數字有自己的倒數條（DWELL_START → DWELL_END 秒，第 1 → RAMP_N 個數字線性變快，之後維持最快）：
     時間到還沒按（點或跳過都沒按）＝ 失敗。按錯（該跳過的點了數字、該點的按了跳過）＝ 失敗。
   · 兩個數字之間有 GAP_S 秒的空檔，空檔裡的點擊不算（避免連點誤觸下一個數字）。
   · 成績：通過的最大數字（越大越好）。pointerdown 判定，計時用 performance.now（rAF 被暫停時有 setTimeout 後備）。
   · 失敗後可以從「失敗數字 − 5」繼續（kit.resumeFrom）。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'seven';
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    var DWELL_START = 2.0;              /* 第 1 個數字的倒數秒數 */
    var DWELL_END = 0.8;                /* 最快的倒數秒數 */
    var RAMP_N = 60;                    /* 第 1 → RAMP_N 個數字線性變快 */
    var GAP_S = 0.15;                   /* 兩個數字之間的空檔（秒）*/
    var FAIL_SHOW_MS = 2200;            /* 失敗後停多久才跳結算 */

    /* 純函式（也給 Node 測試用） */
    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 要不要跳過：n % 7 === 0（是 7 的倍數，% 是取餘數）或者把數字變成字串後含有 '7' */
    function isSkip(n) { return n % 7 === 0 || String(n).indexOf('7') >= 0; }
    /* 每個數字的倒數秒數：第 1 個 2.0 秒，線性縮短到第 60 個的 0.8 秒 */
    function dwellFor(n) { return kit.ramp(n, DWELL_START, DWELL_END, RAMP_N); }
    /* 為什麼要跳過（失敗時顯示） */
    /* 為什麼要跳過 */
    function skipReason(n) {
        if (n % 7 === 0) return n + ' 是 7 的 ' + (n / 7) + ' 倍';
        return n + ' 裡面有 7';
    }
    /* 失敗原因的說明：kind 為 wrongTap（該跳過卻點了數字）、wrongSkip（該點卻按了跳過）、late（來不及） */
    /* kind：'wrongTap'＝該跳過的點了數字；'wrongSkip'＝該點的按了跳過；'late'＝時間到沒按 */
    function why(n, kind) {
        if (kind === 'wrongTap') return skipReason(n) + '，要按「跳過」';
        if (kind === 'wrongSkip') return n + ' 不是 7、也不是 7 的倍數、裡面也沒有 7，要點數字';
        return n + (isSkip(n) ? ' 要按「跳過」' : ' 要點數字') + '，來不及了';
    }
    /* 依通過的數字給評語 */
    function rating(n) {
        if (n >= 60) return '反應神速！';
        if (n >= 35) return '穩得住！';
        if (n >= 15) return '不錯喔！';
        return '再試一次，會更遠！';
    }
    /* 把秒數格式化成 X.XXX 秒 */
    function fmtSec(s) { return s.toFixed(3) + ' 秒'; }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        var R = null;

        /* startAt：從第幾個數字開始（失敗後可從前 5 個繼續）*/
        /* round：開一局（失敗後可從失敗數字前 5 個繼續） */
        function round(startAt) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            /* n 目前的數字；passed 已通過的最大數字；state 目前階段（live 等待玩家/gap 兩數字之間的空檔/over 結束）；token 每個數字 +1；shownAt／deadline 這個數字出現／截止的時間；rts 每次的反應秒數 */
            var n = (startAt || 1) - 1, passed = n, state = 'idle', token = 0, shownAt = 0, deadline = 0, rts = [], over = false;
            /* 建立畫面元素：標題、說明、數字卡片、時間條、「跳過」按鈕 */
            var head = h('div', { 'class': 'sv-head', text: '7、7 的倍數、有 7 的要「跳過」' });
            var sub = h('div', { 'class': 'sv-sub', text: ' ' });
            var num = h('div', { 'class': 'sv-num', text: '' });
            var card = h('div', { 'class': 'sv-card' }, [num]);
            var tb = kit.timebar();
            var skip = h('div', { 'class': 'sv-pad sv-pad--skip' }, [h('span', { 'class': 'sv-pad__t', text: '跳過' })]);
            [head, sub, card, tb.el, skip].forEach(function (x) { root.appendChild(x); });
            ctx.setMeta(Reaction.getBest(ID) != null ? '最佳 ' + Reaction.getBest(ID) : '');

            /* 出下一個數字 */
            function nextNumber() {
                if (my.dead || over) return;
                n++;
                /* dwell 這個數字的倒數秒數；sk 這個數字要不要跳過 */
                var id = ++token, dwell = dwellFor(n), sk = isSkip(n);
                num.textContent = String(n);
                card.className = 'sv-card';
                sub.textContent = '已過 ' + passed + ' 個';
                state = 'live';
                shownAt = performance.now(); deadline = shownAt + dwell * 1000;
                tb.set(1);
                /* 主控台印出這個數字應該怎麼做與倒數時間，方便驗證 */
                try { console.info('[逢七過] ' + n + '：' + (sk ? '要跳過（' + skipReason(n) + '）' : '要點數字') + '，倒數 ' + dwell.toFixed(3) + ' 秒'); } catch (e) { }
                /* 倒數條 */
                my.loop(function (now) {
                    if (id !== token || state !== 'live') return false;
                    tb.set((deadline - now) / (dwell * 1000));
                });
                /* 時間到沒按 → 失敗 */
                my.after(dwell * 1000, function () { if (id === token && state === 'live') fail('late'); });
            }

            /* 通過這個數字：稍後出下一個 */
            function passIt(acted) {
                state = 'gap';
                passed = n;
                token++;
                tb.set(0);
                card.className = 'sv-card sv-card--ok';
                Sfx.play(acted === 'skip' ? 'pop' : 'click');
                var best = Reaction.getBest(ID);
                ctx.setMeta(kit.meta(['已過 ' + passed, best != null ? '最佳 ' + best : '']));
                my.after(GAP_S * 1000, nextNumber);
            }

            /* 失敗：顯示原因，結算時給「從失敗數字 − 5 繼續」的選項 */
            function fail(kind) {
                if (over) return;
                over = true; state = 'over'; token++;
                tb.set(0);
                card.className = 'sv-card sv-card--bad';
                var msg = why(n, kind);
                sub.textContent = msg;
                Sfx.play('bad');
                var isNew = Reaction.setBest(ID, passed, function (v, b) { return v > b; });
                var failN = n, back = kit.resumeFrom(failN);
                my.after(FAIL_SHOW_MS, function () {
                    var avg = rts.length ? rts.reduce(function (a, b) { return a + b; }, 0) / rts.length : null;
                    kit.result(root, {
                        num: String(passed), label: rating(passed),
                        lines: [msg].concat(avg != null ? ['答對的平均反應 ' + fmtSec(avg)] : []),
                        isNew: isNew && passed > 0, sfx: passed >= 15 ? 'win' : 'fail',
                        onAgain: function () { round(1); },
                        resume: { level: back, run: function () { round(back); } }
                    });
                });
            }

            /* act：玩家的動作——what 是 'tap'（點上面數字）或 'skip'（按下面跳過），判斷是否和正確動作一致 */
            /* act：'tap'＝點上面的數字格子；'skip'＝按下面的「跳過」*/
            function act(what, e) {
                if (e) e.preventDefault();
                /* 空檔、等待中、已結束的點擊都不算 */
                if (state !== 'live') return;           /* 空檔、等待中、已結束的點擊都不算 */
                var now = performance.now();
                var want = isSkip(n) ? 'skip' : 'tap';
                if (what !== want) { fail(what === 'tap' ? 'wrongTap' : 'wrongSkip'); return; }
                rts.push((now - shownAt) / 1000);
                passIt(what);
            }
            /* 上面的數字卡片：pointerdown＝點數字 */
            card.addEventListener('pointerdown', function (e) { act('tap', e); });
            /* 下面的跳過鈕：pointerdown＝跳過 */
            skip.addEventListener('pointerdown', function (e) { act('skip', e); });

            /* G.debug：測試用後門 */
            G.debug = {
                state: function () { return { n: n, passed: passed, state: state, over: over, skip: isSkip(n), rts: rts.slice() }; },
                tap: function () { act('tap'); },
                skip: function () { act('skip'); },
                right: function () { act(isSkip(n) ? 'skip' : 'tap'); }
            };
            /* 開場等 600 毫秒再出第一個數字 */
            my.after(600, nextNumber);
        }

        round(1);
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '逢七過',
        rule: '上面的數字會一個一個往上加。普通的數字要點上面的數字格子；遇到 7、7 的倍數（14、21、28…），或是數字裡有 7（17、27、70～79…），要按下面的「跳過」。每個數字都有倒數，越後面越短。錯一次就結束，看你能數到幾！',
        mount: mount,
        /* test 匯出純函式給 Node 自動測試 */
        test: { isSkip: isSkip, dwellFor: dwellFor, skipReason: skipReason, why: why, rating: rating, DWELL_START: DWELL_START, DWELL_END: DWELL_END, RAMP_N: RAMP_N }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();
