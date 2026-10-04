/* ═══════════════════════════════════════════════════════════════════
   reaction_landolt.js — 秒反應・缺口在哪？（E 字視力表）
   中央一個「E」字，開口（三隻腳）朝哪就往哪滑；每換一次方向，E 就縮小成 90%，
   看你能看清楚多小的 E。只要錯一次（滑錯方向或超時）就結束。
   ───────────────────────────────────────────────────────────────────
   · 台灣眼科的視力表是「E 字表」：E 的三隻腳朝上、下、左、右，受測者比出開口的方向。
     所以這裡只有上下左右 4 個方向，沒有斜向。
   · E 的比例（標準）：整個字是 5×5 格，每一筆（脊柱、三隻腳、腳與腳的空隙）都是 1 格，
     所以外徑 D 的 1/5 是線寬。
   · 尺寸：第 1 個 E 的外徑 D0（視力 0.1，D0＝D_BASE÷0.1＝400px），之後每出一個新的 E
     （方向一定跟上一個不同）外徑就 ×SHRINK＝0.9。視力 ＝ D_BASE ÷ D（視力 1.0＝40px）。
     縮到視力 ACUITY_MAX(2.0)，也就是 20px，仍然全部答對就算全部看清楚。
     這裡的 px 是舞台邏輯 px，不等於真實視角，所以結算寫「遊戲視力」，不是醫療檢查。
   · 判定用 pointerdown＋移動：手指在螢幕上移動超過 SWIPE_MIN_PX 就立刻判定方向，不用等手指離開。
   · 每個 E 有時限，從 TIME_START 秒線性縮短到 TIME_END 秒（依第幾個 E）。
     滑錯方向、超時，都是「錯一次」，立刻結束。成績＝最後一個答對的 E 的視力（越高越好）。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'landolt';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var D_BASE = 40;            /* 視力 1.0 時 E 的外徑（px） */
    var ACUITY_START = 0.1;     /* 第一個 E 的視力（外徑 400px） */
    var ACUITY_MAX = 30.05;       /* 縮到這個視力（外徑 10px）全部答對就是滿分 */
    var SHRINK = 0.85;           /* 每換一次方向，外徑 ×0.88 */
    var TIME_START = 3.0;       /* 第一個 E 的時限（秒），之後線性縮短 */
    var TIME_END = 2.0;         /* 最後一個 E 的時限 */
    var SWIPE_MIN_PX = 88;      /* 手指移動多少 px 就算滑了 */
    var GAP_AFTER_MS = 500;     /* 判定後多久出下一個 E */
    var DIRS = [0, 90, 180, 270];       /* 角度：0＝上，順時針（只有上下左右） */

    function fmtV(v) { return v.toFixed(2); }
    function fmtBest(v) { return v == null ? '' : '最佳視力 ' + fmtV(v); }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function sizeFor(v) { return D_BASE / v; }
    /* 第 n 個 E（從 1 起算）的外徑與視力 */
    function sizeAt(n) { return sizeFor(ACUITY_START) * Math.pow(SHRINK, n - 1); }
    function acuityAt(n) { return D_BASE / sizeAt(n); }
    /* 一共會出幾個 E：視力從 ACUITY_START 乘 1/0.9 倍數成長，到 ACUITY_MAX 為止 */
    var N_MAX = Math.floor(Math.log(ACUITY_MAX / ACUITY_START) / Math.log(1 / SHRINK) + 1e-9) + 1;
    function timeAt(n) { return kit.ramp(n, TIME_START, TIME_END, N_MAX); }
    /* 下一個方向：一定跟上一個不同 */
    function nextDir(prev, rand) {
        var pool = DIRS.filter(function (d) { return d !== prev; });
        return kit.pick(pool, rand);
    }
    /* 手指移動向量 → 上下左右（角度 0＝上、順時針；螢幕座標 y 往下為正） */
    function dirFromDelta(dx, dy) {
        if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 90 : 270;
        return dy > 0 ? 180 : 0;
    }

    /* 畫一個 E。基本款（角度 90）的三隻腳朝右；dir 是開口方向（0 上、90 右、180 下、270 左），
       所以旋轉 dir−90 度。5×5 格：脊柱在最左一格，三隻腳在第 1、3、5 列。 */
    function eSvg(D, dir) {
        var u = D / 5;
        var svg = kit.svg('svg', { 'class': 'ld-ring', viewBox: (-D / 2) + ' ' + (-D / 2) + ' ' + D + ' ' + D, width: D, height: D });
        var g = kit.svg('g', { transform: 'rotate(' + (dir - 90) + ')', 'class': 'ld-e' }, svg);
        var x0 = -D / 2, y0 = -D / 2;
        kit.svg('rect', { x: x0, y: y0, width: u, height: D }, g);                       /* 脊柱 */
        [0, 2, 4].forEach(function (row) {
            kit.svg('rect', { x: x0, y: y0 + row * u, width: D, height: u }, g);        /* 三隻腳 */
        });
        return svg;
    }

    function mount(root, ctx) {
        var R = null;

        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            var n = 0;               /* 目前是第幾個 E（從 1 起算；0＝還沒開始） */
            var passed = 0;          /* 已答對幾個 */
            var rts = [];            /* 反應時間（毫秒） */
            var prevDir = null;
            var state = 'idle';      /* idle／ask／gap／done */
            var cur = null;          /* 目前的 E：{dir, t0, limitMs, timer} */
            var start = null;        /* 目前這一筆手指的起點 */

            var head = h('div', { 'class': 'ld-head' });
            var hint = h('div', { 'class': 'hint', text: '準備…' });
            var field = h('div', { 'class': 'ld-field' });
            var barWrap = h('div', { 'class': 'ld-time' }, [h('div', { 'class': 'ld-time__fill' })]);
            var fill = barWrap.firstChild;
            root.appendChild(head);
            root.appendChild(field);
            root.appendChild(barWrap);
            root.appendChild(hint);

            function updateHead() {
                var nn = Math.max(1, n);
                head.textContent = '第 ' + nn + ' 個・視力 ' + fmtV(acuityAt(nn));
                ctx.setMeta(kit.meta([fmtBest(Reaction.getBest(ID))]));
            }

            function nextE() {
                if (my.dead) return;
                n++;
                updateHead();
                var dir = nextDir(prevDir);
                prevDir = dir;
                console.info('[缺口在哪？] 第 ' + n + ' 個 E：開口朝' + ({ 0: '上', 90: '右', 180: '下', 270: '左' })[dir] +
                    '，外徑 ' + sizeAt(n).toFixed(1) + 'px（視力 ' + fmtV(acuityAt(n)) + '），時限 ' + timeAt(n).toFixed(2) + ' 秒');
                field.innerHTML = '';
                field.appendChild(eSvg(sizeAt(n), dir));
                var limit = timeAt(n) * 1000;
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

            /* chosen：玩家滑的方向（null＝超時）。錯一次就結束 */
            function judge(chosen, t) {
                if (state !== 'ask') return;
                state = 'gap';
                my.cancel(cur.timer);
                if (cur.loop) cur.loop.stop();
                fill.style.width = '0%';
                var ok = chosen === cur.dir;
                if (chosen != null) rts.push(t - cur.t0);
                var e = field.querySelector('.ld-e');
                if (e) e.classList.add(ok ? 'ld-e--ok' : 'ld-e--bad');
                if (ok) { passed++; Sfx.play('ok'); } else { Sfx.play('bad'); }

                my.after(ok ? GAP_AFTER_MS : 900, function () {
                    if (!ok) { finish(false, chosen == null ? '時間到了' : '方向滑錯了'); return; }
                    if (n >= N_MAX) { finish(true, '全部看清楚了！'); return; }
                    nextE();
                });
            }

            function finish(allClear, reason) {
                state = 'done';
                var v = passed > 0 ? acuityAt(passed) : 0;
                var isNew = v > 0 && Reaction.setBest(ID, v, function (a, b) { return a > b; });
                ctx.setMeta(kit.meta([fmtBest(Reaction.getBest(ID))]));
                var avg = rts.length ? rts.reduce(function (a, b) { return a + b; }, 0) / rts.length : 0;
                kit.result(root, {
                    num: v > 0 ? '視力 ' + fmtV(v) : '視力 < ' + fmtV(ACUITY_START),
                    label: allClear ? reason : (v >= 1.0 ? '視力很好！' : (v > 0 ? '再努力看看！' : '第一個就看不清楚…')) + (reason ? '（' + reason + '）' : ''),
                    lines: ['看清楚了 ' + passed + ' 個 E', rts.length ? '平均反應 ' + (avg / 1000).toFixed(3) + ' 秒' : ''].filter(Boolean),
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
                    judge(dirFromDelta(dx, dy), kit.evT(e));
                }
            }
            root.addEventListener('pointerdown', onDown);
            root.addEventListener('pointermove', onMove);
            my.onDispose(function () {
                root.removeEventListener('pointerdown', onDown);
                root.removeEventListener('pointermove', onMove);
            });

            /* 開場停一下讓玩家就位 */
            head.textContent = '準備…';
            my.after(700, function () { hint.textContent = '往 E 的開口（三隻腳）方向滑一下'; Sfx.play('go'); nextE(); });

            G.debug = {
                state: function () { return { n: n, passed: passed, state: state, dir: cur && cur.dir, size: n ? sizeAt(n) : null }; },
                swipe: function (deg) { if (state === 'ask') judge(deg, performance.now()); return state; },
                swipeCorrect: function () { if (state === 'ask') judge(cur.dir, performance.now()); return state; }
            };
        }

        round();
    }

    var G = {
        id: ID,
        name: '缺口在哪？',
        rule: '畫面中央有一個「E」字，開口（三隻腳）朝哪個方向，就用手指往那個方向滑一下（只有上下左右）。每換一次方向，E 就縮小成 90%，只要錯一次就結束，看你能看清楚多小的 E！',
        mount: mount,
        test: { sizeFor: sizeFor, sizeAt: sizeAt, acuityAt: acuityAt, timeAt: timeAt, nextDir: nextDir, dirFromDelta: dirFromDelta, N_MAX: N_MAX, DIRS: DIRS, SHRINK: SHRINK }
    };
    Reaction.register(G);
})();
