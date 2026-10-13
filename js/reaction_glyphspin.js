/* ═══════════════════════════════════════════════════════════════════
   reaction_glyphspin.js — 秒反應・鏡中旋轉字
   畫面中央出現一個「相似字」（已／己／巳、辨／辯／辦／辮…），字會左右鏡射、一直旋轉，
   下方是幾個正常方向的答案字，點「這個字原本是哪一個」。
   關卡制，答錯或逾時就結束，成績＝通過關數。只用中文字，不用阿拉伯數字或英文。
   ───────────────────────────────────────────────────────────────────
   · 題庫（FAMILIES）是一組一組長得像的字，每組記著「大約的筆劃數 s」（人工估計，只用來排難度）。
     V1.25：題庫擴充到 50 多組、筆劃從 2～3 劃一路到 20～28 劃；每關依「目標筆劃」挑字群，
     目標筆劃隨關卡線性增加（STROKES：第 1 關 3 劃 → 第 MAX_LEVEL 關 26 劃），只挑筆劃相近（±STROKE_SPREAD）的字群，
     而且最近用過的字群（RECENT_KEEP 個）不再抽，所以不會「幾個字一直重複」。
   · 答案按鈕＝這一組的字（不夠 OPT 個就從筆劃最接近的別組補）；按鈕上的字永遠是正常方向。
   · 題目字「不會消失」，一直顯示到玩家作答或時間到：
       - 旋轉：剛出現時很快（起始速度＝SPIN[0]→SPIN[1] 度／秒，是 V1.24 的 10 倍），隨時間慢慢變慢
         （二次曲線，SLOW_S 秒降到最慢），最慢每秒一圈（SPIN_MIN ＝ 360 度／秒）；
       - 大小：剛出現時字寬是畫面寬度的 90%，隨時間線性縮小，作答時間用完時剛好是 10%（SIZE_PCT）。
   · 鏡射：每關 50% 機率（SYMMETRIC 裡的字左右對稱，鏡射看不出差異，所以不鏡射）；
     旋轉方向每關隨機（順時針或逆時針）。
   · 難度（線性，RAMP_LEVELS 關走完）：起始轉速 400→3000 度／秒、作答限時 10→6 秒、答案按鈕 3→5 個。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'glyphspin';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 40 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 20;                       /* 幾關之後難度到頂 */
    var MAX_LEVEL = 30;
    var SPIN = [720, 3000];                     /* 剛出現時的旋轉角速度（度／秒）：第 1 關 → 到頂（V1.24 的 10 倍） */
    var SPIN_MIN = 480;                         /* 最慢的旋轉角速度：每秒一圈 */
    var SLOW_S = 5;                             /* 幾秒之後降到最慢 */
    var ANS_S = [10, 6];                        /* 作答限時（秒）：第 1 關 → 到頂；字不會消失，時間到就算失敗 */
    var SIZE_PCT = [90, 10];                    /* 字寬占畫面寬度的百分比：剛出現 → 作答時間用完時 */
    var STAGE_W = 500;                          /* 畫面寬度（px，舞台固定 500） */
    var OPT = [3, 5];                           /* 答案按鈕數 */
    var MIRROR_P = 0.66;                         /* 鏡射的機率 */
    var STROKES = [3, 26];                      /* 目標筆劃數：第 1 關 → 第 MAX_LEVEL 關 */
    var STROKE_SPREAD = 3;                      /* 字群的筆劃數跟目標差不超過這個數才會被抽到 */
    var RECENT_KEEP = 8;                        /* 最近用過幾個字群不再抽（候選不夠時才放寬） */

    /* 相似字群（需人工審校）：同一組的字互相是干擾項；s ＝ 大約的筆劃數（只用來排難度，差一兩劃沒關係） */
    var FAMILIES = [
        { s: 2, c: ['刀', '刃', '力'] }, { s: 2, c: ['人', '入', '八'] }, { s: 3, c: ['已', '己', '巳'] }, { s: 3, c: ['于', '千', '干'] },
        { s: 3, c: ['土', '士', '壬'] }, { s: 4, c: ['丰', '午', '牛'] }, { s: 4, c: ['大', '太', '犬'] }, { s: 4, c: ['天', '夫', '夭'] },
        { s: 4, c: ['白', '日', '曰', '目'] }, { s: 4, c: ['王', '玉', '主'] }, { s: 5, c: ['末', '未', '本'] }, { s: 5, c: ['田', '由', '甲', '申'] },
        { s: 6, c: ['戌', '戍', '戊', '戎'] }, { s: 8, c: ['俛', '免', '兔'] }, { s: 9, c: ['待', '侍', '持', '特'] }, { s: 10, c: ['液', '夜', '腋'] },
        { s: 10, c: ['烏', '鳥', '島'] }, { s: 10, c: ['候', '侯', '猴'] }, { s: 10, c: ['恨', '根', '跟', '限'] }, { s: 10, c: ['抱', '泡', '跑', '飽'] },
        { s: 10, c: ['晚', '挽', '勉'] }, { s: 11, c: ['清', '情', '晴', '睛'] }, { s: 12, c: ['錯', '措', '借', '惜'] }, { s: 12, c: ['暢', '楊', '場', '腸'] },
        { s: 14, c: ['潮', '朝', '嘲', '廟'] }, { s: 15, c: ['微', '徵', '徽'] }, { s: 16, c: ['龜', '龍'] },
        { s: 16, c: ['燈', '鄧', '瞪', '蹬'] }, { s: 17, c: ['辨', '辯', '辦', '辮'] }, { s: 18, c: ['驗', '險', '檢', '儉'] }, { s: 18, c: ['護', '獲', '穫'] },
        { s: 18, c: ['贏', '嬴', '羸'] }, { s: 19, c: ['藍', '籃', '濫', '鑑'] }, { s: 19, c: ['鷹', '應', '膺'] }, { s: 20, c: ['體', '禮', '豐'] },
        { s: 20, c: ['讓', '壤', '攘'] }, { s: 21, c: ['驚', '警', '鶯'] }, { s: 22, c: ['戀', '變', '孿', '彎'] }, { s: 22, c: ['讀', '續', '贖'] },
        { s: 22, c: ['爐', '蘆', '驢', '瀘'] }, { s: 22, c: ['觀', '歡', '權', '勸'] }, { s: 22, c: ['籠', '聾', '襲'] }, { s: 23, c: ['鑽', '讚', '贊'] },
        { s: 24, c: ['鱗', '麟', '驎'] }, { s: 24, c: ['靈', '靂', '霹'] }, { s: 25, c: ['彎', '蠻', '灣'] }, { s: 26, c: ['灩', '艷', '豔'] }
    ];
    var SYMMETRIC = '大日土士人八天夫王田目';      /* 左右對稱的字：鏡射沒有意義 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function spinAt(level) { return kit.ramp(level, SPIN[0], SPIN[1], RAMP_LEVELS); }       /* 這一關剛出現時的角速度 */
    function optCount(level) { return Math.round(kit.ramp(level, OPT[0], OPT[1], RAMP_LEVELS)); }
    function ansMs(level) { return Math.round(kit.ramp(level, ANS_S[0], ANS_S[1], RAMP_LEVELS) * 1000); }
    /* 這一關的目標筆劃數（線性，MAX_LEVEL 關之後維持） */
    function strokeTarget(level) { return kit.ramp(level, STROKES[0], STROKES[1], MAX_LEVEL); }
    /* 角速度（度／秒）隨時間降低：t 秒時 ＝ SPIN_MIN ＋ (v0 − SPIN_MIN) × (1 − t/SLOW_S)²，SLOW_S 秒之後維持 SPIN_MIN */
    function speedAt(v0, ms) {
        var u = Math.max(0, 1 - ms / 1000 / SLOW_S);
        return SPIN_MIN + (v0 - SPIN_MIN) * u * u;
    }
    /* 某時刻（毫秒）的旋轉角度：speedAt 的積分（二次曲線降速，之後等速） */
    function angleAt(q, ms) {
        var t = ms / 1000, v0 = Math.max(q.spin, SPIN_MIN), tt = Math.min(t, SLOW_S);
        var travelled = SPIN_MIN * t + (v0 - SPIN_MIN) * SLOW_S / 3 * (1 - Math.pow(1 - tt / SLOW_S, 3));
        return q.start + q.dir * travelled;
    }
    /* 字寬占畫面寬度的比例（0～1）：剛出現 90% → 作答時間用完 10%，線性 */
    function sizeFrac(ms, limitMs) {
        var p = Math.min(1, Math.max(0, ms / limitMs));
        return (SIZE_PCT[0] + (SIZE_PCT[1] - SIZE_PCT[0]) * p) / 100;
    }
    /* 出題：回傳 { fam（字群編號）, target, options（已洗牌）, mirror, dir（1 順時針／−1 逆時針）, spin, start, strokes }
       recent：最近用過的字群編號（陣列），這些字群先不抽（候選不夠才放寬） */
    function makeLevel(level, rand, recent) {
        rand = rand || Math.random;
        recent = recent || [];
        var tg = strokeTarget(level), n = optCount(level);
        var near = [], i;
        for (i = 0; i < FAMILIES.length; i++) if (Math.abs(FAMILIES[i].s - tg) <= STROKE_SPREAD) near.push(i);
        if (!near.length) {                                 /* 保底：挑筆劃最接近的 4 組 */
            near = FAMILIES.map(function (f, k) { return k; }).sort(function (a, b) { return Math.abs(FAMILIES[a].s - tg) - Math.abs(FAMILIES[b].s - tg); }).slice(0, 4);
        }
        var fresh = near.filter(function (k) { return recent.indexOf(k) < 0; });
        var fi = kit.pick(fresh.length ? fresh : near, rand), fam = FAMILIES[fi].c;
        var target = kit.pick(fam, rand);
        var opts = [target].concat(kit.shuffle(fam.filter(function (c) { return c !== target; }), rand));
        if (opts.length > n) opts = opts.slice(0, n);
        if (opts.length < n) {                              /* 不夠：從筆劃最接近的別組補 */
            var others = FAMILIES.map(function (f, k) { return k; }).filter(function (k) { return k !== fi; })
                .sort(function (a, b) { return Math.abs(FAMILIES[a].s - FAMILIES[fi].s) - Math.abs(FAMILIES[b].s - FAMILIES[fi].s) || rand() - 0.5; });
            for (i = 0; i < others.length && opts.length < n; i++) {
                kit.shuffle(FAMILIES[others[i]].c.slice(), rand).forEach(function (c) { if (opts.length < n && opts.indexOf(c) < 0) opts.push(c); });
            }
        }
        var mirror = SYMMETRIC.indexOf(target) < 0 && rand() < MIRROR_P;
        return {
            fam: fi, target: target, options: kit.shuffle(opts, rand), mirror: mirror,
            dir: rand() < 0.5 ? 1 : -1, spin: spinAt(level), start: rand() * 360, strokes: FAMILIES[fi].s
        };
    }
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

    var recent = [];                                /* 這一次遊戲最近用過的字群 */
    function setup(api) {
        var stage = api.stage, level = api.level;
        if (level === 1) recent = [];
        var q = makeLevel(level, api.rand, recent);
        recent.push(q.fam);
        if (recent.length > RECENT_KEEP) recent.shift();
        api.info = q;
        var limit = ansMs(level);
        console.log('[鏡中旋轉字] 第 ' + level + ' 關：' + q.target + '（約 ' + q.strokes + ' 劃，' + (q.mirror ? '鏡射' : '不鏡射') + '，' + (q.dir > 0 ? '順' : '逆') + '時針，起始 ' + q.spin.toFixed(0) + ' 度／秒），選項 ' + q.options.join('') + '，限時 ' + limit + ' ms');

        var glyph = h('div', { 'class': 'gs-glyph', text: q.target });
        var note = h('div', { 'class': 'gs-note', text: q.mirror ? '字被左右鏡射了，還在轉！' : '字在轉！' });
        stage.appendChild(note); stage.appendChild(glyph);
        var btns = q.options.map(function (c) {
            var b = h('button', { 'class': 'btn btn--line gs-opt', text: c });
            kit.onTap(b, function () { judge(c); });
            return b;
        });
        stage.appendChild(h('div', { 'class': 'rx-btnrow gs-opts' }, btns));
        var t0 = performance.now(), running = true;
        /* 字的方框固定是畫面寬度的 90%（.gs-glyph），縮小靠 scale：最後縮到 10% ÷ 90% */
        function frame() {
            var ms = performance.now() - t0, k = sizeFrac(ms, limit) / (SIZE_PCT[0] / 100);
            glyph.style.transform = 'rotate(' + angleAt(q, ms).toFixed(2) + 'deg) scale(' + (q.mirror ? '-' : '') + k.toFixed(4) + ', ' + k.toFixed(4) + ')';
        }
        frame();
        var loop = api.my.loop(function () { if (!running || api.over) return false; frame(); });
        api.timer(limit, function () { judge(null); });

        function judge(c) {
            if (api.over) return;
            running = false; loop.stop();
            glyph.style.transform = 'none'; glyph.textContent = q.target;
            note.textContent = '答案是「' + q.target + '」';
            btns.forEach(function (b) { if (b.textContent === q.target) b.classList.add('gs-opt--ok'); else if (b.textContent === c) b.classList.add('gs-opt--bad'); });
            if (c === q.target) api.pass({ delay: 700 });
            else api.fail({
                delay: 1900, lines: [
                    (c == null ? '時間到！' : '選錯了：你選「' + c + '」') + '，正確答案是「' + q.target + '」',
                    q.mirror ? '這一關的字被左右鏡射了' : '',
                    '相似的字：' + q.options.join('、')
                ].filter(function (x) { return x; })
            });
        }
        api.solve = function () { judge(q.target); };
        api.wrong = function () { judge(q.options.filter(function (c) { return c !== q.target; })[0]); };
    }

    var G = {
        id: ID,
        name: '鏡中旋轉字',
        rule: '畫面中央有一個大字，它會左右鏡射、**一直旋轉**，剛出現時轉得非常快，之後越轉越慢，但字也會越縮越小。下方有幾個長得很像的字，**點出「這個字原本是哪一個」**。答錯或來不及就結束，看你能過幾關。越後面的字筆劃越多！',
        mount: mount,
        score: SCORE,
        test: { spinAt: spinAt, speedAt: speedAt, angleAt: angleAt, sizeFrac: sizeFrac, optCount: optCount, ansMs: ansMs, strokeTarget: strokeTarget, makeLevel: makeLevel, rating: rating, FAMILIES: FAMILIES, SYMMETRIC: SYMMETRIC, RAMP_LEVELS: RAMP_LEVELS, MAX_LEVEL: MAX_LEVEL, SPIN: SPIN, SPIN_MIN: SPIN_MIN, SLOW_S: SLOW_S, ANS_S: ANS_S, SIZE_PCT: SIZE_PCT, OPT: OPT, STROKES: STROKES, STROKE_SPREAD: STROKE_SPREAD, RECENT_KEEP: RECENT_KEEP }
    };
    Reaction.register(G);
})();
