/* ═══════════════════════════════════════════════════════════════════
   reaction_hexcolor.js — 秒反應・六角著色（由參數測試版 hexcolor_test.html 的研究結果做成的闖關遊戲）
   樣式：css/games/reaction_hexcolor.css（class 一律以「hexcolor-」開頭）
   共用：js/hexcolor_core.js（長形狀 makeShape、建鄰居表 buildGraph；測試版也用同一份）
   研究筆記：note/六角著色難度研究.md（第 9 節是這款遊戲的參數規劃）
   ───────────────────────────────────────────────────────────────────
   · 玩法：六角形格子塗顏色，**相鄰的兩格不可以同色**，而且每種顏色**剛好要用完**下面寫的格數。
     先點下面的顏色、再點格子塗上去；選「收回」再點格子，把顏色拿掉。有些格子一開始就塗好了（預填，裡面有一圈線，不能改）。
     **長按格子**跳出記號彈窗：「?」「X」或「可能的顏色組合」（兩色、三色），只是給自己看的參考，不影響過關。
     某個空格的六個鄰居已經用到所有顏色時，那格變成暗紅底＋白色「！」（放什麼都會出錯）。
     全部塗滿、沒有相鄰同色就過關（各色格數剛好用完是自然的結果）；每一關限時，時間到＝失敗並亮出答案。成績＝解開幾關。
   · 關卡規劃（研究結論見筆記；每一項都是線性，見 specFor）：
       ① 第 1～3 關「三色入門」：3 色、形狀實心（緊密 3）。3 色時每個小三角形一定三色都有，
          所以「同一排隔兩格的格子一定同色」（剛體），一格決定就整片連鎖，教玩家看懂鄰居的規則。
       ② 第 4 關起 4 色：格數 30 → 75、緊密度 2 → 3、最少那色的比例（破格率）25%（四色一樣多）→ 15%（第 20 關到頂）。
          研究發現「破格率 10～20%」最難（倒 U 型），所以最後停在 15%（大約 2:2:2:1）。
       ③ 第 4～11 關「自由擺」：答案不只一種，塗得出任何一種合格的就過關；預填 30% → 20%（挑陷阱分數高的位置）。
          （原本想用「最多允許幾種解」當旋鈕，實測行不通：解太多時根本數不完，預填數其實是被搜尋上限決定的，見筆記第 9 節。）
       ④ 第 12 關起唯一解：先找出「剛好唯一」需要的最少預填，再多送幾格暖身（第 12 關 3 格 → 第 30 關 0 格）。
          研究發現「預填越少越難」是最穩定的規則（多 1 格約打 7 折），位置的口訣效果都很弱。
   · 出題流程（makeLevel）：
       1. 長形狀：同一組參數長 SHAPE_TRIES 個，挑「六角形畫得最大」的那個（盤面比較好點）。
       2. 隱藏答案：3 色＝隨機合法著色（實心形狀幾乎只有一種塗法，各色格數直接從答案數出來）；
          4 色＝依比例算好各色格數，用解題器找一個「剛好符合格數」的合法著色。
       3. 預填（唯一解的關卡）：從空盤開始數解（最多數到 2 種）；還有第二種解，就找一個「另一種解」跟答案不一樣的格子，
          把答案的顏色填進去（每填一格都會讓那種解消失）。有好幾格可以選時，用 trapScore 挑「最會讓人卡住」的：
            · 兩格同色時，避開「隔一格」的位置（例如一排的第 1、3 格）——人習慣把同色隔一格擺，那樣等於幫玩家；
              改放在第 1、4 格或第 1、6 格（使用者的觀察），讓「隔一格擺」的習慣行不通；
            · 兩格不同色、中間隔一格（例如第 3 格黃、第 5 格藍）：夾住中間那格，玩家要先想中間六格怎麼放。
          自由擺的關卡不用數解：直接從答案挑 fill 格陷阱分數最高的當預填。
       4. 再把多餘的預填拿掉（先拿陷阱分數最低的），每拿一格都重新確認仍是唯一解；
          這一步最花時間，所以有節點預算 MIN_BUDGET，超過就停（題目只會稍微簡單一點，仍然唯一解）。
       5. 依關卡多送 extra 格暖身（隨機挑）。
     每一次「確認解數」都是完整搜尋（沒有中途放棄）才算數，所以「唯一解」是保證，不是猜的。
   · 解題器（makeEngine）：每格記「還能用哪些顏色」，規則①相鄰排除、只剩一色就填；規則②某色用完、某色的候選格剛好等於剩下的格數。
     推不動就挑候選最少的格子試（回溯）。各色的候選格數用「增量」維護（不用每次重數），手機上出題才夠快。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'hexcolor'：選單、成績、存檔都靠它；樣式在 css/games/reaction_hexcolor.css，裡面的 class 名稱一律以 hexcolor- 開頭。 */
    'use strict';

    var ID = 'hexcolor';                                /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var MAX_LEVEL = 30;                                 /* 最後一關：過了第 30 關就算全破（也是成績的上限） */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: MAX_LEVEL };  /* 成績規格：better（max＝越大越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */
    var Core = window.HexColorCore;                     /* 共用的形狀產生器（js/hexcolor_core.js，boot.js 會比這個檔案先載入） */
    var SQRT3 = Math.sqrt(3);                           /* √3：六角形的寬是半徑的 √3 倍 */

    /* ═══ 可以自己調的參數（難度曲線都是線性：kit.ramp 從起點走到終點，之後維持）═══ */
    var K3_TO = 3;                                      /* 第 1～3 關是「三色入門」；第 4 關起 4 色 */
    var FREE_TO = 11;                                   /* 第 4～11 關「自由擺」：答案不只一種，塗得出任何一種合格的就過關；第 12 關起答案只有一種（唯一解） */
    var N3 = [19, 31];                                  /* 三色入門的格數：第 1 關 19 格 → 第 3 關 31 格 */
    var N4 = [30, 75];                                  /* 4 色的格數：第 4 關 30 格 → 第 30 關 75 格（85 格以上手指不好點、手機出題太慢，難度也沒有再變高，見研究筆記第 9 節） */
    var COMPACT4 = [2, 3];                              /* 4 色的形狀緊密度（每格至少貼著幾格）：第 4 關 2 → 第 30 關 3（四捨五入；4 色時越實心越難） */
    var RARE = [0.25, 0.15], RARE_AT = 20;              /* 最少那一色佔全部格數的比例（破格率）：第 4 關 25%（四色一樣多）→ 第 20 關 15%（約 2:2:2:1，研究的最難區 10～20%） */
    var FREE_FILL = [0.30, 0.20];                       /* 自由擺的關卡：預填佔全部格數的比例：第 4 關 30% → 第 11 關 20% */
    var EXTRA3 = [3, 1];                                /* 三色入門：比「剛好唯一」多送幾格預填暖身：第 1 關 3 格 → 第 3 關 1 格 */
    var EXTRA4 = [3, 0];                                /* 4 色唯一解的關卡：多送幾格暖身：第 12 關 3 格 → 第 30 關 0 格（剛好唯一，最難） */
    var TIME_BASE = 30, TIME_CELL = [5, 9];             /* 每一關限時（秒）＝ 30 ＋ 空格數 × 每格秒數（第 1 關 5 秒 → 第 30 關 9 秒；後面的題目要推理，給得比較多） */
    var HINTS = 3;                                      /* 每一題可以用幾次提示；只有前 kit.HINT_LEVELS（4）關才有「提示」按鈕 */
    var LONG_MS = 450;                                  /* 按住多久算「長按」（毫秒，450 毫秒＝0.45 秒）：長按跳出記號彈窗 */
    var MOVE_TOL = 14;                                  /* 按下之後手指移動超過幾 px 就不算點擊／長按（避免滑動時誤塗） */
    var POP_FRAC = 0.4;                                 /* 記號彈窗的寬度＝遊戲畫面寬度的幾成（使用者指定約 2/5） */
    var POP_MIN_FRAC = 0.34;                            /* 格子很大又在正中間、2/5 寬會蓋到它時，彈窗最窄可以縮到幾成（才塞得進格子旁邊） */
    var HEX_MAX = 58;                                   /* 盤面上六角形的半徑最大幾 px（格子很少時才不會大得誇張） */
    var SHAPE_TRIES = 5;                                /* 每次長幾個形狀，挑六角形畫得最大的那個 */
    var NODE_SOL = 4000;                                /* 4 色找隱藏答案：每個形狀最多搜尋幾步（找不到就換形狀） */
    var NODE_STEP = 3000;                               /* 加預填時，每次數解最多搜尋幾步（超過就當作「解還太多」，再填一格） */
    var NODE_MIN = 15000;                               /* 拿掉多餘預填時，每次確認唯一解最多搜尋幾步（超過就不拿，保守） */
    var MIN_BUDGET = 80000;                             /* 拿掉多餘預填的總搜尋步數上限（手機上出題不要卡太久；超過就停，題目仍唯一解） */
    var NODE_HINT = 300000;                             /* 提示：從目前盤面找一種塗得完的方法，最多搜尋幾步 */
    var PASS_DELAY_MS = 1400;                           /* 過關後停多久才換下一關（毫秒） */
    var FAIL_HOLD_MS = 6000;                            /* 時間到之後停多久才跳出結算（毫秒），讓玩家看清楚答案 */
    var COLOR_NAMES = ['藍色', '橘色', '綠色', '黃色']; /* 四種顏色的名稱（顏色本身在 css 的 --hexcolor-c0～c3） */

    /* ═══ 純函式（也給 Node 測試用）═══ */

    /* 線性：第 level 關的值，從第 from 關的 a 走到第 to 關的 b（之前維持 a、之後維持 b） */
    function lin(level, a, b, from, to) {
        if (to <= from) return b;
        var p = Math.min(1, Math.max(0, (level - from) / (to - from)));
        return a + (b - a) * p;
    }
    /* 第 level 關的規格：{ k 色數, n 格數, compact 緊密度, rare 最少那色的比例, unique 答案是不是只有一種,
       fill 自由擺的預填數（unique 為 false 時才用）, extra 唯一解多送幾格暖身 } */
    function specFor(level) {
        level = Math.max(1, Math.min(MAX_LEVEL, level));
        if (level <= K3_TO) {
            return { k: 3, n: Math.round(lin(level, N3[0], N3[1], 1, K3_TO)), compact: 3, rare: 0, unique: true, fill: 0, extra: Math.round(lin(level, EXTRA3[0], EXTRA3[1], 1, K3_TO)) };  /* Math.round：四捨五入成整數 */
        }
        var f = K3_TO + 1, n = Math.round(lin(level, N4[0], N4[1], f, MAX_LEVEL)), unique = level > FREE_TO;   /* f：4 色的第一關 */
        return {
            k: 4, n: n,
            compact: Math.round(lin(level, COMPACT4[0], COMPACT4[1], f, MAX_LEVEL)),
            rare: lin(level, RARE[0], RARE[1], f, RARE_AT),
            unique: unique,
            fill: unique ? 0 : Math.round(n * lin(level, FREE_FILL[0], FREE_FILL[1], f, FREE_TO)),
            extra: unique ? Math.round(lin(level, EXTRA4[0], EXTRA4[1], FREE_TO + 1, MAX_LEVEL)) : 0
        };
    }
    /* 依比例算各色格數：最少那色＝n × rare（四捨五入），其餘平均分給另外 k−1 色（除不盡的從第一色開始多 1 格） */
    function countsFor(n, k, rare) {
        var r = Math.round(n * rare), rest = n - r, base = Math.floor(rest / (k - 1)), out = [];  /* Math.floor：無條件捨去成整數 */
        for (var i = 0; i < k - 1; i++) out.push(base + (i < rest - base * (k - 1) ? 1 : 0));
        out.push(r);
        return out;
    }
    /* 每一關限時（毫秒）：30 秒＋空格數 × 每格秒數（第 1 關 5 秒 → 第 30 關 9 秒，線性） */
    function timeFor(level, empties) { return Math.round((TIME_BASE + empties * kit.ramp(level, TIME_CELL[0], TIME_CELL[1], MAX_LEVEL)) * 1000); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」變化 */

    /* 六角格的「花樣」小工具（座標 [q, r]：q 往右、r 往右下）
       parityOf：「隔一格」的花樣——人習慣把同色隔一格擺（一排的第 1、3、5 格，斜的方向也一樣），這些格子的 q、r 奇偶都相同，共 4 類；
       subOf   ：三色的花樣——同一排每隔兩格（第 1、4、7 格），(q − r) 除以 3 的餘數相同，共 3 類；
       hexDist ：兩格之間要走幾步。 */
    function parityOf(c) { return kit.mod(c[0], 2) * 2 + kit.mod(c[1], 2); }  /* kit.mod：取餘數（負數也回傳 0 以上） */
    function subOf(c) { return kit.mod(c[0] - c[1], 3); }
    function hexDist(a, b) { var dq = a[0] - b[0], dr = a[1] - b[1]; return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2; }

    /* 陷阱分數：把第 i 格（答案色 c）加進預填時，跟現有預填（g，−1＝空格）的關係有多「卡人」。分數越高越想挑它。
       · 跟附近（6 步以內）同色預填的關係，取「最好的一對」加分、「最差的一對」扣分（不累加，避免預填全擠成同一色）：
           在「隔一格」花樣上（奇偶相同，像一排的第 1、3 格）＝ −2（幫了玩家，避免）；
           奇偶不同、但三色花樣相同（像第 1、4 格）＝ ＋1；兩種花樣都不同（像第 1、6 格）＝ ＋2。
       · 不同色、剛好隔一格（距離 2）：每一對 ＋1，最多算 2 對（夾住中間的格子，那附近要先想清楚）。
       · 同色的預填已經有幾格，每格 −0.6（各色的預填平均一點）。 */
    function trapScore(i, c, cells, g) {
        var best = 0, worst = 0, pinch = 0, same = 0;
        for (var j = 0; j < g.length; j++) {
            if (g[j] < 0 || j === i) continue;
            var d = hexDist(cells[i], cells[j]);
            if (g[j] === c) {
                same++;
                if (d > 6) continue;
                var rel = parityOf(cells[i]) === parityOf(cells[j]) ? -2 : (subOf(cells[i]) === subOf(cells[j]) ? 1 : 2);
                if (rel > best) best = rel;
                if (rel < worst) worst = rel;
            } else if (d === 2) pinch++;
        }
        return best + worst + Math.min(pinch, 2) - 0.6 * same;
    }

    /* ─── 解題器：nbrs[i]＝第 i 格的鄰居編號、k 種顏色 ───
       一個「狀態」s 是一整條 Int32Array（搜尋時每試一步就要複製一份，一條陣列複製最快），裡面依序放：
         s[i]（DOM＋i）    ＝第 i 格還能用的顏色（位元：第 c 位是 1＝顏色 c 還能用）
         s[COL＋i]          ＝第 i 格已塗的顏色（−1＝空格）
         s[REM＋c]          ＝顏色 c 還要塗幾格
         s[CAND＋c]         ＝還能塗 c 的空格有幾格（增量維護，不用每次重數）
         s[LEFT]            ＝還有幾個空格 */
    function makeEngine(nbrs, k) {
        var n = nbrs.length, FULL = (1 << k) - 1, POP = new Uint8Array(1 << k);   /* POP[x]：x 的二進位有幾個 1（＝還剩幾種顏色可用） */
        for (var x = 1; x < (1 << k); x++) POP[x] = POP[x >> 1] + (x & 1);
        var COL = n, REM = 2 * n, CAND = 2 * n + k, LEFT = 2 * n + 2 * k, SIZE = LEFT + 1;
        function fresh(counts) {
            var s = new Int32Array(SIZE);
            for (var i = 0; i < n; i++) { s[i] = FULL; s[COL + i] = -1; }
            for (var c = 0; c < k; c++) { s[REM + c] = counts[c]; s[CAND + c] = n; }
            s[LEFT] = n;
            return s;
        }
        /* 拿掉第 i 格（空格）的候選色 c；格子沒有顏色可用就回傳 false（矛盾）；只剩一色就排進 q 等著填 */
        function drop(s, i, c, q) {
            s[i] &= ~(1 << c); s[CAND + c]--;
            if (s[i] === 0) return false;
            if (POP[s[i]] === 1) q.push(i);
            return true;
        }
        /* 在第 i 格塗顏色 c（規則①：鄰居都不能再用 c）；矛盾回傳 false */
        function assign(s, i, c, q) {
            if (!((s[i] >> c) & 1)) return false;
            if (s[COL + i] !== -1) return s[COL + i] === c;
            for (var b = 0; b < k; b++) if ((s[i] >> b) & 1) s[CAND + b]--;   /* 這格不再是空格：它原本的候選色都少一格 */
            s[COL + i] = c; s[i] = 1 << c; s[LEFT]--;
            if (--s[REM + c] < 0) return false;          /* 顏色 c 超量了 */
            var a = nbrs[i];
            for (var t = 0; t < a.length; t++) {
                var j = a[t];
                if (s[COL + j] === c) return false;      /* 鄰居已經是 c：相鄰同色 */
                if (s[COL + j] === -1 && ((s[j] >> c) & 1) && !drop(s, j, c, q)) return false;
            }
            return true;
        }
        /* 反覆套用規則直到推不動；矛盾回傳 false */
        function propagate(s, q) {
            for (;;) {
                while (q.length) {
                    var i = q.pop();
                    if (s[COL + i] !== -1) continue;
                    if (!assign(s, i, 31 - Math.clz32(s[i]), q)) return false;   /* 只剩一色：Math.clz32 算出是哪一色 */
                }
                var fired = -1, mode = 0;
                for (var c = 0; c < k; c++) {
                    var rem = s[REM + c], cand = s[CAND + c];
                    if (cand < rem) return false;                                  /* 規則②：能塗 c 的空格不夠了 */
                    if (rem === 0 && cand > 0) { fired = c; mode = 1; break; }     /* 規則②：c 用完了，其他空格都不能再塗 c */
                    if (rem > 0 && cand === rem) { fired = c; mode = 2; break; }   /* 規則②：能塗 c 的空格剛好等於剩下的格數，全都塗 c */
                }
                if (fired < 0) return true;
                for (var i2 = 0; i2 < n; i2++) {
                    if (s[COL + i2] !== -1 || !((s[i2] >> fired) & 1)) continue;
                    if (mode === 1) { if (!drop(s, i2, fired, q)) return false; }
                    else if (!assign(s, i2, fired, q)) return false;
                }
            }
        }
        /* 從預填 g（−1＝空格）開始推理一輪；預填本身就矛盾回傳 null */
        function start(g, counts) {
            var s = fresh(counts), q = [];
            for (var i = 0; i < n; i++) if (g[i] >= 0 && !assign(s, i, g[i], q)) return null;
            return propagate(s, q) ? s : null;
        }
        /* 狀態 s 裡第 i 格的顏色（−1＝還沒確定）；給提示用 */
        function colorAt(s, i) { return s[COL + i]; }
        /* 數解：最多數到 cap 種、最多搜尋 nodeLimit 步（超過＝aborted，數不清楚）；rand 有給就隨機挑分支（找隨機答案用）。
           回傳 { found 找到幾種, aborted, nodes 搜尋步數, sols 找到的解（陣列） } */
        function count(g, counts, cap, nodeLimit, rand) {
            var out = { found: 0, aborted: false, nodes: 0, sols: [] };
            var s0 = start(g, counts);
            if (!s0) return out;
            (function dfs(s) {
                if (out.found >= cap || out.aborted) return;
                if (++out.nodes > nodeLimit) { out.aborted = true; return; }
                if (s[LEFT] === 0) { out.found++; out.sols.push(Int8Array.from(s.subarray(COL, COL + n))); return; }   /* subarray：取出一段（不複製）；Int8Array.from 再複製成答案 */
                var best = -1, bs = 99, ties = 0;           /* 挑「剩下顏色最少」的空格先試（最快發現走不通） */
                for (var i = 0; i < n; i++) {
                    if (s[COL + i] !== -1) continue;
                    var p = POP[s[i]];
                    if (p < bs) { bs = p; best = i; ties = 1; } else if (rand && p === bs) { ties++; if (rand() * ties < 1) best = i; }
                }
                var cs = [];
                for (var c = 0; c < k; c++) if ((s[best] >> c) & 1) cs.push(c);
                if (rand) cs = kit.shuffle(cs, rand);   /* kit.shuffle(陣列, rand)：隨機洗牌，回傳新陣列 */
                for (var t = 0; t < cs.length; t++) {
                    var s2 = s.slice(), q = [];         /* slice()：複製整個狀態（之後改複本，不會動到原本的） */
                    if (assign(s2, best, cs[t], q) && propagate(s2, q)) dfs(s2);
                    if (out.found >= cap || out.aborted) return;
                }
            })(s0);
            return out;
        }
        return { n: n, k: k, start: start, count: count, colorAt: colorAt };
    }

    /* 隨機合法著色（不管各色數量）：3 色入門用。照「隨機擴散」的順序一格一格塗、卡住就退。 */
    function randomColoring(nbrs, k, rand) {
        var n = nbrs.length;
        for (var at = 0; at < 20; at++) {
            var order = [], seen = new Uint8Array(n), st = Math.floor(rand() * n), qu = [st], nodes = 0;
            seen[st] = 1;
            while (qu.length) {
                var i = qu.splice(Math.floor(rand() * qu.length), 1)[0];
                order.push(i);
                nbrs[i].forEach(function (j) { if (!seen[j]) { seen[j] = 1; qu.push(j); } });  /* forEach：對陣列的每個元素各做一次 */
            }
            var col = new Int8Array(n).fill(-1);
            var ok = (function dfs(t) {
                if (t === n) return true;
                if (++nodes > 20000) return false;
                var v = order[t], forbid = 0, cs = [];
                nbrs[v].forEach(function (j) { if (col[j] >= 0) forbid |= 1 << col[j]; });
                for (var c = 0; c < k; c++) if (!((forbid >> c) & 1)) cs.push(c);
                cs = kit.shuffle(cs, rand);
                for (var a = 0; a < cs.length; a++) { col[v] = cs[a]; if (dfs(t + 1)) return true; }
                col[v] = -1;
                return false;
            })(0);
            if (ok) return col;
        }
        return null;
    }

    /* 格子中心的座標（單位：六角形的半徑）：x = √3 × (q + r/2)，y = 1.5 × r（尖頂六角形） */
    function centerOf(c) { return { x: SQRT3 * (c[0] + c[1] / 2), y: 1.5 * c[1] }; }
    /* 盤面外框（含半個六角形的邊）：{ x, y, w, h }（單位：半徑） */
    function boundsOf(cells) {
        var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        cells.forEach(function (c) { var p = centerOf(c); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
        return { x: x0 - SQRT3 / 2, y: y0 - 1, w: x1 - x0 + SQRT3, h: y1 - y0 + 2 };
    }
    /* 這個形狀放進 W×H 的盤面，六角形半徑最大能畫幾 px */
    function fitScale(cells, W, H) { var b = boundsOf(cells); return Math.min(W / b.w, H / b.h); }

    /* 出一關：回傳 { level, k, n, cells, nbrs, counts, sol 答案, given 預填（−1＝空格）, unique 答案是否唯一, minimal 剛好唯一要幾格預填（自由擺是 −1）, clues 實際預填數 }。
       rand：亂數（測試傳固定種子）；W／H：盤面的大小（挑形狀用，沒給就用預設）。流程見檔頭。 */
    function makeLevel(level, rand, W, H) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        W = W || 456; H = H || 470;
        var sp = specFor(level), n = sp.n, k = sp.k, pz = null;
        for (var t = 0; t < 40 && !pz; t++) {
            var shape = null, best = -1;
            for (var a = 0; a < SHAPE_TRIES; a++) {
                var sh = Core.makeShape(n, sp.compact, rand), f = fitScale(sh.cells, W, H);
                if (f > best) { best = f; shape = sh; }
            }
            var G = Core.buildGraph(shape.cells), E = makeEngine(G.nbrs, k), sol = null, counts;
            if (k === 3) {
                sol = randomColoring(G.nbrs, 3, rand);
                if (!sol) continue;
                counts = [0, 0, 0];
                for (var i = 0; i < n; i++) counts[sol[i]]++;
            } else {
                counts = countsFor(n, k, sp.rare);
                var r0 = E.count(new Int8Array(n).fill(-1), counts, 1, NODE_SOL, rand);
                if (!r0.found) continue;                /* 這個形狀湊不出這組格數（或太難找）：換一個形狀 */
                sol = r0.sols[0];
            }
            pz = { cells: shape.cells, nbrs: G.nbrs, E: E, sol: sol, counts: counts };
        }
        if (!pz) return null;
        var cells = pz.cells, sol2 = pz.sol, counts2 = pz.counts, E2 = pz.E, trapOn = k >= 4;
        var g = new Int8Array(n).fill(-1), guard = 0;
        if (!sp.unique) {
            /* 自由擺：從答案挑 fill 格當預填，每次挑「陷阱分數最高」的那格（答案不只一種，塗得出任何一種合格的就過關） */
            for (var f2 = 0; f2 < sp.fill; f2++) {
                var pk = -1, pv = -1e9;
                for (var c0 = 0; c0 < n; c0++) {
                    if (g[c0] >= 0) continue;
                    var v0 = trapScore(c0, sol2[c0], cells, g) + rand() * 1.5;
                    if (v0 > pv) { pv = v0; pk = c0; }
                }
                g[pk] = sol2[pk];
            }
            return { level: level, k: k, n: n, cells: cells, nbrs: pz.nbrs, counts: counts2, sol: sol2, given: g, unique: false, minimal: -1, clues: sp.fill, engine: E2 };
        }
        /* 步驟 3：加預填，直到只剩一種解（而且是完整數完，不是中途放棄） */
        for (;;) {
            var r = E2.count(g, counts2, 2, NODE_STEP);
            if ((!r.aborted && r.found <= 1) || ++guard > n) break;
            var alt = null;
            for (var s = 0; s < r.sols.length && !alt; s++) {
                for (var j = 0; j < n; j++) if (r.sols[s][j] !== sol2[j]) { alt = r.sols[s]; break; }
            }
            var pick = -1, ps = -1e9;
            for (var c = 0; c < n; c++) {
                if (g[c] >= 0 || (alt && alt[c] === sol2[c])) continue;    /* 只挑「另一種解」跟答案不一樣的格子（填了就能排除那種解） */
                var sc = (trapOn ? trapScore(c, sol2[c], cells, g) : 0) + rand() * 1.5;
                if (sc > ps) { ps = sc; pick = c; }
            }
            if (pick < 0) break;
            g[pick] = sol2[pick];
        }
        /* 步驟 4：拿掉多餘的預填（先拿陷阱分數最低的），每拿一格都完整確認仍是唯一解；總搜尋步數超過 MIN_BUDGET 就停 */
        var list = [], spent = 0;
        for (var c2 = 0; c2 < n; c2++) if (g[c2] >= 0) list.push({ i: c2, v: (trapOn ? trapScore(c2, g[c2], cells, g) : 0) + rand() });
        list.sort(function (x, y) { return x.v - y.v; });   /* sort：由小到大排序 */
        for (var m = 0; m < list.length && spent < MIN_BUDGET; m++) {
            var ci = list[m].i, keep = g[ci];
            g[ci] = -1;
            var r2 = E2.count(g, counts2, 2, NODE_MIN);
            spent += r2.nodes;
            if (r2.aborted || r2.found !== 1) g[ci] = keep;
        }
        var minimal = 0;
        for (var c3 = 0; c3 < n; c3++) if (g[c3] >= 0) minimal++;
        /* 步驟 5：多送 extra 格暖身（隨機挑空格，至少留 2 格給玩家） */
        var free = [];
        for (var c4 = 0; c4 < n; c4++) if (g[c4] < 0) free.push(c4);
        free = kit.shuffle(free, rand);
        for (var e = 0; e < sp.extra && e < free.length - 2; e++) g[free[e]] = sol2[free[e]];
        return { level: level, k: k, n: n, cells: cells, nbrs: pz.nbrs, counts: counts2, sol: sol2, given: g, unique: true, minimal: minimal, clues: minimal + Math.min(sp.extra, Math.max(0, free.length - 2)), engine: E2 };
    }

    /* 盤面上「相鄰同色」的格子：回傳 bad[i]＝1 表示第 i 格跟某個鄰居同色（paint[i]：−1＝空格） */
    function conflictsOf(paint, nbrs) {
        var bad = new Uint8Array(paint.length);
        for (var i = 0; i < paint.length; i++) {
            if (paint[i] < 0) continue;
            for (var t = 0; t < nbrs[i].length; t++) if (paint[nbrs[i][t]] === paint[i]) bad[i] = 1;
        }
        return bad;
    }
    /* 「！」警示：空格的鄰居已經用到全部 k 種顏色（放什麼都會跟鄰居同色）。回傳 warn[i]＝1 的陣列 */
    function deadCellsOf(paint, nbrs, k) {
        var warn = new Uint8Array(paint.length), all = (1 << k) - 1;
        for (var i = 0; i < paint.length; i++) {
            if (paint[i] >= 0) continue;
            var seen = 0;
            for (var t = 0; t < nbrs[i].length; t++) if (paint[nbrs[i][t]] >= 0) seen |= 1 << paint[nbrs[i][t]];
            if (seen === all) warn[i] = 1;
        }
        return warn;
    }
    /* 過關判斷：全部塗滿、沒有相鄰同色、各色格數剛好（塗滿時各色一定用完，這裡仍然檢查一次） */
    function isSolved(paint, nbrs, counts) {
        var used = counts.map(function () { return 0; });  /* map：把每個元素轉成別的東西，回傳新陣列 */
        for (var i = 0; i < paint.length; i++) { if (paint[i] < 0) return false; used[paint[i]]++; }
        for (var c = 0; c < counts.length; c++) if (used[c] !== counts[c]) return false;
        for (var j = 0; j < paint.length; j++) for (var t = 0; t < nbrs[j].length; t++) if (paint[nbrs[j][t]] === paint[j]) return false;
        return true;
    }
    /* 記號彈窗的「顏色組合」：k 色時列出 2 色、3 色…（k−1 色）的所有組合。
       順序照使用者的例子：兩色先列「相鄰的顏色」（紅綠、綠藍、藍紅…繞一圈），再列隔開的；三色同理。 */
    function combosFor(k) {
        var out = [], used = {};
        for (var size = 2; size <= Math.min(3, k - 1); size++) {      /* 2 色組合、3 色組合（k 色全選等於沒標，不列） */
            /* ① 先列「繞一圈連續」的：0+1、1+2、2+0（3 色時正好是使用者舉的紅綠、綠藍、藍紅） */
            for (var i = 0; i < k; i++) {
                var cyc = [];
                for (var d = 0; d < size; d++) cyc.push((i + d) % k);
                var key = cyc.slice().sort().join();
                if (!used[key]) { used[key] = true; out.push(cyc); }
            }
            /* ② 再列剩下的（例如 4 色時的 0+2、1+3） */
            (function rec(from, pick) {
                if (pick.length === size) { var key2 = pick.join(); if (!used[key2]) { used[key2] = true; out.push(pick.slice()); } return; }
                for (var c = from; c < k; c++) { pick.push(c); rec(c + 1, pick); pick.pop(); }
            })(0, []);
        }
        return out;
    }
    /* 記號彈窗擺哪裡（不能蓋住被按的格子）：cell＝格子的範圍 { l, r, t, b }、彈窗寬 pw 高 ph、畫面 W×H、留白 gap（都是邏輯 px）。回傳 { left, top }。
       ① 先試左右兩邊（格子在左半邊先試右邊、在右半邊先試左邊），上下對齊格子、超出畫面就往內推；
       ② 左右都會蓋到（第 1 關格子很大、又在正中間）→ 改放在格子正上方或正下方（放得下的那邊）；
       ③ 上下也放不下 → 彈窗稍微變窄（最窄 POP_MIN_FRAC × 畫面寬），塞進格子旁邊比較寬的那一邊；
       ④ 還是不行就挑「蓋到最少」的位置。回傳 { left, top, width }（width 通常就是 pw）。 */
    function popPlace(cell, pw, ph, W, H, gap) {
        var cx = (cell.l + cell.r) / 2, cy = (cell.t + cell.b) / 2, cands = [];
        var vTop = Math.max(gap, Math.min(H - ph - gap, cy - ph / 2));
        var sides = cx < W / 2 ? [W - pw - gap, gap] : [gap, W - pw - gap];
        sides.forEach(function (x) { cands.push({ left: x, top: vTop, width: pw }); });
        sides.forEach(function (x) {
            if (cell.t - gap - ph >= gap) cands.push({ left: x, top: cell.t - gap - ph, width: pw });   /* 格子正上方 */
            if (cell.b + gap + ph <= H - gap) cands.push({ left: x, top: cell.b + gap, width: pw });     /* 格子正下方 */
        });
        var roomL = cell.l - 2 * gap, roomR = W - cell.r - 2 * gap, minW = Math.round(W * POP_MIN_FRAC);
        if (Math.max(roomL, roomR) >= minW) {                       /* 窄一點的彈窗塞進比較寬的那一邊 */
            var w2 = Math.floor(Math.min(pw, Math.max(roomL, roomR)));
            cands.push({ left: roomR >= roomL ? W - w2 - gap : gap, top: vTop, width: w2 });
        }
        function overlap(p) {
            var w = Math.min(cell.r, p.left + p.width) - Math.max(cell.l, p.left), hh = Math.min(cell.b, p.top + ph) - Math.max(cell.t, p.top);
            return w > 0 && hh > 0 ? w * hh : 0;
        }
        var best = cands[0], bo = overlap(best);
        for (var i = 1; i < cands.length && bo > 0; i++) { var o = overlap(cands[i]); if (o < bo) { bo = o; best = cands[i]; } }
        return best;
    }
    /* 結算畫面的評語 */
    function rating(n) {
        if (n >= 25) return '六角著色大師！';
        if (n >= 15) return '數量和鄰居都顧到了！';
        if (n >= 5) return '越來越有感覺了！';
        return '先看預填的格子：它的六個鄰居都不能塗同色！';
    }

    /* ═══ SVG 圖形 ═══ */
    var SVGNS = 'http://www.w3.org/2000/svg';
    function svg(tag, attrs, parent) { return kit.svg(tag, attrs, parent); }  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 元素 */
    /* 在 parent 裡放一段置中的文字。為什麼外面都要包一層 scale(0.01)：盤面的座標單位是「六角形半徑＝1」，字只有 1 左右那麼大，
       但有些瀏覽器（尤其中文介面）有「最小字級」設定，會把這麼小的字撐大變形；所以字一律用 100 左右的大小寫（css 裡的 font-size），再整個縮小。
       dy：往下微調（同樣是 100 倍的單位），讓字看起來在正中央。 */
    function textIn(parent, cls, text, dy) {
        var t = kit.svg('text', { 'class': cls, x: 0, y: dy || 0, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, parent);   /* text-anchor：水平置中；dominant-baseline：垂直置中 */
        t.textContent = text;                           /* textContent：設定元素裡的文字 */
        return t;
    }
    /* 尖頂六角形的第 i 個頂點（半徑 R，中心 0,0）：i＝0 是正上方，順時針 60° 一個 */
    function vert(i, R) { var a = Math.PI / 180 * (-90 + 60 * i); return [R * Math.cos(a), R * Math.sin(a)]; }
    /* 圓角六角形的路徑字串：半徑 R、圓角大小 rr（0～0.5，佔邊長的比例）。每個角用一段二次曲線（Q）代替尖角。 */
    function roundHexPath(R, rr) {
        var d = '';
        for (var i = 0; i < 6; i++) {
            var v = vert(i, R), p = vert((i + 5) % 6, R), nx = vert((i + 1) % 6, R);
            var a = [v[0] + (p[0] - v[0]) * rr, v[1] + (p[1] - v[1]) * rr];
            var b = [v[0] + (nx[0] - v[0]) * rr, v[1] + (nx[1] - v[1]) * rr];
            d += (i === 0 ? 'M' : 'L') + a[0].toFixed(3) + ' ' + a[1].toFixed(3) + 'Q' + v[0].toFixed(3) + ' ' + v[1].toFixed(3) + ' ' + b[0].toFixed(3) + ' ' + b[1].toFixed(3);
        }
        return d + 'Z';
    }
    /* 顏色組合的小六角形：combo＝[顏色, 顏色(, 顏色)]、半徑 R、clipId＝裁切用的圓角外框。
       兩色：左半邊第一色、右半邊第二色；三色：左上、右上、下方（使用者指定的切法）。回傳 <g> */
    function comboIcon(combo, R, clipUrl) {
        var g = svg('g', { 'class': 'hexcolor-combo' });
        var inner = svg('g', { 'clip-path': clipUrl }, g);
        function poly(pts, c) {
            svg('polygon', { points: pts.map(function (p) { return p[0].toFixed(3) + ',' + p[1].toFixed(3); }).join(' '), 'class': 'hexcolor-fill hexcolor-col-' + c }, inner);
        }
        var V = function (i) { return vert(i, R); }, O = [0, 0];
        if (combo.length === 2) {
            poly([V(0), V(5), V(4), V(3)], combo[0]);           /* 左半邊：上 → 左上 → 左下 → 下 */
            poly([V(0), V(1), V(2), V(3)], combo[1]);           /* 右半邊：上 → 右上 → 右下 → 下 */
        } else {
            poly([O, V(0), V(5), V(4)], combo[0]);              /* 左上：中心 → 上 → 左上 → 左下 */
            poly([O, V(2), V(1), V(0)], combo[1]);              /* 右上：中心 → 右下 → 右上 → 上 */
            poly([O, V(4), V(3), V(2)], combo[2]);              /* 下方：中心 → 左下 → 下 → 右下 */
        }
        svg('path', { d: roundHexPath(R, 0.2), 'class': 'hexcolor-combo__edge' }, g);   /* 外框：圓角六角形 */
        return g;
    }

    /* ═══ 畫面 ═══ */
    var clipSeq = 0;                                    /* 每一關的裁切外框要有不重複的 id */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5,
            head: function (level) { return '第 ' + level + ' 關'; },
            info: function (S) { return '已解 ' + S.cleared + ' 關'; },
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['解開 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var wait = h('div', { 'class': 'hexcolor-wait', text: '出題中…' });   /* 出題最多要零點幾秒（手機上可能一兩秒），先告訴玩家在做什麼 */
        api.stage.appendChild(wait);
        api.after(40, function () {                     /* 等 40 毫秒讓瀏覽器先把「出題中…」畫出來，再開始算（算的時候畫面會暫停） */
            if (wait.parentNode) wait.parentNode.removeChild(wait);
            build(api);
        });
    }
    /* build(api)：真正出題、建畫面（setup 等「出題中…」畫出來之後才呼叫） */
    function build(api) {
        var stage = api.stage, level = api.level;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 667;
        var BAR_H = 104, TIP_H = 40, GAP = 8;           /* 版面：下方顏色列的高度、提示文字列的高度、間隔（px；跟 css 的數字一致） */
        var boardW = W - 2 * GAP, boardH = H - BAR_H - TIP_H - 4 * GAP;
        var pz = makeLevel(level, api.rand, boardW, boardH);
        api.info = pz;                                  /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        var k = pz.k, n = pz.n, nbrs = pz.nbrs, counts = pz.counts;
        console.log('[六角著色] 第 ' + level + ' 關：' + k + ' 色、' + n + ' 格、各色 ' + counts.join(':') + '、預填 ' + pz.clues + ' 格' + (pz.unique ? '、唯一解（剛好唯一要 ' + pz.minimal + ' 格）' : '、自由擺（答案不只一種）'));  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var paint = Int8Array.from(pz.given);           /* 目前盤面：paint[i]＝顏色（−1＝空格） */
        var marks = new Array(n).fill(null);            /* 記號：null／'q'（?）／'x'（X）／[顏色組合] */
        var tool = -1;                                  /* 目前選的工具：−1＝沒選、0～k−1＝顏色、k＝收回 */
        var hinted = {}, flagged = -1, hintsLeft = HINTS, solved = false, dead = false, revealed = {};
        var clipId = 'hexcolor-clip-' + (++clipSeq), clipUrl = 'url(#' + clipId + ')';
        var tipDefault = '點顏色再點格子；長按格子做記號';   /* 提示列只有一行（字太多會被截掉），所以每句話都要短 */

        var wrap = h('div', { 'class': 'hexcolor-wrap' });   /* wrap：整個遊戲畫面的外框容器 */
        var boardBox = h('div', { 'class': 'hexcolor-board' });
        var tip = h('div', { 'class': 'hexcolor-tip', text: tipDefault });
        var bar = h('div', { 'class': 'hexcolor-bar' });
        var pal = h('div', { 'class': 'hexcolor-pal' });
        var tools = h('div', { 'class': 'hexcolor-tools' });
        var btnHint = h('button', { 'class': 'btn btn--line hexcolor-tool', type: 'button', text: '提示 ' + hintsLeft });  /* 「提示」按鈕（文字會顯示還剩幾次提示） */
        var btnReset = h('button', { 'class': 'btn btn--line hexcolor-tool', type: 'button', text: '重來' });               /* 「重來」按鈕 */
        kit.onTap(btnHint, useHint);                    /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
        kit.onTap(btnReset, reset);
        if (HINTS > 0 && kit.hintsAllowed(level)) tools.appendChild(btnHint);   /* 只有前 kit.HINT_LEVELS（4）關才放提示按鈕 */
        tools.appendChild(btnReset);
        bar.appendChild(pal); bar.appendChild(tools);
        wrap.appendChild(boardBox); wrap.appendChild(tip); wrap.appendChild(bar);
        stage.appendChild(wrap);                        /* 把整個遊戲區放進舞台（放進去，畫面上才看得到） */

        /* ── 盤面（SVG）── */
        var B = boundsOf(pz.cells);
        var R = Math.min(boardW / B.w, boardH / B.h, HEX_MAX);   /* 六角形半徑（px） */
        var board = svg('svg', { 'class': 'hexcolor-svg', viewBox: B.x.toFixed(3) + ' ' + B.y.toFixed(3) + ' ' + B.w.toFixed(3) + ' ' + B.h.toFixed(3), width: (B.w * R).toFixed(1), height: (B.h * R).toFixed(1) });
        var defs = svg('defs', null, board);
        var clip = svg('clipPath', { id: clipId, clipPathUnits: 'objectBoundingBox' }, defs);   /* 顏色組合的裁切外框：用「外框比例」座標，任何大小的小六角形都能共用 */
        svg('path', { d: unitRoundHex(), transform: 'translate(0.5 0.5)' }, clip);
        var cellEls = [], hexPath = roundHexPath(0.94, 0.2), ringPath = roundHexPath(0.56, 0.2);
        for (var i = 0; i < n; i++) {
            var p = centerOf(pz.cells[i]);
            var gEl = svg('g', { 'class': 'hexcolor-cell', transform: 'translate(' + p.x.toFixed(3) + ' ' + p.y.toFixed(3) + ')', 'data-i': i }, board);
            svg('path', { d: hexPath, 'class': 'hexcolor-hex' }, gEl);
            svg('path', { d: ringPath, 'class': 'hexcolor-ring' }, gEl);                  /* 預填格裡面的一圈線（不是預填的不顯示） */
            svg('path', { d: 'M-0.3 -0.3L0.3 0.3M0.3 -0.3L-0.3 0.3', 'class': 'hexcolor-x hexcolor-x--bg' }, gEl);   /* 相鄰同色的 ✕（外框） */
            svg('path', { d: 'M-0.3 -0.3L0.3 0.3M0.3 -0.3L-0.3 0.3', 'class': 'hexcolor-x hexcolor-x--fg' }, gEl);   /* 相鄰同色的 ✕（內線） */
            svg('g', { 'class': 'hexcolor-mark' }, gEl);                                       /* 玩家的記號（?、X、顏色組合） */
            textIn(svg('g', { transform: 'scale(0.01)' }, gEl), 'hexcolor-bang', '！', 4);   /* 警示的「！」（平常隱藏，有 hexcolor-cell--warn 才顯示） */
            cellEls.push(gEl);
        }
        boardBox.appendChild(board);
        /* 裁切外框（單位正方形裡的圓角六角形）：寬 √3、高 2 的六角形縮放成 1×1 */
        function unitRoundHex() {
            var d = roundHexPath(1, 0.2);
            return d.replace(/-?\d+\.\d+ -?\d+\.\d+/g, function (pair) {   /* 把每一組「x y」換算成 0～1 的比例座標（−0.5～0.5，再由 translate 移到 0～1） */
                var xy = pair.split(' ');
                return (+xy[0] / SQRT3).toFixed(4) + ' ' + (+xy[1] / 2).toFixed(4);
            });
        }

        /* ── 下方顏色列：k 種顏色＋「收回」── */
        var palBtns = [];
        for (var c = 0; c <= k; c++) {
            var b = h('button', { 'class': 'hexcolor-palbtn' + (c === k ? ' hexcolor-palbtn--recall' : ' hexcolor-col-' + c), type: 'button' });
            var ps = svg('svg', { viewBox: '-1 -1.1547 2 2.3094', 'class': 'hexcolor-palsvg' }, b);   /* 尖頂六角形半徑 1.1547 時剛好寬 2、高 2.3094 */
            svg('path', { d: roundHexPath(1.08, 0.2), 'class': 'hexcolor-hex' }, ps);              /* 半徑略小一點，留空間給外框線 */
            textIn(svg('g', { transform: 'scale(0.01)' }, ps), 'hexcolor-palnum' + (c === k ? ' hexcolor-palnum--recall' : ''), c === k ? '收回' : String(counts[c]), 5);
            (function (cc) { kit.onTap(b, function () { pickTool(cc); }); })(c);   /* 用立即執行函式存住這一次迴圈的變數 */
            pal.appendChild(b); palBtns.push(b);
        }

        /* ── 點擊與長按：按下開始計時；放開時還沒到 LONG_MS＝點一下；按滿 LONG_MS＝長按（跳出記號彈窗）── */
        var press = null;                               /* 目前按著的資訊：{ id 手指編號, i 格子, x, y 起點, timer, long 已經是長按 } */
        function cellFromEvent(e) {
            var el = e.target && e.target.closest ? e.target.closest('[data-i]') : null;   /* closest：往上找最近一個有 data-i 的元素（就是那一格） */
            return el ? +el.getAttribute('data-i') : -1;
        }
        board.addEventListener('pointerdown', function (e) {   /* 指標事件（pointer）：手指與滑鼠通用 */
            e.preventDefault();                         /* preventDefault：取消瀏覽器的預設動作（例如長按跳出選單、拖曳選字） */
            if (solved || dead) return;
            if (press) { clearTimeout(press.timer); press = null; }   /* 上一次按下沒收到放開（少見，例如切到背景）：當作作廢，不要卡住之後的點擊 */
            var i2 = cellFromEvent(e);
            if (i2 < 0) return;
            var pt = kit.pt(e);                         /* kit.pt：事件座標換成 500×850 舞台的邏輯座標 */
            press = { id: e.pointerId, i: i2, x: pt.x, y: pt.y, long: false };
            try { board.setPointerCapture(e.pointerId); } catch (err) { }   /* setPointerCapture：手指移出盤面也收得到放開事件 */
            press.timer = api.after(LONG_MS, function () {
                if (!press || press.i !== i2) return;
                press.long = true;
                openPop(i2);
            });
        });
        board.addEventListener('pointermove', function (e) {
            if (!press || e.pointerId !== press.id || press.long) return;
            var pt = kit.pt(e);
            if (Math.abs(pt.x - press.x) > MOVE_TOL || Math.abs(pt.y - press.y) > MOVE_TOL) { clearTimeout(press.timer); press = null; }  /* 手指滑走了：不算點也不算長按 */
        });
        function endPress(e, cancel) {
            if (!press || e.pointerId !== press.id) return;
            var pr = press;
            press = null;
            clearTimeout(pr.timer);                     /* clearTimeout：取消還沒到時間的計時器 */
            if (!pr.long && !cancel) tapCell(pr.i);
        }
        board.addEventListener('pointerup', function (e) { endPress(e, false); });
        board.addEventListener('pointercancel', function (e) { endPress(e, true); });

        /* ── 記號彈窗（長條，寬度約畫面 2/5，擺在被按的格子另一邊，不會蓋住它）── */
        var pop = null;
        function closePop() { if (pop && pop.parentNode) pop.parentNode.removeChild(pop); pop = null; }
        function openPop(i3) {
            closePop();
            if (pz.given[i3] >= 0) { say('預填的格子不用做記號'); return; }
            var items = [{ m: 'q' }, { m: 'x' }].concat(combosFor(k).map(function (cb) { return { m: cb }; }));
            var popW = Math.round(W * POP_FRAC);
            pop = h('div', { 'class': 'hexcolor-pop' });
            pop.style.width = popW + 'px';
            var grid = h('div', { 'class': 'hexcolor-pop__grid' });
            items.forEach(function (it) {
                var btn = h('button', { 'class': 'hexcolor-pop__item', type: 'button' });
                var s2 = svg('svg', { viewBox: '-1 -1.1547 2 2.3094', 'class': 'hexcolor-pop__svg' }, btn);
                var base = svg('g', null, s2);
                if (typeof it.m === 'string') {                                             /* ?／X：空格的顏色＋符號（就是塗在格子上的樣子） */
                    svg('path', { d: roundHexPath(1.08, 0.2), 'class': 'hexcolor-hex hexcolor-pop__blank' }, base);
                    drawGlyph(base, it.m, 1.3);
                } else base.appendChild(comboIcon(it.m, 1.08, clipUrl));                   /* 顏色組合：整顆六角形切成兩塊或三塊 */
                if (sameMark(marks[i3], it.m)) btn.classList.add('hexcolor-pop__item--on');   /* 目前這格用的記號：框起來 */
                kit.onTap(btn, function () { marks[i3] = it.m; closePop(); paintAll(); });
                grid.appendChild(btn);
            });
            var clr = h('button', { 'class': 'btn btn--line hexcolor-pop__clear', type: 'button', text: '清除記號' });
            kit.onTap(clr, function () { marks[i3] = null; closePop(); paintAll(); });
            pop.appendChild(grid); pop.appendChild(clr);
            var cover = h('div', { 'class': 'hexcolor-cover' });   /* 透明的遮罩：點彈窗以外的地方＝關掉彈窗 */
            kit.onTap(cover, closePop);
            var holder = h('div', { 'class': 'hexcolor-popwrap' }, [cover, pop]);
            wrap.appendChild(holder);
            pop = holder;                               /* 關閉時整個（遮罩＋彈窗）一起拿掉 */
            var box = holder.lastChild;
            var wr = wrap.getBoundingClientRect(), cr = cellEls[i3].getBoundingClientRect();
            var sc = wr.width / (wrap.clientWidth || wr.width) || 1;   /* 舞台被縮放的倍率（螢幕 px ÷ 邏輯 px） */
            var cell = { l: (cr.left - wr.left) / sc, r: (cr.right - wr.left) / sc, t: (cr.top - wr.top) / sc, b: (cr.bottom - wr.top) / sc };
            var pos = popPlace(cell, popW, box.offsetHeight || 300, W, H, GAP);
            box.style.left = pos.left + 'px'; box.style.top = pos.top + 'px'; box.style.width = pos.width + 'px';
            Sfx.play('click');                          /* Sfx.play(名稱)：播放音效 */
        }
        function sameMark(a, b2) { return a != null && b2 != null && String(a) === String(b2); }
        /* 在格子上畫「?」（黑）或「X」（紅），size＝字的大小（單位：半徑） */
        function drawGlyph(parent, m, size) {
            var g2 = svg('g', { transform: 'scale(' + (size / 100).toFixed(4) + ')' }, parent);   /* 字用 100 的大小寫，再整個縮小（見 textIn 的說明） */
            textIn(g2, 'hexcolor-glyph hexcolor-glyph--' + m, m === 'q' ? '?' : 'X', 6);
        }

        /* ── 操作 ── */
        function say(text, bad) { tip.textContent = text; tip.className = 'hexcolor-tip' + (bad ? ' hexcolor-tip--bad' : ''); }  /* textContent：設定元素裡的文字 */
        function usedOf(c) { var u = 0; for (var i4 = 0; i4 < n; i4++) if (paint[i4] === c) u++; return u; }
        function pickTool(c) {
            if (solved || dead) return;
            tool = tool === c ? -1 : c;                 /* 再點一次同一個＝取消 */
            closePop();
            say(tool < 0 ? tipDefault : tool === k ? '再點要收回顏色的格子' : '再點要塗' + COLOR_NAMES[tool] + '的格子');
            paintAll();
        }
        function shake(c) {
            var el = palBtns[c];
            el.classList.remove('hexcolor-palbtn--shake');
            void el.offsetWidth;                        /* 讀一下尺寸，強迫瀏覽器重算，動畫才能重播 */
            el.classList.add('hexcolor-palbtn--shake');
        }
        function tapCell(i5) {
            if (solved || dead) return;
            flagged = -1;
            if (tool < 0) { say('先點下面的顏色（或「收回」）', true); return; }
            if (pz.given[i5] >= 0) { say(tool === k ? '預填的格子不能收回' : '預填的格子不能改', true); return; }
            if (hinted[i5]) { say('提示給的格子不能改', true); return; }
            if (tool === k) {
                if (paint[i5] < 0) { say('這一格還沒有顏色'); return; }
                paint[i5] = -1;
                Sfx.play('click');
            } else {
                if (paint[i5] === tool) { say('這一格已經是' + COLOR_NAMES[tool] + '了'); return; }
                if (usedOf(tool) >= counts[tool]) { say(COLOR_NAMES[tool] + '已經用完了', true); shake(tool); Sfx.play('bad'); return; }
                paint[i5] = tool;
                Sfx.play('click');
            }
            paintAll();
            if (isSolved(paint, nbrs, counts)) win();
        }
        /* 提示：目前的塗法還塗得完 → 替你塗好一格（優先挑「靠推理就能確定」的格子）；塗不完 → 標出要收回的那一格 */
        function useHint() {
            if (solved || dead || hintsLeft <= 0) return;
            var E = pz.engine, st = E.start(paint, counts), r = st ? E.count(paint, counts, 1, NODE_HINT) : null, target = -1;
            if (r && r.found) {
                for (var i6 = 0; i6 < n && target < 0; i6++) if (paint[i6] < 0 && E.colorAt(st, i6) >= 0) target = i6;   /* 推理就能確定的空格 */
                for (var i7 = 0; i7 < n && target < 0; i7++) if (paint[i7] < 0) target = i7;
                if (target < 0) return;
                hintsLeft--; btnHint.textContent = '提示 ' + hintsLeft; btnHint.disabled = hintsLeft <= 0;
                paint[target] = r.sols[0][target]; hinted[target] = true;
                paintAll(); say('粗框的這一格是提示塗的');
                if (isSolved(paint, nbrs, counts)) win();
                return;
            }
            /* 塗不完了：用「預填＋提示塗的」找一種塗法，標出跟它不一樣的那一格 */
            var base = paint.map(function (v, q) { return pz.given[q] >= 0 || hinted[q] ? v : -1; });
            var r2 = E.count(base, counts, 1, NODE_HINT), ref = r2.found ? r2.sols[0] : pz.sol;
            for (var i8 = 0; i8 < n; i8++) if (paint[i8] >= 0 && pz.given[i8] < 0 && !hinted[i8] && paint[i8] !== ref[i8]) { target = i8; break; }
            if (target < 0) return;
            hintsLeft--; btnHint.textContent = '提示 ' + hintsLeft; btnHint.disabled = hintsLeft <= 0;
            flagged = target; paintAll();
            say('塗不完了：把閃動的那一格先收回', true);
        }
        /* 重來：把這一題恢復成剛開始的樣子（提示塗的保留；記號清掉） */
        function reset() {
            if (solved || dead) return;
            for (var i9 = 0; i9 < n; i9++) { if (pz.given[i9] < 0 && !hinted[i9]) paint[i9] = -1; marks[i9] = null; }
            flagged = -1; closePop(); say(tipDefault); paintAll();
        }
        /* 時間到：把正確答案塗上去（虛線框的是補上的），結算 */
        function timeUp() {
            if (solved || dead) return;
            dead = true; tool = -1; flagged = -1; closePop();
            for (var j2 = 0; j2 < n; j2++) if (paint[j2] !== pz.sol[j2] && pz.given[j2] < 0) { paint[j2] = pz.sol[j2]; revealed[j2] = true; }
            paintAll();
            say(pz.unique ? '時間到了！虛線框的是正確答案' : '時間到了！這是其中一種塗法');
            kit.flash(stage, false, api.my);            /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            api.fail({ delay: FAIL_HOLD_MS, lines: ['時間到了'] });   /* api.fail：宣告失敗，delay 毫秒後進結算畫面 */
        }
        /* 過關：鎖住畫面、閃綠光，呼叫 api.pass 進下一關 */
        function win() {
            api.stopTimer();
            solved = true; tool = -1; closePop(); paintAll();
            say('全部塗好了，沒有相鄰同色！');
            kit.flash(stage, true, api.my);
            api.pass({ delay: PASS_DELAY_MS });
        }

        /* ── 重畫：依目前的狀態更新每一格、顏色列 ── */
        function paintAll() {
            var bad = conflictsOf(paint, nbrs), warn = deadCellsOf(paint, nbrs, k), anyBad = false;
            for (var i10 = 0; i10 < n; i10++) {
                var el = cellEls[i10], cls = 'hexcolor-cell';
                if (paint[i10] >= 0) cls += ' hexcolor-col-' + paint[i10]; else cls += ' hexcolor-cell--empty';
                if (pz.given[i10] >= 0) cls += ' hexcolor-cell--given';
                if (hinted[i10]) cls += ' hexcolor-cell--hinted';
                if (revealed[i10]) cls += ' hexcolor-cell--revealed';
                if (bad[i10] && !dead) { cls += ' hexcolor-cell--bad'; anyBad = true; }
                if (warn[i10] && !dead) cls += ' hexcolor-cell--warn';
                if (i10 === flagged) cls += ' hexcolor-cell--flag';
                if (solved) cls += ' hexcolor-cell--ok';
                el.setAttribute('class', cls);          /* SVG 元素要用 setAttribute 改 class */
                /* 記號：有警示「！」時先不畫（「！」比較重要） */
                var mk = el.querySelector('.hexcolor-mark');
                var want = warn[i10] || dead ? '' : String(marks[i10] || '');
                if (mk.getAttribute('data-m') !== want) {
                    mk.setAttribute('data-m', want);
                    while (mk.firstChild) mk.removeChild(mk.firstChild);
                    if (want && typeof marks[i10] === 'string') drawGlyph(mk, marks[i10], 1.1);
                    else if (want) mk.appendChild(comboIcon(marks[i10], 0.64, clipUrl));
                }
            }
            for (var c6 = 0; c6 <= k; c6++) {
                var btn = palBtns[c6];
                btn.classList.toggle('hexcolor-palbtn--sel', tool === c6);   /* classList.toggle(名稱, 條件)：條件成立就加上 class，不成立就拿掉 */
                if (c6 < k) {
                    var left = counts[c6] - usedOf(c6);
                    btn.querySelector('text').textContent = String(left);
                    btn.classList.toggle('hexcolor-palbtn--zero', left <= 0);
                }
            }
            if (anyBad && !solved && !dead) { say('相鄰的兩格同色了（打 ✕ 的格子）', true); badShown = true; }
            else if (badShown && !solved && !dead) { badShown = false; say(tipDefault); }   /* 衝突解除了：提示文字換回平常的 */
        }
        var badShown = false;                           /* 提示列現在是不是在寫「相鄰同色」 */

        /* 給測試／debug 用：api.solve 自動塗出答案、api.wrong 故意塗一格跟鄰居同色、api.state 回報目前狀態、api.press 模擬點格子 */
        api.solve = function () { for (var q = 0; q < n; q++) paint[q] = pz.sol[q]; paintAll(); win(); };
        api.wrong = function () {
            for (var q = 0; q < n; q++) {
                if (paint[q] >= 0) continue;
                for (var t = 0; t < nbrs[q].length; t++) {
                    var nc = paint[nbrs[q][t]];
                    if (nc >= 0 && usedOf(nc) < counts[nc]) { paint[q] = nc; paintAll(); return q; }
                }
            }
            return -1;
        };
        /* api.preview(frac)：拍選單縮圖用（test/reaction/make_icons.mjs）——照答案塗好前 frac 比例的空格，再在剩下的空格放一個「?」和一個顏色組合記號 */
        api.preview = function (frac) {
            var empt = [];
            for (var q = 0; q < n; q++) if (paint[q] < 0) empt.push(q);
            var m = Math.round(empt.length * frac);
            for (var t = 0; t < m; t++) paint[empt[t]] = pz.sol[empt[t]];
            if (empt[m]) marks[empt[m]] = 'q';
            if (empt[m + 2]) marks[empt[m + 2]] = [pz.sol[empt[m + 2]], (pz.sol[empt[m + 2]] + 1) % k];
            paintAll();
        };
        api.state = function () { return { paint: Array.from(paint), marks: marks.slice(), tool: tool, solved: solved, dead: dead, hintsLeft: hintsLeft, popOpen: !!pop }; };
        api.timeout = timeUp;
        api.timer(timeFor(level, n - pz.clues), timeUp);   /* 開始倒數（畫面上方的時間條）：時間到就呼叫 timeUp */
        paintAll();
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '六角著色',
        rule: '六角形的格子塗顏色：**相鄰的兩格不可以同色**，每種顏色**剛好用完下面寫的格數**。先點顏色再點格子；選「收回」再點格子就拿掉顏色。**長按格子可以做記號**（?、X、可能的顏色組合），只是參考。空格四周用到所有顏色會變暗紅色加「！」（放什麼都會錯）。時間到了算失敗，只有前 4 關有「提示」；全部塗滿、沒有相鄰同色就過關，成績是解開幾關。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/t_hexcolor.js）使用，遊戲本身不會用到。 */
        test: {
            specFor: specFor, countsFor: countsFor, timeFor: timeFor, makeEngine: makeEngine, makeLevel: makeLevel, randomColoring: randomColoring,
            trapScore: trapScore, parityOf: parityOf, subOf: subOf, hexDist: hexDist, centerOf: centerOf, boundsOf: boundsOf, fitScale: fitScale,
            conflictsOf: conflictsOf, deadCellsOf: deadCellsOf, isSolved: isSolved, combosFor: combosFor, popPlace: popPlace, roundHexPath: roundHexPath, rating: rating,
            MAX_LEVEL: MAX_LEVEL, K3_TO: K3_TO, N3: N3, N4: N4, COMPACT4: COMPACT4, RARE: RARE, RARE_AT: RARE_AT, FREE_TO: FREE_TO, FREE_FILL: FREE_FILL,
            EXTRA3: EXTRA3, EXTRA4: EXTRA4, TIME_BASE: TIME_BASE, TIME_CELL: TIME_CELL, HINTS: HINTS, LONG_MS: LONG_MS, POP_FRAC: POP_FRAC, MIN_BUDGET: MIN_BUDGET, NODE_MIN: NODE_MIN
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
