/* ═══════════════════════════════════════════════════════════════════
   quiz_gen.js — 測試模式的題目產生器（每一局題目都不同）
   ───────────────────────────────────────────────────────────────────
   · 一局：從 index.html 按「測試模式」進來＝新的一局。一進來就把 8 關全部產生好、
     整份存進瀏覽器；重玩同一關、重新整理都不會變。按「←」回主選單再進來，才是新的一局。
     新的一局裡，每一關的參數（號碼、路名、物品、人物、顏色…）會避開上一局這一關用過的值；
     左轉／右轉這種二選一的，純隨機。
   · 每一關＝一個故事範本（人寫的口語文章，挖空）＋一組從 quiz_pools.js 抽出的參數。
   · 每個錯誤選項都帶「混淆類型」與一句說明：答錯時顯示，結果頁拿來統計。
   · 出題規則（每題唯一正解、誘答必須和紙條明確矛盾、同一件事只問一次、
     一題的題目或正解不可洩漏另一題的答案…）見 note/FadingMemory記憶混淆說明.md 第 8～9 節。
   · 驗證：主控台執行 QuizGen.check(QuizGen.create(任意數字).levels)，回傳空陣列＝沒有問題。
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    var P = global.QUIZ_POOLS;
    var QuizGen = {};

    var GEN_V = 3;                      /* 存檔格式版本：格式改了就加一（舊存檔作廢、重新產生） */
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

    /* ═══ 第 1 關：新手暖身（條列、一件事，幾乎沒有干擾）═══ */
    function L1(G, S, X) {
        var e = G.pick(X.errands1);
        var hd = X.head1(G, S, S.tl[S.i]);
        var bus = G.num(12, 98, null, twoDiff);
        var stop = G.pick(P.stops);
        var floor = G.num(2, 5, null, null, 'floor');
        var n = G.num(2, 4, [floor], null, 'n');
        var v = { bus: bus, stop: stop, place: e.place, floor: floor, act: e.act, n: n, u: e.u, thing: e.thing };
        var note = [
            hd.line,
            T('搭 {bus} 號公車，在{stop}下車，', v),
            T('去{place} {floor} 樓，{act} {n} {u}{thing}。', v)
        ];
        var fl = function (x) { return x + ' 樓'; };
        var cu = function (x) { return x + ' ' + e.u; };
        var qs = [
            G.q('要搭幾號公車？', '數字', bus, G.near(bus, String, { lo: 10, hi: 99 })),
            G.q('要在哪一站下車？', '地點', stop, G.others(P.stops, stop)),
            G.q(T('{place}在幾樓？', v), '數字', fl(floor),
                [L(fl(n), '張冠李戴', n + ' 是' + e.thing + '的數量，不是樓層。')].concat(G.near(floor, fl, { lo: 1, hi: 9, swap: false }))),
            G.q(T('要{act}幾{u}{thing}？', v), '數字', cu(n),
                [L(cu(floor), '張冠李戴', floor + ' 是樓層，不是' + e.thing + '的數量。')].concat(G.near(n, cu, { lo: 1, hi: 9, swap: false })))
        ];
        return { note: note, qs: finish(G, qs.concat(hd.qs), 4) };
    }

    /* ═══ 第 2 關：兩件差事（口語；門牌號碼是公車號碼倒過來）═══ */
    function L2(G, S, X) {
        var who = G.pick(P.home.concat(P.friends));
        var cx = X.ctx2(G, S, S.tl[S.i], who);
        var ctx = cx.ctx;
        var cs = G.pick(X.shops, 2);
        var c1 = cs[0];
        var c2 = cs[1];
        var i1 = G.pick(c1.items);
        var i2 = G.pick(c2.items);
        var rest2 = G.shuffle(c2.items.filter(function (x) { return x !== i2; }));
        var lure = rest2[0];
        var sib2 = rest2[1];
        var sib1 = G.any(c1.items.filter(function (x) { return x !== i1; }));
        var bus = G.num(12, 98, null, twoDiff);
        var house = rev2(bus);
        var stop = G.pick(P.stops);
        var n1 = G.num(1, 4, null, null, 'n1');
        var n2 = G.num(1, 4, [n1], null, 'n2');
        var v = {
            who: who, bus: bus, stop: stop, s1: c1.shop, s2: c2.shop, n1: cnCount(n1), n2: cnCount(n2),
            u1: c1.u, u2: c2.u, i1: i1, i2: i2, lure: lure, house: house, ctx: ctx, when: cx.when
        };
        var note = [
            T('{when}，{who}打電話來說：「{ctx}。」', v),
            T('「下班後幫我跑兩個地方好不好？先搭 {bus} 號公車到{stop}，去{s1}買{n1}{u1}{i1}。」', v),
            T('「然後走到{s2}，買{n2}{u2}{i2}。上次你買成{lure}，這次別再買錯囉！」掛電話前，{who}還說自己家的門牌換新了，是 {house} 號。', v)
        ];
        var f1 = function (x) { return cnCount(x) + c1.u; };
        var f2 = function (x) { return cnCount(x) + c2.u; };
        var lureWhy = '「' + lure + '」是上次買錯的。';
        var qs = [
            G.q('要搭幾號公車？', '數字', bus,
                [L(house, '似曾相識', house + ' 是' + who + '家的門牌號碼。')].concat(G.near(bus, String, { lo: 10, hi: 99 }))),
            G.q('要在哪一站下車？', '地點', stop, G.others(P.stops, stop)),
            G.q(T('在{s1}要買什麼？', v), '物品', i1,
                [L(i2, '張冠李戴', i2 + '是在' + c2.shop + '買的。'), L(lure, '似曾相識', lureWhy), L(sib1, '差一點點')]),
            G.q(T('在{s1}要買幾{u1}？', v), '數字', f1(n1),
                [L(f1(n2), '張冠李戴', '「' + cnCount(n2) + '」是在' + c2.shop + '買的數量。')].concat(G.near(n1, f1, { lo: 1, hi: 6, swap: false }))),
            G.q(T('在{s2}要買什麼？', v), '物品', i2,
                [L(lure, '似曾相識', lureWhy), L(i1, '張冠李戴', i1 + '是在' + c1.shop + '買的。'), L(sib2, '差一點點')]),
            G.q(T('在{s2}要買幾{u2}？', v), '數字', f2(n2),
                [L(f2(n1), '張冠李戴', '「' + cnCount(n1) + '」是在' + c1.shop + '買的數量。')].concat(G.near(n2, f2, { lo: 1, hi: 6, swap: false })))
        ];
        return { note: note, qs: finish(G, qs.concat(cx.qs), 6) };
    }

    /* ═══ 第 3 關：先後順序（講的順序和做的順序不一樣）═══ */
    function L3(G, S, X) {
        var who = G.pick(P.home.concat(P.friends));
        var nb = people(G, null, [who]);
        var hd = X.head3(G, S, S.tl[S.i]);
        var es = G.pick(X.errands3, 3);
        var A = es[0];
        var B = es[1];
        var C = es[2];
        var nA = G.num(1, 5, null, null, 'nA');
        var nB = G.num(1, 5, [nA], null, 'nB');
        var ns = [nA, nB, G.num(1, 5, [nA, nB], null, 'nC')];
        var noise = G.pick(P.noiseShops);
        var nn = G.num(1, 5, ns, null, 'nn');
        var BE = es[G.int(0, 2)];
        var bus = G.num(12, 98, null, twoDiff);
        var act = function (e, i) { return T(e.act, { n: cnCount(ns[i]) }); };
        var v = {
            who: who, nb: nb, bus: bus, Ap: A.place, Aa: act(A, 0), Ae: A.early, Bp: B.place, Ba: act(B, 1),
            Cp: C.place, Ca: act(C, 2), Cl: C.late, Xp: BE.place, ns: noise.shop, nn: cnCount(nn), nu: noise.u, nt: noise.thing
        };
        var form = G.int(0, 2);
        var narr;
        var body;
        if (form === 0) {
            narr = [B, A, C];
            body = [
                T('{who}傳來一段語音：「今天下班，幫我去{Bp}{Ba}。不過去{Bp}之前，要先到{Ap}{Aa}，因為{Ae}。」', v),
                T('「還有，{Cp}那邊要{Ca}，這件放在最後，因為{Cl}。」', v)
            ];
        } else if (form === 1) {
            narr = [C, A, B];
            body = [
                T('{who}傳來一段語音：「今天回家前，最後記得去{Cp}{Ca}，因為{Cl}。」', v),
                T('「但一出門，第一件事是去{Ap}{Aa}，因為{Ae}。做完這件，再去{Bp}{Ba}。」', v)
            ];
        } else {
            narr = [B, C, A];
            body = [
                T('{who}傳來一段語音：「今天下班，幫我去{Bp}{Ba}，然後去{Cp}{Ca}。」', v),
                T('「喔不對，這兩件之前，要先去{Ap}{Aa}，因為{Ae}。{Cp}那件放最後，因為{Cl}。」', v)
            ];
        }
        var note = [hd.line].concat(body, [
            T('{who}還提醒你，去{Xp}要搭 {bus} 號公車，比較快。', v),
            T('聽完語音，你想起{nb}說過，{Cp}旁邊新開了一家{ns}，開幕送{nn}{nu}{nt}，不過今天沒空去。', v)
        ]);

        var exec = [A, B, C];
        var ord = ['第一件', '第二件', '最後一件'];
        var noiseLabel = '逛' + noise.shop;
        var noiseWhy = noise.shop + '只是順口提到的新店。';
        var qs = [];
        exec.forEach(function (e, i) {
            var lures = [];
            if (narr[i] !== e) lures.push(L(narr[i].k, '順序顛倒', '紙條上先講到「' + narr[i].k + '」，但它是' + ord[exec.indexOf(narr[i])] + '。'));
            exec.forEach(function (o, j) { if (j !== i) lures.push(L(o.k, '順序顛倒', '「' + o.k + '」是' + ord[j] + '。')); });
            lures.push(L(noiseLabel, '似曾相識', noiseWhy));
            qs.push(G.q(ord[i] + '要做什麼？', '順序', e.k, lures));
        });
        qs.push(G.q('哪一件事要搭公車？', '配對', BE.k,
            exec.filter(function (e) { return e !== BE; }).map(function (e) { return L(e.k, '張冠李戴', '搭公車是為了去' + BE.place + '。'); })
                .concat([L(noiseLabel, '似曾相識', noiseWhy)])));
        qs.push(G.q('要搭幾號公車？', '數字', bus, G.near(bus, String, { lo: 10, hi: 99 })));
        exec.forEach(function (e, i) {
            var f = function (x) { return cnCount(x) + e.u; };
            var lures = [];
            exec.forEach(function (o, j) { if (j !== i) lures.push(L(f(ns[j]), '張冠李戴', '「' + cnCount(ns[j]) + '」是' + o.k + '的數量。')); });
            lures.push(L(f(nn), '似曾相識', '「' + cnCount(nn) + '」是新店開幕送的數量。'));
            qs.push(G.q(e.q, '數字', f(ns[i]), lures.concat(G.near(ns[i], f, { lo: 1, hi: 7, swap: false }))));
        });
        return { note: note, qs: finish(G, qs.concat(hd.qs), 8) };
    }

    /* ═══ 第 4 關：顏色形狀（四樣東西共用三種顏色、三種形狀；反常理的水果；三個特徵的罐子）═══ */
    function L4(G, S, X) {
        var who = G.pick(P.home);
        var nb = people(G, null, [who]);
        var g = G.pick(P.grand);
        var pair = G.pick(P.streetPairs);
        var a = G.coin() ? 0 : 1;
        var street = pair[a];
        var alt = pair[1 - a];
        var shop = G.pick(['雜貨店', '生活百貨', '五金百貨']);
        var cols = G.pick(P.colors, 3);
        var shs = G.pick(P.shapes, 3);
        var things = G.pick(X.things4, 4);
        var si = G.shuffle([0, 1, 2]);
        var x;
        var y;
        do { x = G.int(0, 2); y = G.int(0, 2); } while (si[x] === y);
        var objs = G.shuffle([0, 1, 2].map(function (i) { return { n: things[i], c: cols[i], s: shs[si[i]] }; })
            .concat([{ n: things[3], c: cols[x], s: shs[y] }]));
        var fr = G.pick(P.oddFruits, 2);
        var fc = [G.any(fr[0].odd)];
        var odd2 = fr[1].odd.filter(function (c) { return c !== fc[0]; });
        fc.push(G.any(odd2.length ? odd2 : fr[1].odd));
        var fn0 = G.num(1, 4, null, null, 'fn1');
        var fn = [fn0, G.num(1, 4, [fn0], null, 'fn2')];
        var jar = G.pick(P.jars);
        var mat = G.pick(jar.mats);
        var pos = G.pick(P.places);
        var jc = cols[G.int(0, 2)];
        var lc = G.any(P.colors.filter(function (c) { return cols.indexOf(c) < 0 && fc.indexOf(c) < 0; }));
        var v = {
            who: who, nb: nb, g: g, street: street, shop: shop, lc: lc, pos: pos, jc: jc, mat: mat, jar: jar.n,
            f1: fr[0].n, f2: fr[1].n, fc1: fc[0], fc2: fc[1], fn1: cnCount(fn[0]), fn2: cnCount(fn[1]), fu1: fr[0].u, fu2: fr[1].u
        };
        objs.forEach(function (o, i) { v['c' + i] = o.c; v['s' + i] = o.s; v['n' + i] = o.n; });
        var hd = X.head4(G, S, S.tl[S.i], v);
        var note = [
            hd.line,
            T('「要一個{c0}的{s0}{n0}，還有一個{c1}的{s1}{n1}。」', v),
            T('{who}想了想又說：「再買一個{c2}的{s2}{n2}，和一個{c3}的{s3}{n3}。」', v),
            T('{nb}在旁邊聽到，說：「上次我在別家買的{n0}是{lc}的，用沒多久就壞了。」', v),
            T('回家路上，再去蔬果攤買{fc1}的{f1}{fn1}{fu1}、{fc2}的{f2}{fn2}{fu2}，{g}最近只吃這兩種。', v),
            T('最後，{who}交代：家裡放在{pos}的那個{jc}{mat}{jar}，裡面的糖果快吃完了，記得買一包補滿。', v)
        ];

        var ownerOfColor = function (c) { return objs.filter(function (o) { return o.c === c; })[0].n; };
        var ownerOfShape = function (s) { return objs.filter(function (o) { return o.s === s; })[0].n; };
        var spareColor = function (not) { return G.any(P.colors.filter(function (c) { return cols.indexOf(c) < 0 && not.indexOf(c) < 0; })); };
        var order = G.shuffle(objs);

        function colorQ(o) {
            var lures = [];
            if (o === objs[0]) lures.push(L(lc, '似曾相識', '「' + lc + '」是' + nb + '上次在別家買的。'));
            cols.forEach(function (c) { if (c !== o.c) lures.push(L(c, '張冠李戴', '「' + c + '」是' + ownerOfColor(c) + '的顏色。')); });
            lures.push(L(fc[0], '張冠李戴', '「' + fc[0] + '」是' + fr[0].n + '的顏色。'));
            lures.push(L(spareColor([lc]), '差一點點'));
            return G.q(o.n + '是什麼顏色？', '顏色', o.c, lures);
        }
        function shapeQ(o) {
            var lures = [];
            shs.forEach(function (s) { if (s !== o.s) lures.push(L(s, '張冠李戴', '「' + s + '」是' + ownerOfShape(s) + '的形狀。')); });
            return G.q(o.n + '是什麼形狀？', '形狀', o.s, lures.concat(G.others(P.shapes, shs)));
        }
        function revQ(o) {
            var lures = objs.filter(function (p) { return p !== o; }).map(function (p) {
                return L(p.n, '張冠李戴', '「' + p.n + '」是' + p.c + '的' + p.s + '。');
            });
            return G.q('「' + o.c + '的' + o.s + '」是哪一樣？', '組合', o.n, lures);
        }
        function conjQ(o) {
            var others = objs.filter(function (p) { return p !== o; });
            var lures = [];
            others.forEach(function (p) {
                if (p.c !== o.c) lures.push(L(p.c + '的' + o.s + o.n, '張冠李戴', o.n + '是' + o.c + '的；' + p.c + '是' + p.n + '的顏色。'));
                if (p.s !== o.s) lures.push(L(o.c + '的' + p.s + o.n, '張冠李戴', o.n + '是' + o.s + '的；' + p.s + '是' + p.n + '的形狀。'));
                if (p.c !== o.c && p.s !== o.s) lures.push(L(p.c + '的' + p.s + o.n, '拼湊組合', '這是把' + p.n + '的顏色和形狀，拼到' + o.n + '上了。'));
            });
            return G.q('哪一個是' + o.n + '正確的樣子？', '組合', o.c + '的' + o.s + o.n, G.shuffle(lures), { must: true });
        }
        function fruitColorQ(k) {
            var f = fr[k];
            var lures = [L(f.typ, '常理陷阱', f.n + '一般是' + f.typ + '，但這次要' + fc[k] + '的。')];
            lures.push(L(fc[1 - k], '張冠李戴', '「' + fc[1 - k] + '」是' + fr[1 - k].n + '的顏色。'));
            lures.push(L(cols[0], '張冠李戴', '「' + cols[0] + '」是' + ownerOfColor(cols[0]) + '的顏色。'));
            lures.push(L(spareColor([f.typ].concat(fc)), '差一點點'));
            return G.q(f.n + '要買什麼顏色的？', '顏色', fc[k], lures, { must: true });
        }
        function fruitCountQ(k) {
            var f = fr[k];
            var fmt = function (n) { return cnCount(n) + f.u; };
            return G.q(f.n + '要買幾' + f.u + '？', '數字', fmt(fn[k]),
                [L(fmt(fn[1 - k]), '張冠李戴', '「' + cnCount(fn[1 - k]) + '」是' + fr[1 - k].n + '的數量。')].concat(G.near(fn[k], fmt, { lo: 1, hi: 6, swap: false })));
        }
        /* 罐子：位置、顏色、材質三個特徵 */
        var jarQ = G.attrQ('關於那個' + jar.n + '子，哪一個說法完全正確？', [
            { val: pos, alts: G.others(P.places, pos, '差一點點', 2) },
            {
                val: jc, alts: cols.filter(function (c) { return c !== jc; }).map(function (c) {
                    return L(c, '張冠李戴', jar.n + '子是' + jc + '的；' + c + '是' + ownerOfColor(c) + '的顏色。');
                })
            },
            { val: mat, alts: G.others(jar.mats, mat, '差一點點', 2) }
        ], function (vals) {
            return (vals[0] ? vals[0] + '的' : '') + (vals[1] || '') + (vals[2] ? vals[2] + jar.n : jar.n + '子');
        }, 2);

        var qs = [
            colorQ(order[0]), shapeQ(order[1]), revQ(order[2]), conjQ(order[3]),
            fruitColorQ(0), fruitColorQ(1), fruitCountQ(0), fruitCountQ(1), jarQ,
            G.q(shop + '在哪一條路？', '地點', street, [L(alt, '差一點點', '「' + alt + '」和「' + street + '」很像，紙條上是「' + street + '」。')]
                .concat(G.others(P.streetPairs.map(function (p) { return p[0]; }), [street, alt], '差一點點', 2))),
            G.q('誰最近只吃那兩種蔬果？', '人物', g, [L(who, '張冠李戴', who + '是拜託你買東西的人。'), L(nb, '似曾相識', nb + '只是在旁邊聽到。'),
                L(otherGrand(g), '差一點點')]),
            G.q('是誰拜託你買這些東西？', '人物', who, [L(nb, '似曾相識', nb + '只是在旁邊聽到。'), L(g, '張冠李戴', g + '是只吃那兩種蔬果的人。')]
                .concat(G.others(P.friends.concat(P.home), [who, nb], '差一點點', 2)))
        ];
        return { note: note, qs: finish(G, qs.concat(hd.qs), 12) };
    }

    /* ═══ 第 5 關：兩段行程（兩班號碼很像的公車、兩個很像的站名、誰要的、花的範圍、四個特徵的盒子）═══ */
    function L5(G, S) {
        var D = S.tl[S.i];
        var bday = G.pick(P.kin.concat(P.friends));
        var ps = G.pick(P.kin.concat(P.friends), 2, [bday]);
        var p1 = ps[0];
        var p2 = ps[1];
        var nb = people(G, null, ps);
        var bus1 = G.num(123, 987, null, threeDiff);
        var bus2 = G.any(perms(bus1));
        var pair = G.pick(P.streetPairs);
        var a = G.coin() ? 0 : 1;
        var stop1 = pair[a];
        var stop2 = pair[1 - a];
        var pk = G.pick([
            { place: '照相館', thing: '洗好的照片', k: '拿照片' }, { place: '眼鏡行', thing: '新配的眼鏡', k: '拿眼鏡' },
            { place: '鐘錶行', thing: '修好的手錶', k: '拿手錶' }, { place: '郵局', thing: '掛號包裹', k: '領包裹' },
            { place: '洗衣店', thing: '送洗的外套', k: '拿外套' }, { place: '裁縫店', thing: '改好的褲子', k: '拿褲子' }
        ]);
        var pkOthers = ['拿照片', '拿眼鏡', '拿手錶', '領包裹', '拿外套', '拿褲子'].filter(function (k) { return k !== pk.k; });
        var closeT = G.pick(P.times.slice(2));
        var cat = G.pick(P.shops);
        var i2 = G.pick(cat.items);
        var rest = G.shuffle(cat.items.filter(function (x) { return x !== i2; }));
        var lureItem = rest[0];
        var n2 = G.num(1, 4, null, null, 'n2');
        var flower = G.pick(P.flowers);
        var fs = flowerSet(G);
        var pos = G.pick(P.places);
        var pc = G.pick(P.colors);
        var lid = G.coin();
        var shape = G.pick(P.shapes);
        var mat = G.pick(P.boxMats);
        var content = G.pick(P.boxThings);
        var food = G.pick(['油飯', '紅蛋', '喜餅', '蛋糕']);
        var v = {
            bday: bday, p1: p1, p2: p2, nb: nb, bus1: bus1, bus2: bus2, stop1: stop1, stop2: stop2, place1: pk.place, thing1: pk.thing, closeT: closeT,
            shop2: cat.shop, n2: cnCount(n2), u2: cat.u, i2: i2, lure: lureItem, fl: flower, f1: fs.ok[0], f2: fs.ok[1], f3: fs.ok[2],
            fx: fs.no, fxr: fs.noWhy, pos: pos, pc: pc, lid: lid ? '有蓋子' : '沒有蓋子', shape: shape, mat: mat, content: content, food: food,
            today: D.today.sw, ev: D.ev.sw
        };
        var note = [
            T('今天是{today}下午兩點。{ev}是{bday}的生日，大家都在準備，好幾個人都找你幫忙。', v),
            T('{p1}和{p2}各拜託你一件事。{p1}要你搭 {bus1} 號公車，在{stop1}下車，去{place1}幫忙拿{thing1}，{place1}{closeT}就關門了。', v),
            T('{p2}則要你回程搭 {bus2} 號公車，在{stop2}下車，到{shop2}買{n2}{u2}{i2}。{p2}說上次買成{lure}，這次不要。', v),
            T('{p1}還想要一束{fl}，{f1}、{f2}或{f3}都可以，就是不要{fx}的，因為{fxr}。', v),
            T('另外，{p2}上次放在你家{pos}的那個盒子，這次要順便帶去還。那是一個畫著{pc}線條、{lid}的{shape}{mat}盒，裡面裝著{content}。', v),
            T('在公車上，{nb}跟你聊起孫子考上了大學，說下個月要請大家吃{food}，聊了好久。', v),
            T('{p1}還在電話裡抱怨，上次去{place1}等了快一個小時，這次希望快一點。', v)
        ];

        var streets = P.streetPairs.map(function (p) { return p[0]; }).concat(P.streetPairs.map(function (p) { return p[1]; }));
        var f2 = function (x) { return cnCount(x) + cat.u; };
        var ti = P.times.indexOf(closeT);
        var boxQ = G.attrQ('關於那個盒子，哪一個說法完全正確？', [
            { val: pc + '線條', alts: G.others(P.colors, pc, '差一點點', 2).map(function (l) { return L(l.v + '線條', l.k); }) },
            { val: lid ? '有蓋子' : '沒蓋子', alts: [L(lid ? '沒蓋子' : '有蓋子', '差一點點')] },
            { val: shape, alts: G.others(P.shapes, shape, '差一點點', 2) },
            { val: mat, alts: G.others(P.boxMats, mat, '差一點點', 2) }
        ], function (vals) {
            var s = [vals[0], vals[1]].filter(Boolean).join('、');
            return (s ? s + '的' : '') + (vals[2] || '') + (vals[3] ? vals[3] + '盒' : '盒子');
        }, 2);

        var qs = [
            G.q('去程要搭幾號公車？', '數字', bus1, [L(bus2, '張冠李戴', bus2 + ' 是回程的公車。')].concat(G.near(bus1, String, { lo: 100, hi: 999 })), { must: true }),
            G.q('回程要搭幾號公車？', '數字', bus2, [L(bus1, '張冠李戴', bus1 + ' 是去程的公車。')].concat(G.near(bus2, String, { lo: 100, hi: 999 })), { must: true }),
            G.q('去程要在哪裡下車？', '地點', stop1, [L(stop2, '張冠李戴', stop2 + '是回程下車的地方。')].concat(G.others(streets, [stop1, stop2], '差一點點', 2))),
            G.q('回程要在哪裡下車？', '地點', stop2, [L(stop1, '張冠李戴', stop1 + '是去程下車的地方。')].concat(G.others(streets, [stop1, stop2], '差一點點', 2))),
            G.q(T('去{place1}要做什麼？', v), '物品', pk.k, [L('買' + i2, '張冠李戴', i2 + '是' + p2 + '要的。')].concat(G.others(pkOthers, [], '差一點點', 2))),
            G.q(T('{place1}幾點關門？', v), '時間', closeT, G.others(P.times.slice(Math.max(0, ti - 2), ti + 3), closeT, '數字相近')),
            G.q(T('{shop2}的東西是誰要的？', v), '人物', p2, [L(p1, '張冠李戴', p1 + '要的是' + pk.k.slice(1) + '和花。'), L(nb, '似曾相識', nb + '只是在公車上聊天。')]
                .concat(G.others(P.kin, [p1, p2], '差一點點', 1))),
            G.q(T('{fl}是誰要的？', v), '人物', p1, [L(p2, '張冠李戴', p2 + '要的是' + cat.shop + '的東西。'), L(nb, '似曾相識', nb + '只是在公車上聊天。')]
                .concat(G.others(P.kin, [p1, p2], '差一點點', 1)), { must: true }),
            boxQ,
            G.q('盒子裡裝著什麼？', '物品', content, [L(food, '似曾相識', food + '是' + nb + '要請大家吃的。')].concat(G.others(P.boxThings, content, '差一點點'))),
            G.q('盒子現在放在你家哪裡？', '地點', pos, G.others(P.places, pos)),
            G.q('盒子要還給誰？', '人物', p2, [L(p1, '張冠李戴'), L(nb, '似曾相識')].concat(G.others(P.friends, [p1, p2, nb], '差一點點', 1))),
            G.q(T('在{shop2}要買什麼？', v), '物品', i2, [L(lureItem, '似曾相識', '「' + lureItem + '」是上次買錯的。'), L(food, '似曾相識', food + '是' + nb + '要請大家吃的。')]
                .concat(G.others(rest.slice(1), [], '差一點點', 2))),
            G.q(T('在{shop2}要買幾{u2}？', v), '數字', f2(n2), G.near(n2, f2, { lo: 1, hi: 7, swap: false })),
            G.dateQ('大家在準備的生日是哪一天？', D.ev, [L(D.today.s, '張冠李戴', D.today.s + '是今天，生日是' + D.ev.s + '。')], { must: true }),
            G.weekQ('那個生日是星期幾？', D.ev, [L(D.today.w, '張冠李戴', D.today.w + '是今天。')]),
            G.q('是誰要過生日？', '人物', bday, [L(p1, '張冠李戴', p1 + '是拜託你拿東西的人。'), L(p2, '張冠李戴', p2 + '是拜託你買東西的人。'), L(nb, '似曾相識', nb + '只是在公車上聊天。')])
        ].concat(flowerQs(G, fs, flower));
        return { note: note, qs: finish(G, qs, 16) };
    }

    /* ═══ 第 6 關：臨時改口（買菜清單在電話裡被改掉；擾句；五個特徵的點心瓶）═══ */
    function L6(G, S) {
        var today = S.tl[S.i].today;
        var ev = addDays(today, 1);      /* 這一關：明天就是生日，今天去買菜 */
        var who = G.pick(P.home);
        var p4 = G.pick(P.relatives, null, [who]);
        var g = G.pick(P.grand);
        var nb = people(G);
        var market = G.pick(P.markets);
        var rt = G.pick(P.times.slice(1, 6));
        var hs = G.pick(P.herbs, 2);
        var H = hs[0];
        var H2 = hs[1];
        var H3 = G.any(P.herbs.filter(function (h) { return h !== H && h !== H2; }));
        var B1 = G.pick(P.soy);
        var B2 = G.pick(P.vinegarBrands);
        var V = G.pick(P.vinegars);
        var e1 = G.num(1, 3, null, null, 'e1');
        var e2 = G.num(2, 4, [e1], null, 'e2');
        var fish = G.pick(P.fish, 2);
        var fT = fish[G.int(0, 1)];
        var treat = G.pick(P.fishTreat);
        var fishFloor = G.pick(['一樓', '地下一樓']);
        var pork = G.num(15, 22, null, null, 'pork') * 10;
        var fr = G.pick(P.oddFruits, 2);
        var fc = [G.any(fr[0].odd)];
        fc.push(G.any(fr[1].odd));
        var fn0 = G.num(1, 4, null, null, 'fn1');
        var fn = [fn0, G.num(1, 4, [fn0], null, 'fn2')];
        var pos = G.pick(P.places);
        var pc = G.pick(P.colors, null, fc);
        var lid = G.coin();
        var shape = G.pick(P.shapes);
        var mat = G.pick(P.bottleMats);
        var sn = G.pick(P.oddSnacks);
        var fs = flowerSet(G);
        var v = {
            p4: p4, who: who, market: market, rt: rt, hq: '一' + H.u + H.n, H: H.n, good: H.good, bad: H.bad, res: H.res,
            e1: cnCount(e1), e2: cnCount(e2), f1: fish[0], f2: fish[1], fT: fT, treat: treat, ff: fishFloor, nb: nb, pork: pork,
            fr1: fr[0].n, fr2: fr[1].n, fc1: fc[0], fc2: fc[1], fn1: cnCount(fn[0]), fn2: cnCount(fn[1]), fu1: fr[0].u, fu2: fr[1].u, g: g,
            pos: pos, pc: pc, lid: lid ? '有蓋子' : '沒有蓋子', shape: shape, mat: mat, sc: sn.odd, snack: sn.n,
            h2q: '一' + H2.u + H2.n, B1: B1, B2: B2, V: V, k1: fs.ok[0], k2: fs.ok[1], k3: fs.ok[2], fx: fs.no,
            today: today.sw, ev: ev.sw
        };
        var note = [
            T('今天是{today}。明天{ev}是{p4}的生日，{p4}一家要回來吃午飯慶生。', v),
            T('{who}早上八點出門前交代你：「下午記得去{market}買菜，{rt}以前要回到家喔！」', v),
            T('「先買{hq}、一瓶醬油、一罐白醋，還有{e1}盒雞蛋。{H}要挑{good}一點的，上次你買的{H}太{bad}了，{res}。」', v),
            T('{who}想了想又說：「魚要買兩條，一條{f1}、一條{f2}，{fT}記得請老闆{treat}。魚攤在市場{ff}最裡面。」', v),
            T('{nb}剛好經過，說市場二樓的豬肉攤今天特價，一斤只要 {pork} 元，不過你們家這個禮拜說好不吃豬肉。', v),
            T('蔬果要買{fc1}的{fr1}{fn1}{fu1}、{fc2}的{fr2}{fn2}{fu2}，{g}最近只吃這兩種。', v),
            T('對了，{pos}那個畫著{pc}線條、{lid}的{shape}{mat}瓶，是{p4}最喜歡的點心瓶，裡面的{sc}{snack}快吃完了，順便補滿。', v),
            T('你正要出門，{who}又打電話回來：「{H}不用買了，冰箱還有，改買{h2q}。醬油要買{B1}的；白醋也不要了，改買{B2}的{V}。」', v),
            T('「雞蛋改成{e2}盒，{p4}說要做蛋餅。花也順便帶一束，{k1}、{k2}或{k3}都可以，就是不要{fx}的。」', v)
        ];

        var other = function (arr, x) { return arr.filter(function (y) { return y !== x; }); };
        var fe = function (n) { return cnCount(n) + '盒'; };
        var ti = P.times.indexOf(rt);
        /* 點心瓶：位置、線條、蓋子、材質（形狀另外問，所以不放進這一題） */
        var jarQ = G.attrQ('關於點心瓶，哪一個說法完全正確？', [
            { val: pos, alts: G.others(P.places, pos, '差一點點', 2) },
            {
                val: pc + '線條', alts: [L(fc[0] + '線條', '張冠李戴', fc[0] + '是' + fr[0].n + '的顏色，瓶子是' + pc + '線條。')]
                    .concat(G.others(P.colors, [pc, fc[0]], '差一點點', 1).map(function (l) { return L(l.v + '線條', l.k); }))
            },
            { val: lid ? '有蓋子' : '沒蓋子', alts: [L(lid ? '沒蓋子' : '有蓋子', '差一點點')] },
            { val: mat, alts: G.others(P.bottleMats, mat, '差一點點', 2) }
        ], function (vals) {
            var s = [vals[1], vals[2]].filter(Boolean).join('、');
            return (vals[0] ? vals[0] + '的' : '') + (s ? s + '的' : '') + (vals[3] ? vals[3] + '瓶' : '瓶子');
        }, 2);

        var qs = [
            G.q('醬油要買哪個牌子？', '更正', B1, [L(B2, '張冠李戴', B2 + '是' + V + '的牌子。')].concat(G.others(P.soy, B1, '差一點點', 2)), { must: true }),
            G.q('最後要買的醋是哪一種？', '更正', B2 + V, [
                L(B1 + V, '張冠李戴', '牌子弄錯了：' + B1 + '是醬油，' + V + '要買' + B2 + '的。'),
                L('白醋', '新舊混淆', '白醋後來不要了，改買' + B2 + '的' + V + '。'),
                L(B2 + '白醋', '拼湊組合', '這是把新的牌子和舊的白醋拼在一起了。'),
                L(B2 + other(P.vinegars, V)[0], '差一點點')
            ], { must: true }),
            G.q(H.n + '後來怎麼了？', '更正', '不買了，改買' + H2.n, [
                L('要挑' + H.good + '一點的', '新舊混淆', '這是改口之前的交代，後來' + H.n + '不買了。'),
                L('要挑' + H.bad + '一點的', '似曾相識', '「太' + H.bad + '」是上次買錯的。'),
                L('不買了，改買' + H3.n, '差一點點')
            ], { must: true }),
            G.q('雞蛋最後要買幾盒？', '更正', fe(e2), [L(fe(e1), '新舊混淆', '「' + cnCount(e1) + '盒」是改口之前的數量。')].concat(G.near(e2, fe, { lo: 1, hi: 6, swap: false })), { must: true }),
            G.q('要去哪個市場買菜？', '地點', market, G.others(P.markets, market)),
            G.q('最晚幾點要回到家？', '時間', rt, G.others(P.times.slice(Math.max(0, ti - 2), ti + 3), rt, '數字相近')),
            G.q('魚攤在市場幾樓？', '地點', fishFloor, [L('二樓', '似曾相識', '二樓是' + nb + '說的豬肉攤。'), L(fishFloor === '一樓' ? '地下一樓' : '一樓', '差一點點'), L('三樓', '差一點點')]),
            G.q('哪一條魚要請老闆' + treat + '？', '配對', fT, [
                L(other(fish, fT)[0], '張冠李戴', '要' + treat + '的是' + fT + '。'),
                L('兩條都要', '拼湊組合', '只有' + fT + '要' + treat + '。'),
                L('都不用', '差一點點', fT + '要' + treat + '。')
            ], { must: true }),
            G.q(fr[0].n + '要買什麼顏色的？', '顏色', fc[0], [
                L(fr[0].typ, '常理陷阱', fr[0].n + '一般是' + fr[0].typ + '，但這次要' + fc[0] + '的。'),
                L(fc[1], '張冠李戴', fc[1] + '是' + fr[1].n + '的顏色。'),
                L(sn.odd, '張冠李戴', sn.odd + '是' + sn.n + '的顏色。'),
                L(pc, '張冠李戴', pc + '是點心瓶線條的顏色。')
            ].concat(G.others(P.colors, [fc[0], fr[0].typ], '差一點點', 2)), { must: true }),
            G.q(fr[1].n + '要買什麼顏色的？', '顏色', fc[1], [
                L(fr[1].typ, '常理陷阱', fr[1].n + '一般是' + fr[1].typ + '，但這次要' + fc[1] + '的。'),
                L(fc[0], '張冠李戴', fc[0] + '是' + fr[0].n + '的顏色。'),
                L(sn.odd, '張冠李戴', sn.odd + '是' + sn.n + '的顏色。'),
                L(pc, '張冠李戴', pc + '是點心瓶線條的顏色。')
            ].concat(G.others(P.colors, [fc[1], fr[1].typ], '差一點點', 2)), { must: true }),
            G.q(fr[0].n + '要買幾' + fr[0].u + '？', '數字', cnCount(fn[0]) + fr[0].u,
                [L(cnCount(fn[1]) + fr[0].u, '張冠李戴', '「' + cnCount(fn[1]) + '」是' + fr[1].n + '的數量。')]
                    .concat(G.near(fn[0], function (n) { return cnCount(n) + fr[0].u; }, { lo: 1, hi: 6, swap: false }))),
            G.q(fr[1].n + '要買幾' + fr[1].u + '？', '數字', cnCount(fn[1]) + fr[1].u,
                [L(cnCount(fn[0]) + fr[1].u, '張冠李戴', '「' + cnCount(fn[0]) + '」是' + fr[0].n + '的數量。')]
                    .concat(G.near(fn[1], function (n) { return cnCount(n) + fr[1].u; }, { lo: 1, hi: 6, swap: false }))),
            G.q('誰最近只吃這兩種蔬果？', '人物', g, [L(p4, '張冠李戴', p4 + '最喜歡的是點心瓶。'), L(who, '張冠李戴', who + '是交代你買菜的人。'), L(nb, '似曾相識', nb + '只是剛好經過。')]),
            jarQ,
            G.q('點心瓶是什麼形狀？', '形狀', shape, G.others(P.shapes, shape)),
            G.q('點心瓶裡要補什麼？', '物品', sn.odd + '的' + sn.n, [
                L(sn.typ + '的' + sn.n, '常理陷阱', sn.n + '一般是' + sn.typ + '，但這次是' + sn.odd + '的。'),
                L(fc[0] + '的' + sn.n, '張冠李戴', fc[0] + '是' + fr[0].n + '的顏色。'),
                L(pc + '的' + sn.n, '張冠李戴', pc + '是點心瓶線條的顏色。')
            ].concat(other(P.oddSnacks, sn).map(function (s) { return L(sn.odd + '的' + s.n, '差一點點'); })), { must: true }),
            G.q('點心瓶是誰最喜歡的？', '人物', p4, [L(g, '張冠李戴', g + '喜歡的是蔬果。'), L(who, '張冠李戴', who + '是交代你買菜的人。'), L(nb, '似曾相識', nb + '只是剛好經過。')]),
            G.q('後來打電話來改口的是誰？', '人物', who, [L(nb, '似曾相識', nb + '只是剛好經過。'), L(p4, '張冠李戴', p4 + '是明天要回來吃飯的人。'), L(g, '張冠李戴', g + '是只吃那兩種水果的人。')]),
            G.dateQ('回來吃午飯慶生是哪一天？', ev, [L(today.s, '張冠李戴', today.s + '是去買菜的那天，慶生是隔天。')], { must: true }),
            G.weekQ('去市場買菜那天是星期幾？', today, [L(ev.w, '張冠李戴', ev.w + '是隔天慶生的日子。')])
        ].concat(flowerQs(G, fs, '花'));
        return { note: note, qs: finish(G, qs, 20) };
    }

    /* ═══ 第 7 關：一通電話（前面幾頁的計畫，被最後一通電話大幅更改）═══ */
    function L7(G, S) {
        var D = S.tl[S.i];
        var ev2 = addDays(D.ev, -1);     /* 電話裡：生日會改到生日的前一天 */
        var who = G.pick(P.home);
        var p = G.pick(P.kids, null, [who]);
        var g = G.pick(P.grand);
        var nb = people(G);
        var age = G.num(5, 9, null, null, 'age');
        var age2 = age + (G.coin() ? 1 : -1);
        var inch = G.pick([6, 8, 10], null, [age, age2]);
        var cks = G.pick(P.cakeShops, 2);
        var pair = G.pick(P.streetPairs);
        var a = G.coin() ? 0 : 1;
        var street1 = pair[a];
        var alt = pair[1 - a];
        var street2 = G.pick(P.streetPairs.map(function (x) { return x[0]; }), null, [street1, alt]);
        var fl = G.pick(P.flavors, 4);
        var F1 = fl[0];
        var F2 = fl[1];
        var F3 = fl[2];
        var F4 = fl[3];
        var gift = G.pick(P.gifts);
        var giftNames = P.gifts.map(function (x) { return x.n; });
        var gcs = G.pick(P.giftColors, 2);
        var GC = gcs[0];
        var GC2 = gcs[1];
        var dept = G.pick(P.depts);
        var floor = G.num(2, 8, null, null, 'floor');
        var bus1 = G.num(123, 987, null, threeDiff);
        var stop1 = G.pick(P.stops);
        var shop3 = G.pick(P.partyShops);
        var bn = G.num(2, 5, null, null, 'bn');
        var things = G.pick(P.partyThings, 2);
        var ti = G.int(0, P.times.length - 4);
        var tm = [P.times[ti], P.times[ti + 1], P.times[ti + 2], P.times[ti + 3]];
        var time0 = tm[0];       /* 原本：東西送到 */
        var time1 = tm[2];       /* 原本：生日會開始 */
        var time2 = tm[3];       /* 改成：生日會開始 */
        var time3 = tm[1];       /* 改成：東西送到 */
        var v = {
            g: g, who: who, p: p, nb: nb, agec: cnNum(age), age2c: cnNum(age2), street1: street1, street2: street2,
            cake: cks[0], cake2: cks[1], F1: F1, F2: F2, F3: F3, F4: F4, inchc: cnNum(inch), dept: dept, floorc: cnNum(floor), GC: GC, GC2: GC2,
            gift: gift.n, gu: gift.u, bus1: bus1, stop1: stop1, shop3: shop3, bnc: cnCount(bn), thing3: things[0],
            time0: time0, time1: time1, time2: time2, time3: time3, today: D.today.sw, ev: D.ev.sw, ev2: ev2.sw
        };
        var note = [
            T('今天是{today}晚上七點。{ev}是{g}的{agec}歲生日，{who}要你先把東西準備好。', v),
            T('第一件事，是去{street1}的{cake}蛋糕店拿預訂的蛋糕。', v),
            T('「要{F1}口味、{inchc}吋的，」{who}說，「{p}說上次的奶油蛋糕很好吃，但是這次{g}想吃{F1}口味。」', v),
            T('蠟燭要{agec}根，數字造型的不要，要一般的彩色蠟燭。第二件事，是去{dept}{floorc}樓買生日禮物：一{gu}{GC}的{gift}。', v),
            T('去百貨公司要搭 {bus1} 號公車，在{stop1}下車。{who}還交代，順便在{shop3}買{bnc}包氣球和一盒{thing3}。', v),
            T('生日會就在生日當天{time1}開始，東西最晚{time0}要送到{p}家。', v),
            T('{who}又說，今年{p}家要請{g}的同學一起來，大概會有十幾個小朋友，所以蛋糕千萬不能買太小。', v),
            T('{nb}聽說要辦生日會，熱心地說{street2}有一家{cake2}蛋糕店，{F3}蛋糕買一送一，不過你們已經訂好了。', v),
            T('你想起去年{g}生日時，買的是{F4}蛋糕，結果{g}只吃了一口，剩下的都是大人吃掉的。', v),
            T('傍晚，{who}又打電話來，說計畫要改：「{g}說還是想吃{F2}口味，蛋糕改成{F2}的。還有，{g}今年是{age2c}歲，不是{agec}歲，蠟燭要{age2c}根才對。」', v),
            T('「禮物的顏色也改一下，{g}最近喜歡{GC2}，改買{GC2}的{gift}。氣球不用買了，{p}家還有。」', v),
            T('「生日會改到前一天，{ev2}{time2}開始，東西{time3}前送到就好。」', v)
        ];

        var fk = function (f) { return f + '口味'; };
        var near = function (f) { return P.flavorNear[f]; };
        var cand = function (n) { return cnNum(n) + '根'; };
        var gifts = P.giftColors;
        var qs = [
            G.q('最後蛋糕要什麼口味？', '更正', fk(F2), [L(fk(F1), '新舊混淆', F1 + '是改口之前的口味。'),
                L(fk('奶油'), '似曾相識', '奶油蛋糕是上次吃的。'), L(fk(F3), '似曾相識', F3 + '是' + nb + '說的另一家店在特價的。'),
                L(fk(near(F2)), '差一點點'), L(fk(F4), '似曾相識', F4 + '蛋糕是去年買的。')], { must: true }),
            G.q('一開始說蛋糕要什麼口味？', '一開始', fk(F1), [L(fk(F2), '新舊混淆', F2 + '是後來才改的。'),
                L(fk('奶油'), '似曾相識', '奶油蛋糕是上次吃的。'), L(fk(near(F1)), '差一點點')], { old: true, must: true }),
            G.q('蠟燭最後要幾根？', '更正', cand(age2), [L(cand(age), '新舊混淆', cnNum(age) + '歲是說錯的，後來改成' + cnNum(age2) + '歲。'),
                L(cand(inch), '張冠李戴', cnNum(inch) + '是蛋糕的吋數。')].concat(G.near(age2, cand, { lo: 3, hi: 12, swap: false })), { must: true }),
            G.q('一開始說蠟燭要幾根？', '一開始', cand(age), [L(cand(age2), '新舊混淆', cnNum(age2) + '根是後來才改的。'),
                L(cand(inch), '張冠李戴', cnNum(inch) + '是蛋糕的吋數。')].concat(G.near(age, cand, { lo: 3, hi: 12, swap: false })), { old: true }),
            G.q('蛋糕要幾吋？', '數字', cnNum(inch) + '吋', [L(cnNum(age2) + '吋', '張冠李戴', cnNum(age2) + '是蠟燭的數量。')]
                .concat([6, 8, 10, 12].filter(function (x) { return x !== inch; }).map(function (x) { return L(cnNum(x) + '吋', '數字相近'); }))),
            G.q('要去哪一家蛋糕店拿蛋糕？', '地點', cks[0] + '蛋糕店', [L(cks[1] + '蛋糕店', '似曾相識', cks[1] + '是' + nb + '推薦的另一家。')]
                .concat(G.others(P.cakeShops, cks, '差一點點', 2).map(function (l) { return L(l.v + '蛋糕店', l.k); }))),
            G.q('蛋糕店在哪一條路？', '地點', street1, [L(alt, '差一點點', '「' + alt + '」和「' + street1 + '」很像，紙條上是「' + street1 + '」。'),
                L(street2, '似曾相識', street2 + '是' + nb + '推薦的那家店。'), L(stop1, '張冠李戴', stop1 + '是去百貨公司下車的地方。')]),
            G.q('蠟燭要哪一種？', '否定', '一般的彩色蠟燭', [L('數字造型的', '否定遺漏', '紙條特別說數字造型的不要。'),
                L(GC2 + '的蠟燭', '張冠李戴', GC2 + '是禮物的顏色。'), L(GC + '的蠟燭', '張冠李戴', GC + '是禮物原本的顏色。')]),
            G.q('禮物最後要買什麼顏色？', '更正', GC2, [L(GC, '新舊混淆', GC + '是改口之前的顏色。')].concat(G.others(gifts, [GC, GC2], '差一點點', 2)), { must: true }),
            G.q('一開始說禮物要什麼顏色？', '一開始', GC, [L(GC2, '新舊混淆', GC2 + '是後來才改的。')].concat(G.others(gifts, [GC, GC2], '差一點點', 2)), { old: true }),
            G.q('生日禮物是什麼？', '物品', gift.n, [L(things[0], '張冠李戴', things[0] + '是在' + shop3 + '買的。')].concat(G.others(giftNames, gift.n, '差一點點', 2))),
            G.q('禮物在百貨公司幾樓買？', '數字', cnNum(floor) + '樓', G.near(floor, function (n) { return cnNum(n) + '樓'; }, { lo: 1, hi: 12, swap: false })),
            G.q('去百貨公司要搭幾號公車？', '數字', bus1, G.near(bus1, String, { lo: 100, hi: 999 })),
            G.q('去百貨公司要在哪裡下車？', '地點', stop1, [L(street1, '張冠李戴', street1 + '是蛋糕店那條路。')].concat(G.others(P.stops, stop1, '差一點點', 2))),
            G.q('要去哪一家百貨公司？', '地點', dept, G.others(P.depts, dept)),
            G.q('氣球後來怎麼了？', '更正', '不用買了', [L('要買' + cnCount(bn) + '包', '新舊混淆', '這是改口之前的交代，後來氣球不用買了。'),
                L('改買' + cnCount(bn === 5 ? 3 : bn + 1) + '包', '差一點點', '氣球不用買了。'), L('改成' + GC2 + '的', '張冠李戴', GC2 + '是禮物改的顏色。')], { must: true }),
            G.q(things[0] + '要買幾盒？', '數字', '一盒', [L(cnCount(bn) + '盒', '張冠李戴', '「' + cnCount(bn) + '」是原本氣球的數量。'), L('兩盒', '數字相近'), L('三盒', '數字相近'), L('四盒', '數字相近')]),
            G.q('生日會最後幾點開始？', '更正', time2, [L(time1, '新舊混淆', time1 + '是改口之前的時間。'),
                L(time3, '張冠李戴', time3 + '是東西要送到的時間。'), L(time0, '張冠李戴', time0 + '是原本送東西的時間。')], { must: true }),
            G.q('一開始說生日會幾點開始？', '一開始', time1, [L(time2, '新舊混淆', time2 + '是後來才改的。'),
                L(time0, '張冠李戴', time0 + '是原本送東西的時間。'), L(time3, '張冠李戴', time3 + '是後來送東西的時間。')], { old: true, must: true }),
            G.q('東西最晚幾點要送到？', '更正', time3, [L(time0, '新舊混淆', time0 + '是改口之前的時間。'),
                L(time2, '張冠李戴', time2 + '是生日會開始的時間。'), L(time1, '張冠李戴', time1 + '是原本生日會開始的時間。')], { must: true }),
            G.q('東西要送到誰家？', '人物', p + '家', [L(nb + '家', '似曾相識', nb + '只是推薦了另一家蛋糕店。')]
                .concat(G.others(P.kids.concat(['表妹美玲', '老朋友周大哥']), [p], '差一點點', 2).map(function (l) { return L(l.v + '家', l.k); }))),
            G.q('是誰要過生日？', '人物', g, [L(p, '張冠李戴', p + '是生日會的主人家。'), L(otherGrand(g), '差一點點'), L(nb, '似曾相識', nb + '只是推薦了蛋糕店。')]),
            G.q('打電話來改計畫的是誰？', '人物', who, [L(p, '張冠李戴', p + '是生日會的主人家。'), L(nb, '似曾相識', nb + '只是推薦了蛋糕店。'), L(g, '差一點點', g + '是要過生日的人。')]),
            G.dateQ('生日會最後改到哪一天？', ev2, [L(D.ev.s, '新舊混淆', D.ev.s + '是生日當天，生日會改到前一天。'), L(D.today.s, '張冠李戴', D.today.s + '是接到交代的那天。')], { must: true }),
            G.dateQ('過生日的那一天是幾月幾日？', D.ev, [L(ev2.s, '張冠李戴', ev2.s + '是生日會改到的日子，生日沒有變。'), L(D.today.s, '張冠李戴', D.today.s + '是接到交代的那天。')], { must: true }),
            G.weekQ('生日會最後是星期幾？', ev2, [L(D.ev.w, '新舊混淆', D.ev.w + '是生日當天，生日會改到前一天。')]),
            (function () {
                var same = G.any(['蛋糕的吋數', '禮物是什麼', '百貨公司', '公車號碼']);
                return G.q('電話裡「沒有」改到的是哪一個？', '更正', same, ['蛋糕的口味', '蠟燭的數量', '禮物的顏色', '開始的時間'].map(function (c) {
                    return L(c, '新舊混淆', '「' + c + '」在電話裡改掉了。');
                }));
            })()
        ];
        return { note: note, qs: finish(G, qs, 24, 4) };
    }

    /* ═══ 第 8 關：回家的路（全部混合：三班公車、禮物、蛋糕、UBIKE、巷子、預算，最後兩通電話大改）═══ */
    function L8(G, S) {
        var today = S.tl[S.i].today;
        var who = G.pick(P.home);
        var p = G.pick(P.home.concat(P.kin).filter(function (x, i, a) { return a.indexOf(x) === i; }), null, [who]);
        var nbs = people(G, 2);
        var nb = nbs[0];
        var nb2 = nbs[1];
        var cash = G.num(15, 25) * 100;
        var d1 = G.int(2, 9) * 10;
        var c1 = G.int(28, 48) * 10;
        var g1 = cash - d1 - c1;
        var d2 = G.int(3, 12) * 10;
        var c2 = c1 + d1 + d2;
        var bus1 = G.num(123, 987, null, threeDiff);
        var bus2 = G.any(perms(bus1));
        var bus3 = G.num(12, 98, null, twoDiff);
        var stops = G.pick(P.stops, 2);
        var stopA = stops[0];
        var stopB = stops[1];
        var dept = G.pick(P.depts);
        var floor = G.num(2, 8, null, null, 'floor');
        var gift = G.pick(P.gifts);
        var gcs = G.pick(P.giftColors, 2);
        var gc = gcs[0];
        var gc2 = gcs[1];
        var lastGift = G.any(P.gifts.filter(function (x) { return x !== gift; }));
        var giftNames = P.gifts.map(function (x) { return x.n; });
        var gc3 = G.any(P.giftColors.filter(function (x) { return x !== gc && x !== gc2; }));
        var cake = G.pick(P.cakeShops);
        var fl = G.pick(P.flavors, 3);
        var box = G.pick(P.boxShapes);
        var noiseThing = G.pick(P.snacksNoise);
        var noiseN = G.num(5, 12) * 5;
        var prs = G.pick(P.streetPairs, 3);
        var o1 = G.coin() ? 0 : 1;
        var s1 = prs[0][o1];
        var s1b = prs[0][1 - o1];
        var s2 = prs[1][G.coin() ? 0 : 1];
        var s3i = G.coin() ? 0 : 1;
        var s3 = prs[2][s3i];
        var s3alt = prs[2][1 - s3i];
        var s2alt = prs[1][0] === s2 ? prs[1][1] : prs[1][0];
        var t1 = G.coin() ? '右' : '左';
        var t2 = G.coin() ? '右' : '左';
        var t3 = G.coin() ? '右' : '左';
        var t4 = G.coin() ? '右' : '左';
        var side = G.coin() ? '右' : '左';
        var a1 = G.num(2, 4, null, null, 'a1');
        var a2 = G.num(1, 3, [a1], null, 'a2');
        var k = G.num(2, 4, [a1], null, 'k');
        var house = G.num(12, 58, null, twoDiff);
        var st = G.num(3, 12, null, null, 'st');
        var v = {
            who: who, p: p, nb: nb, nb2: nb2, cash: cash, bus1: bus1, bus2: bus2, bus3: bus3, stopA: stopA, stopB: stopB,
            dept: dept, floorc: cnNum(floor), gc: gc, gc2: gc2, gift: gift.n, gu: gift.u, g1: g1, cake: cake, flavor1: fl[0], flavor2: fl[1],
            lureFlavor: fl[2], c1: c1, c2: c2, box: box, noiseThing: noiseThing, noiseN: noiseN, s1: s1, s1b: s1b, s2: s2, s3: s3,
            t1: t1, t2: t2, t3: t3, t4: t4, a1c: cnNum(a1), a2c: cnCount(a2), side: side, kc: cnNum(k), house: house, stc: cnNum(st),
            lastGift: lastGift.n, lu: lastGift.u, gc3: gc3, today: today.sw
        };
        var note = [
            T('今天是{today}。下午四點，{who}傳訊息提醒你：今天是{p}的生日，下班後要辦幾件事再回家。', v),
            T('你身上只帶了 {cash} 元現金。', v),
            T('你想起{p}去年生日時，你送了一{lu}{gc3}的{lastGift}，{p}到現在還常常用。', v),
            T('「先搭 {bus1} 號公車，在{stopA}下車，去{dept}{floorc}樓買生日禮物：一{gu}{gc}的{gift}，要 {g1} 元。」{who}說{p}上次看到就很喜歡。', v),
            T('「走出百貨公司的時候，先傳簡訊跟我說『禮物買好了』。然後搭 {bus2} 號公車去{cake}蛋糕店，拿{flavor1}蛋糕，{c1} 元，用{box}的盒子裝。」', v),
            T('{nb}上次說，{cake}的{lureFlavor}蛋糕很好吃，還說他們家的{noiseThing}一個才 {noiseN} 元，不過這次不用買。', v),
            T('「拿完蛋糕，在店門口租 UBIKE，騎到{s1}{t1}轉，再騎到{s2}{t2}轉，就會看到{s3}的公車站。搭 {bus3} 號公車，在{stopB}下車。」', v),
            T('騎車要小心，{who}說上個月{nb2}在{s2}騎車跌倒，手上縫了{stc}針，到現在還沒好。', v),
            T('{who}還說，家裡巷口那家雜貨店今天公休，要買什麼都要在外面先買好。', v),
            T('「下車後往前走，第{a1c}個巷子{t3}轉，再過{a2c}個巷子{t4}轉，{side}手邊第{kc}間、{house} 號就是家。」', v),
            T('快下班時，{who}又打電話來：「禮物改成{gc2}的，{p}說{gc}的太老氣了。蛋糕也改成{flavor2}口味，那個比較貴，要 {c2} 元。」', v),
            T('「還有，{s1}最近在施工，不要在{s1}轉，改在{s1b}{t1}轉。」{who}最後提醒你：兩樣加起來超過身上的現金，就要先去提款機領錢。', v)
        ];

        var yuan = function (n) { return n + ' 元'; };
        var fk = function (f) { return f + '口味'; };
        var nearF = function (f) { return P.flavorNear[f]; };
        var ord = function (n) { return '第' + cnNum(n) + '個'; };
        var cnt = function (n) { return cnCount(n) + '個'; };
        var sideK = function (sd, n) { return sd + '手邊第' + cnNum(n) + '間'; };
        var opp = side === '右' ? '左' : '右';
        var total = g1 + c2;
        var qs = [
            G.q('第一段要搭幾號公車？', '數字', bus1, [L(bus2, '張冠李戴', bus2 + ' 是去蛋糕店的公車。')].concat(G.near(bus1, String, { lo: 100, hi: 999 })), { must: true }),
            G.q('去蛋糕店要搭幾號公車？', '數字', bus2, [L(bus1, '張冠李戴', bus1 + ' 是第一段的公車。')].concat(G.near(bus2, String, { lo: 100, hi: 999 })), { must: true }),
            G.q('最後一段要搭幾號公車？', '數字', bus3, [L(house, '張冠李戴', house + ' 是家的門牌。')].concat(G.near(bus3, String, { lo: 10, hi: 99 })), { must: true }),
            G.q('禮物在百貨公司幾樓？', '數字', cnNum(floor) + '樓', G.near(floor, function (n) { return cnNum(n) + '樓'; }, { lo: 1, hi: 12, swap: false })),
            G.q('家是幾號？', '數字', house + ' 號', [L(rev2(house) + ' 號', '數字相近'), L(st + ' 號', '似曾相識', '「' + cnNum(st) + '」是' + nb2 + '縫的針數。')]
                .concat(G.near(house, function (n) { return n + ' 號'; }, { lo: 1, hi: 99, swap: false })), { must: true }),
            G.q('禮物要多少錢？', '數字', yuan(g1), [L(yuan(c1), '張冠李戴', c1 + ' 元是蛋糕原本的價錢。')].concat(G.near(g1, yuan, { step: 100, swap: false }))),
            G.q('蛋糕最後要多少錢？', '更正', yuan(c2), [L(yuan(c1), '新舊混淆', c1 + ' 元是改口味之前的價錢。'),
                L(yuan(noiseN), '似曾相識', noiseN + ' 元是' + noiseThing + '的價錢。')].concat(G.near(c2, yuan, { step: 10, swap: false })), { must: true }),
            G.q('你身上帶了多少現金？', '數字', yuan(cash), G.near(cash, yuan, { step: 100, swap: false, lo: 500 })),
            G.q('一開始說蛋糕要什麼口味？', '一開始', fk(fl[0]), [L(fk(fl[1]), '新舊混淆', fl[1] + '是後來才改的。'),
                L(fk(fl[2]), '似曾相識', fl[2] + '是' + nb + '說好吃的。'), L(fk(nearF(fl[0])), '差一點點')], { old: true, must: true }),
            G.q('一開始說禮物要什麼顏色？', '一開始', gc, [L(gc2, '新舊混淆', gc2 + '是後來才改的。'), L(gc3, '似曾相識', gc3 + '是去年那份禮物的顏色。')].concat(G.others(P.giftColors, [gc, gc2], '差一點點', 2)), { old: true, must: true }),
            G.q('UBIKE 第一個彎，一開始說在哪轉？', '一開始', s1, [L(s1b, '新舊混淆', s1b + '是後來才改的。'),
                L(s2, '順序顛倒', s2 + '是第二個彎。'), L(s3, '張冠李戴', s3 + '是公車站那條路。')], { old: true, must: true }),
            G.q('一開始說蛋糕要多少錢？', '一開始', yuan(c1), [L(yuan(c2), '新舊混淆', c2 + ' 元是改口味之後的價錢。')].concat(G.near(c1, yuan, { step: 10, swap: false })), { old: true, must: true }),
            G.q('第一段要在哪裡下車？', '地點', stopA, [L(stopB, '張冠李戴', stopB + '是最後一段下車的地方。')].concat(G.others(P.stops, stops, '差一點點', 2))),
            G.q('最後一段要在哪裡下車？', '地點', stopB, [L(stopA, '張冠李戴', stopA + '是第一段下車的地方。')].concat(G.others(P.stops, stops, '差一點點', 2))),
            G.q('禮物在哪一家百貨公司買？', '地點', dept, G.others(P.depts, dept)),
            G.q('蛋糕要去哪一家拿？', '地點', cake + '蛋糕店', G.others(P.cakeShops, cake, '差一點點').map(function (l) { return L(l.v + '蛋糕店', l.k); })),
            G.q('UBIKE 第一個彎，最後改在哪轉？', '更正', s1b, [L(s1, '新舊混淆', s1 + '在施工，不在那裡轉。'),
                L(s2, '順序顛倒', s2 + '是第二個彎。'), L(s3, '張冠李戴', s3 + '是公車站那條路。')], { must: true }),
            G.q('UBIKE 第二個彎在哪一條路？', '地點', s2, [L(s1b, '順序顛倒', s1b + '是第一個彎。'), L(s3, '張冠李戴', s3 + '是公車站那條路。'),
                L(s2alt, '差一點點', '「' + s2alt + '」和「' + s2 + '」很像，紙條上是「' + s2 + '」。')]),
            G.q('最後一段的公車站在哪一條路？', '地點', s3, [L(s2, '張冠李戴', s2 + '是第二個彎。'), L(s1b, '張冠李戴', s1b + '是第一個彎。'),
                L(s3alt, '差一點點', '「' + s3alt + '」和「' + s3 + '」很像，紙條上是「' + s3 + '」。')]),
            G.q('禮物最後要什麼顏色？', '更正', gc2, [L(gc, '新舊混淆', gc + '是改口之前的顏色。'), L(gc3, '似曾相識', gc3 + '是去年那份禮物的顏色。')].concat(G.others(P.giftColors, [gc, gc2], '差一點點', 2)), { must: true }),
            G.q('蛋糕最後是什麼口味？', '更正', fk(fl[1]), [L(fk(fl[0]), '新舊混淆', fl[0] + '是改口之前的口味。'),
                L(fk(fl[2]), '似曾相識', fl[2] + '是' + nb + '說好吃的。'), L(fk(nearF(fl[1])), '差一點點')], { must: true }),
            turnQ(G, 'UBIKE 第一個彎要怎麼轉？', t1, t2, '那是第二個彎的方向。'),
            turnQ(G, 'UBIKE 第二個彎要怎麼轉？', t2, t1, '那是第一個彎的方向。'),
            G.q('下公車後，第幾個巷子轉彎？', '數字', ord(a1), [L(ord(a2), '張冠李戴', '「' + cnCount(a2) + '個」是轉進巷子後，再過幾個巷子。')]
                .concat(G.near(a1, ord, { lo: 1, hi: 6, swap: false }))),
            turnQ(G, '下公車後，第一次轉彎怎麼轉？', t3, t4, '那是第二次轉彎的方向。'),
            G.q('轉進巷子後，再過幾個巷子轉彎？', '數字', cnt(a2), [L(cnt(a1), '張冠李戴', '「第' + cnNum(a1) + '個」是下公車後第一個轉彎的巷子。')]
                .concat(G.near(a2, cnt, { lo: 1, hi: 6, swap: false }))),
            turnQ(G, '下公車後，第二次轉彎怎麼轉？', t4, t3, '那是第一次轉彎的方向。'),
            G.q('家在哪一邊、第幾間？', '方向', sideK(side, k), [L(sideK(opp, k), '差一點點', '左右弄反了，是' + side + '手邊。'),
                L(sideK(side, a1), '張冠李戴', '「第' + cnNum(a1) + '」是第幾個巷子轉彎。'),
                L(sideK(side, k + 1), '數字相近'), L(sideK(side, k - 1), '數字相近')], { must: true }),
            G.q('生日禮物是什麼？', '物品', gift.n, [L(lastGift.n, '似曾相識', lastGift.n + '是去年送的禮物。'), L(noiseThing, '似曾相識', noiseThing + '只是' + nb + '順口提到的。')].concat(G.others(giftNames, gift.n, '差一點點', 2))),
            G.q('蛋糕用什麼形狀的盒子裝？', '形狀', box, G.others(P.boxShapes, box)),
            G.q('什麼時候要傳簡訊？', '順序', '走出百貨公司時', [L('拿到蛋糕後', '順序顛倒', '是走出百貨公司的時候，還沒去拿蛋糕。'),
                L('騎 UBIKE 前', '順序顛倒', '是走出百貨公司的時候。'), L('回到家的時候', '差一點點')]),
            G.q('簡訊要寫什麼？', '物品', '禮物買好了', [L('蛋糕拿到了', '張冠李戴', '簡訊是走出百貨公司時傳的，那時還沒拿蛋糕。'),
                L('快到家了', '差一點點'), L('生日快樂', '差一點點')]),
            G.q('禮物加蛋糕一共多少錢？', '計算', yuan(total), [L(yuan(g1 + c1), '新舊混淆', '這是蛋糕改口味之前的總數。'),
                L(yuan(total + 100), '計算失誤'), L(yuan(total - 10), '計算失誤'), L(yuan(total + 10), '計算失誤')], { must: true }),
            G.q('要不要先去提款機領錢？', '計算', '要，錢不夠', [L('不用，錢夠', '新舊混淆', '蛋糕改口味變貴了，兩樣加起來 ' + total + ' 元，超過身上的 ' + cash + ' 元。'),
                L('到家再說', '差一點點', '紙條說超過身上的現金，就要先去提款機。'), L('先打電話問', '差一點點', '紙條說超過身上的現金，就要先去提款機。')], { must: true }),
            G.q('兩樣加起來，和身上的現金差多少？', '計算', yuan(d2), [L(yuan(d1), '新舊混淆', '這是蛋糕改口味之前的差額。'),
                L(yuan(d1 + d2), '計算失誤', '那是蛋糕漲的價錢。'), L(yuan(d2 + 10), '計算失誤'), L(yuan(d2 + 100), '計算失誤')]),
            G.q('今天是誰的生日？', '人物', p, [L(who, '張冠李戴', who + '是傳訊息給你的人。'), L(nb, '似曾相識', nb + '只是說過蛋糕好吃。'),
                L(nb2, '似曾相識', nb2 + '是騎車跌倒的人。')]),
            G.q('誰打電話來改計畫？', '人物', who, [L(p, '張冠李戴', p + '是今天生日的人。'), L(nb, '似曾相識', nb + '只是說過蛋糕好吃。'),
                L(nb2, '似曾相識', nb2 + '是騎車跌倒的人。')]),
            G.dateQ('今天（生日那天）是幾月幾日？', today, [], { must: true }),
            G.weekQ('今天是星期幾？', today)
        ];
        return { note: note, qs: finish(G, qs, 32, 6) };
    }

    /* ═══ 故事主軸（範本）═══
       每一局先挑一個主軸，8 關都用同一個主軸（不混用），讓關與關之間也互相干擾。
       主軸：{ id, name, names:[8 個關名], setup(G) → 整局共用的參數 S, levels:[8 個 fn(G, S, X)], X:主軸專用的文字與題庫 }
       新增主軸：在另一個檔案呼叫 QuizGen.addTheme({...})，並加到 boot.js 的載入清單（quiz_gen.js 之後）。 */
    var THEMES = {};
    var ORDER = [];
    QuizGen.addTheme = function (th) {
        if (!THEMES[th.id]) ORDER.push(th.id);
        THEMES[th.id] = th;
    };
    QuizGen.themes = function () { return ORDER.map(function (id) { return { id: id, name: THEMES[id].name }; }); };

    /* 第 1～4 關的共用結構：各主軸只換開場文字與題庫 */
    QuizGen.lib = {
        P: P, T: T, L: L, cnNum: cnNum, cnCount: cnCount, twoDiff: twoDiff, threeDiff: threeDiff, rev2: rev2, perms: perms,
        finish: finish, flowerSet: flowerSet, flowerQs: flowerQs, turnQ: turnQ, people: people, otherGrand: otherGrand,
        mkDay: mkDay, addDays: addDays, between: between, fromNow: fromNow, timeline: timeline, seasonOf: seasonOf, wearOf: wearOf, WEEK: WEEK,
        L1: L1, L2: L2, L3: L3, L4: L4
    };

    /* 主軸一：生日（不同人的生日、不同的需求） */
    QuizGen.addTheme({
        id: 'birthday', name: '生日',
        names: ['新手暖身', '兩件差事', '先後順序', '顏色形狀', '兩段行程', '臨時改口', '一通電話', '回家的路'],
        /* 時間軸：每一關隔 4～10 天；每一關都有一個人在 2～9 天後過生日 */
        setup: function (G) { return { tl: timeline(G, [4, 10], [2, 9]) }; },
        X: {
            errands1: P.errands1,
            head1: function (G, S, D) {
                var p = G.pick(P.kin.concat(P.friends));
                var ps = [L(D.today.s, '張冠李戴', D.today.s + '是今天，生日是' + D.ev.s + '。')];
                return {
                    line: '今天是' + D.today.sw + '。' + D.ev.sw + '是' + p + '的生日，你下午五點下班，要先幫忙辦一件事：',
                    qs: [
                        G.dateQ('生日是哪一天？', D.ev, ps, { must: true }),
                        G.q('是誰要過生日？', '人物', p, G.others(P.kin.concat(P.friends), p, '差一點點'))
                    ]
                };
            },
            ctx2: function (G, S, D, who) {
                return {
                    when: D.today.sw + '下午四點',
                    ctx: D.ev.sw + '是我的生日',
                    qs: [
                        G.dateQ(who + '的生日是哪一天？', D.ev, [L(D.today.s, '張冠李戴', D.today.s + '是打電話來的那天。')], { must: true }),
                        G.weekQ(who + '的生日是星期幾？', D.ev, [L(D.today.w, '張冠李戴', D.today.w + '是打電話來的那天。')])
                    ]
                };
            },
            shops: P.shops,
            head3: function (G, S, D) {
                var p = G.pick(P.kin.concat(P.friends));
                return {
                    line: '今天是' + D.today.sw + '早上九點。' + D.ev.s + '是' + p + '的生日，大家忙著準備慶生。',
                    qs: [
                        G.dateQ('大家準備慶生的生日是哪一天？', D.ev, [L(D.today.s, '張冠李戴', D.today.s + '是今天。')], { must: true }),
                        G.daysQ('今天離那個生日還有幾天？', D.today, D.ev)
                    ]
                };
            },
            errands3: P.errands3,
            head4: function (G, S, D, v) {
                return {
                    line: T('今天是{t}晚上七點。{d}是{g}的生日，{who}拜託你下班去{street}的{shop}，買幾樣布置生日會的東西。',
                        { t: D.today.sw, d: D.ev.sw, g: v.g, who: v.who, street: v.street, shop: v.shop }),
                    qs: [
                        G.dateQ('生日會是哪一天？', D.ev, [L(D.today.s, '張冠李戴', D.today.s + '是今天。')], { must: true }),
                        G.weekQ('生日會是星期幾？', D.ev, [L(D.today.w, '張冠李戴', D.today.w + '是今天。')])
                    ]
                };
            },
            things4: P.things4
        },
        levels: [L1, L2, L3, L4, L5, L6, L7, L8]
    });

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
                var body = th.levels[i](G, S, th.X);
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
