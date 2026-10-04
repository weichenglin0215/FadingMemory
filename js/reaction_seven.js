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

(function () {
    'use strict';

    var ID = 'seven';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var DWELL_START = 2.0;              /* 第 1 個數字的倒數秒數 */
    var DWELL_END = 0.8;                /* 最快的倒數秒數 */
    var RAMP_N = 60;                    /* 第 1 → RAMP_N 個數字線性變快 */
    var GAP_S = 0.15;                   /* 兩個數字之間的空檔（秒）*/
    var FAIL_SHOW_MS = 2200;            /* 失敗後停多久才跳結算 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function isSkip(n) { return n % 7 === 0 || String(n).indexOf('7') >= 0; }
    function dwellFor(n) { return kit.ramp(n, DWELL_START, DWELL_END, RAMP_N); }
    /* 為什麼要跳過 */
    function skipReason(n) {
        if (n % 7 === 0) return n + ' 是 7 的 ' + (n / 7) + ' 倍';
        return n + ' 裡面有 7';
    }
    /* kind：'wrongTap'＝該跳過的點了數字；'wrongSkip'＝該點的按了跳過；'late'＝時間到沒按 */
    function why(n, kind) {
        if (kind === 'wrongTap') return skipReason(n) + '，要按「跳過」';
        if (kind === 'wrongSkip') return n + ' 不是 7、也不是 7 的倍數、裡面也沒有 7，要點數字';
        return n + (isSkip(n) ? ' 要按「跳過」' : ' 要點數字') + '，來不及了';
    }
    function rating(n) {
        if (n >= 60) return '反應神速！';
        if (n >= 35) return '穩得住！';
        if (n >= 15) return '不錯喔！';
        return '再試一次，會更遠！';
    }
    function fmtSec(s) { return s.toFixed(3) + ' 秒'; }

    function mount(root, ctx) {
        var R = null;

        /* startAt：從第幾個數字開始（失敗後可從前 5 個繼續）*/
        function round(startAt) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            var n = (startAt || 1) - 1, passed = n, state = 'idle', token = 0, shownAt = 0, deadline = 0, rts = [], over = false;
            var head = h('div', { 'class': 'sv-head', text: '7、7 的倍數、有 7 的要「跳過」' });
            var sub = h('div', { 'class': 'sv-sub', text: ' ' });
            var num = h('div', { 'class': 'sv-num', text: '' });
            var card = h('div', { 'class': 'sv-card' }, [num]);
            var tb = kit.timebar();
            var skip = h('div', { 'class': 'sv-pad sv-pad--skip' }, [h('span', { 'class': 'sv-pad__t', text: '跳過' })]);
            [head, sub, card, tb.el, skip].forEach(function (x) { root.appendChild(x); });
            ctx.setMeta(Reaction.getBest(ID) != null ? '最佳 ' + Reaction.getBest(ID) : '');

            function nextNumber() {
                if (my.dead || over) return;
                n++;
                var id = ++token, dwell = dwellFor(n), sk = isSkip(n);
                num.textContent = String(n);
                card.className = 'sv-card';
                sub.textContent = '已過 ' + passed + ' 個';
                state = 'live';
                shownAt = performance.now(); deadline = shownAt + dwell * 1000;
                tb.set(1);
                try { console.info('[逢七過] ' + n + '：' + (sk ? '要跳過（' + skipReason(n) + '）' : '要點數字') + '，倒數 ' + dwell.toFixed(3) + ' 秒'); } catch (e) { }
                my.loop(function (now) {
                    if (id !== token || state !== 'live') return false;
                    tb.set((deadline - now) / (dwell * 1000));
                });
                my.after(dwell * 1000, function () { if (id === token && state === 'live') fail('late'); });
            }

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

            /* act：'tap'＝點上面的數字格子；'skip'＝按下面的「跳過」*/
            function act(what, e) {
                if (e) e.preventDefault();
                if (state !== 'live') return;           /* 空檔、等待中、已結束的點擊都不算 */
                var now = performance.now();
                var want = isSkip(n) ? 'skip' : 'tap';
                if (what !== want) { fail(what === 'tap' ? 'wrongTap' : 'wrongSkip'); return; }
                rts.push((now - shownAt) / 1000);
                passIt(what);
            }
            card.addEventListener('pointerdown', function (e) { act('tap', e); });
            skip.addEventListener('pointerdown', function (e) { act('skip', e); });

            G.debug = {
                state: function () { return { n: n, passed: passed, state: state, over: over, skip: isSkip(n), rts: rts.slice() }; },
                tap: function () { act('tap'); },
                skip: function () { act('skip'); },
                right: function () { act(isSkip(n) ? 'skip' : 'tap'); }
            };
            my.after(600, nextNumber);
        }

        round(1);
    }

    var G = {
        id: ID,
        name: '逢七過',
        rule: '上面的數字會一個一個往上加。普通的數字要點上面的數字格子；遇到 7、7 的倍數（14、21、28…），或是數字裡有 7（17、27、70～79…），要按下面的「跳過」。每個數字都有倒數，越後面越短。錯一次就結束，看你能數到幾！',
        mount: mount,
        test: { isSkip: isSkip, dwellFor: dwellFor, skipReason: skipReason, why: why, rating: rating, DWELL_START: DWELL_START, DWELL_END: DWELL_END, RAMP_N: RAMP_N }
    };
    Reaction.register(G);
})();
