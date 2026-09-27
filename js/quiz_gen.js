/* ═══════════════════════════════════════════════════════════════════
   quiz_gen.js — 測試模式的題目產生器引擎（每一局題目都不同）
   ───────────────────────────────────────────────────────────────────
   · 一局：從 index.html 按「測試模式」進來＝新的一局。一進來就把 8 關全部產生好、
     整份存進瀏覽器；重玩同一關、重新整理都不會變。按「←」回主選單再進來，才是新的一局。
     新的一局裡，每一關的參數（號碼、路名、物品、人物、顏色…）會避開上一局這一關用過的值；
     左轉／右轉這種二選一的，純隨機。
   · 每一關＝一個故事範本（人寫的口語文章，挖空）＋一組從 quiz_pools.js 抽出的參數。
   · 每個錯誤選項都帶「混淆類型」與一句說明：答錯時顯示，結果頁拿來統計。
   · 出題規則（每題唯一正解、誘答必須和紙條明確矛盾、同一件事只問一次、
     一題的題目或正解不可洩漏另一題的答案…）見 note/FadingMemory記憶混淆說明.md 第 8～9 節。
   · 三個主軸（生日／旅遊／看病）各自在自己的檔案裡完整撰寫 1～8 關
     （js/quiz_happyBirthday.js、js/quiz_travel.js、js/quiz_health.js）；
     本檔案只提供共用工具（可重現亂數、誘答、日期、角色名字、回想題…），不含任何關卡內容。
   · 驗證：主控台執行 QuizGen.check(QuizGen.create(任意數字).levels)，回傳空陣列＝沒有問題。
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    var P = global.QUIZ_POOLS;
    var QuizGen = {};

    var GEN_V = 4;                      /* 存檔格式版本：格式改了就加一（舊存檔作廢、重新產生） */
    var KEY = 'fm.quiz.session';
    var FRESH = 'fm.quiz.fresh';         /* 主選單按「測試模式」時設為 true → 進來就開新的一局 */


    /* 混淆類型（結果頁的名稱與白話說明） */
    var KINDS = QuizGen.KINDS = {
        '張冠李戴': '把別樣東西的特徵，安到這一樣上',
        '新舊混淆': '選了已經被取消、被改掉的',
        '似曾相識': '選了只是順口提到的',
        '常理陷阱': '照一般習慣選，沒照紙條',
        '拼湊組合': '把兩個說法拼成一個',
        '數字相近': '數字對調，或只差一點',
        '否定遺漏': '「要」和「不要」弄反了',
        '順序顛倒': '先後弄反了',
        '差一點點': '大意對，細節錯',
        '計算失誤': '記得數字，但算錯了'
    };

    /* ═══ 小工具 ═══ */

    /* 可重現的亂數（同一個種子 → 同一串亂數） */
    function mulberry32(a) {
        return function () {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            var t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    /* 故事範本：'{who}打電話來' → 代入 v.who；少了參數就報錯（產生器會換種子重試） */
    function T(s, v) {
        return s.replace(/\{([A-Za-z0-9_]+)\}/g, function (m, k) {
            if (v[k] == null) throw new Error('範本缺少參數 ' + k);
            return v[k];
        });
    }

    var CN = '零一二三四五六七八九';
    function cnNum(n) {
        if (n < 10) return CN[n];
        if (n === 10) return '十';
        if (n < 20) return '十' + CN[n - 10];
        return CN[Math.floor(n / 10)] + '十' + (n % 10 ? CN[n % 10] : '');
    }
    function cnCount(n) { return n === 2 ? '兩' : cnNum(n); }   /* 數量：兩個、三本 */

    /* 兩位數：兩個數字不同、不含 0（才能對調出另一個號碼） */
    function twoDiff(n) { return n % 10 !== 0 && Math.floor(n / 10) !== n % 10; }
    function threeDiff(n) {
        var s = String(n);
        return s.indexOf('0') < 0 && s[0] !== s[1] && s[1] !== s[2] && s[0] !== s[2];
    }
    function rev2(n) { return (n % 10) * 10 + Math.floor(n / 10); }
    /* 數字的所有排列（不含自己、不以 0 開頭） */
    function perms(n) {
        var s = String(n);
        var out = {};
        (function go(pre, rest) {
            if (!rest) { if (pre[0] !== '0' && pre !== s) out[pre] = 1; return; }
            for (var i = 0; i < rest.length; i++) go(pre + rest[i], rest.slice(0, i) + rest.slice(i + 1));
        })('', s);
        return Object.keys(out).map(Number);
    }

    function keyOf(v) { return typeof v === 'object' ? JSON.stringify(v) : String(v); }

    /* ═══ 日曆：每一關都有明確的日期（年份不寫出來，只拿來算星期幾）═══ */
    var YEAR = 2026;
    var WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    var DAY_MS = 86400000;
    function dayOf(ms) {
        var t = new Date(ms);
        var m = t.getUTCMonth() + 1;
        var d = t.getUTCDate();
        var w = WEEK[t.getUTCDay()];
        return { t: ms, m: m, d: d, w: w, s: m + '月' + d + '日', sw: m + '月' + d + '日（' + w + '）' };
    }
    function mkDay(m, d) { return dayOf(Date.UTC(YEAR, m - 1, d)); }
    function addDays(day, n) { return dayOf(day.t + n * DAY_MS); }
    function between(a, b) { return Math.round((b.t - a.t) / DAY_MS); }
    /* 「後天」「五天後」 */
    function fromNow(today, day) {
        var n = between(today, day);
        return n === 1 ? '明天' : n === 2 ? '後天' : cnNum(n) + '天後';
    }

    /* 季節與衣服（旅遊主軸：記住出發日期 → 換算季節 → 決定帶什麼衣服） */
    var SEASON = ['冬天', '冬天', '春天', '春天', '春天', '夏天', '夏天', '夏天', '秋天', '秋天', '秋天', '冬天'];
    var WEAR = { '春天': '春天的薄外套', '夏天': '夏天的短袖', '秋天': '秋天的長袖', '冬天': '冬天的羽絨衣' };
    function seasonOf(day) { return SEASON[day.m - 1]; }
    function wearOf(day) { return WEAR[seasonOf(day)]; }

    /* 每一局的時間軸：8 關各有「今天」today 與「那件事的日期」ev，一關比一關晚 */
    function timeline(G, step, ev) {
        var t = mkDay(G.int(1, 12), G.int(1, 20));
        var out = [];
        for (var i = 0; i < 8; i++) {
            if (i) t = addDays(t, G.int(step[0], step[1]));
            out.push({ today: t, ev: addDays(t, G.int(ev[0], ev[1])) });
        }
        return out;
    }

    /* ═══ 角色名字：每一局替家人取名字（同一局裡，女兒永遠是同一個名字）═══ */
    var CAST = {
        '老伴': ['秀英', '玉蘭', '阿雄', '文雄', '素珠'],
        '女兒': ['淑芬', '雅婷', '佩君', '怡君'],
        '兒子': ['志明', '俊傑', '家豪', '建宏'],
        '媳婦': ['惠美', '淑惠', '美華', '麗娟'],
        '女婿': ['文彬', '國華', '冠宇', '承翰'],
        '孫子': ['小寶', '阿翔', '小宇', '阿凱'],
        '孫女': ['小萱', '欣欣', '小晴', '安安'],
        '姪子': ['阿德', '明哲', '宗翰'],
        '外甥女': ['佳穎', '筱雯', '思妤']
    };
    var ROLES = {};
    ['home', 'kin', 'kids', 'relatives', 'grand'].forEach(function (k) { ROLES[k] = P[k].slice(); });
    function applyCast(G) {
        var nm = {};
        Object.keys(CAST).forEach(function (r) { nm[r] = r + G.any(CAST[r]); });
        Object.keys(ROLES).forEach(function (k) { P[k] = ROLES[k].map(function (r) { return nm[r]; }); });
        return nm;
    }

    /* 誘答：v 選項文字、k 混淆類型、w 答錯時的說明（省略就用預設說法） */
    function L(v, k, w) { return { v: v, k: k, w: w }; }

    function defaultWhy(k, v, ans) {
        switch (k) {
            case '數字相近': return '「' + v + '」和「' + ans + '」很像，紙條上是「' + ans + '」。';
            case '新舊混淆': return '「' + v + '」後來改掉了，最後是「' + ans + '」。';
            case '似曾相識': return '「' + v + '」只是順口提到的。';
            case '常理陷阱': return '一般是「' + v + '」沒錯，但這次紙條寫的是「' + ans + '」。';
            case '拼湊組合': return '「' + v + '」是把兩個說法拼在一起了。';
            case '否定遺漏': return '「要」和「不要」弄反了，答案是「' + ans + '」。';
            case '順序顛倒': return '先後弄反了，這裡是「' + ans + '」。';
            case '計算失誤': return '再算一次，答案是「' + ans + '」。';
            case '張冠李戴': return '「' + v + '」是別樣東西的，這裡是「' + ans + '」。';
            default: return '差一點點，紙條上是「' + ans + '」。';
        }
    }

    /* ═══ 產生器：一關一個，帶著「上一局這一關用過的值」 ═══ */
    function Gen(seed, avoid) {
        this.r = mulberry32(seed >>> 0);
        this.avoid = {};
        var self = this;
        (avoid || []).forEach(function (k) { self.avoid[k] = 1; });
        this.used = [];
    }
    Gen.prototype.int = function (a, b) { return a + Math.floor(this.r() * (b - a + 1)); };
    Gen.prototype.coin = function () { return this.r() < 0.5; };
    Gen.prototype.any = function (arr) { return arr[Math.floor(this.r() * arr.length)]; };
    Gen.prototype.shuffle = function (arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(this.r() * (i + 1));
            var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    };
    Gen.prototype.sample = function (arr, n) { return this.shuffle(arr).slice(0, n); };

    /* 抽參數：優先抽上一局沒用過的；抽到的記下來（下一局避開）。
       n 省略 → 回傳一個；exclude → 這次不能抽的值 */
    Gen.prototype.pick = function (arr, n, exclude) {
        var self = this;
        var ex = {};
        (exclude || []).forEach(function (v) { ex[keyOf(v)] = 1; });
        var pool = arr.filter(function (v) { return !ex[keyOf(v)]; });
        var fresh = this.shuffle(pool.filter(function (v) { return !self.avoid[keyOf(v)]; }));
        var stale = this.shuffle(pool.filter(function (v) { return self.avoid[keyOf(v)]; }));
        var out = fresh.concat(stale).slice(0, n == null ? 1 : n);
        if (out.length < (n == null ? 1 : n)) throw new Error('題庫不夠抽');
        out.forEach(function (v) { self.used.push(keyOf(v)); });
        return n == null ? out[0] : out;
    };
    /* 抽數字。範圍很小的數字（樓層、數量）給一個 key：各自記住上一局的值，
       不會因為「別的參數上一局用過 3」就不能用 3 */
    Gen.prototype.num = function (a, b, exclude, filter, key) {
        var arr = [];
        for (var i = a; i <= b; i++) {
            if (exclude && exclude.indexOf(i) >= 0) continue;
            if (filter && !filter(i)) continue;
            arr.push(i);
        }
        if (!key) return this.pick(arr);
        var self = this;
        var fresh = arr.filter(function (n) { return !self.avoid[key + '=' + n]; });
        var v = this.any(fresh.length ? fresh : arr);
        this.used.push(key + '=' + v);
        return v;
    };

    /* 數字的誘答：對調（236→263）＋差一點（±step、±2step） */
    Gen.prototype.near = function (n, fmt, o) {
        o = o || {};
        var lo = o.lo == null ? 1 : o.lo;
        var hi = o.hi == null ? 99999 : o.hi;
        var step = o.step || 1;
        var out = [];
        var self = this;
        if (o.swap !== false) {
            this.shuffle(perms(n)).forEach(function (p) { if (p >= lo && p <= hi) out.push(L(fmt(p), '數字相近')); });
        }
        [1, 2, 3].forEach(function (d) {
            self.shuffle([n - d * step, n + d * step]).forEach(function (x) {
                if (x >= lo && x <= hi && x !== n) out.push(L(fmt(x), '數字相近'));
            });
        });
        return out;
    };

    /* 從題庫池拿幾個「不是答案」的值當誘答 */
    Gen.prototype.others = function (pool, not, kind, n) {
        var ex = [].concat(not);
        return this.sample(pool.filter(function (v) { return ex.indexOf(v) < 0; }), n || 3).map(function (v) { return L(v, kind || '差一點點'); });
    };

    /* 一題：答案＋誘答（依序列出，越前面越優先；三個誘答盡量來自不同的混淆類型） */
    Gen.prototype.q = function (text, tag, ans, lures, opt) {
        ans = String(ans);
        var seen = {};
        seen[ans] = 1;
        var list = [];
        lures.forEach(function (l) {
            if (!l || l.v == null) return;
            var v = String(l.v);
            if (seen[v]) return;
            seen[v] = 1;
            list.push({ v: v, k: l.k, w: l.w });
        });
        var chosen = [];
        var kinds = {};
        list.forEach(function (l) { if (chosen.length < 3 && !kinds[l.k]) { chosen.push(l); kinds[l.k] = 1; } });
        list.forEach(function (l) { if (chosen.length < 3 && chosen.indexOf(l) < 0) chosen.push(l); });
        if (chosen.length < 3) throw new Error('誘答不足：' + text);
        var opts = this.shuffle([{ v: ans, k: null }].concat(chosen));
        return {
            q: text, t: tag,
            o: opts.map(function (x) { return x.v; }),
            c: opts.map(function (x) { return x.k; }).indexOf(null),
            k: opts.map(function (x) { return x.k; }),
            w: opts.map(function (x) { return x.k ? (x.w || defaultWhy(x.k, x.v, ans)) : null; }),
            old: !!(opt && opt.old),
            must: !!(opt && opt.must)
        };
    };

    /* 「哪一個說法完全正確？」：slots＝[{val, alts:[誘答]}]；正解取 n 個真的欄位，
       每個誘答只換掉一個欄位（其他照舊是真的） */
    Gen.prototype.attrQ = function (text, slots, render, n) {
        var self = this;
        var idx = slots.map(function (s, i) { return i; });
        var truth = this.shuffle(idx).slice(0, n);
        var ans = render(slots.map(function (s, i) { return truth.indexOf(i) >= 0 ? s.val : null; }));
        var lures = [];
        slots.forEach(function (s, i) {
            s.alts.forEach(function (alt) {
                var keep = self.shuffle(idx.filter(function (j) { return j !== i; })).slice(0, n - 1);
                var vals = slots.map(function (t, j) { return j === i ? alt.v : (keep.indexOf(j) >= 0 ? t.val : null); });
                lures.push(L(render(vals), alt.k, alt.w));
            });
        });
        return this.q(text, '組合', ans, this.shuffle(lures), { must: true });
    };

    /* ═══ 日期題 ═══ */
    /* 哪一天？誘答＝前後一天、差一個禮拜、月日對調；extra＝放最前面的誘答（例如「今天的日期」） */
    Gen.prototype.dateQ = function (text, day, extra, opt) {
        var lures = (extra || []).slice();
        if (day.d <= 12 && day.d !== day.m) lures.push(L(day.d + '月' + day.m + '日', '數字相近', '月和日對調了，是「' + day.s + '」。'));
        var near = this.shuffle([1, -1, 2, -2]).map(function (n) { return L(addDays(day, n).s, '數字相近'); });
        lures = lures.concat(near.slice(0, 2), [L(addDays(day, 7).s, '數字相近', '差了一個禮拜，是「' + day.s + '」。')], near.slice(2));
        return this.q(text, '日期', day.s, lures, opt);
    };
    Gen.prototype.weekQ = function (text, day, extra, opt) {
        var i = WEEK.indexOf(day.w);
        var lures = (extra || []).concat([WEEK[(i + 1) % 7], WEEK[(i + 6) % 7], WEEK[(i + 2) % 7], WEEK[(i + 5) % 7]].map(function (w) {
            return L(w, '差一點點', '那天是' + day.w + '。');
        }));
        return this.q(text, '日期', day.w, lures, opt);
    };
    /* 還有幾天？（要同時記住兩個日期） */
    Gen.prototype.daysQ = function (text, from, to, opt) {
        var n = between(from, to);
        var f = function (x) { return cnCount(x) + '天'; };
        var why = from.s + '到' + to.s + '，是' + cnNum(n) + '天。';
        var lures = [L(f(n + 1), '計算失誤', why)];
        if (n > 1) lures.push(L(f(n - 1), '計算失誤', why));
        if (n + 7 <= 60) lures.push(L(f(n + 7), '計算失誤', why));
        lures = lures.concat(this.near(n, f, { lo: 1, hi: 60, swap: false }).map(function (l) { return L(l.v, '計算失誤', why); }));
        return this.q(text, '日期', f(n), lures, opt);
    };
    /* 要帶哪一種衣服？extra＝別的日期對應的衣服（張冠李戴） */
    Gen.prototype.wearQ = function (text, day, extra, opt) {
        var ans = wearOf(day);
        var why = day.s + '是' + seasonOf(day) + '，要帶' + ans.slice(3) + '。';
        var lures = (extra || []).filter(function (l) { return l.v !== ans; });
        Object.keys(WEAR).forEach(function (s) { if (WEAR[s] !== ans) lures.push(L(WEAR[s], '差一點點', why)); });
        return this.q(text, '季節', ans, lures, opt);
    };

    /* 從候選題裡挑出這一關的題數：must 一定要、「一開始」題不超過 maxOld，最後打亂順序 */
    function finish(G, cands, count, maxOld) {
        var out = cands.filter(function (q) { return q.must; });
        var old = out.filter(function (q) { return q.old; }).length;
        G.shuffle(cands.filter(function (q) { return !q.must; })).forEach(function (q) {
            if (out.length >= count) return;
            if (q.old && old >= (maxOld || 0)) return;
            if (q.old) old++;
            out.push(q);
        });
        if (out.length !== count) throw new Error('題數不對：' + out.length + '／' + count);
        return G.shuffle(out);
    }

    /* 花的範圍：淡○色、深○色、粉紅色；誘答＝把字拆開重組 */
    function flowerSet(G) {
        var h = G.pick(P.hues, 2);
        var no = G.pick(P.noColors);
        return {
            ok: ['淡' + h[0] + '色', '深' + h[1] + '色', '粉紅色'],
            mix: ['深' + h[0] + '色', '淡' + h[1] + '色'],
            no: no.c,
            noWhy: no.why
        };
    }
    function flowerQs(G, fs, flower) {
        var yes = G.any(fs.ok.slice(0, 2));
        return [
            G.q('哪一種顏色的' + flower + '可以買？', '範圍', yes,
                fs.mix.map(function (c) { return L(c, '拼湊組合', '「' + c + '」是把紙條上的兩個顏色拼在一起了。'); })
                    .concat([L(fs.no, '否定遺漏', '紙條特別說不要' + fs.no + '的。')]), { must: true }),
            G.q('哪一種顏色的' + flower + '不要？', '範圍', fs.no,
                fs.ok.map(function (c) { return L(c, '否定遺漏', '「' + c + '」是可以買的，不要的是「' + fs.no + '」。'); })
                    .concat(fs.mix.map(function (c) { return L(c, '拼湊組合'); })))
        ];
    }

    /* 轉彎的誘答 */
    function turnQ(G, text, t, other, otherWhy) {
        var opp = t === '右' ? '左' : '右';
        var lures = [];
        if (other && other !== t) lures.push(L(opp + '轉', '順序顛倒', otherWhy));
        else lures.push(L(opp + '轉', '差一點點'));
        lures.push(L('直走', '差一點點'), L('迴轉', '差一點點'));
        return G.q(text, '方向', t + '轉', lures);
    }

    function people(G, n, exclude) { return G.pick(P.friends, n, exclude); }
    function otherGrand(g) { return P.grand.filter(function (x) { return x !== g; })[0]; }

    /* ═══ 故事主軸（範本）═══
       每一局先挑一個主軸，8 關都用同一個主軸（不混用），讓關與關之間也互相干擾。
       主軸：{ id, name, names:[8 個關名], setup(G) → 整局共用的參數 S, levels:[8 個 fn(G, S) ] }
       新增主軸：在另一個檔案呼叫 QuizGen.addTheme({...})，並加到 boot.js 的載入清單（quiz_gen.js 之後）。
       1～8 關都由各主軸自己完整撰寫，不再共用 L1～L4；本檔案只提供下面 QuizGen.lib 這些共用工具。 */
    var THEMES = {};
    var ORDER = [];
    QuizGen.addTheme = function (th) {
        if (!THEMES[th.id]) ORDER.push(th.id);
        THEMES[th.id] = th;
    };
    QuizGen.themes = function () { return ORDER.map(function (id) { return { id: id, name: THEMES[id].name }; }); };

    /* 給各主軸共用的工具：Gen 的方法（見上）、範本代入、誘答、日期、角色名字、花色題、轉彎題… */
    QuizGen.lib = {
        P: P, T: T, L: L, cnNum: cnNum, cnCount: cnCount, twoDiff: twoDiff, threeDiff: threeDiff, rev2: rev2, perms: perms,
        finish: finish, flowerSet: flowerSet, flowerQs: flowerQs, turnQ: turnQ, people: people, otherGrand: otherGrand,
        mkDay: mkDay, addDays: addDays, between: between, fromNow: fromNow, timeline: timeline, seasonOf: seasonOf, wearOf: wearOf, WEEK: WEEK
    };

    var TAGS = ['條列・一件事', '口語・數字很像', '講的順序≠做的順序', '特徵互相搭配', '兩段行程・誰要的', '一改再改', '新舊兩個版本', '綜合大魔王'];

    /* ═══ 一局 ═══ */
    function newSeed() {
        try {
            var a = new Uint32Array(1);
            global.crypto.getRandomValues(a);
            return a[0];
        } catch (e) {
            return Math.floor(Math.random() * 4294967296);
        }
    }

    function buildLevel(th, S, i, seed, avoid) {
        var err = null;
        for (var attempt = 0; attempt < 12; attempt++) {
            var G = new Gen((seed + (i + 1) * 7919 + attempt * 104729) >>> 0, avoid);
            try {
                S.i = i;
                var body = th.levels[i](G, S);
                return {
                    level: {
                        id: i + 1, name: th.names[i], tag: TAGS[i], note: body.note, date: S.tl[i].today.sw,
                        qs: body.qs.map(function (q) { return { q: q.q, t: q.t, o: q.o, c: q.c, k: q.k, w: q.w, old: q.old }; })
                    },
                    used: G.used
                };
            } catch (e) { err = e; }
        }
        throw err;
    }

    /* 產生一整局。prev：上一局（避開它的主軸與每一關用過的值）；theme：指定主軸（驗證用） */
    QuizGen.create = function (seed, prev, theme) {
        seed = seed == null ? newSeed() : seed >>> 0;
        prev = prev || {};
        var pr = mulberry32(seed ^ 0x5bd1e995);
        var ids = ORDER.filter(function (id) { return id !== prev.theme; });
        if (!ids.length) ids = ORDER.slice();
        var themeId = THEMES[theme] ? theme : ids[Math.floor(pr() * ids.length)];
        var th = THEMES[themeId];
        var prevUsed = prev.theme === themeId ? prev.used : null;
        var cast = applyCast(new Gen((seed ^ 0x2545f491) >>> 0));
        var SG = new Gen((seed ^ 0x9e3779b9) >>> 0, prevUsed && prevUsed.shared);
        var S = th.setup(SG);
        var levels = [];
        var used = { shared: SG.used };
        for (var i = 0; i < 8; i++) {
            var r = buildLevel(th, S, i, seed, prevUsed && prevUsed[i + 1]);
            levels.push(r.level);
            used[i + 1] = r.used;
        }
        addRecalls(levels, new Gen((seed ^ 0x7f4a7c15) >>> 0));
        return { v: GEN_V, seed: seed, theme: themeId, themeName: th.name, cast: cast, created: Date.now(), levels: levels, used: used };
    };

    /* ═══ 跨關回想題：後面的關卡，隨機插進前面關卡的題目，故意打亂思緒 ═══
       第 5 關＋1 題第 1 關；第 6 關＋1 題第 2 關；第 7 關＋第 2、3 關各 1 題；第 8 關＋第 2、3 關各 1 題、第 4 關 2 題。
       同一局的 8 關是一起產生的，所以回想題問的就是這一局前面那幾關的紙條。 */
    var RECALL = { 5: [1], 6: [2], 7: [2, 3], 8: [2, 3, 4, 4] };
    QuizGen.RECALL = RECALL;
    function addRecalls(levels, G) {
        Object.keys(RECALL).forEach(function (id) {
            var lv = levels[id - 1];
            var texts = lv.qs.map(function (q) { return q.q; });
            var picked = [];
            RECALL[id].forEach(function (src) {
                var pool = levels[src - 1].qs.filter(function (q) { return !q.old && picked.indexOf(q) < 0; });
                var fresh = pool.filter(function (q) { return texts.indexOf(q.q) < 0; });
                var q = G.any(fresh.length ? fresh : pool);
                picked.push(q);
                texts.push(q.q);
                /* 選項重新洗牌，不能靠「上次選第幾個」作答 */
                var idx = G.shuffle([0, 1, 2, 3]);
                var copy = {
                    q: q.q, t: q.t, old: false, from: src, fromName: levels[src - 1].name,
                    o: idx.map(function (j) { return q.o[j]; }), k: idx.map(function (j) { return q.k[j]; }), w: idx.map(function (j) { return q.w[j]; })
                };
                copy.c = copy.k.indexOf(null);
                /* 插在第 2 題以後的隨機位置 */
                lv.qs.splice(G.int(1, lv.qs.length), 0, copy);
            });
        });
    }
    /* 取得這一局：主選單剛按「測試模式」→ 新的一局；否則沿用存著的（重新整理也一樣）。
       網址加 ?seed=數字 可以重現某一局（驗證用）。 */
    QuizGen.session = function () {
        var s = UI.store.get(KEY, null);
        if (s && s.v !== GEN_V) s = null;
        var m = /[?&]seed=(\d+)/.exec(global.location.search);
        var tm = /[?&]theme=([a-z]+)/.exec(global.location.search);
        var want = tm ? tm[1] : null;
        var make = null;
        if (m) { if (!s || s.seed !== (+m[1] >>> 0) || (want && s.theme !== want)) make = +m[1]; }
        else if (!s || UI.store.get(FRESH, false) || (want && s.theme !== want)) make = newSeed();
        if (make != null) {
            s = QuizGen.create(make, s, want);
            UI.store.set(KEY, s);
        }
        UI.store.set(FRESH, false);
        return s;
    };

    /* 主選單呼叫：下次進測試模式時開新的一局 */
    QuizGen.markFresh = function () { UI.store.set(FRESH, true); };

    /* 自我檢查：題數、選項、段落長度、「一開始」題比例 */
    QuizGen.check = function (levels) {
        var issues = [];
        levels.forEach(function (lv) {
            var tag = '第' + lv.id + '關';
            var want = [4, 6, 8, 12, 16, 20, 24, 32][lv.id - 1] + (RECALL[lv.id] || []).length;
            if (lv.qs.length !== want) issues.push(tag + ' 題數 ' + lv.qs.length + '／' + want);
            lv.note.forEach(function (p) { if (p.length > 90) issues.push(tag + ' 段落 ' + p.length + ' 字：' + p.slice(0, 10)); });
            var old = 0;
            var asked = {};
            var recalls = [];
            lv.qs.forEach(function (q) {
                if (q.old) old++;
                if (q.from) recalls.push(q.from);
                var key = (q.from || '') + q.q;
                if (asked[key]) issues.push(tag + ' 重複的題目：' + q.q);
                asked[key] = 1;
                if (q.o.length !== 4) issues.push(tag + ' 選項不是 4 個：' + q.q);
                if (q.o.filter(function (o, i) { return q.o.indexOf(o) !== i; }).length) issues.push(tag + ' 選項重複：' + q.q);
                if (q.k[q.c] !== null || q.k.filter(function (x) { return x === null; }).length !== 1) issues.push(tag + ' 正解標記錯誤：' + q.q);
                q.o.forEach(function (o) { if (o.length > 13) issues.push(tag + ' 選項太長：' + o); });
                if (q.q.length > 22) issues.push(tag + ' 題目太長：' + q.q);
            });
            if (old > Math.floor(lv.qs.length / 5)) issues.push(tag + ' 「一開始」題太多：' + old);
            if (recalls.sort().join() !== (RECALL[lv.id] || []).slice().sort().join()) issues.push(tag + ' 回想題不對：' + recalls.join());
        });
        return issues;
    };

    global.QuizGen = QuizGen;
})(window);
