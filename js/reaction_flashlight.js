/* ═══════════════════════════════════════════════════════════════════
   reaction_flashlight.js — 秒反應・手電筒猜圖（企劃 204）
   畫面全黑，手指拖到哪裡，手指「上方」就亮起一個圓形的光圈，黑幕底下藏著一個圖案（數字、很像的繁體字、零件數不同的圖形）。
   用光圈到處掃，猜出藏的是什麼圖案；下面四個選項隨時可以點，選對才過關。
   關卡制：選錯或來不及就結束，成績＝通過幾關。
   ───────────────────────────────────────────────────────────────────
   · 光圈的中心在手指「上方」OFFSET 像素（光圈不會被手指擋住）；手指放開，光圈就熄掉。
   · 難度線性（RAMP_LEVELS 關走到頂）：光圈半徑 RADIUS（越小，一次看到的越少）；限時 TIME_S。
   · V1.32（玩家意見：太容易，每個圖案差異太大，看到一個角落就能分辨；請改成相似度很高的圖案、加入很像的繁體中文字，越難的關卡圖案越複雜、筆劃越多）：
     舊的愛心、星星、月亮…這些剪影全部拿掉。圖案改成「一組一組長得很像的」（FAMILIES），四個選項一定來自同一組，只差一點細節：
       - 數字：長得像的數字（3 配 8、6 配 9…，SIMILAR 表）；
       - 形近的繁體字：土士工王、日曰目且、大太犬天、末未木本、己已巳巴、情清請晴、待侍持特、辨辦辮辯、鑑鑒鑄鑽、驚警驕驟、龍襲寵聾…；
       - 程式畫的圖形，差別只在「零件的數量」：正 5～8 邊形、5～8 角星（tier 1），8～11 齒的齒輪、6～9 瓣的花（tier 2），14～17 齒的齒輪、12～15 瓣的花、12～15 角星（tier 3）。
     每一組有複雜度 tier（0～3）：tier 0 是數字與 2～5 劃的字，tier 1 是 3～6 劃的字與 5～8 個零件的圖形，tier 2 是 7～15 劃的字與 6～11 個零件的圖形，
     tier 3 是 12～27 劃的字與 12～17 個零件的圖形。第 1 關到 RAMP_LEVELS 關，複雜度由 TIERS[0] 線性走到 TIERS[1]（每關再隨機上下浮動 TIER_JITTER），
     所以越難的關卡，圖案越複雜、筆劃越多。
   · 揭曉：黑幕變透明，整個圖案露出來，並用淡黃色把你掃過的範圍標出來，寫出「掃過了 X.XXXX％」。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'flashlight';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 25;                       /* 幾關之後難度到頂 */
    var RADIUS = [36, 6];                      /* 光圈半徑（像素）：第 1 關 → 到頂 */
    var TIME_S = [10, 20];                      /* 作答限時（秒）：第 1 關 → 到頂 */
    var OFFSET_GAP = 26;                        /* 光圈下緣離手指多遠（光圈中心在手指上方 半徑＋這個數字 處） */
    var TIERS = [0, 3];                         /* 圖案複雜度（0～3 共四級）：第 1 關 → 到頂。0＝數字與筆劃很少的字，3＝筆劃很多的字、零件很多的圖形 */
    var TIER_JITTER = 0.7;                      /* 每一關的複雜度會隨機上下浮動（±這個數字），不會剛好一關一級；0＝不浮動 */
    var PIC = { size: 480, top: 44 };           /* 圖案的邊長與離遊戲區上緣的距離 */
    var MAX_LEVEL = 60;
    var DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    /* 長得像的數字（選項會優先挑這些） */
    var SIMILAR = { '0': ['6', '8', '9'], '1': ['7', '4', '2'], '2': ['7', '3', '5'], '3': ['8', '5', '2'], '4': ['1', '9', '7'], '5': ['6', '3', '8'], '6': ['5', '8', '0', '9'], '7': ['1', '2', '9'], '8': ['3', '6', '0', '9'], '9': ['4', '8', '0', '6'] };
    /* 「長得很像」的一組圖案：四個選項一定來自同一組（只差一點細節）。tier＝複雜度（0 最簡單、3 最複雜）。
       ids 是字的話直接寫字；圖形的 id 是「種類＋零件數」：p＝正 n 邊形、s＝n 角星、g＝n 齒的齒輪、f＝n 瓣的花（picSvg 畫出來）。kind 'digit'＝數字（用 SIMILAR 表挑長得像的） */
    /* V1.33：形近的繁體字改用共用資料庫 js/similar_chars.js（SimilarChars）：至少 4 個字的字群都拿來用，
       複雜度依「平均筆劃」分級（CHAR_TIER：平均 ≤ 4.5 劃＝0、≤ 7 劃＝1、≤ 15 劃＝2、其餘＝3）；數字與程式畫的圖形照舊寫在這裡。 */
    var CHAR_TIER = [4.5, 7, 15];
    function charTier(s) { return s <= CHAR_TIER[0] ? 0 : s <= CHAR_TIER[1] ? 1 : s <= CHAR_TIER[2] ? 2 : 3; }
    var FAMILIES = [
        { tier: 0, kind: 'digit' },
        { tier: 1, ids: ['p5', 'p6', 'p7', 'p8'] }, { tier: 1, ids: ['s5', 's6', 's7', 's8'] },
        { tier: 2, ids: ['g8', 'g9', 'g10', 'g11'] }, { tier: 2, ids: ['f6', 'f7', 'f8', 'f9'] },
        { tier: 3, ids: ['g14', 'g15', 'g16', 'g17'] }, { tier: 3, ids: ['f12', 'f13', 'f14', 'f15'] }, { tier: 3, ids: ['s12', 's13', 's14', 's15'] }
    ].concat(charFamilies());
    /* 從共用資料庫做出「字的組」：同一個字在資料庫裡可能屬於好幾組，這裡只留第一次出現的那組（每個字只在一組裡），
       剩下不到 4 個字的組就不用（四個選項一定要來自同一組） */
    function charFamilies() {
        var used = {}, out = [];
        SimilarChars.groups({ minSize: 4 }).forEach(function (g) {
            var ids = g.chars.filter(function (c) { return !used[c]; });
            if (ids.length < 4) return;
            ids.forEach(function (c) { used[c] = 1; });
            out.push({ tier: charTier(g.s), ids: ids });
        });
        return out;
    }
    var SHAPE_P = 0.25;                         /* 這一級同時有「字」和「圖形」時，抽到圖形的機率（字的組比較多，不調的話圖形很少出現） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function radiusFor(level) { return kit.ramp(level, RADIUS[0], RADIUS[1], RAMP_LEVELS); }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }
    function isDigit(id) { return DIGITS.indexOf(id) >= 0; }
    /* 圖形的 id（p5、s6、g10、f8…）拆成 { kind, n }，不是圖形回傳 null */
    function shapeOf(id) { var m = /^([psgf])(\d+)$/.exec(id); return m ? { kind: m[1], n: Number(m[2]) } : null; }
    function isChar(id) { return typeof id === 'string' && id.length === 1 && id.charCodeAt(0) >= 0x4E00 && id.charCodeAt(0) <= 0x9FFF; }
    /* 這個圖案屬於複雜度第幾級（數字算 0） */
    function tierOf(id) {
        if (isDigit(id)) return 0;
        for (var i = 0; i < FAMILIES.length; i++) if (FAMILIES[i].ids && FAMILIES[i].ids.indexOf(id) >= 0) return FAMILIES[i].tier;
        return 0;
    }
    /* 第 level 關的複雜度（整數）：從 TIERS[0] 線性走到 TIERS[1]，每關隨機浮動 ±TIER_JITTER，夾在 0～3 */
    function tierFor(level, rand) {
        var c = kit.ramp(level, TIERS[0], TIERS[1], RAMP_LEVELS);
        return kit.clamp(Math.round(c + ((rand || Math.random)() * 2 - 1) * TIER_JITTER), 0, 3);
    }
    /* 出一關：{ target 藏的圖案, options 四個選項（已洗牌，都來自同一組很像的圖案）, answer 答案是第幾個選項, tier 這一關的複雜度 } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var tier = tierFor(level, rand), cands = FAMILIES.filter(function (x) { return x.tier === tier; });
        if (!cands.length) cands = FAMILIES;
        /* 先決定是「圖形」還是「字／數字」，再從那一類挑一組 */
        var shapeFams = cands.filter(function (x) { return x.ids && shapeOf(x.ids[0]); }), otherFams = cands.filter(function (x) { return !(x.ids && shapeOf(x.ids[0])); });
        if (shapeFams.length && otherFams.length) cands = rand() < SHAPE_P ? shapeFams : otherFams;
        var fam = kit.pick(cands, rand), target, others;
        if (fam.kind === 'digit') {
            target = kit.pick(DIGITS, rand);
            others = kit.shuffle(SIMILAR[target], rand).slice(0, 3);
            var rest = kit.shuffle(DIGITS.filter(function (d) { return d !== target && others.indexOf(d) < 0; }), rand);
            while (others.length < 3) others.push(rest.shift());
        } else {
            target = kit.pick(fam.ids, rand);
            others = kit.sample(fam.ids.filter(function (x) { return x !== target; }), 3, rand);
        }
        var options = kit.shuffle([target].concat(others), rand);
        return { target: target, options: options, answer: options.indexOf(target), tier: tier };
    }
    /* 掃過的範圍：points（光圈中心）、半徑 r，在圖案的方框 box（{x,y,w,h}）裡取 40×40 個取樣點，有幾成被光圈照到？（0～1） */
    function coverage(points, r, box) {
        var N = 40, hit = 0;
        for (var i = 0; i < N; i++) for (var j = 0; j < N; j++) {
            var x = box.x + (i + 0.5) / N * box.w, y = box.y + (j + 0.5) / N * box.h;
            for (var k = 0; k < points.length; k++) { var dx = x - points[k].x, dy = y - points[k].y; if (dx * dx + dy * dy <= r * r) { hit++; break; } }
        }
        return hit / (N * N);
    }
    /* 圖案的 SVG（畫在 100×100，用 currentColor 上色）：數字與繁體字用文字（筆劃多的字用細一點的字重，細節才看得清楚）、圖形用多邊形／路徑 */
    function picSvg(id) {
        var body, sh = shapeOf(id), i, k;
        if (isDigit(id)) body = '<text x="50" y="80" text-anchor="middle" font-size="96" font-weight="900" font-family="var(--font-ui)">' + id + '</text>';
        else if (isChar(id)) body = '<text x="50" y="83" text-anchor="middle" font-size="94" font-weight="' + (tierOf(id) >= 2 ? 500 : 700) + '" style="font-family:var(--font-ui)">' + id + '</text>';
        else if (sh && sh.kind === 'p') {                                           /* 正 n 邊形（一個頂點朝上） */
            var pp = [];
            for (i = 0; i < sh.n; i++) { var a1 = -Math.PI / 2 + i * 2 * Math.PI / sh.n; pp.push((50 + 46 * Math.cos(a1)).toFixed(1) + ',' + (52 + 46 * Math.sin(a1)).toFixed(1)); }
            body = '<polygon points="' + pp.join(' ') + '"/>';
        } else if (sh && sh.kind === 's') {                                         /* n 角星：外圈 47、內圈依角數調整，角越多內圈越大（尖角才不會擠成一團） */
            var sp = [], ri = 47 * Math.min(0.8, 0.5 + 0.025 * (sh.n - 5));
            for (i = 0; i < 2 * sh.n; i++) { var r1 = i % 2 === 0 ? 47 : ri, a2 = -Math.PI / 2 + i * Math.PI / sh.n; sp.push((50 + r1 * Math.cos(a2)).toFixed(1) + ',' + (52 + r1 * Math.sin(a2)).toFixed(1)); }
            body = '<polygon points="' + sp.join(' ') + '"/>';
        } else if (sh && sh.kind === 'g') {                                         /* n 齒的齒輪：圓盤（中間挖洞）＋ n 個齒 */
            var tw = Math.max(5, Math.min(9, 113 / sh.n)).toFixed(1);
            body = '<path fill-rule="evenodd" d="M20 50 a30 30 0 1 0 60 0 a30 30 0 1 0 -60 0 Z M39 50 a11 11 0 1 1 22 0 a11 11 0 1 1 -22 0 Z"/>';
            for (k = 0; k < sh.n; k++) body += '<rect x="' + (50 - tw / 2).toFixed(2) + '" y="8" width="' + tw + '" height="18" rx="1.5" transform="rotate(' + (k * 360 / sh.n).toFixed(2) + ' 50 50)"/>';
        } else if (sh && sh.kind === 'f') {                                         /* n 瓣的花：n 片橢圓花瓣繞著圓心 */
            var rx = Math.max(4.5, Math.min(13, 2 * Math.PI * 27 / sh.n * 0.46)).toFixed(2);
            body = '<circle cx="50" cy="50" r="11"/>';
            for (k = 0; k < sh.n; k++) body += '<ellipse cx="50" cy="26" rx="' + rx + '" ry="19" transform="rotate(' + (k * 360 / sh.n).toFixed(2) + ' 50 50)"/>';
        } else body = '<text x="50" y="80" text-anchor="middle" font-size="96" font-weight="900" font-family="var(--font-ui)">?</text>';
        return '<svg viewBox="0 0 100 100" aria-hidden="true" fill="currentColor">' + body + '</svg>';
    }
    var CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
    function cnNum(n) { return n <= 10 ? CN[n] : (n < 20 ? '十' + CN[n - 10] : String(n)); }
    function nameOf(id) {
        if (isDigit(id)) return '數字 ' + id;
        var sh = shapeOf(id);
        if (!sh) return id;
        return sh.kind === 'p' ? '正' + cnNum(sh.n) + '邊形' : sh.kind === 's' ? cnNum(sh.n) + '角星' : sh.kind === 'g' ? cnNum(sh.n) + '個齒的齒輪' : cnNum(sh.n) + '片花瓣的花';
    }
    function rating(n) {
        if (n >= 25) return '火眼金睛！';
        if (n >= 15) return '推理高手！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '光圈掃快一點，抓住特徵，再來一次！';
    }

    var maskSeq = 0;
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 6, stageClass: 'flt-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand);
        api.info = q;
        var R = radiusFor(level);
        console.log('[手電筒猜圖] 第 ' + level + ' 關：藏的是 ' + nameOf(q.target) + '，選項 ' + q.options.map(nameOf).join('／') + '；光圈半徑 ' + R.toFixed(2) + '，限時 ' + timeMs(level) + ' ms');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var box = { x: Math.round((W - PIC.size) / 2), y: PIC.top, w: PIC.size, h: PIC.size };
        var mid = 'flt-m' + (++maskSeq);
        var svg = kit.svg('svg', { 'class': 'flt-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);
        kit.svg('rect', { x: 0, y: 0, width: W, height: H, 'class': 'flt-bg' }, svg);
        var pic = kit.svg('g', { transform: 'translate(' + box.x + ',' + box.y + ') scale(' + (PIC.size / 100) + ')', 'class': 'flt-pic' }, svg);
        pic.innerHTML = picSvg(q.target).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
        var defs = kit.svg('defs', {}, svg), mask = kit.svg('mask', { id: mid }, defs);
        kit.svg('rect', { x: 0, y: 0, width: W, height: H, fill: '#fff' }, mask);
        var hole = kit.svg('circle', { cx: -999, cy: -999, r: R, fill: '#000' }, mask);
        var cover = kit.svg('rect', { x: 0, y: 0, width: W, height: H, 'class': 'flt-cover', mask: 'url(#' + mid + ')' }, svg);
        var ring = kit.svg('circle', { cx: -999, cy: -999, r: R, 'class': 'flt-ring' }, svg);
        var gScan = kit.svg('g', { 'class': 'flt-scan' }, svg);
        var tip = h('div', { 'class': 'flt-tip', text: '手指在黑幕上拖曳，照出藏著的圖案' });
        stage.appendChild(tip);
        var items = q.options.map(function (id, i) { return { html: picSvg(id), kind: 'line', cls: 'flt-opt', onTap: function () { judge(i); } }; });
        var grid = kit.btnGrid(stage, items, { h: 96, gap: 8 });
        var centers = [], dragging = null, lastC = null;
        function light(pt) {
            var c = { x: pt.x, y: pt.y - (R + OFFSET_GAP) };
            hole.setAttribute('cx', c.x); hole.setAttribute('cy', c.y); ring.setAttribute('cx', c.x); ring.setAttribute('cy', c.y);
            ring.setAttribute('visibility', 'visible');
            /* 記下掃過的位置（每移動超過半徑的 1/3 才記一個，省記憶體） */
            if (!lastC || kit.dist(c.x, c.y, lastC.x, lastC.y) >= R / 3) { centers.push(c); lastC = c; }
        }
        function dark() { hole.setAttribute('cx', -999); ring.setAttribute('visibility', 'hidden'); }
        dark();
        stage.addEventListener('pointerdown', function (e) {
            if (api.over || dragging != null) return;
            if (e.target.closest && e.target.closest('.rx-grid')) return;            /* 按在選項上，不是掃描 */
            e.preventDefault();
            try { stage.setPointerCapture(e.pointerId); } catch (err) { }
            dragging = e.pointerId; light(kit.localPt(e, stage));
        });
        stage.addEventListener('pointermove', function (e) { if (dragging === e.pointerId && !api.over) light(kit.localPt(e, stage)); });
        function end(e) { if (dragging === e.pointerId) { dragging = null; dark(); } }
        stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
        api.timer(timeMs(level), function () { judge(null); });
        if (level === 1 && kit.once('flashlight.hint')) kit.hintOn(stage, null, { mode: 'drag', x: box.x + 40, y: box.y + PIC.size * 0.7, dx: PIC.size - 80, dy: 0, delay: 600, text: '請拖曳手指照亮圖案' });

        function judge(i) {
            if (api.over) return;
            dragging = null; dark();
            var ok = i === q.answer;
            cover.setAttribute('opacity', '0.12');
            centers.forEach(function (c) { kit.svg('circle', { cx: c.x, cy: c.y, r: R }, gScan); });
            var cov = coverage(centers, R, box);
            grid.btns[q.answer].classList.add('flt-opt--right');
            if (i != null && !ok) grid.btns[i].classList.add('flt-opt--wrong');
            tip.textContent = '藏的是「' + nameOf(q.target) + '」，你掃過了 ' + (cov * 100).toFixed(4) + '％ 的範圍';
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 1700 }); return; }
            kit.flash(stage, false, api.my);
            api.fail({
                delay: 2700, lines: [
                    (i == null ? '時間到！' : '選錯了') + '，藏的是「' + nameOf(q.target) + '」',
                    '你掃過了圖案範圍的 ' + (cov * 100).toFixed(4) + '％'
                ]
            });
        }
        api.solve = function () { judge(q.answer); };
        api.wrong = function () { judge((q.answer + 1) % 4); };
    }

    var G = {
        id: ID,
        name: '手電筒猜圖',
        rule: '畫面全黑，**手指拖到哪裡，手指上方就會亮起一圈光**，黑幕底下藏著一個圖案。用光圈到處掃，**猜出藏的是什麼**，點下面四個選項之一。四個選項**長得非常像**（相似的數字、形近的繁體字、只差零件數的圖形），只看一個角落分不出來。選錯或來不及就結束，看你能過幾關。越後面，光圈越小、圖案越複雜、筆劃越多！',
        mount: mount,
        score: SCORE,
        test: {
            radiusFor: radiusFor, timeMs: timeMs, isDigit: isDigit, isChar: isChar, shapeOf: shapeOf, tierOf: tierOf, tierFor: tierFor, makeLevel: makeLevel, coverage: coverage, picSvg: picSvg, nameOf: nameOf, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, RADIUS: RADIUS, TIME_S: TIME_S, DIGITS: DIGITS, FAMILIES: FAMILIES, SIMILAR: SIMILAR, TIERS: TIERS, TIER_JITTER: TIER_JITTER, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
