/* ═══════════════════════════════════════════════════════════════════
   reaction_seq.js — 秒反應・猜下一個
   一排圖案有規律，猜猜「下一個」應該長什麼樣子，從 4 個選項裡點出來。
   ───────────────────────────────────────────────────────────────────
   · 一個圖案有 4 個屬性：形狀、顏色、旋轉角度、大小。每一題挑 nAttr 個屬性「會變」，其他屬性固定不變。
       形狀／顏色：長度 K（2～3）的循環，例如 圓→方→圓→方…（K=2）或 紅→藍→綠→紅…（K=3）。
       旋轉：每一步轉固定角度（±45°、±90°），所以要有「看得出轉了幾度」的形狀（三角形、箭頭、半圓、房子、L 形）。
       大小：變大再變小的波形（a, a+1, a+2, a+1 重複）、或一路變大、或一路變小，共 6 級。
   · 序列由規則直接算出 6 個圖案，前 5 個顯示，第 6 個就是答案。
   · 答案唯一（consistentNext）：把「規則空間」整個窮舉一遍——循環週期 1～3、旋轉步長（45° 的倍數）、
     大小的 3 種家族——凡是跟畫面上 5 個圖案吻合的規則，推出來的下一個必須只有一種，才收這一題（否則重抽）。
   · 選項：4 個，3 個干擾項各自「只改正解的一個屬性」；4 個選項的「看起來的樣子」（visualKey，
     旋轉要考慮形狀的對稱，例如圓形轉再多度也一樣）必須兩兩不同。
   · 難度（第 1 → LEVEL_RAMP 題線性）：會變的屬性數 1 → 3、循環長度 K 2 → 3、每題限時 15 → 8 秒。
   · 機會 LIVES 次（答錯或超時各 −1）；成績＝答對題數（越大越好）。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'seq';
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 難度從第 1 題線性變到第 LEVEL_RAMP 題：會變的屬性數、循環長度、限時 */
    var LEVEL_RAMP = 20;
    var ATTR_START = 1, ATTR_END = 3;
    var K_START = 2, K_END = 3;
    var TIME_START = 15, TIME_END = 8;
    var LIVES = 2;
    /* 顯示幾個圖案（第 SHOWN+1 個是答案） */
    var SHOWN = 5;                           /* 顯示幾個圖案（第 SHOWN+1 個是答案）*/
    var NEXT_MS = 1000, WRONG_MS = 3200;
    var SIZE_MAX = 6;

    /* 對稱的形狀（轉了看不出差異）／不對稱的形狀（轉了看得出來），後者才適合考「旋轉」 */
    var SHAPES_SYM = ['circle', 'square', 'hexagon', 'cross'];
    var SHAPES_ASYM = ['tri', 'arrow', 'half', 'house', 'ell'];
    /* 轉幾度會看起來一樣：圓形 0＝怎麼轉都一樣；正方形 90 度；六角形 60 度；不對稱形狀 360 度 */
    /* 轉幾度會看起來一樣：0＝怎麼轉都一樣（圓形）*/
    var ROT_PERIOD = { circle: 0, square: 90, hexagon: 60, cross: 90, tri: 360, arrow: 360, half: 360, house: 360, ell: 360 };
    var SHAPE_NAME = { circle: '圓形', square: '方形', hexagon: '六角形', cross: '十字', tri: '三角形', arrow: '箭頭', half: '半圓', house: '房子形', ell: 'L 形' };
    var COLOR_NAME = ['藍', '橘', '綠', '黃', '紅'];
    var ATTRS = ['shape', 'color', 'rotation', 'size'];
    var ROT_STEPS = [45, 90, -45, -90];
    /* 大小的「波形」：0,1,2,1 重複＝變大再變小 */
    var WAVE = [0, 1, 2, 1];

    /* 純函式（也給 Node 測試用） */
    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 這一題有幾個屬性會變 */
    function nAttrFor(level) { return Math.round(kit.ramp(level, ATTR_START, ATTR_END, LEVEL_RAMP)); }
    /* 循環的長度 K */
    function kFor(level) { return Math.round(kit.ramp(level, K_START, K_END, LEVEL_RAMP)); }
    /* 這一題限時 */
    function timeFor(level) { return kit.ramp(level, TIME_START, TIME_END, LEVEL_RAMP); }
    /* 取餘數，確保結果是正數（JS 的 % 對負數會得到負數，所以多加一次） */
    function mod(a, m) { return ((a % m) + m) % m; }

    /* 循環規則：試週期 1～3，凡是與畫面上前幾個吻合的，推出下一個值。回傳所有可能的答案（要確保只有一個） */
    /* 循環規則：週期 1～3 且與 values 吻合的，推出的下一個值（回傳不重複的陣列）*/
    function nextCycle(values) {
        var out = [];
        for (var p = 1; p <= 3; p++) {
            var okp = true;
            for (var i = p; i < values.length; i++) if (values[i] !== values[i - p]) { okp = false; break; }
            if (okp) { var v = values[values.length - p]; if (out.indexOf(v) < 0) out.push(v); }
        }
        return out;
    }
    /* 旋轉規則：試每步轉 0、45、90…315 度，凡是與前幾個吻合的，推出下一個角度 */
    /* 旋轉：步長是 45° 的倍數，與 values 吻合的，推出的下一個角度 */
    function nextRotation(values) {
        var out = [];
        for (var s = 0; s < 8; s++) {
            var d = s * 45, okp = true;
            for (var i = 1; i < values.length; i++) if (mod(values[i] - values[i - 1] - d, 360) !== 0) { okp = false; break; }
            if (okp) { var v = mod(values[values.length - 1] + d, 360); if (out.indexOf(v) < 0) out.push(v); }
        }
        return out;
    }
    /* 大小規則：固定、每步 +1、每步 −1、波形 a,a+1,a+2,a+1，四種都檢查 */
    /* 大小：固定、每步 +1、每步 −1（下一個要在 1～SIZE_MAX 內）、波形 a,a+1,a+2,a+1 */
    function nextSize(values) {
        var out = [], n = values.length, i;
        function add(v) { if (v >= 1 && v <= SIZE_MAX && out.indexOf(v) < 0) out.push(v); }
        var c = true; for (i = 1; i < n; i++) if (values[i] !== values[0]) c = false;
        if (c) add(values[0]);
        [1, -1].forEach(function (d) { var okp = true; for (i = 1; i < n; i++) if (values[i] - values[i - 1] !== d) okp = false; if (okp) add(values[n - 1] + d); });
        for (var a = 1; a + 2 <= SIZE_MAX; a++) for (var ph = 0; ph < 4; ph++) {
            var okw = true; for (i = 0; i < n; i++) if (values[i] !== a + WAVE[(i + ph) % 4]) okw = false;
            if (okw) add(a + WAVE[(n + ph) % 4]);
        }
        return out;
    }
    /* 窮舉所有規則，看每個屬性「下一個」有幾種可能的答案 */
    /* 整個序列的下一個圖案是否唯一：回傳每個屬性推得出的候選數 */
    function consistentNext(shown) {
        var col = function (k) { return shown.map(function (it) { return it[k]; }); };
        return { shape: nextCycle(col('shape')), color: nextCycle(col('color')), rotation: nextRotation(col('rotation')), size: nextSize(col('size')) };
    }
    /* 每個屬性都只有一種可能 → 答案唯一（出題的品質檢查） */
    function isUnique(shown) { var c = consistentNext(shown); return ATTRS.every(function (k) { return c[k].length === 1; }); }
    /* 「看起來的樣子」字串：形狀＋顏色＋旋轉（考慮對稱，圓形不管轉幾度都一樣）＋大小。用來確保 4 個選項看起來都不同 */
    function visualKey(it) {
        var per = ROT_PERIOD[it.shape];
        return it.shape + '|' + it.color + '|' + (per ? mod(it.rotation, per) : 0) + '|' + it.size;
    }

    /* 出一題：隨機決定哪些屬性會變，依規則算出 6 個圖案（前 5 個顯示，第 6 個是答案） */
    /* 出一題 */
    function makeSequence(level, rand) {
        rand = rand || Math.random;
        /* 最多嘗試 200 次，直到產生答案唯一、選項合格的題目 */
        for (var tries = 0; tries < 200; tries++) {
            var nAttr = nAttrFor(level), K = kFor(level);
            /* vary：這題會變的屬性 */
            var vary = kit.shuffle(ATTRS.slice(), rand).slice(0, nAttr);
            var has = function (a) { return vary.indexOf(a) >= 0; };
            var rules = { vary: vary, K: K };
            /* 形狀規則 */
            /* 形狀 */
            var pool = has('rotation') ? SHAPES_ASYM : SHAPES_SYM.concat(SHAPES_ASYM);
            rules.shapes = has('shape') ? kit.shuffle(pool.slice(), rand).slice(0, K) : [kit.pick(pool, rand)];
            /* 顏色規則 */
            /* 顏色 */
            rules.colors = has('color') ? kit.shuffle([0, 1, 2, 3, 4], rand).slice(0, K) : [kit.randInt(0, 4, rand)];
            /* 旋轉規則 */
            /* 旋轉：沒有變的時候固定 0 度（對稱形狀轉了也看不出來）*/
            rules.rotStart = has('rotation') ? 45 * kit.randInt(0, 7, rand) : 0;
            rules.rotStep = has('rotation') ? kit.pick(ROT_STEPS, rand) : 0;
            /* 大小規則 */
            /* 大小 */
            if (has('size')) {
                rules.sizeKind = kit.pick(['wave', 'up', 'down'], rand);
                rules.sizeA = kit.randInt(1, SIZE_MAX - 2, rand); rules.sizePh = kit.randInt(0, 3, rand);
            } else { rules.sizeKind = 'const'; rules.sizeA = kit.randInt(3, 5, rand); rules.sizePh = 0; }
            /* 依規則算出前 6 個圖案 */
            var items = [];
            for (var i = 0; i <= SHOWN; i++) items.push(itemAt(rules, i));
            var shown = items.slice(0, SHOWN);
            /* 答案不唯一就重抽 */
            if (!isUnique(shown)) continue;
            var cn = consistentNext(shown);
            var ans = items[SHOWN];
            /* 自我檢查：窮舉推出的答案必須和規則算出的答案一樣 */
            if (cn.shape[0] !== ans.shape || cn.color[0] !== ans.color || cn.rotation[0] !== ans.rotation || cn.size[0] !== ans.size) continue;     /* 自我檢查：窮舉得到的答案要等於規則算出的答案 */
            var opt = makeOptions(shown, ans, rules, rand);
            if (!opt) continue;
            return { level: level, rules: rules, shown: shown, answer: ans, options: opt.options, correct: opt.correct };
        }
        throw new Error('seq: cannot build a sequence');
    }
    /* 算出第 i 個圖案：形狀和顏色是循環，旋轉是等差，大小依家族而定 */
    function itemAt(rules, i) {
        var size;
        if (rules.sizeKind === 'const') size = rules.sizeA;
        else if (rules.sizeKind === 'up') size = 1 + i;
        else if (rules.sizeKind === 'down') size = SIZE_MAX - i;
        else size = rules.sizeA + WAVE[(i + rules.sizePh) % 4];
        return { shape: rules.shapes[i % rules.shapes.length], color: rules.colors[i % rules.colors.length], rotation: mod(rules.rotStart + rules.rotStep * i, 360), size: size };
    }
    /* 3 個干擾項：各自只改正解的一個屬性，並確保 4 個選項看起來都不同 */
    /* 3 個干擾項：各自只改正解的一個屬性；4 個選項看起來都不同 */
    function makeOptions(shown, ans, rules, rand) {
        var list = [ans], keys = {}; keys[visualKey(ans)] = true;
        var attrsPref = kit.shuffle(ATTRS.slice(), rand);
        for (var tries = 0; tries < 120 && list.length < 4; tries++) {
            var a = attrsPref[tries % 4], d = { shape: ans.shape, color: ans.color, rotation: ans.rotation, size: ans.size };
            if (a === 'shape') d.shape = kit.pick((rules.vary.indexOf('rotation') >= 0 ? SHAPES_ASYM : SHAPES_SYM.concat(SHAPES_ASYM)).filter(function (s) { return s !== ans.shape; }), rand);
            else if (a === 'color') d.color = kit.pick([0, 1, 2, 3, 4].filter(function (c) { return c !== ans.color; }), rand);
            else if (a === 'rotation') d.rotation = mod(ans.rotation + kit.pick([45, 90, 135, 180, 225, 270, 315], rand), 360);
            else d.size = kit.pick([1, 2, 3, 4, 5, 6].filter(function (s) { return Math.abs(s - ans.size) >= 1; }), rand);
            var k = visualKey(d);
            if (keys[k]) continue;
            keys[k] = true; list.push(d);
        }
        if (list.length < 4) return null;
        var order = kit.shuffle([0, 1, 2, 3], rand);
        return { options: order.map(function (i) { return list[i]; }), correct: order.indexOf(0) };
    }
    /* 把規律拆開用文字說明（答錯時顯示） */
    /* 把規律拆開說明 */
    function explain(seq) {
        var r = seq.rules, out = [];
        if (r.vary.indexOf('shape') >= 0) out.push('形狀：' + r.shapes.concat([r.shapes[0]]).map(function (s) { return SHAPE_NAME[s]; }).join('→') + '…重複');
        if (r.vary.indexOf('color') >= 0) out.push('顏色：' + r.colors.concat([r.colors[0]]).map(function (c) { return COLOR_NAME[c]; }).join('→') + '…重複');
        if (r.vary.indexOf('rotation') >= 0) out.push('旋轉：每次' + (r.rotStep > 0 ? '順時針' : '逆時針') + '轉 ' + Math.abs(r.rotStep) + ' 度');
        if (r.vary.indexOf('size') >= 0) out.push('大小：' + (r.sizeKind === 'up' ? '一個比一個大' : r.sizeKind === 'down' ? '一個比一個小' : '變大再變小，一直重複'));
        return out;
    }
    /* 依答對題數給評語 */
    function rating(n) {
        if (n >= 20) return '規律偵探！';
        if (n >= 12) return '眼光很準！';
        if (n >= 6) return '不錯喔！';
        return '再試一次，會更準！';
    }

    /* 畫圖案：每個形狀都在半徑 48 以內，所以旋轉後也不會超出畫布 */
    /* ── 畫圖案 ──
       每個形狀都放在以 (50,50) 為圓心、半徑 48 以內的範圍，所以怎麼轉都不會超出 100×100 的畫布 */
    /* shapeSvg：依形狀、顏色、旋轉、大小畫出一個圖案（SVG） */
    function shapeSvg(it) {
        var svg = kit.svg('svg', { 'class': 'sq-svg', viewBox: '0 0 100 100' });
        var scale = 0.45 + 0.11 * (it.size - 1);
        /* transform 的順序：先移到圓心、旋轉、縮放，再移回原位，這樣是繞著圖案中心旋轉與縮放 */
        var g = kit.svg('g', { transform: 'translate(50 50) rotate(' + it.rotation + ') scale(' + scale.toFixed(3) + ') translate(-50 -50)' }, svg);
        var cls = 'sq-shape sq-c' + it.color;
        /* switch：依形狀名稱選擇要畫的圖形（case 是各種情況） */
        switch (it.shape) {
            case 'circle': kit.svg('circle', { 'class': cls, cx: 50, cy: 50, r: 40 }, g); break;
            case 'square': kit.svg('rect', { 'class': cls, x: 19, y: 19, width: 62, height: 62 }, g); break;
            case 'hexagon': kit.svg('polygon', { 'class': cls, points: '50,8 86.4,29 86.4,71 50,92 13.6,71 13.6,29' }, g); break;
            case 'cross': kit.svg('polygon', { 'class': cls, points: '36,10 64,10 64,36 90,36 90,64 64,64 64,90 36,90 36,64 10,64 10,36 36,36' }, g); break;
            case 'tri': kit.svg('polygon', { 'class': cls, points: '50,6 88.1,72 11.9,72' }, g); break;
            case 'arrow': kit.svg('polygon', { 'class': cls, points: '50,6 90,50 66,50 66,92 34,92 34,50 10,50' }, g); break;
            case 'half': kit.svg('path', { 'class': cls, d: 'M8 72 A42 42 0 0 1 92 72 Z' }, g); break;
            case 'house': kit.svg('polygon', { 'class': cls, points: '50,6 90,40 76,90 24,90 10,40' }, g); break;
            default: kit.svg('polygon', { 'class': cls, points: '26,12 52,12 52,56 80,56 80,84 26,84' }, g);       /* ell */
        }
        return svg;
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        var R = null;

        /* startAt：從第幾關開始（失敗後可從前 5 關繼續）*/
        /* round：開一局 */
        function round(startAt) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            /* q 目前第幾題；correctN 答對數；lives 機會；S 這題；state 目前階段；token 流水號 */
            var q = (startAt || 1) - 1, correctN = q, lives = LIVES, S = null, state = 'idle', token = 0, newRec = false, t0 = 0;
            /* 建立畫面元素：標題、時間條、上方圖案列、問題、四個選項、說明 */
            var head = h('div', { 'class': 'sq-head', text: ' ' });
            var tb = kit.timebar();
            var row = h('div', { 'class': 'sq-row' });
            var ask = h('div', { 'class': 'sq-ask', text: '下一個是哪一個？' });
            var opts = h('div', { 'class': 'sq-opts' });
            var note = h('div', { 'class': 'sq-note', text: ' ' });
            [head, tb.el, row, ask, opts, note].forEach(function (x) { root.appendChild(x); });
            function meta() { ctx.setMeta(kit.meta(['答對 ' + correctN, '機會 ' + lives])); }

            /* 出下一題 */
            function nextQ() {
                if (my.dead) return;
                q++;
                /* 產生這題 */
                S = makeSequence(q);
                var id = ++token, limit = timeFor(q);
                state = 'play';
                head.textContent = '第 ' + q + ' 題';
                note.textContent = ' ';
                row.innerHTML = ''; opts.innerHTML = '';
                /* 上排顯示前 5 個圖案和一個「？」 */
                S.shown.forEach(function (it) { row.appendChild(h('div', { 'class': 'sq-cell' }, [shapeSvg(it)])); });
                row.appendChild(h('div', { 'class': 'sq-cell sq-cell--q', text: '？' }));
                /* 四個選項按鈕 */
                S.options.forEach(function (it, k) {
                    var b = h('button', { 'class': 'btn sq-opt' }, [shapeSvg(it)]);
                    b.addEventListener('pointerdown', function (e) { e.preventDefault(); choose(k); });
                    opts.appendChild(b);
                });
                meta();
                t0 = performance.now();
                /* 主控台印出這題的規律與答案位置 */
                try { console.info('[猜下一個] 第 ' + q + ' 題：會變 ' + S.rules.vary.join('、') + '（K=' + S.rules.K + '）；' + explain(S).join('；') + '；答案是第 ' + (S.correct + 1) + ' 個；限時 ' + limit.toFixed(1) + ' 秒'); } catch (e) { }
                tb.set(1);
                /* 倒數 */
                my.loop(function (now) {
                    if (id !== token || state !== 'play') return false;
                    tb.set(1 - (now - t0) / (limit * 1000));
                });
                /* 時間到：settle(-1) 代表沒選 */
                my.after(limit * 1000, function () { if (id === token && state === 'play') settle(-1); });
            }

            function choose(k) { if (state === 'play') settle(k); }

            /* 結算這題：把「？」換成正解，標出對錯 */
            function settle(k) {
                state = 'reveal'; token++;
                tb.set(0);
                var okAns = k === S.correct;
                /* 把「？」換成正解 */
                var qcell = row.lastChild; qcell.className = 'sq-cell'; qcell.textContent = ''; qcell.appendChild(shapeSvg(S.answer));
                [].forEach.call(opts.children, function (b, i) { b.disabled = true; if (i === S.correct) b.classList.add('sq-opt--ok'); else if (i === k) b.classList.add('sq-opt--bad'); });
                /* 答對：稍後出下一題 */
                if (okAns) {
                    correctN++;
                    if (Reaction.setBest(ID, correctN, function (v, b) { return v > b; })) newRec = true;
                    note.textContent = '答對了！';
                    Sfx.play('win'); meta();
                    my.after(NEXT_MS, nextQ);
                    return;
                }
                /* 答錯：扣機會並顯示規律的說明 */
                lives--; meta();
                var exp = explain(S);
                note.textContent = (k < 0 ? '時間到。' : '') + '規律：' + exp.join('；');
                Sfx.play('bad');
                /* 還有機會就繼續；沒有機會 → 結算，kit.resumeFrom 可以從前 5 題繼續 */
                if (lives > 0) { my.after(WRONG_MS, nextQ); return; }
                my.after(WRONG_MS, function () {
                    var back = kit.resumeFrom(q);
                        kit.result(root, {
                        num: String(correctN), label: rating(correctN),
                        lines: ['第 ' + q + ' 題沒猜中，規律是：'].concat(exp),
                        isNew: newRec && correctN > 0, sfx: correctN >= 6 ? 'win' : 'fail', onAgain: function () { round(1); },
                            resume: { level: back, run: function () { round(back); } }
                    });
                });
            }

            /* G.debug：測試用後門 */
            G.debug = {
                state: function () { return { q: q, correctN: correctN, lives: lives, state: state, correct: S && S.correct, vary: S && S.rules.vary, shownN: S && S.shown.length, optionsN: S && S.options.length }; },
                choose: choose,
                chooseRight: function () { choose(S.correct); },
                chooseWrong: function () { choose((S.correct + 1) % 4); }
            };
            /* 開場等 400 毫秒再出第一題 */
            my.after(400, nextQ);
        }

        round(1);
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '猜下一個',
        rule: '上面一排圖案有規律：形狀、顏色、方向或大小，會照著某種順序改變。看出規律，從下面四個選項裡，點出「下一個」應該長什麼樣子。每題有時間限制，規律會越來越難發現！',
        mount: mount,
        /* test 匯出純函式給 Node 自動測試 */
        test: { nAttrFor: nAttrFor, kFor: kFor, timeFor: timeFor, nextCycle: nextCycle, nextRotation: nextRotation, nextSize: nextSize, consistentNext: consistentNext, isUnique: isUnique, visualKey: visualKey, makeSequence: makeSequence, itemAt: itemAt, makeOptions: makeOptions, explain: explain, rating: rating, LEVEL_RAMP: LEVEL_RAMP, SHOWN: SHOWN, SIZE_MAX: SIZE_MAX, SHAPES_ASYM: SHAPES_ASYM, SHAPES_SYM: SHAPES_SYM }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();
