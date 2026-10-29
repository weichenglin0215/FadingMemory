/* ═══════════════════════════════════════════════════════════════════
   reaction_seesaw.js — 秒反應・蹺蹺板比重（企劃 257；V1.36.0 改成「真正的槓桿」：重量 × 離支點的距離）
   公園的蹺蹺板。**一開始動物們就已經坐在蹺蹺板上**（左右各幾隻，板子是歪的）。玩家要**把動物拖到板子上合適的座位**，
   直到蹺蹺板**平衡**。動物**越大越重**（身上的數字就是重量）；板子上每個座位離支點 1、2、3… 格，**離支點越遠，這隻動物壓得越用力**——
   跟真的蹺蹺板一樣，平衡的條件是「左邊的 重量×格數 加起來 ＝ 右邊的 重量×格數 加起來」（物理上叫「力矩」）。
   ───────────────────────────────────────────────────────────────────
   · 為什麼這樣改（玩家意見）：舊版只看「左邊幾公斤、右邊幾公斤」，動物坐在哪裡一點關係也沒有，不像真的蹺蹺板；而且動物的大小跟重量無關，
     看不出誰重。現在：① 動物的大小跟著重量放大（size ＝ SIZE_BASE ＋ SIZE_STEP × 重量）；② 板子兩邊各有 S 個座位，座位上標著離支點的格數；
     ③ 平衡 ＝ 力矩相等：Σ（重量 × 座位格數，右邊為正、左邊為負）＝ 0；④ 傾斜角 ＝ 力矩差 × TILT_PER_UNIT（度）——離支點遠的重動物，一隻就能壓過好幾隻輕的。
   · 對人類來說難在哪（V1.36.0 的出題設計依據）：要同時想「誰重」和「放在哪格」兩件事，座位只有那幾個、一個座位只能坐一隻，
     可行的放法很少（有的題目只有一種）。第一直覺通常是「把重的放到另一邊」，可是力矩要剛好相等，往往得讓重的靠近支點、輕的放到遠處，
     甚至讓兩隻換座位；越後面，動物越多、座位越擠、有的動物被「固定」不能動（要繞著牠們排）、可行的放法越少。
   · 一定有解：出題（makeLevel）用窮舉（solve）算出「有幾種放法會平衡」（重量一樣的動物互換座位算同一種），第 1 關很多種，到頂只剩 MAX_SOLS[1] 種以內；
     而且從現在的放法到平衡，**最少要換 MOVES 隻的座位**，初始的力矩差不超過 DIFF_MAX（傾斜角才不會超過上限而看不出來）。
   · 難度（線性）：動物 3 → 7 隻（ANIMALS）、重量上限 3 → 9（WEIGHT_MAX）、每邊 4 個座位（SLOTS；動物越多座位越擠）、第 PIN_FROM 關起有 0 → 3 隻被固定（PINNED）、
     會平衡的放法上限 40 → 3 種（MAX_SOLS）、最少要換座位的隻數 1 → 2（MOVES_MIN）、限時 60 → 30 秒（TIME_S）。
   · 操作：把動物拖到板子上，放開時會**吸附到最近的座位**；放在別隻動物的座位上＝兩隻換位置（被固定的動物不能換）；放到板子外面＝回到原來的座位。
     拿起一隻動物，板子馬上重新計算、跟著傾斜，所以看傾斜角變了多少，就知道那隻的力矩是多少。
   · 過關：所有動物都坐在板上（沒有被拿在手上）、兩邊力矩一樣、板子靜止，就過關；動物們都笑了。限時內沒平衡：標出該換座位的動物，
     並在目標座位畫出虛線圓圈，指出一種可以平衡的放法。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'seesaw';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var ANIMALS = [3, 7];                       /* 動物隻數：第 1 關 → 到頂 */
    var WEIGHT_MAX = [3, 9];                    /* 動物重量上限（1～W）：第 1 關 → 到頂 */
    var SLOTS = [4, 4];                         /* 板子每一邊有幾個座位（離支點 1～S 格）：第 1 關 → 到頂。座位多了，會平衡的放法就暴增（實測 6 個座位時多半有上百種，等於亂放也會平衡），所以座位數固定 4，靠「動物變多、有的被固定」讓座位越來越擠 */
    var PINNED = [0, 3];                        /* 被固定、不能拖動的動物隻數：到了 PIN_FROM 關起才有，這裡是（第 1 關 → 到頂）的線性值 */
    var PIN_FROM = 8;                           /* 第幾關起才有被固定的動物 */
    var MOVES = [1, 4];                         /* 從初始放法到平衡「最少要換幾隻的座位」的上限：第 1 關 → 到頂 */
    var MOVES_MIN = [1, 2];                     /* 同上的下限：第 1 關 → 到頂（太少＝只要動一下就好，太簡單） */
    var MAX_SOLS = [40, 3];                     /* 「會平衡的放法」（重量一樣的動物互換座位算同一種）最多有幾種：第 1 關 → 到頂（放法越少越難試出來） */
    var TIME_S = [60, 30];                      /* 每關限時（秒）：第 1 關 → 到頂 */
    var TILT_PER_UNIT = 1.5, TILT_MAX = 36;     /* 力矩差每 1 單位，蹺蹺板傾斜幾度；最多傾斜幾度 */
    var DIFF_MAX = Math.floor(TILT_MAX / TILT_PER_UNIT);      /* 初始力矩差上限（再大傾斜角就卡在上限、量不出來） */
    var SIZE_BASE = 22, SIZE_STEP = 5;          /* 動物的大小（px）＝ SIZE_BASE ＋ SIZE_STEP × 重量：越重越大（重 1 ＝ 27px、重 9 ＝ 67px，差 2.5 倍；實測 4px 一階時，重 3 和重 5 看起來幾乎一樣大，而且動物的圖有留白，畫出來比方框小） */
    var SPRING = { omega: 9, zeta: 0.5 };       /* 蹺蹺板傾斜的彈簧動畫：角頻率、阻尼比（小於 1 會有一點彈跳） */
    var SETTLE_MS = 350;                        /* 平衡之後要靜止多久才算過關 */
    var SOLVE_CAP = 400;                        /* 數「會平衡的放法」時，數到這麼多就停（超過上限的題目不要，不用數更多） */
    var MAX_LEVEL = 90;
    var SPECIES = [                             /* 動物（id 對應 CSS 的 .sea-an--id 與 theme 的毛色變數） */
        { id: 'bear', name: '熊' }, { id: 'pig', name: '豬' }, { id: 'dog', name: '狗' }, { id: 'cat', name: '貓' },
        { id: 'rabbit', name: '兔' }, { id: 'chick', name: '雞' }, { id: 'panda', name: '貓熊' }
    ];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return Math.round(kit.ramp(level, pair[0], pair[1], RAMP_LEVELS)); }
    function nFor(level) { return ramp(level, ANIMALS); }
    function weightMaxFor(level) { return ramp(level, WEIGHT_MAX); }
    function slotsFor(level) { return ramp(level, SLOTS); }
    function pinnedFor(level) { return level < PIN_FROM ? 0 : ramp(level, PINNED); }
    function movesRange(level) { return [ramp(level, MOVES_MIN), ramp(level, MOVES)]; }
    function maxSolsFor(level) { return ramp(level, MAX_SOLS); }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }
    /* 動物的大小（px）：越重越大 */
    function sizeOf(weight) { return SIZE_BASE + SIZE_STEP * weight; }
    /* 兩邊的力矩：pos[i] 是座位（左邊 −S～−1、右邊 1～S，離支點的格數；0＝被拿在手上，不算）。
       回傳 { l（左邊 重量×格數 的總和）, r（右邊的）, net（右 − 左；大於 0 ＝右邊下沉）} */
    function torqueOf(weights, pos) {
        var l = 0, r = 0;
        for (var i = 0; i < weights.length; i++) { if (pos[i] < 0) l += weights[i] * -pos[i]; else if (pos[i] > 0) r += weights[i] * pos[i]; }
        return { l: l, r: r, net: r - l };
    }
    /* 蹺蹺板的目標傾斜角（度，CSS rotate 順時針為正）：右邊的力矩大 → 右邊下沉 → 順時針 → 正角度 */
    function angleFor(net) { return kit.clamp(TILT_PER_UNIT * net, -TILT_MAX, TILT_MAX); }
    /* 窮舉所有「會平衡的放法」：fixedPos[i] 不為 0 的動物是被固定的（不能動）；其他動物可以坐到任何沒人坐的座位（−S～−1、1～S）。
       pos0 是現在的放法（算「最少要換幾隻」用）；數到 cap 種就停。
       回傳 { count（會平衡的放法有幾種，最多 cap ＋ 1）, moves（最近的一種要換幾隻的座位）, best（那一種的座位陣列）}；沒有解 count ＝ 0。
       做法：重的先放（剪枝比較有效）；每放一隻，如果「剩下的動物就算全部放在最遠的座位也補不回目前的力矩差」就不用往下找。 */
    function solve(weights, fixedPos, pos0, S, cap) {
        var n = weights.length, order = [], i, base = 0, used = {};
        for (i = 0; i < n; i++) { if (fixedPos[i]) { used[fixedPos[i]] = true; base += weights[i] * fixedPos[i]; } else order.push(i); }
        order.sort(function (a, b) { return weights[b] - weights[a] || a - b; });
        var rem = [], acc = 0;
        for (i = order.length - 1; i >= 0; i--) { acc += weights[order[i]] * S; rem[i] = acc; }
        rem[order.length] = 0;
        /* 重量一樣的動物長得一樣大、力道也一樣，互換座位算同一種放法：所以同重量的動物，座位編號一定要由小到大（只數一種） */
        var init = {};                                              /* init[重量]：現在坐著這個重量的（可以動的）動物的座位集合，算「最少要換幾隻」用 */
        order.forEach(function (a) { (init[weights[a]] = init[weights[a]] || {})[pos0[a]] = true; });
        var count = 0, best = null, bestMoves = 99, cur = pos0.slice();
        for (i = 0; i < n; i++) if (fixedPos[i]) cur[i] = fixedPos[i];
        function leaf() {
            var kept = 0, k, w;
            for (k = 0; k < order.length; k++) { w = weights[order[k]]; if (init[w][cur[order[k]]]) kept++; }
            var moves = order.length - kept;
            count++;
            if (moves < bestMoves) { bestMoves = moves; best = cur.slice(); }
        }
        function dfs(k, net) {
            if (count > cap) return;
            if (k === order.length) { if (net === 0) leaf(); return; }
            if (Math.abs(net) > rem[k]) return;
            var a = order[k], w = weights[a], minS = -S;
            if (k > 0 && weights[order[k - 1]] === w) minS = cur[order[k - 1]] + 1;                  /* 同重量：座位編號要比前一隻大 */
            for (var s = minS; s <= S; s++) {
                if (!s || used[s]) continue;
                used[s] = true; cur[a] = s;
                dfs(k + 1, net + w * s);
                used[s] = false;
            }
        }
        dfs(0, base);
        return { count: count, moves: bestMoves, best: best };
    }
    /* x（板子上的水平位置，單位：格；支點在 0）最接近的座位：回傳 −S～−1 或 1～S（靠近支點的 0 附近看 x 的正負決定哪一邊） */
    function nearestSlot(x, S) {
        var s = Math.round(x);
        if (s === 0) s = x < 0 ? -1 : 1;
        return Math.max(-S, Math.min(S, s));
    }
    /* 要放在座位 want（已經被別隻坐了或被固定）時，改坐哪個空座位：由近到遠找（先同一邊再另一邊）；found 是「已經有人坐的座位」的集合；沒有空位回傳 0 */
    function freeSlotNear(want, taken, S) {
        for (var d = 0; d <= 2 * S; d++) {
            var cands = d === 0 ? [want] : [want - d, want + d];
            for (var k = 0; k < cands.length; k++) { var s = cands[k]; if (s && s >= -S && s <= S && !taken[s]) return s; }
        }
        return 0;
    }
    /* 出一關：{ n, kinds（動物編號，對應 SPECIES）, weights, pos（初始座位）, fixed（被固定的動物：true／false 陣列）, S（每邊座位數）, net（初始力矩差，右 − 左）, sols（會平衡的放法有幾種）, best（solve 的結果）, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var n = nFor(level), W = weightMaxFor(level), S = slotsFor(level), np = Math.min(pinnedFor(level), n - 2), mr = movesRange(level), maxSols = maxSolsFor(level);
        var allSlots = []; for (var q = -S; q <= S; q++) if (q) allSlots.push(q);
        for (var tr = 0; tr < 4000; tr++) {
            var weights = [], i;
            for (i = 0; i < n; i++) weights.push(kit.randInt(1, W, rand));
            if (weights.every(function (x) { return x === weights[0]; })) continue;
            var slots = kit.shuffle(allSlots, rand), pos = [], fixedPos = [], fixed = [];
            for (i = 0; i < n; i++) { pos.push(slots[i]); fixed.push(i < np); fixedPos.push(i < np ? slots[i] : 0); }
            var net = torqueOf(weights, pos).net;
            if (Math.abs(net) < 2 || Math.abs(net) > DIFF_MAX) continue;
            var left = pos.filter(function (x) { return x < 0; }).length;
            if (left === 0 || left === n) continue;                                        /* 一邊空空的：太明顯 */
            var sol = solve(weights, fixedPos, pos, S, maxSols);
            if (sol.count < 1 || sol.count > maxSols) continue;                            /* 沒有解，或放法太多（太容易試出來） */
            if (sol.moves < mr[0] || sol.moves > mr[1]) continue;
            var kinds = kit.shuffle(SPECIES.map(function (sp, k) { return k; }), rand).slice(0, n);
            return { n: n, kinds: kinds, weights: weights, pos: pos, fixed: fixed, S: S, net: net, sols: sol.count, best: sol, level: level };
        }
        /* 保底：熊 3 在右 1 格、豬 1 在右 2 格、狗 2 在左 1 格（右 5、左 2，差 3）；各 3 隻都能動，搬一隻就平衡（豬 1 搬到左 3 格：左 2＋3＝5） */
        var fw = [3, 1, 2], fp = [1, 2, -1], fx = [false, false, false];
        return { n: 3, kinds: [0, 2, 1], weights: fw, pos: fp, fixed: fx, S: 4, net: 3, sols: 1, best: solve(fw, [0, 0, 0], fp, 4, SOLVE_CAP), level: level };
    }
    function rating(n) {
        if (n >= 25) return '蹺蹺板大師！';
        if (n >= 15) return '力矩算得很準！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '重的靠近支點、輕的放遠一點，再來一次！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'sea-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 動物的臉（SVG）：毛色由 CSS 的 .sea-an--種類 決定；不同動物的耳朵、鼻子不一樣 */
    function animalSvg(id) {
        var s = kit.svg('svg', { 'class': 'sea-face', viewBox: '0 0 60 60', width: 60, height: 60 });
        function el(tag, attrs, cls) { attrs['class'] = cls; return kit.svg(tag, attrs, s); }
        /* 耳朵（畫在臉後面） */
        if (id === 'bear' || id === 'panda') { el('circle', { cx: 13, cy: 17, r: 8 }, 'sea-ear' + (id === 'panda' ? ' sea-ear--dark' : '')); el('circle', { cx: 47, cy: 17, r: 8 }, 'sea-ear' + (id === 'panda' ? ' sea-ear--dark' : '')); }
        if (id === 'pig' || id === 'cat') { el('path', { d: 'M9 24 L13 6 L26 16 Z' }, 'sea-ear'); el('path', { d: 'M51 24 L47 6 L34 16 Z' }, 'sea-ear'); }
        if (id === 'dog') { el('ellipse', { cx: 11, cy: 30, rx: 7, ry: 14 }, 'sea-ear sea-ear--dark2'); el('ellipse', { cx: 49, cy: 30, rx: 7, ry: 14 }, 'sea-ear sea-ear--dark2'); }
        if (id === 'rabbit') { el('ellipse', { cx: 21, cy: 11, rx: 6, ry: 15 }, 'sea-ear'); el('ellipse', { cx: 39, cy: 11, rx: 6, ry: 15 }, 'sea-ear'); }
        if (id === 'chick') { el('path', { d: 'M30 10 Q26 2 22 6 Q27 6 28 12 Z M30 10 Q34 2 38 6 Q33 6 32 12 Z' }, 'sea-ear'); }
        el('circle', { cx: 30, cy: 35, r: 21 }, 'sea-head');
        if (id === 'panda') { el('ellipse', { cx: 22, cy: 32, rx: 5, ry: 7 }, 'sea-patch'); el('ellipse', { cx: 38, cy: 32, rx: 5, ry: 7 }, 'sea-patch'); }
        el('circle', { cx: 22, cy: 32, r: 2.8 }, 'sea-eye'); el('circle', { cx: 38, cy: 32, r: 2.8 }, 'sea-eye');
        if (id === 'pig') { el('ellipse', { cx: 30, cy: 42, rx: 8, ry: 6 }, 'sea-snout'); el('circle', { cx: 27, cy: 42, r: 1.4 }, 'sea-eye'); el('circle', { cx: 33, cy: 42, r: 1.4 }, 'sea-eye'); }
        else if (id === 'chick') el('path', { d: 'M25 40 L35 40 L30 47 Z' }, 'sea-beak');
        else if (id === 'cat') { el('path', { d: 'M26 40 L34 40 L30 44 Z' }, 'sea-nose'); el('path', { d: 'M8 38 L19 40 M8 44 L19 43 M52 38 L41 40 M52 44 L41 43' }, 'sea-whisker'); }
        else { el('ellipse', { cx: 30, cy: 41, rx: 4, ry: 3 }, 'sea-nose'); }
        el('path', { d: 'M24 48 Q30 51 36 48' }, 'sea-mouth');                  /* 平常的嘴（一條淡淡的線） */
        el('path', { d: 'M22 46 Q30 56 38 46' }, 'sea-smile');                  /* 平衡時的笑（平常是藏起來的） */
        return s;
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand), n = q.n, weights = q.weights, pos = q.pos.slice(), S = q.S;
        api.info = q;
        console.log('[蹺蹺板比重] 第 ' + level + ' 關：' + n + ' 隻動物 ' + q.kinds.map(function (k, i) { return SPECIES[k].name + weights[i] + '@' + pos[i] + (q.fixed[i] ? '（固定）' : ''); }).join('、') + '；初始力矩 左 ' + torqueOf(weights, pos).l + '／右 ' + torqueOf(weights, pos).r + '（差 ' + q.net + '）；' + q.sols + ' 種平衡放法，最少換 ' + q.best.moves + ' 隻；限時 ' + timeMs(level) + ' ms');

        var field = h('div', { 'class': 'sea-field' });                  /* 這一關專用的容器：所有東西和事件監聽都放在裡面，換關時整個丟掉 */
        var W = stage.clientWidth || 472, PL = Math.min(W - 12, 460), PX = W / 2, PY = 380, HALF = PL / 2, DS = (HALF - 20) / S;          /* DS：相鄰座位的間距（px） */
        stage.appendChild(field);
        field.appendChild(h('div', { 'class': 'qz-note sea-tip', text: '動物越大越重；座位離支點越遠，壓得越用力（重量×格數）' }));
        var pivot = h('div', { 'class': 'sea-pivot' });
        pivot.style.cssText = 'left:' + (PX - 40) + 'px;top:' + (PY + 6) + 'px;';
        field.appendChild(pivot);
        var board = h('div', { 'class': 'sea-board' });
        board.style.cssText = 'left:' + (PX - HALF) + 'px;top:' + (PY - 8) + 'px;width:' + PL + 'px;';
        field.appendChild(board);
        /* 座位的刻度：每個座位一個小刻痕，下面寫著離支點幾格 */
        for (var sl = -S; sl <= S; sl++) {
            if (!sl) continue;
            var tick = h('div', { 'class': 'sea-slot', text: String(Math.abs(sl)) });
            tick.style.left = (HALF + sl * DS - 14) + 'px';
            board.appendChild(tick);
        }
        var aim = h('div', { 'class': 'sea-aim' });                       /* 拖曳時，標出「放開會坐到哪個座位」的虛線圓圈 */
        aim.style.display = 'none'; board.appendChild(aim);
        var info = h('div', { 'class': 'qz-note sea-info', text: '' });
        info.style.top = (PY + 128) + 'px';
        field.appendChild(info);

        /* 動物們 */
        var els = [];
        q.kinds.forEach(function (k, i) {
            var sp = SPECIES[k], el = h('div', { 'class': 'sea-an sea-an--' + sp.id + (q.fixed[i] ? ' sea-an--pin' : '') }), sz = sizeOf(weights[i]);
            el.style.width = el.style.height = sz + 'px';
            el.setAttribute('data-i', String(i));                                 /* 第幾隻（測試用） */
            el.appendChild(animalSvg(sp.id));
            el.appendChild(h('div', { 'class': 'sea-badge', text: String(weights[i]) }));
            if (q.fixed[i]) el.appendChild(h('div', { 'class': 'sea-pintag', text: '固定' }));
            els.push(el);
            if (!q.fixed[i]) kit.onTap(el, function (e) { startDrag(i, e); });
        });
        /* 放回板子上：每隻動物坐在自己的座位（越重的越大，所以輕的疊在重的前面，才不會被擋住） */
        function seat() {
            for (var i = 0; i < n; i++) {
                if (!pos[i]) continue;
                var el = els[i], sz = sizeOf(weights[i]);
                if (el.parentNode !== board) board.appendChild(el);
                el.style.left = (HALF + pos[i] * DS - sz / 2) + 'px';
                el.style.zIndex = String(60 - weights[i]);
            }
        }
        seat();
        var lastPos = q.pos.slice();                                             /* 每隻動物上一次坐的座位（放到板子外面時回去） */
        var held = -1, drag = null, over = false, angle = 0, vel = 0, settle = 0, won = false;
        function target() { return angleFor(torqueOf(weights, pos).net); }
        angle = target(); board.style.transform = 'rotate(' + angle.toFixed(3) + 'deg)';
        api.my.loop(function (now, dt) {
            if (!board.isConnected) return false;                                /* 換關了（板子已經被丟掉）：迴圈停止 */
            var d = Math.min(dt, 50) / 1000, tgt = target();
            /* 彈簧：加速度 = −ω²(角度 − 目標) − 2ζω × 角速度 */
            vel += (-SPRING.omega * SPRING.omega * (angle - tgt) - 2 * SPRING.zeta * SPRING.omega * vel) * d;
            angle += vel * d;
            board.style.transform = 'rotate(' + angle.toFixed(3) + 'deg)';
            /* 平衡而且靜止一小段時間 → 過關 */
            var t = torqueOf(weights, pos);
            if (!won && !over && held < 0 && t.net === 0 && Math.abs(angle) < 0.4 && Math.abs(vel) < 2) { settle += d * 1000; if (settle >= SETTLE_MS) win(); } else settle = 0;
        });
        api.timer(timeMs(level), function () { timeout(); });
        if (level === 1 && kit.once('seesaw.hint')) {
            var mv = -1; for (var m = 0; m < n; m++) if (!q.fixed[m] && q.best.best[m] !== pos[m]) { mv = m; break; }
            if (mv >= 0) {
                var ts = q.best.best[mv], tx = PX + ts * DS;                      /* 提示：拖到「平衡的放法裡那個座位」 */
                api.after(0, function () { kit.hintOn(stage, els[mv], { mode: 'drag', to: { x: tx, y: PY - 30 }, delay: 700, text: '把動物拖到另一個座位' }); });
            }
        }

        /* 手指的位置換算成「板子上的水平位置（格）」：板子會傾斜，所以先把手指的位置轉回水平（反向旋轉 angle 度） */
        function slotAt(p) {
            var th = angle * Math.PI / 180, dx = p.x - PX, dy = p.y - PY, lx = dx * Math.cos(th) + dy * Math.sin(th), ly = -dx * Math.sin(th) + dy * Math.cos(th);
            if (Math.abs(lx) > HALF + 24 || ly < -170 || ly > 60) return 0;      /* 不在板子上 */
            return nearestSlot(lx / DS, S);
        }
        function takenSlots(except) { var t = {}; for (var i = 0; i < n; i++) if (i !== except && pos[i]) t[pos[i]] = true; return t; }
        function showAim(s) {
            if (!s) { aim.style.display = 'none'; return; }
            var sz = sizeOf(weights[drag.i]);
            aim.style.display = ''; aim.style.width = aim.style.height = sz + 'px'; aim.style.left = (HALF + s * DS - sz / 2) + 'px';
        }
        function startDrag(i, e) {
            if (drag || over || won) return;
            var p = kit.localPt(e, field);
            try { field.setPointerCapture(e.pointerId); } catch (err) { }
            drag = { i: i, id: e.pointerId };
            lastPos[i] = pos[i]; held = i; pos[i] = 0;                                                    /* 離開板子：不算在任何一邊，板子馬上重新計算、開始傾斜 */
            var el = els[i]; field.appendChild(el); el.classList.add('sea-an--held'); el.style.zIndex = '90';
            moveHeld(p);
            seat();
            info.textContent = '';
        }
        function moveHeld(p) {
            var el = els[drag.i], sz = sizeOf(weights[drag.i]);
            el.style.left = (p.x - sz / 2) + 'px'; el.style.top = (p.y - sz / 2) + 'px'; el.style.bottom = 'auto';
            var s = slotAt(p); showAim(s ? freeSlotFor(s, drag.i) : 0);
        }
        /* 放在座位 s：沒人坐＝就是 s；別隻（可以動的）坐著＝換位置的話會坐 s；被固定的動物坐著＝改坐最近的空座位 */
        function freeSlotFor(s, i) {
            var taken = takenSlots(i), who = -1;
            for (var k = 0; k < n; k++) if (k !== i && pos[k] === s) who = k;
            if (who < 0) return s;
            if (!q.fixed[who] && lastPos[i]) return s;                                                  /* 可以換位置 */
            return freeSlotNear(s, taken, S) || lastPos[i];
        }
        field.addEventListener('pointermove', function (e) { if (drag && e.pointerId === drag.id) moveHeld(kit.localPt(e, field)); });
        function drop(e) {
            if (!drag || e.pointerId !== drag.id) return;
            var i = drag.i, p = kit.localPt(e, field), el = els[i];
            drag = null; held = -1; el.classList.remove('sea-an--held'); el.style.top = ''; el.style.bottom = ''; aim.style.display = 'none';
            var s = slotAt(p), dest = lastPos[i];                                                       /* 放到板子外面：回到原來的座位 */
            if (s) {
                var want = freeSlotFor(s, i), who = -1;
                for (var k = 0; k < n; k++) if (k !== i && pos[k] === want) who = k;
                if (who >= 0) { pos[who] = lastPos[i]; lastPos[who] = pos[who]; }                       /* 換位置：對方坐到我原來的座位 */
                dest = want;
            }
            pos[i] = dest; lastPos[i] = dest;
            seat();
            if (s) { el.classList.remove('sea-an--drop'); void el.offsetWidth; el.classList.add('sea-an--drop'); }                 /* 坐上去有一點彈跳 */
            Sfx.play('pop');
        }
        field.addEventListener('pointerup', drop);
        field.addEventListener('pointercancel', drop);

        function win() {
            if (won || api.over) return;
            won = true; stage.classList.add('sea-happy');
            var t = torqueOf(weights, pos);
            info.textContent = '兩邊的力矩都是 ' + t.l + '，平衡了！';
            kit.flash(stage, true, api.my);
            api.pass({ delay: 1800 });
        }
        function timeout() {
            if (won || api.over) return;
            over = true;
            if (drag) { var i0 = drag.i; drag = null; held = -1; els[i0].classList.remove('sea-an--held'); els[i0].style.top = ''; els[i0].style.bottom = ''; aim.style.display = 'none'; pos[i0] = lastPos[i0] || 1; }
            seat();
            /* 指出一種平衡的放法：從現在的座位找最近的平衡放法，該換座位的動物圍上綠框，目標座位畫虛線圓圈 */
            var fixedPos = q.fixed.map(function (f, i) { return f ? pos[i] : 0; }), sol = solve(weights, fixedPos, pos, S, SOLVE_CAP);
            if (sol.best) {
                for (var i = 0; i < n; i++) {
                    if (sol.best[i] === pos[i]) continue;
                    els[i].classList.add('sea-an--move');
                    var sz = sizeOf(weights[i]), ghost = h('div', { 'class': 'sea-ghost', text: String(weights[i]) });
                    ghost.style.width = ghost.style.height = sz + 'px'; ghost.style.left = (HALF + sol.best[i] * DS - sz / 2) + 'px';
                    board.appendChild(ghost);
                }
            }
            var names = sol.best ? sol.best.map(function (s, i) { return s !== pos[i] ? SPECIES[q.kinds[i]].name + '（重 ' + weights[i] + '）→ ' + (s < 0 ? '左 ' : '右 ') + Math.abs(s) + ' 格' : ''; }).filter(Boolean).join('、') : '';
            info.textContent = sol.best ? '時間到！綠框的動物搬到虛線圓圈就平衡了' : '時間到！';
            kit.flash(stage, false, api.my);
            api.fail({ delay: 3400, lines: ['時間到！蹺蹺板還沒平衡', sol.best ? '一種平衡的放法：' + names : ''] });
        }
        /* 驗證用：api.solve 照最近的一種平衡放法坐好；api.wrong 直接當作時間到 */
        api.solve = function () { for (var i = 0; i < n; i++) { pos[i] = q.best.best[i]; lastPos[i] = pos[i]; } seat(); };
        api.wrong = function () { timeout(); };
    }

    var G = {
        id: ID,
        name: '蹺蹺板比重',
        rule: '蹺蹺板上一開始就坐著幾隻動物，板子是歪的。**動物越大越重**（身上的數字是重量），**座位離支點越遠，壓得越用力**：每隻動物的力道＝重量×離支點的格數。**把動物拖到合適的座位，讓兩邊的力道加起來一樣**，蹺蹺板就平衡了。放在別隻動物的座位上會換位置，帶「固定」的動物不能動。拿起一隻動物，板子會跟著傾斜，看傾斜角變了多少，就知道那隻的力道。在時間內讓蹺蹺板平衡就過關，看你能過幾關。越後面，動物越多、越重、座位越擠！',
        mount: mount,
        score: SCORE,
        test: {
            nFor: nFor, weightMaxFor: weightMaxFor, slotsFor: slotsFor, pinnedFor: pinnedFor, movesRange: movesRange, maxSolsFor: maxSolsFor, timeMs: timeMs, sizeOf: sizeOf, torqueOf: torqueOf, angleFor: angleFor, solve: solve,
            nearestSlot: nearestSlot, freeSlotNear: freeSlotNear, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, ANIMALS: ANIMALS, WEIGHT_MAX: WEIGHT_MAX, SLOTS: SLOTS, PINNED: PINNED, PIN_FROM: PIN_FROM, MOVES: MOVES, MOVES_MIN: MOVES_MIN, MAX_SOLS: MAX_SOLS, TIME_S: TIME_S,
            TILT_PER_UNIT: TILT_PER_UNIT, TILT_MAX: TILT_MAX, DIFF_MAX: DIFF_MAX, SIZE_BASE: SIZE_BASE, SIZE_STEP: SIZE_STEP, SPRING: SPRING, SETTLE_MS: SETTLE_MS, SOLVE_CAP: SOLVE_CAP, SPECIES: SPECIES, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
