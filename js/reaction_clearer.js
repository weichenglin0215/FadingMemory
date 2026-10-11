/* ═══════════════════════════════════════════════════════════════════
   reaction_clearer.js — 秒反應・越看越清楚
   每關出現一個漢字：一開始非常模糊、高速旋轉，同時開始計時；隨時間線性變清晰、轉得越來越慢；
   下方 5 個結構相似的字，認出來就按。越早按對，這一關得分越高；按錯或逾時就結束。
   固定 10 關，成績＝累計分數（滿分 1000）。
   ───────────────────────────────────────────────────────────────────
   【防亂按的設計——這款的核心】
   · 答案只有 5 個，亂按的人一開始就按、有 20% 機率得到接近滿分；如果成績是「單關最短時間」，
     重玩幾次就能矇到不可能的紀錄。
   · 所以成績是 10 關的「累計分數」，而且「按錯就結束」：亂按每關存活率只有 20%，
     連續矇對 10 關的機率是 0.2^10；亂按的期望累計分只有約 25 分，遠低於認真玩的人。
   · 越晚按越安全、越早按越賭：玩家得自己決定「現在有幾成把握」，這是想要的賭膽。
   · 5 個選項都是結構相似的字（同部首），模糊時只看得到整體輪廓，沒辦法靠輪廓排除；
     每關選項位置重新洗牌，也沒辦法靠位置記答案。
   · 第 1 關搶太快（RUSH_MS 之內就按）得分打 RUSH_K 折，不然第 1 關是最好賭的一關。
   ───────────────────────────────────────────────────────────────────
   · 模糊度 blur(t) ＝ BLUR_MAX × (1 − t÷T)；角速度 ω(t) ＝ SPIN_MAX × (1 − t÷T)，T 是這一關的限時，
     旋轉角度是 ω 的積分（純函式，rAF 暫停也不會錯位）。
   · 每關限時 T 由 TIME_S[0]（8 秒）線性降到 TIME_S[1]（5 秒）；每關得分 ＝ (1 − t÷T) × 100。
   · 題庫 FAMILIES 依筆畫由少到多排好，第 N 關用第 N 組（需人工審校）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'clearer';
    var SCORE = { better: 'max', decimals: 4, format: '{v} 分', label: '累計分數', min: 0.0001, max: 1000 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var LEVELS = 10;                            /* 固定幾關 */
    var TIME_S = [8, 5];                        /* 每關限時（秒）：第 1 關 → 最後一關 */
    var BLUR_MAX = 24;                          /* 一開始的模糊半徑（px） */
    var SPIN_MAX = 720;                         /* 一開始的角速度（度／秒） */
    var RUSH_MS = 1000, RUSH_K = 0.5;           /* 第 1 關在這個時間內就按，得分打幾折 */
    var FAMILIES = [
        ['待', '侍', '特', '持', '恃'], ['抱', '跑', '泡', '飽', '袍'], ['湖', '胡', '葫', '蝴', '糊'], ['晴', '睛', '請', '情', '清'], ['媽', '螞', '碼', '罵', '馬'],
        ['提', '揮', '插', '捏', '摸'], ['橋', '矯', '嬌', '驕', '僑'], ['鴨', '鵝', '鴿', '鷗', '鷺'], ['鑲', '鑼', '鑽', '鑰', '鑿'], ['讀', '讚', '護', '譽', '謹']
    ];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function limitS(level) { return kit.ramp(level, TIME_S[0], TIME_S[1], LEVELS); }
    function blurAt(level, ms) { var T = limitS(level) * 1000; return BLUR_MAX * (1 - kit.clamp(ms / T, 0, 1)); }
    function spinAt(level, ms) { var T = limitS(level) * 1000; return SPIN_MAX * (1 - kit.clamp(ms / T, 0, 1)); }
    /* 旋轉角度（度，未乘方向）：ω(t) 的積分 ＝ SPIN_MAX × (t − t²/(2T)) */
    function angleAt(level, ms) { var T = limitS(level), t = Math.min(ms / 1000, T); return SPIN_MAX * (t - t * t / (2 * T)); }
    /* 這一關按下的得分：(1 − t÷T) × 100；第 1 關太早按打折 */
    function gainFor(level, ms) {
        var T = limitS(level) * 1000, g = (1 - kit.clamp(ms / T, 0, 1)) * 100;
        if (level === 1 && ms < RUSH_MS) g *= RUSH_K;
        return g;
    }
    function clarityPct(level, ms) { return kit.clamp(ms / (limitS(level) * 1000), 0, 1) * 100; }
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var fam = FAMILIES[(level - 1) % FAMILIES.length], target = kit.pick(fam, rand);
        return { target: target, options: kit.shuffle(fam, rand), dir: rand() < 0.5 ? 1 : -1, start: rand() * 360, limit: limitS(level) };
    }
    function rating(v) {
        if (v >= 700) return '火眼金睛！';
        if (v >= 450) return '高手！';
        if (v >= 250) return '不錯喔！';
        if (v >= 100) return '再接再厲！';
        return '多等一下再按，會更穩！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: LEVELS, goodAt: 3,
            head: function (lv) { return '第 ' + lv + ' / ' + LEVELS + ' 關'; },
            info: function (S) { return '累計 ' + Math.floor(S.score) + ' 分'; },
            scoreOf: function (S) { return S.score > 0 ? Math.min(SCORE.max, Leaderboard.fake4(S.score)) : 0; },
            numText: function (v) { return v.toFixed(4) + ' 分'; },
            rating: rating,
            lines: function (S) { return S.log.concat(['按錯就結束，所以越有把握再按越好']); },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand), t0 = performance.now();
        api.info = q;
        console.log('[越看越清楚] 第 ' + level + ' 關：答案「' + q.target + '」，選項 ' + q.options.join('') + '；限時 ' + q.limit.toFixed(2) + ' 秒');

        var glyph = h('div', { 'class': 'cl-glyph', text: q.target });
        var clock = h('div', { 'class': 'cl-clock', text: '計時 0.0000 秒' });
        var note = h('div', { 'class': 'cl-note', text: level === 1 ? '字會越來越清楚。認出來就按——按錯就結束！' : '認出來就按，越早按對分數越高' });
        stage.appendChild(note); stage.appendChild(glyph); stage.appendChild(clock);
        var btns = q.options.map(function (c) {
            var b = h('button', { 'class': 'btn btn--line cl-opt', text: c });
            kit.onTap(b, function () { judge(c); });
            return b;
        });
        stage.appendChild(h('div', { 'class': 'rx-btnrow cl-opts' }, btns));
        function frame() {
            var ms = performance.now() - t0;
            glyph.style.filter = 'blur(' + blurAt(level, ms).toFixed(2) + 'px)';
            glyph.style.transform = 'rotate(' + (q.start + q.dir * angleAt(level, ms)).toFixed(2) + 'deg)';
            clock.textContent = '計時 ' + kit.sec(Math.min(ms, q.limit * 1000)) + ' 秒';
        }
        frame();
        var loop = api.my.loop(function () { if (api.over) return false; frame(); });
        api.timer(Math.round(q.limit * 1000), function () { judge(null, q.limit * 1000); });

        function judge(c, forceMs) {
            if (api.over) return;
            var ms = forceMs != null ? forceMs : performance.now() - t0;
            loop.stop();
            glyph.style.filter = 'none'; glyph.style.transform = 'none';
            clock.textContent = '按下時間 ' + kit.sec(ms) + ' 秒';
            btns.forEach(function (b) { if (b.textContent === q.target) b.classList.add('cl-opt--ok'); else if (b.textContent === c) b.classList.add('cl-opt--bad'); });
            if (c === q.target) {
                var g = gainFor(level, ms), rush = level === 1 && ms < RUSH_MS;
                note.textContent = '答對！清晰度 ' + clarityPct(level, ms).toFixed(4) + '%，得 ' + g.toFixed(4) + ' 分' + (rush ? '（搶答打折）' : '');
                api.pass({ gain: g, delay: 1100, log: '第 ' + level + ' 關「' + q.target + '」：清晰度 ' + clarityPct(level, ms).toFixed(4) + '%，得 ' + g.toFixed(4) + ' 分' + (rush ? '（搶答打折）' : '') });
            } else {
                note.textContent = (c == null ? '時間到！' : '按錯了！') + '答案是「' + q.target + '」';
                api.fail({ delay: 1900, lines: [(c == null ? '時間到！' : '按錯了：你選「' + c + '」') + '，答案是「' + q.target + '」', '按下時清晰度只有 ' + clarityPct(level, ms).toFixed(4) + '%'] });
            }
        }
        api.solve = function () { judge(q.target); };
        api.wrong = function () { judge(q.options.filter(function (x) { return x !== q.target; })[0]); };
    }

    var G = {
        id: ID,
        name: '越看越清楚',
        rule: '畫面上有一個字，一開始又模糊又轉得很快，會慢慢變清楚、轉慢。下方有五個長得很像的字，認出來就按：**越早按對分數越高**。但是**按錯或來不及就結束**！共十關，成績是累計分數，所以不要亂猜，有把握再按。',
        mount: mount,
        score: SCORE,
        test: { limitS: limitS, blurAt: blurAt, spinAt: spinAt, angleAt: angleAt, gainFor: gainFor, clarityPct: clarityPct, makeLevel: makeLevel, rating: rating, FAMILIES: FAMILIES, LEVELS: LEVELS, TIME_S: TIME_S, BLUR_MAX: BLUR_MAX, SPIN_MAX: SPIN_MAX, RUSH_MS: RUSH_MS, RUSH_K: RUSH_K }
    };
    Reaction.register(G);
})();
