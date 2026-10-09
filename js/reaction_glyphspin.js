/* ═══════════════════════════════════════════════════════════════════
   reaction_glyphspin.js — 秒反應・鏡中旋轉字
   畫面中央出現一個「相似字」（已／己／巳、末／未、戌／戍／戊…），字會左右鏡射、而且一直旋轉，
   很快就消失；下方是幾個正常方向的答案字，點「這個字原本是哪一個」。
   關卡制，答錯或逾時就結束，成績＝通過關數。只用中文字，不用阿拉伯數字或英文。
   ───────────────────────────────────────────────────────────────────
   · 題庫（FAMILIES）是一組一組長得像的字；每關從一組裡抽目標字，答案按鈕＝這一組的字
     （不夠 OPT 個就從別組補）；按鈕上的字永遠是正常方向。
   · 鏡射：每關 50% 機率（SYMMETRIC 裡的字左右對稱，鏡射看不出差異，所以不鏡射）；
     旋轉：持續順時針或逆時針（每關隨機），角速度隨關卡線性加快。
   · 難度（線性，RAMP_LEVELS 關走完）：旋轉速度 40→300 度／秒、字顯示時間 3.0→1.2 秒、答案按鈕 3→5 個；
     作答總限時＝顯示時間＋ANS_EXTRA 秒。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'glyphspin';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 40 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 20;                       /* 幾關之後難度到頂 */
    var MAX_LEVEL = 30;
    var SPIN = [40, 300];                       /* 旋轉角速度（度／秒）：第 1 關 → 到頂 */
    var SHOW_S = [3.0, 1.2];                    /* 字顯示秒數 */
    var OPT = [3, 5];                           /* 答案按鈕數 */
    var ANS_EXTRA = 2.0;                        /* 字消失後還有幾秒可以作答 */
    var MIRROR_P = 0.5;                         /* 鏡射的機率 */
    /* 相似字群（需人工審校）：同一組的字互相是干擾項 */
    var FAMILIES = [
        ['已', '己', '巳'], ['末', '未', '本'], ['戌', '戍', '戊', '戎'], ['午', '牛'], ['刀', '力'],
        ['于', '千', '干'], ['免', '兔'], ['土', '士'], ['日', '曰', '目'], ['大', '太', '犬'],
        ['人', '入', '八'], ['天', '夫', '夭'], ['王', '玉', '主'], ['田', '由', '甲', '申']
    ];
    var SYMMETRIC = '大日土士人八天夫王田目';       /* 左右對稱的字：鏡射沒有意義 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function spinAt(level) { return kit.ramp(level, SPIN[0], SPIN[1], RAMP_LEVELS); }
    function showMs(level) { return Math.round(kit.ramp(level, SHOW_S[0], SHOW_S[1], RAMP_LEVELS) * 1000); }
    function optCount(level) { return Math.round(kit.ramp(level, OPT[0], OPT[1], RAMP_LEVELS)); }
    function ansMs(level) { return showMs(level) + Math.round(ANS_EXTRA * 1000); }
    /* 出題：回傳 { target, options（已洗牌）, mirror, dir（1 順時針／−1 逆時針）, spin, start（起始角度）} */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var fam = kit.pick(FAMILIES, rand), n = optCount(level);
        var target = kit.pick(fam, rand);
        var opts = [target].concat(kit.shuffle(fam.filter(function (c) { return c !== target; }), rand));
        if (opts.length > n) opts = opts.slice(0, n);
        if (opts.length < n) {
            var others = [];
            FAMILIES.forEach(function (f) { if (f !== fam) f.forEach(function (c) { others.push(c); }); });
            kit.shuffle(others, rand).forEach(function (c) { if (opts.length < n && opts.indexOf(c) < 0) opts.push(c); });
        }
        var mirror = SYMMETRIC.indexOf(target) < 0 && rand() < MIRROR_P;
        return {
            target: target, options: kit.shuffle(opts, rand), mirror: mirror,
            dir: rand() < 0.5 ? 1 : -1, spin: spinAt(level), start: rand() * 360
        };
    }
    /* 某時刻（毫秒）的旋轉角度 */
    function angleAt(q, ms) { return q.start + q.dir * q.spin * ms / 1000; }
    function rating(n) {
        if (n >= 25) return '火眼金睛！';
        if (n >= 15) return '高手！';
        if (n >= 8) return '不錯喔！';
        if (n >= 4) return '再接再厲！';
        return '多看幾次，筆畫就記住了！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 6,
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
        console.log('[鏡中旋轉字] 第 ' + level + ' 關：' + q.target + '（' + (q.mirror ? '鏡射' : '不鏡射') + '，' + (q.dir > 0 ? '順' : '逆') + '時針 ' + q.spin.toFixed(1) + ' 度／秒），選項 ' + q.options.join('') + '，顯示 ' + showMs(level) + ' ms');

        var glyph = h('div', { 'class': 'gs-glyph', text: q.target });
        var note = h('div', { 'class': 'gs-note', text: q.mirror ? '字被左右鏡射了，還在轉！' : '字在轉！' });
        stage.appendChild(note); stage.appendChild(glyph);
        var btns = q.options.map(function (c) {
            var b = h('button', { 'class': 'btn btn--line gs-opt', text: c });
            kit.onTap(b, function () { judge(c); });
            return b;
        });
        stage.appendChild(h('div', { 'class': 'rx-btnrow gs-opts' }, btns));
        var t0 = performance.now(), shown = true;
        function frame() {
            var ms = performance.now() - t0;
            glyph.style.transform = 'rotate(' + angleAt(q, ms).toFixed(2) + 'deg)' + (q.mirror ? ' scaleX(-1)' : '');
        }
        frame();
        var loop = api.my.loop(function () { if (!shown || api.over) return false; frame(); });
        api.after(showMs(level), function () { shown = false; glyph.classList.add('gs-glyph--gone'); note.textContent = '字消失了：它原本是哪一個？'; });
        api.timer(ansMs(level), function () { judge(null); });

        function judge(c) {
            if (api.over) return;
            shown = false; loop.stop();
            glyph.classList.remove('gs-glyph--gone'); glyph.style.transform = 'none'; glyph.textContent = q.target;
            note.textContent = '答案是「' + q.target + '」';
            btns.forEach(function (b) { if (b.textContent === q.target) b.classList.add('gs-opt--ok'); else if (b.textContent === c) b.classList.add('gs-opt--bad'); });
            if (c === q.target) api.pass({ delay: 700 });
            else api.fail({ delay: 1900, lines: [
                (c == null ? '時間到！' : '選錯了：你選「' + c + '」') + '，正確答案是「' + q.target + '」',
                q.mirror ? '這一關的字被左右鏡射了' : '',
                '相似的字：' + q.options.join('、')
            ].filter(function (x) { return x; }) });
        }
        api.solve = function () { judge(q.target); };
        api.wrong = function () { judge(q.options.filter(function (c) { return c !== q.target; })[0]); };
    }

    var G = {
        id: ID,
        name: '鏡中旋轉字',
        rule: '畫面中央有一個字，它會左右鏡射、一直旋轉，而且很快就消失。下方有幾個長得很像的字，點出「這個字原本是哪一個」。答錯或來不及就結束，看你能過幾關。越後面轉得越快、消失得越快！',
        mount: mount,
        score: SCORE,
        test: { spinAt: spinAt, showMs: showMs, optCount: optCount, ansMs: ansMs, makeLevel: makeLevel, angleAt: angleAt, rating: rating, FAMILIES: FAMILIES, SYMMETRIC: SYMMETRIC, RAMP_LEVELS: RAMP_LEVELS, MAX_LEVEL: MAX_LEVEL, SPIN: SPIN, SHOW_S: SHOW_S, OPT: OPT }
    };
    Reaction.register(G);
})();
