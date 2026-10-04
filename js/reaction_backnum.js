/* ═══════════════════════════════════════════════════════════════════
   reaction_backnum.js — 秒反應・倒背數字（原「倒背電話」）
   3×3 九宮格（數字 1～9）。先看格子依序發亮，再「倒著」把順序按回去：
   例如亮 1、2、3，就要按 3、2、1。看你能過第幾關。
   ───────────────────────────────────────────────────────────────────
   · 第 1 關亮 3 個，之後每關多 1 個（SEQ_START＋關數−1）。
   · 每一關可以錯 chances(level) 次：第 1 關 1 次，之後每 3 關多 1 次（第 4 關 2 次、第 7 關 3 次…）。
     錯的次數超過機會就失敗。發生錯誤時，用「同一組數字」再亮一次，加強記憶，然後重新輸入。
   · 一開始先用很大的字提醒「倒著順序按數字」。
   · 亮燈順序隨機，相鄰兩個不會是同一格（超過 9 個時格子會重複出現，但不會連續相同）。
   · 亮燈速度隨關卡線性加快（每格亮 LIT_START → LIT_END 秒）。
   · 成績＝通過關數（越多越好）。流程用 setTimeout 排程，不靠 rAF。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'backnum';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var SEQ_START = 3;            /* 第 1 關要記幾個 */
    var CHANCE_EVERY = 3;         /* 每幾關多一次錯誤機會 */
    var RAMP = 15;                /* 亮燈速度走完的關卡 */
    var LIT_START = 0.7, LIT_END = 0.45;    /* 每格亮多久（秒） */
    var GAP_S = 0.25;             /* 兩格之間的空檔（秒） */
    var SPLASH_MS = 2400;         /* 開場大字提醒停多久 */
    var CLEAR_MS = 900;
    var REPLAY_MS = 1100;         /* 答錯後多久再亮一次 */

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 關'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function seqLen(level) { return SEQ_START + level - 1; }
    function chances(level) { return 1 + Math.floor((level - 1) / CHANCE_EVERY); }
    function litSec(level) { return kit.ramp(level, LIT_START, LIT_END, RAMP); }
    /* 亮燈順序：每格 1～9，相鄰不同；長度 ≤ 9 時盡量不重複（用洗牌取前 L 個） */
    function makeSeq(L, rand) {
        rand = rand || Math.random;
        var nums = [1, 2, 3, 4, 5, 6, 7, 8, 9], out = [];
        if (L <= 9) return kit.shuffle(nums, rand).slice(0, L);
        while (out.length < L) {
            var n = kit.pick(nums, rand);
            if (out.length && out[out.length - 1] === n) continue;
            out.push(n);
        }
        return out;
    }
    function reversed(seq) { return seq.slice().reverse(); }

    function mount(root, ctx) {
        var R = null;

        /* startAt：從第幾關開始（失敗後可從前 5 關繼續）*/
        function round(startAt) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            var level = startAt || 1, cleared = level - 1, newRec = false, state = 'idle', errors = 0, seq = [], want = [], idx = 0, runId = 0;
            var head = h('div', { 'class': 'bn-head' });
            var banner = h('div', { 'class': 'bn-banner' });
            var grid = h('div', { 'class': 'bn-grid' });
            var splash = h('div', { 'class': 'bn-splash' }, [h('div', { 'class': 'bn-splash__big', text: '倒著順序' }), h('div', { 'class': 'bn-splash__big', text: '按數字！' }), h('div', { 'class': 'bn-splash__small', text: '例如亮 1、2、3，就要按 3、2、1' })]);
            var cells = [];
            for (var n = 1; n <= 9; n++) {
                (function (n) {
                    var el = h('button', { 'class': 'bn-cell', text: String(n) });
                    el.addEventListener('pointerdown', function (e) { e.preventDefault(); tap(n); });
                    cells[n] = el;
                    grid.appendChild(el);
                })(n);
            }
            [head, banner, grid].forEach(function (x) { root.appendChild(x); });
            root.appendChild(splash);

            function meta() { ctx.setMeta(kit.meta(['第 ' + level + ' 關', fmtBest(Reaction.getBest(ID))])); }
            function paintHead() {
                head.textContent = '第 ' + level + ' 關・' + seqLen(level) + ' 個數字・還能錯 ' + Math.max(0, chances(level) - errors) + ' 次';
            }
            function setBanner(text, cls) { banner.textContent = text; banner.className = 'bn-banner' + (cls ? ' bn-banner--' + cls : ''); }

            function flash(n, cls, ms) {
                var el = cells[n];
                el.classList.add(cls);
                my.after(ms, function () { el.classList.remove(cls); });
            }

            /* 播放亮燈順序（使用同一組 seq），播完進入輸入 */
            function play(again) {
                var id = ++runId;
                state = 'show';
                idx = 0;
                paintHead();
                setBanner(again ? '再看一次，記清楚！' : '看清楚順序…');
                var lit = litSec(level) * 1000, gap = GAP_S * 1000, t = 400;
                seq.forEach(function (n) {
                    my.after(t, function () { if (id === runId) { flash(n, 'bn-cell--lit', lit); Sfx.play('tick'); } });
                    t += lit + gap;
                });
                my.after(t, function () {
                    if (id !== runId) return;
                    state = 'input';
                    setBanner('換你了：倒著按！', 'go');
                    Sfx.play('go');
                });
            }

            function startLevel() {
                if (my.dead) return;
                errors = 0;
                seq = makeSeq(seqLen(level));
                want = reversed(seq);
                try { console.info('[倒背數字] 第 ' + level + ' 關：亮燈順序 ' + seq.join('、') + '；要按 ' + want.join('、') + '；可錯 ' + chances(level) + ' 次；每格亮 ' + litSec(level).toFixed(2) + ' 秒'); } catch (e) { }
                meta();
                play(false);
            }

            function tap(n) {
                if (state !== 'input') return;
                if (n === want[idx]) {
                    flash(n, 'bn-cell--ok', 350);
                    Sfx.play('ok');
                    idx++;
                    if (idx >= want.length) {
                        state = 'clear';
                        cleared = level;
                        if (Reaction.setBest(ID, cleared, function (v, b) { return v > b; })) newRec = true;
                        meta();
                        setBanner('過關！', 'ok');
                        Sfx.play('win');
                        level++;
                        my.after(CLEAR_MS, startLevel);
                    }
                    return;
                }
                /* 按錯 */
                state = 'wrong';
                flash(n, 'bn-cell--bad', 700);
                Sfx.play('bad');
                errors++;
                paintHead();
                if (errors > chances(level)) {
                    my.after(900, function () {
                        var back = kit.resumeFrom(level);
                        kit.result(root, {
                            num: cleared + ' 關', label: cleared >= 8 ? '記憶力驚人！' : (cleared >= 4 ? '很不錯！' : '再試一次，會更準！'),
                            lines: ['第 ' + level + ' 關要按：' + want.join('、'), '你按到 ' + n + '，應該是 ' + want[idx]],
                            isNew: newRec, sfx: cleared >= 5 ? 'win' : 'fail', onAgain: function () { round(1); },
                            resume: { level: back, run: function () { round(back); } }
                        });
                    });
                } else {
                    setBanner('按錯了！同一組數字再看一次', 'bad');
                    my.after(REPLAY_MS, function () { play(true); });
                }
            }

            G.debug = {
                state: function () { return { level: level, state: state, errors: errors, seq: seq.slice(), want: want.slice(), idx: idx, cleared: cleared }; },
                tapNext: function () { if (state === 'input') tap(want[idx]); return state; },
                tapWrong: function () { if (state === 'input') tap(want[idx] === 9 ? 1 : want[idx] + 1); return state; }
            };

            /* 開場：大字提醒 → 開始第 1 關 */
            setBanner('');
            head.textContent = '準備…';
            Sfx.play('go');
            my.after(SPLASH_MS, function () { splash.hidden = true; startLevel(); });
        }

        round(1);
    }

    var G = {
        id: ID,
        name: '倒背數字',
        rule: '九宮格會依序亮起幾個數字，請「倒著順序」把它們按回去，例如亮 1、2、3 就按 3、2、1。每關多一個數字，按錯會再給你看一次，但機會有限！',
        mount: mount,
        test: { seqLen: seqLen, chances: chances, litSec: litSec, makeSeq: makeSeq, reversed: reversed, SEQ_START: SEQ_START }
    };
    Reaction.register(G);
})();
