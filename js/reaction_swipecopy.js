/* ═══════════════════════════════════════════════════════════════════
   reaction_swipecopy.js — 秒反應・反著滑（企劃 312「照著滑」，依使用者的修改改成「反著滑」；V1.36.0 再改成「一次一個箭頭、箭頭一出現就可以滑」）
   樣式：css/games/reaction_swipecopy.css（這款專屬的 class 一律以「swipecopy-」開頭；共用元件在 css/reaction_common.css）
   畫面分成九宮格。**每一關只出現一個箭頭**（上、下、左、右，後面還有斜的），出現在九宮格的某一格正中央（位置固定、不會偏移）。
   **箭頭一出現就可以用手指往「箭頭的反方向」滑**（箭頭朝上就要往下滑；在畫面任何地方滑都可以）——不用等箭頭消失。
   箭頭只會亮 SHOW_MS（例如 0.5 秒）就消失，但你可以滑到 RESP_MS（例如 1.0 秒）為止；**越快滑出正確的方向越好**，過關後會告訴你反應時間。滑錯方向或超過時間就結束。
   ───────────────────────────────────────────────────────────────────
   · 規則：箭頭指 dir。V1.55.0（玩家意見）新增顏色規則：**藍色底色的箭頭要順著箭頭方向滑（要滑 dir），紅色底色的箭頭要逆著箭頭方向滑（要滑 opposite(dir)）**
     （8 個方向編號 0～7，從正上方順時針每 45° 一個，反方向就是 +4）。藍色箭頭出現的機率 BLUE_P 是 [第 1 關, 到頂]，每關線性算出（blueFor），其餘是紅色。
     畫面上方的提示文字也依關卡調整（waitTip／liveTip）：這一關有可能出現藍色箭頭時，會寫「藍色順著滑、紅色逆著滑」。
   · 滑完的回饋（V1.55.0）：不再閃橘色圓牌，改成在畫面中央閃一下「白色箭頭」（沒有圓底）、半透明 50%、大小約九宮格一格寬度的 1/2（FLASH_FRAC）。
   · 判定（越快越好）：手指按下之後，**位移一超過 MIN_SWIPE 就立刻判定**（不用等手指放開），用當下位移的角度分成 4 個（每個 90° 的扇形）或 8 個（每個 45° 的扇形）方向；
     反應時間 ＝ 箭頭出現到手指位移超過 MIN_SWIPE 的時間。箭頭出現「之前」按下去的不算（箭頭出現時如果手指已經按著，從那一刻的位置開始算）。
   · 九宮格位置的干擾（玩家意見）：格子編號 0～8 由左到右、由上到下。簡單的關卡，箭頭出現在「它所指的那一格」（cellOfDir：朝上的出現在上方中間、朝右的在右邊中間、右上的在右上角…），
     位置和該滑的方向正好衝突（直覺會被位置帶著走，Simon 效應）；到了中難度（第 SCATTER_FROM 關起），箭頭有 SCATTER_P 的機率出現在任意一格（9 格都可能），
     玩家要完全不理位置、只看箭頭的方向；機率隨關卡線性增加，到頂 100%。
   · 難度（線性）：箭頭停留 SHOW_MS 500 → 200 毫秒、可以滑的時間 RESP_MS 1000 → 500 毫秒（從箭頭出現算起）；箭頭出現之前的準備時間 PREP_MS 在範圍內隨機（猜不到什麼時候出現）；第 DIAG_FROM 關起箭頭會有斜的（8 個方向，斜的箭頭在角落格）。
   · 手指與路徑（V1.57.0 玩家意見）：**整個遊戲畫面（標題列下面的全部範圍，不只九宮格裡）都可以滑**；手指滑過的路徑用白色粗線畫出來，路徑結尾加一個箭頭（方向是「起點指向終點」），過關、失敗之後都留著，下一關才清掉。
   · 滑錯或超時（V1.57.0）：畫面原封不動留 FAIL_MS（3 秒）——九宮格、箭頭、你滑的路徑都不遮住；九宮格正下方橫排一個紅框：箭頭／要滑／你滑了，紅框的下面才是文字說明。
   · 版面（V1.57.0）：標題列「第 N 關」與時間條的上下空隙縮小（跟泡泡掃射一樣，加 swipecopy-screen），省下的高度全部留給九宮格下面的說明。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'swipecopy'：選單、成績、存檔都靠它；樣式在 css/games/reaction_swipecopy.css，裡面的 class 名稱一律以 swipecopy- 開頭。 */
    'use strict';

    var ID = 'swipecopy';                               /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後速度到頂 */
    var SHOW_MS = [1000, 200];                   /* 箭頭亮多久（毫秒）：第 1 關 → 到頂 */
    var RESP_MS = [1000, 200];                  /* 從箭頭出現算起，最晚要在多久之內滑出方向（毫秒）：第 1 關 → 到頂（要比 SHOW_MS 長：箭頭消失之後還可以繼續滑） */
    var PREP_MS = [500, 330];                  /* 上一關結束（或剛開始）到箭頭出現之間的等待（毫秒，範圍內隨機） */
    var DIAG_FROM = 3;                         /* 第幾關起有斜的箭頭（8 個方向） */
    var SCATTER_FROM = 5;                       /* 第幾關起箭頭可能出現在「不是它所指的那一格」 */
    var SCATTER_P = [0.33, 1];                  /* 出現在任意一格的機率：第 SCATTER_FROM 關 → 到頂（其餘時候出現在它所指的那一格） */
    var BLUE_P = [0.33, 0.5];                    /* 藍色底色箭頭（要順著箭頭方向滑）出現的機率：第 1 關 → 到頂；其餘是紅色底色箭頭（要逆著箭頭方向滑）。填 [0, 0] 就是全部紅色（跟以前一樣），[1, 1] 全部藍色（V1.55.0 新增） */
    var FLASH_FRAC = 1.33;                       /* 滑完之後閃一下的白色箭頭，「箭頭的長度」是九宮格一格寬度的幾倍（V1.55.0：約 1/2） */
    var FLASH_OPACITY = 0.66;                    /* 那個白色箭頭的不透明度（0.5＝半透明 50%） */
    var MIN_SWIPE = 64;                         /* 手指位移至少幾 px 就立刻判定 */
    var REPLAY_MS = 170;                        /* 失敗後重播，每個箭頭亮多久（毫秒） */
    var FAIL_MS = 3000;                         /* 失敗之後，遊戲畫面（九宮格、箭頭、你滑的路徑、紅框解說與文字說明）保留多久（毫秒）才進結算畫面（V1.57.0：2.6 秒 → 3 秒） */
    var TRAIL_HEAD = [36, 21];                  /* 手指路徑結尾那個箭頭的大小（px）：[箭頭長度, 箭頭半寬]（V1.57.0；路徑線的粗細在 css 的 .swipecopy-trail__line） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var NAMES = ['上', '右上', '右', '右下', '下', '左下', '左', '左上'];      /* 方向編號 0～7 的名字（從正上方順時針） */
    var CELL_OF_DIR = [1, 2, 5, 8, 7, 6, 3, 0];                         /* 方向 → 九宮格裡「它所指的那一格」：上＝上方中間(1)、右上＝右上角(2)、右＝右邊中間(5)… */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function showMsFor(level) { return Math.round(ramp(level, SHOW_MS)); }  /* Math.round：四捨五入成整數 */
    function respMsFor(level) { return Math.max(showMsFor(level), Math.round(ramp(level, RESP_MS))); }
    function dirCountFor(level) { return level >= DIAG_FROM ? 8 : 4; }
    function scatterPFor(level) { return level < SCATTER_FROM ? 0 : Math.round(kit.ramp(level, SCATTER_P[0], SCATTER_P[1], RAMP_LEVELS) * 10000) / 10000; }
    function blueFor(level) { return Math.round(kit.ramp(level, BLUE_P[0], BLUE_P[1], RAMP_LEVELS) * 10000) / 10000; }   /* 這一關藍色箭頭（順著滑）的機率 */
    function opposite(d) { return (d + 4) % 8; }
    /* 這個箭頭要往哪滑：藍色（blue 為真）順著箭頭 d，紅色逆著（反方向） */
    function reqDir(d, blue) { return blue ? d : opposite(d); }
    /* 畫面上方的提示文字（依關卡）：這一關有可能出現藍色箭頭（機率 > 0）就把顏色規則寫出來；全是紅色就維持以前的說法 */
    function waitTip(level) { return blueFor(level) > 0 ? '藍色箭頭順著滑，紅色箭頭逆著滑' : '等箭頭出現，立刻往「反方向」滑'; }
    /* 箭頭出現之後的提示：這個箭頭是藍的還是紅的，該怎麼滑 */
    function liveTip(level, blue) { return blueFor(level) > 0 ? (blue ? '現在！藍色：順著箭頭滑' : '現在！紅色：逆著箭頭滑') : '現在！往「反方向」滑'; }
    /* 方向編號 → 單位向量（x 向右、y 向下；0＝上） */
    function vec(d) { var a = d * Math.PI / 4; return { x: Math.sin(a), y: -Math.cos(a) }; }
    /* 手指位移 (dx, dy) → 方向編號：n＝4（上右下左，編號 0、2、4、6）或 8；位移太短回傳 −1 */
    function swipeDir(dx, dy, n, minDist) {
        if (Math.hypot(dx, dy) < (minDist == null ? MIN_SWIPE : minDist)) return -1;
        var a = Math.atan2(dx, -dy) * 180 / Math.PI;                    /* 從正上方順時針 */
        if (a < 0) a += 360;
        if (n === 4) return (Math.round(a / 90) % 4) * 2;
        return Math.round(a / 45) % 8;
    }
    /* 手指的路徑 pts（[{x, y}…]，第一點是起點、最後一點是現在的位置）→ 要畫的圖形（V1.57.0）：{ line：折線的點, head：結尾箭頭的三個頂點（太短就是 null）, dx／dy：起點指向終點的單位向量 }。
       箭頭的方向是「起點指向終點」（不是最後一小段的方向）；hl、hw 是箭頭的長度與半寬。路徑短於 16 px 不畫箭頭（只畫一小段線）；路徑不夠長時箭頭按比例縮小（最長不超過路徑長度的 70%），免得箭頭比路徑還大。
       箭頭「平的那一端（底邊）」畫在路徑的終點，尖端在終點再往前 L（V1.57.0 玩家意見：原本是尖端在終點）。
       折線最後一點往前縮進箭頭裡面（箭頭底邊再往尖端 0.3 倍箭頭長），粗線的尾巴才不會從箭頭尖端戳出來。 */
    function trailGeom(pts, hl, hw) {
        var n = pts.length;
        if (n < 2) return { line: pts.slice(), head: null, dx: 0, dy: 0 };
        var a = pts[0], b = pts[n - 1], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
        if (len < 16) return { line: pts.slice(), head: null, dx: 0, dy: 0 };
        var ux = dx / len, uy = dy / len, k = Math.min(1, len * 0.7 / hl), L = hl * k, Wd = hw * k;     /* ux、uy：起點指向終點的單位向量；k：箭頭的縮放比例 */
        var bx = b.x, by = b.y;                                                                            /* 箭頭底邊（平的那一端）的中心：就是路徑的終點 */
        var line = pts.slice(0, n - 1); line.push({ x: bx + ux * L * 0.3, y: by + uy * L * 0.3 });
        return { line: line, head: [{ x: bx + ux * L, y: by + uy * L }, { x: bx - uy * Wd, y: by + ux * Wd }, { x: bx + uy * Wd, y: by - ux * Wd }], dx: ux, dy: uy };
    }
    /* 箭頭 d 出現在哪一格（九宮格編號 0～8，由左到右、由上到下）：scatter 為真時 9 格任選一格，否則是它所指的那一格 */
    function cellFor(d, scatter, rand) { return scatter ? kit.randInt(0, 8, rand || Math.random) : CELL_OF_DIR[d]; }  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
    /* 九宮格第 cell 格的正中央（在 W×H 的方框裡），回傳 { x, y, cw, ch }（cw、ch 是每一格的寬高） */
    function cellCenter(cell, W, H) { var cw = W / 3, ch = H / 3; return { x: (cell % 3 + 0.5) * cw, y: (Math.floor(cell / 3) + 0.5) * ch, cw: cw, ch: ch }; }  /* Math.floor：無條件捨去成整數 */
    /* 出一關：{ dirs（長度 1：箭頭指的方向）, req（長度 1：要滑的方向：藍色順著、紅色逆著）, blue（是不是藍色箭頭）, cell（出現在九宮格的哪一格）, matched（是不是它所指的那一格）, showMs, respMs, prepMs, nDir, level }
       （dirs／req 用陣列只是為了跟失敗畫面共用同一套顯示程式） */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var n = dirCountFor(level), pool = n === 4 ? [0, 2, 4, 6] : [0, 1, 2, 3, 4, 5, 6, 7], d = kit.pick(pool, rand), scatter = rand() < scatterPFor(level), cell = cellFor(d, scatter, rand);  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        var blue = rand() < blueFor(level);                 /* 藍色箭頭（順著滑）還是紅色箭頭（逆著滑） */
        return { dirs: [d], req: [reqDir(d, blue)], blue: blue, cell: cell, matched: cell === CELL_OF_DIR[d], showMs: showMsFor(level), respMs: respMsFor(level), prepMs: Math.round(kit.randFloat(PREP_MS[0], PREP_MS[1], rand)), nDir: n, level: level };  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 15) return '反應與眼力都超強！';
        if (n >= 10) return '反著滑也難不倒你！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '看清楚顏色：藍色順著滑、紅色逆著滑！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'swipecopy-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    var ARROW_D = 'M0,-32 L24,-4 L9,-4 L9,30 L-9,30 L-9,-4 L-24,-4 Z';   /* 粗箭頭的形狀（朝上，原點在中心） */
    /* 交通號誌的箭頭：圓牌上一個白色粗箭頭，朝向 d（0＝上）；回傳元素，size 是圓牌直徑。cls 可以是 swipecopy-sign--red（紅色底色），不加就是藍色底色 */
    function sign(parent, d, size, cls) {
        var s = kit.svg('svg', { 'class': 'swipecopy-sign ' + (cls || ''), viewBox: '-50 -50 100 100', width: size, height: size }, parent);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        kit.svg('circle', { 'class': 'swipecopy-sign__disc', cx: 0, cy: 0, r: 48 }, s);
        var g = kit.svg('g', { transform: 'rotate(' + d * 45 + ')' }, s);
        kit.svg('path', { 'class': 'swipecopy-sign__arrow', d: ARROW_D }, g);
        return s;
    }
    /* 只有白色箭頭、沒有圓底（滑完之後閃一下用，V1.55.0）：朝向 d，size 是方框的大小（畫布 68×68 裡，箭頭長 62，所以箭頭長度約是 size 的 91%） */
    function bareArrow(parent, d, size) {
        var s = kit.svg('svg', { 'class': 'swipecopy-bare', viewBox: '-34 -34 68 68', width: size, height: size }, parent);
        kit.svg('path', { 'class': 'swipecopy-bare__arrow', d: ARROW_D, transform: 'rotate(' + d * 45 + ')' }, s);
        return s;
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level, root = api.root;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關；root：整個遊戲畫面（標題列、時間條、遊戲區都在裡面） */
        var q = makeLevel(level, api.rand);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[反著滑] 第 ' + level + ' 關：' + (q.blue ? '藍色（順著滑）' : '紅色（逆著滑）') + '箭頭指 ' + NAMES[q.dirs[0]] + '、要滑 ' + NAMES[q.req[0]] + '；出現在第 ' + (q.cell + 1) + ' 格（' + (q.matched ? '它所指的那一格' : '別的格子') + '）；亮 ' + q.showMs + ' 毫秒、可以滑到 ' + q.respMs + ' 毫秒；準備 ' + q.prepMs + ' 毫秒；' + q.nDir + ' 個方向');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        root.classList.add('swipecopy-screen');         /* 加一個 class：上方「第 N 關」與時間條的上下空隙縮小、把高度讓給九宮格下面的說明文字（跟泡泡掃射一樣，樣式在 css/games/reaction_swipecopy.css），也讓整個遊戲畫面都不會被瀏覽器的觸控手勢搶走。要在量 stage 的大小之前加（加了之後遊戲區才變高）；離開遊戲時拿掉（V1.57.0） */
        api.my.onDispose(function () { root.classList.remove('swipecopy-screen'); });
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var field = h('div', { 'class': 'swipecopy-field' });
        stage.appendChild(field);                       /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var tip = h('div', { 'class': 'qz-note swipecopy-tip', text: waitTip(level) });
        field.appendChild(tip);
        var info = h('div', { 'class': 'qz-note swipecopy-info', text: '' });     /* 文字說明（過關時寫反應時間、失敗時寫錯在哪）；先建出來，才量得到一行有多高 */
        field.appendChild(info);
        var SIGN = 64, lineH = parseFloat(getComputedStyle(info).lineHeight) || 36;      /* SIGN：失敗時紅框裡每個箭頭圓牌的大小；lineH：文字說明一行多高（量出來的） */
        var areaT = 44, belowH = Math.ceil(10 + (SIGN + 44) + 8 + 3 * lineH + 6), areaH = H - areaT - belowH, zone = h('div', { 'class': 'swipecopy-zone' });   /* areaT：九宮格離遊戲區上緣；belowH：九宮格下面留給「紅框解說圖＋最多 3 行文字說明」的高度（V1.57.0：標題列空隙縮小後多出來的高度都留在這裡）＝ 與九宮格的空隙 10 ＋ 紅框（圓牌 ＋ 44 的字與內縮）＋ 空隙 8 ＋ 3 行字 ＋ 6 */
        zone.style.cssText = 'left:12px;right:12px;top:' + areaT + 'px;height:' + areaH + 'px;';
        field.appendChild(zone);
        var zw = (W - 24) - 6, zh = areaH - 6;                                  /* 九宮格的範圍（扣掉虛線框） */
        [1, 2].forEach(function (i) {                                           /* 九宮格的格線：兩條直線、兩條橫線 */
            var v = h('div', { 'class': 'swipecopy-gridline swipecopy-gridline--v' }); v.style.left = (zw * i / 3) + 'px'; zone.appendChild(v);
            var hl = h('div', { 'class': 'swipecopy-gridline swipecopy-gridline--h' }); hl.style.top = (zh * i / 3) + 'px'; zone.appendChild(hl);
        });
        info.style.top = (areaT + areaH + 16) + 'px';
        var strip = h('div', { 'class': 'swipecopy-strip' });
        field.appendChild(strip);
        /* 手指滑過的路徑（V1.57.0）：白色粗線，結尾加一個箭頭（方向是「起點指向終點」）。每個形狀外面各墊一層暗色的，白色在淺色底上才看得到。
           疊在九宮格上面、但在紅框與文字說明下面（css 的 z-index；手指萬一是在說明的地方滑的，路徑也不會擋住說明）；不擋觸控；過關、失敗之後都留著，下一關重新建畫面才清掉。 */
        var tsvg = kit.svg('svg', { 'class': 'swipecopy-trail', width: W, height: H, viewBox: '0 0 ' + W + ' ' + H }, field);
        var tEdge = kit.svg('polyline', { 'class': 'swipecopy-trail__edge' }, tsvg), tEdgeHead = kit.svg('polygon', { 'class': 'swipecopy-trail__edge-head' }, tsvg);
        var tLine = kit.svg('polyline', { 'class': 'swipecopy-trail__line' }, tsvg), tHead = kit.svg('polygon', { 'class': 'swipecopy-trail__head' }, tsvg);
        function ptsText(a) { return a.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' '); }      /* 點的陣列 → SVG 的 points 文字（"x,y x,y …"） */
        function drawTrail() {                                                  /* 依 trail（路徑上的點）重畫線與結尾的箭頭 */
            var g = trailGeom(trail, TRAIL_HEAD[0], TRAIL_HEAD[1]), lt = g.line.length > 1 ? ptsText(g.line) : '', ht = g.head ? ptsText(g.head) : '';
            tEdge.setAttribute('points', lt); tLine.setAttribute('points', lt);
            tEdgeHead.setAttribute('points', ht); tHead.setAttribute('points', ht);
        }

        var phase = 'wait', done = false, down = null, cur = null, t0 = 0, popEl = null, keepPop = false, trail = [];
        /* 箭頭出現：放在九宮格的某一格正中央；從這一刻起就可以滑 */
        function appear() {
            if (api.over || done) return;
            var c = cellCenter(q.cell, zw, zh), SZ = Math.floor(Math.min(c.cw, c.ch) * 0.92);
            popEl = h('div', { 'class': 'swipecopy-pop' });
            popEl.style.cssText = 'left:' + (c.x - SZ / 2) + 'px;top:' + (c.y - SZ / 2) + 'px;width:' + SZ + 'px;height:' + SZ + 'px;';
            sign(popEl, q.dirs[0], SZ, q.blue ? '' : 'swipecopy-sign--red'); zone.appendChild(popEl); Sfx.play('ok');  /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            phase = 'live'; t0 = performance.now(); tip.textContent = liveTip(level, q.blue);  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            if (down && cur) { down.x = cur.x; down.y = cur.y; trail = [cur]; drawTrail(); }                    /* 箭頭出現時手指已經按著：從這一刻的位置開始算（路徑也從這裡開始畫） */
            api.after(q.showMs, function () { if (!keepPop && popEl && popEl.parentNode) popEl.parentNode.removeChild(popEl); });  /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去）。失敗之後箭頭要留在畫面上（keepPop），不再消失 */
            api.after(q.respMs, function () { if (phase === 'live') fail(-1, 0); });                /* 超過時間還沒滑出方向 */
        }
        api.after(q.prepMs, appear);
        if (level === 1 && kit.once('swipecopy.hint')) api.after(q.prepMs + 500, function () { if (phase === 'live') { var rv = vec(q.req[0]); kit.hintOn(stage, null, { mode: 'drag', x: W / 2 - rv.x * 45, y: areaT + areaH / 2 - rv.y * 45, dx: rv.x * 90, dy: rv.y * 90, text: (q.blue ? '藍色箭頭朝' : '紅色箭頭朝') + NAMES[q.dirs[0]] + '就往' + NAMES[q.req[0]] + '滑' }); } });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */

        /* 滑（V1.57.0：整個遊戲畫面都可以滑，不是只有九宮格裡——事件掛在 root，也就是標題列下面的全部範圍；root 每一關都是同一個元素，所以換關時要先把上一關掛的拿掉）。
           按下之後，位移一超過 MIN_SWIPE 就判定（不用等手指放開）；箭頭出現之前的動作不算。座標都換算成 field（遊戲區）的座標，路徑才會畫在手指下面。 */
        function onDown(e) { if (done || api.over || down) return; e.preventDefault(); try { root.setPointerCapture(e.pointerId); } catch (err) { } var p = kit.localPt(e, field); cur = p; down = { id: e.pointerId, x: p.x, y: p.y }; trail = [p]; drawTrail(); }  /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
        function onMove(e) {  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
            if (!down || e.pointerId !== down.id) return;
            var p = kit.localPt(e, field); cur = p;
            if (phase !== 'live' || done || api.over) { if (phase === 'wait') { down.x = p.x; down.y = p.y; trail = [p]; } return; }          /* 還沒出現箭頭：不算，起點跟著手指走 */
            trail.push(p); drawTrail();                                         /* 先把這一小段路徑畫出來，再判定（答錯時畫面上看得到你滑的路徑） */
            var d = swipeDir(p.x - down.x, p.y - down.y, q.nDir);
            if (d >= 0) judge(d, performance.now() - t0);  /* performance.now()：高精度的時間（毫秒），計時用 */
        }
        function onUp(e) { if (down && e.pointerId === down.id) down = null; }
        function detach() { root.removeEventListener('pointerdown', onDown); root.removeEventListener('pointermove', onMove); root.removeEventListener('pointerup', onUp); root.removeEventListener('pointercancel', onUp); if (root.__swipecopyOff === detach) root.__swipecopyOff = null; }
        if (root.__swipecopyOff) root.__swipecopyOff();                         /* 上一關掛在 root 上的拿掉 */
        root.__swipecopyOff = detach;
        root.addEventListener('pointerdown', onDown); root.addEventListener('pointermove', onMove);
        root.addEventListener('pointerup', onUp); root.addEventListener('pointercancel', onUp);
        api.my.onDispose(detach);                                               /* 離開遊戲、再玩一次時也拿掉 */
        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(d, rt) {
            if (done || api.over || phase !== 'live') return;
            var want = q.req[0];
            /* 在畫面中央閃一下你滑的方向：白色箭頭、沒有圓底、半透明 50%，箭頭長度約九宮格一格寬度的 1/2（V1.55.0） */
            var FS = Math.floor(zw / 3 * FLASH_FRAC * 68 / 62), fl = h('div', { 'class': 'swipecopy-flash' }); fl.style.cssText = 'left:' + (zw / 2 - FS / 2) + 'px;top:' + (zh / 2 - FS / 2) + 'px;width:' + FS + 'px;height:' + FS + 'px;opacity:' + FLASH_OPACITY + ';'; bareArrow(fl, d, FS); zone.appendChild(fl); api.after(260, function () { if (fl.parentNode) fl.parentNode.removeChild(fl); });
            if (d !== want) { fail(0, d); return; }
            done = true; phase = 'end'; api.stopTimer();
            info.textContent = '反應 ' + (rt / 1000).toFixed(4) + ' 秒';
            Sfx.play('click'); kit.flash(stage, true, api.my); api.pass({ delay: 900 });  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
        }
        /* 「藍色箭頭（順著滑）」「紅色箭頭（逆著滑）」；這一關不可能出現藍色（機率 0）時就只說「箭頭」 */
        function colorName(qq) { return blueFor(level) > 0 ? (qq.blue ? '藍色箭頭（順著滑）' : '紅色箭頭（逆著滑）') : '箭頭'; }
        /* 滑錯（at ＝ 0，mine ＝你滑的方向）或超時（at ＝ −1）：遊戲畫面原封不動留 FAIL_MS（3 秒），九宮格、箭頭、你滑的路徑都不遮住；
           九宮格正下方橫排一個紅框（箭頭／要滑／你滑了），紅框的下面才是文字說明（V1.57.0：原本是直式紅框、蓋在九宮格上） */
        function fail(at, mine) {
            if (done || api.over) return;
            done = true; phase = 'end'; api.stopTimer(); keepPop = true;
            if (popEl && !popEl.parentNode) { popEl.className = 'swipecopy-pop swipecopy-pop--still'; zone.appendChild(popEl); }   /* 箭頭已經消失了：放回它出現的那一格（不再播放出現的動畫），讓玩家看到它出現在哪裡 */
            var timeout = at < 0;
            tip.textContent = timeout ? '來不及了' : '滑錯方向了';
            info.textContent = colorName(q) + '指 ' + NAMES[q.dirs[0]] + '，要往 ' + NAMES[q.req[0]] + ' 滑' + (timeout ? '；你沒有在 ' + (q.respMs / 1000).toFixed(4) + ' 秒內滑出方向' : '；你滑了 ' + NAMES[mine]);
            strip.style.top = (areaT + areaH + 10) + 'px';                     /* 紅框緊貼在九宮格的下面 */
            var row = h('div', { 'class': 'swipecopy-strip__row' }), cell = h('div', { 'class': 'swipecopy-cell swipecopy-cell--bad swipecopy-cell--lit' });
            function item(label, d, size, cls) { var it = h('div', { 'class': 'swipecopy-cell__item' }); it.appendChild(h('div', { 'class': 'swipecopy-cell__no', text: label })); sign(it, d, size, cls); cell.appendChild(it); }   /* 紅框裡的一個小格：上面一行字、下面一個箭頭圓牌 */
            item('箭頭', q.dirs[0], SIGN, q.blue ? '' : 'swipecopy-sign--red');
            item('要滑', q.req[0], SIGN, 'swipecopy-sign--req');
            if (!timeout) item('你滑了', mine, SIGN, 'swipecopy-sign--bad');
            row.appendChild(cell); strip.appendChild(row);
            info.style.top = (strip.offsetTop + strip.offsetHeight + 10) + 'px';                /* 文字說明放在紅框的正下方（紅框的高度要等內容放進去才量得到，所以排在這裡） */
            kit.flash(stage, false, api.my);
            api.fail({ delay: FAIL_MS, lines: [(timeout ? '來不及：' : '滑錯了：') + colorName(q) + '指 ' + NAMES[q.dirs[0]] + '，要往 ' + NAMES[q.req[0]] + ' 滑' + (timeout ? '' : '，你滑了 ' + NAMES[mine]), '箭頭出現在九宮格的第 ' + (q.cell + 1) + ' 格' + (q.matched ? '（就是它所指的那一邊）' : '（不是它所指的那一邊）')] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 驗證用：api.solve 在箭頭出現之後立刻滑出正確的方向；api.wrong 滑相反的方向（藍色就逆著滑、紅色就順著滑，也就是看錯顏色）；箭頭還沒出現就等它出現 */
        api.solve = function () { if (phase === 'live' && !done) judge(q.req[0], 1); };
        api.wrong = function () { if (phase === 'live' && !done) judge(opposite(q.req[0]), 1); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '反著滑',
        rule: '畫面分成九宮格，每一關只會出現一個箭頭。**藍色底色的箭頭要順著箭頭方向滑，紅色底色的箭頭要逆著箭頭方向滑**——紅色箭頭朝上就往下滑，藍色箭頭朝左就往左滑（在畫面任何地方滑都可以，不用等箭頭消失）。箭頭只亮一下就消失，但你可以一直滑到時間到為止，**越快滑出正確的方向越好**。小心：箭頭出現的格子常常在「它所指的那一邊」，**會帶著你滑錯**；越後面，它會出現在任何一格，藍色箭頭也越來越常出現。滑錯或來不及就結束，看你能過幾關。越後面，箭頭亮得越短、時間越緊，還會有斜的箭頭（8 個方向）！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            showMsFor: showMsFor, respMsFor: respMsFor, dirCountFor: dirCountFor, scatterPFor: scatterPFor, blueFor: blueFor, reqDir: reqDir, waitTip: waitTip, liveTip: liveTip, opposite: opposite, vec: vec, swipeDir: swipeDir, trailGeom: trailGeom, cellFor: cellFor, cellCenter: cellCenter, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, SHOW_MS: SHOW_MS, RESP_MS: RESP_MS, PREP_MS: PREP_MS, DIAG_FROM: DIAG_FROM, SCATTER_FROM: SCATTER_FROM, SCATTER_P: SCATTER_P, BLUE_P: BLUE_P, FLASH_FRAC: FLASH_FRAC, FLASH_OPACITY: FLASH_OPACITY, CELL_OF_DIR: CELL_OF_DIR, MIN_SWIPE: MIN_SWIPE, REPLAY_MS: REPLAY_MS, FAIL_MS: FAIL_MS, TRAIL_HEAD: TRAIL_HEAD, NAMES: NAMES, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
