/* ═══════════════════════════════════════════════════════════════════
   reaction_followme.js — 秒反應・照著走
   樣式：css/games/reaction_followme.css（這款專屬的 class 一律以「followme-」開頭；共用元件在 css/reaction_common.css）
   格子地圖，小人固定從最下面正中間出發。先看小人示範走一遍到終點（地圖上看得到旗子和陷阱），
   然後小人回到起點，**旗子和陷阱全部消失**；你用下方四顆按鈕（左方、前進、後退、右方）自己走：
   不一定要照示範的路線，但**步數要跟示範一樣**（畫面顯示剩餘步數）。步數用完，終點指示牌再出現，
   小人站在終點就成功。走進陷阱格就失敗（失敗或過關時，陷阱才會顯示出來）。
   ───────────────────────────────────────────────────────────────────
   · 按鈕：左方＝往左走一格、前進＝往上走一格、後退＝往下走一格、右方＝往右走一格。
     （V1.48.0 新增「後退」：路線會先往上繞一圈、再往下走才到旗子，沒有往下的按鈕就走不出來。）
     走出地圖外的按鈕沒有作用，也不扣步數。
   · 手指拖曳（V1.49.0）：也可以用手指按住小人、在格子上拖曳畫出路線——小人一格一格跟著手指走，地上留下一條藍色的路線。
     拖曳的過程**不判定對錯，等手指離開螢幕才判定**（judgeTrail）：路線經過陷阱 → 失敗；步數用完而且站在旗子上 → 過關；
     步數用完卻沒在旗子上 → 失敗；還沒走到旗子、也沒踩陷阱 → 繼續（再按住小人往下拖）。
     走回「上一格」＝撤銷最後一步（步數加回來，stepTrail），所以手指不小心抖回頭不會白白浪費步數；按鈕走法也一樣（按相反方向就是撤銷），
     不同的是按鈕「每按一下立刻判定」（踩到陷阱馬上失敗），拖曳是放開手指才判定。
     手指跟著走的規則（nextCell）：手指超過小人所在格中心 DRAG_T 格，小人就往那個方向走一格（橫向、直向哪邊差得多走哪邊）；
     手指按下去的位置離小人 GRAB_CELLS 格以內才算抓到小人，而且小人保持「被抓住的那個點」，不會一按下去就跳到手指下面。
   · 示範走完後，畫面先停 COUNT_N 秒讓玩家記住（旗子、陷阱都還在），中間疊著大大的倒數數字 3、2、1：
     數字寬度＝遊戲畫面寬度的 COUNT_W（1/3）、黑色 25% 透明、外面一圈粗白框（showCount）；倒數完旗子和陷阱才消失、小人回到起點。
   · 結果要等小人「真的走到格子正中央」才揭曉：判定雖然在按下按鈕的瞬間就決定了，但是走進陷阱、或走完最後一步的時候，
     旗子與全部陷阱要等小人走完這一格（CSS 移動動畫播完，whenArrived）才顯示，不會小人還在路上就先看到結果；
     這段時間按鈕鎖住（state＝'moving'）。
   ───────────────────────────────────────────────────────────────────
   · 出題邏輯（V1.48.0 重寫）：**地圖上絕大部分都是陷阱，只有一條彎來彎去的正確路線，加上幾條走不通的混淆岔路。**
     先決定路線，再把「不是路線的格子」全部填成陷阱——所以陷阱數量不用另外設定，是「整張地圖 − 路線格 − 岔路格」。
     (1) 路線是一條「自己不碰自己」的蛇（growRoute）：
           從起點出發，每多走一格，新格子除了「剛走過來的那一格」以外，四周都不能有別的路線格（canOpen）。
           這樣路線上不是前後相鄰的兩格一定不會貼在一起 → 沒有捷徑、也沒有第二條路，
           起點到終點的最短步數就是路線長度，所以「步數＝示範步數」剛好夠走完，多走或走錯一步就到不了終點（測試用 BFS 驗證過）。
     (2) 彎來彎去（planWays＋growRoute 的權重）：
           先隨機挑幾個「路標」（大多在左右兩側的邊緣、離上一個路標夠遠），小人傾向往目前的路標走，走到旁邊就換下一個路標；
           連續直走越久，越不想再直走。路標位置是隨機的，所以路線常常「先往上走、繞一圈、再往下走才到旗子」，
           也常常「走到最左或最右的邊緣再折回來」。被自己圍住走不下去時，退回上一步換個方向（回溯）。
     (3) 挑最有看頭的一條（bestRoute、scoreRoute）：
           用同樣的方法產生 CANDIDATES 條候選路線，依「這一關想要的風格」（wantFor）打分數，挑最高分的：
           轉彎數夠多、直走不能太長、有往下走的步數、有碰到左右邊緣、涵蓋的列數越多越好；
           旗子的位置隨機二選一：「旗子就在路線的最高處」或「旗子比路線的最高處還低（要先往上再往下）」，關卡越高越偏向後者。
     (4) 混淆岔路（addDecoys）：從正確路線的格子岔出去幾條 DECOY_LEN 格長的死巷子（同樣不碰到其他路線格）。
           走進岔路不會死，但回不到正確路線上——步數會不夠，所以是「看起來像路、其實走不到旗子」的混淆。
     (5) 其他所有格子都是陷阱，陷阱的圖案（尖刺、火焰、地洞、炸彈、水坑）隨機配。陷阱至少佔地圖的 TRAP_MIN（一半）：
           地圖太小時，岔路會被省略（路線本身不動），所以「畫面大部分都是陷阱」一定成立。
     (6) 保底（serpentine）：萬一候選路線全部失敗（參數調得太擠），改用「橫掃一列、往上兩格、再橫掃回來」的蛇形路線，一定走得出來。
   · 起點的欄：cols 是偶數時沒有「正中間的那一欄」，取偏左的那一欄（startCol＝floor((cols−1)/2)）。
     （V1.48.0 修正：舊版用 (cols−1)/2，偶數欄變成 4.5 這種小數，格子編號對不上，BFS 與陷阱全部失效，所以偶數欄時陷阱整個消失。）
   · 難度（第 1 → LEVEL_RAMP 關線性，之後維持）：步數 STEPS、地圖列數 ROWS、欄數 COLS、岔路數 DECOYS、
     轉彎比例 TURN、往下走的步數 DOWNS、碰邊緣的機率 EDGE_P、旗子在低處的機率 LOW_P、最長直走 RUN。
   · 不限時。進陷阱、或步數用完沒站在終點就失敗（只有一次機會），成績＝通過關數（越多越好）；失敗後可從「失敗關卡 − 5」繼續。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'followme';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 followme 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 200 };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    var LEVEL_RAMP = 30;                            /* 難度升到頂的關卡：第 1 關線性變難，到第 30 關最難，之後維持不變 */
    /* 步數、地圖大小、岔路數都隨關卡線性增加（kit.ramp：第 1 關是 START、第 LEVEL_RAMP 關是 END，中間平均分配） */
    var STEPS_START = 10, STEPS_END = 40;       /* 要走幾步（＝正確路線的長度） */
    var ROWS_START = 6, ROWS_END = 12;          /* 地圖列數（愈後面的關卡地圖愈高；列數太多格子會縮小，12 列時一格約 44 像素） */
    var COLS_START = 4, COLS_END = 8;          /* 地圖欄數（愈後面的關卡地圖愈寬；奇數、偶數都可以） */
    var DECOYS_START = 1, DECOYS_END = 5;       /* 混淆岔路的條數 */
    var DECOY_LEN = [2, 5];                     /* 每條岔路的長度範圍 [最短, 最長]（格） */
    var TRAP_MIN = 0.5;                         /* 陷阱至少要佔地圖的幾成（0.5＝一半以上）；地圖太小放不下的岔路會被省略，路線本身不受影響 */
    /* 路線風格：每一關想要的路線長相，也是第 1 關線性走到第 LEVEL_RAMP 關 */
    var TURN_START = 0.4, TURN_END = 0.65;      /* 轉彎數佔步數的比例（0.5＝每兩步就轉一次彎） */
    var DOWNS_START = 0, DOWNS_END = 3;         /* 希望路線至少有幾步是「往下走」 */
    var EDGE_P_START = 0.4, EDGE_P_END = 0.8;   /* 「路線要走到最左或最右邊緣」的機率 */
    var LOW_P_START = 0.3, LOW_P_END = 0.7;     /* 「旗子要比路線最高處還低」（先往上繞一圈再往下走）的機率；其餘的關卡旗子就在路線最高處 */
    var RUN_START = 4, RUN_END = 3;             /* 最多連續直走幾步（超過會扣分） */
    var CANDIDATES = 40;                        /* 每一關產生幾條候選路線，挑最高分的 */
    var DEMO_STEP_MS = 480;                    /* 示範每一步的時間 */
    var DEMO_LEAD_MS = 900;                         /* 示範開始前先等多久（毫秒） */
    var COUNT_N = 3, COUNT_MS = 1000;               /* 示範完先暫停讓玩家記住：倒數 COUNT_N 個數字（3、2、1），每個數字停 COUNT_MS 毫秒（共 3 秒） */
    var COUNT_W = 1 / 3;                            /* 倒數數字的寬度＝遊戲畫面寬度的幾分之幾（1/3） */
    var DRAG_MS = 90;                               /* 手指拖曳時，小人每走一格的動畫時間（毫秒；要比按鈕快，才跟得上手指） */
    var GRAB_CELLS = 1.6;                           /* 手指按下去的位置離小人幾格以內，才算「抓到小人」（格子小的時候不用瞄得很準） */
    var DRAG_T = 0.7;                               /* 手指要超過小人所在格的中心幾格，小人才會走進旁邊那一格（0.5＝剛好進到隔壁格；多一點，手指在格子交界抖動就不會來回亂跳） */
    var NEXT_MS = 1300;                             /* 答完一題後停多久才出下一題（毫秒，1300 毫秒＝1.3 秒） */
    /* 四個動作對應的位移 [列變化, 欄變化]：L 往左一欄、F 往上一列（列號減 1）、R 往右一欄、B 往下一列（列號加 1） */
    var MOVES = { L: [0, -1], F: [-1, 0], R: [0, 1], B: [1, 0] };     /* [dRow, dCol] */
    var DIRS = ['L', 'F', 'R', 'B'];                /* 四個方向的固定順序（for...in 的順序不保證，要固定順序就用陣列） */
    /* 動作的中文名稱（主控台輸出用） */
    var MOVE_NAME = { L: '左方', F: '前進', R: '右方', B: '後退' };
    /* 陷阱的圖案種類（畫法在 drawTrap，顏色在 css/games/reaction_followme.css） */
    var TRAP_KINDS = ['spike', 'fire', 'bomb'];

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 關'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 這一關要走幾步 */
    function stepsWanted(level) { return Math.round(kit.ramp(level, STEPS_START, STEPS_END, LEVEL_RAMP)); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    /* 這一關地圖有幾列 */
    function rowsFor(level) { return Math.round(kit.ramp(level, ROWS_START, ROWS_END, LEVEL_RAMP)); }  /* Math.round：四捨五入成整數 */
    /* 這一關地圖有幾欄 */
    function colsFor(level) { return Math.round(kit.ramp(level, COLS_START, COLS_END, LEVEL_RAMP)); }
    /* 這一關有幾條混淆岔路 */
    function decoysFor(level) { return Math.round(kit.ramp(level, DECOYS_START, DECOYS_END, LEVEL_RAMP)); }
    /* 這一關想要的路線風格（rand：亂數函式，用來決定「要不要碰邊緣」「旗子高或低」） */
    function wantFor(level, rand) {
        rand = rand || Math.random;
        return {
            turn: kit.ramp(level, TURN_START, TURN_END, LEVEL_RAMP),                 /* 轉彎數要佔步數的幾成 */
            downs: Math.round(kit.ramp(level, DOWNS_START, DOWNS_END, LEVEL_RAMP)),  /* 至少幾步往下走 */
            edge: rand() < kit.ramp(level, EDGE_P_START, EDGE_P_END, LEVEL_RAMP),    /* true＝路線要碰到左右邊緣 */
            low: rand() < kit.ramp(level, LOW_P_START, LOW_P_END, LEVEL_RAMP),       /* true＝旗子要比路線最高處還低；false＝旗子在最高處 */
            run: Math.round(kit.ramp(level, RUN_START, RUN_END, LEVEL_RAMP))         /* 最多連續直走幾步 */
        };
    }
    /* 起點的欄：最下面「正中間」。欄數是偶數時沒有正中間，取偏左那一欄；一定要是整數（V1.48.0 修正偶數欄的 bug） */
    function startCol(cols) { return Math.floor((cols - 1) / 2); }  /* Math.floor：無條件捨去成整數 */
    /* 把格子 (r,c) 轉成字串 "r,c"，當作物件的鍵（方便查某格有沒有陷阱） */
    function cellKey(r, c) { return r + ',' + c; }
    /* 兩格之間的「曼哈頓距離」：橫著走幾格＋直著走幾格（不能斜走，所以距離就是兩者相加） */
    function manhattan(r1, c1, r2, c2) { return Math.abs(r1 - r2) + Math.abs(c1 - c2); }  /* Math.abs：絕對值 */
    /* 廣度優先搜尋（BFS）：從起點出發，一圈一圈往外擴，算出每一格「最少要走幾步」才到得了；有陷阱的格子不能走，到不了的格子是 −1 */
    /* 廣度優先：從 (r0,c0) 出發，回傳每一格的最短步數 dist[r][c]（到不了＝-1）*/
    function bfs(rows, cols, start, traps) {
        var dist = [], r, c;
        for (r = 0; r < rows; r++) { dist.push([]); for (c = 0; c < cols; c++) dist[r].push(-1); }
        dist[start.r][start.c] = 0;
        /* q 是待處理的佇列：先進先出，保證先找到的是最短路 */
        var q = [[start.r, start.c]];
        for (var qi = 0; qi < q.length; qi++) {
            var cur = q[qi];
            /* 依序嘗試左、前、右、後四個方向 */
            for (var k = 0; k < DIRS.length; k++) {
                var m = DIRS[k], nr = cur[0] + MOVES[m][0], nc = cur[1] + MOVES[m][1];
                /* 越界、是陷阱、或已經算過的格子就跳過 */
                if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || traps[cellKey(nr, nc)] || dist[nr][nc] >= 0) continue;
                dist[nr][nc] = dist[cur[0]][cur[1]] + 1;
                q.push([nr, nc]);
            }
        }
        return dist;
    }
    /* 把一串動作從起點走完，回傳最後的位置 */
    function applyMoves(start, moves) {
        var r = start.r, c = start.c;
        moves.forEach(function (m) { r += MOVES[m][0]; c += MOVES[m][1]; });  /* forEach：對陣列的每個元素各做一次 */
        return { r: r, c: c };
    }
    /* 做一張 rows×cols、全部填 false 的表（open[r][c] 為 true 代表那一格是「路線或岔路」，false 就是陷阱） */
    function emptyGrid(rows, cols) {
        var g = [], r, c;
        for (r = 0; r < rows; r++) { g.push([]); for (c = 0; c < cols; c++) g[r].push(false); }
        return g;
    }
    /* 格子 (r,c) 可以變成路線（或岔路）嗎？條件：在地圖內、還不是路線、而且四周除了「剛走過來的那一格 (pr,pc)」以外，
       沒有任何一格已經是路線。這個條件就是「路線自己不碰自己」，所以不會有捷徑，也不會有第二條路。 */
    function canOpen(open, rows, cols, r, c, pr, pc) {
        if (r < 0 || r >= rows || c < 0 || c >= cols || open[r][c]) return false;
        for (var k = 0; k < DIRS.length; k++) {
            var nr = r + MOVES[DIRS[k]][0], nc = c + MOVES[DIRS[k]][1];
            if (nr === pr && nc === pc) continue;                                   /* 剛走過來的那一格當然是路線，不算 */
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && open[nr][nc]) return false;
        }
        return true;
    }
    /* 挑「路標」：一串離起點、離彼此夠遠的格子，大約每 8 步一個（1～5 個）。小人會依序往這些路標走，路線就會被拉得彎來彎去。
       路標有 55% 的機率放在最左或最右那一欄（逼路線走到邊緣再折回來），其餘隨機。 */
    function planWays(rows, cols, start, n, rand) {
        var k = Math.max(1, Math.min(5, Math.round(n / 8))), ways = [], pr = start.r, pc = start.c;
        var minDist = Math.max(3, Math.floor((rows + cols) / 4));                   /* 路標之間至少隔這麼遠 */
        for (var i = 0; i < k; i++) {
            for (var t = 0; t < 30; t++) {                                          /* 最多試 30 次找到夠遠的格子 */
                var r = kit.randInt(0, rows - 1, rand);
                var c = rand() < 0.55 ? (rand() < 0.5 ? 0 : cols - 1) : kit.randInt(0, cols - 1, rand);
                if (manhattan(r, c, pr, pc) >= minDist) { ways.push({ r: r, c: c }); pr = r; pc = c; break; }
            }
        }
        return ways;
    }
    /* 長出一條剛好 n 步的路線（深度優先搜尋＋回溯）。成功回傳 { open, cells, moves }：
       open＝格子是不是路線的表、cells＝路線經過的格子（第 0 個是起點，共 n+1 個）、moves＝每一步的方向（'L'／'F'／'R'／'B'）；
       走不出來（超過 4000 次嘗試）回傳 null。 */
    function growRoute(rows, cols, start, n, rand, ways) {
        var open = emptyGrid(rows, cols);
        open[start.r][start.c] = true;
        var cells = [{ r: start.r, c: start.c }], moves = [], budget = 4000;
        /* len＝已經走了幾步、lastM＝上一步的方向、run＝已經連續往同一個方向走幾步、wi＝目前在追第幾個路標 */
        function step(len, lastM, run, wi) {
            if (len === n) return true;                                             /* 走滿 n 步了：成功 */
            if (--budget < 0) return false;                                         /* 嘗試太多次：放棄這一條 */
            var cur = cells[len], way = ways[wi], cand = [], k;
            for (k = 0; k < DIRS.length; k++) {
                var m = DIRS[k], nr = cur.r + MOVES[m][0], nc = cur.c + MOVES[m][1];
                if (!canOpen(open, rows, cols, nr, nc, cur.r, cur.c)) continue;
                var w = 1;                                                          /* w＝這個方向被選中的「權重」（愈大愈容易被選） */
                if (m === lastM) w *= run === 1 ? 0.9 : (run === 2 ? 0.5 : (run === 3 ? 0.2 : 0.05));   /* 連續直走愈久，權重愈小 */
                if (way && manhattan(nr, nc, way.r, way.c) < manhattan(cur.r, cur.c, way.r, way.c)) w *= 4;   /* 朝路標走的方向，權重 ×4 */
                cand.push({ m: m, r: nr, c: nc, w: w });
            }
            /* 依權重隨機挑一個方向試試看；這個方向走到後面卡死了，就換下一個方向（回溯） */
            while (cand.length) {
                var total = 0, x, i = 0;
                cand.forEach(function (o) { total += o.w; });
                x = rand() * total;
                for (; i < cand.length - 1; i++) { x -= cand[i].w; if (x < 0) break; }
                var ch = cand.splice(i, 1)[0];                                      /* splice：把挑中的那個從候選名單拿出來 */
                open[ch.r][ch.c] = true; cells.push({ r: ch.r, c: ch.c }); moves.push(ch.m);
                var wi2 = way && manhattan(ch.r, ch.c, way.r, way.c) <= 1 ? wi + 1 : wi;   /* 走到路標旁邊就換下一個路標 */
                if (step(len + 1, ch.m, ch.m === lastM ? run + 1 : 1, wi2)) return true;
                open[ch.r][ch.c] = false; cells.pop(); moves.pop();                 /* 這條走不通：復原剛才那一步 */
            }
            return false;
        }
        return step(0, null, 0, 0) ? { open: open, cells: cells, moves: moves } : null;
    }
    /* 量一條路線的長相：轉彎數、往下走幾步、最長直走、旗子是不是比路線最高處還低、碰到幾個邊緣（0～2）、路線最高處的列 */
    function routeFeatures(route, cols) {
        var moves = route.moves, cells = route.cells, turns = 0, downs = 0, run = 1, maxRun = 1, minRow = 1e9, left = 0, right = 0;
        moves.forEach(function (m, i) {
            if (i && m !== moves[i - 1]) { turns++; run = 1; } else if (i) { run++; if (run > maxRun) maxRun = run; }
            if (m === 'B') downs++;
        });
        cells.forEach(function (p) { if (p.r < minRow) minRow = p.r; if (p.c === 0) left = 1; if (p.c === cols - 1) right = 1; });
        return { turns: turns, downs: downs, maxRun: maxRun, flagLow: cells[cells.length - 1].r > minRow, edges: left + right, minRow: minRow };
    }
    /* 幫一條候選路線打分數（愈高愈符合這一關想要的風格）；最後加一點隨機，讓同樣條件不會每次都挑到同一種長相 */
    function scoreRoute(f, rows, n, want, rand) {
        var s = Math.min(f.turns, Math.ceil(n * want.turn)) * 2;                    /* 轉彎數：達到目標比例就不再加分 */
        s += Math.min(f.downs, want.downs) * 1.5;                                   /* 往下走的步數：達到目標就不再加分 */
        if (want.edge) s += f.edges * 1.5;                                          /* 想要碰邊緣：碰到幾邊加幾分 */
        if (want.low === f.flagLow) s += 4;                                         /* 旗子的高低符合這一關的風格：加 4 分 */
        s += (rows - 1 - f.minRow) / (rows - 1) * 3;                                /* 路線涵蓋的列數：最高處愈靠近地圖頂端愈好 */
        s -= Math.max(0, f.maxRun - want.run) * 3;                                  /* 直走太長：每多一步扣 3 分 */
        return s + rand();
    }
    /* 產生 CANDIDATES 條候選路線，回傳分數最高的那條；全部失敗回傳 null */
    function bestRoute(rows, cols, start, n, want, rand) {
        var best = null, bestScore = -1e9;
        for (var a = 0; a < CANDIDATES; a++) {
            var route = growRoute(rows, cols, start, n, rand, planWays(rows, cols, start, n, rand));
            if (!route) continue;
            var s = scoreRoute(routeFeatures(route, cols), rows, n, want, rand);
            if (s > bestScore) { bestScore = s; best = route; }
        }
        return best;
    }
    /* 保底的蛇形路線：從起點往左橫走到最左邊，往上兩格，往右橫走到最右邊，再往上兩格……走滿 n 步（或走到地圖頂）就停。
       橫走的那幾列之間隔著一列（只有轉彎的那一格是路線），所以也是「自己不碰自己」的路線。 */
    function serpentine(rows, cols, start, n) {
        var open = emptyGrid(rows, cols), cells = [{ r: start.r, c: start.c }], moves = [], r = start.r, c = start.c, dir = -1;
        open[r][c] = true;
        function go(m) {                                                            /* 往 m 方向走一格（走滿 n 步或出界就回傳 false） */
            var nr = r + MOVES[m][0], nc = c + MOVES[m][1];
            if (moves.length >= n || nr < 0 || nr >= rows || nc < 0 || nc >= cols) return false;
            r = nr; c = nc; open[r][c] = true; cells.push({ r: r, c: c }); moves.push(m);
            return true;
        }
        while (moves.length < n) {
            while (go(dir < 0 ? 'L' : 'R')) { }                                     /* 橫走到邊緣 */
            if (moves.length >= n || !go('F') || !go('F')) break;                   /* 往上兩格（走不了就結束） */
            dir = -dir;
        }
        return { open: open, cells: cells, moves: moves };
    }
    /* 加混淆岔路：從路線的格子（不含終點）岔出去 count 條死巷子，每條長 DECOY_LEN 格，同樣不碰到其他路線格。
       budget＝岔路全部加起來最多可以佔幾格（用來守住 TRAP_MIN：陷阱要佔地圖一半以上），不傳就不限制。
       open 會被直接改（岔路的格子也標成 true）；回傳每條岔路的格子陣列（放不下的就少幾條）。 */
    function addDecoys(open, rows, cols, cells, count, rand, budget) {
        var out = [];
        budget = budget == null ? 1e9 : budget;
        for (var d = 0; d < count; d++) {
            if (budget < DECOY_LEN[0]) break;                                       /* 預算連最短的一條岔路都放不下了 */
            /* 列出所有「可以從路線上岔出去的第一格」，打亂順序，一個一個試 */
            var pairs = [], i, k;
            for (i = 0; i < cells.length - 1; i++) for (k = 0; k < DIRS.length; k++) {
                var r = cells[i].r + MOVES[DIRS[k]][0], c = cells[i].c + MOVES[DIRS[k]][1];
                if (canOpen(open, rows, cols, r, c, cells[i].r, cells[i].c)) pairs.push({ r: r, c: c });
            }
            pairs = kit.shuffle(pairs, rand);                                       /* kit.shuffle：洗牌 */
            var done = null;
            for (var pi = 0; pi < pairs.length && !done; pi++) {
                var p = pairs[pi], want = Math.min(budget, kit.randInt(DECOY_LEN[0], DECOY_LEN[1], rand)), branch = [{ r: p.r, c: p.c }];
                open[p.r][p.c] = true;
                /* 從岔路的尖端繼續往外長，直到夠長或沒地方可長 */
                while (branch.length < want) {
                    var tip = branch[branch.length - 1], next = [];
                    for (k = 0; k < DIRS.length; k++) {
                        var tr = tip.r + MOVES[DIRS[k]][0], tc = tip.c + MOVES[DIRS[k]][1];
                        if (canOpen(open, rows, cols, tr, tc, tip.r, tip.c)) next.push({ r: tr, c: tc });
                    }
                    if (!next.length) break;
                    var q = kit.pick(next, rand);
                    open[q.r][q.c] = true; branch.push(q);
                }
                if (branch.length >= DECOY_LEN[0]) done = branch;                   /* 夠長才算一條岔路 */
                else branch.forEach(function (b) { open[b.r][b.c] = false; });      /* 太短：拆掉，換下一個起點 */
            }
            if (!done) break;                                                       /* 已經放不下新的岔路了 */
            out.push(done); budget -= done.length;
        }
        return out;
    }
    /* 依「路線＋岔路」的表 open 產生陷阱：沒有被標成路線的格子全部是陷阱，每個陷阱隨機配一種圖案。
       回傳 { traps:{"r,c":true}, trapList:[[r, c, 圖案], …] } */
    function fillTraps(open, rows, cols, rand) {
        var traps = {}, list = [];
        for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
            if (open[r][c]) continue;
            traps[cellKey(r, c)] = true;
            list.push([r, c, kit.pick(TRAP_KINDS, rand)]);
        }
        return { traps: traps, trapList: list };
    }
    /* 依指定的大小與步數出一關（makeLevel 會依關卡算好這些數字再呼叫它；測試也直接呼叫它檢查各種大小，包括偶數欄）。
       回傳 { rows, cols, start, target, traps:{key:true}, trapList:[[r,c,圖案]…], steps, path:['F','L'…], cells, decoys, dist } */
    function buildLevel(rows, cols, n, nDecoys, want, rand) {
        rand = rand || Math.random;
        var start = { r: rows - 1, c: startCol(cols) };
        var route = bestRoute(rows, cols, start, n, want, rand) || serpentine(rows, cols, start, n);
        var room = function (rt) { return Math.floor(rows * cols * (1 - TRAP_MIN)) - rt.cells.length; };   /* 岔路最多能佔幾格：開放的格子（路線＋岔路）不能超過地圖的 (1 − TRAP_MIN) */
        var decoys = addDecoys(route.open, rows, cols, route.cells, nDecoys, rand, room(route));
        var T = fillTraps(route.open, rows, cols, rand);
        var target = route.cells[route.cells.length - 1], dist = bfs(rows, cols, start, T.traps);
        /* 保險檢查：最短步數一定要等於路線長度（路線自己不碰自己，理論上一定成立）；萬一不成立，換保底的蛇形路線 */
        if (dist[target.r][target.c] !== route.moves.length) {
            route = serpentine(rows, cols, start, n);
            decoys = addDecoys(route.open, rows, cols, route.cells, nDecoys, rand, room(route));
            T = fillTraps(route.open, rows, cols, rand);
            target = route.cells[route.cells.length - 1]; dist = bfs(rows, cols, start, T.traps);
        }
        return { rows: rows, cols: cols, start: start, target: target, traps: T.traps, trapList: T.trapList, steps: route.moves.length, path: route.moves, cells: route.cells, decoys: decoys, dist: dist };
    }
    /* 出一關：依關卡算出地圖大小、步數、岔路數與路線風格，再產生 */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        return buildLevel(rowsFor(level), colsFor(level), stepsWanted(level), decoysFor(level), wantFor(level, rand), rand);
    }

    /* 走一步（按鈕與手指拖曳共用）：trail＝小人從起點走到現在經過的格子（第 0 個是起點），remain＝剩幾步。
       走到「上一格」＝撤銷最後一步（trail 少一格、remain 加 1）；走到別的格子＝往前一步（trail 多一格、remain 減 1）；
       往前但 remain 已經是 0 → 不能走。回傳 { kind: 'undo'／'step'／null（不能走）, trail, remain }，不會改到傳進來的陣列。 */
    function stepTrail(trail, remain, r, c) {
        var n = trail.length, prev = n >= 2 ? trail[n - 2] : null;
        if (prev && prev.r === r && prev.c === c) return { kind: 'undo', trail: trail.slice(0, n - 1), remain: remain + 1 };   /* slice：複製一段陣列 */
        if (remain <= 0) return { kind: null, trail: trail, remain: remain };
        return { kind: 'step', trail: trail.concat([{ r: r, c: c }]), remain: remain - 1 };                                      /* concat：把兩個陣列接起來（回傳新陣列） */
    }
    /* 判定這條路線（trail）：經過陷阱 → 'trap'（hits 是踩到的陷阱的 "r,c"）；沒踩陷阱而且步數用完（用掉的步數＝steps）→ 站在旗子上 'win'、否則 'lose'；
       沒踩陷阱、步數也還沒用完 → 'continue'（還可以繼續走）。 */
    function judgeTrail(trail, traps, target, steps) {
        var hits = [];
        trail.forEach(function (p) { var k = cellKey(p.r, p.c); if (traps[k] && hits.indexOf(k) < 0) hits.push(k); });   /* indexOf：找出元素在陣列的位置（找不到是 -1） */
        if (hits.length) return { result: 'trap', hits: hits };
        var last = trail[trail.length - 1];
        if (trail.length - 1 >= steps) return { result: last.r === target.r && last.c === target.c ? 'win' : 'lose', hits: hits };
        return { result: 'continue', hits: hits };
    }
    /* 手指拖曳時，小人下一步要走去哪一格：手指在 (px,py)（地圖單位，一格＝cell 單位），小人在 pos 這一格。
       手指超過小人所在格中心 DRAG_T 格，小人就往那個方向走一格（橫向、直向哪個差得多就走哪個）；沒超過、或那一格在地圖外 → null（不動）。
       呼叫的地方會重複呼叫直到回傳 null，手指移動很快時小人也會一格一格追上去。 */
    function nextCell(pos, px, py, cell, rows, cols) {
        var dx = px - (pos.c + 0.5) * cell, dy = py - (pos.r + 0.5) * cell;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_T * cell) return null;
        var r = pos.r, c = pos.c;
        if (Math.abs(dx) >= Math.abs(dy)) c += dx > 0 ? 1 : -1; else r += dy > 0 ? 1 : -1;
        return r < 0 || r >= rows || c < 0 || c >= cols ? null : { r: r, c: c };
    }

    /* 畫小人（圓頭 + 圓角身體） */
    /* 圖示 */
    function drawMan(g) {
        kit.svg('circle', { cx: 0, cy: -16, r: 11, fill: 'hsl(28,62%,80%)', stroke: 'hsl(24,40%,22%)', 'stroke-width': 3 }, g);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        kit.svg('rect', { x: -12, y: -5, width: 24, height: 26, rx: 8, fill: 'hsl(210,62%,52%)', stroke: 'hsl(24,40%,22%)', 'stroke-width': 3 }, g);
    }
    /* 畫一個陷阱：g 是這個陷阱的群組（座標原點在格子正中央，格子的邊長是 64 單位，所以圖案要畫在 ±28 以內）。
       顏色都寫在 css/games/reaction_followme.css（class 名稱 followme-t-<圖案>__<部位>），這裡只決定形狀。 */
    function drawTrap(kind, g) {
        function el(tag, cls, attrs) { attrs = attrs || {}; attrs['class'] = cls; return kit.svg(tag, attrs, g); }   /* 小幫手：建立元素並設定 class */
        if (kind === 'fire') {
            /* 火焰：底下一圈焦黑的灰燼、外焰（橘）、內焰（黃） */
            el('ellipse', 'followme-t-fire__base', { cx: 0, cy: 23, rx: 21, ry: 6 });
            el('path', 'followme-t-fire__out', { d: 'M2,-27 C4,-15 20,-9 20,8 C20,19 11,26 0,26 C-11,26 -20,19 -20,8 C-20,0 -15,-5 -11,-12 C-9,-6 -6,-3 -3,-3 C-4,-13 -1,-21 2,-27 Z' });
            el('path', 'followme-t-fire__in', { d: 'M0,4 C3,10 9,12 9,18 C9,22.5 5,25 0,25 C-5,25 -9,22.5 -9,18 C-9,13 -4,10 0,4 Z' });
        } else if (kind === 'pit') {
            /* 地洞：土色的洞緣、黑黑的洞、洞緣上一道反光 */
            el('ellipse', 'followme-t-pit__rim', { cx: 0, cy: 3, rx: 27, ry: 21 });
            el('ellipse', 'followme-t-pit__hole', { cx: 0, cy: 5, rx: 19, ry: 13 });
            el('path', 'followme-t-pit__glint', { d: 'M-17,0 Q-12,-8 -2,-9' });
        } else if (kind === 'bomb') {
            /* 炸彈：黑色圓球、反光、頂端的蓋子、彎彎的引線、引線尖端的火花（五角星） */
            el('circle', 'followme-t-bomb__body', { cx: 0, cy: 7, r: 19 });
            el('ellipse', 'followme-t-bomb__glint', { cx: -7, cy: 1, rx: 5, ry: 3.5, transform: 'rotate(-30 -7 1)' });
            el('rect', 'followme-t-bomb__cap', { x: -6, y: -14, width: 12, height: 7, rx: 2 });
            el('path', 'followme-t-bomb__fuse', { d: 'M0,-14 Q4,-21 11,-20' });
            el('polygon', 'followme-t-bomb__spark', { points: '12,-28 14,-22 20,-21 15,-18 17,-12 12,-16 7,-12 9,-18 4,-21 10,-22' });
        } else if (kind === 'water') {
            /* 水坑：藍色的水面、兩道波紋 */
            el('ellipse', 'followme-t-water__pool', { cx: 0, cy: 4, rx: 27, ry: 19 });
            el('path', 'followme-t-water__ripple', { d: 'M-17,0 q4,-4 8,0 t8,0 t8,0' });
            el('path', 'followme-t-water__ripple', { d: 'M-9,11 q4,-4 8,0 t8,0' });
        } else {
            /* 尖刺（原本的圖案）：橘色圓角方塊、三根白色尖刺 */
            el('rect', 'followme-t-spike__tile', { x: -27, y: -27, width: 54, height: 54, rx: 6 });
            [-1, 0, 1].forEach(function (k) { var x = k * 16; el('polygon', 'followme-t-spike__spike', { points: (x - 7) + ',14 ' + x + ',-13 ' + (x + 7) + ',14' }); });
        }
        /* 踩到的那個陷阱會亮出一圈紅框（平常看不見，CSS 的 followme-trap--hit 才讓它出現） */
        el('circle', 'followme-trap__hit', { cx: 0, cy: 0, r: 30 });
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        var R = null;

        /* startAt：從第幾關開始（失敗後可從前 5 關繼續）*/
        /* round：開一局 */
        function round(startAt) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';                        /* innerHTML = ''：把元素裡面的東西全部清掉 */
            root.classList.add('followme-screen');      /* V1.49.0：加一個 class，讓標題、提示列、按鈕的上下空隙縮小（樣式在 css/games/reaction_followme.css）；離開遊戲時拿掉 */
            my.onDispose(function () { root.classList.remove('followme-screen'); });

            /* level 關卡；cleared 已過幾關；state 目前階段（demo 示範中/play 玩家走/end 結束）；L 這關的資料；pos 玩家目前位置；remain 剩餘步數；CELL 一格的大小 */
            var level = startAt || 1, cleared = level - 1, newRec = false, state = 'idle', lvId = 0, L = null, pos = null, remain = 0, CELL = 40;
            /* trail 玩家走過的格子（從起點到現在，pos 就是最後一格）；dragging 手指是不是正按著小人在拖；dragId 那根手指的編號；grab 手指按下去時離小人中心多遠；dragMoved 這一次拖曳小人走了幾步 */
            var trail = [], dragging = false, dragId = null, grab = null, dragMoved = 0, countFs = 0;
            /* 建立畫面元素：標題、提示、地圖、四顆方向鈕 */
            var head = h('div', { 'class': 'followme-head' });
            var banner = h('div', { 'class': 'followme-banner' });
            var field = h('div', { 'class': 'followme-field' });
            var bL = h('button', { 'class': 'btn btn--sky followme-btn', text: '◀ 左方' });
            var bF = h('button', { 'class': 'btn btn--go followme-btn', text: '▲ 前進' });
            var bB = h('button', { 'class': 'btn btn--go followme-btn', text: '▼ 後退' });
            var bR = h('button', { 'class': 'btn btn--sky followme-btn', text: '右方 ▶' });
            var btns = h('div', { 'class': 'followme-btns' }, [bL, bF, bB, bR]);
            [head, banner, field, btns].forEach(function (n) { root.appendChild(n); });  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
            var svg = null, man = null, flag = null, trapEls = {}, trailEl = null, countEl = null;

            function meta() { ctx.setMeta(kit.meta(['第 ' + level + ' 關'])); }
            /* 移動小人到第 r 列、c 欄；animate 為 true＝用示範的速度做平滑移動、是數字＝用那麼多毫秒、false＝馬上到（CSS transition） */
            function setMan(r, c, animate) {
                var ms = animate === true ? DEMO_STEP_MS * 0.8 : (animate || 0);
                man.style.transition = ms ? 'transform ' + ms + 'ms linear' : 'none';
                man.style.transform = 'translate(' + ((c + 0.5) * CELL) + 'px,' + ((r + 0.62) * CELL) + 'px)';
            }

            /* 畫整張地圖：用 SVG 的 viewBox 縮放到欄位大小，格子單位固定 64 */
            function build() {
                if (svg && svg.parentNode) svg.parentNode.removeChild(svg);
                CELL = 64;                       /* 地圖用固定的「格子單位」畫，整張 SVG 再用 viewBox 縮放到欄位大小（drawTrap 的圖案也是照 64 單位畫的） */
                var W = CELL * L.cols, H = CELL * L.rows;
                svg = kit.svg('svg', { 'class': 'followme-svg', viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'xMidYMid meet' }, field);
                /* 棋盤格：奇偶格兩種底色交錯 */
                for (var r = 0; r < L.rows; r++) for (var c = 0; c < L.cols; c++) {
                    kit.svg('rect', { 'class': 'followme-cell followme-cell--' + ((r + c) % 2), x: c * CELL, y: r * CELL, width: CELL, height: CELL }, svg);
                }
                /* 玩家走過的路線（藍色粗線，一格一格連起來）：畫在棋盤格上面、陷阱下面；點的座標在 drawTrail 設定 */
                trailEl = kit.svg('polyline', { 'class': 'followme-trail', points: '' }, svg);
                trapEls = {};
                /* 畫陷阱：每個陷阱是一個群組（依圖案種類畫不同的形狀），存進 trapEls 方便之後一起隱藏／顯示 */
                L.trapList.forEach(function (t) {
                    var g = kit.svg('g', { 'class': 'followme-trap', transform: 'translate(' + ((t[1] + 0.5) * CELL) + ' ' + ((t[0] + 0.5) * CELL) + ')' }, svg);
                    drawTrap(t[2], g);
                    trapEls[cellKey(t[0], t[1])] = g;
                });
                /* 一開始顯示陷阱（示範階段玩家要看） */
                showTraps(true);
                var s = kit.svg('text', { 'class': 'followme-startlbl', x: (L.start.c + 0.5) * CELL, y: (L.start.r + 0.94) * CELL, 'text-anchor': 'middle' }, svg);
                s.textContent = '起點';                   /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
                /* 旗子（紅色）：用 opacity 控制顯示（0＝隱藏） */
                flag = kit.svg('g', { 'class': 'followme-flag', transform: 'translate(' + ((L.target.c + 0.5) * CELL) + ' ' + ((L.target.r + 0.5) * CELL) + ')', opacity: 0 }, svg);
                kit.svg('line', { x1: -CELL * 0.18, y1: CELL * 0.42, x2: -CELL * 0.18, y2: -CELL * 0.4, 'class': 'followme-flag__pole' }, flag);
                kit.svg('polygon', { points: (-CELL * 0.18) + ',' + (-CELL * 0.4) + ' ' + (CELL * 0.4) + ',' + (-CELL * 0.2) + ' ' + (-CELL * 0.18) + ',' + (CELL * 0.02), 'class': 'followme-flag__cloth' }, flag);
                man = kit.svg('g', { 'class': 'followme-man' }, svg);
                man.style.transformBox = 'view-box';
                drawMan(man);
                setMan(L.start.r, L.start.c, false);
            }

            /* 把 trail（玩家走過的格子）畫成一條線：每一格的中心連起來 */
            function drawTrail() {
                trailEl.setAttribute('points', trail.map(function (p) { return ((p.c + 0.5) * CELL) + ',' + ((p.r + 0.5) * CELL); }).join(' '));
            }
            /* 倒數數字（疊在地圖上面，示範完停 3 秒給玩家記住）：數字寬度＝遊戲畫面寬度的 COUNT_W；
               畫法：① 先畫一圈粗白線的數字（edge），再用遮罩把數字本身挖掉，只留外面那一圈白框；② 再畫黑色 25% 透明的數字（fill）疊在中間，看得到後面的地圖。 */
            function showCount(n) {
                hideCount();
                var W = field.clientWidth, H = field.clientHeight;                 /* clientWidth／clientHeight：版面上的大小（不受舞台縮放影響） */
                countEl = kit.svg('svg', { 'class': 'followme-count', viewBox: '0 0 ' + W + ' ' + H }, field);
                var mask = kit.svg('mask', { id: 'followme-count-mask', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H }, kit.svg('defs', {}, countEl));
                kit.svg('rect', { 'class': 'followme-count__show', x: 0, y: 0, width: W, height: H }, mask);       /* 遮罩：白色的地方看得到… */
                function txt(cls, parent) { var t = kit.svg('text', { 'class': cls, x: W / 2, y: H / 2, dy: '0.36em', 'text-anchor': 'middle' }, parent); t.textContent = String(n); return t; }
                txt('followme-count__cut', mask);                                                                   /* …數字本身是黑色，被挖掉 */
                var edge = txt('followme-count__edge', countEl), fill = txt('followme-count__fill', countEl);
                edge.setAttribute('mask', 'url(#followme-count-mask)');
                /* 字級：讓數字「墨水的寬度」剛好是畫面寬度的 COUNT_W。用 canvas 量一個「3」在 100 px 字級下有多寬，再照比例換算（只量一次） */
                if (!countFs) {
                    var ratio = 0.6;                                                /* 量不到時的保底：粗體數字的寬約 0.6 個字高 */
                    try {
                        var cs = getComputedStyle(fill), c2 = document.createElement('canvas').getContext('2d'), m;
                        c2.font = cs.fontWeight + ' 100px ' + cs.fontFamily; m = c2.measureText('3');
                        var ink = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
                        if (ink > 20) ratio = ink / 100;
                    } catch (e) { }
                    countFs = root.clientWidth * COUNT_W / ratio;
                }
                [edge, fill].concat([].slice.call(mask.querySelectorAll('text'))).forEach(function (t) { t.setAttribute('font-size', countFs); });
                edge.setAttribute('stroke-width', countFs * 0.1);                   /* 白框的粗細（被挖掉一半，看得到的是外面那一半，約字高的 5%） */
            }
            /* 拿掉倒數數字 */
            function hideCount() { if (countEl && countEl.parentNode) countEl.parentNode.removeChild(countEl); countEl = null; }
            /* 顯示／隱藏所有陷阱 */
            function showTraps(on) { Object.keys(trapEls).forEach(function (k) { trapEls[k].setAttribute('opacity', on ? 1 : 0); }); }  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
            /* 啟用／停用四顆按鈕 */
            function setButtons(on) { [bL, bF, bB, bR].forEach(function (b) { b.disabled = !on; }); }
            /* 更新標題文字 */
            function paintHead() {
                head.textContent = state === 'play' ? '剩餘步數 ' + remain + ' ／ ' + L.steps : '第 ' + level + ' 關　要走 ' + L.steps + ' 步';
            }

            /* 開始一關 */
            function startLevel() {
                if (my.dead) return;
                var id = ++lvId;
                /* 產生這關的地圖 */
                L = makeLevel(level);
                pos = { r: L.start.r, c: L.start.c };
                trail = [pos];
                remain = L.steps;
                hideCount();
                build();
                drawTrail();
                state = 'demo'; setButtons(false); paintHead(); meta();
                banner.textContent = '記住小人走過的路線與陷阱的位置';
                /* 主控台印出這關的實際資料（地圖大小、陷阱數、岔路數、步數、終點、示範路線） */
                try { console.info('[照著走] 第 ' + level + ' 關：' + L.rows + '×' + L.cols + '、陷阱 ' + L.trapList.length + ' 個、岔路 ' + L.decoys.length + ' 條、要走 ' + L.steps + ' 步；終點 (列' + L.target.r + ',欄' + L.target.c + ')；示範 ' + L.path.map(function (m) { return MOVE_NAME[m]; }).join('→')); } catch (e) { }  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
                /* 示範階段顯示旗子 */
                flag.setAttribute('opacity', 1);
                /* 依序排每一步的動畫：每隔 DEMO_STEP_MS 毫秒小人走一格 */
                var t = DEMO_LEAD_MS, r = L.start.r, c = L.start.c;
                L.path.forEach(function (m) {
                    r += MOVES[m][0]; c += MOVES[m][1];
                    var rr = r, cc = c;
                    my.after(t, function () { if (id !== lvId) return; setMan(rr, cc, true); Sfx.play('tick'); });  /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
                    t += DEMO_STEP_MS;
                });
                /* 示範走完：畫面先停 COUNT_N 秒讓玩家記住（旗子、陷阱都還在），中間疊著大大的 3、2、1（每個數字停 COUNT_MS 毫秒）。
                   t 現在是「最後一步走完」的時間點 */
                for (var i = 0; i < COUNT_N; i++) (function (n) {
                    my.after(t + i * COUNT_MS, function () { if (id !== lvId) return; showCount(n); Sfx.play('tick'); });
                })(COUNT_N - i);
                /* 倒數完：旗子和陷阱都隱藏，小人回到起點 */
                my.after(t + COUNT_N * COUNT_MS, function () {
                    if (id !== lvId) return;
                    hideCount();
                    flag.setAttribute('opacity', 0);
                    showTraps(false);                      /* 倒數完：旗子和陷阱都消失，只剩玩家的記憶 */
                    setMan(L.start.r, L.start.c, true);
                });
                /* 再等一下才進入玩家操作階段，啟用按鈕 */
                my.after(t + COUNT_N * COUNT_MS + DEMO_STEP_MS, function () {
                    if (id !== lvId) return;
                    state = 'play'; setButtons(true); paintHead();
                    banner.textContent = '換你走！拖曳小人或按按鈕';
                    Sfx.play('go');
                });
            }

            /* 等小人走到格子正中央（setMan 的 CSS 移動動畫播完）才呼叫 fn。
               主要靠 transitionend 事件；保底計時器（動畫時間＋150 毫秒）防止事件沒有觸發（例如分頁在背景），兩者只會有一個真的執行 */
            function whenArrived(fn) {
                var done = false;
                function go() { if (done) return; done = true; man.removeEventListener('transitionend', onEnd); fn(); }
                function onEnd(e) { if (e.propertyName === 'transform') go(); }
                man.addEventListener('transitionend', onEnd);
                my.after(DEMO_STEP_MS * 0.8 + 150, go);
            }

            /* 玩家按了方向鈕 m */
            function press(m) {
                if (state !== 'play' || dragging) return;
                var nr = pos.r + MOVES[m][0], nc = pos.c + MOVES[m][1];
                /* 走出地圖外：沒作用也不扣步數 */
                if (nr < 0 || nr >= L.rows || nc < 0 || nc >= L.cols) { Sfx.play('click'); banner.textContent = '那邊是地圖外面'; return; }
                var s = stepTrail(trail, remain, nr, nc);                          /* 走回上一格＝撤銷、否則往前一步（見 stepTrail） */
                if (!s.kind) return;
                trail = s.trail; remain = s.remain; pos = trail[trail.length - 1];
                setMan(nr, nc, true); drawTrail(); paintHead();
                if (s.kind === 'undo') { Sfx.play('click'); return; }
                /* 按鈕是「每一步立刻判定」：踩到陷阱、或這是最後一步（步數用完）→ 這一步會決定結果。先把按鈕鎖住，
                   等小人真的走到這一格的正中央才揭曉（最後一步：站在終點才算成功） */
                var j = judgeTrail(trail, L.traps, L.target, L.steps);
                if (j.result !== 'continue') {
                    state = 'moving'; setButtons(false);
                    whenArrived(function () { settle(j); });
                    return;
                }
                Sfx.play('click');
            }
            /* 判定結果 j（judgeTrail 的回傳）揭曉：踩到陷阱／步數用完沒到旗子 → 失敗；站在旗子上步數剛好用完 → 過關 */
            function settle(j) { finish(j.result === 'win', j.result === 'trap' ? 'trap' : 'steps', j.hits); }

            /* 一關結束：顯示旗子與全部陷阱（呼叫的時候小人已經站在格子正中央） */
            function finish(ok, why, hits) {
                if (state !== 'play' && state !== 'moving') return;
                state = 'end'; setButtons(false);
                flag.setAttribute('opacity', 1);
                showTraps(true);                           /* 結束：陷阱的位置全部亮出來 */
                paintHead();
                if (ok) {
                    cleared = level;
                    if (Reaction.setBest(ID, cleared, function (v, b) { return v > b; })) newRec = true;  /* Reaction.getBest／setBest：讀／寫這款遊戲的個人最佳紀錄（存在手機的 localStorage） */
                    banner.textContent = '到了！過關！';
                    Sfx.play('win');
                    level++;
                    meta();
                    my.after(NEXT_MS, startLevel);
                    return;
                }
                Sfx.play('bad');
                if (why === 'trap') (hits || []).forEach(function (k) { var tg = trapEls[k]; if (tg) tg.classList.add('followme-trap--hit'); });  /* 踩到的陷阱（拖曳時可能一路踩了好幾個）都亮紅框；classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
                banner.textContent = why === 'trap' ? '踩到陷阱了！' : '步數用完了，旗子在這裡';
                my.after(1900, function () {
                    var back = kit.resumeFrom(level);
                    kit.result(root, {                  /* kit.result：顯示結算卡片（成績、評語、再玩一次…），並自動記最佳紀錄、送世界排行榜 */
                        score: cleared,        /* 世界排行榜成績（跟 setBest 存的同一個數字） */
                        num: cleared + ' 關', label: cleared >= 8 ? '記路高手！' : (cleared >= 4 ? '方向感不錯！' : '再試一次，會更穩！'),
                        lines: ['第 ' + level + ' 關：' + (why === 'trap' ? '走進了陷阱格' : '步數用完沒到終點'), '要走 ' + L.steps + ' 步，陷阱 ' + L.trapList.length + ' 個'],
                        isNew: newRec, sfx: cleared >= 5 ? 'win' : 'fail', onAgain: function () { round(1); },
                        resume: { level: back, run: function () { round(back); } }
                    });
                });
            }
            /* 四顆方向鈕：pointerdown 一碰就觸發 */
            bL.addEventListener('pointerdown', function (e) { e.preventDefault(); press('L'); });  /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
            bF.addEventListener('pointerdown', function (e) { e.preventDefault(); press('F'); });  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
            bB.addEventListener('pointerdown', function (e) { e.preventDefault(); press('B'); });
            bR.addEventListener('pointerdown', function (e) { e.preventDefault(); press('R'); });

            /* ═══ 手指拖曳小人（V1.49.0）═══ */
            /* 事件座標換成「地圖單位」（一格＝CELL 單位）：先換成舞台裡的邏輯座標（kit.localPt，舞台縮放也準），再扣掉 SVG 用 viewBox「meet」置中時留下的空白、除以縮放比例 */
            function mapPt(e) {
                var r = svg.getBoundingClientRect(), a = Stage.toLogical(r.left, r.top), b = Stage.toLogical(r.right, r.bottom), p = kit.localPt(e, svg);
                var w = b.x - a.x, hh = b.y - a.y, W = CELL * L.cols, H = CELL * L.rows, s = Math.min(w / W, hh / H);
                return { x: (p.x - (w - W * s) / 2) / s, y: (p.y - (hh - H * s) / 2) / s };
            }
            /* 手指按下：離小人 GRAB_CELLS 格以內才算抓到；記下手指離小人中心多遠（grab），之後小人保持被抓住的那個點，不會跳到手指底下 */
            field.addEventListener('pointerdown', function (e) {
                if (state !== 'play' || dragging || !svg) return;
                var p = mapPt(e), cx = (pos.c + 0.5) * CELL, cy = (pos.r + 0.5) * CELL;
                if (Math.sqrt((p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy)) > GRAB_CELLS * CELL) return;   /* Math.sqrt：開根號（兩點的距離） */
                e.preventDefault();
                dragging = true; dragId = e.pointerId; dragMoved = 0; grab = { x: p.x - cx, y: p.y - cy };
                try { field.setPointerCapture(e.pointerId); } catch (err) { }      /* setPointerCapture：手指移出欄位外還是繼續收得到事件 */
                banner.textContent = '放開手指才會判定';
            });
            /* 手指移動：小人一格一格追上手指（nextCell 一次只走一格，手指移很快就重複呼叫）。拖曳過程只畫路線、不判定對錯 */
            field.addEventListener('pointermove', function (e) {
                if (!dragging || e.pointerId !== dragId) return;
                e.preventDefault();
                var p = mapPt(e);
                for (var guard = 0; guard < 40; guard++) {
                    var nx = nextCell(pos, p.x - grab.x, p.y - grab.y, CELL, L.rows, L.cols);
                    if (!nx) break;
                    var s = stepTrail(trail, remain, nx.r, nx.c);
                    if (!s.kind) break;                                             /* 步數用完了：不能再往前（還是可以往回退） */
                    trail = s.trail; remain = s.remain; pos = trail[trail.length - 1]; dragMoved++;
                    setMan(pos.r, pos.c, DRAG_MS); drawTrail(); paintHead();
                    if (s.kind === 'step') Sfx.play('click');
                }
            });
            /* 手指離開螢幕（或被系統取消）：現在才判定。還沒到旗子又沒踩陷阱 → 回到 'play'，可以再按住小人繼續拖 */
            function endDrag(e) {
                if (!dragging || e.pointerId !== dragId) return;
                dragging = false; dragId = null;
                try { field.releasePointerCapture(e.pointerId); } catch (err) { }
                var j = judgeTrail(trail, L.traps, L.target, L.steps);
                if (j.result === 'continue') { banner.textContent = dragMoved ? '還沒到旗子，按住小人再拖' : '按住小人拖曳，或按按鈕'; return; }
                state = 'moving'; setButtons(false);
                my.after(DRAG_MS + 80, function () { settle(j); });                 /* 等小人走到最後那一格的正中央再揭曉 */
            }
            field.addEventListener('pointerup', endDrag);
            field.addEventListener('pointercancel', endDrag);
            field.addEventListener('contextmenu', function (e) { e.preventDefault(); });   /* 手指長按不要跳出選單 */

            /* G.debug：測試用後門，play() 可以依示範路線一次按完 */
            G.debug = {
                state: function () { return { level: level, state: state, remain: remain, pos: pos, trail: trail.slice(), dragging: dragging, L: L, cleared: cleared, flagShown: flag.getAttribute('opacity') === '1', trapsShown: Object.keys(trapEls).some(function (k) { return trapEls[k].getAttribute('opacity') === '1'; }) }; },  /* some：陣列裡「只要有一個」元素符合條件就回傳 true */
                press: press,
                waitPlay: function () { return state; },
                /* 依示範路線（或自訂走法）按完（最後一步之後 state 是 'moving'，小人走到定位才變成 'end'） */
                play: function (moves) { (moves || L.path).forEach(function (m) { press(m); }); return state; }
            };
            /* 開場等 300 毫秒再開始第一關 */
            my.after(300, startLevel);
        }

        /* V1.34.0：從「個人最佳關卡 − 5」開始（沒玩過就是第 1 關），見 kit.enter（reaction_kit.js） */

        kit.enter(ID, round);
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '照著走',
        rule: '先看小人示範走到有旗子的地方，**要記住彎來彎去的路線和陷阱的位置**。3 秒倒數後，旗子和陷阱都消失，小人回到起點。用「左方、前進、後退、右方」按鈕走，或用手指拖著小人畫路線（放開手指才判定），步數要跟示範一樣。不要踩到陷阱，**步數用完要站在剛才的終點**！',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式給 Node 自動測試 */
        test: {
            stepsWanted: stepsWanted, rowsFor: rowsFor, colsFor: colsFor, decoysFor: decoysFor, wantFor: wantFor, startCol: startCol,
            bfs: bfs, applyMoves: applyMoves, canOpen: canOpen, growRoute: growRoute, planWays: planWays, routeFeatures: routeFeatures, bestRoute: bestRoute,
            serpentine: serpentine, addDecoys: addDecoys, fillTraps: fillTraps, buildLevel: buildLevel, makeLevel: makeLevel, cellKey: cellKey,
            stepTrail: stepTrail, judgeTrail: judgeTrail, nextCell: nextCell, DRAG_T: DRAG_T, COUNT_N: COUNT_N, COUNT_MS: COUNT_MS, COUNT_W: COUNT_W,
            MOVES: MOVES, DIRS: DIRS, TRAP_KINDS: TRAP_KINDS, LEVEL_RAMP: LEVEL_RAMP, DECOY_LEN: DECOY_LEN, TRAP_MIN: TRAP_MIN, ROWS_END: ROWS_END, COLS_END: COLS_END
        }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();
