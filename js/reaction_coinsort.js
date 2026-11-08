/* ═══════════════════════════════════════════════════════════════════
   reaction_coinsort.js — 秒反應・零錢入筒（企劃 359，依使用者的修改）
   樣式：css/games/reaction_coinsort.css（這款專屬的 class 一律以「coinsort-」開頭；共用元件在 css/reaction_common.css）
   硬幣一枚一枚從上面掉下來，**用手指把它滑進對的收集筒**：
       銅色的大硬幣＝50 元 → 往【左】滑，掉進左下方的筒；
       銅色的小硬幣＝5 元  → 往【下】滑，掉進正下方的筒；
       銀色的大硬幣＝10 元 → 往【右】滑，掉進右下方的筒。
   滑錯方向、或是來不及滑（硬幣掉到筒子口）就結束，成績＝一共分對幾枚（越多越好）。
   ───────────────────────────────────────────────────────────────────
   · ★ 關於 5 元的方向：使用者的字是「銅色的 5 圓（要往左邊揮，掉落正下方的收集筒）」。兩種銅色硬幣如果都往左滑，
     就不可能分別掉進「左下」和「正下方」兩個不同的筒，所以我把 5 元解讀成「往下滑」（筒子就在正下方）。
     如果使用者其實要的是別的方向，只要改 DIR_OF 這一個表（以及筒子的位置 TUBE_X）就好。
   · 難度（線性，依「已經分對幾枚」，到 RAMP_COINS 枚到頂；V1.51 依玩家意見「推進太慢」從 40 枚改成 25 枚、掉得更快）：
       ① 掉落時間 FALL_S：2.6 秒 → 0.9 秒（硬幣從上面掉到筒子口的時間，越短越要快）；
       ② 背面朝上的機率 BACK_P：0 → 0.7（背面看不到數字，只能靠「顏色」和「大小」判斷）；
       ③ 5 元和 50 元的大小比 RATIO5：0.62 → 0.8（越來越接近，小硬幣只比大硬幣小 20%）；
       ④（V1.51）一次掉好幾枚 GROUP_P：分對 GROUP_FROM 枚之後才會出現，機率 15% → 40%；其中 3 枚的比例 TRIO_P 0 → 40%。
          同一組的硬幣上下靠得很近（高低差 GAP_D：0.8～1.2 枚 → 0.3～0.6 枚），**每次滑都是滑「最下面那一枚」**，
          玩家要先看清楚誰比較低。高低差至少比「兩枚的直徑差」再多一點（GAP_EDGE），所以不管看上緣、中心還是下緣，上下關係都一樣，不會有爭議；
       ⑤（V1.51）出現的左右位置 XSPAN：中間 ±20% → 幾乎整個畫面寬；而且有 EDGE_P（0 → 45%）的機率刻意貼著邊緣，
          其中 EDGE_TRICK（65%）放在「跟它要滑的方向相反」那一邊（50 元從右邊掉、10 元從左邊掉）來干擾。
   · 一組硬幣的掉落時間 ＝ 單枚的 × GROUP_SLOW（要連滑 2～3 次）；同一組的速度一樣，所以上下關係從頭到尾不會變。
     下一枚（或下一組）要等畫面上的硬幣都處理完才出現。
   · 滑的判定（classifySwipe）：手指在畫面任何地方按下、拉開 SWIPE_MIN 以上就算一次滑；
     水平分量夠大（≥ 垂直的 0.75 倍）算左／右，否則往下算「下」，往上滑不算（繼續等）。
   · 結束時：那一枚硬幣放大、翻到正面（顯示它是幾元），並寫出它該往哪滑；
     如果玩家滑的方向是「上面那枚」的方向，說明會寫「順序錯了，要先滑最下面那枚」。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'coinsort'：選單、成績、存檔都靠它；樣式在 css/games/reaction_coinsort.css，裡面的 class 名稱一律以 coinsort- 開頭。 */
    'use strict';

    var ID = 'coinsort';                                /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 枚', label: '分對', min: 1, max: 300 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_COINS = 25;                        /* 分對幾枚之後難度到頂（V1.51：40 → 25，玩家說推進太慢） */
    var FALL_S = [2.6, 0.9];                    /* 硬幣從出現到掉到筒子口的時間（秒）：第 0 枚 → 到頂（V1.51：3.4→1.0 改成 2.6→0.9） */
    var BACK_P = [0, 0.7];                      /* 背面朝上（看不到數字）的機率：第 0 枚 → 到頂 */
    var RATIO5 = [0.62, 0.8];                   /* 5 元硬幣的直徑 ÷ 50 元（也是 10 元）的直徑：第 0 枚 → 到頂 */
    var GROUP_FROM = 4;                         /* 分對幾枚之後，才會出現「一次掉好幾枚」 */
    var GROUP_P = [0.15, 0.4];                  /* 一次掉好幾枚（2～3 枚靠很近）的機率：第 GROUP_FROM 枚 → 到頂 */
    var TRIO_P = [0, 0.4];                      /* 一次掉好幾枚時，是 3 枚的機率（不然就是 2 枚）：第 0 枚 → 到頂 */
    var GAP_D = [[0.8, 1.2], [0.3, 0.6]];       /* 同一組裡上下相鄰兩枚的高低差（單位＝大硬幣的直徑）的範圍：一開始 0.8～1.2 → 到頂 0.3～0.6（越小越難看出誰比較低） */
    var GAP_EDGE = 0.12;                        /* 高低差至少要比「兩枚的直徑差」再多這麼多（× 大硬幣直徑）：上緣、中心、下緣看起來的上下關係才會一致 */
    var GROUP_SLOW = 1.3;                       /* 一組的掉落時間 ＝ 單枚的掉落時間 × 這個數（要連滑 2～3 次，多給一點時間） */
    var XSPAN = [0.2, 0.42];                    /* 硬幣出現的左右範圍：畫面中心 ± 畫面寬的幾成：第 0 枚 → 到頂（到頂時幾乎整個畫面寬；不會超出畫面） */
    var EDGE_P = [0, 0.45];                     /* 刻意貼著畫面邊緣出現的機率：第 0 枚 → 到頂 */
    var EDGE_BAND = 0.12;                       /* 「貼著邊緣」＝最外側多寬（畫面寬的幾成）的範圍 */
    var EDGE_TRICK = 0.65;                      /* 貼邊時，放在「跟它要滑的方向相反」那一邊的機率（50 元從右邊掉、10 元從左邊掉，干擾玩家；5 元左右各半） */
    var SWIPE_MIN = 40;                         /* 手指要拉開幾 px 才算一次滑 */
    var HORIZ_K = 0.75;                         /* 水平分量 ≥ 垂直分量 × 這個數，就算左右滑（不然往下算「下」） */
    var COIN_D = 0.2;                           /* 大硬幣的直徑占畫面寬度的比例 */
    var MAX_SAME = 3;                           /* 最多連續幾枚同一種硬幣 */
    var LEAD_MS = 700;                          /* 進場後第一枚硬幣多久出現 */
    var NEXT_MS = 140;                          /* 分對之後，下一枚多久出現 */
    var FLY_MS = 240;                           /* 硬幣滑進筒子的動畫時間 */
    var SOLVE_CAP = 8;                          /* 驗證用：api.solve 最多幫忙分對幾枚（不然會一直玩不完） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    /* 每種硬幣：幾元、金屬、該往哪滑、說明（結束時顯示） */
    var TYPES = ['c50', 'c5', 'c10'];
    var COIN = {                                    /* 每種硬幣的資料：value 面額、metal 金屬（銅／銀）、big 是不是大硬幣、dir 該往哪個筒子滑、name 名稱、look 外觀說明（結束時顯示） */
        c50: { value: '50', metal: 'copper', big: true, dir: 'left', name: '50 元', look: '銅色、大' },
        c5: { value: '5', metal: 'copper', big: false, dir: 'down', name: '5 元', look: '銅色、小' },
        c10: { value: '10', metal: 'silver', big: true, dir: 'right', name: '10 元', look: '銀色、大' }
    };
    var DIR_OF = { c50: 'left', c5: 'down', c10: 'right' };              /* 哪種硬幣該往哪滑（要改方向只改這裡） */
    var TUBE_X = { left: 0.17, down: 0.5, right: 0.83 };                 /* 三個筒子的中心 x（占畫面寬度的比例）：左、下、右 */
    var DIR_NAME = { left: '左', down: '下', right: '右' };  /* 方向的中文名稱：左、下、右 */
    var DIR_ARROW = { left: '←', down: '↓', right: '→' };  /* 方向對應的箭頭符號 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function prog(n) { return Math.min(1, Math.max(0, n / RAMP_COINS)); }
    function lerp(pair, n) { return pair[0] + (pair[1] - pair[0]) * prog(n); }
    function fallMsFor(n) { return Math.round(lerp(FALL_S, n) * 1000); }  /* Math.round：四捨五入成整數 */
    function backPFor(n) { return Math.round(lerp(BACK_P, n) * 1000) / 1000; }
    function ratio5For(n) { return Math.round(lerp(RATIO5, n) * 1000) / 1000; }
    /* 硬幣直徑（px）：W＝畫面寬 */
    function diameterOf(type, n, W) { var big = Math.round(W * COIN_D); return COIN[type].big ? big : Math.round(big * ratio5For(n)); }
    /* 手指位移 (dx, dy)（y 向下）→ 'left'｜'right'｜'down'｜'up'；位移太短回傳 null。往上滑回傳 'up'（不算數） */
    function classifySwipe(dx, dy, minDist) {
        if (Math.hypot(dx, dy) < (minDist == null ? SWIPE_MIN : minDist)) return null;
        if (Math.abs(dx) >= Math.abs(dy) * HORIZ_K && Math.abs(dx) > 0) return dx < 0 ? 'left' : 'right';  /* Math.abs：取絕對值（去掉負號） */
        return dy > 0 ? 'down' : 'up';
    }
    /* 下一枚硬幣：{ type, back }。三種各 1/3，但最多連續 MAX_SAME 枚同一種；back 依 backPFor(n) */
    function nextCoin(history, n, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var pool = TYPES.slice(), k = history.length;   /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
        if (k >= MAX_SAME) { var last = history[k - 1], same = true; for (var i = 1; i < MAX_SAME; i++) if (history[k - 1 - i] !== last) same = false; if (same) pool = pool.filter(function (t) { return t !== last; }); }  /* filter：留下符合條件的元素，回傳新陣列 */
        return { type: kit.pick(pool, rand), back: rand() < backPFor(n) };  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
    }
    /* ── V1.51：一次掉好幾枚、左右位置 ── */
    /* 從第 from 枚走到到頂（RAMP_COINS）的線性值 */
    function lerpFrom(pair, n, from) { var p = Math.min(1, Math.max(0, (n - from) / Math.max(1, RAMP_COINS - from))); return pair[0] + (pair[1] - pair[0]) * p; }
    function groupPFor(n) { return n < GROUP_FROM ? 0 : Math.round(lerpFrom(GROUP_P, n, GROUP_FROM) * 1000) / 1000; }
    function trioPFor(n) { return Math.round(lerp(TRIO_P, n) * 1000) / 1000; }
    /* 同一組上下相鄰兩枚的高低差範圍（單位＝大硬幣直徑）：[最小, 最大] */
    function gapRangeFor(n) { return [lerp([GAP_D[0][0], GAP_D[1][0]], n), lerp([GAP_D[0][1], GAP_D[1][1]], n)]; }
    function edgePFor(n) { return Math.round(lerp(EDGE_P, n) * 1000) / 1000; }
    /* 直徑 D 的硬幣，中心 x 可以放的範圍（畫面寬 W）：[最左, 最右]。wide＝true 時用整個畫面寬（一組好幾枚時要左右錯開，需要空間） */
    function xRangeFor(n, D, W, wide) {
        var lo0 = D / 2 + 4, hi0 = W - D / 2 - 4, s = lerp(XSPAN, n) * W;
        return wide ? [lo0, hi0] : [Math.max(lo0, W / 2 - s), Math.min(hi0, W / 2 + s)];
    }
    /* 一枚硬幣的中心 x：平常在 xRangeFor 的範圍裡隨機；有 edgePFor(n) 的機率貼著邊緣，而且多半貼在「跟它要滑的方向相反」那一邊 */
    function spawnX(type, n, D, W, rand, wide) {
        var r = xRangeFor(n, D, W, wide);
        if (rand() < edgePFor(n)) {
            var lo0 = D / 2 + 4, hi0 = W - D / 2 - 4, band = EDGE_BAND * W, dir = DIR_OF[type], side;
            if (dir === 'left') side = rand() < EDGE_TRICK ? 'right' : 'left';
            else if (dir === 'right') side = rand() < EDGE_TRICK ? 'left' : 'right';
            else side = rand() < 0.5 ? 'left' : 'right';
            return side === 'left' ? kit.randFloat(lo0, lo0 + band, rand) : kit.randFloat(hi0 - band, hi0, rand);  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
        }
        return kit.randFloat(r[0], r[1], rand);
    }
    /* 兩枚硬幣（off＝出現時「下緣」的 y，0＝剛好在畫面上緣、負的＝還在更上面）會不會疊在一起（圓心距離 < 兩個半徑相加 + 6px） */
    function overlaps(a, x, off, D) { var dx = a.x - x, dy = (a.off - a.D / 2) - (off - D / 2); return Math.hypot(dx, dy) < (a.D + D) / 2 + 6; }
    /* 出下一次要掉的硬幣：回傳陣列，第 0 枚是「最下面」（最先掉到筒子口）的，後面一枚比一枚高。
       每枚 { type, back, D 直徑, x 中心, off 出現時下緣的 y（第 0 枚 0，上面的是負的，差距＝高低差）}。
       history＝最近出過的種類（連續太多同種會換）；n＝已經分對幾枚；W＝畫面寬 */
    function planSpawn(history, n, W, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var size = 1;
        if (rand() < groupPFor(n)) size = rand() < trioPFor(n) ? 3 : 2;
        var hist = history.slice(), out = [], big = Math.round(W * COIN_D), gr = gapRangeFor(n);  /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
        for (var i = 0; i < size; i++) {
            var nc = nextCoin(hist, n, rand), D = diameterOf(nc.type, n, W), off = 0;
            hist.push(nc.type);
            if (i > 0) {
                var prev = out[i - 1], need = Math.abs(prev.D - D) + GAP_EDGE * big;     /* 直徑不同時，高低差要大於直徑差，上緣和下緣的上下關係才一致 */
                off = prev.off - Math.ceil(Math.max(need, kit.randFloat(gr[0], gr[1], rand) * big));   /* Math.ceil：無條件進位（先取整數再檢查，才不會四捨五入後反而疊到） */
            }
            var x = Math.round(spawnX(nc.type, n, D, W, rand, size > 1)), tries = 0;
            while (tries++ < 40 && out.some(function (o) { return overlaps(o, x, off, D); })) x = Math.round(spawnX(nc.type, n, D, W, rand, true));  /* some：只要有一個元素符合就回傳 true */
            if (out.some(function (o) { return overlaps(o, x, off, D); })) {              /* 保底（很少發生）：從左到右每 4px 試一次，挑離其他硬幣最遠的位置 */
                var r = xRangeFor(n, D, W, true), bestX = x, bestD = -1e9;
                for (var tx = Math.ceil(r[0]); tx <= r[1]; tx += 4) {
                    var clear = 1e9;
                    out.forEach(function (o) { clear = Math.min(clear, Math.hypot(o.x - tx, (o.off - o.D / 2) - (off - D / 2)) - (o.D + D) / 2); });  /* forEach：對陣列的每個元素各做一次 */
                    if (clear > bestD) { bestD = clear; bestX = tx; }
                }
                x = bestX;
                while (out.some(function (o) { return overlaps(o, x, off, D); })) off -= 4;   /* 還是放不下：再往上挪一點（高低差變大一點，上下關係不變） */
            }
            out.push({ type: nc.type, back: nc.back, D: D, x: x, off: off });
        }
        return out;
    }
    /* 這次滑對不對 */
    function isRight(type, dir) { return DIR_OF[type] === dir; }
    /* 結束時的說明：kind＝'wrong'（滑錯）、'miss'（來不及）或 'order'（滑了上面那枚的方向：順序錯了） */
    function whyText(type, kind, dir) {
        var c = COIN[type], want = DIR_NAME[DIR_OF[type]];
        if (kind === 'miss') return '來不及了！這枚是 ' + c.name + '（' + c.look + '），要往' + want + '滑';
        if (kind === 'order') return '順序錯了！要先滑最下面那枚：' + c.name + '（' + c.look + '），要往' + want + '滑';
        return '滑錯了！這枚是 ' + c.name + '（' + c.look + '），要往' + want + '滑，你滑了' + DIR_NAME[dir];
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 80) return '零錢達人！';
        if (n >= 40) return '眼明手快！';
        if (n >= 20) return '不錯喔！';
        if (n >= 8) return '再接再厲！';
        return '先看顏色、再看大小！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 20, stageClass: 'coinsort-stage', resume: false,
            head: function () { return '零錢入筒'; },
            info: function (S) { return '已收 ' + S.score + ' 枚'; },
            scoreOf: function (S) { return S.score; },
            numText: function (v) { return v + ' 枚'; },
            rating: rating,
            lines: function (S) { return ['一共分對 ' + S.score + ' 枚']; },
            setup: setup
        });
    }

    /* 畫一枚硬幣（SVG，viewBox −50～50）：正面顯示幾元，背面畫一個花紋（不仿真實硬幣圖案） */
    function coinSvg(type, back, D) {
        var c = COIN[type], svg = kit.svg('svg', { 'class': 'coinsort-coin coinsort-coin--' + c.metal, viewBox: '-50 -50 100 100', width: D, height: D });  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        kit.svg('circle', { 'class': 'coinsort-rim', cx: 0, cy: 0, r: 48 }, svg);
        kit.svg('circle', { 'class': 'coinsort-reed', cx: 0, cy: 0, r: 46 }, svg);
        kit.svg('circle', { 'class': 'coinsort-face', cx: 0, cy: 0, r: 40 }, svg);
        kit.svg('circle', { 'class': 'coinsort-ring', cx: 0, cy: 0, r: 40 }, svg);
        if (back) {
            kit.svg('circle', { 'class': 'coinsort-pat', cx: 0, cy: 0, r: 9 }, svg);
            for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4; kit.svg('circle', { 'class': 'coinsort-pat', cx: (25 * Math.cos(a)).toFixed(2), cy: (25 * Math.sin(a)).toFixed(2), r: 5 }, svg); }
        } else {
            var t = kit.svg('text', { 'class': 'coinsort-digit coinsort-digit--' + c.value.length, x: 0, y: 3 }, svg); t.textContent = c.value;  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
        }
        return svg;
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, S = api.S;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var count = 0, over = false, coins = [], history = [], gen = 0, loop = null;   /* coins：畫面上還沒處理的硬幣（一次掉好幾枚時不只一枚） */
        var counts = { c50: 0, c5: 0, c10: 0 };
        api.info = { get count() { return count; }, get coin() { return lowest(); }, get coins() { return coins.slice(); }, get over() { return over; } };
        S.score = 0; api.setInfo('已收 0 枚');
        console.log('[零錢入筒] 開始：掉落時間 ' + fallMsFor(0) + ' → ' + fallMsFor(RAMP_COINS) + ' 毫秒');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var field = h('div', { 'class': 'coinsort-field' });
        stage.appendChild(field);                       /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        /* 三個收集筒：左下 50 元、正下 5 元、右下 10 元；筒口的位置就是硬幣要掉到的線 */
        var TUBE_H = 150, tubeTop = H - TUBE_H - 8, lineY = tubeTop - 6, tubeW = Math.round(W * 0.28), tubes = {}, big = Math.round(W * COIN_D);
        ['left', 'down', 'right'].forEach(function (dir) {  /* forEach：對陣列的每個元素各做一次 */
            var type = TYPES.filter(function (t) { return DIR_OF[t] === dir; })[0], c = COIN[type];
            var el = h('div', { 'class': 'coinsort-tube' });
            el.style.cssText = 'left:' + Math.round(W * TUBE_X[dir] - tubeW / 2) + 'px;top:' + tubeTop + 'px;width:' + tubeW + 'px;height:' + TUBE_H + 'px;';
            var ico = h('div', { 'class': 'coinsort-tube__ico' }); ico.appendChild(coinSvg(type, false, Math.round(big * 0.5)));
            var lab = h('div', { 'class': 'coinsort-tube__lab', text: DIR_ARROW[dir] + ' ' + c.name });
            var num = h('div', { 'class': 'coinsort-tube__num', text: '0 枚' });
            el.appendChild(ico); el.appendChild(lab); el.appendChild(num); field.appendChild(el);
            tubes[type] = { el: el, num: num, dir: dir, x: Math.round(W * TUBE_X[dir]), ico: ico };
        });
        var info = h('div', { 'class': 'qz-note coinsort-info', text: '' }); field.appendChild(info);
        function tubeCount(type) { counts[type]++; tubes[type].num.textContent = counts[type] + ' 枚'; tubes[type].el.classList.remove('coinsort-tube--hit'); void tubes[type].el.offsetWidth; tubes[type].el.classList.add('coinsort-tube--hit'); }  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */

        /* 畫面上「最下面」的那枚（最先掉到筒子口的；滑的時候就是滑它）。同一組的速度一樣，所以 t0 最早的就是最下面的 */
        function lowest() {
            var best = null;
            coins.forEach(function (c) { if (!c.done && (!best || c.t0 < best.t0)) best = c; });
            return best;
        }
        /* ── 出一枚（或一組好幾枚）硬幣 ── */
        function spawn() {
            if (over || api.over) return;
            var plan = planSpawn(history, count, W, api.rand), fall = Math.round(fallMsFor(count) * (plan.length > 1 ? GROUP_SLOW : 1)), now = performance.now();  /* performance.now()：高精度的時間（毫秒），計時用 */
            plan.forEach(function (pc) {
                history.push(pc.type); if (history.length > 8) history.shift();
                var el = h('div', { 'class': 'coinsort-coinbox' });
                el.style.cssText = 'width:' + pc.D + 'px;height:' + pc.D + 'px;';
                el.appendChild(coinSvg(pc.type, pc.back, pc.D)); field.appendChild(el);
                /* 出現時下緣在 y＝off（第 0 枚 0＝剛好在畫面上緣；上面的枚是負的）：把起點時間往後挪，速度就跟同組的一樣、高低差一直維持 */
                var c = { type: pc.type, back: pc.back, D: pc.D, x: pc.x, y: pc.off - pc.D, el: el, t0: now - pc.off / lineY * fall, fall: fall, done: false, no: ++gen };
                coins.push(c); place(c, c.x, c.y);
            });
            if (plan.length > 1) console.log('[零錢入筒] 一次掉 ' + plan.length + ' 枚（由下往上）：' + plan.map(function (p) { return COIN[p.type].name + (p.back ? '背' : '') + '@' + p.off; }).join('、'));
            if (count === 0 && kit.once('coinsort.hint')) {  /* kit.once(key)：同一個頁面只有第一次回傳 true（用來讓提示只出現一次） */
                var mine = lowest();
                api.after(900, function () {            /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
                    if (!mine || mine.done || over) return;
                    var tt = tubes[mine.type], p = Math.min(1, (performance.now() - mine.t0) / mine.fall), cy = -mine.D + lineY * p + mine.D / 2;          /* 硬幣現在的中心 y */
                    kit.hintOn(stage, null, { mode: 'drag', x: mine.x, y: cy, dx: tt.x - mine.x, dy: tubeTop + 30 - cy, text: '照筒子上的箭頭滑' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
                });
            }
        }
        function place(c, x, y) { c.el.style.transform = 'translate3d(' + (x - c.D / 2).toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)'; }
        /* 每一格影格：硬幣往下掉；掉到筒子口還沒滑 → 結束 */
        loop = api.my.loop(function (now) {             /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
            if (over || !stage.isConnected) return false;
            for (var i = 0; i < coins.length; i++) {
                var c = coins[i]; if (c.done) continue;
                var p = (now - c.t0) / c.fall;
                if (p >= 1) { place(c, c.x, lineY - c.D); miss(); return; }
                c.y = -c.D + lineY * p; place(c, c.x, c.y);                 /* 頂端的 y：從 −D（剛好在畫面上方）走到 lineY − D（硬幣底部碰到筒子口） */
            }
        });
        /* 保底：rAF 被暫停（背景分頁）時，用計時器檢查是不是掉到底了 */
        (function guard() { api.after(250, function () { if (over || api.over) return; var c = lowest(); if (c && performance.now() - c.t0 >= c.fall + 150) miss(); guard(); }); })();
        api.after(LEAD_MS, spawn);

        /* ── 滑 ── */
        var down = null;
        field.addEventListener('pointerdown', function (e) {  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
            if (over || api.over || down) return;
            e.preventDefault(); try { field.setPointerCapture(e.pointerId); } catch (err) { }  /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
            var p = kit.localPt(e, field); down = { id: e.pointerId, x: p.x, y: p.y, fired: false };
        });
        function track(e) {
            if (!down || e.pointerId !== down.id || down.fired) return;
            var p = kit.localPt(e, field), d = classifySwipe(p.x - down.x, p.y - down.y);
            if (d == null || d === 'up') return;
            down.fired = true; swipe(d);
        }
        field.addEventListener('pointermove', track);
        field.addEventListener('pointerup', function (e) { track(e); if (down && e.pointerId === down.id) down = null; });
        field.addEventListener('pointercancel', function (e) { if (down && e.pointerId === down.id) down = null; });

        function swipe(dir) {
            var c = lowest();                           /* 一次掉好幾枚時，滑的永遠是最下面那枚 */
            if (over || api.over || !c) return;
            c.done = true;
            var ok = isRight(c.type, dir), tube = tubes[ok ? c.type : TYPES.filter(function (t) { return DIR_OF[t] === dir; })[0]];
            /* 滑錯時，如果這個方向剛好是「上面某一枚」該滑的方向＝玩家先處理了上面那枚（順序錯了） */
            var order = !ok && coins.some(function (o) { return o !== c && !o.done && isRight(o.type, dir); });
            /* 硬幣飛進筒子口 */
            var fx = c.x, fy = c.y, tx = tube.x, ty = tubeTop + 22;
            api.my.tween(FLY_MS, function (p) { place(c, fx + (tx - fx) * p, fy + (ty - c.D / 2 - fy) * p); c.el.style.opacity = String(1 - 0.6 * p); }, kit.easeInQuad).then(function () {  /* my.tween(毫秒, 函式)：動畫補間：在這段時間內，函式每一幀會收到 0→1 的進度 */
                if (c.el.parentNode) c.el.parentNode.removeChild(c.el);
                if (ok && !over) { tubeCount(c.type); }
            });
            if (ok) {
                count++; S.score = count; api.setInfo('已收 ' + count + ' 枚'); Sfx.play('ok');  /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
                coins = coins.filter(function (o) { return !o.done; });   /* filter：留下符合條件的元素，回傳新陣列 */
                if (!coins.length) api.after(NEXT_MS, spawn);              /* 畫面上的都處理完了，才出下一枚（或下一組） */
            } else finish(order ? 'order' : 'wrong', c, dir);
        }
        function miss() { var c = lowest(); if (over || api.over || !c) return; c.done = true; finish('miss', c, null); }
        /* 這一局結束：算出成績並進入結算畫面 */
        function finish(kind, c, dir) {
            if (over) return;
            over = true;
            var why = whyText(c.type, kind, dir);
            info.textContent = why;
            coins.forEach(function (o) { if (o !== c && !o.done) o.el.classList.add('coinsort-coinbox--dim'); });   /* 其他還在畫面上的硬幣變淡，看得出是哪一枚出錯 */
            tubes[c.type].el.classList.add('coinsort-tube--right');
            if (dir) { var wt = TYPES.filter(function (t) { return DIR_OF[t] === dir; })[0]; if (wt !== c.type) tubes[wt].el.classList.add('coinsort-tube--wrong'); }
            /* 那一枚硬幣放大、翻到正面 */
            if (kind === 'miss' && c.el.parentNode) c.el.parentNode.removeChild(c.el);
            var BD = Math.round(W * 0.42), bigEl = h('div', { 'class': 'coinsort-bigcoin' });
            bigEl.style.cssText = 'width:' + BD + 'px;height:' + BD + 'px;left:' + Math.round((W - BD) / 2) + 'px;top:' + Math.round(Math.max(70, (lineY - BD - 90) / 2 + 40)) + 'px;';
            bigEl.appendChild(coinSvg(c.type, false, BD)); field.appendChild(bigEl);
            api.after(40, function () { bigEl.classList.add('coinsort-bigcoin--show'); });
            info.style.top = Math.round(Math.max(70, (lineY - BD - 90) / 2 + 40) + BD + 14) + 'px';
            kit.flash(stage, false, api.my);            /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            var lines = [why, '銅色大＝50 元（往左）、銅色小＝5 元（往下）、銀色大＝10 元（往右）'];
            if (kind === 'order') lines.push('一次掉好幾枚時，每次滑都是滑最下面那一枚');
            api.fail({ delay: 3800, lines: lines });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }

        /* 驗證用：幫忙滑對／滑錯目前最下面那枚（可以重複呼叫；solve 最多幫 SOLVE_CAP 枚） */
        api.solve = function () { var c = lowest(); if (over || !c || count >= SOLVE_CAP) return; swipe(DIR_OF[c.type]); };
        api.wrong = function () { var c = lowest(); if (over || !c) return; swipe(DIR_OF[c.type] === 'left' ? 'right' : 'left'); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '零錢入筒',
        rule: '硬幣從上面掉下來，要在它掉到筒子口之前**用手指滑進對的筒**：**銅色的大硬幣（50 元）往左滑、銅色的小硬幣（5 元）往下滑、銀色的大硬幣（10 元）往右滑**，筒子上有箭頭提醒。有時候一次掉好幾枚，**每次滑都是滑最下面那一枚**，要先看清楚誰比較低！滑錯、或來不及滑就結束，看你能分對幾枚。越後面掉得越快、越常**背面朝上**（只能看顏色和大小），也會從畫面邊邊掉下來。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            prog: prog, fallMsFor: fallMsFor, backPFor: backPFor, ratio5For: ratio5For, diameterOf: diameterOf, classifySwipe: classifySwipe, nextCoin: nextCoin, isRight: isRight, whyText: whyText, rating: rating,
            groupPFor: groupPFor, trioPFor: trioPFor, gapRangeFor: gapRangeFor, edgePFor: edgePFor, xRangeFor: xRangeFor, spawnX: spawnX, overlaps: overlaps, planSpawn: planSpawn,
            RAMP_COINS: RAMP_COINS, FALL_S: FALL_S, BACK_P: BACK_P, RATIO5: RATIO5, SWIPE_MIN: SWIPE_MIN, HORIZ_K: HORIZ_K, COIN_D: COIN_D, MAX_SAME: MAX_SAME, SOLVE_CAP: SOLVE_CAP, TYPES: TYPES, COIN: COIN, DIR_OF: DIR_OF, TUBE_X: TUBE_X,
            GROUP_FROM: GROUP_FROM, GROUP_P: GROUP_P, TRIO_P: TRIO_P, GAP_D: GAP_D, GAP_EDGE: GAP_EDGE, GROUP_SLOW: GROUP_SLOW, XSPAN: XSPAN, EDGE_P: EDGE_P, EDGE_BAND: EDGE_BAND, EDGE_TRICK: EDGE_TRICK
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
