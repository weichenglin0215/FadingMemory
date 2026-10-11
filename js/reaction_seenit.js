/* ═══════════════════════════════════════════════════════════════════
   reaction_seenit.js — 秒反應・這個看過嗎
   圖案一張一張出現，每張判斷「看過」還是「新的」；新的常常是看過圖案的「近親」（同款、不同顏色或不同記號）。
   連續題、3 條命（答錯或逾時扣一條），成績＝累計答對題數。
   ───────────────────────────────────────────────────────────────────
   · 圖案庫：BASES 種基本形狀 × 3 種顏色 × 2 種記號（無／中心圓點）＝ 全部不同的圖案；
     近親＝同一個基本形狀、顏色或記號不同。
   · 前 STUDY 張一定是新的（暖身，只讓你看，不計分）。之後各一半是「新的」「看過」：
       看過 ＝ 先前出現過的圖案，距離上次出現 2～12 張，同一圖案最多出現 3 次；
       新的 ＝ 一半是「近親」（比例 NEAR 30%→80%，隨題號線性），一半是全新的基本形狀。
   · 每題限時 TIME_S 2.5→1.0 秒（線性，RAMP_LEVELS 題走完）。
   · 答錯時並排顯示「現在看到的」與「之前看過的」，讓你看出差在哪裡。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'seenit';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '答對題數', min: 1, max: 120 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var STUDY = 4;                              /* 前幾張只讓你看（一定是新的，不計分） */
    var STUDY_MS = 1200;                        /* 暖身每張顯示多久 */
    var RAMP_LEVELS = 60;                       /* 第幾題之後難度到頂 */
    var MAX_LEVEL = 100;                        /* 最後一題（包含暖身） */
    var TIME_S = [2.5, 1.0];                    /* 每題限時 */
    var NEAR = [0.3, 0.8];                      /* 「新的」裡面是近親的比例 */
    var DIST = [2, 12];                         /* 「看過」的圖案距離上次出現幾張 */
    var MAX_REPEAT = 3, LIVES = 3;
    var HUES = [8, 140, 215];                   /* 三種顏色（色相） */
    var BASES = ['circle', 'square', 'triangle', 'star', 'heart', 'moon', 'drop', 'leaf', 'flower', 'cross', 'hexagon', 'diamond', 'arrow', 'cloud', 'house', 'fish'];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    var VARIANTS = HUES.length * 2;
    function baseOf(id) { return Math.floor(id / VARIANTS); }
    function colorOf(id) { return Math.floor((id % VARIANTS) / 2); }
    function markOf(id) { return id % 2; }
    function itemCount() { return BASES.length * VARIANTS; }
    function timeMs(trial) { return Math.round(kit.ramp(trial, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }
    function nearP(trial) { return kit.ramp(trial, NEAR[0], NEAR[1], RAMP_LEVELS); }
    /* 圖案的 SVG 內容（100×100） */
    function shapeMarkup(base) {
        switch (base) {
            case 'circle': return '<circle cx="50" cy="50" r="40"/>';
            case 'square': return '<rect x="12" y="12" width="76" height="76" rx="6"/>';
            case 'triangle': return '<polygon points="50,8 93,88 7,88"/>';
            case 'star': return '<polygon points="50,6 61,38 95,38 67,58 78,92 50,71 22,92 33,58 5,38 39,38"/>';
            case 'heart': return '<path d="M50 86 C8 56 8 18 32 16 C42 15 48 22 50 29 C52 22 58 15 68 16 C92 18 92 56 50 86 Z"/>';
            case 'moon': return '<path d="M62 8 A42 42 0 1 0 62 92 A32 32 0 1 1 62 8 Z"/>';
            case 'drop': return '<path d="M50 6 C50 6 16 46 16 64 C16 82 31 94 50 94 C69 94 84 82 84 64 C84 46 50 6 50 6 Z"/>';
            case 'leaf': return '<path d="M12 88 C12 40 40 12 90 10 C90 60 62 90 12 88 Z"/>';
            case 'flower': return '<circle cx="50" cy="24" r="19"/><circle cx="76" cy="43" r="19"/><circle cx="66" cy="73" r="19"/><circle cx="34" cy="73" r="19"/><circle cx="24" cy="43" r="19"/><circle cx="50" cy="50" r="14" class="si-eye"/>';
            case 'cross': return '<polygon points="36,8 64,8 64,36 92,36 92,64 64,64 64,92 36,92 36,64 8,64 8,36 36,36"/>';
            case 'hexagon': return '<polygon points="50,6 90,28 90,72 50,94 10,72 10,28"/>';
            case 'diamond': return '<polygon points="50,6 94,50 50,94 6,50"/>';
            case 'arrow': return '<polygon points="8,36 56,36 56,14 94,50 56,86 56,64 8,64"/>';
            case 'cloud': return '<circle cx="32" cy="58" r="22"/><circle cx="56" cy="44" r="26"/><circle cx="76" cy="62" r="18"/><rect x="26" y="60" width="52" height="20"/>';
            case 'house': return '<polygon points="50,8 94,46 82,46 82,90 18,90 18,46 6,46"/>';
            default: return '<ellipse cx="44" cy="50" rx="34" ry="24"/><polygon points="72,50 94,26 94,74"/><circle cx="30" cy="44" r="4" class="si-eye"/>';
        }
    }
    function itemSvg(id, size) {
        var hue = HUES[colorOf(id)], fill = 'hsl(' + hue + ',62%,56%)';
        var mark = markOf(id) ? '<circle cx="50" cy="50" r="9" fill="#FFFDF3" stroke="#4A3B1E" stroke-width="3"/>' : '';
        return '<svg viewBox="0 0 100 100" width="' + (size || 220) + '" height="' + (size || 220) + '" xmlns="http://www.w3.org/2000/svg"><g fill="' + fill + '" stroke="#4A3B1E" stroke-width="3.5" stroke-linejoin="round">' + shapeMarkup(BASES[baseOf(id)]) + '</g>' + mark + '</svg>';
    }
    /* 這個圖案跟哪個圖案「差在哪」（兩個是近親時用）：回傳說明文字 */
    function diffText(a, b) {
        if (baseOf(a) !== baseOf(b)) return '兩個是不同的形狀';
        var d = [];
        if (colorOf(a) !== colorOf(b)) d.push('顏色不同');
        if (markOf(a) !== markOf(b)) d.push('中心的圓點' + (markOf(a) ? '多了' : '少了'));
        return d.join('、');
    }
    /* 下一張：hist 是目前為止出現過的圖案（依序）。回傳 { item, kind: 'study'|'old'|'new', rel（近親：之前看過的那一個，或 null）, seenAt（看過：上次出現的位置，或 −1）} */
    function nextTrial(hist, rand) {
        rand = rand || Math.random;
        var idx = hist.length, trial = idx - STUDY + 1;
        var seen = {}; hist.forEach(function (it, i) { seen[it] = { last: i, n: (seen[it] ? seen[it].n : 0) + 1 }; });
        var seenBases = {}; hist.forEach(function (it) { seenBases[baseOf(it)] = true; });
        function freshBase() {
            var pool = []; for (var b = 0; b < BASES.length; b++) if (!seenBases[b]) for (var v = 0; v < VARIANTS; v++) pool.push(b * VARIANTS + v);
            return pool.length ? kit.pick(pool, rand) : null;
        }
        if (idx < STUDY) { var f = freshBase(); return { item: f, kind: 'study', rel: null, seenAt: -1 }; }
        if (rand() < 0.5) {
            var olds = Object.keys(seen).map(Number).filter(function (it) { var d = idx - seen[it].last; return d >= DIST[0] && d <= DIST[1] && seen[it].n < MAX_REPEAT; });
            if (olds.length) { var o = kit.pick(olds, rand); return { item: o, kind: 'old', rel: null, seenAt: seen[o].last }; }
        }
        if (rand() < nearP(trial)) {
            var cands = [];
            Object.keys(seen).map(Number).forEach(function (it) {
                for (var v = 0; v < VARIANTS; v++) { var c = baseOf(it) * VARIANTS + v; if (!seen[c]) cands.push({ item: c, rel: it }); }
            });
            if (cands.length) { var cc = kit.pick(cands, rand); return { item: cc.item, kind: 'new', rel: cc.rel, seenAt: -1 }; }
        }
        var fb = freshBase();
        if (fb == null) { var any = []; for (var i = 0; i < itemCount(); i++) if (!seen[i]) any.push(i); fb = any.length ? kit.pick(any, rand) : kit.randInt(0, itemCount() - 1, rand); }
        return { item: fb, kind: seen[fb] ? 'old' : 'new', rel: null, seenAt: seen[fb] ? seen[fb].last : -1 };
    }
    function rating(n) {
        if (n >= 60) return '過目不忘！';
        if (n >= 35) return '高手！';
        if (n >= 18) return '不錯喔！';
        if (n >= 8) return '再接再厲！';
        return '多留意細節，再來一次！';
    }

    function mount(root, ctx) {
        var hist = [];
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, lives: LIVES, goodAt: 8, resume: false,
            head: function (lv, S) { return lv <= STUDY ? '先記住這些圖案' : '第 ' + S.cleared + ' 題答對'; },
            numText: function (v) { return v + ' 題'; },
            rating: rating,
            lines: function (S) { return ['累計答對 ' + S.cleared + ' 題']; },
            setup: function (api) { if (api.level === 1) hist.length = 0; setup(api, hist); }
        });
    }

    function setup(api, hist) {
        var stage = api.stage, level = api.level;
        var tr = nextTrial(hist, api.rand), trial = level - STUDY;
        hist.push(tr.item);
        api.info = tr;
        console.log('[這個看過嗎] 第 ' + level + ' 張：圖案 ' + tr.item + '（' + BASES[baseOf(tr.item)] + '，顏色 ' + colorOf(tr.item) + '，記號 ' + markOf(tr.item) + '）→ ' + (tr.kind === 'study' ? '暖身' : (tr.kind === 'old' ? '看過（第 ' + (tr.seenAt + 1) + ' 張）' : '新的' + (tr.rel != null ? '（近親：' + tr.rel + '）' : ''))) + (trial > 0 ? '；限時 ' + timeMs(trial) + ' ms' : ''));

        var pic = h('div', { 'class': 'si-pic', html: itemSvg(tr.item, 220) });
        var info = h('div', { 'class': 'si-info' });
        stage.appendChild(pic); stage.appendChild(info);
        if (tr.kind === 'study') {
            info.textContent = '先記住這個圖案（' + level + ' / ' + STUDY + '）';
            api.skip(STUDY_MS);
            return;
        }
        var bOld = h('button', { 'class': 'btn btn--go', text: '看過' });
        var bNew = h('button', { 'class': 'btn btn--primary', text: '新的' });
        stage.appendChild(h('div', { 'class': 'rx-btnrow' }, [bNew, bOld]));
        api.timer(timeMs(trial), function () { judge(null); });

        function judge(sayOld) {
            if (api.over) return;
            var isOld = tr.kind === 'old';
            if (sayOld === isOld) { pic.classList.add('si-pic--ok'); api.pass({ delay: 300 }); return; }
            pic.classList.add('si-pic--bad');
            var why = sayOld == null ? '時間到！' : (isOld ? '這個圖案剛才出現過' : '這是新的圖案');
            var lines = [why];
            if (!isOld && tr.rel != null) lines.push('之前看過的是它的「近親」：' + diffText(tr.item, tr.rel));
            var left = api.lose({ lines: lines });
            /* 並排顯示「現在看到的」與「之前看過的」，停一下再接下一題 */
            var other = isOld ? tr.item : tr.rel;
            info.textContent = why + (!isOld && tr.rel != null ? '（' + diffText(tr.item, tr.rel) + '）' : '');
            if (other != null) {
                stage.appendChild(h('div', { 'class': 'si-cmp' }, [
                    h('div', { 'class': 'si-cmp__c' }, [h('div', { 'class': 'si-cmp__t', text: '現在看到的' }), h('div', { html: itemSvg(tr.item, 130) })]),
                    h('div', { 'class': 'si-cmp__c' }, [h('div', { 'class': 'si-cmp__t', text: '之前看過的' }), h('div', { html: itemSvg(other, 130) })])
                ]));
            }
            if (left > 0) api.skip(1500);
        }
        kit.onTap(bOld, function () { judge(true); });
        kit.onTap(bNew, function () { judge(false); });
        api.solve = function () { judge(tr.kind === 'old'); };
        api.wrong = function () { judge(tr.kind !== 'old'); };
    }

    var G = {
        id: ID,
        name: '這個看過嗎',
        rule: '圖案一張一張出現。**判斷這個圖案剛才「看過」還是「新的」**。小心：新的圖案常常是看過圖案的近親，只差顏色或中心的圓點。答錯或來不及扣一條命，有三條命，看你能累計答對幾題。**前四張只讓你記住，不算分**。',
        mount: mount,
        score: SCORE,
        test: { baseOf: baseOf, colorOf: colorOf, markOf: markOf, itemCount: itemCount, timeMs: timeMs, nearP: nearP, shapeMarkup: shapeMarkup, itemSvg: itemSvg, diffText: diffText, nextTrial: nextTrial, rating: rating, BASES: BASES, STUDY: STUDY, DIST: DIST, MAX_REPEAT: MAX_REPEAT, RAMP_LEVELS: RAMP_LEVELS, MAX_LEVEL: MAX_LEVEL, LIVES: LIVES, VARIANTS: VARIANTS, NEAR: NEAR, TIME_S: TIME_S }
    };
    Reaction.register(G);
})();
