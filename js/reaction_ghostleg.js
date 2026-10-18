/* ═══════════════════════════════════════════════════════════════════
   reaction_ghostleg.js — 秒反應・鬼腳圖
   台灣童玩「阿彌陀佛」鬼腳圖：5 條直線、一堆橫線；上方有一個「起點」、下方有一個「終點」（都是綠底黑字），
   但照著現有的橫線走，從起點走不到終點。玩家要「畫上一條橫線」，讓起點接到終點。關卡制，成績＝通過關數。
   ───────────────────────────────────────────────────────────────────
   · V1.28（玩家意見）整個改玩法（以前是手指沿著線描一遍）：
       - 題目一開始就標出起點與終點（綠底黑字），現有的線走不到終點；
       - 玩家用手指先按住某一條直線，再往左或往右拖到相鄰的直線，就畫上一條很粗的藍色橫線
         （從按下的位置畫到隔壁那條直線；只有一次機會；拖到一半放開＝取消，可以重畫）；
       - 畫好之後開始「評審動畫」：從起點開始畫出一條綠色粗虛線，經過每個轉折點，看看最後能不能抵達終點，抵達就過關；
       - 操作提示改成鉛筆圖示畫出一條藍色水平橫線（取消手指圖示）。
   · 5 條直線 × ROWS 層；橫線連接相鄰兩條直線，同一層的橫線不可相鄰（不然路徑不明確）；
     現有橫線總數 RUNGS 4→24（線性）。玩家畫的橫線會貼齊到最近的一層（snapRow），那一層的那個位置要是空的（canPlace）。
   · V1.32（玩家意見：難度太低，橫線密集堆在同一欄之間；正確路線應該經過甲乙丙丁戊五條直線、橫線平均分布；
     難度在於「不容易看出轉折點」；正確橫線的上下要留出空間，避免手指誤畫）出題改成「先定路線、再撒橫線」：
       1. 先隨機決定一條「正確路線」：從起點走過 VISIT（3→5）條不同的直線、共轉 TURNS（3→7）次彎（5＝甲乙丙丁戊全部都經過），
          每個轉彎各占一層，平均分散在整張圖上；其中一個轉彎就是玩家要畫的那一條，其他的轉彎先畫好。
       2. 其餘的橫線（湊滿 RUNGS 條）平均撒在四個「縫」（相鄰兩條直線之間）：各縫的橫線數最多差 1 條；挑橫線最少的那一層、離同一條直線上其他橫線最遠的位置放，
          而且不碰到正確路線走過的直線（不會擋住路線，只是用來混淆，讓人不容易看出轉折點）。
       3. 玩家要畫的位置，上下 SOL_GAP 層以內、跟它相接的兩條直線上都不放其他橫線（留出空間，手指不容易畫錯）。
       4. 驗證（窮舉）：現有的橫線走不到終點；畫對的位置數在 1～MAX_SOL 之間（第 1 關可以多一點、越後面越少）；
          每一種畫對的位置，畫上去之後的路線都經過 VISIT 條以上的直線、而且上下都留得出空間。
          RUNGS 太大（ROWS 太少）放不下時，會自動少放幾條（出題記錄會顯示實際放了幾條）。
   · V1.33（玩家意見：還是太容易，答案幾乎都在「起點那條直線」或「終點那條直線」上——從起點往下看、或從終點往上看就找到了）：
     量過舊版：80～94% 的答案貼著起點或終點的直線，到頂的關卡有 47% 的答案在起點的路線「還沒轉過彎」的地方。改成：
       1. 答案不碰起點、終點的直線（AVOID_ENDS）：玩家要畫的橫線，兩端都不是起點那條、也不是終點那條直線。
       2. 答案藏在路線的中段（HIDE_BEFORE、HIDE_AFTER）：從起點走到答案之前，路線至少已經轉了 HIDE_BEFORE 次彎；
          走過答案之後，還要再轉 HIDE_AFTER 次彎才到終點（第 1 關 1、1 → 到頂 2、3；起點在丙又要碰到甲與戊時，前面藏 3 個在 16 層裡放不下）。所以從起點往下推、或從終點往上推，
          都要先追過好幾個轉彎，才看得到關鍵位置。
       3. （第一輪做法，第二輪已改掉）第 SWEEP_FROM 關起，路線先一路走到一邊的邊緣、再一路走到另一邊的邊緣。
       4. 上面的條件「每一種畫對的位置」都要符合（不是只有出題時設計的那一個），不會留下一個容易找的答案。
       5. 路線變長、轉彎變多，層數 ROWS 從 12 改成 16（第二輪：之字形路線＋打斷「＝」要多空幾層；畫面高度不變，每層間距約 37 → 28px）。
       6. MAX_SOL 改成算「答案區段」（answerGroups）：同一對直線之間、上下相連的幾層算同一個答案。V1.32 答案上下留白之後，
          答案的上一層、下一層一定也畫得對，舊的算法每題至少 3 個「位置」，到頂的上限 2 永遠達不到、每題都在放寬。
       7. 起點先平均地隨機決定，再出題（以前是出題成功的才留下，起點會偏向甲、戊）。這個起點出不了題時，先用同樣嚴格的條件換別的起點，
          最後才放寬條件（橫線很少的第 1 關，「丙」當起點幾乎出不了題）。
     另外檢討過「改成刪掉一條橫線」：刪的話，答案一定是起點路線上的某一個轉彎，玩家只要沿著起點的路線、每個轉彎試一次「這裡不轉會到哪」，
     量過：刪一條的候選（起點路線上的轉彎）平均 3～8 個，畫一條的候選（能畫的空位）平均 10～33 個，而且刪的候選全在你已經追過的那條路上，
     一個一個試就好，反而更容易，所以維持「畫一條橫線」。
   · V1.33 第二輪（玩家意見：改完還是很容易，正確路線就像「工整的樓梯」，有橫線就穿過去、走到邊緣再回頭；其他橫線都沒有干擾作用）：
     原因：第一輪的路線是「一路往同一個方向、每一層一步、間距平均」，而其他橫線為了不擋路，被放在離路線最遠的地方，
     所以正確路線一眼就是一條斜斜的樓梯，旁邊的橫線跟它完全沒有交集。改成：
       1. 之字形路線（makeZigzag）：同一個方向最多連走 STAIR 步（3 步；第一輪的樓梯是 4 步），方向至少回頭 REVERSE 次（第 1 關 1 → 到頂 3），
          看起來不會是一條斜線；第 SWEEP_FROM（12）關起仍然要碰到甲與戊兩邊（但是左右來回走過去，不是一路走過去）。
       2. 轉彎的層數不規則（randomRows）：先保留必要的間隔（一般 1 層、路線回頭 2 層、答案前後 SOL_GAP 層），剩下的層隨機分配，不會等距。
       3. 其他橫線貼著路線旁邊放（DECOY_NEAR）：優先放在「路線所在直線的隔壁那一縫」（碰到路線隔壁的直線、但不碰路線本身），
          所以路線兩旁一直有橫線，別的路線跟正確路線交錯在一起，眼睛很容易跳錯線。
       4. 答案所在的那一段，上下相連最多 GROUP_MAX 層（太長＝很好畫中）。
       5. 整張圖不准有「＝」（cancelPairs）：同一縫的上下兩條橫線，如果兩條之間、左右兩旁的縫都沒有橫線，走過去又走回來＝互相抵消，
          會玩的人一眼就把它們忽略。所以撒其他橫線時，只要圖上還有「＝」（路線回頭、或疊在同一縫），下一條就一定放在兩條之間、旁邊的縫，
          把「＝」變成交錯的「Z」，非追不可（必要時可以比 RUNGS 多放 BREAK_EXTRA 條；放下去之後「＝」的總數不能變多，變少越多越優先）；
          沒有「＝」之後，其他橫線都不能造出新的「＝」。最後玩家看到的題目一定沒有「＝」，而且每一種答案畫上去，也不會跟原本的橫線變成「＝」
          （量過：不管這一條的話，86% 的答案會跟正上方或正下方的橫線變成「＝」，玩家很快就會學到「畫成＝的那條就是答案」）。
          路線也不會在邊緣直線來回（甲→乙→甲 這種抵消沒辦法打斷）。
     第一輪的其他規則（答案不碰起點終點的直線、前後各藏幾個轉彎、每一種畫對的位置都要符合、答案算區段）都保留。
   · V1.33.2（答案位置太好猜：答案幾乎都在正確路線的中段）：量過（你的參數，每關 40 題共 1200 題，「能當答案的轉彎」＝第 2 個～倒數第 2 個，平分成前／中／後三段，看答案落在哪一段），
     舊版全部 2／92／6%（第 8～15 關 0／100／0%）。原因：HIDE_BEFORE／HIDE_AFTER 是「前後各至少」，16 層的圖上答案只能落在正中間那一兩個轉彎。改成：
       1. HIDE_BEFORE＋HIDE_AFTER 改成「前後合計」（前＋後＝正確路線轉彎數 − 1，所以只是要求路線夠長，見 hideAt、fitPlan）。
       2. 答案是正確路線上的第幾個轉彎，每一題抽一個位置 u（0～1，只抽一次，失敗重蓋也不換，不然「好蓋的位置」會被偏好），u 對應到的轉彎不能當答案
          （碰到起點或終點的直線）時，改挑離它最近、能當答案的轉彎（core 的 answerIndex）。
       3. 出題先要求「答案落在 u 那一段（前／中／後）」，在原本就有的「放寬一級」範圍內一級一級試（makeLevel 的 pos）；還是做不到才不管位置。
          結果：全部 32／44／24%（第 1～7 關 30／38／33、8～15 關 21／58／21、16～22 關 37／33／30、23～30 關 41／45／14）。
          還是有限制：有些起點在 STAIR／REVERSE／碰兩邊的限制下，合規的路線只有寥寥幾條（量過第 10、20、30 關放寬一級之後，每個起點 1～9 條），答案位置被路線形狀限制住，「後段」比較少。
          想更平均有兩個辦法：POS_EXTRA（路線形狀再多放寬：1 級 → 全部 37／34／29%、2 級 → 33／33／34%，但分別有約 23%、27% 的題目超過「放寬一級」，同方向會連走 STAIR＋2 步，比較像樓梯），
          或直接改 STAIR、REVERSE（到頂 STAIR 3→4、REVERSE 5→3：全部 36／34／30%，各段 34～39／33～37／28～33%）。
       4. 起點一題只抽一次、不再因為做不出來而換起點（舊版第 23～30 關丙、丁很少出現：71,71,22,16,70,70；現在 45,60,58,49,53,55）；做不出來就放寬條件。
       5. 修了一個悄悄排除答案位置的問題：答案貼著路線「回頭」時，兩個轉彎中間唯一能放打斷「＝」橫線的那一層，剛好落在答案的留白裡，這種位置永遠放不下橫線
          （randomRows 現在這個間隔空 SOL_GAP＋1 層）。出題也變快了（canPlace、placements 不再每次重建查詢表、逐個走一遍；便宜的檢查放前面；
          先探路再試，做不出來的那一級整級跳過）：電腦每題平均 39.8 → 9.0 ms、最慢 265 → 136 ms。
   · 限時 TIME_S（第 1 關 → 到頂，秒）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'ghostleg';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 30 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂（也是最後一關） */
    var COLS = 6, ROWS = 16;                    /* 直線數、層數（V1.33 由 12 改 16：路線是之字形、轉彎變多，還要空出層來放打斷「＝」的橫線） */
    var X0 = 25, DX = 84, Y_TOP = 76, Y_BOT = 520;   /* 第 1 條直線的 x、直線間距、上下端 y（舞台座標） */
    var RUNGS = [16, 40];                        /* 現有橫線數：第 1 關 → 到頂 */
    var MAX_SOL = [2, 1];                       /* 「畫哪裡才對」的答案區段數上限：第 1 關 → 到頂（越後面越少種畫法；V1.33 起同一對直線上下相連的幾層算一個） */
    var VISIT = [5, 6];                         /* 正確路線（畫對之後的路線）要經過幾條不同的直線：第 1 關 → 到頂（5＝甲乙丙丁戊全部都經過） */
    var TURNS = [8, 16];                         /* 正確路線轉幾次彎（含玩家要畫的那一條）：第 1 關 → 到頂，轉彎越多越不容易看出轉折點 */
    var DENSITY_MAX = 1.3;                      /* 橫線數上限 ＝ 層數 × 這個值（每一層平均最多幾條）：太多會放不下（要留白、又不能擋住正確路線），RUNGS 設得比這個大會自動壓低 */
    var HIDE_BEFORE = [3, 9];                   /* V1.33.2 起 HIDE_BEFORE＋HIDE_AFTER 是「前後合計」：答案之前路線已經轉的次數＋答案之後還要轉的次數（＝正確路線的轉彎數 − 1），合計至少 HIDE_BEFORE＋HIDE_AFTER：第 1 關 → 到頂。
                                                   以前是前後「各至少」，16 層的圖上答案就只能落在路線正中間；現在答案是路線上第幾個轉彎，每一題平均地隨機挑（前段、中段、後段都會出現），前面藏得少、後面就藏得多 */
    var HIDE_AFTER = [3, 9];                    /* 同上（兩個加起來才有意義）。16 層放不下時 fitPlan 會自動壓低（出題記錄會顯示實際的轉彎數） */
    var AVOID_ENDS = true;                      /* V1.33：答案（玩家要畫的橫線）的兩端都不可以是起點那條、終點那條直線 */
    var SWEEP_FROM = 8;                        /* V1.33：從第幾關起，正確路線要碰到甲與戊兩邊的邊緣直線（第二輪起是左右來回走過去，不是一路走過去） */
    var STAIR = [2, 3];                         /* V1.33 第二輪：正確路線同一個方向最多連走幾步：第 1 關 → 到頂（越小越不像樓梯；第一輪的樓梯是 4 步。
                                                   到頂改成 2 的話，加上「碰到甲與戊」和打斷「＝」要多空的層，16 層放不下，會常常放寬條件） */
    var BREAK_EXTRA = 3;                        /* V1.33 第二輪：為了打斷「＝」，橫線數最多可以比 RUNGS 多幾條（橫線少的前幾關才會用到） */
    var REVERSE = [2, 5];                       /* V1.33 第二輪：正確路線的方向至少要回頭幾次（往右變往左、往左變往右）：第 1 關 → 到頂 */
    var DECOY_NEAR = 4;                         /* V1.33 第二輪：其他橫線放在「路線隔壁那一縫」的機會是放在別處的幾倍（越大越貼著路線、干擾越多；1＝不特別貼近） */
    var GROUP_MAX = [8, 4];                     /* V1.33 第二輪：答案那一段上下相連最多幾層：第 1 關 → 到頂（太長＝隨便畫都對；前面的關卡橫線少，答案段本來就長） */
    var POS_EXTRA = 0;                          /* V1.33.2：為了讓答案落在抽到的位置（前／中／後），路線形狀「再多」放寬幾級（超過原本就有的放寬一級；每一級＝同方向多連走 1 步、少回頭 1 次）：
                                                   0＝不再多放寬（預設，全部 32／44／24%）、1＝37／34／29%、2＝33／33／34%（答案位置更平均，第 23 關起的「後段」多很多），但分別約 23%、27% 的題目會超過「放寬一級」、路線比較像樓梯。
                                                   你的 STAIR、REVERSE 本身影響更大：到頂 STAIR 3→4、REVERSE 5→3 也能讓位置平均（36／34／30%） */
    var SOL_GAP = 2;                            /* 玩家要畫的位置，跟它相接的兩條直線上，上下幾層以內不放其他橫線（2＝上下各空 1 層；1＝不特別空出來） */
    var TIME_S = [30, 60];                      /* 每關限時（秒） */
    var TOUCH_X = 30;                           /* 手指按在直線的左右多遠以內，算按到那條直線（px） */
    var DRAG_MIN = 14;                          /* 往左右拖超過多遠，才決定要往哪邊畫（px） */
    var JOIN_FRAC = 0.8;                        /* 拖到隔壁直線的幾成距離，就算接上了 */
    var ROUTE_MS = [1500, 3200];                /* 評審動畫（畫出綠色虛線）的時間範圍 */
    var HOLD_MS = 2000;                         /* 動畫畫完後停多久才進下一關／結算 */
    var LABELS = ['甲', '乙', '丙', '丁', '戊', '己'];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* V1.33：出題的純函式搬到 js/ghostleg_core.js（鬼腳圖減一 也用同一套）；這裡帶入本款的參數 */
    var C = GhostlegCore({ COLS: COLS, ROWS: ROWS, X0: X0, DX: DX, Y_TOP: Y_TOP, Y_BOT: Y_BOT, SOL_GAP: SOL_GAP, DECOY_NEAR: DECOY_NEAR, BREAK_EXTRA: BREAK_EXTRA, AVOID_ENDS: AVOID_ENDS });
    var colX = C.colX, rowY = C.rowY, snapRow = C.snapRow, rungSet = C.rungSet, follow = C.follow, canPlace = C.canPlace, placements = C.placements, visitedCols = C.visitedCols, gapCounts = C.gapCounts, makeWalk = C.makeWalk, spreadRows = C.spreadRows, crowded = C.crowded, hideOf = C.hideOf, answerGroups = C.answerGroups, hardEnough = C.hardEnough, cancelPairs = C.cancelPairs, makesCancel = C.makesCancel, routeShape = C.routeShape, makeZigzag = C.makeZigzag, randomRows = C.randomRows, routeLength = C.routeLength, partialRoute = C.partialRoute, construct = C.construct;
    function rungCap() { return Math.floor(ROWS * DENSITY_MAX); }
    function rungCount(level) { return Math.min(rungCap(), Math.round(kit.ramp(level, RUNGS[0], RUNGS[1], RAMP_LEVELS))); }
    function maxSolAt(level) { return Math.max(1, Math.round(kit.ramp(level, MAX_SOL[0], MAX_SOL[1], RAMP_LEVELS))); }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }
    function visitAt(level) { return Math.round(kit.ramp(level, VISIT[0], VISIT[1], RAMP_LEVELS)); }
    function turnsAt(level) { return Math.round(kit.ramp(level, TURNS[0], TURNS[1], RAMP_LEVELS)); }
    function hideAt(level) { return { b: Math.round(kit.ramp(level, HIDE_BEFORE[0], HIDE_BEFORE[1], RAMP_LEVELS)), a: Math.round(kit.ramp(level, HIDE_AFTER[0], HIDE_AFTER[1], RAMP_LEVELS)) }; }
    function groupMaxAt(level) { return Math.round(kit.ramp(level, GROUP_MAX[0], GROUP_MAX[1], RAMP_LEVELS)); }
    function stairAt(level) { return Math.round(kit.ramp(level, STAIR[0], STAIR[1], RAMP_LEVELS)); }
    function revAt(level) { return Math.round(kit.ramp(level, REVERSE[0], REVERSE[1], RAMP_LEVELS)); }
    /* 試著出一題（先定路線、再撒橫線）：n＝現有橫線數，limit＝答案區段數上限，vNeed＝正確路線至少經過幾條直線，
       hide＝每一種答案前後「合計」至少藏幾個轉彎（V1.33.2：以前是前後各至少 hb、ha 個），sweep＝路線要不要碰到甲與戊，sh＝{ stair, rev, turns } 路線的之字形條件（turns＝至少轉幾次彎）；
       start＝起點（由 makeLevel 先平均地隨機決定）；u＝答案在正確路線上的相對位置（0～1，由 makeLevel 每一題只抽一次，見 core 的 answerIndex），pos＝true 時答案一定要落在 u 那一段（前／中／後）；失敗回傳 null */
    function buildLevel(level, start, n, limit, vNeed, hide, sweep, sh, u, pos, rand) {
        var cst = construct({ start: start, n: n, vNeed: vNeed, sweep: sweep, minTurns: Math.max(sh.turns, hide + 1), stair: sh.stair, rev: sh.rev, u: u, pos: pos }, rand);
        if (!cst) return null;
        var rungs = cst.rungs, sol = cst.sol, target = cst.target, walk = cst.walk;
        var cc = gapCounts(rungs);
        if (Math.max.apply(null, cc) - Math.min.apply(null, cc) > 1) return null;                    /* 各縫的橫線數最多差 1 條（便宜的檢查，放在最前面：九成以上的失敗都卡在這裡，不用再往下做耗時的窮舉） */
        var f0 = follow(rungs, start), full = rungs.concat([sol]), f1 = follow(full, start);
        if (f1.end !== target || target === f0.end || visitedCols(full, start).length < vNeed) return null;
        var sols = placements(rungs, start).filter(function (p) { return p.end === target; }).map(function (p) { return { row: p.row, col: p.col }; });
        var groups = answerGroups(sols);
        if (!sols.length || groups.length > limit || groups.some(function (gr) { return gr.to - gr.from + 1 > groupMaxAt(level); })) return null;
        if (crowded(rungs, sol.row, sol.col) || !sols.some(function (p) { return p.row === sol.row && p.col === sol.col; })) return null;      /* 原本設計的那個位置（上下留白）一定要在解答裡 */
        if (!sols.every(function (p) { return hardEnough(rungs, start, target, p, hide); })) return null;   /* 每一種畫對的位置都不碰起點終點的直線、前後合計藏得夠深（不能留一個容易找的） */
        if (cancelPairs(rungs) || sols.some(function (p) { return makesCancel(rungs, p.row, p.col); })) return null;   /* 題目沒有「＝」；每一種答案畫上去也不會變成「＝」 */
        return { rungs: rungs, start: start, target: target, end0: f0.end, solutions: sols, sol: sol, sweep: !!sweep, hide: hideOf(rungs, start, sol), shape: routeShape(walk), turn: cst.sj, turns: walk.length - 1 };
    }
    /* 出題：回傳 { rungs, start, target（終點欄）, end0（現有橫線走到的欄）, solutions: [{row, col}], sol, sweep, hide, shape, turn, turns }。
       target ≠ end0（現有的線走不到終點）；答案區段數在 1～maxSolAt(level) 之間、每段最多 GROUP_MAX 層；正確路線經過 visitAt(level) 條以上的直線；
       每一種畫對的位置都不碰起點、終點的直線，前後「合計」藏 hideAt(level) 的 b＋a 個以上的轉彎（V1.33.2）；路線是之字形（stairAt、revAt）；第 SWEEP_FROM 關起碰到甲與戊。
       V1.33.2：答案是正確路線上的第幾個轉彎（回傳的 turn／turns），每一題平均地隨機挑（u 一題只抽一次，失敗重蓋也不換），所以答案會出現在路線的前段、中段、後段。
       橫線數先照參數試，找不到才逐步放寬（答案區段數、經過的直線數，最後才放寬藏的深度與之字形）；真的放不下才一條一條少放。 */
    var TRIES_STAGE = 60, TRIES_OTHER = 40, GEN_BUDGET_MS = 400;
    /* V1.33.1：參數調太大（例如 TURNS、HIDE_BEFORE、HIDE_AFTER 都 ≥ 5），16 層根本放不下——以前會試很久之後退回「只有 1 條橫線」的保底題。
       現在先把要求壓到放得下的範圍：路線至少要轉 max(TURNS, 前＋後＋1) 次彎；從要求的次數開始往下試「每一個起點都做得出這麼多次彎的之字形路線嗎」
       （用固定的亂數種子試，不影響出題的亂數；每一關只算一次、記起來），找到做得出來的就用它。
       V1.33.2：答案前後藏的轉彎改成「合計」（前＋後＝路線轉彎數 − 1），壓下來時合計最多只能是「做得出來的轉彎數 − 1」。
       放得下的參數完全不受影響。回傳 { turns（至少轉幾次彎）, hide（前後合計至少藏幾個轉彎）} */
    var fitCache = {};
    /* 固定種子的亂數（mulberry32）：fitPlan、walkPossible 試路線用，不影響出題的亂數（同一個種子永遠走出同一串數字） */
    function fixedRand(seed) {
        return function () {
            seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function hasAnswer(w) { return C.answerIndex(0.5, w) >= 0; }                 /* 路線上有沒有轉彎能當答案（給 makeZigzag 的 accept 用） */
    function fitPlan(level, rev) {
        if (fitCache[level]) return fitCache[level];
        var hd = hideAt(level), stair = stairAt(level), sweep = level >= SWEEP_FROM, v = visitAt(level), n = rungCount(level);
        var prng = fixedRand(12345 + level);
        var want = Math.max(turnsAt(level), hd.b + hd.a + 1), plan = null;
        for (var m = want; m >= 3 && !plan; m--) {
            /* 每一個起點都要做得出來（原本的之字形條件、或放寬一級＝makeLevel 的第 4 級：同方向多走 1 步、少回頭 1 次，都算）——
               只挑「勉強放得下」的長度的話，只有從最左、最右出發才做得出來，起點就變成線索了。
               路線上要有一個轉彎能當答案（不碰起點、終點的直線）；挑哪一個由每一題抽到的 u 決定（見 core 的 answerIndex），這裡只要確定有 */
            var okAll = true;
            for (var s0 = 0; s0 < COLS && okAll; s0++) {
                var okS = false;
                for (var i = 0; i < 16 && !okS; i++) {
                    okS = !!(makeZigzag(s0, v, sweep, m, stair, rev, Math.min(ROWS - 2, n + 1), prng, hasAnswer) ||
                        makeZigzag(s0, v - 1, sweep, m, stair + 1, Math.max(1, rev - 1), Math.min(ROWS - 2, n + 1), prng, hasAnswer));
                }
                okAll = okS;
            }
            if (okAll) plan = { turns: Math.min(turnsAt(level), m), hide: Math.min(hd.b + hd.a, m - 1) };
        }
        return (fitCache[level] = plan || { turns: 3, hide: 2 });
    }
    /* 這一級的條件（S）下，這個起點走得出路線嗎？——便宜的探路（只試之字形路線，不蓋整張圖），做不出來就整級跳過，不用把這一級的幾百次嘗試用完。
       S.pos＝true 時，路線還要讓答案落在 u 抽到的那一段。用固定的亂數種子，不影響出題的亂數 */
    function walkPossible(level, S, start, n, sweep, u) {
        var prng = fixedRand(9000 + level * 7 + start), third = Math.min(2, Math.floor(u * 3));
        var acc = function (w) { var k = C.answerIndex(u, w); return k >= 0 && (!S.pos || C.answerThird(k, w.length - 1) === third); };
        for (var i = 0; i < 3; i++) {
            if (makeZigzag(start, Math.max(2, S.v), sweep, Math.max(S.sh.turns, S.hide + 1), S.sh.stair, S.sh.rev, Math.min(ROWS - 2, n + 1), prng, acc)) return true;
        }
        return false;
    }
    /* V1.33.2 的出題順序：起點（平均）和答案位置 u（平均）都是一題一次抽好，之後不換。
       先照「答案一定要落在 u 抽到的那一段（前／中／後）」一級一級放寬（答案區段數、經過的直線數，最後才放寬藏的深度與之字形，都只放寬一級）；
       這樣還是做不出來（有些起點在你的參數下合規的路線只有寥寥幾條，答案位置被路線形狀限制住），才不管位置，再從最嚴格的那一級重來一次。
       都不行才換別的起點，最後是最寬鬆的一級。 */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var limit = maxSolAt(level), want = rungCount(level), v0 = visitAt(level), sweep = level >= SWEEP_FROM, t0 = Date.now();
        var sh = { stair: stairAt(level), rev: revAt(level) }, fit = fitPlan(level, sh.rev), hide = fit.hide;
        sh.turns = fit.turns;
        var rel = { stair: sh.stair + 1, rev: Math.max(1, sh.rev - 1), turns: sh.turns };      /* 放寬一級的路線形狀：同方向多走 1 步、少回頭 1 次 */
        var u = rand();                                                            /* 答案在正確路線上的位置（0～1）：一題只抽一次，失敗重蓋也不換，不然「好蓋的位置」會比較常被留下來 */
        var start = kit.randInt(0, COLS - 1, rand);                                /* 起點先決定（平均分布），再出題；做不出來就放寬條件，不換起點（換起點會讓起點偏向甲、戊） */
        var base = [
            { v: v0, lim: limit, hide: hide, sh: sh, n: 250 },
            { v: v0, lim: limit + 1, hide: hide, sh: sh, n: TRIES_STAGE },
            { v: v0 - 1, lim: limit + 2, hide: hide, sh: sh, n: TRIES_STAGE },
            { v: v0 - 1, lim: limit + 3, hide: Math.max(2, hide - 2), sh: rel, n: TRIES_STAGE }
        ];
        var stages = base.map(function (s) { return Object.assign({ pos: true }, s); });
        for (var ex = 1; ex <= POS_EXTRA; ex++) {                                  /* POS_EXTRA：為了答案位置，路線形狀再多放寬幾級（只在「答案要落在抽到的那一段」的這一輪用） */
            stages.push({ v: v0 - 1, lim: limit + 3, hide: Math.max(2, hide - 2), sh: { stair: sh.stair + 1 + ex, rev: Math.max(1, sh.rev - 1 - ex), turns: sh.turns }, n: TRIES_STAGE, pos: true });
        }
        stages = stages.concat(base.map(function (s) { return Object.assign({ pos: false }, s); }));
        /* 橫線數：先試剛好 want 條；做不出來先試多 1 條（各縫的橫線數最多差 1 條，want 剛好是縫數的倍數時一定要每縫一樣多，很難湊；多 1 條就好湊多了），再一條一條少放 */
        var counts = [want, want + 1];
        for (var dn = 1; dn <= 14 && want - dn >= 1; dn++) counts.push(want - dn);
        for (var ci = 0; ci < counts.length; ci++) {
            var nn = counts[ci];
            for (var st = 0; st < stages.length; st++) {
                var S = stages[st];
                if (Date.now() - t0 > GEN_BUDGET_MS) { ci = counts.length; break; }    /* 花太久了：直接跳到下面最寬鬆的條件 */
                if (!walkPossible(level, S, start, nn, sweep, u)) continue;
                for (var tries = 0; tries < S.n; tries++) {
                    if (Date.now() - t0 > GEN_BUDGET_MS) { ci = counts.length; st = stages.length; break; }
                    var lv = buildLevel(level, start, nn, S.lim, Math.max(2, S.v), S.hide, sweep, S.sh, u, S.pos, rand);
                    if (lv) return lv;
                }
            }
        }
        var others = []; for (var c0 = 0; c0 < COLS; c0++) if (c0 !== start) others.push(c0);
        others = kit.shuffle(others, rand);
        for (var s2 = 0; s2 < others.length; s2++) for (var t2 = 0; t2 < TRIES_STAGE; t2++) {       /* 這個起點真的出不了題：換別的起點再試 */
            if (Date.now() - t0 > GEN_BUDGET_MS) break;
            var lv2 = buildLevel(level, others[s2], want, limit + 3, Math.max(2, v0 - 1), Math.max(2, hide - 2), sweep, rel, u, false, rand);
            if (lv2) return lv2;
        }
        /* V1.33.1：最寬鬆的條件（前後合計藏 2 個轉彎、回頭 1 次、不必碰兩邊、少一點轉彎）——還是一張完整的圖，不會退回只有 1 條橫線 */
        var easy = { stair: sh.stair + 2, rev: 1, turns: Math.min(sh.turns, 6) };
        for (var e = 0; e < 400; e++) {
            var lv3 = buildLevel(level, kit.randInt(0, COLS - 1, rand), Math.max(1, want - (e % 6)), limit + 3, 2, 2, false, easy, u, false, rand);
            if (lv3) return lv3;
        }
        var r0 = [{ row: 4, col: 2 }], f0 = follow(r0, 0);                          /* 保底：很簡單的一題（現有 1 條橫線，把起點接到隔壁） */
        return { rungs: r0, start: 0, target: 1, end0: f0.end, sol: { row: 4, col: 0 }, sweep: false, hide: { before: 0, after: 0 }, shape: { maxRun: 1, rev: 0 }, turn: 0, turns: 1, solutions: placements(r0, 0).filter(function (p) { return p.end === 1; }).map(function (p) { return { row: p.row, col: p.col }; }) };
    }
    /* 評審動畫花多久：路線越長越久（每 px 約 2.4 毫秒），夾在 ROUTE_MS 範圍內 */
    function routeMs(route) { return Math.round(kit.clamp(routeLength(route) * 2.4, ROUTE_MS[0], ROUTE_MS[1])); }
    /* 答案區段的文字：「第 5～7 層的 乙～丙 之間」 */
    function groupText(g) { return '第 ' + (g.from + 1) + (g.to > g.from ? '～' + (g.to + 1) : '') + ' 層的 ' + LABELS[g.col] + '～' + LABELS[g.col + 1] + ' 之間'; }
    function rating(n) {
        if (n >= 15) return '鬼腳圖大師！全部通關！';
        if (n >= 10) return '高手！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '想一想橫線要畫在哪裡，再來一次！';
    }

    function mount(root, ctx) {
        /* V1.28 起鬼腳圖整個改玩法（畫一條橫線把起點接到終點；以前是手指沿線描），舊版的最佳紀錄不能比：第一次進來清掉（只清一次） */
        Reaction.migrateBest(ID, function () { return null; }, '.v128');
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: RAMP_LEVELS, goodAt: 5,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level, my = api.my;
        var q = makeLevel(level, api.rand);
        api.info = q;
        console.log('[鬼腳圖] 第 ' + level + ' 關：現有橫線 ' + q.rungs.length + ' 條；起點 ' + LABELS[q.start] + '、終點 ' + (q.target + 1) + '（現有的線走到 ' + (q.end0 + 1) + '）；答案 ' + answerGroups(q.solutions).length + ' 段：' + answerGroups(q.solutions).map(groupText).join('、') + '；正確路線經過 ' + visitedCols(q.rungs.concat([q.solutions[0]]), q.start).map(function (x) { return LABELS[x]; }).join('') + '；答案是正確路線的第 ' + (q.turn + 1) + '／' + q.turns + ' 個轉彎（前後藏了 ' + q.hide.before + '、' + q.hide.after + ' 個）' + '；路線同方向最多連走 ' + q.shape.maxRun + ' 步、回頭 ' + q.shape.rev + ' 次' + (q.sweep ? '、碰到甲與戊' : '') + '；各縫橫線數 ' + gapCounts(q.rungs).join(',') + '；限時 ' + timeMs(level) + ' ms');

        /* 畫出整張圖（js/ghostleg_core.js 的 drawBoard，「鬼腳圖減一」也用同一個，外觀一樣） */
        var board = C.drawBoard(stage, q, LABELS, '照現有的線走不到終點！按住一條直線、往旁邊拖，畫上一條橫線');
        var gUser = board.gUser, gRoute = board.gRoute, gHint = board.gHint, endBoxes = board.endBoxes, msg = board.msg;

        /* 操作提示（只在第一次進遊戲時）：鉛筆圖示在「正確位置」畫出一條藍色水平橫線，重複播放（沒有手指圖示）；玩家一按下去就消失 */
        var hintOn = false, pencil = null;
        if (level === 1 && kit.once('ghostleg.hint') && q.solutions.length) {
            var sol = q.solutions[0], hy = rowY(sol.row), hx1 = colX(sol.col), hx2 = colX(sol.col + 1);
            var hl = kit.svg('line', { x1: hx1, y1: hy, x2: hx1, y2: hy, 'class': 'gl-user gl-user--hint' }, gHint);
            pencil = h('div', { 'class': 'gl-pencil', text: String.fromCodePoint(0x270F) + String.fromCodePoint(0xFE0F) });
            stage.appendChild(pencil);
            hintOn = true;
            var t0h = performance.now();
            my.loop(function (now) {
                if (!hintOn) return false;
                var p = ((now - t0h) % 2400) / 2400, e = Math.min(1, p / 0.7);
                var x2 = hx1 + (hx2 - hx1) * e;
                hl.setAttribute('x2', x2.toFixed(1)); hl.setAttribute('opacity', p > 0.9 ? Math.max(0, (1 - p) / 0.1) : 1);
                pencil.style.left = (x2 - 6) + 'px'; pencil.style.top = (hy - 34) + 'px';
            });
        }
        function hideHint() { hintOn = false; if (pencil) { if (pencil.parentNode) pencil.parentNode.removeChild(pencil); pencil = null; } while (gHint.firstChild) gHint.removeChild(gHint.firstChild); }

        /* 畫橫線：按住某一條直線 → 往左或往右拖到相鄰的直線 → 畫上一條粗藍線（貼齊最近的一層）；拖到一半放開＝取消 */
        var drag = null, locked = false, placed = null;
        function colAt(x, y) {
            if (y < Y_TOP - 6 || y > Y_BOT + 6) return -1;
            var best = -1, bd = 1e9;
            for (var k = 0; k < COLS; k++) { var d = Math.abs(x - colX(k)); if (d < bd) { bd = d; best = k; } }
            return bd <= TOUCH_X ? best : -1;
        }
        stage.addEventListener('pointerdown', function (e) {
            if (api.over || locked || drag) return;
            var p = kit.localPt(e, stage), col = colAt(p.x, p.y);
            if (col < 0) return;
            e.preventDefault();
            try { stage.setPointerCapture(e.pointerId); } catch (err) { }
            hideHint();
            drag = { id: e.pointerId, col: col, row: snapRow(p.y), x0: p.x, dir: 0, line: null };
        });
        stage.addEventListener('pointermove', function (e) {
            if (!drag || e.pointerId !== drag.id || locked) return;
            var p = kit.localPt(e, stage), dx = p.x - drag.x0;
            if (!drag.dir) {
                if (Math.abs(dx) < DRAG_MIN) return;
                var dir = dx > 0 ? 1 : -1, nb = drag.col + dir;
                if (nb < 0 || nb > COLS - 1) return;                       /* 那一邊沒有直線 */
                drag.dir = dir;
                var y = rowY(drag.row);
                drag.line = kit.svg('line', { x1: colX(drag.col), y1: y, x2: colX(drag.col), y2: y, 'class': 'gl-user' }, gUser);
            }
            var from = colX(drag.col), to = colX(drag.col + drag.dir), f = kit.clamp((p.x - from) / (to - from), 0, 1);
            drag.line.setAttribute('x2', (from + (to - from) * f).toFixed(1));
            if (f >= JOIN_FRAC) { var d0 = drag; drag = null; commit(d0); }
        });
        function up(e) {
            if (!drag || e.pointerId !== drag.id) return;
            if (drag.line) gUser.removeChild(drag.line);                   /* 沒拖到隔壁的直線：取消，可以重畫 */
            drag = null;
        }
        stage.addEventListener('pointerup', up);
        stage.addEventListener('pointercancel', up);

        function flash(text) { msg.textContent = text; }
        function commit(d) {
            var col = Math.min(d.col, d.col + d.dir), row = d.row;
            if (!canPlace(q.rungs, row, col)) {                            /* 那一層那個位置已經有橫線（或緊鄰）：不算，請換個位置 */
                gUser.removeChild(d.line); Sfx.play('bad');
                flash('那裡已經有橫線了，換個位置畫');
                return;
            }
            locked = true; placed = { row: row, col: col };
            var y = rowY(row);
            d.line.setAttribute('x1', colX(col)); d.line.setAttribute('x2', colX(col + 1)); d.line.setAttribute('y1', y); d.line.setAttribute('y2', y);
            Sfx.play('click'); api.stopTimer();
            msg.textContent = '';
            judge();
        }
        /* 評審動畫：從起點開始畫出一條綠色粗虛線，經過每個轉折點，看看最後能不能抵達終點 */
        function judge() {
            var f = follow(q.rungs.concat([placed]), q.start), ms = routeMs(f.route), total = routeLength(f.route);
            var line = kit.svg('polyline', { points: '', 'class': 'gl-route' }, gRoute);
            my.tween(ms, function (e) {
                line.setAttribute('points', partialRoute(f.route, total * e).map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' '));
            }, kit.linear).then(function () {
                var win = f.end === q.target;
                C.markEnds(board, f.end, q.target);
                Sfx.play(win ? 'ok' : 'bad');
                api.after(HOLD_MS, function () {
                    if (win) api.pass({ delay: 0 });
                    else api.fail({ delay: 0, lines: ['這條橫線畫在這裡，會走到終點 ' + (f.end + 1) + '，不是綠色的終點 ' + (q.target + 1), '只有一次機會，要想清楚橫線畫在哪一層、哪兩條直線之間'] });
                });
            });
        }
        api.timer(timeMs(level), function () {
            hideHint(); locked = true;
            if (drag && drag.line) gUser.removeChild(drag.line);
            drag = null;
            msg.textContent = '';
            api.fail({ delay: 600, lines: ['時間到了', '答案：' + answerGroups(q.solutions).slice(0, 3).map(groupText).join('、')] });
        });

        /* 驗證用：用真的 PointerEvent 畫一條橫線（往右拖到隔壁的直線） */
        function fire(type, x, y) {
            var r = stage.getBoundingClientRect(), sc = r.width / (stage.clientWidth || r.width);
            stage.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, clientX: r.left + x * sc, clientY: r.top + y * sc }));
        }
        function drawAt(row, col, dir) {
            var y = rowY(row), a = colX(dir > 0 ? col : col + 1), b = colX(dir > 0 ? col + 1 : col);
            fire('pointerdown', a, y);
            for (var k = 1; k <= 10; k++) fire('pointermove', a + (b - a) * k / 10, y);
            fire('pointerup', b, y);
        }
        api.solve = function () { var s = q.solutions[0]; drawAt(s.row, s.col, 1); };
        api.wrong = function () {
            var bad = placements(q.rungs, q.start).filter(function (p) { return p.end !== q.target; })[0];
            if (bad) drawAt(bad.row, bad.col, 1);
        };
        api.draw = drawAt;
    }

    var G = {
        id: ID,
        name: '鬼腳圖',
        rule: '這是台灣童玩「阿彌陀佛」。上方有綠色的起點，下方有綠色的終點，但照著現有的橫線走，**從起點到不了終點**。請你**按住一條直線，往左或往右拖到隔壁的直線，畫上一條橫線**，讓起點接到終點。**只有一次機會**，畫好後會從起點開始一路走下去，遇到橫線就轉彎，看能不能走到終點。',
        mount: mount,
        score: SCORE,
        test: { colX: colX, rowY: rowY, snapRow: snapRow, rungCount: rungCount, rungCap: rungCap, DENSITY_MAX: DENSITY_MAX, maxSolAt: maxSolAt, timeMs: timeMs, follow: follow, canPlace: canPlace, visitAt: visitAt, turnsAt: turnsAt, visitedCols: visitedCols, gapCounts: gapCounts, makeWalk: makeWalk, makeZigzag: makeZigzag, cancelPairs: cancelPairs, makesCancel: makesCancel, randomRows: randomRows, routeShape: routeShape, stairAt: stairAt, revAt: revAt, fitPlan: fitPlan, groupMaxAt: groupMaxAt, answerGroups: answerGroups, groupText: groupText, hideOf: hideOf, hideAt: hideAt, hardEnough: hardEnough, answerIndex: C.answerIndex, answerOk: C.answerOk, answerThird: C.answerThird, walkPossible: walkPossible, construct: C.construct, spreadRows: spreadRows, crowded: crowded, placements: placements, makeLevel: makeLevel, routeLength: routeLength, partialRoute: partialRoute, routeMs: routeMs, rating: rating, COLS: COLS, ROWS: ROWS, RAMP_LEVELS: RAMP_LEVELS, Y_TOP: Y_TOP, Y_BOT: Y_BOT, RUNGS: RUNGS, MAX_SOL: MAX_SOL, VISIT: VISIT, TURNS: TURNS, SOL_GAP: SOL_GAP, HIDE_BEFORE: HIDE_BEFORE, HIDE_AFTER: HIDE_AFTER, AVOID_ENDS: AVOID_ENDS, SWEEP_FROM: SWEEP_FROM, BREAK_EXTRA: BREAK_EXTRA, STAIR: STAIR, REVERSE: REVERSE, DECOY_NEAR: DECOY_NEAR, GROUP_MAX: GROUP_MAX, POS_EXTRA: POS_EXTRA, TIME_S: TIME_S, HOLD_MS: HOLD_MS, ROUTE_MS: ROUTE_MS }
    };
    Reaction.register(G);
})();
