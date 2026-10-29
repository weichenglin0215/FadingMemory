/* ═══════════════════════════════════════════════════════════════════
   identity_ui.js — 「玩家身分」的畫面（V1.35.0）：建立暱稱與密碼、登入、帳號面板
   ───────────────────────────────────────────────────────────────────
   流程與規則在 js/identity.js（呼叫資料庫、錯誤翻譯、同步），這個檔案只負責畫面，載入後把功能掛在 Identity.ui 底下：
     Identity.ui.accountDialog(cfg)   「建立暱稱與密碼」／「登入」彈窗，回傳 Promise<{kind}>
         cfg.mode     'legacy'（V1.34 以前的舊玩家認領，沒有關閉鈕）／'new'（新玩家成績進前 30 名，可以按「先不要」）／'login'（登入）
         cfg.initialNick 帶入的暱稱；cfg.cancelable 能不能關掉；cfg.game／cfg.score  new 模式要一起寫入的第一筆成績；
         cfg.skipFlush 成功之後不要馬上補送待送的成績（呼叫的人自己處理）
         kind：'registered'（新玩家建好帳號、成績也寫進去了，data 是資料庫回傳的榜單）／'logged-in'／'cancel'／'not-qualified'
     Identity.ui.showAccount()        「我的帳號」面板：改暱稱、設定新密碼、合併到另一個帳號、登出
   彈窗的外框與卡片是「彈窗公版」（js/dialog.js 的 Dlg.open、css/dialog.css）：位置、暗底、寬度、按鈕尺寸與顏色跟其他彈窗一致，
   公版彈窗本來就不能點背景或按 Esc 關掉，所以「認領舊暱稱」不放任何關閉按鈕就是不可略過；這裡的樣式在 css/identity.css。
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    var h = global.UI.h;
    var LB = global.Leaderboard;
    var ID = global.Identity;
    var NICK_DEBOUNCE_MS = 500;        /* 暱稱欄停止輸入多久之後才去問資料庫「這個暱稱能不能用」 */

    function sfx(name) { if (global.Sfx) { global.Sfx.unlock(); global.Sfx.play(name); } }
    function toast(text) { if (global.Dlg && global.Dlg.toast) global.Dlg.toast(text); }

    /* 暱稱輸入框與 4 位數密碼輸入框
       密碼用「明碼」（不是圓點）：只有 4 個數字，長輩用圓點很容易輸錯，建立完卻不知道自己設了什麼；
       inputmode="numeric" 手機會跳出數字鍵盤；autocomplete="off" 避免瀏覽器跳出「儲存密碼」。 */
    function nickInput(value) {
        var el = h('input', {
            'class': 'dlg-input idn-input',
            attrs: { type: 'text', maxlength: String(LB.CFG.NICK_MAX), autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
                     enterkeyhint: 'next', placeholder: '最多 ' + LB.CFG.NICK_MAX + ' 個字', 'aria-label': '暱稱' }
        });
        el.value = value || '';
        return el;
    }
    function pinInput() {
        var el = h('input', {
            'class': 'dlg-input idn-input idn-pin',
            attrs: { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '4', autocomplete: 'off', spellcheck: 'false',
                     enterkeyhint: 'done', placeholder: '4 個數字', 'aria-label': '密碼（4 個數字）' }
        });
        el.addEventListener('input', function () {
            var c = ID.cleanPin(el.value);
            if (c !== el.value) el.value = c;
        });
        return el;
    }
    /* 一列「標籤＋輸入框」 */
    function fieldRow(label, input) {
        return h('div', { 'class': 'idn-row' }, [h('div', { 'class': 'idn-label', text: label }), input]);
    }

    /* ═══════════════════════════════════════════════════════════════
       一、「建立暱稱與密碼」／「登入」彈窗
       ═══════════════════════════════════════════════════════════════ */
    function accountDialog(cfg) {
        cfg = cfg || {};
        return new Promise(function (resolve) {
            var origin = cfg.mode;                       /* 一開始是哪一種（決定有哪些按鈕） */
            var mode = cfg.mode;                         /* 目前是哪一種：new 可以切到 login */
            var legacyPid = origin === 'legacy' ? LB.peekPid() : null;
            var nick = nickInput(cfg.initialNick);
            var pin = pinInput();
            var msg = h('div', { 'class': 'idn-msg', attrs: { 'aria-live': 'polite' } });
            var note = h('div', { 'class': 'idn-note' });
            var intro = h('div', { 'class': 'dlg__text idn-intro' });
            var st = { state: 'unknown', suggestion: '', busy: false, closed: false, seq: 0, timer: null, lockedMsg: false };
            var ctl, primary, second, third;

            function value() { return LB.cleanNick(nick.value); }
            function pinValue() { return ID.cleanPin(pin.value); }
            function setMsg(kind, text) {
                msg.className = 'idn-msg' + (kind ? ' idn-msg--' + kind : '');
                msg.textContent = text || '';
            }

            /* 說明文字（依模式）。舊玩家與新玩家都要「簡短說明這次改版的用意」 */
            function paintTexts() {
                if (mode === 'legacy') {
                    ctl.card.querySelector('.dlg__title').textContent = '建立暱稱與密碼';
                    intro.textContent = '排行榜升級了！為了不讓別人冒用你的暱稱、換手機也能接著玩，請設一組 4 位數密碼。';
                    note.textContent = '請記下這 4 個數字，也請不要用銀行或手機的密碼。已經在別的裝置設定過？輸入同樣的暱稱與密碼，就會連在一起。';
                } else if (mode === 'new') {
                    ctl.card.querySelector('.dlg__title').textContent = '恭喜進榜！建立暱稱與密碼';
                    intro.textContent = '你的成績進了世界前 ' + (((cfg.game && LB.cached(cfg.game.id)) || {}).limit || LB.CFG.LIMIT_DEFAULT) + ' 名！請取個暱稱、設一組 4 位數密碼，換手機也不會弄丟成績。';
                    note.textContent = '請記下這 4 個數字，也請不要用銀行或手機的密碼。';
                } else {
                    ctl.card.querySelector('.dlg__title').textContent = '登入';
                    intro.textContent = '請輸入暱稱和密碼。登入之後，成績與最佳紀錄都會跟著你。';
                    note.textContent = '忘記密碼了？在還登入著的裝置上，到「帳號」裡設定新密碼；全都登出了，請聯絡我們。';
                }
            }

            /* 按鈕：文字、能不能按，依「模式＋暱稱狀態」決定 */
            function paintButtons() {
                var okNick = value().length > 0, okPin = ID.validPin(pinValue());
                var s = st.state;
                var primaryText, primaryOk;
                if (mode === 'login') {
                    primaryText = '登入';
                    primaryOk = okNick && okPin;
                } else if (s === 'taken') {
                    primaryText = '登入（我就是本人）';
                    primaryOk = okNick && okPin;
                } else if (s === 'free' || s === 'unknown' || s === 'offline') {
                    primaryText = origin === 'legacy' ? '建立' : '建立並上傳成績';
                    primaryOk = okNick && okPin && s !== 'unknown';
                } else {                                       /* reserved、bad：要先換暱稱 */
                    primaryText = '建立';
                    primaryOk = false;
                }
                if (st.busy) primaryOk = false;
                primary.textContent = st.busy ? '處理中…' : primaryText;
                primary.disabled = !primaryOk;
                /* 第二顆：「不是我，換個暱稱」（暱稱已被使用／保留中時）；其他情況的切換連結 */
                var secText = '', secAct = null;
                if (mode !== 'login' && (s === 'taken' || s === 'reserved')) { secText = s === 'taken' ? '不是我，換個暱稱' : '換個暱稱'; secAct = 'rename'; }
                else if (mode === 'new') { secText = '我已經有帳號，改用登入'; secAct = 'tologin'; }
                else if (mode === 'login' && origin === 'new') { secText = '還沒有帳號？回去建立'; secAct = 'tonew'; }
                second.hidden = !secText;
                second.textContent = secText;
                second.dataset.act = secAct || '';
                second.disabled = st.busy;
                third.hidden = !cfg.cancelable;
                third.disabled = st.busy;
            }

            /* 問資料庫這個暱稱能不能用（舊玩家與新玩家的建立模式才需要；登入模式不用）。
               停止輸入 500 毫秒後才問；回覆回來時暱稱已經又改了就丟掉（seq 比對）。 */
            function scheduleCheck(immediate, keepMsg) {
                if (mode === 'login') { st.state = 'free'; paintButtons(); return; }
                if (st.timer) { global.clearTimeout(st.timer); st.timer = null; }
                st.state = value() ? 'unknown' : 'free';
                if (!keepMsg) setMsg('', '');
                paintButtons();
                if (!value()) return;
                var my = ++st.seq;
                function run() {
                    st.timer = null;
                    ID.checkNick(value(), legacyPid).then(function (r) {
                        if (st.closed || my !== st.seq) return;
                        if (!r.ok) { st.state = 'offline'; setMsg('err', ID.errorText(r.error)); paintButtons(); return; }
                        var d = r.data || {};
                        st.suggestion = d.suggestion || '';
                        applyNickState(d.state, d);
                    });
                }
                if (immediate) run(); else st.timer = global.setTimeout(run, NICK_DEBOUNCE_MS);
            }
            /* 暱稱狀態（free／taken／reserved／bad）→ 提示文字與按鈕 */
            function applyNickState(state, d) {
                st.state = state;
                var n = value();
                if (state === 'taken') {
                    setMsg('warn', '「' + n + '」已經有人使用。若你就是本人（在別的裝置設定過），輸入原本的密碼按「登入」；若不是，請換一個暱稱。');
                } else if (state === 'reserved') {
                    setMsg('warn', ID.errorText('nick_reserved', d, n));
                } else if (state === 'bad') {
                    setMsg('err', ID.errorText('bad_nick'));
                } else if (!st.keepWarn) {
                    setMsg('', '');
                }
                st.keepWarn = false;
                paintButtons();
            }

            function finish(res) {
                if (st.closed) return;
                st.closed = true;
                if (st.timer) global.clearTimeout(st.timer);
                ctl.close();
                resolve(res);
            }

            /* 按下主按鈕：依模式與暱稱狀態決定呼叫哪一個資料庫函式 */
            function submit() {
                if (st.busy || primary.disabled) return;
                var n = value(), p = pinValue();
                var action = mode === 'login' ? 'login'
                    : (st.state === 'taken' ? (origin === 'legacy' ? 'claim' : 'login')
                        : (origin === 'legacy' ? 'claim' : 'register'));
                st.busy = true; setMsg('', '處理中…'); paintButtons();
                var call = action === 'register' ? ID.register(n, p, cfg.game && cfg.game.id, cfg.score)
                    : action === 'claim' ? ID.claim(n, p) : ID.login(n, p);
                call.then(function (r) {
                    st.busy = false;
                    if (st.closed) return;
                    if (r.ok) return onSuccess(action, r.data);
                    onError(action, r);
                });
            }

            function onSuccess(action, d) {
                ID.finishSession(d, { skipFlush: !!cfg.skipFlush }).then(function () {
                    if (action === 'register') { sfx('ok'); return finish({ kind: 'registered', data: d }); }
                    sfx('ok');
                    toast(d.joined ? '已連上你的帳號「' + d.nick + '」，成績與紀錄都帶過來了' : (action === 'claim' ? '帳號建立好了！換手機時用暱稱和密碼登入' : '登入成功，歡迎回來'));
                    finish({ kind: 'logged-in' });
                });
            }

            function onError(action, r) {
                var e = r.error, d = r.data || {};
                if (e === 'not_qualified') { toast(ID.errorText(e)); return finish({ kind: 'not-qualified' }); }
                if (e === 'unknown_legacy') { LB.dropLegacy(); return finish({ kind: 'guest' }); }
                if (e === 'already_claimed') { LB.markRelogin(); mode = 'login'; paintTexts(); setMsg('err', ID.errorText(e)); scheduleCheck(true); return; }
                if (e === 'nick_taken' || e === 'nick_reserved') {
                    st.suggestion = d.suggestion || st.suggestion;
                    applyNickState(e === 'nick_taken' ? 'taken' : 'reserved', d);
                    return;
                }
                if (e === 'wrong_pin' || e === 'locked') { pin.value = ''; setMsg('err', ID.errorText(e, d, value())); paintButtons(); try { pin.focus(); } catch (x) { } return; }
                setMsg('err', ID.errorText(e, d, value()));
                paintButtons();
            }

            /* 「不是我，換個暱稱」：把暱稱欄換成建議的名字（原暱稱＋隨機 3 位數），提示照使用者指定的文字 */
            function renameSuggestion() {
                nick.value = st.suggestion || value();
                st.keepWarn = true;
                setMsg('warn', '該暱稱與其他玩家重複，請輸入新暱稱');
                scheduleCheck(true, true);
                try { nick.focus(); nick.select(); } catch (x) { }
            }

            /* 建立卡片：標題、說明、兩個輸入列、提示、訊息、三顆按鈕 */
            ctl = Dlg.open({
                cls: 'dlg--idn', title: ' ',
                children: [intro, fieldRow('暱稱', nick), fieldRow('密碼', pin), note, msg],
                buttons: [
                    { text: '建立', kind: 'primary', keep: true, sfx: 'ok', onClick: submit },
                    { text: '', kind: 'line', cls: 'btn--sm idn-second', keep: true, onClick: function (c, el) {
                        var act = el.dataset.act;
                        if (act === 'rename') renameSuggestion();
                        else if (act === 'tologin') { mode = 'login'; st.state = 'free'; setMsg('', ''); paintTexts(); scheduleCheck(true); }
                        else if (act === 'tonew') { mode = 'new'; paintTexts(); scheduleCheck(true); }
                    } },
                    { text: '先不要', kind: 'line', cls: 'btn--sm idn-cancel', keep: true, onClick: function () { finish({ kind: 'cancel' }); } }
                ]
            });
            primary = ctl.buttons[0]; second = ctl.buttons[1]; third = ctl.buttons[2];
            paintTexts();
            nick.addEventListener('input', function () { scheduleCheck(false); });
            pin.addEventListener('input', function () { paintButtons(); });
            nick.addEventListener('keydown', function (e) { if (e.key === 'Enter') { try { pin.focus(); } catch (x) { } } });
            pin.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
            scheduleCheck(true);
            /* 帶入了暱稱就把游標直接放在密碼欄（舊玩家最常見的情況）；沒有暱稱就先填暱稱 */
            try { (value() ? pin : nick).focus(); } catch (e) { }
        });
    }

    /* ═══════════════════════════════════════════════════════════════
       二、小表單彈窗（帳號面板裡的改暱稱、設新密碼、合併帳號共用）
       cfg：title／sub／fields: [{ key:'nick'|'pin', label, initial }]／okText／submit(values) → Promise<{ok, error, data, msg}>
       submit 回 ok:true 就關掉並 resolve(true)；回 ok:false 就把 errorText 顯示在彈窗裡，讓玩家改了再試。
       ═══════════════════════════════════════════════════════════════ */
    function formDialog(cfg) {
        return new Promise(function (resolve) {
            var inputs = {}, rows = [];
            (cfg.fields || []).forEach(function (f) {
                var el = f.key === 'pin' ? pinInput() : nickInput(f.initial);
                inputs[f.key] = el;
                rows.push(fieldRow(f.label, el));
            });
            var msg = h('div', { 'class': 'idn-msg' });
            var busy = false, closed = false;
            var ctl = Dlg.open({
                cls: 'dlg--idn dlg--idn-form', title: cfg.title, sub: cfg.sub || '',
                children: rows.concat(cfg.note ? [h('div', { 'class': 'idn-note', text: cfg.note })] : [], [msg]),
                buttons: [
                    { text: cfg.okText || '確定', kind: 'primary', keep: true, sfx: 'ok', onClick: go },
                    { text: '取消', kind: 'line', cls: 'btn--sm', keep: true, onClick: function () { done(false); } }
                ]
            });
            var ok = ctl.buttons[0];
            function vals() { return { nick: LB.cleanNick(inputs.nick ? inputs.nick.value : ''), pin: ID.cleanPin(inputs.pin ? inputs.pin.value : '') }; }
            function sync() {
                var v = vals();
                ok.disabled = busy || (inputs.nick && !v.nick) || (inputs.pin && !ID.validPin(v.pin));
            }
            function done(res) { if (closed) return; closed = true; ctl.close(); resolve(res); }
            function go() {
                if (busy || ok.disabled) return;
                busy = true; msg.className = 'idn-msg'; msg.textContent = '處理中…'; sync();
                cfg.submit(vals()).then(function (r) {
                    busy = false;
                    if (closed) return;
                    if (r.ok) return done(true);
                    msg.className = 'idn-msg idn-msg--err';
                    msg.textContent = r.msg || ID.errorText(r.error, r.data, vals().nick);
                    if (inputs.pin) { inputs.pin.value = ''; }
                    sync();
                });
            }
            Object.keys(inputs).forEach(function (k) {
                inputs[k].addEventListener('input', function () { msg.textContent = ''; sync(); });
                inputs[k].addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
            });
            sync();
            try { (inputs.nick || inputs.pin).focus(); } catch (e) { }
        });
    }

    /* ═══════════════════════════════════════════════════════════════
       三、「我的帳號」面板
       ═══════════════════════════════════════════════════════════════ */
    function showAccount() {
        var st = LB.identityState();
        if (st !== 'in') return ID.askLogin();               /* 還沒登入：直接跳登入 */
        return new Promise(function (resolve) {
            var nickLine = h('div', { 'class': 'idn-acct__nick' });
            function paint() { nickLine.textContent = '暱稱：' + (LB.getNick() || '（未知）'); }
            paint();
            var ctl = Dlg.open({
                cls: 'dlg--idn dlg--idn-acct', title: '我的帳號',
                onClose: function () { resolve(); },
                children: [
                    nickLine,
                    h('div', { 'class': 'idn-note', text: '換手機或換瀏覽器時，用這個暱稱和密碼登入，成績與最佳紀錄就會跟著你。' })
                ],
                buttons: [
                    { text: '改暱稱', kind: 'sky', keep: true, onClick: function () {
                        formDialog({
                            title: '改暱稱', sub: '一天最多改 ' + ID.CFG.RENAME_PER_DAY + ' 次；player_id 不會變，榜上的成績都會換成新名字。',
                            fields: [{ key: 'nick', label: '暱稱', initial: LB.getNick() }], okText: '儲存',
                            submit: function (v) { return ID.rename(v.nick); }
                        }).then(function (ok) { if (ok) { paint(); toast('暱稱已經改成「' + LB.getNick() + '」'); } });
                    } },
                    { text: '設定新密碼', kind: 'sky', keep: true, onClick: function () {
                        formDialog({
                            title: '設定新密碼', sub: '忘記密碼了？在這裡直接設定新的，不需要舊密碼。',
                            note: '設好之後，你在其他裝置上的登入會被登出，要用新密碼重新登入。',
                            fields: [{ key: 'pin', label: '新密碼' }], okText: '儲存',
                            submit: function (v) { return ID.changePin(v.pin); }
                        }).then(function (ok) { if (ok) toast('新密碼設好了，請記下來'); });
                    } },
                    { text: '合併到另一個帳號', kind: 'sky', keep: true, onClick: function () {
                        formDialog({
                            title: '合併到另一個帳號', sub: '不小心建了兩個帳號？輸入另一個帳號的暱稱和密碼，把目前這個帳號的成績併過去。',
                            note: '合併之後，目前這個暱稱會消失，榜上的成績每款取比較好的。',
                            fields: [{ key: 'nick', label: '暱稱' }, { key: 'pin', label: '密碼' }], okText: '合併',
                            submit: function (v) {
                                return ID.loginAndMerge(v.nick, v.pin).then(function (r) {
                                    if (!r.ok) return r;
                                    return ID.finishSession(r.data).then(function () { return r; });
                                });
                            }
                        }).then(function (ok) { if (ok) { paint(); toast('合併好了，現在是「' + LB.getNick() + '」'); } });
                    } },
                    { text: '登出', kind: 'line', keep: true, onClick: function () {
                        Dlg.open({
                            cls: 'dlg--idn dlg--idn-form', title: '要登出嗎？',
                            text: '登出後，這支手機上的個人最佳會清掉（都存在你的帳號裡，下次登入就會回來）。',
                            btnRow: true,
                            buttons: [
                                { text: '取消', kind: 'line' },
                                { text: '登出', kind: 'primary', onClick: function () {
                                    ID.logout().then(function () { ctl.close(); toast('已經登出'); });
                                } }
                            ]
                        });
                    } },
                    { text: '關閉', kind: 'line', cls: 'btn--sm', onClick: function () { } }
                ]
            });
        });
    }

    ID.ui = { accountDialog: accountDialog, showAccount: showAccount, formDialog: formDialog };
})(window);
