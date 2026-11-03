/* ═══════════════════════════════════════════════════════════════════
   reaction_clearer.js — 秒反應・越看越清楚
   樣式：css/games/reaction_clearer.css（這款專屬的 class 一律以「clearer-」開頭；共用元件在 css/reaction_common.css）
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
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'clearer'：選單、成績、存檔都靠它；樣式在 css/games/reaction_clearer.css，裡面的 class 名稱一律以 clearer- 開頭。 */
    'use strict';

    var ID = 'clearer';                                 /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 4, format: '{v} 分', label: '累計分數', min: 0.0001, max: 1000 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var LEVELS = 10;                            /* 固定幾關 */
    var TIME_S = [8, 5];                        /* 每關限時（秒）：第 1 關 → 最後一關 */
    var BLUR_MAX = 24;                          /* 一開始的模糊半徑（px） */
    var SPIN_MAX = 720;                         /* 一開始的角速度（度／秒） */
    var RUSH_MS = 1000, RUSH_K = 0.5;           /* 第 1 關在這個時間內就按，得分打幾折 */
    /* 題庫：V1.33 起改用共用資料庫 js/similar_chars.js（SimilarChars），不再自己寫一份字表。
       FAMILY_KEYS＝每一關用哪一組（寫那一組的第一個字），第 N 關用第 N 個；依筆畫由少到多排好（需人工審校）。
       每組取資料庫裡那一組的前 5 個字（資料庫裡越前面的字彼此越像）。想換題目：改這裡的字，或改資料庫那一組的順序。 */
    var FAMILY_KEYS = ['待', '抱', '湖', '晴', '媽', '提', '橋', '鴨', '鑲', '讀'];
    var FAMILIES = FAMILY_KEYS.map(function (key) {  /* 每一關的字群：從共用字庫取每組前 5 個最像的字；找不到就丟出錯誤 */
        var g = SimilarChars.groups({ minSize: 5 }).filter(function (x) { return x.chars[0] === key; })[0];  /* filter：留下符合條件的元素，回傳新陣列 */
        if (!g) throw new Error('越看越清楚：共用資料庫裡找不到「' + key + '」開頭、至少 5 個字的字群');
        return g.chars.slice(0, 5);
    });

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function limitS(level) { return kit.ramp(level, TIME_S[0], TIME_S[1], LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function blurAt(level, ms) { var T = limitS(level) * 1000; return BLUR_MAX * (1 - kit.clamp(ms / T, 0, 1)); }  /* kit.clamp(值, 最小, 最大)：把數值限制在範圍內（太小就取最小、太大就取最大） */
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
    /* 出題函式：依關卡難度與亂數產生這一關的資料（純函式，不碰畫面，單元測試直接測它） */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var fam = FAMILIES[(level - 1) % FAMILIES.length], target = kit.pick(fam, rand);  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        return { target: target, options: kit.shuffle(fam, rand), dir: rand() < 0.5 ? 1 : -1, start: rand() * 360, limit: limitS(level) };  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(v) {
        if (v >= 700) return '火眼金睛！';
        if (v >= 450) return '高手！';
        if (v >= 250) return '不錯喔！';
        if (v >= 100) return '再接再厲！';
        return '多等一下再按，會更穩！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: LEVELS, goodAt: 3,
            head: function (lv) { return '第 ' + lv + ' / ' + LEVELS + ' 關'; },
            info: function (S) { return '累計 ' + Math.floor(S.score) + ' 分'; },  /* Math.floor：無條件捨去成整數 */
            scoreOf: function (S) { return S.score > 0 ? Math.min(SCORE.max, Leaderboard.fake4(S.score)) : 0; },
            numText: function (v) { return v.toFixed(4) + ' 分'; },
            rating: rating,
            lines: function (S) { return S.log.concat(['按錯就結束，所以越有把握再按越好']); },
            setup: setup
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makeLevel(level, api.rand), t0 = performance.now();  /* performance.now()：高精度的時間（毫秒），計時用 */
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[越看越清楚] 第 ' + level + ' 關：答案「' + q.target + '」，選項 ' + q.options.join('') + '；限時 ' + q.limit.toFixed(2) + ' 秒');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var glyph = h('div', { 'class': 'clearer-glyph', text: q.target });
        var clock = h('div', { 'class': 'clearer-clock', text: '計時 0.0000 秒' });
        var note = h('div', { 'class': 'clearer-note', text: level === 1 ? '字越來越清楚，認出就按，按錯結束' : '越快按，分數越高' });
        stage.appendChild(note); stage.appendChild(glyph); stage.appendChild(clock);  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var btns = q.options.map(function (c) {         /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            var b = h('button', { 'class': 'btn btn--line clearer-opt', text: c });
            kit.onTap(b, function () { judge(c); });    /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
            return b;
        });
        stage.appendChild(h('div', { 'class': 'rx-btnrow clearer-opts' }, btns));
        function frame() {
            var ms = performance.now() - t0;
            glyph.style.filter = 'blur(' + blurAt(level, ms).toFixed(2) + 'px)';
            glyph.style.transform = 'rotate(' + (q.start + q.dir * angleAt(level, ms)).toFixed(2) + 'deg)';
            clock.textContent = '計時 ' + kit.sec(Math.min(ms, q.limit * 1000)) + ' 秒';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
        }
        frame();
        var loop = api.my.loop(function () { if (api.over) return false; frame(); });  /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
        api.timer(Math.round(q.limit * 1000), function () { judge(null, q.limit * 1000); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */

        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(c, forceMs) {
            if (api.over) return;
            var ms = forceMs != null ? forceMs : performance.now() - t0;
            loop.stop();
            glyph.style.filter = 'none'; glyph.style.transform = 'none';
            clock.textContent = '按下時間 ' + kit.sec(ms) + ' 秒';
            btns.forEach(function (b) { if (b.textContent === q.target) b.classList.add('clearer-opt--ok'); else if (b.textContent === c) b.classList.add('clearer-opt--bad'); });  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            if (c === q.target) {
                var g = gainFor(level, ms), rush = level === 1 && ms < RUSH_MS;
                note.textContent = '答對！清晰度 ' + clarityPct(level, ms).toFixed(4) + '%，得 ' + g.toFixed(4) + ' 分' + (rush ? '（搶答打折）' : '');
                api.pass({ gain: g, delay: 1100, log: '第 ' + level + ' 關「' + q.target + '」：清晰度 ' + clarityPct(level, ms).toFixed(4) + '%，得 ' + g.toFixed(4) + ' 分' + (rush ? '（搶答打折）' : '') });  /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
            } else {
                note.textContent = (c == null ? '時間到！' : '按錯了！') + '答案是「' + q.target + '」';
                api.fail({ delay: 1900, lines: [(c == null ? '時間到！' : '按錯了：你選「' + c + '」') + '，答案是「' + q.target + '」', '按下時清晰度只有 ' + clarityPct(level, ms).toFixed(4) + '%'] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
            }
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { judge(q.target); };
        api.wrong = function () { judge(q.options.filter(function (x) { return x !== q.target; })[0]); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '越看越清楚',
        rule: '畫面上有一個字，一開始又模糊又轉得很快，會慢慢變清楚、轉慢。下方有五個長得很像的字，認出來就按：**越早按對分數越高**。但是**按錯或來不及就結束**！共十關，成績是累計分數，所以不要亂猜，有把握再按。',
        mount: mount,
        score: SCORE,
        test: { limitS: limitS, blurAt: blurAt, spinAt: spinAt, angleAt: angleAt, gainFor: gainFor, clarityPct: clarityPct, makeLevel: makeLevel, rating: rating, FAMILIES: FAMILIES, LEVELS: LEVELS, TIME_S: TIME_S, BLUR_MAX: BLUR_MAX, SPIN_MAX: SPIN_MAX, RUSH_MS: RUSH_MS, RUSH_K: RUSH_K }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
