/* ═══════════════════════════════════════════════════════════════════
   reaction_tearcal.js — 秒反應・撕日曆（原「翻月曆」）
   一天一張的日曆。每撕一張就換成隔天，只能往後撕、不能回頭。上方寫著目標日期（或「中秋節」
   「霜降」這種要自己找的日子），在限時內撕到那一天，按「就是這天」。撕過頭就失敗。
   ───────────────────────────────────────────────────────────────────
   · 每張日曆頁顯示：陽曆年月日、星期、農曆日期、陽曆節日、農曆節日、二十四節氣。
   · 資料來源（全部在程式裡算，不用另外的資料檔）：
        - 農曆：用瀏覽器內建的 Intl.DateTimeFormat('zh-TW-u-ca-chinese')。
        - 二十四節氣：用太陽視黃經（Meeus 低精度公式）二分搜尋出每個節氣的時刻，換成台北時間的日期。
          對照 2025、2026 兩年的節氣日期完全一致，且 2025～2029 沒有任何節氣落在午夜 ±15 分鐘內
          （公式誤差約 10 分鐘），所以日期不會差一天。遊戲的日期範圍因此限制在 2025～2029 年。
        - 陽曆節日、農曆節日：寫在程式裡的表（母親節是五月第二個星期日、除夕是臘月最後一天）。
   · 題型與關卡（難度全部線性或依關卡解鎖）：
        第 1–3 關  同一個月的指定日期      第 4–6 關  跨月的指定日期（每個月 28/29/30/31 天不同）
        第 7–9 關  下一個／第二個星期幾    第 10–12 關 陽曆節日
        第 13–16 關 農曆節日               第 17–20 關 二十四節氣（含「第二個／第三個節氣」）
        第 21 關起 全部混合，距離更遠。
   · 限時 ＝ 要撕的張數 × tapSec（每張允許幾秒）＋ slack；tapSec、slack 隨關卡線性變小，
     所以時間一定「撕得完」（人點得到的速度），但越來越緊。
   · 有 LIVES 次機會（超時、撕過頭、按錯日子都扣一次），成績＝通過關數（越多越好）。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'tearcal';
    var h = UI.h;
    var kit = Reaction.kit;

    /* 難度與範圍的設定都集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 日期範圍限制在 2025～2029 年（節氣公式在這個範圍內已驗證） */
    var YEAR_MIN = 2025, YEAR_MAX = 2029;
    var LEVEL_RAMP = 25;
    var DMAX_START = 6, DMAX_END = 60;          /* 目標最遠離起點幾天（張） */
    var TAP_START = 0.60, TAP_END = 0.32;       /* 每撕一張允許的秒數 */
    var SLACK_START = 8, SLACK_END = 4;         /* 額外給的秒數 */
    /* 這個遊戲只有 1 次機會（錯一次就結束） */
    var LIVES = 1;
    var NEXT_MS = 1100;

    /* 陣列索引 0～6 對應 JS 的 getDay() 星期日～星期六 */
    var WD_NAME = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    /* 二十四節氣名稱，順序從「春分」開始（太陽黃經 0°、15°、30°…） */
    var TERMS = ['春分', '清明', '穀雨', '立夏', '小滿', '芒種', '夏至', '小暑', '大暑', '立秋', '處暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至', '小寒', '大寒', '立春', '雨水', '驚蟄'];
    /* 陽曆固定日期的節日：[月, 日, 名稱] */
    var SOLAR_FEST = [[1, 1, '元旦'], [2, 14, '情人節'], [2, 28, '和平紀念日'], [3, 8, '婦女節'], [4, 4, '兒童節'], [5, 1, '勞動節'], [8, 8, '父親節'], [9, 28, '教師節'], [10, 10, '國慶日'], [10, 25, '光復節'], [10, 31, '萬聖節'], [12, 25, '聖誕節']];
    /* 農曆節日：[農曆月, 農曆日, 名稱] */
    var LUNAR_FEST = [[1, 1, '春節'], [1, 15, '元宵節'], [5, 5, '端午節'], [7, 7, '七夕'], [7, 15, '中元節'], [8, 15, '中秋節'], [9, 9, '重陽節'], [12, 8, '臘八節']];
    /* Intl 給的農曆月份名稱 → 數字 */
    var LUNAR_MONTH = { '正月': 1, '二月': 2, '三月': 3, '四月': 4, '五月': 5, '六月': 6, '七月': 7, '八月': 8, '九月': 9, '十月': 10, '冬月': 11, '臘月': 12 };
    /* 數字 → 農曆月份名稱（索引 0 不用） */
    var LUNAR_MONTH_NAME = ['', '正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '臘月'];

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 關'; }

    /* 日期工具：把一天用「天數編號 n」表示（1970-01-01 是 0），這樣「隔天」就是 n+1，不用處理月底、閏年 */
    /* ═══ 日期工具：用「天數編號」n（1970-01-01 ＝ 0）表示一天 ═══ */
    /* 由年月日算出天數編號：Date.UTC 回傳毫秒，除以一天的毫秒數 86400000 */
    function dnum(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / 86400000); }
    /* 由天數編號還原成 {年, 月, 日} */
    function ymd(n) { var dt = new Date(n * 86400000); return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }; }
    /* 星期幾：1970-01-01 是星期四，所以 (n+4) % 7；再 +7 再 %7 是為了處理負數 */
    function weekday(n) { return (((n + 4) % 7) + 7) % 7; }      /* 0＝星期日 */
    /* 某年某月有幾天：下個月 1 號的前一天就是這個月的最後一天 */
    function daysIn(y, m) { return ymd(dnum(y, m + 1, 1) - 1).d; }
    /* 可玩的日期範圍（天數編號） */
    var N_MIN = dnum(YEAR_MIN, 1, 1), N_MAX = dnum(YEAR_MAX, 12, 31);

    /* 農曆：用瀏覽器內建的 Intl.DateTimeFormat（中文曆法 zh-TW-u-ca-chinese）查，不用自己寫農曆表 */
    /* ═══ 農曆（Intl）═══ */
    var lunarFmt = null, lunarOk = null;
    function lunarOf(n) {
        try {
            /* 第一次用才建立格式化器（之後重複使用） */
            if (!lunarFmt) lunarFmt = new Intl.DateTimeFormat('zh-TW-u-ca-chinese', { month: 'long', day: 'numeric', timeZone: 'UTC' });
            /* formatToParts 把格式化結果拆成「月」「日」等部分；+43200000（12 小時）避免剛好落在午夜的時區誤差 */
            var parts = lunarFmt.formatToParts(new Date(n * 86400000 + 43200000)), mo = '', dd = '';
            parts.forEach(function (p) { if (p.type === 'month') mo = p.value; if (p.type === 'day') dd = p.value; });
            /* 閏月的月份名稱開頭是「閏」 */
            var leap = mo.charAt(0) === '閏';
            var key = leap ? mo.slice(1) : mo;
            var mm = LUNAR_MONTH[key];
            if (!mm) return null;
            return { m: mm, d: parseInt(dd, 10), leap: leap };
        } catch (e) { return null; }
    }
    /* 檢查這個瀏覽器的農曆功能是否正常（用兩個已知日期驗證：2025/1/29 是正月初一、2025/10/6 是八月十五） */
    function lunarSupported() {
        if (lunarOk == null) {
            var a = lunarOf(dnum(2025, 1, 29)), b = lunarOf(dnum(2025, 10, 6));
            lunarOk = !!(a && b && a.m === 1 && a.d === 1 && b.m === 8 && b.d === 15);
        }
        return lunarOk;
    }
    /* 農曆日期的中文寫法 */
    var DAY_CN = ['', '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
    function lunarText(L) { return L ? (L.leap ? '閏' : '') + LUNAR_MONTH_NAME[L.m] + DAY_CN[L.d] : ''; }

    /* 二十四節氣：用「太陽視黃經」（太陽在天空黃道上的位置）算出，節氣就是黃經剛好 0°、15°、30°… 的那一刻 */
    /* ═══ 二十四節氣（太陽視黃經）═══ */
    /* sunLon：輸入儒略日 jd（天文學的連續日期編號），回傳太陽黃經（度）。這是 Meeus 的低精度公式，誤差約 10 分鐘，足夠判斷是哪一天 */
    function sunLon(jd) {
        var T = (jd + 69 / 86400 - 2451545) / 36525;
        var L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
        var M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * Math.PI / 180;
        var C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
        var om = (125.04 - 1934.136 * T) * Math.PI / 180;
        var lam = L0 + C - 0.00569 - 0.00478 * Math.sin(om);
        return ((lam % 360) + 360) % 360;
    }
    /* findTermTime：二分搜尋法——在猜測時間前後 20 天內，每次把範圍縮一半，找出黃經剛好等於目標的那一刻 */
    function findTermTime(targetDeg, guessMs) {
        var lo = guessMs - 20 * 86400000, hi = guessMs + 20 * 86400000;
        function diff(ms) { var d = sunLon(ms / 86400000 + 2440587.5) - targetDeg; return ((d + 540) % 360) - 180; }
        /* 重複 60 次，每次取中點；太陽黃經還沒到目標就往後找，過了就往前找 */
        for (var i = 0; i < 60; i++) { var mid = (lo + hi) / 2; if (diff(mid) < 0) lo = mid; else hi = mid; }
        return (lo + hi) / 2;
    }
    /* 某年「春分到驚蟄」這 24 個節氣：回傳 [{name, n, t, min}]，n 是台北日期的天數編號，
       min 是當天幾點幾分（分鐘），t 是時刻（ms） */
    /* 快取：算過的年份存起來，不用重算 */
    var termCache = {};
    /* 某年的 24 個節氣：回傳每個節氣的名稱、台北日期的天數編號 n、時刻 */
    function termsOfYear(y) {
        if (termCache[y]) return termCache[y];
        var out = [];
        for (var k = 0; k < 24; k++) {
            /* approx：粗估時間（春分約 3/20，之後每個節氣約隔 15.2 天） */
            var approx = Date.UTC(y, 2, 20, 12) + k * 15.2184 * 86400000;
            var t = findTermTime((k * 15) % 360, approx);
            /* +8 小時換成台北時間（UTC+8） */
            var cst = new Date(t + 8 * 3600000);
            out.push({ name: TERMS[k], n: Math.floor((t + 8 * 3600000) / 86400000), t: t, min: cst.getUTCHours() * 60 + cst.getUTCMinutes() });
        }
        termCache[y] = out;
        return out;
    }
    /* 把節氣放進一個「日期 → 節氣名稱」的查表，方便查某天是不是節氣 */
    var termMap = null;
    /* termOf：查某一天的節氣名稱（沒有就回傳 null） */
    function termOf(n) {
        if (!termMap) {
            termMap = {};
            for (var y = YEAR_MIN - 1; y <= YEAR_MAX; y++) termsOfYear(y).forEach(function (o) { termMap[o.n] = o.name; });
        }
        return termMap[n] || null;
    }

    /* 一天的資料 */
    /* ═══ 一天的資料 ═══ */
    /* nthSunday：某年某月第 k 個星期日（母親節是五月第二個星期日） */
    function nthSunday(y, m, k) { var first = dnum(y, m, 1), off = (7 - weekday(first)) % 7; return first + off + 7 * (k - 1); }
    /* dayInfo 的快取 */
    var infoCache = {};
    /* dayInfo：整合某一天的所有資訊：年月日、星期、農曆、陽曆節日、農曆節日、節氣 */
    function dayInfo(n) {
        if (infoCache[n]) return infoCache[n];
        var c = ymd(n), L = lunarSupported() ? lunarOf(n) : null;
        var solar = null;
        SOLAR_FEST.forEach(function (f) { if (f[0] === c.m && f[1] === c.d) solar = f[2]; });
        /* 母親節不是固定日期，要另外算 */
        if (c.m === 5 && n === nthSunday(c.y, 5, 2)) solar = '母親節';
        var lf = null;
        if (L && !L.leap) {
            LUNAR_FEST.forEach(function (f) { if (f[0] === L.m && f[1] === L.d) lf = f[2]; });
            /* 除夕：臘月最後一天（隔天是正月初一） */
            if (L.m === 12 && L.d >= 29) {
                var nx = lunarOf(n + 1);
                if (nx && nx.m === 1 && nx.d === 1) lf = '除夕';
            }
        }
        var info = { n: n, y: c.y, m: c.m, d: c.d, wd: weekday(n), wdName: WD_NAME[weekday(n)], lunar: L, lunarText: lunarText(L), solarFest: solar, lunarFest: lf, term: termOf(n) };
        infoCache[n] = info;
        return info;
    }

    /* 索引：把範圍內所有節日／節氣的日期收集起來，出題時才能從中挑（第一次用才建立） */
    /* 範圍內所有「節日／節氣」的日子索引（第一次用才建立）*/
    var index = null;
    function getIndex() {
        if (index) return index;
        index = { solar: [], lunar: [], term: [] };
        for (var n = N_MIN; n <= N_MAX; n++) {
            var d = dayInfo(n);
            if (d.solarFest) index.solar.push(n);
            if (d.lunarFest) index.lunar.push(n);
            if (d.term) index.term.push(n);
        }
        return index;
    }
    /* nthTermAfter：start 之後的第 k 個節氣 */
    function nthTermAfter(start, k) {
        var c = 0;
        for (var n = start + 1; n <= N_MAX + 60; n++) if (termOf(n) && ++c === k) return n;
        return null;
    }

    /* 出題 */
    /* ═══ 出題 ═══ */
    /* 這一關目標最遠離起點幾天（張），隨關卡線性變大 */
    function dMax(level) { return Math.round(kit.ramp(level, DMAX_START, DMAX_END, LEVEL_RAMP)); }
    /* 每撕一張日曆允許的秒數（越來越短） */
    function tapSec(level) { return kit.ramp(level, TAP_START, TAP_END, LEVEL_RAMP); }
    /* 額外多給的秒數 */
    function slack(level) { return kit.ramp(level, SLACK_START, SLACK_END, LEVEL_RAMP); }
    /* 這關的總時限＝張數×每張秒數＋額外秒數，保證人一定撕得完 */
    function timeFor(level, d) { return d * tapSec(level) + slack(level); }
    /* 依關卡決定題型：1–3 同月日期、4–6 跨月日期、7–9 星期、10–12 陽曆節日、13–16 農曆節日、17–20 節氣、之後混合 */
    function levelType(level, rand) {
        if (level <= 3) return 'date';
        if (level <= 6) return 'dateX';
        if (level <= 9) return 'weekday';
        if (level <= 12) return 'solar';
        if (level <= 16) return 'lunar';
        if (level <= 20) return 'term';
        var pool = ['dateX', 'weekday', 'solar', 'lunar', 'term', 'termN'];
        if (!lunarSupported()) pool = pool.filter(function (t) { return t !== 'lunar'; });
        return kit.pick(pool, rand || Math.random);
    }
    /* 隨機挑一個起點日期（保留後面 120 天的空間） */
    function rangeStart(rand) { return kit.randInt(N_MIN + 2, N_MAX - 120, rand); }

    /* 產生一關：回傳題型、起點、目標、要撕幾張、題目文字、時限 */
    /* 回傳 { type, start, target, d, prompt, limit, answerTag }；start/target 是天數編號 */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var type = levelType(level, rand), D = dMax(level), start, target, prompt;
        if (type === 'lunar' && !lunarSupported()) type = 'solar';
        /* 同月日期：起點和目標在同一個月內 */
        if (type === 'date') {
            /* 最多嘗試 50 次找出合理的組合，避免無窮迴圈 */
            for (var tries = 0; tries < 50; tries++) {
                var y = kit.randInt(YEAR_MIN, YEAR_MAX, rand), m = kit.randInt(1, 12, rand), dim = daysIn(y, m);
                var s = kit.randInt(1, dim - 2, rand), dd = kit.randInt(2, Math.max(2, Math.min(D, dim - s)), rand);
                if (s + dd <= dim) { start = dnum(y, m, s); target = start + dd; break; }
            }
            /* 萬一 50 次都失敗，用固定的保底題目 */
            if (target == null) { start = dnum(2026, 3, 3); target = start + 5; }
            var tc = ymd(target); prompt = '撕到 ' + tc.m + ' 月 ' + tc.d + ' 日';
        /* 跨月日期：起點選在月底前 0～5 天，保證要跨進下個月 */
        } else if (type === 'dateX') {
            var y2 = kit.randInt(YEAR_MIN, YEAR_MAX, rand), m2 = kit.randInt(1, 12, rand);
            if (y2 === YEAR_MAX && m2 === 12) m2 = 11;
            var dim2 = daysIn(y2, m2), toEnd = kit.randInt(0, 5, rand), s2 = dim2 - toEnd;
            start = dnum(y2, m2, s2);
            var minD = toEnd + 1;                                 /* 至少撕過月底，跨進下個月 */
            var d2 = kit.randInt(minD + 1, Math.max(minD + 1, minD + Math.max(2, D - toEnd - 1)), rand);
            target = start + d2;
            var tc2 = ymd(target); prompt = '撕到 ' + tc2.m + ' 月 ' + tc2.d + ' 日';
        /* 星期題：「下一個星期X」或「第二個星期X」 */
        } else if (type === 'weekday') {
            start = rangeStart(rand);
            var wd = kit.randInt(0, 6, rand), k = level >= 8 && rand() < 0.5 ? 2 : 1;
            /* 往後找到第一個符合星期的日子 */
            var first = start + 1; while (weekday(first) !== wd) first++;
            if (first - start < 2) { start -= 1; }                    /* 至少隔一天才撕得到（不然只撕一張太簡單）*/
            target = first + 7 * (k - 1);
            prompt = k === 1 ? '撕到下一個' + WD_NAME[wd] : '撕到第二個' + WD_NAME[wd];
        /* 節日／節氣題：從索引裡挑一個目標，起點設在往前 d3 天 */
        } else if (type === 'solar' || type === 'lunar' || type === 'term') {
            var list = getIndex()[type], cand = [];
            var d3 = kit.randInt(Math.min(D, Math.max(3, Math.round(D * 0.4))), Math.max(3, D), rand);
            for (var i = 0; i < list.length; i++) if (list[i] - d3 >= N_MIN && list[i] <= N_MAX) cand.push(list[i]);
            target = kit.pick(cand, rand);
            start = target - d3;
            var inf = dayInfo(target);
            prompt = '撕到「' + (type === 'solar' ? inf.solarFest : type === 'lunar' ? inf.lunarFest : inf.term) + '」';
        /* termN：第 1～3 個節氣 */
        } else {   /* termN：第 k 個節氣 */
            start = rangeStart(rand);
            var kk = kit.randInt(1, 3, rand);
            target = nthTermAfter(start, kk);
            if (target - start < 2) start -= 1;                         /* 至少隔一天（節氣之間相隔 14 天以上，不會多算到一個）*/
            prompt = kk === 1 ? '撕到下一個節氣' : '撕到第' + (kk === 2 ? '二' : '三') + '個節氣';
        }
        var d = target - start;
        return { type: type, start: start, target: target, d: d, prompt: prompt, limit: timeFor(level, d) };
    }

    /* 畫面 */
    /* ═══ 畫面 ═══ */
    /* 把某一天的資料畫到日曆頁：年月、日期大字、星期、農曆、節日標籤 */
    function renderPage(el, info) {
        el.innerHTML = '';
        /* 週六、週日用不同顏色 */
        var weekend = info.wd === 0 || info.wd === 6;
        el.appendChild(h('div', { 'class': 'tc-ym', text: info.y + ' 年 ' + info.m + ' 月' }));
        el.appendChild(h('div', { 'class': 'tc-day' + (weekend ? ' tc-day--we' : ''), text: String(info.d) }));
        el.appendChild(h('div', { 'class': 'tc-wd' + (weekend ? ' tc-wd--we' : ''), text: info.wdName }));
        el.appendChild(h('div', { 'class': 'tc-lunar', text: info.lunar ? '農曆 ' + info.lunarText : '' }));
        var tags = h('div', { 'class': 'tc-tags' });
        if (info.solarFest) tags.appendChild(h('span', { 'class': 'tc-tag tc-tag--solar', text: info.solarFest }));
        if (info.lunarFest) tags.appendChild(h('span', { 'class': 'tc-tag tc-tag--lunar', text: info.lunarFest }));
        if (info.term) tags.appendChild(h('span', { 'class': 'tc-tag tc-tag--term', text: info.term }));
        el.appendChild(tags);
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
            root.innerHTML = '';

            /* level 關卡；cleared 已過幾關；lives 機會；state 目前狀態；lvId 關卡流水號 */
            var level = startAt || 1, cleared = level - 1, lives = LIVES, newRec = false, state = 'idle', lvId = 0;
            /* L 這關的資料；cur 目前日曆頁是哪一天；torn 已撕幾張 */
            var L = null, cur = 0, torn = 0;

            /* 建立畫面元素 */
            var head = h('div', { 'class': 'tc-head' });
            var prompt = h('div', { 'class': 'tc-prompt' });
            var tb = kit.timebar();
            var stack = h('div', { 'class': 'tc-stack' });
            var page = h('div', { 'class': 'tc-page' });
            var hint = h('div', { 'class': 'tc-hint', text: '點日曆撕下一張（不能回頭）' });
            stack.appendChild(page);
            var ok = h('button', { 'class': 'btn btn--go tc-ok', text: '就是這天' });
            [head, prompt, tb.el, stack, hint, ok].forEach(function (n) { root.appendChild(n); });

            function meta() { ctx.setMeta(kit.meta(['第 ' + level + ' 關', '機會 ' + lives])); }

            /* 開始一關 */
            function startLevel() {
                if (my.dead) return;
                var id = ++lvId;
                /* 產生這關的題目 */
                L = makeLevel(level);
                cur = L.start; torn = 0; state = 'play';
                renderPage(page, dayInfo(cur));
                head.textContent = '第 ' + level + ' 關';
                prompt.textContent = L.prompt;
                hint.textContent = '點日曆撕下一張（不能回頭），到了按「就是這天」';
                page.classList.remove('tc-page--ok', 'tc-page--bad');
                meta();
                var ti = dayInfo(L.target);
                /* 主控台印出這關的實際資料（起點、目標、農曆、節日、張數、時限），方便驗證 */
                try { console.info('[撕日曆] 第 ' + level + ' 關（' + L.type + '）' + L.prompt + '：從 ' + dayInfo(L.start).y + '/' + dayInfo(L.start).m + '/' + dayInfo(L.start).d + ' 撕到 ' + ti.y + '/' + ti.m + '/' + ti.d + ' ' + ti.wdName + '（農曆 ' + ti.lunarText + (ti.solarFest ? '・' + ti.solarFest : '') + (ti.lunarFest ? '・' + ti.lunarFest : '') + (ti.term ? '・' + ti.term : '') + '），要撕 ' + L.d + ' 張，限時 ' + L.limit.toFixed(1) + ' 秒'); } catch (e) { }
                var t0 = performance.now(), lim = L.limit * 1000;
                /* 倒數時間條 */
                my.loop(function (now) { if (id !== lvId || state !== 'play') return false; tb.set(1 - (now - t0) / lim); });
                /* 時間到：先看撕到的日期對不對，對就過關，不對才失敗 */
                my.after(lim, function () { if (id === lvId && state === 'play') { if (cur === L.target) pass(true); else fail('時間到了'); } });      /* 時間到：先看撕到的日期對不對，對就過關 */
            }

            /* 撕一張：點日曆就會呼叫 */
            function tear() {
                if (state !== 'play') return;
                /* 撕下來的這張飛走，下面露出隔天 */
                /* cloneNode(true)：複製目前這頁（含內容），給它「被撕走」的動畫 class，下面的原頁則換成隔天 */
                var old = page.cloneNode(true);
                old.className = 'tc-page tc-page--torn';
                stack.appendChild(old);
                /* 動畫結束（260 毫秒）後把撕下來的那張從畫面移除 */
                my.after(260, function () { if (old.parentNode) old.parentNode.removeChild(old); });
                /* cur++：翻到隔天 */
                cur++; torn++;
                renderPage(page, dayInfo(cur));
                Sfx.play('flip');
                /* 撕過頭（超過目標）就失敗 */
                if (cur > L.target) { fail('撕過頭了！'); }
            }

            /* confirm：按「就是這天」 */
            function confirm() {
                if (state !== 'play') return;
                if (cur === L.target) pass();
                else fail('這天不對');
            }

            /* pass：過關（timeout 為 true 表示是時間到時剛好撕對） */
            function pass(timeout) {
                state = 'judged';
                tb.set(0);
                cleared = level;
                if (Reaction.setBest(ID, cleared, function (v, b) { return v > b; })) newRec = true;
                page.classList.add('tc-page--ok');
                Sfx.play('win');
                hint.textContent = (timeout ? '時間到，剛好撕對了！' : '對了！') + '撕了 ' + torn + ' 張';
                level++;
                my.after(NEXT_MS, startLevel);
            }

            /* fail：失敗，why 是原因文字 */
            function fail(why) {
                if (state !== 'play') return;
                state = 'judged';
                tb.set(0);
                lives--;
                page.classList.add('tc-page--bad');
                Sfx.play('bad');
                var ti = dayInfo(L.target);
                hint.textContent = why + '　目標是 ' + ti.m + ' 月 ' + ti.d + ' 日（' + ti.wdName + '）';
                meta();
                if (lives <= 0) {
                    my.after(1800, function () {
                        var back = kit.resumeFrom(level);
                        kit.result(root, {
                            num: cleared + ' 關', label: cleared >= 10 ? '日子都在心裡！' : (cleared >= 5 ? '很會翻日曆！' : '再試一次，會更快！'),
                            lines: ['最後一關：' + L.prompt, '目標 ' + ti.y + ' 年 ' + ti.m + ' 月 ' + ti.d + ' 日　' + ti.wdName + (ti.lunarText ? '　農曆' + ti.lunarText : '')],
                            isNew: newRec, sfx: cleared >= 6 ? 'win' : 'fail', onAgain: function () { round(1); },
                            resume: { level: back, run: function () { round(back); } }
                        });
                    });
                } else my.after(1800, startLevel);
            }

            /* 點日曆區域＝撕一張；pointerdown 比 click 更即時 */
            stack.addEventListener('pointerdown', function (e) { e.preventDefault(); tear(); });
            ok.addEventListener('pointerdown', function (e) { e.preventDefault(); confirm(); });

            /* G.debug：測試用後門 */
            G.debug = {
                state: function () { return { level: level, state: state, lives: lives, cleared: cleared, L: L, cur: cur, torn: torn, info: dayInfo(cur) }; },
                tear: function (k) { for (var i = 0; i < (k || 1); i++) tear(); return cur; },
                tearToTarget: function () { tear.call(null); while (state === 'play' && cur < L.target) tear(); return cur; },
                confirm: confirm
            };
            my.after(300, startLevel);
        }

        round(1);
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '撕日曆',
        rule: '這是一天一張的日曆，點一下撕掉一張、換成隔天，不能回頭。要在時間內撕到上面指定的日子（日期、星期、節日、節氣…），到了按「就是這天」。撕過頭就失敗！',
        mount: mount,
        /* test 匯出很多純函式，給 Node 自動測試（test/reaction/t_tearcal.js）使用 */
        test: {
            dnum: dnum, ymd: ymd, weekday: weekday, daysIn: daysIn, lunarOf: lunarOf, lunarSupported: lunarSupported, lunarText: lunarText, termsOfYear: termsOfYear, termOf: termOf,
            dayInfo: dayInfo, getIndex: getIndex, nthTermAfter: nthTermAfter, nthSunday: nthSunday, makeLevel: makeLevel, levelType: levelType, dMax: dMax, tapSec: tapSec, slack: slack, timeFor: timeFor,
            N_MIN: N_MIN, N_MAX: N_MAX, YEAR_MIN: YEAR_MIN, YEAR_MAX: YEAR_MAX, TERMS: TERMS, LEVEL_RAMP: LEVEL_RAMP
        }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();
