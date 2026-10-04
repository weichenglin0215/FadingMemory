/* ═══════════════════════════════════════════════════════════════════
   reaction_schulte.js — 秒反應・數字方陣（舒爾特方格）
   6×6＝36 格，黑底白字，把 1～36 依序一個一個點完，計時，越快越好。只玩一局。
   ───────────────────────────────────────────────────────────────────
   · 數字盡量放大、充滿格子；點對的數字變綠色 0.6 秒再變回白色（不留記號，要靠記憶看哪個點過了）。
   · 點錯：那一格變紅底白字，並且一直留著，讓玩家知道錯在哪；遊戲結束，停留 1.5 秒才跳出結算。
   · 計時從第一次點擊開始（pointerdown 的事件時間），點到 36 停表。只有完整點完才算成績。
   · 成績＝完成時間（X.XXX 秒，越小越好）。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'schulte';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var SIDE = 6;                 /* 方陣邊長（6×6＝36 格） */
    var OK_FLASH_MS = 600;        /* 點對後數字變綠多久 */
    var FAIL_STAY_MS = 1500;      /* 點錯後畫面停留多久才跳結算 */
    var DONE_STAY_MS = 700;       /* 全部點完後多久跳結算 */

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v.toFixed(3) + ' 秒'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 1..N 洗牌，並確保不是剛好排好的 */
    function makeBoard(rand) {
        var n = SIDE * SIDE, base = [];
        for (var i = 1; i <= n; i++) base.push(i);
        var b;
        do { b = kit.shuffle(base, rand); } while (b.every(function (v, k) { return v === k + 1; }));
        return b;
    }
    function rating(sec) {
        if (sec <= 40) return '眼力超強！';
        if (sec <= 55) return '很快喔！';
        if (sec <= 75) return '不錯！';
        return '慢慢找也很棒！';
    }

    function mount(root, ctx) {
        var R = null;

        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';
            root.classList.add('sch-bg');
            my.onDispose(function () { root.classList.remove('sch-bg'); });

            var board = makeBoard();
            var next = 1, t0 = null, state = 'play', cells = [];
            var head = h('div', { 'class': 'sch-head' });
            var info = h('span', { 'class': 'sch-next' });
            var clock = h('span', { 'class': 'sch-clock', text: '0.000 秒' });
            head.appendChild(info); head.appendChild(clock);
            var grid = h('div', { 'class': 'sch-grid' });
            root.appendChild(head);
            root.appendChild(grid);
            ctx.setMeta(fmtBest(Reaction.getBest(ID)));

            function paintHead() { info.textContent = '下一個：' + next; }
            paintHead();

            board.forEach(function (n) {
                var el = h('button', { 'class': 'sch-cell', text: String(n) });
                el.addEventListener('pointerdown', function (e) { e.preventDefault(); tap(n, el, kit.evT(e)); });
                grid.appendChild(el);
                cells[n] = el;
            });

            my.loop(function (now) {
                if (state !== 'play') return false;
                clock.textContent = (t0 == null ? 0 : (now - t0) / 1000).toFixed(3) + ' 秒';
            });

            function tap(n, el, t) {
                if (state !== 'play') return;
                if (t0 == null) t0 = t;
                if (n !== next) {
                    state = 'fail';
                    el.classList.add('sch-cell--bad');
                    Sfx.play('bad');
                    clock.textContent = ((t - t0) / 1000).toFixed(3) + ' 秒';
                    my.after(FAIL_STAY_MS, function () {
                        kit.result(root, {
                            num: '點錯了', label: '你點了 ' + n + '，下一個應該是 ' + next,
                            lines: ['已經正確點到 ' + (next - 1) + ' 個', '用了 ' + ((t - t0) / 1000).toFixed(3) + ' 秒'],
                            note: '全部點完才會記錄成績', sfx: 'fail', onAgain: round
                        });
                    });
                    return;
                }
                el.classList.add('sch-cell--ok');
                my.after(OK_FLASH_MS, function () { el.classList.remove('sch-cell--ok'); });
                Sfx.play('ok');
                if (next >= SIDE * SIDE) {
                    state = 'done';
                    var sec = (t - t0) / 1000;
                    clock.textContent = sec.toFixed(3) + ' 秒';
                    var isNew = Reaction.setBest(ID, sec, function (v, b) { return v < b; });
                    ctx.setMeta(fmtBest(Reaction.getBest(ID)));
                    my.after(DONE_STAY_MS, function () {
                        kit.result(root, {
                            num: sec.toFixed(3) + ' 秒', label: rating(sec),
                            lines: ['6×6 共 36 個數字全部點完'], isNew: isNew, sfx: sec <= 55 ? 'win' : 'neutral', onAgain: round
                        });
                    });
                    return;
                }
                next++;
                paintHead();
            }

            G.debug = {
                board: board,
                state: function () { return { next: next, state: state }; },
                /* 依序點對 count 個；wrong＝true 時最後故意點錯一格 */
                play: function (count, wrong) {
                    var tt = performance.now();
                    for (var i = 0; i < count && state === 'play'; i++) tap(next, cells[next], tt + i * 50);
                    if (wrong && state === 'play') { var bad = next === 36 ? 1 : next + 1; tap(bad, cells[bad], tt + count * 50); }
                    return state;
                }
            };
        }

        round();
    }

    var G = {
        id: ID,
        name: '數字方陣',
        rule: '黑色方格裡有 1 到 36 的數字，請照順序從 1 一直點到 36，點完停表，越快越好！點對的數字會閃一下綠色；只要點錯一個，就會停在那裡讓你看看錯在哪。',
        mount: mount,
        test: { makeBoard: makeBoard, rating: rating, SIDE: SIDE }
    };
    Reaction.register(G);
})();
