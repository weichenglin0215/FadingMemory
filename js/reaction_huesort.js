/* ═══════════════════════════════════════════════════════════════════
   reaction_huesort.js — 秒反應・色票排隊（企劃 332，依使用者的修改：找出顏色被動過的那一塊）
   樣式：css/games/reaction_huesort.css（這款專屬的 class 一律以「huesort-」開頭；共用元件在 css/reaction_common.css）
   畫面上由上到下疊著 **9 塊色塊**，顏色是從上到下的**漸層**，但**其中一塊的顏色被偷偷改過**（改了色相、彩度或明度），
   漸層就在那裡「斷掉」了。把被改過的那一塊點出來。
   ───────────────────────────────────────────────────────────────────
   · 排版（照使用者的規定）：每塊寬度是畫面的 40%，由上而下排；**奇數塊（第 1、3、5、7、9）靠左、偶數塊靠右**，
     左邊的塊離左邊界 30px、右邊的塊離右邊界 30px，上下塊之間再留一點空隙——**故意不讓方塊緊靠**，才不能直接拿邊界比顏色。
   · 揭曉的「評審動畫」（不管答對答錯、時間到都會播）：所有色塊從左右往中間集中，上下緊緊接合（圓角也變直角），
     這時候哪一塊的顏色接不起來一眼就看得出來。答對→被改過的那塊上出現「白邊綠色圓圈」；
     答錯→你點的那塊出現「白邊紅色 X」，同時正確的那塊出現「白邊綠色圓圈」。
   · 顏色怎麼算：全部在 CIELAB（人眼感覺比較均勻的色彩空間）裡面算，用「LCh」（明度 L、彩度 C、色相 h）來描述。
     ① 漸層只沿著**一個方向**走（明度、彩度、色相三選一，叫 mode），相鄰兩塊的顏色差固定是 STEP_DE（ΔE）；
     ② 被改過的那一塊，改的是**另外一個**方向（kind，不會跟漸層同一個方向——否則改的結果只是「看起來像隔壁的顏色」，
        分不出哪一塊才是被改的），改的幅度是 MOD_DE（ΔE），越後面越小。
   · 一定有唯一答案：被改過的塊只可能是**中間 7 塊**（第 2～8 塊）。因為第 1、9 塊只有一個鄰居，改了之後只會看到一個斷點，
     分不出是它還是它的鄰居被改，這樣的題目不公平。（oddBlock() 用「把某一塊換成上下鄰居的平均，整條漸層是不是變平順」自動驗證答案唯一。）
   · 難度（線性）：被改的幅度 ΔE 14 → 3（MOD_DE）、限時 25 → 14 秒（TIME_S）；漸層的步距固定（STEP_DE），色相每關隨機。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'huesort'：選單、成績、存檔都靠它；樣式在 css/games/reaction_huesort.css，裡面的 class 名稱一律以 huesort- 開頭。 */
    'use strict';

    var ID = 'huesort';                                 /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var MOD_DE = [14, 3];                       /* 被改過的那一塊和「該有的顏色」差多少（ΔE）：第 1 關 → 到頂（越小越難） */
    var TIME_S = [25, 14];                      /* 每關限時（秒）：第 1 關 → 到頂 */
    var STEP_DE = 6;                            /* 相鄰兩塊之間「原本漸層」的顏色差（ΔE），每一關都一樣 */
    var BLOCKS = 9;                             /* 色塊數量（照使用者規定 9 塊） */
    var ODD_RANGE = [1, 7];                     /* 被改過的塊的編號範圍（從 0 算起；只在中間 7 塊，原因見檔頭） */
    var BLOCK_W = 0.4;                          /* 每塊寬度占畫面寬度的比例（使用者規定 40%） */
    var SIDE_GAP = 30;                          /* 左邊塊離左邊界、右邊塊離右邊界的距離（px，使用者規定 30） */
    var V_GAP = 8;                              /* 上下兩塊之間的空隙（px） */
    var GATHER_MS = 800;                        /* 評審動畫：色塊集中到中間要多久（毫秒） */
    var JOIN_OVERLAP = 3;                       /* 集中之後，每一塊（最後一塊除外）的高度多加幾 px、壓進下一塊裡面：舞台會依螢幕大小縮放，相鄰兩塊的邊界落在小數點像素上，
                                                   邏輯上剛好貼齊也會被反鋸齒漏出一條淺色細縫；多壓進去幾 px（下一塊畫在上面蓋住）就看不到縫了（玩家意見：色塊合併後上下要緊密相連、不要白縫） */
    var MAX_LEVEL = 90;
    var MODES = ['light', 'chroma', 'hue'];     /* 漸層沿著哪個方向走：明度／彩度／色相 */
    var KIND_NAME = { light: '明度', chroma: '彩度', hue: '色相' };  /* 三種漸層方向的中文名稱：明度、彩度、色相 */
    var RAD = Math.PI / 180;                        /* 角度換成弧度的係數（π／180） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function modDeFor(level) { return Math.round(ramp(level, MOD_DE) * 100) / 100; }  /* Math.round：四捨五入成整數 */
    function timeMs(level) { return Math.round(ramp(level, TIME_S) * 1000); }  /* Math.round：四捨五入成整數 */

    /* LCh（明度 0～100、彩度、色相角度）→ Lab */
    function lchToLab(L, C, hDeg) { return [L, C * Math.cos(hDeg * RAD), C * Math.sin(hDeg * RAD)]; }
    /* Lab（D65）→ sRGB（0～255 的小數，不夾住，超出範圍代表這個顏色螢幕顯示不出來） */
    function labToRgb(lab) {
        var fy = (lab[0] + 16) / 116, fx = fy + lab[1] / 500, fz = fy - lab[2] / 200;
        function finv(t) { var t3 = t * t * t; return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787; }
        var x = 0.95047 * finv(fx), y = finv(fy), z = 1.08883 * finv(fz);
        var r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z, g = -0.969266 * x + 1.8760108 * y + 0.041556 * z, b = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
        function gam(v) { return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055); }
        return [gam(r), gam(g), gam(b)];
    }
    /* sRGB（0～255）→ Lab（跟 labToRgb 反過來；牛奶茶那款也有同樣的公式） */
    function rgbToLab(c) {
        function lin(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
        var r = lin(c[0]), g = lin(c[1]), b = lin(c[2]);
        var x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047, y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b, z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
        function f(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
        var fx = f(x), fy = f(y), fz = f(z);
        return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
    }
    function labDist(a, b) { return Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]) + (a[2] - b[2]) * (a[2] - b[2])); }  /* Math.sqrt：開根號（算兩點距離時常用：勾股定理） */
    /* 兩個 sRGB 顏色的差（ΔE76＝Lab 空間的歐氏距離） */
    function deltaE(c1, c2) { return labDist(rgbToLab(c1), rgbToLab(c2)); }
    /* 螢幕顯不顯示得出來：三個色版都在 0～255 之內（容許四捨五入的 0.5） */
    function inGamut(rgb) { return rgb.every(function (v) { return v >= -0.5 && v <= 255.5; }); }  /* every：陣列裡「每一個」元素都符合條件才回傳 true */
    function round8(rgb) { return rgb.map(function (v) { return Math.max(0, Math.min(255, Math.round(v))); }); }  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
    function css(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
    /* 色相轉多少度，在半徑（彩度）C 的圓上剛好走出 ΔE＝de 的弦長 */
    function hueDegFor(de, C) { return 2 * Math.asin(Math.min(1, de / (2 * Math.max(C, 1e-6)))) / RAD; }

    /* 出一關：回傳 {
         level, mode（漸層方向）, kind（被改的方向）, k（被改的那一塊，從 0 算起）, de（設計的 ΔE）,
         expected（9 塊「原本漸層」的顏色，[r,g,b] 整數）, colors（實際顯示的 9 塊顏色；只有第 k 塊跟 expected 不同）} */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var de = modDeFor(level);
        for (var tr = 0; tr < 400; tr++) {
            var mode = kit.pick(MODES, rand), sgn = rand() < 0.5 ? -1 : 1, h0 = kit.randFloat(0, 360, rand), L0, C0;  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
            if (mode === 'light') { L0 = kit.randFloat(48, 58, rand); C0 = kit.randFloat(28, 44, rand); }  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
            else if (mode === 'chroma') { L0 = kit.randFloat(52, 66, rand); C0 = kit.randFloat(38, 50, rand); }  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
            else { L0 = kit.randFloat(52, 66, rand); C0 = kit.randFloat(34, 48, rand); }
            var stepDeg = hueDegFor(STEP_DE, C0), base = [];
            for (var i = 0; i < BLOCKS; i++) {
                var t = (i - (BLOCKS - 1) / 2) * sgn;                            /* 從 −4 到 +4（或反過來），0 在最中間 */
                if (mode === 'light') base.push({ L: L0 + t * STEP_DE, C: C0, h: h0 });
                else if (mode === 'chroma') base.push({ L: L0, C: C0 + t * STEP_DE, h: h0 });
                else base.push({ L: L0, C: C0, h: h0 + t * stepDeg });
            }
            var kinds = MODES.filter(function (m) { return m !== mode; }), kind = kit.pick(kinds, rand);  /* filter：留下符合條件的元素，回傳新陣列 */
            var k = kit.randInt(ODD_RANGE[0], ODD_RANGE[1], rand), s = rand() < 0.5 ? -1 : 1, md = { L: base[k].L, C: base[k].C, h: base[k].h };  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
            if (kind === 'light') md.L += s * de;
            else if (kind === 'chroma') md.C += s * de;
            else md.h += s * hueDegFor(de, md.C);
            var exp = base.map(function (b) { return labToRgb(lchToLab(b.L, b.C, b.h)); }), mod = labToRgb(lchToLab(md.L, md.C, md.h));  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            if (!exp.every(inGamut) || !inGamut(mod)) continue;                  /* 有顏色螢幕顯示不出來：重抽 */
            var expected = exp.map(round8), colors = expected.map(function (c) { return c.slice(); });  /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
            colors[k] = round8(mod);
            return { level: level, mode: mode, kind: kind, k: k, de: de, expected: expected, colors: colors };
        }
        /* 保底（幾乎用不到）：中等灰藍色、明度漸層、第 5 塊（編號 4）改色相 */
        var fb = [], fbDe = de;
        for (var j = 0; j < BLOCKS; j++) fb.push(round8(labToRgb(lchToLab(50 + (j - 4) * STEP_DE, 30, 250))));
        var fc = fb.map(function (c) { return c.slice(); });  /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
        fc[4] = round8(labToRgb(lchToLab(50, 30, 250 + hueDegFor(fbDe, 30))));
        return { level: level, mode: 'light', kind: 'hue', k: 4, de: fbDe, expected: fb, colors: fc };
    }

    /* 只看 9 個顏色就找出「被改過的那一塊」（驗證答案唯一）：
       對每個候選塊 j（1～7），把它換成上下鄰居的 Lab 平均，再算整條漸層的「粗糙度」（每一塊與上下鄰居的二階差分的總和）；
       換了之後最平順的那個 j，就是被改過的。 */
    function oddBlock(colors) {
        var labs = colors.map(rgbToLab), best = -1, bestR = Infinity;
        function rough(ls) { var r = 0; for (var i = 1; i < ls.length - 1; i++) r += labDist([ls[i - 1][0] + ls[i + 1][0], ls[i - 1][1] + ls[i + 1][1], ls[i - 1][2] + ls[i + 1][2]], [2 * ls[i][0], 2 * ls[i][1], 2 * ls[i][2]]); return r; }
        for (var j = ODD_RANGE[0]; j <= ODD_RANGE[1]; j++) {
            var ls = labs.map(function (l) { return l.slice(); });
            ls[j] = [(labs[j - 1][0] + labs[j + 1][0]) / 2, (labs[j - 1][1] + labs[j + 1][1]) / 2, (labs[j - 1][2] + labs[j + 1][2]) / 2];
            var r = rough(ls); if (r < bestR) { bestR = r; best = j; }
        }
        return best;
    }

    /* 排版：回傳每一塊的位置與「集中之後」的位置（都是相對於 stage 的 px）。
       W、H：stage 的寬高；top、bottom：上面留給提示、下面留給說明的高度 */
    function layout(W, H, top, bottom) {
        var bw = Math.round(W * BLOCK_W), region = H - top - bottom;
        var bh = Math.max(30, Math.floor((region - (BLOCKS - 1) * V_GAP) / BLOCKS));  /* Math.floor：無條件捨去成整數 */
        var total = BLOCKS * bh + (BLOCKS - 1) * V_GAP, y0 = top + Math.max(0, Math.floor((region - total) / 2));  /* Math.floor：無條件捨去成整數 */
        var stackTop = y0 + Math.floor((total - BLOCKS * bh) / 2), cx = Math.round((W - bw) / 2), blocks = [];
        for (var i = 0; i < BLOCKS; i++) {
            var left = i % 2 === 0;                                              /* 第 1、3、5…塊（編號 0、2、4…）靠左 */
            blocks.push({ x: left ? SIDE_GAP : W - SIDE_GAP - bw, y: y0 + i * (bh + V_GAP), joinX: cx, joinY: stackTop + i * bh, w: bw, h: bh });
        }
        return { blocks: blocks, bw: bw, bh: bh, y0: y0, total: total, stackTop: stackTop, stackH: BLOCKS * bh };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 20) return '色彩大師！';
        if (n >= 12) return '眼力很準！';
        if (n >= 6) return '不錯喔！';
        if (n >= 2) return '再接再厲！';
        return '看哪一塊跟上下接不起來！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'huesort-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makeLevel(level, api.rand);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[色票排隊] 第 ' + level + ' 關：漸層沿著' + KIND_NAME[q.mode] + '走、第 ' + (q.k + 1) + ' 塊的' + KIND_NAME[q.kind] + '被改了（ΔE ' + q.de + '）；限時 ' + timeMs(level) + ' ms');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var tip = h('div', { 'class': 'qz-note huesort-tip', text: level === 1 ? '點出跟上下接不起來的那一塊' : '找出顏色被改過的那一塊' });
        stage.appendChild(tip);                         /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var info = h('div', { 'class': 'qz-note huesort-info', text: '' });
        stage.appendChild(info);                        /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var L = layout(W, H, 52, 78), done = false;
        info.style.top = (L.y0 + L.total + 10) + 'px';
        var els = q.colors.map(function (c, i) {
            var b = L.blocks[i], el = h('div', { 'class': 'huesort-block' });
            el.style.cssText = 'left:' + b.x + 'px;top:' + b.y + 'px;width:' + b.w + 'px;height:' + b.h + 'px;background:' + css(c) + ';';
            stage.appendChild(el);
            kit.onTap(el, function () { choose(i); });  /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
            return el;
        });
        api.timer(timeMs(level), function () { choose(-1); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        if (level === 1 && kit.once('huesort.hint')) {  /* kit.once(key)：同一個頁面只有第一次回傳 true（用來讓提示只出現一次） */
            var hb = L.blocks[q.k];
            kit.hintOn(stage, null, { mode: 'tap', x: hb.x + hb.w / 2, y: hb.y + hb.h / 2, delay: 700, text: '點這一塊' });                /* 文字框只放 4 個字（長的文字框會蓋住要比對的色塊），完整說明在上方提示列 */
        }

        /* 在某一塊上畫記號：ok＝白邊綠色圓圈；bad＝白邊紅色 X */
        function mark(i, ok) {
            var box = h('div', { 'class': 'huesort-mark' });
            var svg = kit.svg('svg', { 'class': 'huesort-mark__svg', viewBox: '-30 -30 60 60', width: 54, height: 54 }, box);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
            if (ok) kit.svg('circle', { 'class': 'huesort-mark__ok', cx: 0, cy: 0, r: 20 }, svg);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
            else {
                kit.svg('path', { 'class': 'huesort-mark__xedge', d: 'M-15,-15 L15,15 M15,-15 L-15,15' }, svg);
                kit.svg('path', { 'class': 'huesort-mark__x', d: 'M-15,-15 L15,15 M15,-15 L-15,15' }, svg);
            }
            els[i].appendChild(box);
        }
        /* 評審動畫：集中到中間 → 畫記號。j＝你點的那一塊（−1＝時間到） */
        function choose(j) {
            if (done || api.over) return;
            done = true; api.stopTimer();
            var ok = j === q.k;
            if (j >= 0) kit.flash(stage, ok, api.my);   /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            tip.textContent = '靠攏後看哪裡接不起來';             /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            els.forEach(function (el, i) {              /* forEach：對陣列的每個元素各做一次 */
                var b = L.blocks[i];
                el.classList.add('huesort-block--join');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
                el.style.left = b.joinX + 'px'; el.style.top = b.joinY + 'px';
                el.style.height = (b.h + (i < els.length - 1 ? JOIN_OVERLAP : 0)) + 'px';             /* 壓進下一塊 JOIN_OVERLAP px：不留縫 */
                el.style.zIndex = String(i);                                                          /* 下面的塊畫在上面，蓋住上一塊多出來的那幾 px */
            });
            var what = '第 ' + (q.k + 1) + ' 塊的' + KIND_NAME[q.kind] + '被改過了（顏色差 ΔE ' + q.de.toFixed(4) + '）';
            api.after(GATHER_MS + 100, function () {    /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
                mark(q.k, true);
                if (j >= 0 && !ok) mark(j, false);
                info.textContent = ok ? '答對了！' + what : (j >= 0 ? '答錯了：你點的是第 ' + (j + 1) + ' 塊，' : '時間到！') + what;  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
                info.classList.add(ok ? 'huesort-info--ok' : 'huesort-info--bad');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            });
            if (ok) api.pass({ delay: GATHER_MS + 1900 });  /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
            else api.fail({ delay: GATHER_MS + 3700, lines: [(j >= 0 ? '你點的是第 ' + (j + 1) + ' 塊（紅色 X）' : '時間到！'), '綠色圓圈那一塊才是被改過的：' + what] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { choose(q.k); };
        api.wrong = function () { choose(q.k + 1); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '色票排隊',
        rule: '畫面由上到下疊著 9 塊色塊，顏色是漸層，但**有一塊的顏色被偷偷改過**（色相、彩度或明度）。把**被改過的那一塊**點出來！色塊一左一右錯開擺放，上下不貼在一起，只能靠眼力比。揭曉時色塊會**往中間靠攏、上下緊貼**，顏色接不起來的地方一眼就看得出來。點錯或時間到就結束，看你能過幾關。越後面，改得越少、時間越短！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            modDeFor: modDeFor, timeMs: timeMs, lchToLab: lchToLab, labToRgb: labToRgb, rgbToLab: rgbToLab, labDist: labDist, deltaE: deltaE, inGamut: inGamut, round8: round8, hueDegFor: hueDegFor,
            makeLevel: makeLevel, oddBlock: oddBlock, layout: layout, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, MOD_DE: MOD_DE, TIME_S: TIME_S, STEP_DE: STEP_DE, BLOCKS: BLOCKS, ODD_RANGE: ODD_RANGE, BLOCK_W: BLOCK_W, SIDE_GAP: SIDE_GAP, V_GAP: V_GAP, GATHER_MS: GATHER_MS, JOIN_OVERLAP: JOIN_OVERLAP, MAX_LEVEL: MAX_LEVEL, MODES: MODES
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
