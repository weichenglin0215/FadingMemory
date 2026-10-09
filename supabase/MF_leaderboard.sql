-- ═══════════════════════════════════════════════════════════════════
-- MF_leaderboard.sql — 記憶模糊（FadingMemory）「世界排行榜」資料庫
-- ───────────────────────────────────────────────────────────────────
-- 用途：記錄「秒反應」每一款遊戲的世界前 30 名成績。
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
    ('tissue',       '抽光它', 'min', 1.5, 600),
    ('landolt',      'E視力檢查', 'max', 0.1, 31),
    ('lights',       '點燈記憶', 'max', 1, 32),
    ('cups',         '球在哪杯', 'max', 1, 200),
    ('pattern',      '解鎖圖案', 'max', 3, 14),
    ('illusion',     '錯覺大師', 'max', 1, 500),
    ('pour',         '倒到八分滿', 'min', 0, 100),
    ('coins',        '零錢分類', 'max', 1, 200),
    ('invoice',      '對發票', 'max', 1, 100),
    ('paint',        '刷油漆', 'min', 1, 500),
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
    ('dualtask',     '一心二用', 'max', 1, 300),
    ('pipes',        '接水管', 'max', 1, 200),
    ('lightsout',    '關燈', 'max', 1, 200),
    ('seq',          '猜下一個', 'max', 1, 500),
    ('polyrhythm',   '左右不同拍', 'max', 1, 500),
    ('area',         '面積一樣大', 'min', 0, 400),
    ('halfvol',      '容量一半', 'min', 0, 50),
    ('blindcircle',  '盲畫一個圓', 'max', 0, 100),
    ('samelen',      '畫一樣長', 'min', 0, 300),
    ('rightangle',   '畫成直角', 'min', 0, 180),
    ('stamp',        '蓋在框內', 'min', 0, 200),
    ('focus',        '轉到最清楚', 'min', 0, 100),
    ('scratch',      '刮刮樂推理', 'min', 3, 12),
    ('mathcheck',    '算式對不對', 'max', 1, 60),
    ('fracduel',     '分數大對決', 'max', 1, 60),
    ('primetrap',    '質數陷阱', 'max', 1, 60),
    ('sum100',       '湊百消除', 'min', 0, 600),
    ('timestable',   '乘法表抓錯', 'min', 0, 600),
    ('maxexpr',      '拼出最大的數', 'max', 1, 30),
    ('glyphspin',    '鏡中旋轉字', 'max', 1, 40),
    ('fadee',        '淡到看不見', 'max', 1, 40),
    ('oddsock',      '落單的襪子', 'max', 1, 40),
    ('ghostleg',     '鬼腳圖', 'max', 1, 30),
    ('euler',        '能一筆畫嗎', 'max', 1, 60),
    ('colorrecall',  '記色調色', 'min', 0, 260),
    ('basket',       '菜籃總價', 'max', 1, 30),
    ('passersby',    '路人走過', 'max', 1, 30),
    ('seenit',       '這個看過嗎', 'max', 1, 120),
    ('whofirst',     '誰先亮', 'max', 1, 40),
    ('watchoff',     '哪支錶不準', 'max', 1, 30),
    ('handsmeet',    '兩針重疊', 'min', 0, 180),
    ('clearer',      '越看越清楚', 'max', 0.0001, 1000),
    ('twobags',      '兩袋一樣重', 'max', 1, 20),
    -- <<< 自動產生結束
    ('zz_test', '（測試用，可刪）', 'max', 0, 1000)
on conflict (game_id) do update
    set title = excluded.title, better = excluded.better,
        min_score = excluded.min_score, max_score = excluded.max_score;

-- 讓 Supabase 的 API 層立刻認得新函式（不執行也會在幾秒內自動更新）
notify pgrst, 'reload schema';
