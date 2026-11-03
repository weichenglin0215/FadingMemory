/* ═══════════════════════════════════════════════════════════════════
   reaction_watchoff.js — 秒反應・哪支錶不準
   樣式：css/games/reaction_watchoff.css（這款專屬的 class 一律以「watchoff-」開頭；共用元件在 css/reaction_common.css）
   三支錶一起走（秒針每秒跳一格），其中一支走得比較快或比較慢，找出它。
   關卡制，答錯或逾時就結束，成績＝通過關數。
   ───────────────────────────────────────────────────────────────────
   · 兩支準的錶每次跳動間隔 1.0000 秒；不準的那支間隔 ＝ 1 ÷ (1 ＋ e)，e 是誤差率（快或慢隨機），
     e 由 ERR[0]（8%）線性降到 ERR[1]（0.5%）：15 秒累積差 1.2000 秒 → 0.0750 秒。
   · 三支錶的跳動相位各自隨機（0～1 秒），秒針起始角度、錶面朝向也不同，不能比較位置，
     要比較的是「跳動的節奏有沒有慢慢滑開」。
   · 秒針位置是時間的純函式：6 度 × floor((t ＋ 相位) ÷ 間隔)，不逐格累加，rAF 暫停也不會錯位。
   · 錶面三種：羅馬數字、無刻度、數字，隨機分配給三支錶。
   · V1.28（玩家意見）：取消前面「觀察 15 秒（按鈕灰色）」，併入作答限時：一開始就可以作答，總限時 ANS_S 25→20 秒
     （＝原本的觀察 15 秒＋作答 10→5 秒）；點了答案之後按鈕立刻停用，要到下一關才恢復。
   · 揭曉：每支錶 WINDOW_S（15）秒內「秒針走了幾秒」：15.0000／15.0000／15.7500，不準的標紅。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'watchoff'：選單、成績、存檔都靠它；樣式在 css/games/reaction_watchoff.css，裡面的 class 名稱一律以 watchoff- 開頭。 */
    'use strict';

    var ID = 'watchoff';                                /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 30 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂（也是最後一關） */
    var ERR = [0.33, 0.005];                    /* 誤差率：第 1 關 → 到頂 */
    var WINDOW_S = 30;                          /* 揭曉時用幾秒的跳動來算「秒針走了幾秒」（不再是觀察時間，只是換算用的視窗） */
    var ANS_S = [30, 60];                       /* 作答總限時（秒）：從錶開始走就開始算；第 1 關 → 到頂 */
    var STYLES = ['roman', 'none', 'digits'];       /* 三款錶面的樣式：羅馬數字、無數字、阿拉伯數字 */
    var NAMES = ['A', 'B', 'C'];                    /* 三支錶的名稱 A、B、C */
    var SIZE = 140;                             /* 錶面直徑（px） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function errAt(level) { return kit.ramp(level, ERR[0], ERR[1], RAMP_LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function ansMs(level) { return Math.round(kit.ramp(level, ANS_S[0], ANS_S[1], RAMP_LEVELS) * 1000); }  /* Math.round：四捨五入成整數 */
    /* 出題：回傳 { periods[3], phases[3], odd, e（帶正負：正＝快）, styles[3], rots[3] } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var odd = kit.randInt(0, 2, rand), e = errAt(level) * (rand() < 0.5 ? 1 : -1), periods = [1, 1, 1];  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
        periods[odd] = 1 / (1 + e);
        return {
            periods: periods, phases: [rand(), rand(), rand()], odd: odd, e: e,
            styles: kit.shuffle(STYLES, rand), rots: [rand() * 360, rand() * 360, rand() * 360]  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
        };
    }
    /* 秒針角度（度）：t 是經過的秒數；每過一個 period 跳 6 度 */
    function handDeg(period, phase, t) { return (6 * Math.floor((t + phase) / period)) % 360; }  /* Math.floor：無條件捨去成整數 */
    /* 這支錶在 sec 秒內，秒針走了幾秒（每跳一格算 1 秒） */
    function dialSeconds(period, sec) { return sec / period; }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 20) return '時間感神人！全部通關！';
        if (n >= 14) return '高手！';
        if (n >= 8) return '不錯喔！';
        if (n >= 4) return '再接再厲！';
        return '盯著秒針跳動的節奏看，再來一次！';
    }
    /* 錶面 SVG（秒針是 <line id="hand">，由 JS 旋轉） */
    function faceSvg(style) {
        var s = '<svg viewBox="0 0 140 140" width="' + SIZE + '" height="' + SIZE + '" xmlns="http://www.w3.org/2000/svg"><circle cx="70" cy="70" r="66" fill="#FFFDF3" stroke="#4A3B1E" stroke-width="5"/>';
        var i;
        if (style !== 'none') for (i = 0; i < 12; i++) {
            var a = i * 30 * Math.PI / 180, r1 = i % 3 === 0 ? 52 : 57, r2 = 62;
            s += '<line x1="' + (70 + r1 * Math.sin(a)).toFixed(1) + '" y1="' + (70 - r1 * Math.cos(a)).toFixed(1) + '" x2="' + (70 + r2 * Math.sin(a)).toFixed(1) + '" y2="' + (70 - r2 * Math.cos(a)).toFixed(1) + '" stroke="#4A3B1E" stroke-width="' + (i % 3 === 0 ? 4 : 2) + '"/>';
        }
        var nums = style === 'roman' ? ['XII', 'III', 'VI', 'IX'] : (style === 'digits' ? ['12', '3', '6', '9'] : []);
        var pos = [[70, 36], [104, 76], [70, 116], [36, 76]];
        nums.forEach(function (t, k) { s += '<text x="' + pos[k][0] + '" y="' + pos[k][1] + '" text-anchor="middle" font-size="16" font-weight="900" fill="#4A3B1E" font-family="Noto Serif TC, serif">' + t + '</text>'; });  /* forEach：對陣列的每個元素各做一次 */
        s += '<line x1="70" y1="70" x2="70" y2="12" stroke="#D46F3C" stroke-width="3.5" stroke-linecap="round" class="watchoff-hand"/><circle cx="70" cy="70" r="5" fill="#4A3B1E"/></svg>';
        return s;
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: RAMP_LEVELS, goodAt: 5,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level, W = stage.clientWidth || 472;
        var q = makeLevel(level, api.rand), t0 = performance.now(), canAnswer = true, done = false;  /* performance.now()：高精度的時間（毫秒），計時用 */
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[哪支錶不準] 第 ' + level + ' 關：不準的是錶 ' + NAMES[q.odd] + '（誤差 ' + (q.e * 100).toFixed(3) + '%，' + (q.e > 0 ? '偏快' : '偏慢') + '）；錶面 ' + q.styles.join('/') + '；作答限時 ' + ansMs(level) + ' ms');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var tip = h('div', { 'class': 'watchoff-tip', text: '三支錶一起走，其中一支走得比較快或比較慢' });  /* tip：盤面下方的提示文字（操作說明、出錯的原因會寫在這裡） */
        var obs = h('div', { 'class': 'watchoff-obs', text: '哪一支走得不準？' });
        var info = h('div', { 'class': 'watchoff-info' });
        stage.appendChild(tip); stage.appendChild(obs); /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var gap = Math.floor((W - 3 * SIZE) / 4);       /* Math.floor：無條件捨去成整數 */
        var faces = q.styles.map(function (st, i) {     /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            var el = h('div', { 'class': 'watchoff-face' }, [h('div', { 'class': 'watchoff-dial', html: faceSvg(st) }), h('div', { 'class': 'watchoff-name', text: NAMES[i] })]);
            el.style.left = (gap + i * (SIZE + gap)) + 'px';
            el.firstChild.style.transform = 'rotate(' + q.rots[i].toFixed(1) + 'deg)';
            stage.appendChild(el);                      /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
            return el;
        });
        var hands = faces.map(function (f) { return f.querySelector('.watchoff-hand'); });  /* querySelector：用 CSS 選擇器在網頁裡找元素 */
        stage.appendChild(info);
        function frame() {
            var sec = (performance.now() - t0) / 1000;  /* performance.now()：高精度的時間（毫秒），計時用 */
            hands.forEach(function (hd, i) { hd.setAttribute('transform', 'rotate(' + handDeg(q.periods[i], q.phases[i], sec).toFixed(1) + ' 70 70)'); });  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
        }
        frame();
        api.my.loop(function () { if (api.over) return false; frame(); });  /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
        var btns = NAMES.map(function (n, i) {          /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            var b = h('button', { 'class': 'btn btn--line', text: '選 ' + n });
            kit.onTap(b, function () { if (canAnswer && !b.disabled) choose(i); });  /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
            return b;
        });
        stage.appendChild(h('div', { 'class': 'rx-btnrow' }, btns));
        api.timer(ansMs(level), function () { choose(-1); });                  /* 一開始就能作答；時間到算沒回答 */

        function choose(i) {
            if (api.over || done) return;
            done = true; canAnswer = false;
            btns.forEach(function (b) { b.disabled = true; });                  /* 點了答案之後按鈕立刻停用，直到下一關才恢復（每一關重建） */
            var lines = [];
            faces.forEach(function (f, k) {             /* forEach：對陣列的每個元素各做一次 */
                var ds = dialSeconds(q.periods[k], WINDOW_S);
                f.classList.toggle('watchoff-face--odd', k === q.odd);  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
                if (k === i && k !== q.odd) f.classList.add('watchoff-face--bad');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
                f.appendChild(h('div', { 'class': 'watchoff-sec', text: ds.toFixed(4) + ' 秒' }));
                lines.push('錶 ' + NAMES[k] + '：' + WINDOW_S + ' 秒內秒針走了 ' + ds.toFixed(4) + ' 秒' + (k === q.odd ? '（' + (q.e > 0 ? '偏快' : '偏慢') + ' ' + Math.abs(q.e * 100).toFixed(4) + '%）' : ''));  /* Math.abs：取絕對值（去掉負號） */
            });
            info.textContent = '不準的是錶 ' + NAMES[q.odd] + '，' + (q.e > 0 ? '偏快' : '偏慢') + ' ' + Math.abs(q.e * 100).toFixed(4) + '%';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            if (i === q.odd) api.pass({ delay: 1700 }); /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
            else api.fail({ delay: 2400, lines: [(i < 0 ? '時間到！' : '選錯了！') + '不準的是錶 ' + NAMES[q.odd]].concat(lines) });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { choose(q.odd); };
        api.wrong = function () { choose((q.odd + 1) % 3); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '哪支錶不準',
        rule: '三支錶一起走，秒針每秒跳一格。其中一支走得比較快或比較慢，**選出不準的那一支**。三支錶的秒針位置和錶面朝向都不一樣，要看的是**跳動的節奏有沒有慢慢滑開**。**一開始就可以作答**，點了答案按鈕就不能再按。答錯或來不及就結束。',
        mount: mount,
        score: SCORE,
        test: { errAt: errAt, ansMs: ansMs, makeLevel: makeLevel, handDeg: handDeg, dialSeconds: dialSeconds, faceSvg: faceSvg, rating: rating, RAMP_LEVELS: RAMP_LEVELS, ERR: ERR, ANS_S: ANS_S, WINDOW_S: WINDOW_S, STYLES: STYLES }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
