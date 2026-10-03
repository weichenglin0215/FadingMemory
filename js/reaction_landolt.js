/* ═══════════════════════════════════════════════════════════════════
   reaction_landolt.js — 秒反應・缺口在哪？（視力表）
   中央一個「C」形環，缺口朝哪就往哪滑；環一行比一行小，看你走到視力表第幾行。
   ───────────────────────────────────────────────────────────────────
   · 標準蘭氏環比例：環的線寬＝缺口寬＝外徑／5。
   · 視力行 [0.1 … 2.0]，外徑 D = D_BASE ÷ 視力（視力 1.0＝40px、2.0＝20px、0.1＝400px）。
     這裡的 px 是舞台邏輯 px，不等於真實視角，所以結算寫「遊戲視力」，不是醫療檢查。
   · 判定用 pointerdown＋移動：手指在螢幕上移動超過 SWIPE_MIN_PX 就立刻判定方向，
     不用等手指離開。前面幾行只有上下左右 4 個方向，第 DIAG_FROM_ROW 行起變成 8 個方向。
   · 每行 PER_ROW 個環，答對 PASS_COUNT 個以上過關（仿真實視力表）；答錯到「不可能
     再過關」就結束。每個環有時間限制，線性縮短，超時算錯。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'landolt';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var ROWS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.2, 1.5, 2.0];
    var PER_ROW = 5;            /* 每行幾個環 */
    var PASS_COUNT = 3;         /* 答對幾個才過這一行 */
    var TIME_START = 3.0;       /* 第一行每個環的時限（秒），之後線性縮短 */
    var TIME_END = 1.2;         /* 最後一行的時限 */
    var DIAG_FROM_ROW = 8;      /* 第幾行（從 1 算）起加入斜向 */
    var SWIPE_MIN_PX = 24;      /* 手指移動多少 px 就算滑了 */
    var D_BASE = 40;            /* 視力 1.0 時環的外徑（px） */
    var GAP_AFTER_MS = 320;     /* 判定後多久出下一個環 */
    var DIRS4 = [0, 90, 180, 270];
    var DIRS8 = [0, 45, 90, 135, 180, 225, 270, 315];       /* 角度：0＝上，順時針 */

    function fmtV(v) { return v.toFixed(1); }
    function fmtBest(v) { return v == null ? '' : '最佳視力 ' + fmtV(v); }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function sizeFor(v) { return D_BASE / v; }
    function timeFor(rowIdx) { return kit.ramp(rowIdx + 1, TIME_START, TIME_END, ROWS.length); }
    function dirsFor(rowIdx) { return rowIdx + 1 >= DIAG_FROM_ROW ? DIRS8 : DIRS4; }
    /* 手指移動向量 → 最接近的方向（角度 0＝上、順時針；螢幕座標 y 往下為正） */
    function dirFromDelta(dx, dy, dirs) {
        var ang = Math.atan2(dx, -dy) * 180 / Math.PI;
        if (ang < 0) ang += 360;
        var best = dirs[0], bd = 999;
        dirs.forEach(function (d) {
            var diff = Math.abs(((ang - d + 540) % 360) - 180);
            if (diff < bd) { bd = diff; best = d; }
        });
        return best;
    }

    function ringSvg(D, gapDeg) {
        var svg = kit.svg('svg', { 'class': 'ld-ring', viewBox: (-D / 2) + ' ' + (-D / 2) + ' ' + D + ' ' + D, width: D, height: D });
        var ro = D / 2, ri = D / 2 - D / 5, rm = (ro + ri) / 2, sw = ro - ri;
        /* 環：一個很粗的圓框（中線 rm、線寬 sw）；缺口：用背景色的長方形蓋掉一段 */
        kit.svg('circle', { cx: 0, cy: 0, r: rm, fill: 'none', 'class': 'ld-ring__c', 'stroke-width': sw }, svg);
        kit.svg('rect', {
            'class': 'ld-ring__gap', x: -D / 10, y: -ro - 1, width: D / 5, height: sw + 2,
            transform: 'rotate(' + gapDeg + ')'
        }, svg);
        return svg;
    }

    function mount(root, ctx) {
        var R = null;

        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            var rowIdx = 0;          /* 目前第幾行（0 起算） */
            var cIdx = 0;            /* 這一行的第幾個環 */
            var okInRow = 0, badInRow = 0;
            var passedRow = -1;      /* 最後通過的行 */
            var rts = [];            /* 反應時間（毫秒） */
            var lastDirs = [];
            var state = 'idle';      /* idle／ask／gap／done */
            var cur = null;          /* 目前的環：{dir, t0, limitMs, timer} */
            var start = null;        /* 目前這一筆手指的起點 */
            var marks = [];

            var head = h('div', { 'class': 'ld-head' });
            var dots = h('div', { 'class': 'ld-dots' });
            var hint = h('div', { 'class': 'hint', text: '準備…' });
            var field = h('div', { 'class': 'ld-field' });
            var barWrap = h('div', { 'class': 'ld-time' }, [h('div', { 'class': 'ld-time__fill' })]);
            var fill = barWrap.firstChild;
            root.appendChild(head);
            root.appendChild(dots);
            root.appendChild(field);
            root.appendChild(barWrap);
            root.appendChild(hint);

            function updateHead() {
                head.textContent = '第 ' + (rowIdx + 1) + ' 行・視力 ' + fmtV(ROWS[rowIdx]);
                ctx.setMeta(kit.meta([fmtBest(Reaction.getBest(ID))]));
            }
            function paintDots() {
                dots.innerHTML = '';
                for (var i = 0; i < PER_ROW; i++) {
                    dots.appendChild(h('span', { 'class': 'ld-dot' + (marks[i] ? ' ld-dot--' + marks[i] : '') }));
                }
            }

            function nextRing() {
                if (my.dead) return;
                updateHead();
                paintDots();
                var dirs = dirsFor(rowIdx);
                var dir, tries = 0;
                do {
                    dir = kit.pick(dirs);
                    tries++;
                } while (lastDirs.length >= 2 && lastDirs[0] === dir && lastDirs[1] === dir && tries < 20);   /* 不連續 3 次相同 */
                lastDirs.unshift(dir); lastDirs.length = Math.min(lastDirs.length, 2);

                field.innerHTML = '';
                field.appendChild(ringSvg(sizeFor(ROWS[rowIdx]), dir));
                var limit = timeFor(rowIdx) * 1000;
                cur = { dir: dir, t0: performance.now(), limitMs: limit };
                state = 'ask';
                start = null;
                /* 時限條：每影格更新寬度；超時判定用 setTimeout（不靠 rAF） */
                cur.loop = my.loop(function (now) {
                    if (cur == null || state !== 'ask') return false;
                    fill.style.width = (100 * Math.max(0, 1 - (now - cur.t0) / cur.limitMs)).toFixed(1) + '%';
                });
                cur.timer = my.after(limit, function () { if (state === 'ask') judge(null, performance.now()); });
            }

            /* chosen：玩家滑的方向（null＝超時） */
            function judge(chosen, t) {
                if (state !== 'ask') return;
                state = 'gap';
                my.cancel(cur.timer);
                if (cur.loop) cur.loop.stop();
                fill.style.width = '0%';
                var ok = chosen === cur.dir;
                if (chosen != null) rts.push(t - cur.t0);
                marks[cIdx] = ok ? 'ok' : 'bad';
                paintDots();
                if (ok) { okInRow++; Sfx.play('ok'); } else { badInRow++; Sfx.play('bad'); }
                /* 環變色：對綠、錯橘 */
                var c = field.querySelector('.ld-ring__c');
                if (c) c.classList.add(ok ? 'ld-ring__c--ok' : 'ld-ring__c--bad');
                cIdx++;

                var rowDone = okInRow >= PASS_COUNT;
                var rowFail = badInRow > PER_ROW - PASS_COUNT;
                my.after(GAP_AFTER_MS, function () {
                    if (rowDone) {
                        passedRow = rowIdx;
                        if (rowIdx + 1 >= ROWS.length) { finish(true); return; }
                        Sfx.play('win');
                        rowIdx++; cIdx = 0; okInRow = 0; badInRow = 0; marks = [];
                        nextRing();
                    } else if (rowFail) {
                        finish(false);
                    } else {
                        nextRing();
                    }
                });
            }

            function finish(allClear) {
                state = 'done';
                var v = passedRow >= 0 ? ROWS[passedRow] : 0;
                var isNew = v > 0 && Reaction.setBest(ID, v, function (a, b) { return a > b; });
                ctx.setMeta(kit.meta([fmtBest(Reaction.getBest(ID))]));
                var avg = rts.length ? rts.reduce(function (a, b) { return a + b; }, 0) / rts.length : 0;
                kit.result(root, {
                    num: v > 0 ? '視力 ' + fmtV(v) : '視力 < 0.1',
                    label: allClear ? '全部看清楚了！' : (v >= 1.0 ? '視力很好！' : (v > 0 ? '再努力看看！' : '第一行就看不清楚…')),
                    lines: ['最後通過第 ' + (passedRow + 1) + ' 行', rts.length ? '平均反應 ' + (avg / 1000).toFixed(3) + ' 秒' : ''].filter(Boolean),
                    note: '遊戲視力，不是真正的視力檢查',
                    isNew: isNew, sfx: allClear ? 'perfect' : (v >= 0.5 ? 'win' : 'fail'),
                    onAgain: round
                });
            }

            /* ─── 輸入 ─── */
            function onDown(e) {
                if (state !== 'ask') return;
                e.preventDefault();
                var p = kit.pt(e);
                start = { x: p.x, y: p.y, id: e.pointerId };
                try { root.setPointerCapture(e.pointerId); } catch (err) { }
            }
            function onMove(e) {
                if (state !== 'ask' || !start || e.pointerId !== start.id) return;
                var p = kit.pt(e);
                var dx = p.x - start.x, dy = p.y - start.y;
                if (dx * dx + dy * dy >= SWIPE_MIN_PX * SWIPE_MIN_PX) {
                    start = null;
                    judge(dirFromDelta(dx, dy, dirsFor(rowIdx)), kit.evT(e));
                }
            }
            root.addEventListener('pointerdown', onDown);
            root.addEventListener('pointermove', onMove);
            my.onDispose(function () {
                root.removeEventListener('pointerdown', onDown);
                root.removeEventListener('pointermove', onMove);
            });

            /* 開場停一下讓玩家就位 */
            my.after(700, function () { hint.textContent = '往缺口的方向滑一下'; Sfx.play('go'); nextRing(); });
            updateHead();
            paintDots();

            G.debug = {
                state: function () { return { rowIdx: rowIdx, cIdx: cIdx, ok: okInRow, bad: badInRow, state: state, dir: cur && cur.dir, passedRow: passedRow }; },
                swipe: function (deg) { if (state === 'ask') judge(deg, performance.now()); return state; },
                swipeCorrect: function () { if (state === 'ask') judge(cur.dir, performance.now()); return state; }
            };
        }

        round();
    }

    var G = {
        id: ID,
        name: '缺口在哪？',
        rule: '畫面中央有一個「C」形環，缺口朝哪個方向，就用手指往那個方向滑一下。環會一行比一行小，每行 5 個、答對 3 個才過關，看你能走到視力表第幾行！',
        mount: mount,
        test: { sizeFor: sizeFor, timeFor: timeFor, dirsFor: dirsFor, dirFromDelta: dirFromDelta, ROWS: ROWS }
    };
    Reaction.register(G);
})();
