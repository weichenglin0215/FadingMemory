-- ═══════════════════════════════════════════════════════════════════
-- MF_leaderboard.sql — 記憶模糊（FadingMemory）「世界排行榜」資料庫
-- ───────────────────────────────────────────────────────────────────
-- 用途：記錄「秒反應」每一款遊戲的世界前 30 名成績，以及玩家在結算彈窗寫下的意見（第 5 節，MF_feedback，分遊戲記錄）、
--       五星評價（第 6 節，MF_ratings／MF_rating_stats）；第 7 節是「阿嬤都比你厲害」用的查詢（這位玩家在哪些遊戲被超越）。
-- 執行方式：Supabase 專案 LoveIsABitMessy-DB → 左側 SQL Editor → New query →
--           貼上本檔全文 → Run。可以重複執行（全部都是「已存在就略過／覆蓋」的寫法）。
-- 共用專案提醒：這個專案同時也是 LoveIsABitMessy 在用，所以本檔
--   · 只建立名字以「MF_」開頭的東西，完全不碰 LoveIsABitMessy 的任何資料表；
--   · 不需要、也請不要打開 Authentication 的 Anonymous sign-ins
--     （匿名使用者會拿到 authenticated 身分，LoveIsABitMessy 的資料表權限是給
--      authenticated 的，打開等於把它們也開給所有路人）。
--
-- 【設計重點，給新手看的】
-- 1) 瀏覽器端程式碼裡的 anon key 是「公開」的（任何人看網頁原始碼都拿得到），
--    所以真正的保護不能靠藏 key，要靠資料庫自己：
--      · 兩張資料表都開啟 RLS（Row Level Security，列級安全）而且「不建任何
--        policy」＝ anon 角色完全不能直接 select／insert／update／delete；
--      · 玩家只能呼叫下面三個函式（RPC），函式內自己檢查資料、自己決定能不能寫。
-- 2) 函式用 SECURITY DEFINER（以建立者的權限執行），才有辦法寫入被鎖住的資料表；
--    同時一律 set search_path = ''，函式裡所有資料表都寫成 public."MF_xxx"，
--    避免有人用同名物件冒充（這是 SECURITY DEFINER 的標準防護）。
-- 3) 每個遊戲、每位玩家「只留最佳的一筆」（unique (game_id, player_id)），
--    每個遊戲「最多只留前 30 名」，超過的列會在寫入時順手刪掉：
--    所以整個資料表永遠不會超過「遊戲數 × 30」列（約 50 × 30 = 1500 列），
--    不管有多少玩家、有沒有人亂灌，免費方案的 500 MB 都用不完。
-- 4) 寫入前先用 pg_advisory_xact_lock 把「同一款遊戲」的寫入排隊，
--    兩個人同時刷新前 30 名也不會算錯名次（不同遊戲之間不互相等待）。
-- 5) player_id 是瀏覽器自己產生的隨機代號（不是帳號、不會對外回傳），只用來辨認
--    「這是同一個人在刷新自己的成績」，所以讀取函式絕對不回傳它，只回傳是不是你（mine）。
-- 6) 這是不需要登入的排行榜，資料庫無法證明「分數真的是玩出來的」，
--    只能擋範圍不合理（MF_games.min_score～max_score）與格式錯誤的資料。
--
-- 【常用查詢】（資料表名稱是大寫開頭，在 SQL Editor 手動查詢時一定要加雙引號）
--   select * from public."MF_games" order by game_id;
--   select * from public."MF_scores" where game_id = 'speed' order by rank_key, achieved_at;
--   delete from public."MF_scores" where game_id = 'zz_test';          -- 清掉測試資料
--   delete from public."MF_scores" where nickname = '某個不雅暱稱';     -- 管理者手動刪除
-- ═══════════════════════════════════════════════════════════════════


-- ═══ 1. 資料表 ═══

-- 遊戲清單：同時是「白名單」（沒登記的 game_id 一律拒絕寫入）與「規格表」。
--   better     'min'＝數字越小越好（秒、誤差）／'max'＝數字越大越好（關數、分數）
--   min_score／max_score  合理範圍，超出的成績一律拒絕（防呆＋擋最粗糙的亂填）
--   top_n      這款遊戲保留前幾名（預設 30）
create table if not exists public."MF_games" (
    game_id    text     primary key check (game_id ~ '^[a-z0-9_]{1,32}$'),
    title      text     not null,
    better     text     not null check (better in ('min', 'max')),
    min_score  numeric  not null,
    max_score  numeric  not null,
    top_n      smallint not null default 30 check (top_n between 1 and 100),
    enabled    boolean  not null default true,
    check (min_score <= max_score)
);

-- 成績表：每個 (遊戲, 玩家) 只有一列，存這位玩家在這款遊戲的最佳成績。
--   score        成績本身（小數 4 位，跟畫面上看到的數字一樣）
--   rank_key     排序用：better='min' 時等於 score，'max' 時等於 -score，
--                這樣不管哪種遊戲，「rank_key 越小名次越前面」，一個索引通用
--   achieved_at  這個成績是什麼時候達成的（同分時，先達成的排前面）
create table if not exists public."MF_scores" (
    id          bigint        generated always as identity primary key,
    game_id     text          not null references public."MF_games" (game_id) on delete cascade on update cascade,
    player_id   uuid          not null,
    nickname    text          not null check (char_length(nickname) between 1 and 12),
    score       numeric(14,4) not null,
    rank_key    numeric(14,4) not null,
    achieved_at timestamptz   not null default now(),
    unique (game_id, player_id)
);

-- 查「某款遊戲的前 30 名」「刪掉第 31 名以後」都靠這個索引，資料量再大也只掃前幾列。
create index if not exists "MF_scores_rank_idx"
    on public."MF_scores" (game_id, rank_key, achieved_at, id);


-- ═══ 2. 鎖住資料表（anon／登入者都不能直接碰；只有下面的函式能） ═══
alter table public."MF_games"  enable row level security;
alter table public."MF_scores" enable row level security;
revoke all on table public."MF_games"  from public, anon, authenticated;
revoke all on table public."MF_scores" from public, anon, authenticated;


-- ═══ 3. 函式（RPC） ═══

-- 3-1 讀取：某款遊戲的前 N 名。
--   p_player_id 可以不給；給了，回傳的每一列會多一個 mine（是不是這位玩家自己）。
--   回傳 JSON：{ game_id, better, limit, top: [ {rank, nick, score, mine}, ... ] }
--   找不到（或停用）的遊戲回傳 null。
create or replace function public."MF_get_top"(p_game_id text, p_player_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select jsonb_build_object(
        'game_id', g.game_id,
        'better',  g.better,
        'limit',   g.top_n,
        'top', coalesce((
            select jsonb_agg(
                       jsonb_build_object(
                           'rank',  t.pos,
                           'nick',  t.nickname,
                           'score', t.score,
                           'mine',  coalesce(t.player_id = p_player_id, false)
                       ) order by t.pos)
              from (
                    select s.nickname, s.score, s.player_id,
                           row_number() over (order by s.rank_key, s.achieved_at, s.id) as pos
                      from public."MF_scores" s
                     where s.game_id = g.game_id
                   ) t
             where t.pos <= g.top_n
        ), '[]'::jsonb)
    )
      from public."MF_games" g
     where g.game_id = p_game_id
       and g.enabled;
$$;

-- 3-2 寫入：送出一筆成績。
--   規則：
--     · 這位玩家在這款遊戲已經有紀錄 → 只有「嚴格比自己的紀錄好」才更新；
--     · 還沒有紀錄 → 榜上不到 N 列就直接寫入，滿了就要「嚴格勝過第 N 名」才寫入
--       （同分算先達成的人贏，所以平手擠不掉別人）；
--     · 寫入後把第 N+1 名以後的列刪掉，榜單永遠最多 N 列。
--   回傳：MF_get_top 的內容再加上 ok、saved（這次有沒有寫進榜）、rank（這位玩家目前的名次，沒上榜為 null）。
--   失敗回傳 { ok:false, error:'unknown_game' | 'bad_args' | 'out_of_range' }。
--   重送同一筆成績是安全的（不是「更好」就什麼都不會改），所以網路不穩時前端可以放心重試。
create or replace function public."MF_submit_score"(
    p_game_id   text,
    p_player_id uuid,
    p_nickname  text,
    p_score     numeric
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    c_nick_len constant int := 8;      -- 暱稱最多幾個字（前端的輸入框也是 8，兩邊要一致）
    g          public."MF_games"%rowtype;
    v_nick     text;
    v_score    numeric;
    v_key      numeric;
    v_old      public."MF_scores"%rowtype;
    v_me       public."MF_scores"%rowtype;
    v_count    int;
    v_worst    numeric;
    v_saved    boolean := false;
    v_rank     int;
begin
    -- (1) 遊戲要登記過、參數要合理
    select * into g from public."MF_games" where game_id = p_game_id and enabled;
    if not found then
        return jsonb_build_object('ok', false, 'error', 'unknown_game');
    end if;
    if p_player_id is null or p_score is null then
        return jsonb_build_object('ok', false, 'error', 'bad_args');
    end if;
    -- 暱稱：控制字元、零寬字元、文字方向控制字元與連續空白，一律換成單一空格；去頭尾空白；最多 8 個字
    v_nick := btrim(left(btrim(regexp_replace(coalesce(p_nickname, ''),
                  '[[:cntrl:][:space:]\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]+', ' ', 'g')), c_nick_len));
    if char_length(v_nick) < 1 then
        return jsonb_build_object('ok', false, 'error', 'bad_args');
    end if;
    v_score := round(p_score, 4);
    if v_score < g.min_score or v_score > g.max_score then
        return jsonb_build_object('ok', false, 'error', 'out_of_range');
    end if;
    v_key := case g.better when 'min' then v_score else -v_score end;

    -- (2) 同一款遊戲的寫入排隊（交易結束自動解鎖）
    perform pg_advisory_xact_lock(hashtextextended('MF_scores:' || p_game_id, 0));

    -- (3) 判斷要不要寫入
    select * into v_old from public."MF_scores" where game_id = p_game_id and player_id = p_player_id;
    if found then
        if v_key < v_old.rank_key then
            update public."MF_scores"
               set score = v_score, rank_key = v_key, nickname = v_nick, achieved_at = now()
             where id = v_old.id;
            v_saved := true;
        elsif v_old.nickname <> v_nick then
            -- 分數沒有進步，但暱稱換過了：順便把暱稱更新成最新的
            update public."MF_scores" set nickname = v_nick where id = v_old.id;
        end if;
    else
        select count(*) into v_count from public."MF_scores" where game_id = p_game_id;
        if v_count < g.top_n then
            v_saved := true;
        else
            select max(rank_key) into v_worst from public."MF_scores" where game_id = p_game_id;
            v_saved := v_key < v_worst;
        end if;
        if v_saved then
            insert into public."MF_scores" (game_id, player_id, nickname, score, rank_key)
            values (p_game_id, p_player_id, v_nick, v_score, v_key);
            -- 保持最多 top_n 列：第 top_n + 1 名以後全部刪掉
            delete from public."MF_scores"
             where id in (select id
                            from public."MF_scores"
                           where game_id = p_game_id
                           order by rank_key, achieved_at, id
                          offset g.top_n);
        end if;
    end if;

    -- (4) 這位玩家目前的名次：比他排得更前面的列數 + 1（沒有紀錄就維持 null）
    select * into v_me from public."MF_scores" where game_id = p_game_id and player_id = p_player_id;
    if found then
        select count(*) + 1 into v_rank
          from public."MF_scores"
         where game_id = p_game_id
           and (rank_key, achieved_at, id) < (v_me.rank_key, v_me.achieved_at, v_me.id);
    end if;

    return public."MF_get_top"(p_game_id, p_player_id)
        || jsonb_build_object('ok', true, 'saved', v_saved, 'rank', v_rank);
end;
$$;

-- 3-3 改暱稱：把這位玩家在所有遊戲的暱稱一次換成新的。
create or replace function public."MF_rename_player"(p_player_id uuid, p_nickname text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_nick text;
    v_rows int;
begin
    v_nick := btrim(left(btrim(regexp_replace(coalesce(p_nickname, ''),
                  '[[:cntrl:][:space:]\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]+', ' ', 'g')), 8));
    if p_player_id is null or char_length(v_nick) < 1 then
        return jsonb_build_object('ok', false, 'error', 'bad_args');
    end if;
    update public."MF_scores" set nickname = v_nick where player_id = p_player_id;
    get diagnostics v_rows = row_count;
    return jsonb_build_object('ok', true, 'rows', v_rows);
end;
$$;

-- 函式預設誰都能執行；先全部收回，再只開給 anon（網頁訪客）與 authenticated。
revoke all on function public."MF_get_top"(text, uuid)               from public;
revoke all on function public."MF_submit_score"(text, uuid, text, numeric) from public;
revoke all on function public."MF_rename_player"(uuid, text)         from public;
grant execute on function public."MF_get_top"(text, uuid)               to anon, authenticated;
grant execute on function public."MF_submit_score"(text, uuid, text, numeric) to anon, authenticated;
grant execute on function public."MF_rename_player"(uuid, text)         to anon, authenticated;


-- ═══ 4. 遊戲登記 ═══
-- 新增一款遊戲到排行榜：先在該遊戲檔案（js/reaction_<id>.js）寫好 score 設定，
-- 再執行  node test/leaderboard/gen_games_sql.cjs --write  ，下面「自動產生」兩行標記之間的列就會自動更新
-- （game_id、遊戲名稱、better／min_score／max_score 全部取自遊戲檔案，不用手抄）；
-- 然後重新執行本檔（可重複執行；或只執行這段 insert）。
-- better：min＝數字越小越好／max＝數字越大越好；min_score～max_score：合理範圍，超出的成績資料庫一律拒絕。
-- zz_test 是手寫的測試用遊戲（給資料庫測試用，可以刪），不在遊戲檔案裡，所以放在標記外面。
insert into public."MF_games" (game_id, title, better, min_score, max_score) values
    -- >>> 自動產生開始（node test/leaderboard/gen_games_sql.cjs --write 會重寫這兩行標記之間的內容，請不要手改）
    ('speed',        '零秒出手', 'min', 0, 60),
    ('drop',         '神準落下', 'max', 1, 1000),
    ('spot',         '大家來找碴', 'max', 1, 200),
    ('impossible',   '不可能任務', 'min', 0, 30),
    ('shapes',       '形形色色', 'max', 1, 200),
    ('matchcolor',   '色不異空', 'min', 0, 300),
    ('rainbow',      '七彩陷阱', 'max', 1, 1000),
    ('pendulum',     '六點鐘方向', 'min', 0, 31),
    ('tissue',       '抽光衛生紙', 'min', 1.5, 600),
    ('landolt',      'E視力檢查', 'max', 0.1, 31),
    ('lights',       '點燈記憶', 'max', 1, 32),
    ('cups',         '球在哪杯', 'max', 1, 200),
    ('pattern',      '解鎖圖案', 'max', 3, 14),
    ('illusion',     '錯覺大師', 'max', 1, 500),
    ('pour',         '倒到八分滿', 'min', 0, 100),
    ('coins',        '零錢分類', 'max', 1, 200),
    ('invoice',      '對發票', 'max', 1, 500),
    ('paint',        '刷油漆', 'max', 1, 12),
    ('diff',         '哪裡怪怪的', 'max', 1, 200),
    ('bread',        '秤麵包重量', 'max', 1, 200),
    ('candy',        '幾顆糖', 'max', 1, 500),
    ('curves',       '誰先到？', 'max', 1, 200),
    ('rps',          '猜拳必贏', 'max', 1, 200),
    ('balloon',      '吹氣球', 'max', 1, 130000),
    ('price',        '價格陷阱', 'max', 1, 500),
    ('heartbeat',    '心跳複製', 'max', 1, 1000),
    ('sticks',       '落下棍子', 'max', 1, 200),
    ('schulte',      '數字方陣', 'min', 3, 600),
    ('same',         '相同嗎？', 'max', 1, 500),
    ('backnum',      '倒背數字', 'max', 1, 200),
    ('setclock',     '撥時鐘', 'max', 1, 200),
    ('tearcal',      '撕日曆', 'max', 1, 200),
    ('pillbox',      '分藥盒', 'max', 1, 200),
    ('fridge',       '冰箱歸位', 'max', 1, 500),
    ('scallion',     '切蔥花', 'max', 1, 400),
    ('hangpic',      '掛畫', 'min', 0, 91),
    ('mirror',       '左右顛倒', 'max', 1, 200),
    ('witness',      '目擊證人', 'max', 1, 200),
    ('halfchar',     '半邊字', 'max', 1, 500),
    ('followme',     '照著走', 'max', 1, 200),
    ('chicks',       '找回小雞', 'max', 1, 200),
    ('bounce',       '球會跑去哪', 'max', 1, 40),
    ('cake',         '分蛋糕', 'max', 1, 200),
    ('seven',        '逢七過', 'max', 1, 1000),
    ('teacher',      '老師說', 'max', 1, 1000),
    ('dualtask',     '一心二用', 'max', 1, 30),
    ('pipes',        '接水管', 'max', 1, 200),
    ('lightsout',    '關燈', 'max', 1, 200),
    ('seq',          '猜下一個', 'max', 1, 500),
    ('polyrhythm',   '左右不同拍', 'max', 1, 500),
    ('area',         '面積一樣大', 'min', 0, 400),
    ('halfvol',      '容量一半', 'min', 0, 50),
    ('blindcircle',  '盲畫一個圓', 'max', 0, 100),
    ('samelen',      '畫一樣長', 'min', 0, 300),
    ('rightangle',   '畫成直角', 'min', 0, 180),
    ('stamp',        '心在正中央', 'min', 0, 200),
    ('scratch',      '刮刮樂推理', 'max', 1, 20),
    ('mathcheck',    '算式對不對', 'max', 1, 60),
    ('fracduel',     '分數大對決', 'max', 1, 60),
    ('primetrap',    '質數陷阱', 'max', 1, 60),
    ('sum100',       '兩張成百', 'min', 0, 180),
    ('timestable',   '乘法表抓錯', 'min', 0, 600),
    ('maxexpr',      '拼出最大數', 'max', 1, 30),
    ('glyphspin',    '鏡中旋轉字', 'max', 1, 40),
    ('fadee',        '淡到看不見', 'max', 1, 40),
    ('oddsock',      '落單的襪子', 'max', 1, 40),
    ('ghostleg',     '鬼腳圖', 'max', 1, 30),
    ('ghostleg2',    '鬼腳圖減一', 'max', 1, 30),
    ('euler',        '能一筆畫嗎', 'max', 1, 60),
    ('colorrecall',  '記色調色', 'min', 0, 260),
    ('basket',       '菜籃總價', 'max', 1, 30),
    ('passersby',    '路人走過', 'max', 1, 30),
    ('seenit',       '這個看過嗎', 'max', 1, 120),
    ('whofirst',     '誰先亮', 'max', 1, 40),
    ('watchoff',     '哪支錶不準', 'max', 1, 30),
    ('handsmeet',    '兩針重疊', 'min', 0, 180),
    ('clearer',      '越看越清楚', 'max', 0.0001, 1000),
    ('twobags',      '兩袋一樣重', 'max', 1, 30),
    ('stackup',      '重心疊疊樂', 'max', 1, 60),
    ('bridge',       '搭一座橋', 'max', 1, 60),
    ('halfcrowd',    '一半的人', 'max', 1, 40),
    ('catroad',      '貓咪走山路', 'max', 1, 600),
    ('numline',      '數線落點', 'max', 1, 40),
    ('twinsock',     '雙胞胎襪子', 'max', 1, 40),
    ('mixcolor',     '混出什麼色', 'min', 0, 300),
    ('copycurve',    '照抄曲線', 'max', 1, 60),
    ('isequal',      '等不等於', 'max', 1, 60),
    ('orderops',     '先乘除', 'max', 1, 60),
    ('remainder',    '求餘數', 'max', 1, 60),
    ('hiddendigit',  '遮住的數字', 'max', 1, 60),
    ('timeafter',    '幾點幾分後', 'max', 1, 60),
    ('wrongline',    '哪一行算錯', 'max', 1, 60),
    ('fillop',       '挑加減乘除', 'max', 1, 60),
    ('fastblink',    '誰閃得快', 'max', 1, 60),
    ('sneakmove',    '誰在偷偷動', 'max', 1, 60),
    ('farpair',      '哪對離最遠', 'max', 1, 60),
    ('dicechange',   '骰子少一點', 'max', 1, 60),
    ('whosaid',      '誰說的', 'max', 1, 60),
    ('tapback',      '倒著點', 'max', 1, 60),
    ('nthshape',     '第幾個出現', 'max', 1, 60),
    ('spingap',      '穿過旋轉縫', 'max', 1, 100),
    ('sudokuone',    '數獨猜一格', 'max', 1, 60),
    ('chequeamt',    '支票金額', 'max', 1, 60),
    ('mergechar',    '左右合字', 'max', 1, 60),
    ('flashlight',   '手電筒猜圖', 'max', 1, 60),
    ('racefirst',    '誰先衝線', 'max', 1, 60),
    ('spinpick',     '轉盤停哪格', 'max', 1, 60),
    ('alignchar',    '對準才看到', 'max', 1, 60),
    ('triple100',    '三張成百', 'max', 1, 30),
    ('carpet',       '鋪地毯', 'max', 1, 60),
    ('wirelink',     '接電線', 'max', 1, 60),
    ('oneway',       '單行道', 'max', 1, 60),
    ('mahjong3',     '缺哪一張', 'max', 1, 60),
    ('reversi',      '翻最多棋', 'max', 1, 60),
    ('gomoku',       '堵住五子', 'max', 1, 60),
    ('swapeven',     '換一張就平', 'max', 1, 60),
    ('weekday',      '推星期幾', 'max', 1, 60),
    ('gearmark',     '齒輪對記號', 'max', 1, 60),
    ('seesaw',       '蹺蹺板比重', 'max', 1, 60),
    ('findsquare',   '找正方形', 'max', 1, 60),
    ('checkers',     '跳棋跳最遠', 'max', 1, 60),
    ('inout',        '圈內圈外', 'max', 1, 60),
    ('gaspump',      '加到五百', 'max', 1, 60),
    ('milktea',      '奶茶調色', 'max', 1, 60),
    ('rotary',       '轉盤電話', 'max', 1, 60),
    ('swipecopy',    '反著滑', 'max', 1, 60),
    ('knockcount',   '敲幾下', 'max', 1, 60),
    ('menuslice',    '切菜單上的', 'max', 1, 60),
    ('inkword',      '字的顏色', 'max', 1, 60),
    ('calendar',     '記行事曆', 'max', 1, 60),
    ('layerdrink',   '照樣調一杯', 'max', 1, 60),
    ('seenchars',    '看過的字', 'max', 1, 60),
    ('doorslit',     '門縫偷看', 'max', 1, 60),
    ('stars',        '找星座', 'max', 1, 60),
    ('slicechar',    '切字', 'max', 1, 60),
    ('butterfly',    '蝴蝶不對稱', 'max', 1, 60),
    ('danmaku',      '彈幕找字', 'max', 1, 300),
    ('cardslap',     '心臟病', 'max', 1, 300),
    ('flags',        '舉旗子', 'max', 1, 300),
    ('huesort',      '色票排隊', 'max', 1, 60),
    ('kinetic',      '動態視力', 'max', 1, 60),
    ('coinsort',     '零錢入筒', 'max', 1, 300),
    ('groupphoto',   '大合照', 'max', 1, 60),
    ('fishbite',     '釣魚提竿', 'max', 1, 60),
    ('homerun',      '全壘打', 'max', 1, 60),
    ('windblow',     '大風吹', 'max', 1, 300),
    ('pearls',       '吸珍珠', 'max', 1, 60),
    ('fishtoy',      '釣魚玩具', 'max', 1, 60),
    ('countbills',   '數鈔票', 'max', 1, 60),
    ('ordercut',     '照號切水果', 'max', 1, 60),
    ('pinwheel',     '轉風車', 'max', 1, 60),
    ('dishes',       '洗盤子', 'max', 1, 300),
    ('beans',        '挑豆子', 'max', 1, 300),
    ('minus7',       '一路減七', 'max', 1, 300),
    ('sushi',        '迴轉壽司', 'max', 1, 60),
    ('change',       '找錢', 'max', 1, 300),
    ('discount',     '打了幾折', 'max', 1, 300),
    ('timepair',     '時間連連看', 'max', 1, 60),
    ('eyebrow',      '畫眉毛', 'max', 1, 60),
    ('dough',        '擀水餃皮', 'max', 1, 60),
    -- <<< 自動產生結束
    ('zz_test', '（測試用，可刪）', 'max', 0, 1000)
on conflict (game_id) do update
    set title = excluded.title, better = excluded.better,
        min_score = excluded.min_score, max_score = excluded.max_score;

-- ═══ 5. 玩家意見（結算彈窗最下方的「我有話要說」）═══
-- 每一則意見記著是哪一款遊戲（game_id，必須是 MF_games 登記過的），所以可以分遊戲看。
-- 防濫用：同一位玩家（player_id）24 小時內最多 200 則；10 分鐘內重複送同樣的內容只算一則；
--         內容 2～300 字，控制字元與零寬字元會被清掉。
-- 每一則意見除了遊戲代號（game_id，英文），還有「遊戲中文名稱」（game_title）：寫入時自動從 MF_games.title 帶入，
-- 管理者看資料表時不用再對照英文代號。（遊戲改名之後重新執行這份 SQL，舊的意見也會一起換成新名稱。）
-- 意見不是機密，所以「任何人都能查閱」：下面建了一個公開的檢視表 MF_feedback_public（除了 player_id 以外的所有欄位），
-- 只用公開的 anon 金鑰就能讀，不需要任何密碼或 service_role 金鑰（網頁 admin/feedback.html 就是這樣查的）。
-- 唯一不公開的是 player_id：它是玩家瀏覽器的隨機代號，成績表用它認人（改暱稱、刷新成績都只認它），
-- 公開出去的話別人就能冒用代號去改那位玩家的暱稱或成績。資料表本身仍然鎖著，所以沒有人能新增、修改或刪除意見，
-- 只有玩家透過函式 MF_submit_feedback 才寫得進去。
-- 管理者在 SQL Editor 查看意見（資料表名稱有大寫，一定要加雙引號）：
--   select created_at, game_title, nickname, message, app_version
--     from public."MF_feedback" order by created_at desc limit 100;                 -- 最新 100 則
--   select game_title, count(*) from public."MF_feedback" group by 1 order by 2 desc; -- 哪款遊戲被提最多意見
--   select created_at, nickname, message from public."MF_feedback"
--    where game_title = '零錢分類' order by created_at desc;                          -- 單一遊戲的意見（也可以用 game_id = 'coins'）
--   delete from public."MF_feedback" where created_at < now() - interval '180 days'; -- 清掉舊的

create table if not exists public."MF_feedback" (
    id          bigint       generated always as identity primary key,
    game_id     text         not null references public."MF_games" (game_id) on delete cascade on update cascade,
    game_title  text,                       -- 遊戲中文名稱（寫入時自動從 MF_games.title 帶入）
    player_id   uuid         not null,
    nickname    text         check (nickname is null or char_length(nickname) between 1 and 12),
    message     text         not null check (char_length(message) between 2 and 300),
    app_version text         check (app_version is null or char_length(app_version) <= 32),
    created_at  timestamptz  not null default now()
);

-- 舊版資料庫（V1.21.0～V1.22.x）的 MF_feedback 還沒有 game_title：補上這一欄（已經有就略過）。
-- 注意：Postgres 不能把新欄位插在中間，舊資料表補上的欄位會排在最右邊（Table Editor 裡可以把欄位標題拖到想要的位置）。
alter table public."MF_feedback" add column if not exists game_title text;
comment on column public."MF_feedback".game_title is '遊戲中文名稱（寫入時自動從 MF_games.title 帶入）';

-- 把舊的意見補上中文名稱；遊戲改名之後重新執行這份 SQL（上面的遊戲清單已經是新名稱），舊意見也跟著換成新名稱。
-- 已經一致的列不會被改動，所以重複執行沒有副作用。
update public."MF_feedback" f
   set game_title = g.title
  from public."MF_games" g
 where g.game_id = f.game_id and f.game_title is distinct from g.title;

-- 「某款遊戲的最新意見」「某位玩家最近寄了幾則」都靠這兩個索引
create index if not exists "MF_feedback_game_idx"   on public."MF_feedback" (game_id, created_at desc);
create index if not exists "MF_feedback_player_idx" on public."MF_feedback" (player_id, created_at desc);

-- 資料表本身鎖住：開啟 RLS 而且不建 policy，anon 不能直接讀寫，只能呼叫下面的函式（寫入）或讀下面的檢視表（查閱）
alter table public."MF_feedback" enable row level security;
revoke all on table public."MF_feedback" from public, anon, authenticated;

-- 公開查閱用的檢視表：除了 player_id 以外的所有欄位，任何人（anon）都只能 select。
-- 檢視表是以建立者（資料表的擁有者）的權限執行，所以讀得到被 RLS 鎖住的資料表；沒有 insert／update／delete 權限。
-- （Supabase 的安全檢查若提示「Security Definer View」，這是故意的：就是要公開這一份「去掉 player_id」的內容。）
create or replace view public."MF_feedback_public" as
select id, created_at, game_id, game_title, message, nickname, app_version
  from public."MF_feedback";
comment on view public."MF_feedback_public" is '玩家意見的公開查閱版（不含 player_id）；任何人都能讀，不能寫';
revoke all on public."MF_feedback_public" from public, anon, authenticated;
grant select on public."MF_feedback_public" to anon, authenticated;

-- 寫入：送出一則意見。
--   回傳 { ok:true, saved:true }；重複送同樣內容回傳 { ok:true, saved:false, duplicate:true }；
--   失敗回傳 { ok:false, error:'unknown_game' | 'bad_args' | 'too_many' }。
create or replace function public."MF_submit_feedback"(
    p_game_id   text,
    p_player_id uuid,
    p_message   text,
    p_nickname  text default null,
    p_version   text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    c_max_len   constant int := 300;     -- 意見最多幾個字（前端的輸入框也是 300）
    c_per_day   constant int := 200;      -- 同一位玩家 24 小時內最多幾則
    v_title     text;
    v_msg       text;
    v_nick      text;
    v_ver       text;
    v_count     int;
begin
    -- (1) 遊戲要登記過（順便取得中文名稱，一起存進意見：管理者看資料表時才看得懂是哪一款遊戲）
    select title into v_title from public."MF_games" where game_id = p_game_id and enabled;
    if not found then
        return jsonb_build_object('ok', false, 'error', 'unknown_game');
    end if;
    if p_player_id is null then
        return jsonb_build_object('ok', false, 'error', 'bad_args');
    end if;
    -- (2) 清理內容：換行統一成 \n；控制字元（保留換行與 Tab）、零寬字元、文字方向控制字元換成空格；
    --     行內連續空白縮成一個；連續三個以上的換行縮成兩個；去頭尾空白；最多 300 個字
    v_msg := replace(replace(coalesce(p_message, ''), E'\r\n', E'\n'), E'\r', E'\n');
    v_msg := regexp_replace(v_msg, '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f​-‏‪-‮⁠-⁤﻿]+', ' ', 'g');
    v_msg := regexp_replace(v_msg, '[ \t]+', ' ', 'g');
    v_msg := regexp_replace(v_msg, ' ?\n ?', E'\n', 'g');
    v_msg := regexp_replace(v_msg, '\n{3,}', E'\n\n', 'g');
    v_msg := btrim(left(btrim(v_msg), c_max_len));
    if char_length(v_msg) < 2 then
        return jsonb_build_object('ok', false, 'error', 'bad_args');
    end if;
    -- 暱稱與版本是選填；不合格式就當作沒有
    v_nick := btrim(left(btrim(regexp_replace(coalesce(p_nickname, ''),
                  '[[:cntrl:][:space:]​-‏‪-‮⁠-⁤﻿]+', ' ', 'g')), 8));
    if char_length(v_nick) < 1 then v_nick := null; end if;
    v_ver := left(btrim(coalesce(p_version, '')), 32);
    if char_length(v_ver) < 1 then v_ver := null; end if;
    -- (3) 同一位玩家的寫入排隊，避免同時送很多則繞過次數限制
    perform pg_advisory_xact_lock(hashtextextended('MF_feedback:' || p_player_id::text, 0));
    -- (4) 10 分鐘內同一位玩家、同一款遊戲、同樣內容：不重複寫入
    if exists (select 1 from public."MF_feedback"
                where player_id = p_player_id and game_id = p_game_id and message = v_msg
                  and created_at > now() - interval '10 minutes') then
        return jsonb_build_object('ok', true, 'saved', false, 'duplicate', true);
    end if;
    -- (5) 24 小時內的上限
    select count(*) into v_count from public."MF_feedback"
     where player_id = p_player_id and created_at > now() - interval '24 hours';
    if v_count >= c_per_day then
        return jsonb_build_object('ok', false, 'error', 'too_many');
    end if;
    insert into public."MF_feedback" (game_id, game_title, player_id, nickname, message, app_version)
    values (p_game_id, v_title, p_player_id, v_nick, v_msg, v_ver);
    return jsonb_build_object('ok', true, 'saved', true);
end;
$$;

revoke all on function public."MF_submit_feedback"(text, uuid, text, text, text) from public;
grant execute on function public."MF_submit_feedback"(text, uuid, text, text, text) to anon, authenticated;


-- ═══ 6. 五星評價（V1.25.0 起：結算彈窗「我有話要說」下方的「五星評價」；選遊戲畫面每一格下方的平均星數）═══
-- 規則：同一位玩家（player_id）、同一款遊戲、同一天（台灣時間）只能評一次，1～5 顆星。
--   「同一天只能評一次」由資料庫的 unique (game_id, player_id, rated_on) 決定，不靠網頁；
--   網頁（js/rating.js）那邊「今天評過就藏起按鈕」只是讓玩家不用白按一次。
-- 兩張表：
--   MF_ratings       每一筆評價（哪一款、誰、幾顆星、哪一天）。
--   MF_rating_stats  每款遊戲的「總星數 total、評價次數 cnt」：每寫入一筆評價就順手把這兩個數字加上去（不重算全部），
--                    選遊戲畫面讀平均值只讀這張小表（最多一款一列），資料再多也不用每次把所有評價加總一遍。
-- 網頁把平均值存在手機裡 3 小時才重抓一次（js/rating.js 的 STATS_TTL_MS），所以平均值會晚一點才更新
-- （使用者的要求：不需要非常即時，避免過度的網路查詢）。
-- 管理者查詢（資料表名稱有大寫，一定要加雙引號）：
--   select g.title, s.cnt, round(s.total::numeric / s.cnt, 2) as avg
--     from public."MF_rating_stats" s join public."MF_games" g using (game_id) order by avg desc;    -- 每款遊戲的平均星數
--   select rated_on, game_id, stars from public."MF_ratings" order by id desc limit 100;          -- 最新 100 筆評價
--   delete from public."MF_ratings" where game_id = 'zz_test';   -- 手動刪掉評價之後，重新執行本檔，MF_rating_stats 會自動重算

create table if not exists public."MF_ratings" (
    id          bigint       generated always as identity primary key,
    game_id     text         not null references public."MF_games" (game_id) on delete cascade on update cascade,
    player_id   uuid         not null,
    stars       smallint     not null check (stars between 1 and 5),
    rated_on    date         not null,            -- 評價的日期（台灣時間）；同一位玩家、同一款遊戲、同一天只能有一列
    created_at  timestamptz  not null default now(),
    unique (game_id, player_id, rated_on)
);

create table if not exists public."MF_rating_stats" (
    game_id     text         primary key references public."MF_games" (game_id) on delete cascade on update cascade,
    total       bigint       not null default 0 check (total >= 0),     -- 總星數
    cnt         bigint       not null default 0 check (cnt >= 0),       -- 評價次數（平均 = total / cnt）
    updated_at  timestamptz  not null default now()
);

-- 兩張表都鎖住（開 RLS、不建 policy、收回所有權限）：寫入只能走 MF_submit_rating，讀平均只能走 MF_get_ratings
alter table public."MF_ratings"      enable row level security;
alter table public."MF_rating_stats" enable row level security;
revoke all on table public."MF_ratings"      from public, anon, authenticated;
revoke all on table public."MF_rating_stats" from public, anon, authenticated;

-- 重新執行本檔時，用 MF_ratings 把統計重算一次：手動刪過評價、或統計數字不小心被改壞，執行一次就修正。
-- 已經一致的列不會被改動，所以重複執行沒有副作用。
insert into public."MF_rating_stats" as s (game_id, total, cnt)
select game_id, sum(stars), count(*) from public."MF_ratings" group by game_id
on conflict (game_id) do update
    set total = excluded.total, cnt = excluded.cnt, updated_at = now()
    where s.total <> excluded.total or s.cnt <> excluded.cnt;
delete from public."MF_rating_stats" s
 where not exists (select 1 from public."MF_ratings" r where r.game_id = s.game_id);

-- 寫入：送出一筆評價（stars：1～5 顆星）。
--   回傳 { ok:true, saved:true,  day, avg, cnt }：寫入成功；avg／cnt 是這款遊戲「加上這一筆之後」的平均星數與評價次數
--        { ok:true, saved:false, day, avg, cnt }：這位玩家今天已經評過這款遊戲了（這次不算）
--        { ok:false, error:'unknown_game' | 'bad_args' }
--   avg 是小數 2 位；還沒有任何評價時 avg 是 null、cnt 是 0。
create or replace function public."MF_submit_rating"(
    p_game_id   text,
    p_player_id uuid,
    p_stars     int
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    c_tz   constant text := 'Asia/Taipei';     -- 「一天」用台灣時間算（網頁 js/rating.js 的 TZ_OFFSET_MIN 也是 +8 小時，兩邊要一致）
    v_day  date;
    v_id   bigint;
    v_tot  bigint;
    v_cnt  bigint;
begin
    if not exists (select 1 from public."MF_games" where game_id = p_game_id and enabled) then
        return jsonb_build_object('ok', false, 'error', 'unknown_game');
    end if;
    if p_player_id is null or p_stars is null or p_stars < 1 or p_stars > 5 then
        return jsonb_build_object('ok', false, 'error', 'bad_args');
    end if;
    v_day := (now() at time zone c_tz)::date;
    -- 同一天已經評過 → on conflict do nothing，v_id 會是 null（兩個請求同時送也只會寫進一筆）
    insert into public."MF_ratings" (game_id, player_id, stars, rated_on)
    values (p_game_id, p_player_id, p_stars, v_day)
    on conflict (game_id, player_id, rated_on) do nothing
    returning id into v_id;
    if v_id is not null then
        insert into public."MF_rating_stats" as s (game_id, total, cnt)
        values (p_game_id, p_stars, 1)
        on conflict (game_id) do update
            set total = s.total + excluded.total, cnt = s.cnt + 1, updated_at = now()
        returning s.total, s.cnt into v_tot, v_cnt;
    else
        select s.total, s.cnt into v_tot, v_cnt from public."MF_rating_stats" s where s.game_id = p_game_id;
    end if;
    v_cnt := coalesce(v_cnt, 0);
    return jsonb_build_object(
        'ok', true, 'saved', v_id is not null, 'day', v_day,
        'avg', case when v_cnt > 0 then round(v_tot::numeric / v_cnt, 2) end,
        'cnt', v_cnt);
end;
$$;

-- 讀取：全部遊戲的平均星數，一次拿完（選遊戲畫面用；約 100 款 × 20 字元，幾 KB 而已）。
--   回傳 { "<game_id>": [平均星數（小數 2 位）, 評價次數], ... }；還沒有人評價的遊戲不會出現。
create or replace function public."MF_get_ratings"()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(jsonb_object_agg(s.game_id, jsonb_build_array(round(s.total::numeric / s.cnt, 2), s.cnt)), '{}'::jsonb)
      from public."MF_rating_stats" s
      join public."MF_games" g on g.game_id = s.game_id and g.enabled
     where s.cnt > 0;
$$;

revoke all on function public."MF_submit_rating"(text, uuid, int) from public;
revoke all on function public."MF_get_ratings"()                   from public;
grant execute on function public."MF_submit_rating"(text, uuid, int) to anon, authenticated;
grant execute on function public."MF_get_ratings"()                   to anon, authenticated;


-- ═══ 7. 「阿嬤都比你厲害」：這位玩家在哪些遊戲被別人比下去了（V1.25.0 起）═══
-- 玩家在主選單按「秒反應」、打開「選一個想玩的遊戲」時，網頁（js/leaderboard.js 的 Leaderboard.overtaken）呼叫這個函式，
-- 列出這位玩家「被超越」的遊戲，以及他目前的名次；網頁最多顯示前 6 款。
-- 「被超越」＝有別人排在他前面，而且那個人的紀錄是在這位玩家創下（或刷新）自己的紀錄「之後」才達成的（比較 achieved_at）。
--   例：我 14:20 拿到第 15 名，別人 14:25 拿到第 10 名（我被擠到第 16 名）→ 14:25 之後我打開選單才會列出這款。
--   我創紀錄的時候就已經排在我前面的人，不算「超越」我（不是第一名不等於被超越）；
--   我後來刷新了自己的紀錄（achieved_at 變新），之前超越我的人就不再算，要等再有人在那之後超越我才會再列出。
-- 「兩個人都要在前 30 名」：MF_scores 每款遊戲只留前 N 名（被擠出榜的人那一列已經刪掉了），所以只要這位玩家還有那一列，
-- 他和排在他前面的人就一定都在前 N 名，不用另外判斷。
-- 排序：最近被超越的排最前面（at＝最近一次被超越的時間），同時間照名次。
-- 回傳 [ { game_id, rank, at }, ... ]；永遠不回傳任何人的 player_id。
-- 每款遊戲最多 30 列、一位玩家最多一款一列，所以就算每款遊戲都上榜，也只是在幾千列裡查一百多次索引，非常快。
create or replace function public."MF_get_overtaken"(p_player_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(jsonb_agg(jsonb_build_object('game_id', x.game_id, 'rank', x.rank, 'at', x.last_at)
                              order by x.last_at desc, x.rank, x.game_id), '[]'::jsonb)
      from (
            select m.game_id, g.top_n,
                   (select count(*) + 1
                      from public."MF_scores" o
                     where o.game_id = m.game_id
                       and (o.rank_key, o.achieved_at, o.id) < (m.rank_key, m.achieved_at, m.id))::int as rank,
                   (select max(o.achieved_at)
                      from public."MF_scores" o
                     where o.game_id = m.game_id
                       and (o.rank_key, o.achieved_at, o.id) < (m.rank_key, m.achieved_at, m.id)
                       and o.achieved_at > m.achieved_at) as last_at
              from public."MF_scores" m
              join public."MF_games" g on g.game_id = m.game_id and g.enabled
             where m.player_id = p_player_id
           ) x
     where x.last_at is not null and x.rank <= x.top_n;     -- 只列「在我的紀錄之後才超越我」的（沒有這種人＝沒被超越）
$$;

revoke all on function public."MF_get_overtaken"(uuid) from public;
grant execute on function public."MF_get_overtaken"(uuid) to anon, authenticated;


-- 讓 Supabase 的 API 層立刻認得新函式（不執行也會在幾秒內自動更新）
notify pgrst, 'reload schema';
