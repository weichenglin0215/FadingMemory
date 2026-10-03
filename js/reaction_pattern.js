/* ═══════════════════════════════════════════════════════════════════
   reaction_pattern.js — 秒反應・解鎖圖案
   像手機的圖案解鎖：先看一次示範的連線，再用手指在點陣上畫出同樣的圖案。
   圖案一關比一關長，看你最長能記住幾個點。
   ───────────────────────────────────────────────────────────────────
   · 規則跟手機一樣：同一個點不能重複經過；從 a 連到 b，如果線段中間剛好還有
     沒走過的點（例如左上角連到右上角，中間的點在線上），中間那個點會被自動吃進去；
     已經走過的中間點可以直接「跳過」。產生圖案時用同一套規則，所以每個圖案
     都只有「唯一一種」畫法，不會有玩家畫得跟答案不同、其實也合法的模糊情形。
   · 判定很即時：畫到第 k 個點時，只要跟答案的第 k 個點不一樣就立刻判錯（不用畫完）；
     畫滿長度就立刻判對（不用等放開手指）。
   · 關卡：第 1～6 關在 3×3 點陣，圖案 4～9 個點；第 7 關起換 4×4 點陣，圖案
     8 個點起，每關 +1，最長 14 個點。示範每段的時間、回想的時限都線性調整。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'pattern';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var LEVEL_MAX = 13;         /* 最後一關（過了就是全破） */
    var BIG_FROM_LEVEL = 7;     /* 這一關起換 4×4 點陣 */
    var DEMO_STEP_START = 420, DEMO_STEP_END = 230;   /* 示範每一段線的時間（毫秒），線性縮短 */
    var RECALL_BASE = 6, RECALL_PER = 0.9;            /* 回想時限（秒）＝基本 + 每個點加幾秒 */
    var SNAP_R = 42;            /* 指尖進入多大半徑才吸附到點 */
    var NODE_R = 30;            /* 點的繪製半徑 */
    var PREP_MS = 700;
    var RESULT_DELAY_MS = 1300;

    function fmtBest(v) { return v == null ? '' : '最長 ' + v + ' 點'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function gridFor(level) { return level >= BIG_FROM_LEVEL ? 4 : 3; }
    function lenFor(level) { return level >= BIG_FROM_LEVEL ? Math.min(14, level + 1) : 3 + level; }
    function gcd(a, b) { return b ? gcd(b, a % b) : a; }
    /* 線段 a→b 之間（不含兩端）剛好落在其他格點上的點，依序 */
    function between(g, a, b) {
        var ra = Math.floor(a / g), ca = a % g, rb = Math.floor(b / g), cb = b % g;
        var dr = rb - ra, dc = cb - ca, k = gcd(Math.abs(dr), Math.abs(dc));
        var out = [];
        for (var i = 1; i < k; i++) out.push((ra + dr / k * i) * g + (ca + dc / k * i));
        return out;
    }
    /* 這個節點序列是否是合法圖案：不重複，且每一段線中間的點都已經走過 */
    function validPath(g, path) {
        var seen = {};
        for (var i = 0; i < path.length; i++) {
            if (seen[path[i]]) return false;
            if (i > 0) {
                var bt = between(g, path[i - 1], path[i]);
                for (var j = 0; j < bt.length; j++) if (!seen[bt[j]]) return false;
            }
            seen[path[i]] = true;
        }
        return true;
    }
    /* 隨機產生一個長度 len 的合法圖案（深度優先＋隨機順序，走不下去就退回去換） */
    function genPath(g, len, rand) {
        rand = rand || Math.random;
        var all = [];
        for (var i = 0; i < g * g; i++) all.push(i);
        function dfs(path, seen) {
            if (path.length === len) return path.slice();
            var last = path[path.length - 1];
            var cand = kit.shuffle(all, rand);
            for (var k = 0; k < cand.length; k++) {
                var b = cand[k];
                if (seen[b]) continue;
                var bt = between(g, last, b), okAll = true;
                for (var j = 0; j < bt.length; j++) if (!seen[bt[j]]) { okAll = false; break; }
                if (!okAll) continue;
                seen[b] = true; path.push(b);
                var r = dfs(path, seen);
                if (r) return r;
                path.pop(); delete seen[b];
            }
            return null;
        }
        for (var tries = 0; tries < 50; tries++) {
            var s = Math.floor(rand() * g * g), seen0 = {};
            seen0[s] = true;
            var r = dfs([s], seen0);
            if (r) return r;
        }
        return null;
    }

    function mount(root, ctx) {
        var R = null;
        var bestLen = 0;           /* 這一局最長成功的圖案長度 */
        var newRec = false;

        function round(level) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            level = level || 1;
            root.innerHTML = '';
            ctx.setMeta(kit.meta(['第 ' + level + ' 關', fmtBest(Reaction.getBest(ID))]));

            var g = gridFor(level), len = lenFor(level);
            var target = genPath(g, len) || genPath(g, 4);
            var hint = h('div', { 'class': 'hint', text: '看好圖案怎麼連…' });
            var barWrap = h('div', { 'class': 'ld-time' }, [h('div', { 'class': 'ld-time__fill' })]);
            var fill = barWrap.firstChild;
            var field = h('div', { 'class': 'pt-field' });
            root.appendChild(hint);
            root.appendChild(field);
            root.appendChild(barWrap);
            var FW = field.clientWidth, FH = field.clientHeight;
            var svg = kit.svg('svg', { 'class': 'pt-svg', viewBox: '0 0 ' + FW + ' ' + FH, preserveAspectRatio: 'none' }, field);

            var side = Math.min(FW - 90, FH - 90);
            var S = side / (g - 1);
            var cx = FW / 2, cy = FH / 2;
            function nx(i) { return cx + (i % g - (g - 1) / 2) * S; }
            function ny(i) { return cy + (Math.floor(i / g) - (g - 1) / 2) * S; }

            var gLines = kit.svg('g', {}, svg);
            var live = kit.svg('line', { 'class': 'pt-live', x1: 0, y1: 0, x2: 0, y2: 0, visibility: 'hidden' }, svg);
            var nodes = [];
            for (var i = 0; i < g * g; i++) {
                nodes.push(kit.svg('circle', { 'class': 'pt-node', cx: nx(i), cy: ny(i), r: NODE_R }, svg));
            }
            function seg(a, b, cls) {
                return kit.svg('line', { 'class': 'pt-seg ' + (cls || ''), x1: nx(a), y1: ny(a), x2: nx(b), y2: ny(b) }, gLines);
            }

            var state = 'demo';
            var path = [];
            var activeId = null;
            var finger = null;

            /* ─── 示範 ─── */
            var stepMs = kit.ramp(level, DEMO_STEP_START, DEMO_STEP_END, LEVEL_MAX);
            var demo = my.wait(PREP_MS).then(function () {
                nodes[target[0]].classList.add('pt-node--start');
                Sfx.play('flip');
                return my.wait(450);
            });
            for (var k = 1; k < target.length; k++) {
                (function (k) {
                    demo = demo.then(function () {
                        var a = target[k - 1], b = target[k];
                        var line = seg(a, b, 'pt-seg--demo');
                        line.setAttribute('x2', nx(a)); line.setAttribute('y2', ny(a));
                        nodes[b].classList.add('pt-node--on');
                        Sfx.play('tick');
                        return my.tween(stepMs, function (e) {
                            line.setAttribute('x2', nx(a) + (nx(b) - nx(a)) * e);
                            line.setAttribute('y2', ny(a) + (ny(b) - ny(a)) * e);
                        }, kit.linear);
                    });
                })(k);
            }
            demo.then(function () { return my.wait(500); }).then(function () {
                gLines.innerHTML = '';
                nodes.forEach(function (n) { n.setAttribute('class', 'pt-node'); });
                state = 'recall';
                hint.textContent = '換你畫！手指拖過每個點';
                Sfx.play('go');
                var limit = (RECALL_BASE + RECALL_PER * len) * 1000, t0 = performance.now();
                my.loop(function (now) {
                    if (state !== 'recall') return false;
                    fill.style.width = (100 * Math.max(0, 1 - (now - t0) / limit)).toFixed(1) + '%';
                });
                my.after(limit, function () { if (state === 'recall') fail('時間到了'); });
            });

            /* ─── 回想：畫線 ─── */
            function nodeNear(x, y) {
                var best = -1, bd = SNAP_R * SNAP_R;
                for (var i = 0; i < g * g; i++) {
                    var dx = nx(i) - x, dy = ny(i) - y, d = dx * dx + dy * dy;
                    if (d <= bd) { bd = d; best = i; }
                }
                return best;
            }
            function localPt(e) {
                var r = field.getBoundingClientRect();
                return { x: (e.clientX - r.left) * FW / r.width, y: (e.clientY - r.top) * FH / r.height };
            }
            function addNode(n) {
                /* 先吃進中間沒走過的點（手機的規則），再加 n；每加一個就檢查對不對 */
                var chain = [];
                if (path.length) {
                    between(g, path[path.length - 1], n).forEach(function (m) { if (path.indexOf(m) < 0) chain.push(m); });
                }
                chain.push(n);
                for (var i = 0; i < chain.length; i++) {
                    var m = chain[i];
                    if (path.indexOf(m) >= 0) continue;
                    if (path.length) seg(path[path.length - 1], m, 'pt-seg--mine');
                    path.push(m);
                    nodes[m].classList.add('pt-node--on');
                    Sfx.play('tick');
                    if (path[path.length - 1] !== target[path.length - 1]) { fail('這個點不對喔'); return; }
                    if (path.length === target.length) { succeed(); return; }
                }
            }
            function onDown(e) {
                if (state !== 'recall') return;
                e.preventDefault();
                activeId = e.pointerId;
                try { field.setPointerCapture(e.pointerId); } catch (err) { }
                var p = localPt(e);
                finger = p;
                var n = nodeNear(p.x, p.y);
                if (n >= 0 && path.indexOf(n) < 0 && path.length === 0) addNode(n);
            }
            function onMove(e) {
                if (state !== 'recall' || e.pointerId !== activeId) return;
                var p = localPt(e);
                /* 沿著手指移動的線段每 8px 檢查一次，快速拖過也不會漏掉中間的點 */
                var from = finger || p;
                var dist = Math.hypot(p.x - from.x, p.y - from.y), steps = Math.max(1, Math.ceil(dist / 8));
                for (var s = 1; s <= steps && state === 'recall'; s++) {
                    var x = from.x + (p.x - from.x) * s / steps, y = from.y + (p.y - from.y) * s / steps;
                    var n = nodeNear(x, y);
                    if (n >= 0 && path.indexOf(n) < 0) addNode(n);
                }
                finger = p;
                if (state === 'recall' && path.length) {
                    var last = path[path.length - 1];
                    live.setAttribute('x1', nx(last)); live.setAttribute('y1', ny(last));
                    live.setAttribute('x2', p.x); live.setAttribute('y2', p.y);
                    live.setAttribute('visibility', 'visible');
                }
            }
            function onUp(e) {
                if (e.pointerId !== activeId) return;
                activeId = null; finger = null;
                live.setAttribute('visibility', 'hidden');
                /* 放開手指時圖案還沒畫完：不算錯，把畫到一半的線清掉，讓玩家在時限內重畫
                   （手滑放開是常有的事，直接判失敗太苛刻） */
                if (state === 'recall' && path.length > 0 && path.length < target.length) {
                    path = [];
                    gLines.innerHTML = '';
                    nodes.forEach(function (n) { n.setAttribute('class', 'pt-node'); });
                    Sfx.play('bad');
                }
            }
            field.addEventListener('pointerdown', onDown);
            field.addEventListener('pointermove', onMove);
            field.addEventListener('pointerup', onUp);
            field.addEventListener('pointercancel', onUp);
            my.onDispose(function () {
                field.removeEventListener('pointerdown', onDown);
                field.removeEventListener('pointermove', onMove);
                field.removeEventListener('pointerup', onUp);
                field.removeEventListener('pointercancel', onUp);
            });

            function succeed() {
                state = 'ok';
                live.setAttribute('visibility', 'hidden');
                Array.prototype.forEach.call(gLines.children, function (l) { l.setAttribute('class', 'pt-seg pt-seg--ok'); });
                Sfx.play('win');
                fill.style.width = '0%';
                bestLen = Math.max(bestLen, len);
                if (Reaction.setBest(ID, bestLen, function (v, b) { return v > b; })) newRec = true;
                ctx.setMeta(kit.meta(['第 ' + level + ' 關', fmtBest(Reaction.getBest(ID))]));
                hint.textContent = '答對了！';
                if (level >= LEVEL_MAX) {
                    my.after(900, function () {
                        kit.result(root, { num: '最長 ' + bestLen + ' 點', label: '全部記住了，太厲害了！', sfx: 'perfect', isNew: newRec, onAgain: restart });
                    });
                    return;
                }
                my.after(1000, function () { round(level + 1); });
            }

            function fail(reason) {
                if (state === 'fail') return;
                state = 'fail';
                live.setAttribute('visibility', 'hidden');
                fill.style.width = '0%';
                hint.textContent = reason + '，正確的圖案是這樣：';
                /* 把我畫的線標橘色，再疊上正確答案（綠色虛線） */
                Array.prototype.forEach.call(gLines.children, function (l) { l.setAttribute('class', 'pt-seg pt-seg--bad'); });
                for (var k = 1; k < target.length; k++) seg(target[k - 1], target[k], 'pt-seg--answer');
                nodes[target[0]].classList.add('pt-node--start');
                my.after(RESULT_DELAY_MS, function () {
                    kit.result(root, {
                        num: bestLen ? '最長 ' + bestLen + ' 點' : '再試一次',
                        label: reason,
                        lines: ['這一關的圖案有 ' + len + ' 個點'],
                        sfx: bestLen >= 6 ? 'win' : 'fail', isNew: newRec, onAgain: restart
                    });
                });
            }

            G.debug = {
                state: function () { return { level: level, g: g, len: len, state: state, path: path.slice(), target: target.slice() }; },
                nodePos: function (i) { var r = field.getBoundingClientRect(); return { x: r.left + nx(i) * r.width / FW, y: r.top + ny(i) * r.height / FH }; },
                field: field
            };
        }

        function restart() { bestLen = 0; newRec = false; round(1); }
        round(1);
    }

    var G = {
        id: ID,
        name: '解鎖圖案',
        rule: '像手機的圖案解鎖：先看一次示範的連線，再用手指在點陣上畫出同樣的圖案，不能重複經過同一個點。圖案一關比一關長，看你最長能記住幾個點！',
        mount: mount,
        test: { gridFor: gridFor, lenFor: lenFor, between: between, validPath: validPath, genPath: genPath, LEVEL_MAX: LEVEL_MAX }
    };
    Reaction.register(G);
})();
