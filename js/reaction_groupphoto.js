/* ═══════════════════════════════════════════════════════════════════
   reaction_groupphoto.js — 秒反應・大合照（企劃 360）
   樣式：css/games/reaction_groupphoto.css（這款專屬的 class 一律以「groupphoto-」開頭；共用元件在 css/reaction_common.css）
   一群人排排站拍大合照，大家會各自隨機眨眼。**等到「所有人都睜著眼睛」的那一瞬間，按下快門**。
   按下去之後照片洗出來：有人閉眼＝失敗（閉眼的人會被紅圈圈起來）；全員睜眼＝照片掛上牆。限時 TIME_S 秒，沒按也算失敗。
   ───────────────────────────────────────────────────────────────────
   · 眨眼的時間表（makeLevel）：每個人有自己的眨眼節奏——兩次眨眼之間隔多久（gap）、每次閉眼多久（d）都不一樣。
     為了讓「亂按也會過」不要太容易，用「某個瞬間全部人都睜眼的機率 P_OPEN」反推每個人閉眼的比例 c：
         每個人睜眼的機率 q ＝ P_OPEN 的 n 次方根，閉眼比例 c ＝ 1 − q，平均間隔 gap ＝ d × (1/c − 1)。
     時間表是事先排好的（一個人一串 [開始, 結束] 的閉眼區間），畫面和判定都從同一份時間表算（closedAt），不會有「看到睜眼、判成閉眼」。
   · 保證拍得到（V1.51 改版）：舊版是挖出「一大段」全員睜眼（第 1 關平均 2.5 秒，比自然出現的 0.7 秒長很多），
     玩家發現「只要一直等，一定會等到大家都不閉眼」——玩家意見說這是 BUG，所以取消。現在改成：
       ① 把 WIN_FROM 秒到「限時 − WIN_TAIL 秒」平均切成 N_WIN 段，每段挖一個「短短的」全員睜眼空檔（OPEN_WIN ～ OPEN_WIN × WIN_MAX_K 秒），
          空檔前後各補一次別人的眨眼（bound），空檔就剛好那麼長，不會往兩邊延伸；
       ② 再把**任何**比 OPEN_WIN × WIN_MAX_K 還長的全員睜眼（包括自然出現的、開頭和最後的）都插一次眨眼切斷（capWindows）——
          整局都不會有「大家一直睜著眼不閉」的一大段；
       ③ 最後用 checkLevel 驗證（拍得到的空檔夠多、沒有太長的空檔），不合格就重出。
   · 「低頭看手機」的人（PHONE）：眼睛畫成往下看的弧線（看起來像閉眼），手上拿著手機——**不算閉眼**。
     V1.51（玩家意見）：他們會**偶爾放下手機抬頭**（PHONE_UP 秒），抬頭時就跟一般人一樣會眨眼；過一陣子（PHONE_DOWN 秒）又低頭看手機。
     眨眼只排在抬頭的時段裡（前後各留 PHONE_MARGIN 秒），所以低頭的時候一定不算閉眼。
   · 難度（線性，到 RAMP_LEVELS 關到頂）：人數 3 → 16、拍得到的空檔 1.0 → 0.66 秒（而且 4 段 → 2 段）、
     隨機一個瞬間全員睜眼的機率 0.50 → 0.10、低頭看手機的人 0 → 3 個。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'groupphoto'：選單、成績、存檔都靠它；樣式在 css/games/reaction_groupphoto.css，裡面的 class 名稱一律以 groupphoto- 開頭。 */
    'use strict';

    var ID = 'groupphoto';                              /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var PEOPLE = [3, 16];                       /* 人數：第 1 關 → 到頂（四捨五入） */
    var OPEN_WIN = [1.0, 0.66];                 /* 每一段「拍得到」的全員睜眼空檔最短幾秒：第 1 關 → 到頂（V1.51 取消一大段保證空檔，起點 2.0 → 1.0；到頂 0.66 是手調值，保留） */
    var WIN_MAX_K = 1.25;                       /* 全員睜眼最長只能是 OPEN_WIN × 這個數（整局任何時候都不會更長，玩家沒辦法「一直等」） */
    var N_WIN = [4, 2];                         /* 每關一定有幾段拍得到的空檔：第 1 關 → 到頂（四捨五入；平均分散在整個限時裡） */
    var P_OPEN = [0.50, 0.10];                  /* 隨機一個瞬間所有人都睜眼的機率（目標值）：第 1 關 → 到頂 */
    var PHONE = [0, 3];                         /* 低頭看手機的人數：第 1 關 → 到頂（四捨五入） */
    var PHONE_DOWN = [2.5, 4.5];                /* 低頭看手機一次持續幾秒（範圍）；一開始大家都在低頭，第一次抬頭在 1 秒～PHONE_DOWN[1] 秒之間 */
    var PHONE_UP = [1.5, 3.0];                  /* 放下手機抬頭一次持續幾秒（範圍）：這段時間跟一般人一樣會眨眼 */
    var PHONE_MARGIN = [0.3, 0.2];              /* 抬頭後至少過幾秒才眨眼、低頭前幾秒內不眨眼（眨眼不會剛好卡在抬頭／低頭的那一下） */
    var TIME_S = 15;                            /* 每關限時（秒） */
    var BLINK_D = [0.16, 0.29];                 /* 每個人每次閉眼多久（秒）的範圍（每人一個固定值） */
    var GAP_JITTER = [0.7, 1.3];                /* 每次間隔的隨機倍率（再乘上這個人的平均間隔） */
    var WIN_FROM = 2.0;                         /* 拍得到的空檔最早從第幾秒開始（讓玩家先看一下） */
    var WIN_TAIL = 1.5;                         /* 最後一段拍得到的空檔結束後，至少還留幾秒（不會全部擠在時間快到的時候） */
    var WIN_PAD = 0.35;                         /* 挖空檔時，跟每一段的邊界至少留幾秒（放得下前後補的眨眼，各段互不干擾） */
    var SEP = 0.15;                             /* 補一次眨眼時，跟這個人自己的其他眨眼至少隔幾秒（看起來才像兩次眨眼，不是黏在一起的長閉眼） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var HAIR = ['hair0', 'hair1', 'hair2', 'hair3'];       /* 髮色的 class（顏色在 theme.css） */
    var SKIN = ['skin0', 'skin1', 'skin2'];         /* 膚色的 CSS class 名稱（三種） */
    var SHIRT = ['shirt0', 'shirt1', 'shirt2', 'shirt3', 'shirt4'];  /* 上衣顏色的 CSS class 名稱（五種） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function peopleFor(level) { return Math.round(ramp(level, PEOPLE)); }  /* Math.round：四捨五入成整數 */
    function winFor(level) { return Math.round(ramp(level, OPEN_WIN) * 1000) / 1000; }
    function pOpenFor(level) { return Math.round(ramp(level, P_OPEN) * 1000) / 1000; }
    function phoneFor(level) { return Math.round(ramp(level, PHONE)); }
    function nWinFor(level) { return Math.round(ramp(level, N_WIN)); }
    function timeMs() { return TIME_S * 1000; }
    /* 要讓「n 個人同時睜眼」的機率是 pOpen，每個人閉眼的比例 c */
    function closedFraction(n, pOpen) { return 1 - Math.pow(pOpen, 1 / Math.max(1, n)); }
    /* 一個人的閉眼區間表（秒）：從一個隨機的起點開始，一段睜眼（gap）、一段閉眼（d）…直到超過 T 秒 */
    function makeBlinks(d, gapMean, T, rand) {
        var out = [], t = kit.randFloat(0, gapMean, rand);  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
        while (t < T) {
            out.push([t, t + d]);
            t += d + gapMean * kit.randFloat(GAP_JITTER[0], GAP_JITTER[1], rand);
        }
        return out;
    }
    /* 時間表：把 [a, b] 之間所有「有碰到」的眨眼都拿掉，保證這段時間大家都睜眼 */
    function clearWindow(blinks, a, b) { return blinks.filter(function (iv) { return iv[1] <= a || iv[0] >= b; }); }  /* filter：留下符合條件的元素，回傳新陣列 */
    /* 低頭看手機的人「抬頭」的時段表（秒）：[開始, 結束] 一串。一開始在低頭，第一次抬頭在 1 秒～PHONE_DOWN[1] 秒之間，之後「抬頭一陣子、低頭一陣子」輪流 */
    function makeUps(T, rand) {
        var out = [], t = kit.randFloat(1.0, PHONE_DOWN[1], rand);
        while (t < T) {
            var u = kit.randFloat(PHONE_UP[0], PHONE_UP[1], rand);
            out.push([t, t + u]);
            t += u + kit.randFloat(PHONE_DOWN[0], PHONE_DOWN[1], rand);
        }
        return out;
    }
    /* 第 t 秒這個人是不是抬著頭（一般人永遠是；低頭看手機的人只有在抬頭時段裡才是） */
    function isUp(p, t) {
        if (!p.ups) return true;
        for (var k = 0; k < p.ups.length; k++) if (t >= p.ups[k][0] && t < p.ups[k][1]) return true;
        return false;
    }
    /* 這個人在 [s, e] 閉一次眼，會不會跟他自己的其他眨眼太近（相隔不到 sep 秒） */
    function nearOwn(p, s, e, sep) { return p.blinks.some(function (iv) { return iv[1] + sep > s && iv[0] < e + sep; }); }  /* some：只要有一個元素符合就回傳 true */
    function addBlink(p, s, e) { p.blinks.push([s, e]); p.blinks.sort(function (a, b) { return a[0] - b[0]; }); }  /* sort：排序；比較函式回傳負數代表 a 排前面 */
    /* 在 at 這個時間點「貼著」補一次眨眼：side＝'left' 補在 [at − d, at]（空檔的左邊界），'right' 補在 [at, at + d]（右邊界）。
       優先挑「自己附近沒有眨眼」的一般人（不挑低頭看手機的人）；都有的話，挑一個人把他擋到的眨眼換掉 */
    function bound(q, normal, at, side, rand) {
        var order = kit.shuffle(normal, rand);          /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
        for (var pass = 0; pass < 2; pass++) {
            for (var k = 0; k < order.length; k++) {
                var p = q.people[order[k]], s = side === 'left' ? at - p.d : at, e = side === 'left' ? at : at + p.d;   /* 邊界直接用 at（不要用 s + d 算回來，小數誤差會讓空檔第一瞬間就有人閉眼） */
                if (pass === 0 && nearOwn(p, s, e, SEP)) continue;
                if (pass === 1) p.blinks = p.blinks.filter(function (iv) { return !(iv[1] + SEP > s && iv[0] < e + SEP); });
                addBlink(p, s, e);
                return;
            }
        }
    }
    /* 步驟①：挖 nWin 段「拍得到」的空檔。WIN_FROM～(限時 − WIN_TAIL) 平均切成 nWin 段，每段裡隨機挑一個長度 win～winMax 的空檔，
       把所有人在空檔裡的眨眼拿掉，再在空檔前後貼著補一次眨眼（空檔就剛好這麼長）。回傳挖出來的空檔 [{ start, end }] */
    function carveWindows(q, normal, rand) {
        var lo = WIN_FROM, hi = q.timeS - WIN_TAIL, seg = (hi - lo) / q.nWin, out = [];
        for (var k = 0; k < q.nWin; k++) {
            var len = kit.randFloat(q.win, q.winMax, rand), a0 = lo + k * seg + WIN_PAD, a1 = lo + (k + 1) * seg - len - WIN_PAD;
            var a = kit.randFloat(a0, Math.max(a0, a1), rand), b = a + len;
            q.people.forEach(function (p) { p.blinks = clearWindow(p.blinks, a, b); });  /* forEach：對陣列的每個元素各做一次 */
            bound(q, normal, a, 'left', rand); bound(q, normal, b, 'right', rand);
            out.push({ start: a, end: b });
        }
        return out;
    }
    /* 步驟②：把任何比 winMax 還長的全員睜眼切斷——在裡面插一次某個一般人的眨眼（左半段切成比 win 短，不會多出拍得到的空檔），重複到沒有太長的為止 */
    function capWindows(q, normal, rand) {
        for (var guard = 0; guard < 500; guard++) {
            var ws = openWindows(q), long = null;
            for (var k = 0; k < ws.length; k++) if (ws[k].end - ws[k].start > q.winMax + 1e-9) { long = ws[k]; break; }
            if (!long) return true;
            var order = kit.shuffle(normal, rand), L = long.end - long.start, pick = null, s = 0;
            for (var pass = 0; pass < 2 && !pick; pass++) {
                for (var j = 0; j < order.length; j++) {
                    var p = q.people[order[j]];
                    s = long.start + kit.randFloat(0.3, Math.max(0.3, Math.min(q.win * 0.8, L - p.d - 0.05)), rand);
                    if (pass === 0 && nearOwn(p, s, s + p.d, SEP)) continue;
                    pick = p; break;
                }
            }
            addBlink(pick, s, s + pick.d);
        }
        return false;
    }
    /* 步驟③：驗證——拍得到的空檔（長度 ≥ win、在 WIN_FROM～限時 − WIN_TAIL 之間）至少 nWin 段，而且整局沒有比 winMax 長的全員睜眼 */
    function playable(q) {
        return openWindows(q).filter(function (w) { return w.end - w.start >= q.win - 1e-6 && w.start >= WIN_FROM - 1e-6 && w.end <= q.timeS - WIN_TAIL + 1e-6; });
    }
    function checkLevel(q) {
        return playable(q).length >= q.nWin && openWindows(q).every(function (w) { return w.end - w.start <= q.winMax + 1e-6; });  /* every：每個元素都符合才回傳 true */
    }
    /* 出一關：{
         level, n, phone（低頭看手機的人編號）, people（每人 { d, gapMean, blinks, ups（低頭看手機的人才有：抬頭時段）, hair, skin, shirt }）,
         win（拍得到的空檔最短幾秒）, winMax（全員睜眼最長幾秒）, nWin（幾段）, wins（挖出來的空檔）, timeS, pOpen } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var q = null;
        for (var tries = 0; tries < 30; tries++) {
            q = makeOnce(level, rand);
            if (checkLevel(q)) break;                   /* 幾乎都是第一次就合格；不合格就整關重出 */
        }
        return q;
    }
    function makeOnce(level, rand) {
        var n = peopleFor(level), np = Math.min(phoneFor(level), n - 1), pOpen = pOpenFor(level), win = winFor(level), T = TIME_S;
        var order = kit.shuffle(Array.apply(null, Array(n)).map(function (x, i) { return i; }), rand), phone = order.slice(0, np).sort(function (a, b) { return a - b; });
        /* 低頭看手機的人只有抬頭時才會眨眼（平均約 4 成的時間），算閉眼比例時當成「0.4 個人」 */
        var upShare = (PHONE_UP[0] + PHONE_UP[1]) / (PHONE_UP[0] + PHONE_UP[1] + PHONE_DOWN[0] + PHONE_DOWN[1]);
        var c = closedFraction((n - np) + np * upShare, pOpen), people = [], normal = [];
        for (var i = 0; i < n; i++) {
            var d = kit.randFloat(BLINK_D[0], BLINK_D[1], rand), gapMean = d * (1 / c - 1), isPhone = phone.indexOf(i) >= 0;  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1 */
            var ups = isPhone ? makeUps(T + 1, rand) : null, blinks = makeBlinks(d, gapMean, T + 1, rand);
            /* 低頭看手機的人：只留下「整個落在抬頭時段裡（前後再留一點）」的眨眼 */
            if (ups) blinks = blinks.filter(function (iv) { return ups.some(function (u) { return iv[0] >= u[0] + PHONE_MARGIN[0] && iv[1] <= u[1] - PHONE_MARGIN[1]; }); });
            else normal.push(i);
            people.push({ d: d, gapMean: gapMean, blinks: blinks, ups: ups, hair: kit.pick(HAIR, rand), skin: kit.pick(SKIN, rand), shirt: kit.pick(SHIRT, rand) });  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        }
        var q = { level: level, n: n, phone: phone, people: people, win: win, winMax: Math.round(win * WIN_MAX_K * 1000) / 1000, nWin: nWinFor(level), wins: [], timeS: T, pOpen: pOpen };
        q.wins = carveWindows(q, normal, rand);
        capWindows(q, normal, rand);
        return q;
    }
    /* 第 t 秒時閉著眼的人（編號；低頭看手機的人不算） */
    function closedAt(q, t) {
        var out = [];
        q.people.forEach(function (p, i) { for (var k = 0; k < p.blinks.length; k++) { if (t >= p.blinks[k][0] && t < p.blinks[k][1]) { out.push(i); break; } } });  /* forEach：對陣列的每個元素各做一次 */
        return out;
    }
    /* 全員睜眼的窗口（在 [0, T] 之內）：[{ start, end }]，把所有人的閉眼區間合併後取空隙 */
    function openWindows(q, T) {
        T = T == null ? q.timeS : T;
        var ivs = []; q.people.forEach(function (p) { p.blinks.forEach(function (iv) { if (iv[0] < T) ivs.push([iv[0], Math.min(iv[1], T)]); }); });
        ivs.sort(function (a, b) { return a[0] - b[0]; });  /* sort：排序；比較函式回傳負數代表 a 排前面、回傳正數代表 b 排前面 */
        var out = [], cur = 0;
        ivs.forEach(function (iv) { if (iv[0] > cur) out.push({ start: cur, end: iv[0] }); cur = Math.max(cur, iv[1]); });
        if (cur < T) out.push({ start: cur, end: T });
        return out;
    }
    /* 排版：n 個人排成幾排幾列、每個人的位置與臉的大小（相片區 pw×ph） */
    function layout(n, pw, ph) {
        var cols = n <= 3 ? n : (n <= 8 ? Math.ceil(n / 2) : Math.ceil(n / 3)), rows = Math.ceil(n / cols), cw = pw / cols, chh = ph / rows;  /* Math.ceil：無條件進位成整數 */
        var fw = Math.floor(Math.min(cw * 0.92, chh * 0.92 * 100 / 120)), fh = Math.round(fw * 1.2), pos = [];  /* Math.floor：無條件捨去成整數 */
        for (var i = 0; i < n; i++) {
            var r = Math.floor(i / cols), inRow = Math.min(cols, n - r * cols), c = i - r * cols, rowW = inRow * cw, x0 = (pw - rowW) / 2;        /* 最後一排人少，置中 */
            pos.push({ x: Math.round(x0 + c * cw + (cw - fw) / 2), y: Math.round(r * chh + (chh - fh) / 2), w: fw, h: fh });
        }
        return { cols: cols, rows: rows, faces: pos, fw: fw, fh: fh };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 16) return '最佳攝影師！';
        if (n >= 10) return '快門神手！';
        if (n >= 5) return '不錯喔！';
        if (n >= 2) return '再接再厲！';
        return '要等大家都睜眼！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'groupphoto-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 一個人（SVG，viewBox 100×120）：肩膀、頭、頭髮、眼睛（睜眼／閉眼兩套，用 class 切換）、嘴；低頭看手機的人手上有手機 */
    function faceSvg(p, phone) {
        var svg = kit.svg('svg', { 'class': 'groupphoto-face', viewBox: '0 0 100 120' });  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        kit.svg('path', { 'class': 'groupphoto-shirt groupphoto-' + p.shirt, d: 'M6,120 Q8,86 50,82 Q92,86 94,120 Z' }, svg);
        kit.svg('rect', { 'class': 'groupphoto-neck groupphoto-' + p.skin, x: 41, y: 70, width: 18, height: 16, rx: 6 }, svg);
        kit.svg('circle', { 'class': 'groupphoto-head groupphoto-' + p.skin, cx: 50, cy: 46, r: 30 }, svg);
        kit.svg('path', { 'class': 'groupphoto-hair groupphoto-' + p.hair, d: 'M18,48 Q16,12 50,12 Q84,12 82,48 Q74,30 50,28 Q26,30 18,48 Z' }, svg);
        [34, 66].forEach(function (ex) {
            var g = kit.svg('g', { 'class': 'groupphoto-eye' }, svg);
            kit.svg('ellipse', { 'class': 'groupphoto-eye-open groupphoto-eye-w', cx: ex, cy: 48, rx: 8, ry: 9 }, g);
            kit.svg('circle', { 'class': 'groupphoto-eye-open groupphoto-pupil', cx: ex, cy: 49, r: 4 }, g);
            kit.svg('path', { 'class': 'groupphoto-lid', d: 'M' + (ex - 9) + ',48 Q' + ex + ',58 ' + (ex + 9) + ',48' }, g);
        });
        kit.svg('path', { 'class': 'groupphoto-mouth', d: 'M38,62 Q50,72 62,62' }, svg);
        if (phone) {                                    /* 手機包在一個群組裡：抬頭時（沒有 --phone）整支往下移出畫面並淡掉，見 css 的 .groupphoto-phonegrp */
            var pg = kit.svg('g', { 'class': 'groupphoto-phonegrp' }, svg);
            kit.svg('rect', { 'class': 'groupphoto-phone', x: 36, y: 90, width: 28, height: 28, rx: 5 }, pg);
            kit.svg('rect', { 'class': 'groupphoto-phone-screen', x: 40, y: 94, width: 20, height: 20, rx: 3 }, pg);
        }
        return svg;
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makeLevel(level, api.rand);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        var wins = openWindows(q);
        console.log('[大合照] 第 ' + level + ' 關：' + q.n + ' 人（低頭看手機 ' + q.phone.length + '）；拍得到的空檔 ' + q.nWin + ' 段，每段 ' + q.win + '～' + q.winMax + ' 秒：' + q.wins.map(function (w) { return w.start.toFixed(2) + '-' + w.end.toFixed(2); }).join('、') + '；全部 ≥0.2 秒的空檔 ' + wins.filter(function (w) { return w.end - w.start >= 0.2; }).map(function (w) { return w.start.toFixed(1) + '-' + w.end.toFixed(1); }).join('、'));  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var field = h('div', { 'class': 'groupphoto-field' });
        stage.appendChild(field);                       /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var tip = h('div', { 'class': 'qz-note groupphoto-tip', text: level === 1 ? '等大家都睜眼的瞬間，按快門！' : '全員睜眼的瞬間按快門' });
        field.appendChild(tip);
        /* 相片區（取景框）：左右各留 12px；高度在「上方提示」和「下方快門鈕」之間 */
        var pw = W - 24, ph = Math.min(400, H - 56 - 150), photo = h('div', { 'class': 'groupphoto-photo' });
        photo.style.cssText = 'left:12px;top:52px;width:' + pw + 'px;height:' + ph + 'px;';
        field.appendChild(photo);
        var L = layout(q.n, pw, ph), faces = q.people.map(function (p, i) {  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            var f = L.faces[i], isPhone = q.phone.indexOf(i) >= 0, el = h('div', { 'class': 'groupphoto-person' + (isPhone ? ' groupphoto-person--phone' : '') });
            el.style.cssText = 'left:' + f.x + 'px;top:' + f.y + 'px;width:' + f.w + 'px;height:' + f.h + 'px;';
            var svg = faceSvg(p, isPhone); svg.setAttribute('width', f.w); svg.setAttribute('height', f.h); el.appendChild(svg); photo.appendChild(el);  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
            return el;
        });
        ['tl', 'tr', 'bl', 'br'].forEach(function (c) { photo.appendChild(h('div', { 'class': 'groupphoto-corner groupphoto-corner--' + c })); });
        var flashEl = h('div', { 'class': 'groupphoto-flash' }); photo.appendChild(flashEl);
        var info = h('div', { 'class': 'qz-note groupphoto-info', text: '' }); info.style.top = (52 + ph + 6) + 'px'; field.appendChild(info);
        var btn = kit.btnGrid(field, [{ text: '按快門', kind: 'primary', cls: 'groupphoto-shutter', onTap: function () { press(); } }], { cols: 1, h: 96, bottom: 12 });  /* kit.btnGrid：共用的按鈕列（一排大按鈕） */
        if (level === 1 && kit.once('groupphoto.hint')) kit.hintOn(stage, btn.btns[0], { mode: 'tap', delay: 1400, text: '全員睜眼時按' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */

        var phase = 'run', shown = {}, down = {}, t0 = performance.now(), tNow = 0;  /* performance.now()：高精度的時間（毫秒），計時用 */
        q.phone.forEach(function (i) { down[i] = true; });   /* 低頭看手機的人一開始都在低頭（建臉的時候已經加了 --phone） */
        /* 重畫畫面：誰閉眼（--closed）、低頭看手機的人現在有沒有抬頭（低頭＝--phone） */
        function paint(t) {
            var closed = closedAt(q, t), set = {}; closed.forEach(function (i) { set[i] = 1; });
            faces.forEach(function (el, i) { var on = !!set[i]; if (on !== !!shown[i]) { el.classList.toggle('groupphoto-person--closed', on); shown[i] = on; } });  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            q.phone.forEach(function (i) { var dn = !isUp(q.people[i], t); if (dn !== !!down[i]) { faces[i].classList.toggle('groupphoto-person--phone', dn); down[i] = dn; } });
            return closed;
        }
        paint(0);
        api.my.loop(function (now) {                    /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
            if (phase !== 'run' || !stage.isConnected) return false;
            tNow = (now - t0) / 1000; paint(tNow);
        });
        api.timer(timeMs(), function () { timeout(); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */

        /* 按快門：拿「按下去的那一瞬間畫面上的狀態」來判定 */
        function press() {
            if (phase !== 'run' || api.over) return;
            phase = 'shot'; api.stopTimer();
            var t = (performance.now() - t0) / 1000, closed = paint(t);
            flashEl.classList.add('groupphoto-flash--go'); Sfx.play('click');  /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            if (!closed.length) {
                tip.textContent = '洗出來了…';              /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
                api.after(500, function () { photo.classList.add('groupphoto-photo--wall'); info.textContent = '全員睜眼！這張照片掛上牆壁'; info.classList.add('groupphoto-info--ok'); });  /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
                kit.flash(stage, true, api.my);         /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
                api.pass({ delay: 2300 });              /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
                return;
            }
            tip.textContent = '洗出來了…';
            api.after(500, function () {
                /* 紅圈：圈住閉眼的人的頭（頭的圓心在臉的 (50, 46)／(100, 120) 處，半徑 30） */
                closed.forEach(function (i) {
                    var f = L.faces[i], d = Math.round(f.w * 0.78), ring = h('div', { 'class': 'groupphoto-ring' });
                    ring.style.cssText = 'left:' + Math.round(f.x + f.w / 2 - d / 2) + 'px;top:' + Math.round(f.y + f.h * 46 / 120 - d / 2) + 'px;width:' + d + 'px;height:' + d + 'px;';
                    photo.appendChild(ring);
                });
                info.textContent = '有 ' + closed.length + ' 個人閉眼了（紅圈）'; info.classList.add('groupphoto-info--bad');
            });
            kit.flash(stage, false, api.my);
            api.fail({ delay: 3800, lines: ['按下快門的時候，有 ' + closed.length + ' 個人閉著眼睛', '（低頭看手機的不算閉眼）'] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 時間到：算失敗（api.fail），通常會把正確答案亮出來 */
        function timeout() {
            if (phase !== 'run' || api.over) return;
            phase = 'shot'; info.textContent = '時間到！沒有按快門'; info.classList.add('groupphoto-info--bad');
            kit.flash(stage, false, api.my);
            api.fail({ delay: 3000, lines: ['時間到！沒有按快門', '全員睜眼的瞬間要把握住'] });
        }
        /* 驗證用：現在全員睜眼才按（不然等下一次呼叫）／現在有人閉眼才按 */
        api.solve = function () { if (phase === 'run' && !closedAt(q, (performance.now() - t0) / 1000).length) press(); };
        api.wrong = function () { if (phase === 'run' && closedAt(q, (performance.now() - t0) / 1000).length) press(); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '大合照',
        rule: '一群人排排站拍大合照，大家會各自隨機眨眼。**等到所有人都睜著眼睛的那一瞬間**，按下快門！照片洗出來，只要有人閉眼就失敗（閉眼的人會被紅圈圈起來）。注意：**低頭看手機的人**眼睛看起來像閉著，但**不算閉眼**；他們偶爾會**放下手機抬頭**，這時就跟大家一樣會眨眼。限時 ' + TIME_S + ' 秒，沒按也算失敗。越後面，人越多、全員睜眼的時間越短！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            peopleFor: peopleFor, winFor: winFor, pOpenFor: pOpenFor, phoneFor: phoneFor, nWinFor: nWinFor, timeMs: timeMs, closedFraction: closedFraction, makeBlinks: makeBlinks, clearWindow: clearWindow, makeLevel: makeLevel, closedAt: closedAt, openWindows: openWindows, layout: layout, rating: rating,
            makeUps: makeUps, isUp: isUp, playable: playable, checkLevel: checkLevel,
            RAMP_LEVELS: RAMP_LEVELS, PEOPLE: PEOPLE, OPEN_WIN: OPEN_WIN, WIN_MAX_K: WIN_MAX_K, N_WIN: N_WIN, P_OPEN: P_OPEN, PHONE: PHONE, PHONE_DOWN: PHONE_DOWN, PHONE_UP: PHONE_UP, PHONE_MARGIN: PHONE_MARGIN,
            TIME_S: TIME_S, BLINK_D: BLINK_D, WIN_FROM: WIN_FROM, WIN_TAIL: WIN_TAIL, SEP: SEP, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
