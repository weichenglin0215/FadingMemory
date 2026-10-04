/* ═══════════════════════════════════════════════════════════════════
   reaction_sticks.js — 秒反應・落下棍子（原「抓住尺子」）
   畫面上方掛著六根垂直的棍子，棍子會在不定的時間點鬆手、以地心引力加速度落下；
   要在棍子掉出畫面下緣之前點到它。每一關只能錯失一根，錯失第二根就失敗。
   ───────────────────────────────────────────────────────────────────
   · 棍長：第 1 關＝場地高度的一半，每過一關 ×0.8（依使用者指定），最短 LEN_MIN。
   · 掉落：棍子頂端的位置是時間的純函式 top(t) = ½·g·t²（t 從鬆手那一刻算起），
     g 也隨關卡線性變大（G_START → G_END）。畫面（rAF）只是把同一個函式畫出來，
     判定在 pointerdown 那一刻用事件時間代進同一個函式算，不看畫面影格。
   · 鬆手時間表：六根棍子的鬆手順序隨機，第一根在 FIRST_MIN～FIRST_MAX 秒內，其後每
     根間隔 GAP_MIN～GAP_MAX 秒（至少 GAP_MIN，確保人來得及反應）。
   · 判定（judgeTap）：
        - 點在還掛著的棍子上，或鬆手後不到 REACT_MIN_S 就點（比人的反應還快＝亂猜）→ 搶按，
          該根算錯失（變橘紅，不再掉落）。
        - 點到正在掉的棍子（棍身上下各放寬 HIT_PAD）→ 接住（變綠，停在原地）。
        - 其餘位置點了沒事。
   · 一根棍子「錯失」＝掉出畫面、或被搶按。一關錯失 ≥ 2 根就結束；六根都處理完且錯失 ≤ 1 就過關。
   · 成績＝通過幾關（越多越好）。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'sticks';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var N = 6;                  /* 棍子數量 */
    var LEN_FRAC = 0.5;         /* 第 1 關棍長＝場地高度的幾分之幾 */
    var SHRINK = 0.8;           /* 每過一關棍長 ×0.8 */
    var LEN_MIN = 30;           /* 棍長下限（px） */
    var STICK_W = 46;           /* 棍子畫出來的寬度 */
    var HIT_W = 68;             /* 命中範圍的寬度（比畫出來的大，手指好點） */
    var HIT_PAD = 24;           /* 命中範圍上下各放寬多少 px */
    var G_START = 2200, G_END = 4400;   /* 重力加速度（px/秒²），第 1 → RAMP 關線性 */
    var RAMP = 15;
    var REACT_MIN_S = 0.10;     /* 鬆手後不到這麼久就點＝搶按 */
    var FIRST_MIN = 0.9, FIRST_MAX = 2.0;   /* 第一根鬆手時間（秒） */
    var GAP_MIN = 0.5, GAP_MAX = 1.4;       /* 相鄰兩根鬆手的間隔（秒） */
    var MISS_ALLOWED = 1;       /* 一關最多可以錯失幾根（再多一根就失敗） */
    var NEXT_MS = 1100;         /* 過關後多久出下一關 */

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 關'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function stickLen(level, FH) { return Math.max(LEN_MIN, FH * LEN_FRAC * Math.pow(SHRINK, level - 1)); }
    function gravity(level) { return kit.ramp(level, G_START, G_END, RAMP); }
    /* 鬆手後 tSec 秒，棍子頂端往下掉了多少 px */
    function topAt(g, tSec) { return tSec <= 0 ? 0 : 0.5 * g * tSec * tSec; }
    /* 從鬆手到整根掉出場地下緣（頂端到達 FH）要幾秒 */
    function exitSec(g, FH) { return Math.sqrt(2 * FH / g); }
    /* 鬆手時間表：回傳 [{i, t}]（t 單位秒，依時間遞增），i 是棍子編號 0..N-1 */
    function makeSchedule(rand) {
        rand = rand || Math.random;
        var order = kit.shuffle(Array.apply(null, Array(N)).map(function (_, k) { return k; }), rand);
        var t = kit.randFloat(FIRST_MIN, FIRST_MAX, rand), out = [];
        order.forEach(function (i, k) {
            if (k > 0) t += kit.randFloat(GAP_MIN, GAP_MAX, rand);
            out.push({ i: i, t: t });
        });
        return out;
    }
    /* 判定一次點擊。st：{cx, len, relT}（relT＝鬆手時刻 ms，還沒鬆手是 null）；tap：{x, y, t(ms)}
       回傳 'none'（沒點到這根）／'early'（搶按）／'hit'（接住） */
    function judgeTap(st, g, tap) {
        if (Math.abs(tap.x - st.cx) > HIT_W / 2) return 'none';
        if (st.relT == null) {
            return tap.y <= st.len + HIT_PAD ? 'early' : 'none';
        }
        var dt = (tap.t - st.relT) / 1000;
        var top = topAt(g, dt);
        if (tap.y < top - HIT_PAD || tap.y > top + st.len + HIT_PAD) return 'none';
        return dt < REACT_MIN_S ? 'early' : 'hit';
    }

    function mount(root, ctx) {
        var R = null;

        /* startAt：從第幾關開始（失敗後可從前 5 關繼續）*/
        function round(startAt) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            var level = startAt || 1, cleared = level - 1, newRec = false, state = 'idle', levelNo = 0;
            var head = h('div', { 'class': 'stk-head' });
            var field = h('div', { 'class': 'stk-field' });
            root.appendChild(head);
            root.appendChild(field);
            var rail = h('div', { 'class': 'stk-rail' });
            field.appendChild(rail);

            var FW = field.clientWidth, FH = field.clientHeight;
            var sticks = [], misses = 0, resolved = 0, g = G_START, len = 0, drawLoop = null;

            function meta() { ctx.setMeta(kit.meta(['第 ' + level + ' 關', fmtBest(Reaction.getBest(ID))])); }
            function paintHead() {
                head.textContent = '第 ' + level + ' 關　棍長 ' + Math.round(len) + '　' + (misses ? '已錯失 ' + misses + ' 根' : '還能錯失 ' + MISS_ALLOWED + ' 根');
            }

            function startLevel() {
                if (my.dead) return;
                levelNo++;
                var myLevel = levelNo;
                FW = field.clientWidth; FH = field.clientHeight;
                len = stickLen(level, FH);
                g = gravity(level);
                misses = 0; resolved = 0; state = 'play';
                sticks.forEach(function (s) { if (s.el.parentNode) s.el.parentNode.removeChild(s.el); });
                sticks = [];
                var gap = FW / N;
                for (var i = 0; i < N; i++) {
                    var el = h('div', { 'class': 'stk-stick' });
                    el.style.width = STICK_W + 'px';
                    el.style.height = len + 'px';
                    el.style.left = (gap * (i + 0.5) - STICK_W / 2) + 'px';
                    field.appendChild(el);
                    sticks.push({ i: i, el: el, cx: gap * (i + 0.5), len: len, relT: null, state: 'hang', top: 0 });
                }
                var sched = makeSchedule();
                try {
                    console.info('[落下棍子] 第 ' + level + ' 關 棍長 ' + len.toFixed(1) + 'px、重力 ' + g.toFixed(0) + ' px/秒²、整根掉出要 ' + exitSec(g, FH).toFixed(3) + ' 秒；鬆手順序 ' +
                        sched.map(function (s) { return '棍' + (s.i + 1) + '@' + s.t.toFixed(2) + 's'; }).join(' '));
                } catch (e) { }
                sched.forEach(function (s) {
                    my.after(s.t * 1000, function () { if (myLevel === levelNo) release(sticks[s.i]); });
                });
                paintHead(); meta();
                if (drawLoop) drawLoop.stop();
                drawLoop = my.loop(function (now) {
                    if (myLevel !== levelNo) return false;
                    sticks.forEach(function (s) {
                        if (s.state === 'fall' || s.state === 'missed' && s.relT != null) {
                            s.top = topAt(g, (now - s.relT) / 1000);
                            s.el.style.transform = 'translateY(' + s.top.toFixed(1) + 'px)';
                        }
                    });
                });
            }

            function release(s) {
                if (state !== 'play' || s.state !== 'hang') return;
                s.state = 'fall';
                s.relT = performance.now();
                Sfx.play('tick');
                my.after(exitSec(g, FH) * 1000 + 40, function () { if (s.state === 'fall') lose(s, false); });
            }

            function resolve() {
                resolved++;
                paintHead();
                if (misses > MISS_ALLOWED) { endLevel(false); return; }
                if (resolved >= N) endLevel(true);
            }
            function catchStick(s, now) {
                s.state = 'caught';
                s.top = topAt(g, (now - s.relT) / 1000);
                s.el.style.transform = 'translateY(' + s.top.toFixed(1) + 'px)';
                s.el.classList.add('stk-stick--ok');
                Sfx.play('ok');
                resolve();
            }
            function lose(s, foul) {
                if (s.state === 'caught' || s.state === 'missed' || s.state === 'foul') return;
                s.state = foul ? 'foul' : 'missed';
                s.el.classList.add('stk-stick--bad');
                Sfx.play('bad');
                misses++;
                resolve();
            }

            function endLevel(ok) {
                if (state !== 'play') return;
                state = ok ? 'clear' : 'over';
                if (ok) {
                    cleared = level;
                    if (Reaction.setBest(ID, cleared, function (v, b) { return v > b; })) newRec = true;
                    meta();
                    Sfx.play('win');
                    head.textContent = '第 ' + level + ' 關過關！';
                    level++;
                    my.after(NEXT_MS, startLevel);
                } else {
                    /* 還沒掉完的棍子讓它繼續掉，玩家看得到是哪幾根沒接到 */
                    my.after(1200, function () {
                        var back = kit.resumeFrom(level);
                        kit.result(root, {
                            num: cleared + ' 關',
                            label: cleared >= 8 ? '眼明手快！' : (cleared >= 4 ? '反應不錯！' : '再試一次，會更快！'),
                            lines: ['第 ' + level + ' 關錯失了 ' + misses + ' 根棍子', '那一關棍長 ' + Math.round(len) + ' px'],
                            isNew: newRec, sfx: cleared >= 6 ? 'win' : 'fail', onAgain: function () { round(1); },
                            resume: { level: back, run: function () { round(back); } }
                        });
                    });
                }
            }

            /* 一次點擊：先找哪一欄，再判定 */
            function handleTap(x, y, t) {
                if (state !== 'play') return null;
                for (var k = 0; k < sticks.length; k++) {
                    var s = sticks[k];
                    if (s.state !== 'hang' && s.state !== 'fall') continue;
                    var r = judgeTap(s, g, { x: x, y: y, t: t });
                    if (r === 'hit') { catchStick(s, t); return 'hit'; }
                    if (r === 'early') { lose(s, true); return 'early'; }
                }
                return 'none';
            }
            field.addEventListener('pointerdown', function (e) {
                e.preventDefault();
                var p = kit.localPt(e, field);
                handleTap(p.x, p.y, kit.evT(e));
            });

            G.debug = {
                state: function () { return { level: level, state: state, misses: misses, resolved: resolved, cleared: cleared, len: len, g: g, FH: FH, sticks: sticks.map(function (s) { return s.state; }) }; },
                /* 模擬在第 i 根掉下去 sec 秒後點它（還沒鬆手就用 sec＝null 當搶按） */
                tapStick: function (i, secAfterRelease) {
                    var s = sticks[i];
                    if (!s) return 'no';
                    var t = s.relT == null ? performance.now() : s.relT + secAfterRelease * 1000;
                    var top = s.relT == null ? 0 : topAt(g, secAfterRelease);
                    return handleTap(s.cx, top + s.len / 2, t);
                },
                /* 接住目前所有正在掉的棍子（反應 0.25 秒） */
                catchFalling: function () {
                    var n = 0;
                    sticks.forEach(function (s, i) { if (s.state === 'fall') { var r = G.debug.tapStick(i, Math.max(REACT_MIN_S + 0.05, (performance.now() - s.relT) / 1000)); if (r === 'hit') n++; } });
                    return n;
                },
                releaseAll: function () { sticks.forEach(function (s) { release(s); }); }
            };
            my.after(500, startLevel);
        }

        round(1);
    }

    var G = {
        id: ID,
        name: '落下棍子',
        rule: '上面掛著六根棍子，會在不同時間掉下來。要在棍子掉出畫面之前點到它！點到還沒掉的棍子也算錯失。每一關只能錯失一根，棍子會越來越短喔！',
        mount: mount,
        test: { stickLen: stickLen, gravity: gravity, topAt: topAt, exitSec: exitSec, makeSchedule: makeSchedule, judgeTap: judgeTap, N: N, GAP_MIN: GAP_MIN, REACT_MIN_S: REACT_MIN_S, HIT_W: HIT_W, HIT_PAD: HIT_PAD, MISS_ALLOWED: MISS_ALLOWED }
    };
    Reaction.register(G);
})();
