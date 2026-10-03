/* ═══════════════════════════════════════════════════════════════════
   reaction_lights.js — 秒反應・點燈記憶
   一塊燈板上有幾盞燈同時短暫亮起，全部熄滅後，把剛才亮過的位置一個一個點回來。
   全對過關、多亮一盞；點錯或超時就結束。成績＝最多一次記住幾盞燈（記憶廣度）。
   ───────────────────────────────────────────────────────────────────
   · 這是神經心理學 Corsi 方塊廣度測驗的遊戲版：只記「位置」，順序不限。
   · 難度全部線性：亮燈盞數 N 從 3 起每關 +1；亮燈時間從 SHOW_START 線性縮短到
     SHOW_END；燈板隨 N 變大（3×3 → 4×4 → 5×5）；回想時限隨 N 線性加長。
   · 亮燈／熄燈／回想時限全部用 setTimeout 排程（kit.round 的 after），不靠 rAF，
     分頁在背景也不會卡住。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'lights';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var N_START = 3;            /* 第一關亮幾盞 */
    var N_MAX = 32;             /* 上限（7×7 共 32 格，亮太多就不是記憶而是猜了） */
    var SHOW_START = 1.0;       /* 第一關亮燈時間（秒） */
    var SHOW_END = 10.0;        /* N 到最大時的亮燈時間 */
    var RECALL_BASE = 5;        /* 回想時限＝基本 + 每盞加幾秒 */
    var RECALL_PER = 0.8;
    var PREP_MS = 0;          /* 每關開始前的準備時間 */
    var AFTER_LIT_MS = 450;     /* 熄燈後多久才讓玩家點（避免殘影） */
    var CLEAR_MS = 800;         /* 全對後多久進下一關 */

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 盞'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function gridFor(n) { return n <= 4 ? 3 : (n <= 8 ? 4 : (n <= 16 ? 5 : (n <= 24 ? 6 : 7))); }
    function showSecFor(n) { return kit.ramp(n - N_START + 1, SHOW_START, SHOW_END, N_MAX - N_START + 1); }
    function recallSecFor(n) { return RECALL_BASE + RECALL_PER * n; }
    function pickCells(g, n, rand) {
        var all = [];
        for (var i = 0; i < g * g; i++) all.push(i);
        return kit.shuffle(all, rand).slice(0, n);
    }

    function mount(root, ctx) {
        var R = null;
        var cleared = 0;           /* 這一局最多記住幾盞（跨關卡累積，重開一局歸零） */
        var newRec = false;        /* 這一局有沒有刷新最佳紀錄 */

        function round(n) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            n = n || N_START;
            root.innerHTML = '';
            var g = gridFor(n);
            var state = 'prep';
            var targets = pickCells(g, n);
            var tapped = {};
            var hits = 0;

            ctx.setMeta(kit.meta(['亮 ' + n + ' 盞', fmtBest(Reaction.getBest(ID))]));
            var hint = h('div', { 'class': 'hint', text: '準備…記住亮起來的燈' });
            var barWrap = h('div', { 'class': 'ld-time' }, [h('div', { 'class': 'ld-time__fill' })]);
            var fill = barWrap.firstChild;
            var panel = h('div', { 'class': 'lt-panel' });
            var grid = h('div', { 'class': 'lt-grid' });
            grid.style.gridTemplateColumns = 'repeat(' + g + ', 1fr)';
            grid.style.gridTemplateRows = 'repeat(' + g + ', 1fr)';
            panel.appendChild(grid);
            root.appendChild(hint);
            root.appendChild(panel);
            root.appendChild(barWrap);

            /* 燈板是正方形：取可用寬高較小的那個 */
            var side = Math.floor(Math.min(panel.clientWidth, panel.clientHeight));
            grid.style.width = side + 'px';
            grid.style.height = side + 'px';

            var lamps = [];
            for (var i = 0; i < g * g; i++) {
                (function (i) {
                    var el = h('button', { 'class': 'lt-lamp' });
                    el.addEventListener('pointerdown', function (e) { e.preventDefault(); tap(i); });
                    grid.appendChild(el);
                    lamps.push(el);
                })(i);
            }

            function tap(i) {
                if (state !== 'recall' || tapped[i]) return;
                tapped[i] = true;
                if (targets.indexOf(i) >= 0) {
                    hits++;
                    lamps[i].classList.add('lt-lamp--hit');
                    Sfx.play('ok');
                    if (hits >= n) levelClear();
                } else {
                    lamps[i].classList.add('lt-lamp--bad');
                    fail('點到沒亮過的燈了');
                }
            }

            function levelClear() {
                state = 'clear';
                my.cancel(timer);
                cleared = Math.max(cleared, n);
                if (Reaction.setBest(ID, cleared, function (v, b) { return v > b; })) newRec = true;
                ctx.setMeta(kit.meta(['亮 ' + n + ' 盞', fmtBest(Reaction.getBest(ID))]));
                fill.style.width = '0%';
                Sfx.play('win');
                if (n >= N_MAX) { my.after(CLEAR_MS, finishAll); return; }
                hint.textContent = g !== gridFor(n + 1) ? '全對！燈板要變大了…' : '全對！再多一盞…';
                my.after(CLEAR_MS, function () { round(n + 1); });
            }

            function finishAll() {
                /* 通過最大盞數：直接結束（只會發生在 N_MAX） */
                state = 'done';
                kit.result(root, {
                    num: '記住 ' + cleared + ' 盞', label: '太強了，全部記住！', sfx: 'perfect',
                    isNew: newRec, onAgain: restart
                });
            }

            function fail(reason) {
                if (state === 'done') return;
                state = 'fail';
                my.cancel(timer);
                fill.style.width = '0%';
                /* 把還沒點到的目標用黃框標出來，讓玩家看到「剛才亮的是這些」 */
                targets.forEach(function (t) { if (!tapped[t]) lamps[t].classList.add('lt-lamp--reveal'); });
                my.after(1100, function () {
                    state = 'done';
                    kit.result(root, {
                        num: '記住 ' + cleared + ' 盞', label: reason,
                        lines: ['這一關要記 ' + n + ' 盞，你點對了 ' + hits + ' 盞'],
                        isNew: newRec, sfx: cleared >= 6 ? 'win' : 'fail',
                        onAgain: restart
                    });
                });
            }

            var timer = null;
            /* 流程：準備 → 亮 → 熄 → 回想（限時） */
            my.after(PREP_MS, function () {
                state = 'show';
                hint.textContent = '看！';
                Sfx.play('go');
                targets.forEach(function (t) { lamps[t].classList.add('lt-lamp--lit'); });
                my.after(showSecFor(n) * 1000, function () {
                    targets.forEach(function (t) { lamps[t].classList.remove('lt-lamp--lit'); });
                    hint.textContent = '把剛才亮過的燈點出來（共 ' + n + ' 盞）';
                    my.after(AFTER_LIT_MS, function () {
                        state = 'recall';
                        var limit = recallSecFor(n) * 1000;
                        var t0 = performance.now();
                        my.loop(function (now) {
                            if (state !== 'recall') return false;
                            fill.style.width = (100 * Math.max(0, 1 - (now - t0) / limit)).toFixed(1) + '%';
                        });
                        timer = my.after(limit, function () { if (state === 'recall') fail('時間到了'); });
                    });
                });
            });

            G.debug = {
                state: function () { return { n: n, g: g, state: state, hits: hits, cleared: cleared, targets: targets.slice() }; },
                tap: tap
            };
        }

        function restart() { cleared = 0; newRec = false; round(N_START); }
        round(N_START);
    }

    var G = {
        id: ID,
        name: '點燈記憶',
        rule: '燈板上有幾盞燈會同時短暫亮起，記住它們的位置。熄滅後，把剛才亮過的燈一個一個點出來。全對就多亮一盞，點錯或超時就結束，看你最多記得住幾盞！',
        mount: mount,
        test: { gridFor: gridFor, showSecFor: showSecFor, recallSecFor: recallSecFor, pickCells: pickCells, N_START: N_START, N_MAX: N_MAX }
    };
    Reaction.register(G);
})();
