/* ═══════════════════════════════════════════════════════════════════
   reaction_seenchars.js — 秒反應・看過的字（企劃 324）
   畫面閃出 2 → 6 個字（3 → 2 秒），收起來。接著出現一個 3×3 → 5×5 的字格，**點出剛才看過的那幾個字**，點完按「好了」。
   ───────────────────────────────────────────────────────────────────
   · 干擾項全部是「形近字」（共用資料庫 js/similar_chars.js 的 SimilarChars）：看過「侍」，字格裡就有「待、持、特、恃」。
     出題（makeLevel）：先挑 k 組不同的形近字群（平均筆劃落在這一關的範圍，越後面筆劃越多＝越難），每組挑一個當「看過的字」，
     字格裡再放這些字的「同組形近字」當干擾（先放每個看過的字的夥伴，不夠再從別的字群補），洗牌排成 G×G。
   · 判定：你點的字的集合要「剛好等於」看過的字的集合（少點、多點、點錯都算錯）。
   · 難度（線性）：字數 2 → 6（K）、字格 3×3 → 5×5（GRID）、看的時間 3 → 2 秒（VIEW_S）、字群的平均筆劃範圍 3～8 → 8～20（STROKES）、作答時間 20 → 12 秒（RESP_S）。
   · 答錯時把「看過的字」跟「你點的字」並排：每一個看過的字旁邊放你點的那個形近字，**差異的筆劃用紅色標出**
     （用畫布把兩個字畫出來、比對每個像素：只有其中一個字有筆畫的地方塗紅）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'seenchars';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var K = [2, 6];                             /* 要記幾個字：第 1 關 → 到頂 */
    var GRID = [3, 5];                          /* 字格邊長：第 1 關 → 到頂 */
    var VIEW_S = [3, 2];                        /* 看字的時間（秒）：第 1 關 → 到頂 */
    var STROKES_LO = [3, 8], STROKES_HI = [8, 20];   /* 字群的平均筆劃範圍（下限、上限）：第 1 關 → 到頂 */
    var RESP_S = [20, 12];                      /* 作答時間（秒）：第 1 關 → 到頂 */
    var MIN_GROUP = 4;                          /* 字群至少幾個字（才有足夠的形近字當干擾） */
    var MAX_LEVEL = 90;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }
    function kFor(level) { return Math.round(ramp(level, K)); }
    function gridFor(level) { return Math.round(ramp(level, GRID)); }
    function viewMs(level) { return Math.round(ramp(level, VIEW_S) * 1000); }
    function respMs(level) { return Math.round(ramp(level, RESP_S) * 1000); }
    function strokeRange(level) { return [ramp(level, STROKES_LO), ramp(level, STROKES_HI)]; }
    /* 出一關：{ k, G, seen（看過的字）, grid（G×G 個字，由左到右由上到下）, seenIdx（看過的字在格子裡的位置）, groups（用到的字群，每個是一串字）, strokes（範圍）, viewMs, respMs, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var k = kFor(level), G = gridFor(level), cells = G * G, rng = strokeRange(level);
        /* 挑 k 個「字完全不重疊」的字群（有的字同時出現在兩個字群裡，兩組都選會讓字格裡出現同一個字兩次）；範圍內不夠就放寬到全部字群 */
        function pickGroups(pool) {
            var out = [], taken = {};
            kit.shuffle(pool.slice(), rand).forEach(function (g) {
                if (out.length >= k || g.chars.some(function (c) { return taken[c]; })) return;
                out.push(g); g.chars.forEach(function (c) { taken[c] = true; });
            });
            return out;
        }
        var picks = pickGroups(SimilarChars.groups({ minSize: MIN_GROUP, minStrokes: rng[0], maxStrokes: rng[1] }));
        if (picks.length < k) picks = pickGroups(SimilarChars.groups({ minSize: MIN_GROUP }));
        var seen = [], used = {};
        picks.forEach(function (g) { var c = kit.pick(g.chars, rand); seen.push(c); used[c] = true; });
        /* 干擾：先放看過的字的夥伴（每組各輪流取，越前面的越像），不夠再從其他字群補 */
        var grid = seen.slice(), mi = 0, byGroup = picks.map(function (g, i) { return g.chars.filter(function (x) { return x !== seen[i]; }); });
        for (var round = 0; grid.length < cells && round < 8; round++) for (var gi = 0; gi < byGroup.length && grid.length < cells; gi++) { var c2 = byGroup[gi][round]; if (c2 && !used[c2]) { used[c2] = true; grid.push(c2); } }
        if (grid.length < cells) { var extra = kit.shuffle(SimilarChars.chars({ minSize: MIN_GROUP }).slice(), rand); for (var e = 0; e < extra.length && grid.length < cells; e++) if (!used[extra[e]]) { used[extra[e]] = true; grid.push(extra[e]); } }
        grid = kit.shuffle(grid, rand);
        return { k: k, G: G, seen: seen, grid: grid, seenIdx: seen.map(function (c) { return grid.indexOf(c); }), groups: picks.map(function (g) { return g.chars; }), strokes: rng, viewMs: viewMs(level), respMs: respMs(level), level: level };
    }
    /* 判定：選的格子集合是否剛好等於看過的字的格子集合；回傳 { ok, missed（漏掉的格子）, wrong（多點的格子）} */
    function judgePick(q, picked) {
        var want = {}, got = {}; q.seenIdx.forEach(function (i) { want[i] = true; }); picked.forEach(function (i) { got[i] = true; });
        var missed = q.seenIdx.filter(function (i) { return !got[i]; }), wrong = picked.filter(function (i) { return !want[i]; });
        return { ok: !missed.length && !wrong.length, missed: missed, wrong: wrong };
    }
    /* 兩個字的筆畫差異（以像素比對）：回傳 { onlyA, onlyB, both }（各自的像素數）；需要瀏覽器的畫布，沒有畫布就回傳 null */
    function drawDiff(canvas, a, b, size) {
        var ctx = canvas.getContext('2d'); if (!ctx) return null;
        canvas.width = canvas.height = size;
        function mask(ch) { var c = document.createElement('canvas'); c.width = c.height = size; var x = c.getContext('2d'); x.fillStyle = '#000'; x.font = '900 ' + Math.round(size * 0.82) + 'px "Noto Serif TC","Songti TC","PMingLiU",serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, size / 2, size / 2 + size * 0.04); return x.getImageData(0, 0, size, size).data; }
        var da = mask(a), db = mask(b), out = ctx.createImageData(size, size), onlyA = 0, onlyB = 0, both = 0, o = out.data;
        for (var i = 0; i < size * size; i++) {
            var ia = da[i * 4 + 3] > 100, ib = db[i * 4 + 3] > 100;
            if (ia && ib) { both++; o[i * 4] = 74; o[i * 4 + 1] = 59; o[i * 4 + 2] = 30; o[i * 4 + 3] = 255; }        /* 兩個字都有：深色（墨）*/
            else if (ia || ib) { if (ia) onlyA++; else onlyB++; o[i * 4] = 226; o[i * 4 + 1] = 64; o[i * 4 + 2] = 48; o[i * 4 + 3] = 255; }   /* 只有其中一個有：紅色 */
        }
        ctx.putImageData(out, 0, 0);
        return { onlyA: onlyA, onlyB: onlyB, both: both };
    }
    function rating(n) {
        if (n >= 15) return '過目不忘！';
        if (n >= 10) return '字都看得很仔細！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '長得像的字，要看清楚每一筆！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'skc-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand), G2 = q.G;
        api.info = q;
        console.log('[看過的字] 第 ' + level + ' 關：看過 ' + q.seen.join('') + '（' + q.k + ' 個），字格 ' + G2 + '×' + G2 + '：' + q.grid.join('') + '；字群平均筆劃 ' + q.strokes.map(function (x) { return x.toFixed(1); }).join('～') + '；看 ' + q.viewMs + ' 毫秒');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var field = h('div', { 'class': 'skc-field' });
        stage.appendChild(field);
        var tip = h('div', { 'class': 'qz-note skc-tip', text: '記住這幾個字' });
        field.appendChild(tip);
        /* 看：把看過的字排成一列（最多兩列），大大的楷書 */
        var show = h('div', { 'class': 'skc-show' });
        var per = Math.min(q.k, 3), sz = Math.min(120, Math.floor((W - 40) / per) - 12);
        q.seen.forEach(function (c) { var b = h('div', { 'class': 'skc-show__ch', text: c }); b.style.cssText = 'width:' + sz + 'px;height:' + sz + 'px;font-size:' + Math.round(sz * 0.78) + 'px;line-height:' + sz + 'px;'; show.appendChild(b); });
        field.appendChild(show);
        var info = h('div', { 'class': 'qz-note skc-info', text: '看 ' + Math.round(q.viewMs / 1000) + ' 秒' }); field.appendChild(info);
        var picked = [], phase = 'view', done = false, gridEl = null, btn = null, cellEls = [];
        api.timer(q.viewMs, ask);
        function ask() {
            if (api.over) return;
            phase = 'pick'; show.style.display = 'none'; tip.textContent = '點出剛才看過的字，點完按「好了」'; info.textContent = '';
            var cs = Math.min(82, Math.floor((W - 32) / G2) - 6), gw = cs * G2 + (G2 - 1) * 6;
            gridEl = h('div', { 'class': 'skc-grid' }); gridEl.style.cssText = 'left:' + Math.round((W - gw) / 2) + 'px;top:64px;width:' + gw + 'px;grid-template-columns:repeat(' + G2 + ',' + cs + 'px);grid-auto-rows:' + cs + 'px;';
            q.grid.forEach(function (c, i) {
                var cell = h('div', { 'class': 'skc-cell', text: c }); cell.style.fontSize = Math.round(cs * 0.72) + 'px';
                kit.onTap(cell, function () { toggle(i); }); gridEl.appendChild(cell); cellEls.push(cell);
            });
            field.appendChild(gridEl);
            btn = h('div', { 'class': 'btn btn--go skc-done', text: '好了' }); field.appendChild(btn);
            kit.onTap(btn, function () { judge(false); });
            api.timer(q.respMs, function () { judge(true); });
            if (level === 1 && kit.once('seenchars.hint')) kit.hintOn(stage, cellEls[q.seenIdx[0]], { mode: 'tap', delay: 1500, text: '點出剛才看過的字' });
        }
        function toggle(i) {
            if (phase !== 'pick' || done || api.over) return;
            var at = picked.indexOf(i);
            if (at >= 0) { picked.splice(at, 1); cellEls[i].classList.remove('skc-cell--on'); } else { picked.push(i); cellEls[i].classList.add('skc-cell--on'); Sfx.play('click'); }
        }
        function judge(timeout) {
            if (phase !== 'pick' || done || api.over) return;
            done = true; phase = 'end'; btn.style.display = 'none';
            var r = judgePick(q, picked);
            q.seenIdx.forEach(function (i) { cellEls[i].classList.add(picked.indexOf(i) >= 0 ? 'skc-cell--ok' : 'skc-cell--miss'); });
            r.wrong.forEach(function (i) { cellEls[i].classList.add('skc-cell--bad'); });
            if (r.ok) { info.textContent = '全部都對了！'; kit.flash(stage, true, api.my); api.pass({ delay: 1400 }); return; }
            tip.textContent = (timeout ? '時間到！' : '') + (r.missed.length ? '漏掉 ' + r.missed.length + ' 個' : '') + (r.missed.length && r.wrong.length ? '、' : '') + (r.wrong.length ? '多點（點錯）' + r.wrong.length + ' 個' : '');
            /* 並排比對：每個漏掉的字，配一個你點錯的字（優先同一組的形近字），把差異的筆畫標紅 */
            var cmp = h('div', { 'class': 'skc-cmp' }), pairs = [], wrongLeft = r.wrong.slice();
            r.missed.forEach(function (mi) {
                var seenCh = q.grid[mi], pick = null, pj = -1;
                wrongLeft.forEach(function (wi, j) { if (pick == null && q.groups.some(function (g) { return g.indexOf(seenCh) >= 0 && g.indexOf(q.grid[wi]) >= 0; })) { pick = q.grid[wi]; pj = j; } });
                if (pick == null && wrongLeft.length) { pick = q.grid[wrongLeft[0]]; pj = 0; }
                if (pj >= 0) wrongLeft.splice(pj, 1);
                pairs.push({ a: seenCh, b: pick });
            });
            pairs.slice(0, 3).forEach(function (p) {
                var box = h('div', { 'class': 'skc-cmp__box' });
                box.appendChild(h('div', { 'class': 'skc-cmp__t', text: '看過：' + p.a }));
                if (p.b) { var cv = h('canvas', { 'class': 'skc-cmp__cv' }); box.appendChild(cv); try { drawDiff(cv, p.a, p.b, 120); } catch (err) { } box.appendChild(h('div', { 'class': 'skc-cmp__t', text: '你點：' + p.b })); } else box.appendChild(h('div', { 'class': 'skc-cmp__t skc-cmp__t--miss', text: '（沒點）' }));
                cmp.appendChild(box);
            });
            if (pairs.length) { gridEl.classList.add('skc-grid--small'); field.appendChild(cmp); }
            kit.flash(stage, false, api.my);
            api.fail({ delay: 4000, lines: [timeout ? '時間到！' : '點的字不對', '看過的字：' + q.seen.join('、') + (r.wrong.length ? '；你多點了：' + r.wrong.map(function (i) { return q.grid[i]; }).join('、') : '')] });
        }
        api.solve = function () { if (phase !== 'pick' || done) return; picked = q.seenIdx.slice(); judge(false); };
        api.wrong = function () { if (phase !== 'pick' || done) return; var other = q.grid.map(function (c, i) { return i; }).filter(function (i) { return q.seenIdx.indexOf(i) < 0; })[0]; picked = q.seenIdx.slice(1).concat([other]); judge(false); };
    }

    var G = {
        id: ID,
        name: '看過的字',
        rule: '畫面會閃出幾個字，幾秒後收起來。接著出現一個字格，**點出剛才看過的那幾個字**，點完按「好了」。小心：字格裡其他的字全都是長得很像的形近字（看過「侍」，字格裡就有「待、持、特、恃」），要看清楚每一筆。**少點、多點、點錯都算錯**。答錯時會把看過的字和你點的字並排，**不一樣的筆畫用紅色標出來**。越後面，字越多、筆劃越多、看的時間越短！',
        mount: mount,
        score: SCORE,
        test: {
            kFor: kFor, gridFor: gridFor, viewMs: viewMs, respMs: respMs, strokeRange: strokeRange, makeLevel: makeLevel, judgePick: judgePick, drawDiff: drawDiff, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, K: K, GRID: GRID, VIEW_S: VIEW_S, STROKES_LO: STROKES_LO, STROKES_HI: STROKES_HI, RESP_S: RESP_S, MIN_GROUP: MIN_GROUP, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
