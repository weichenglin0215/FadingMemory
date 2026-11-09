/* ═══════════════════════════════════════════════════════════════════
   reaction_halfcrowd.js — 秒反應・一半的人（原企劃「009 一半的人」的復活版）
   樣式：css/games/reaction_halfcrowd.css（這款專屬的 class 一律以「halfcrowd-」開頭；共用元件在 css/reaction_common.css）
   畫面上有一堆「人」（各種人像 emoji，見 kit.PERSON_EMOJI；每個人的中心有一個小黑點＝中心點；個數隨關卡慢慢變多，見 N_RANGE），
   人與人之間最多只能重疊 OVERLAP（碰撞範圍仍是一個半徑 R_RANGE 的圓）。
   一條豎線一開始在畫面中央，拖曳下方的橫桿把它移到「左右兩邊人數一樣多」的位置，
   按「計算數量」：豎線左邊的人會一個一個在底下亮起綠色圈、右邊的一個一個亮起藍色圈（從離線最近的開始，左右同時數），上方同步顯示數量；
   兩邊一樣多就過關。不一樣多的話，多出來的那一邊，超過另一邊的人（例如左 3 右 5：右邊第 4、5 個）改亮紅色圈，再失敗。
   是否在線的左右，以「中心點」為準。
   · V1.40.0（玩家回饋）：圓點圖案換成人像 emoji（每個人隨機一種）。emoji 大小＝圓的直徑 × FACE_SCALE；數過之後的綠／藍／紅色圈畫在 emoji 底下；
     中心點（SHOW_CENTER）是一顆小黑點（白邊），全部畫在最上層，不會被別人的 emoji 蓋住——判斷左右是看中心點不是臉的邊緣。
   · 玩家回饋（前面的關卡，正確位置自然會有一道明顯的空隙，找縫就能過關）：出題後多一道 addDecoys，在正確位置的左右兩邊各開幾道同樣明顯的「假空隙」（DECOY：整群人往外平推，
     不影響「剛好一半」的答案與容許寬度）；channelsOf 負責找出畫面上所有這種豎直空隙，測試用它檢查假空隙真的存在。
   · 玩家回饋（數量動畫的色圈被人像蓋住看不出來）：色圈半徑＝人的半徑 × RING_SCALE，而且所有色圈先畫、所有人像後畫（人像永遠在色圈上面）。
   關卡制：成績＝過了幾關。越後面圓形的分布越不平均（越擠在某一側），豎線要移得越遠、容許的位置也越窄。
   ───────────────────────────────────────────────────────────────────
   · V1.28（玩家意見：某一關會突然冒出大量圓形）：以前每一關的個數是在 N_RANGE 之間「完全隨機」抽，所以第 2 關也可能 120 個；
     現在個數隨關卡線性變多：第 1 關 N_RANGE[0]、第 RAMP_LEVELS 關 N_RANGE[1]，每一關只在這個基準上下 ±N_JITTER 個（偶數）內抖動，
     不會超出 N_RANGE（nAt）。
   · 圓形個數 N 一定是偶數，所以一定有一個「剛好一半」的位置：
     把所有圓心的 x 由小到大排好，第 N／2 個與第 N／2＋1 個之間（lo～hi）的任何位置都對。
   · 「重疊最多 60%」：兩個圓心距離 d 要 ≥ 0.4 ×（r1＋r2）（兩個一樣大的圓，d ≥ 0.8r＝重疊 60%）。
   · 不平均程度 skew：從 0（平均分布）線性升到 SKEW_MAX；圓心 x 一部分來自平均分布、一部分擠在某個偏離中央的小區域。
   · 容許寬度 lo～hi 至少 GAP_MIN px（第 1 關 GAP[0]、線性縮到 GAP[1]），不夠就把中間那一顆往右推開，
     所以不會出現「要精準到 0.1 px」的題目。橫桿旁有 ◀ ▶ 可以一次移 1 px 微調。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'halfcrowd'：選單、成績、存檔都靠它；樣式在 css/games/reaction_halfcrowd.css，裡面的 class 名稱一律以 halfcrowd- 開頭。 */
    'use strict';

    var ID = 'halfcrowd';                               /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var N_RANGE = [10, 100];                    /* 圓形個數範圍（偶數） */
    var R_RANGE = [10, 20];                     /* 圓形半徑範圍（px） */
    var OVERLAP = 0.0;                          /* 兩個圓最多重疊多少（0.6＝60%） */
    var SKEW_MAX = 0.85;                        /* 最後一關的不平均程度（0＝平均分布，1＝幾乎全擠在一處） */
    var GAP = [60, 3];                           /* 容許的位置寬度（lo～hi 的距離，px）：第 1 關 → 到頂（最少值） */
    var EDGE = 18;                              /* 圓心離畫面邊緣至少多遠（px） */
    var COUNT_STEP_MS = 1500;                   /* 「計算數量」整個動畫的時間 */
    var N_JITTER = 4;                           /* 每一關的圓形個數，在線性基準上下最多抖動幾個（偶數） */
    var TRIES = 60;                                 /* 出題時最多重抽幾次 */
    var FACE_SCALE = 1.0;                       /* 人像 emoji 的字級＝圓直徑（2r）× 這個倍率 */
    var SHOW_CENTER = false;                     /* 要不要在每個人的中心畫小黑點（判斷左右的依據；設成 false 就只剩 emoji） */
    var RING_SCALE = 1.4;                       /* 「計算數量」時，人像底下那圈綠／藍／紅色圓的半徑＝人的半徑 r × 這個倍率（1＝跟人一樣大，會被人像整個蓋住；調大才看得到色圈從人像四周露出來；只影響色圈，不影響人與人之間的距離） */
    /* 假空隙（干擾用）：前面的關卡「剛好一半」的容許寬度很大（見 GAP），正確位置會自然出現一道明顯的豎直空隙，玩家找空隙就能過關、不用數人頭。
       解法：在正確位置的左、右兩邊各開出幾道同樣明顯（甚至更寬）的假空隙——做法是把一整群人往外平推，所以人不會重疊、左右各一半的答案也不會變。
       from：從第幾關開始（0＝完全關掉）；to：到第幾關為止（含，0＝不設上限）；count：正確位置的左邊、右邊「各」開幾道；
       rank：假空隙離正確位置幾個人（1～6＝假空隙那條線左邊的人數，跟「一半」差 1～6 個；人少的關卡最多差到一半少一個）；min：假空隙至少要多寬（px，推不出這麼寬就不開）；
       ratio：假空隙的寬度＝「max(min, 正確位置那道空隙的寬度) × 這個範圍內的隨機倍率」（大於 1＝假的比真的還寬，找最寬的縫就會被騙）；
       keep：人群太擠、沒地方推的時候，會把別處「自然出現」的空隙壓窄來騰出位置，被壓的空隙最少還留幾 px（正確位置那道與已經開好的假空隙不會被壓） */
    var DECOY = { from: 1, to: 20, count: 1, rank: [1, 6], min: 18, ratio: [0.9, 1.4], keep: 8 };
    /* 干擾用的動態條紋背景（共用元件 js/reaction_bgstripe.js，各欄位的意思見該檔開頭）：from 是從第幾關開始出現（想關掉改成 0，想晚一點出現就調大）；數字寫成 [起, 終] 會從第 from 關起漸漸變強 */
    var BG = { from: 0, type: 'checker', diff: [3, 6], width: 44, move: 'all', speed: 14 };  /* from 0＝目前關閉；若改成 8 就是第 8 關起出現：棋盤格、亮度差 3% → 6%（20 關內漸強）、格寬 44px、全方向捲動 14px／秒 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function skewAt(level) { return kit.ramp(level, 0, SKEW_MAX, RAMP_LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function gapAt(level) { return kit.ramp(level, GAP[0], GAP[1], RAMP_LEVELS); }
    /* 第 level 關的圓形個數（偶數）：N_RANGE[0] → N_RANGE[1] 線性變多，再在基準上下 ±N_JITTER 抖動，夾在 N_RANGE 內 */
    function nAt(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var base = kit.ramp(level, N_RANGE[0], N_RANGE[1], RAMP_LEVELS);
        var n = 2 * Math.round((base + kit.randFloat(-N_JITTER, N_JITTER, rand)) / 2);  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
        var lo = 2 * Math.ceil(N_RANGE[0] / 2), hi = 2 * Math.floor(N_RANGE[1] / 2);  /* Math.floor：無條件捨去成整數 */
        return kit.clamp(n, lo, hi);                    /* kit.clamp(值, 最小, 最大)：把數值限制在範圍內（太小就取最小、太大就取最大） */
    }
    /* 數數量的動畫計畫：左右各 nl、nr 個——先左右成對數 min(nl,nr) 組（綠＋藍），再數多出來的（那一邊 side：−1 左、＋1 右、0 一樣多）變紅色 */
    function countPlan(nl, nr) { return { pairs: Math.min(nl, nr), extra: Math.abs(nl - nr), side: nl > nr ? -1 : (nr > nl ? 1 : 0) }; }  /* Math.abs：取絕對值（去掉負號） */
    /* 動畫進度 e（0～1）時已經數了幾組、幾個多出來的：每個步驟一樣久，先數成對的、再數多出來的 */
    function planAt(plan, e) {
        var total = plan.pairs + plan.extra, n = Math.round(total * e);  /* Math.round：四捨五入成整數 */
        return { pairs: Math.min(n, plan.pairs), extra: Math.max(0, n - plan.pairs) };
    }
    /* 兩個圓能不能放在一起：圓心距離 ≥ (1 − OVERLAP) ×（r1＋r2）／… 這裡用「距離 ≥ 0.4×(r1+r2)」（重疊最多 60%） */
    function minDist(r1, r2) { return (1 - OVERLAP) * (r1 + r2); }
    /* 圓心 x 小於線的算左邊；等於線的算右邊 */
    function countLeft(circles, lineX) { var n = 0; circles.forEach(function (c) { if (c.x < lineX) n++; }); return n; }  /* forEach：對陣列的每個元素各做一次 */
    function byX(a, b) { return a.x - b.x; }            /* 排序用：依中心點 x 由小到大 */
    /* 這一關有沒有假空隙：DECOY.from ≤ 關卡 ≤ DECOY.to（from 是 0 就完全不開；to 是 0 代表不設上限） */
    function decoyOn(level) { return DECOY.from > 0 && DECOY.count > 0 && level >= DECOY.from && (!DECOY.to || level <= DECOY.to); }
    /* 空隙分析：每個人佔的 x 範圍是 [x−r, x+r]；從左掃到右，找出「整條豎線都碰不到任何人」的空隙（只算人與人之間，窄過 minW 的不算）。
       回傳 [{ x0, x1, w 寬度, mid 中點, left 這道空隙左邊有幾個人 }]；left 剛好是人數的一半的那一道，就是正確答案所在的空隙 */
    function channelsOf(circles, minW) {
        var arr = circles.map(function (c) { return { a: c.x - c.r, b: c.x + c.r }; }), out = [], i;
        arr.sort(function (p, q) { return p.a - q.a; });
        var reach = arr.length ? arr[0].b : 0;           /* reach：目前已經掃過的人，最右邊碰到哪裡 */
        for (i = 1; i < arr.length; i++) {
            var w = arr[i].a - reach;
            if (w > 0 && w >= (minW || 0)) out.push({ x0: reach, x1: arr[i].a, w: w, mid: (reach + arr[i].a) / 2, left: i });
            if (arr[i].b > reach) reach = arr[i].b;
        }
        return out;
    }
    /* 一群人往 dir 方向（−1 往左、＋1 往右）「壓緊」時，每個人最多能移多遠（回傳和 group 同順序的陣列）：
       先依 x 範圍把這群人切成幾「塊」（兩塊之間隔著一道整條都空的縫）；最靠邊那塊最多移到貼著畫面邊緣（EDGE），
       下一塊最多再多移「那道縫的寬度 − DECOY.keep」（縫壓到只剩 keep 寬，不能再窄、也不能讓人撞在一起），以此類推。
       base：這群人左邊（整個畫面）已經有幾個人；prot：不准壓縮的縫（用「縫左邊有幾個人」當鍵：正確答案那道縫、已經開好的假空隙）——
       被保護的縫兩邊的人移動量一樣，寬度不變 */
    function packCaps(group, base, dir, W, prot) {
        var items = group.map(function (c, i) { return { i: i, a: dir < 0 ? c.x - c.r : W - c.x - c.r, b: dir < 0 ? c.x + c.r : W - c.x + c.r }; });  /* dir＞0 時把畫面左右翻過來算，這樣都是「往 a 變小的方向移」 */
        items.sort(function (p, q) { return p.a - q.a; });
        var caps = new Array(group.length), cap = items.length ? Math.max(0, items[0].a - EDGE) : 0, reach = items.length ? items[0].b : 0;  /* reach：已經掃過的人，最遠碰到哪 */
        for (var k = 0; k < items.length; k++) {
            var it = items[k];
            if (k > 0 && it.a > reach) {                    /* 這個人前面隔著一道整條都空的縫（前面已經掃過 k 個人） */
                var leftCount = dir < 0 ? base + k : base + items.length - k;  /* 這道縫在真實畫面上，左邊有幾個人 */
                if (!prot[leftCount]) cap += Math.max(0, it.a - reach - DECOY.keep);
            }
            caps[it.i] = cap;
            if (it.b > reach) reach = it.b;
        }
        return caps;
    }
    /* 規劃一道假空隙：sorted 是依中心點 x 排好的人；前 j 個人是「左群」、其餘是「右群」，要讓兩群之間的空隙寬到 want。
       做法是把左群往左壓緊 dl、右群往右壓緊 dr（每個人實際移 min(dl, 他的上限)，上限見 packCaps；side＝−1 先壓左群、＋1 先壓右群，壓到極限還不夠才壓另一群，而且只壓到剛好夠寬）。
       移動只會讓兩群離得更遠、群內的人不會撞在一起，每個人的左右順序（誰是第幾個）也不變。回傳 { j, w 開完的空隙寬, dx 每個人要移多少, move 總移動量 }（只是計畫，還沒動人） */
    function carvePlan(sorted, j, want, W, side, prot) {
        var L = sorted.slice(0, j), R = sorted.slice(j), capL = packCaps(L, 0, -1, W, prot), capR = packCaps(R, j, 1, W, prot), i;
        var maxL = Math.max.apply(null, capL), maxR = Math.max.apply(null, capR);
        function width(dl, dr) {                            /* 左群移 dl、右群移 dr 之後，兩群之間的空隙寬（負的＝兩邊的 x 範圍還互相重疊） */
            var aR = -1e9, bL = 1e9, n;
            for (n = 0; n < L.length; n++) aR = Math.max(aR, L[n].x + L[n].r - Math.min(dl, capL[n]));
            for (n = 0; n < R.length; n++) bL = Math.min(bL, R[n].x - R[n].r + Math.min(dr, capR[n]));
            return bL - aR;
        }
        function least(f, top) {                            /* 二分搜尋：在 0～top 之間找「最小的 d，讓 f(d) ≥ want」；到 top 都不夠就回傳 top */
            if (f(0) >= want) return 0;
            if (f(top) < want) return top;
            var lo = 0, hi = top;
            for (var it = 0; it < 24; it++) { var mid = (lo + hi) / 2; if (f(mid) >= want) hi = mid; else lo = mid; }
            return hi;
        }
        var dl = 0, dr = 0;
        if (side < 0) { dl = least(function (d) { return width(d, 0); }, maxL); if (width(dl, 0) < want) dr = least(function (d) { return width(dl, d); }, maxR); }
        else { dr = least(function (d) { return width(0, d); }, maxR); if (width(0, dr) < want) dl = least(function (d) { return width(d, dr); }, maxL); }
        var dx = [], move = 0;
        for (i = 0; i < sorted.length; i++) { var m = i < j ? -Math.min(dl, capL[i]) : Math.min(dr, capR[i - j]); dx.push(m); move += Math.abs(m); }
        return { j: j, w: width(dl, dr), dx: dx, move: move };
    }
    /* 在剛出好的題目 q 裡開假空隙（見 DECOY）：正確位置的左、右兩邊各 DECOY.count 道，離正確位置 DECOY.rank 個人。
       開完把 q.lo／q.hi／q.gap 照新位置重算（整群平移，順序沒變，所以「第 N/2、N/2+1 個」還是同兩個人，寬度也不變）；q.decoys 記下開了哪幾道（除錯與測試用） */
    function addDecoys(q, level, rand) {
        q.decoys = [];
        if (!decoyOn(level)) return q;
        var half = q.N / 2, sorted = q.circles.slice().sort(byX), kmax = Math.min(DECOY.rank[1], half - 1), kmin = Math.min(DECOY.rank[0], kmax);
        var ans = channelsOf(q.circles, 0).filter(function (c) { return c.left === half; })[0], aw = ans ? ans.w : 0;  /* 正確位置那道空隙的寬度（沒有空隙就是 0） */
        var prot = {}, firstSide = rand() < 0.5 ? -1 : 1;  /* prot：不准被壓縮的縫（鍵＝縫左邊的人數）：先保護正確答案那道，之後開好的假空隙也加進來 */
        prot[half] = true;
        for (var s = 0; s < 2; s++) {
            var side = s ? -firstSide : firstSide;        /* −1＝正確位置的左邊、＋1＝右邊；左右兩邊都要有 */
            for (var t = 0; t < DECOY.count; t++) {
                var want = Math.max(DECOY.min, aw) * kit.randFloat(DECOY.ratio[0], DECOY.ratio[1], rand), best = null;
                for (var k = kmin; k <= kmax; k++) {         /* 試每一個距離，挑「寬度夠、人移得少、又離正確位置近」的那個切點（近的比較有誘惑力：每遠 1 個人，扣 25 分＝多移 25px） */
                    var j = half + side * k;
                    if (j < 1 || j > q.N - 1 || prot[j]) continue;
                    var p = carvePlan(sorted, j, want, q.W, side, prot);
                    if (p.w < DECOY.min) continue;
                    p.score = Math.min(p.w, want) * 1000 - p.move - k * 25;
                    if (!best || p.score > best.score) best = p;
                }
                if (!best) break;
                sorted.forEach(function (c, i) { c.x += best.dx[i]; });
                prot[best.j] = true;
                q.decoys.push({ j: best.j, off: best.j - half, w: best.w, want: want });
            }
        }
        var srt = q.circles.slice().sort(byX);
        q.lo = srt[half - 1].x; q.hi = srt[half].x; q.gap = q.hi - q.lo;
        return q;
    }
    /* 出一關：回傳 { circles:[{x,y,r}], N, lo, hi（第 N/2 與 N/2+1 個圓心的 x）, gap, skew, W, H, decoys }；先照原本的方式出題（baseLevel），再開假空隙（addDecoys） */
    function makeLevel(level, W, H, rand) {
        rand = rand || Math.random;
        var q = baseLevel(level, W, H, rand);
        return q ? addDecoys(q, level, rand) : q;
    }
    /* 原本的出題：亂數放人（越後面越擠在某一側），算出 lo／hi，容許寬度不夠就把中間那一顆往右推開 */
    function baseLevel(level, W, H, rand) {
        rand = rand || Math.random;
        var skew = skewAt(level), need = gapAt(level), last = null;
        for (var tr = 0; tr < TRIES; tr++) {            /* 用亂數一直重抽，最多 TRIES 次，抽到符合條件的題目就收下 */
            var N = nAt(level, rand);
            /* 擠在哪裡：偏離中央至少 skew×0.28 倍畫面寬，左右隨機；擠成的區域寬度＝畫面寬的 0.3～0.18（越不平均越窄） */
            var side = rand() < 0.5 ? -1 : 1, cc = W / 2 + side * kit.randFloat(0.35, 1, rand) * skew * W * 0.34, sigma = W * kit.lerp(0.14, 0.07, skew / SKEW_MAX);
            var cs = [], ok = true, i, k;
            for (i = 0; i < N && ok; i++) {
                var placed = false;
                for (k = 0; k < 400 && !placed; k++) {
                    var r = kit.randInt(R_RANGE[0], R_RANGE[1], rand), x, y = kit.randFloat(EDGE + r, H - EDGE - r, rand);  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
                    if (rand() < skew) {                                  /* 擠在 cc 附近（高斯分布，用兩個均勻亂數相加近似）*/
                        x = cc + (rand() + rand() + rand() - 1.5) * 2 * sigma;
                    } else x = kit.randFloat(EDGE + r, W - EDGE - r, rand);
                    if (x < EDGE + r || x > W - EDGE - r) continue;
                    var clash = false;
                    for (var j = 0; j < cs.length; j++) {
                        var dx = cs[j].x - x, dy = cs[j].y - y, md = minDist(cs[j].r, r);
                        if (dx * dx + dy * dy < md * md) { clash = true; break; }
                    }
                    if (!clash) { cs.push({ x: x, y: y, r: r }); placed = true; }
                }
                if (!placed) ok = false;
            }
            if (!ok) continue;
            /* 容許寬度不夠：把右半邊最靠左的那一顆往右推開（要沒撞到別的圓、沒出界） */
            var sorted = cs.slice().sort(function (a, b) { return a.x - b.x; }), lo = sorted[N / 2 - 1], hi = sorted[N / 2];  /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
            last = { circles: cs, N: N, lo: lo.x, hi: hi.x, gap: hi.x - lo.x, skew: skew, W: W, H: H, need: need };
            if (hi.x - lo.x < need) {
                var nx = lo.x + need + 0.5, can = nx <= W - EDGE - hi.r;
                for (var m = 0; m < cs.length && can; m++) {
                    if (cs[m] === hi) continue;
                    var ddx = cs[m].x - nx, ddy = cs[m].y - hi.y, md2 = minDist(cs[m].r, hi.r);
                    if (ddx * ddx + ddy * ddy < md2 * md2) can = false;
                }
                if (!can) continue;
                hi.x = nx;
                sorted = cs.slice().sort(function (a, b) { return a.x - b.x; });  /* sort：排序；比較函式回傳負數代表 a 排前面、回傳正數代表 b 排前面 */
                if (sorted[N / 2 - 1].x >= sorted[N / 2].x || sorted[N / 2] !== hi) continue;
                last.lo = sorted[N / 2 - 1].x; last.hi = sorted[N / 2].x; last.gap = last.hi - last.lo;
                if (last.gap < need) continue;
            }
            return last;
        }
        /* 一直達不到要求的容許寬度：回傳最後一次的結果，但 lo／hi 要照現在的圓心位置重算（推開圓形的嘗試失敗後，圓心位置可能已經動過） */
        if (last) {
            var srt = last.circles.slice().sort(function (a, b) { return a.x - b.x; });
            last.lo = srt[last.N / 2 - 1].x; last.hi = srt[last.N / 2].x; last.gap = last.hi - last.lo;
        }
        return last;
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 20) return '一眼看穿！';
        if (n >= 12) return '數得真準！';
        if (n >= 7) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '人不是均勻分布的，線不在正中間，再試一次！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        Reaction.emojiPng.whenReady(root, function () { kit.run(root, ctx, {   /* 人像改貼 PNG（每種裝置看到的都一樣）：圖集載好才開始 */
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            stageClass: 'halfcrowd-stage',
            setup: setup
        }); });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level, my = api.my;
        kit.bgStripe(stage, my, level, BG);            /* 在舞台最底下墊一層淡淡的動態棋盤格（BG.from 關之後才出現），干擾對人數多寡的判斷 */
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var TOP = 48, BOT = 56 + 84 + 20;                         /* 上方數量列高度、下方橫桿＋按鈕區高度 */
        var AH = H - TOP - BOT;                                   /* 圓形區高度 */
        var q = makeLevel(level, W, AH, api.rand);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[一半的人] 第 ' + level + ' 關：' + q.N + ' 個人、不平均程度 ' + q.skew.toFixed(2) + '；正確範圍 x＝' + q.lo.toFixed(2) + '～' + q.hi.toFixed(2) + '（寬 ' + q.gap.toFixed(2) + 'px，要求至少 ' + q.need.toFixed(1) + 'px）；假空隙 ' + q.decoys.length + ' 道；線從 ' + (W / 2) + ' 開始');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var info = h('div', { 'class': 'halfcrowd-count' }, [
            h('span', { 'class': 'halfcrowd-count__g', text: '綠色 0' }), h('span', { 'class': 'halfcrowd-count__vs', text: '：' }), h('span', { 'class': 'halfcrowd-count__b', text: '0 藍色' })
        ]);
        stage.appendChild(info);                        /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var svg = kit.svg('svg', { 'class': 'halfcrowd-svg', viewBox: '0 0 ' + W + ' ' + AH, width: W, height: AH }, stage);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        svg.style.top = TOP + 'px';
        /* 每個人：底圈（平常看不見，數過之後變綠／藍／紅；半徑＝r × RING_SCALE）＋人像 emoji；中心點全部畫在最上層（見 SHOW_CENTER）。
           先畫一層「所有人的底圈」、再畫一層「所有人的人像」：底圈比人像大，這樣才不會有人的色圈蓋住鄰居的臉 */
        var ringLayer = kit.svg('g', {}, svg), faceLayer = kit.svg('g', {}, svg);
        var els = q.circles.map(function (c) {          /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            var cir = kit.svg('circle', { cx: c.x.toFixed(2), cy: c.y.toFixed(2), r: (c.r * RING_SCALE).toFixed(2), 'class': 'halfcrowd-circle' }, ringLayer);
            Reaction.emojiPng.svg(faceLayer, kit.pick(kit.PERSON_EMOJI, api.rand), c.x, c.y, c.r * 2 * FACE_SCALE, 'halfcrowd-face');  /* 貼圖集裡的人像（每個人隨機一種；kit.pick(陣列, rand)：從陣列隨機挑一個元素） */
            return cir;
        });
        if (SHOW_CENTER) q.circles.forEach(function (c) { kit.svg('circle', { cx: c.x.toFixed(2), cy: c.y.toFixed(2), r: 2.4, 'class': 'halfcrowd-dot' }, svg); });
        var line = kit.svg('line', { x1: W / 2, x2: W / 2, y1: 0, y2: AH, 'class': 'halfcrowd-line' }, svg);

        /* 橫桿與微調鈕 */
        var X = W / 2, locked = false, hint = null;
        var bar = h('div', { 'class': 'halfcrowd-bar' }), knob = h('div', { 'class': 'halfcrowd-knob' });
        bar.appendChild(h('div', { 'class': 'halfcrowd-track' })); bar.appendChild(knob);
        var bL = h('button', { 'class': 'btn btn--line halfcrowd-nudge halfcrowd-nudge--l', text: '◀' }), bR = h('button', { 'class': 'btn btn--line halfcrowd-nudge halfcrowd-nudge--r', text: '▶' });
        var okBtn = h('button', { 'class': 'btn btn--go halfcrowd-ok', text: '計算數量' });
        [bar, bL, bR, okBtn].forEach(function (e) { stage.appendChild(e); });
        var KR = 22;
        /* 重畫畫面：依目前的狀態（選中了什麼、填了什麼、對或錯…）更新每個元素的外觀 */
        function paint() {
            line.setAttribute('x1', X.toFixed(2)); line.setAttribute('x2', X.toFixed(2));  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
            knob.style.left = (KR + (W - 2 * KR) * X / W - KR) + 'px';
        }
        paint();
        function setX(v) { X = kit.clamp(v, 0, W); paint(); }
        var dragging = null;
        function fromPointer(e) { var p = kit.localPt(e, bar); setX((p.x - KR) / (W - 2 * KR) * W); }
        bar.addEventListener('pointerdown', function (e) {  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
            if (locked || dragging != null) return;
            e.preventDefault();                         /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
            try { bar.setPointerCapture(e.pointerId); } catch (err) { }  /* setPointerCapture：手指移出元素範圍後，仍然持續收到這個元素的移動事件（拖曳才不會中斷） */
            dragging = e.pointerId; if (hint) { hint.remove(); hint = null; }
            fromPointer(e);
        });
        bar.addEventListener('pointermove', function (e) { if (dragging === e.pointerId && !locked) fromPointer(e); });
        function endDrag(e) { if (dragging === e.pointerId) dragging = null; }
        bar.addEventListener('pointerup', endDrag); bar.addEventListener('pointercancel', endDrag);
        /* ◀ ▶：按一下移 1 px，按住 0.35 秒後每 0.06 秒再移 1 px */
        function nudge(btn, d) {
            var t1 = null, t2 = null;
            function stop() { if (t1) clearTimeout(t1); if (t2) clearInterval(t2); t1 = t2 = null; }
            btn.addEventListener('pointerdown', function (e) {
                e.preventDefault(); if (locked) return;
                if (hint) { hint.remove(); hint = null; }
                setX(X + d);
                t1 = setTimeout(function () { t2 = setInterval(function () { if (locked) stop(); else setX(X + d); }, 60); }, 350);  /* setTimeout(函式, 毫秒)：過一段時間後執行一次函式 */
            });
            ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { btn.addEventListener(ev, stop); });
            my.onDispose(stop);
        }
        nudge(bL, -1); nudge(bR, 1);
        /* 操作提示（只在第一次進遊戲時）：手指＋箭頭，沿著橫桿往「剛好一半」的位置移動（第一關的正確答案） */
        if (level === 1 && kit.once('halfcrowd.hint')) {  /* kit.once(key)：同一個頁面只有第一次回傳 true（用來讓提示只出現一次） */
            var mid = (q.lo + q.hi) / 2, y = TOP + AH + 8 + 28;
            var x0 = KR + (W - 2 * KR) * X / W, x1 = KR + (W - 2 * KR) * mid / W;
            hint = kit.fingerHint(stage, { mode: 'drag', x: x0, y: y, dx: x1 - x0, dy: 0, delay: 400, text: '請往左右拖曳，讓兩邊一樣多' });
        }
        var msg = h('div', { 'class': 'halfcrowd-msg' });
        stage.appendChild(msg);

        /* 計算數量：左邊依序變綠、右邊依序變紅，上方同步顯示數量 */
        function count() {
            if (locked || api.over) return;
            locked = true;
            if (hint) { hint.remove(); hint = null; }
            Sfx.play('click');                          /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            var left = [], right = [];
            q.circles.forEach(function (c, i) { (c.x < X ? left : right).push({ i: i, x: c.x }); });
            /* 從離豎線最近的開始數：左邊由右往左、右邊由左往右 */
            left.sort(function (a, b) { return b.x - a.x; });
            right.sort(function (a, b) { return a.x - b.x; });
            var gEl = info.querySelector('.halfcrowd-count__g'), bEl = info.querySelector('.halfcrowd-count__b'), exEl = h('span', { 'class': 'halfcrowd-count__r', text: '' });  /* querySelector：用 CSS 選擇器在網頁裡找元素 */
            var plan = countPlan(left.length, right.length), shownP = 0, shownX = 0;
            if (plan.extra) { if (plan.side < 0) info.insertBefore(exEl, gEl); else info.appendChild(exEl); }
            function show(e) {
                var st = planAt(plan, e);
                for (; shownP < st.pairs; shownP++) { els[left[shownP].i].classList.add('halfcrowd-circle--g'); els[right[shownP].i].classList.add('halfcrowd-circle--b'); }  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
                var big = plan.side < 0 ? left : right;
                for (; shownX < st.extra; shownX++) els[big[plan.pairs + shownX].i].classList.add('halfcrowd-circle--r');
                var nl = st.pairs + (plan.side < 0 ? st.extra : 0), nr = st.pairs + (plan.side > 0 ? st.extra : 0);
                gEl.textContent = '綠色 ' + st.pairs; bEl.textContent = st.pairs + ' 藍色';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
                exEl.textContent = st.extra ? (plan.side < 0 ? st.extra + ' 紅色 ＋' : '＋ ' + st.extra + ' 紅色') : '';
                void nl; void nr;
            }
            my.tween(COUNT_STEP_MS, show, kit.linear).then(function () {  /* my.tween(毫秒, 函式)：動畫補間：在這段時間內，函式每一幀會收到 0→1 的進度 */
                show(1);
                var ok = left.length === right.length;
                if (ok) {
                    Sfx.play('ok'); info.classList.add('halfcrowd-count--ok');
                    msg.textContent = '一樣多！左右各 ' + left.length + ' 個'; msg.classList.add('halfcrowd-msg--ok');
                    api.pass({ gain: 1, delay: 1100 }); /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
                } else {
                    Sfx.play('bad'); info.classList.add('halfcrowd-count--bad');
                    msg.textContent = '左邊 ' + left.length + ' 個、右邊 ' + right.length + ' 個，不一樣多（多的 ' + plan.extra + ' 個是紅色）'; msg.classList.add('halfcrowd-msg--bad');
                    /* 標出正確的位置：綠色虛線 */
                    var ok2 = kit.svg('line', { x1: ((q.lo + q.hi) / 2).toFixed(2), x2: ((q.lo + q.hi) / 2).toFixed(2), y1: 0, y2: AH, 'class': 'halfcrowd-line halfcrowd-line--ans' }, svg);
                    api.fail({ delay: 1800, lines: ['這一關有 ' + q.N + ' 個人', '你的線左邊 ' + left.length + ' 個、右邊 ' + right.length + ' 個', '剛好一半的位置在綠色虛線附近（x ' + q.lo.toFixed(4) + '～' + q.hi.toFixed(4) + '）'] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
                }
            });
        }
        kit.onTap(okBtn, count);                        /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */

        /* 驗證用：solve 把線放在剛好一半的位置；wrong 放在一個一定數不一樣的位置 */
        api.solve = function () { setX((q.lo + q.hi) / 2); count(); };
        api.wrong = function () {
            var pos = W * 0.04;
            if (countLeft(q.circles, pos) === q.N / 2) pos = W * 0.96;
            setX(pos); count();
        };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '一半的人',
        rule: '畫面上有一堆人，越後面越多，每個人的中間有一個小黑點（中心）。拖曳下方的橫桿，把豎線移到**「左右兩邊的人數一樣多」**的位置（以中心點為準），旁邊的 ◀ ▶ 可以一次移 1 像素。按「計算數量」後，左邊的人會一個一個亮起綠圈、右邊亮起藍圈，**多出來的人會亮起紅圈**，兩邊一樣多才過關。人群的分布會越來越不平均，**線不會在正中間喔**！',
        mount: mount,
        score: SCORE,
        test: { FACE_SCALE: FACE_SCALE, SHOW_CENTER: SHOW_CENTER, RING_SCALE: RING_SCALE, DECOY: DECOY, decoyOn: decoyOn, channelsOf: channelsOf, packCaps: packCaps, carvePlan: carvePlan, addDecoys: addDecoys, GAP: GAP, nAt: nAt, countPlan: countPlan, planAt: planAt, N_JITTER: N_JITTER, RAMP_LEVELS: RAMP_LEVELS, skewAt: skewAt, gapAt: gapAt, minDist: minDist, countLeft: countLeft, makeLevel: makeLevel, N_RANGE: N_RANGE, R_RANGE: R_RANGE, EDGE: EDGE, OVERLAP: OVERLAP, SKEW_MAX: SKEW_MAX }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
