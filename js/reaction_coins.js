/* ═══════════════════════════════════════════════════════════════════
   reaction_coins.js — 秒反應・零錢分類
   題目是一個數字（例如 137），桌上散著一堆硬幣，點選硬幣讓「已選的總和」剛好等於題目。
   ───────────────────────────────────────────────────────────────────
   【好不好玩，全看硬幣數量怎麼規劃】這一份是規劃邏輯（程式照這個做）：

   1. 先決定「答案」c_d＝每種幣值要拿幾枚，題目 N = Σ c_d × d。
   2. 再決定「桌上有幾枚」a_d = c_d + s_d（s_d 是多給的），每種幣值分三類：
        · 全拿  (tight) ：s_d = 0、c_d ≥ 1　→ 這種幣值桌上每一枚都要拿
        · 不能全拿(loose)：s_d ≥ 1、c_d ≥ 1　→ 只拿一部分，多拿就超過
        · 一枚都不能拿 (decoy)：c_d = 0、a_d ≥ 1　→ 整堆都是陷阱（第 5 關起才出現）
      每一題至少有 1 種「全拿」和 1 種「不能全拿」，玩家不能用同一個策略通吃。
   3. 答案必須唯一：用「上下界剪枝的窮舉」數出湊成 N 的方法有幾種，不是剛好 1 種就重抽。
      （唯一解的邏輯＝每一種幣值都被「兩頭夾住」：
        拿太少 → 剩下的小硬幣全加起來也補不滿；拿太多 → 超過 N。
        例：N=137，桌上 50×3、10×2、5×4、1×6。50 拿 1 枚的話，剩 87，小硬幣全部加起來
        才 46，補不滿；拿 3 枚 150 超過。所以 50 一定是 2 枚，依此類推。）
   4. 關卡一路往上調（全部線性）：
        · 第 1–2 關幣值 {10, 5, 1}，第 3–4 關加入 50，第 5 關起再加入 20
        · 每種幣值的「答案枚數」上限、「多給的枚數」上限、桌上硬幣總數上限隨關卡線性增加
        · 每一題的時間從 TIME_START 線性縮短到 TIME_END
        · 第 8 關起，一半的題目要求「由大到小盡量拿」這種直覺做法會失敗
          （有 20 元硬幣加入後才做得出這種題目）
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'coins';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var LEVEL_RAMP = 15;           /* 難度升到頂的關卡 */
    var TIME_START = 45, TIME_END = 25;     /* 每題限時（秒） */
    var COINS_START = 9, COINS_END = 26;    /* 桌上硬幣總數上限 */
    var MIN_START = 6, MIN_END = 17;        /* 桌上硬幣總數下限（避免後面的關卡硬幣還是很少） */
    var CNT_START = 2, CNT_END = 5;         /* 每種幣值「答案枚數」上限 */
    var SURP_START = 1, SURP_END = 4;       /* 每種幣值「多給」枚數上限 */
    var GREEDY_FROM = 8;           /* 第幾關起，一半題目要求直覺（由大到小）做法失敗 */
    var NEXT_MS = 1000;            /* 答對後多久進下一題 */
    var SIZE = { 50: 84, 20: 78, 10: 72, 5: 64, 1: 54 };       /* 硬幣直徑（邏輯 px） */

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 關'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function denomsFor(level) { return level <= 2 ? [10, 5, 1] : (level <= 4 ? [50, 10, 5, 1] : [50, 20, 10, 5, 1]); }
    function timeFor(level) { return kit.ramp(level, TIME_START, TIME_END, LEVEL_RAMP); }
    function cntMax(level, d) {
        var m = Math.round(kit.ramp(level, CNT_START, CNT_END, LEVEL_RAMP));
        if (d >= 20) return Math.min(m, 4);
        if (d === 1) return Math.min(6, m + 1);
        return m;
    }
    function surpMax(level) { return Math.round(kit.ramp(level, SURP_START, SURP_END, LEVEL_RAMP)); }
    function coinCap(level) { return Math.round(kit.ramp(level, COINS_START, COINS_END, LEVEL_RAMP)); }
    function coinMin(level) { return Math.round(kit.ramp(level, MIN_START, MIN_END, LEVEL_RAMP)); }

    /* 湊成 N 的方法有幾種（den 由大到小，a 是各幣值桌上枚數）；超過 2 種就不用再數 */
    function countSolutions(den, a, N) {
        var cnt = 0;
        (function rec(i, rem) {
            if (cnt > 1) return;
            if (i === den.length) { if (rem === 0) cnt++; return; }
            var d = den[i], cap = 0;
            for (var j = i + 1; j < den.length; j++) cap += a[j] * den[j];       /* 剩下的小硬幣全加起來最多能補多少 */
            var hi = Math.min(a[i], Math.floor(rem / d));                          /* 最多拿幾枚：不能超過 */
            var lo = Math.max(0, Math.ceil((rem - cap) / d));                      /* 最少拿幾枚：不然補不滿 */
            for (var x = hi; x >= lo; x--) rec(i + 1, rem - x * d);
        })(0, N);
        return cnt;
    }
    /* 「由大到小盡量拿」的直覺做法：成功回傳各幣值枚數，失敗回傳 null */
    function greedy(den, a, N) {
        var rem = N, out = [];
        for (var i = 0; i < den.length; i++) {
            var t = Math.min(a[i], Math.floor(rem / den[i]));
            out.push(t);
            rem -= t * den[i];
        }
        return rem === 0 ? out : null;
    }
    function sameCounts(x, y) {
        if (!x || !y) return false;
        for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
        return true;
    }

    /* 規劃一題：回傳 { den, c, a, N, kinds, greedyFails, coins }，kinds[i] 是 'tight'／'loose'／'decoy'／'none' */
    function plan(level, rand) {
        rand = rand || Math.random;
        var den = denomsFor(level);
        var needGF = level >= GREEDY_FROM && rand() < 0.5;
        var sMax = surpMax(level), cap = coinCap(level), capMin = coinMin(level);
        var pDecoy = level >= 5 ? 0.5 : 0;
        var minUsed = level <= 2 ? 2 : 3;        /* 答案裡至少用到幾種幣值 */
        /* 第一輪照要求（含「直覺做法失敗」）；找不到再放寬一次 */
        for (var pass = 0, tries = 0; pass < 2; pass++, tries = 0) for (; tries < 8000; tries++) {
            var c = den.map(function (d) {
                var m = cntMax(level, d);
                return rand() < 0.2 ? 0 : kit.randInt(Math.ceil(m / 2), m, rand);      /* 多數幣值都要拿一些，才會有一大堆硬幣 */
            });
            var used = c.filter(function (x) { return x > 0; }).length;
            if (used < minUsed) continue;
            var N = 0;
            c.forEach(function (x, i) { N += x * den[i]; });
            if (N < 20) continue;
            /* 桌上枚數：全拿／不能全拿／整堆不能拿 */
            var a = [], kinds = [], total = 0;
            c.forEach(function (x, i) {
                var s, kind;
                if (x === 0) {
                    if (rand() < pDecoy) { s = kit.randInt(1, 2, rand); kind = 'decoy'; } else { s = 0; kind = 'none'; }
                    a.push(s); kinds.push(kind); total += s; return;
                }
                if (rand() < 0.45) { s = 0; kind = 'tight'; } else { s = kit.randInt(1, sMax, rand); kind = 'loose'; }
                a.push(x + s); kinds.push(kind); total += x + s;
            });
            if (total > cap || total < Math.max(5, used + 2, capMin)) continue;
            if (kinds.indexOf('tight') < 0 || kinds.indexOf('loose') < 0) continue;
            if (countSolutions(den, a, N) !== 1) continue;                  /* 答案必須唯一 */
            var g = greedy(den, a, N);
            var gf = !sameCounts(g, c);
            if (needGF && pass === 0 && !gf) continue;
            return { den: den, c: c, a: a, N: N, kinds: kinds, greedyFails: gf, coins: total, tries: tries };
        }
        /* 保底：使用者的範例，137＝50×2＋10×2＋5×3＋1×2 */
        return { den: [50, 10, 5, 1], c: [2, 2, 3, 2], a: [3, 2, 4, 6], N: 137, kinds: ['loose', 'tight', 'loose', 'loose'], greedyFails: false, coins: 15, tries: -1 };
    }

    /* 把硬幣丟在桌上：隨機位置、互不重疊。回傳 [{d, x, y}] */
    function scatter(list, W, Hh, rand) {
        rand = rand || Math.random;
        var out = [];
        /* 大的先放，比較容易放得下 */
        list.slice().sort(function (p, q) { return q - p; }).forEach(function (d) {
            var r = SIZE[d] / 2, placed = null;
            for (var t = 0; t < 400 && !placed; t++) {
                var x = r + 4 + rand() * (W - 2 * r - 8), y = r + 4 + rand() * (Hh - 2 * r - 8);
                var ok = true;
                for (var i = 0; i < out.length; i++) {
                    var dx = out[i].x - x, dy = out[i].y - y, rr = r + SIZE[out[i].d] / 2 + 4;
                    if (dx * dx + dy * dy < rr * rr) { ok = false; break; }
                }
                if (ok) placed = { d: d, x: x, y: y };
            }
            if (!placed) {          /* 放不下就容許輕微重疊（幾乎不會發生：總面積有限制） */
                placed = { d: d, x: r + rand() * (W - 2 * r), y: r + rand() * (Hh - 2 * r) };
            }
            out.push(placed);
        });
        return kit.shuffle(out, rand);
    }

    function mount(root, ctx) {
        var R = null;

        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';
            var level = 1, cleared = 0, newRec = false;

            var target = h('div', { 'class': 'cn-target' });
            var sumLine = h('div', { 'class': 'cn-sum' });
            var table = h('div', { 'class': 'cn-table' });
            var bar = h('div', { 'class': 'ld-time' }, [h('div', { 'class': 'ld-time__fill' })]);
            var fill = bar.firstChild;
            var clearBtn = h('button', { 'class': 'btn btn--line btn--sm', text: '全部放回' });
            root.appendChild(target);
            root.appendChild(sumLine);
            root.appendChild(table);
            root.appendChild(bar);
            root.appendChild(clearBtn);

            var q = null, coins = [], sum = 0, state = 'idle', timer = null, loop = null;

            function meta() { ctx.setMeta(kit.meta(['第 ' + level + ' 關', fmtBest(Reaction.getBest(ID))])); }

            function paintSum() {
                if (!q) return;
                var diff = q.N - sum;
                sumLine.className = 'cn-sum' + (diff < 0 ? ' cn-sum--over' : '');
                sumLine.textContent = '已選 ' + sum + (diff < 0 ? '　超過了 ' + (-diff) : '　還差 ' + diff);
            }

            function toggle(co) {
                if (state !== 'play') return;
                co.on = !co.on;
                co.el.classList.toggle('cn-coin--on', co.on);
                sum += co.on ? co.d : -co.d;
                Sfx.play('click');
                paintSum();
                if (sum === q.N) solved();
            }

            clearBtn.addEventListener('pointerdown', function (e) {
                e.preventDefault();
                if (state !== 'play') return;
                coins.forEach(function (co) { co.on = false; co.el.classList.remove('cn-coin--on'); });
                sum = 0;
                paintSum();
            });

            function ask() {
                if (my.dead) return;
                meta();
                q = plan(level);
                /* 主控台：列出這一題的規劃，驗證「唯一解」與各幣值的類型 */
                try {
                    console.info('[零錢分類] 第 ' + level + ' 關 題目 ' + q.N + '：' + q.den.map(function (d, i) {
                        return d + ' 元 桌上 ' + q.a[i] + ' 枚（答案拿 ' + q.c[i] + '，' + ({ tight: '全拿', loose: '不能全拿', decoy: '一枚都不能拿', none: '沒有' })[q.kinds[i]] + '）';
                    }).join('、') + '；唯一解；直覺做法' + (q.greedyFails ? '會失敗' : '可行'));
                } catch (e) { }
                target.textContent = '湊出 ' + q.N;
                table.innerHTML = '';
                coins = []; sum = 0; state = 'play';
                var list = [];
                q.den.forEach(function (d, i) { for (var k = 0; k < q.a[i]; k++) list.push(d); });
                var pos = scatter(list, table.clientWidth, table.clientHeight);
                pos.forEach(function (p) {
                    var el = h('button', { 'class': 'cn-coin cn-coin--' + p.d, text: String(p.d) });
                    el.style.width = el.style.height = SIZE[p.d] + 'px';
                    el.style.left = (p.x - SIZE[p.d] / 2) + 'px';
                    el.style.top = (p.y - SIZE[p.d] / 2) + 'px';
                    var co = { d: p.d, el: el, on: false };
                    el.addEventListener('pointerdown', function (e) { e.preventDefault(); toggle(co); });
                    table.appendChild(el);
                    coins.push(co);
                });
                paintSum();
                var limit = timeFor(level) * 1000, t0 = performance.now();
                loop = my.loop(function (now) {
                    if (state !== 'play') return false;
                    fill.style.width = (100 * Math.max(0, 1 - (now - t0) / limit)).toFixed(1) + '%';
                });
                timer = my.after(limit, timeUp);
            }

            function solved() {
                state = 'won';
                my.cancel(timer); loop.stop();
                fill.style.width = '0%';
                cleared = level;
                if (Reaction.setBest(ID, cleared, function (v, b) { return v > b; })) newRec = true;
                coins.forEach(function (co) { if (co.on) co.el.classList.add('cn-coin--ok'); });
                sumLine.className = 'cn-sum cn-sum--ok';
                sumLine.textContent = '剛好 ' + q.N + '！';
                Sfx.play('win');
                level++;
                my.after(NEXT_MS, ask);
            }

            function timeUp() {
                if (state !== 'play') return;
                state = 'over';
                fill.style.width = '0%';
                /* 答案的硬幣用黃框標出來（每種幣值取前 c 枚） */
                var left = q.c.slice();
                coins.forEach(function (co) {
                    var i = q.den.indexOf(co.d);
                    if (left[i] > 0) { left[i]--; co.el.classList.add('cn-coin--answer'); }
                });
                sumLine.className = 'cn-sum cn-sum--over';
                sumLine.textContent = '時間到了';
                my.after(1800, function () {
                    var ans = q.den.map(function (d, i) { return q.c[i] > 0 ? d + ' 元 ×' + q.c[i] : null; }).filter(Boolean).join('、');
                    kit.result(root, {
                        num: cleared + ' 關', label: '時間到了',
                        lines: ['第 ' + level + ' 關要湊 ' + q.N, '答案：' + ans],
                        isNew: newRec, sfx: cleared >= 6 ? 'win' : 'fail', onAgain: round
                    });
                });
            }

            G.debug = {
                state: function () { return { level: level, state: state, sum: sum, q: q, cleared: cleared }; },
                /* 依答案點硬幣 */
                solve: function () {
                    if (state !== 'play') return state;
                    var left = q.c.slice();
                    coins.forEach(function (co) {
                        var i = q.den.indexOf(co.d);
                        if (left[i] > 0 && !co.on) { left[i]--; toggle(co); }
                    });
                    return state;
                },
                timeUp: timeUp
            };
            my.after(300, ask);
        }

        round();
    }

    var G = {
        id: ID,
        name: '零錢分類',
        rule: '上面是題目數字，桌上散著各種硬幣。點選硬幣，讓「已選」的總和剛好等於題目。答案只有一種：有的幣值要全部拿，有的只能拿一部分，有的一枚都不能拿！每題有時間限制，看你能過幾關。',
        mount: mount,
        test: { coinMin: coinMin, plan: plan, countSolutions: countSolutions, greedy: greedy, denomsFor: denomsFor, coinCap: coinCap, timeFor: timeFor, scatter: scatter, SIZE: SIZE, LEVEL_RAMP: LEVEL_RAMP }
    };
    Reaction.register(G);
})();
