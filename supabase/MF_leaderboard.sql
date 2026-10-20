-- ═════════════════════════════════════════════════════════════════
-- MF_leaderboard.sql — 記憶模糊（FadingMemory）「世界排行榜」＋「玩家身分」資料庫
-- ─────────────────────────────────────────────────────────────────
-- 用途：記錄「秒反應」每一款遊戲的世界前 30 名成績；玩家身分（V1.35.0 起：暱稱全站唯一＋4 位數密碼，第 1B 節）；
--       玩家個人最佳（可跨裝置同步，第 1B 節 MF_player_bests）；玩家在結算彈窗寫下的意見（第 5 節，MF_feedback，分遊戲記錄）、
--       五星評價（第 6 節，MF_ratings／MF_rating_stats）；第 7 節是「阿嬤都比你厲害」用的查詢（這位玩家在哪些遊戲被超越）；
--       第 8 節是給管理者（你）在 SQL Editor 執行的管理函式（重設密碼、合併帳號…）。
-- 執行方式：Supabase 專案 LoveIsABitMessy-DB → 左側 SQL Editor → New query →
--           貼上本檔全文 → Run。可以重複執行（全部都是「已存在就略過／覆蓋」的寫法）。
-- ★ V1.35.0 這一版會「一次切換」：把舊的、只靠 player_id 就能寫入的函式整個刪掉（沒有舊函式就沒有後門），
--   並把榜單上每一位舊玩家先登記成「尚未認領」的玩家（暱稱保留 60 天，等他們進網頁設定密碼認領）。
--   第一次執行時會自動備份 MF_scores → MF_scores_bak_v135（含舊暱稱；已鎖權限，只有你能看）。
--   詳細流程與營運查詢見 note/建立玩家身分企劃書.md、note/世界排行榜說明.md 第 12 節。
-- 共用專案提醒：這個專案同時也是 LoveIsABitMessy 在用，所以本檔
--   · 只建立名字以「MF_」開頭的東西，完全不碰 LoveIsABitMessy 的任何資料表；
--   · 唯一例外是啟用 pgcrypto 這個「密碼雜湊」擴充套件（放在 extensions 結構，Supabase 預設就有，不影響別的專案）；
--     若執行時出現「function extensions.crypt does not exist」，表示這個專案的 pgcrypto 裝在別的結構，
--     請改在 Database → Extensions 把 pgcrypto 的 schema 設成 extensions；
--   · 不需要、也請不要打開 Authentication 的 Anonymous sign-ins
--     （匿名使用者會拿到 authenticated 身分，LoveIsABitMessy 的資料表權限是給
--      authenticated 的，打開等於把它們也開給所有路人）。
--
-- 【設計重點，給新手看的】
-- 1) 瀏覽器端程式碼裡的 anon key 是「公開」的（任何人看網頁原始碼都拿得到），
--    所以真正的保護不能靠藏 key，要靠資料庫自己：
--      · 所有資料表都開啟 RLS（Row Level Security，列級安全）而且「不建任何
--        policy」＝ anon 角色完全不能直接 select／insert／update／delete；
--      · 玩家只能呼叫下面的函式（RPC），函式內自己檢查資料、自己決定能不能寫。
-- 2) 函式用 SECURITY DEFINER（以建立者的權限執行），才有辦法寫入被鎖住的資料表；
--    同時一律 set search_path = ''，函式裡所有資料表都寫成 public."MF_xxx"，
--    避免有人用同名物件冒充（這是 SECURITY DEFINER 的標準防護）。
-- 3) 每個遊戲、每位玩家「只留最佳的一筆」（unique (game_id, player_id)），
--    每個遊戲「最多只留前 30 名」，超過的列會在寫入時順手刪掉：
--    所以成績表永遠不會超過「遊戲數 × 30」列，不管有多少玩家、有沒有人亂灌，免費方案的 500 MB 都用不完。
-- 4) 寫入前先用 pg_advisory_xact_lock 把「同一款遊戲」的寫入排隊，
--    兩個人同時刷新前 30 名也不會算錯名次（不同遊戲之間不互相等待）；搶同一個暱稱時也用同樣的方法排隊。
-- 5) 【玩家身分】player_id（uuid）是玩家「永遠不變的編號」，所有資料表都用它連結；暱稱只是顯示用、可以改。
--    · 暱稱全站唯一（比對時先正規化：全形半形、大小寫、空白都視為一樣）；
--    · 密碼是 4 位數字，資料庫只存雜湊（bcrypt），連管理者都看不到；
--    · 打錯密碼資料庫自己限速：連錯 5 次鎖 10 分鐘，鎖完再錯一次就加倍（20、40、80…分鐘），上限 24 小時；
--    · 登入成功才會發一把隨機的「裝置憑證」（只存雜湊），之後送成績、改暱稱…都靠這把憑證，不再靠單獨的 player_id，
--      日常不必每次輸入密碼；密碼只在「建立、認領、登入」的那一刻送出；
--    · 成績一定要憑證；意見與評價可以匿名（沒帳號的玩家也能給意見），但匿名不能冒用已建立帳號的 player_id。
-- 6) 這個排行榜無法證明「分數真的是玩出來的」，只能擋範圍不合理（MF_games.min_score～max_score）
--    與格式錯誤的資料。帳號解決的是「你是誰」，不解決作弊。
--
-- 【常用查詢】（資料表名稱是大寫開頭，在 SQL Editor 手動查詢時一定要加雙引號）
--   select * from public."MF_games" order by game_id;
--   select * from public."MF_players_admin" order by 1;                 -- 全部玩家（欄位名稱是中文）
--   select s.game_id, p.nickname, s.score, s.achieved_at from public."MF_scores" s
--     join public."MF_players" p using (player_id) where s.game_id = 'speed' order by s.rank_key, s.achieved_at;
--   delete from public."MF_scores" where game_id = 'zz_test';           -- 清掉測試資料
--   -- 營運：還有幾位舊玩家沒有認領？保留快到期的？目前被鎖住的？今天新增幾個帳號？
--   select count(*) filter (where not claimed) as 尚未認領, count(*) filter (where claimed) as 已建立 from public."MF_players";
--   select nickname, reserved_until from public."MF_players" where not claimed and reserved_until < now() + interval '7 days' order by reserved_until;
--   select nickname, locked_until, fail_count from public."MF_players" where locked_until > now();
--   select count(*) from public."MF_players" where created_at > now() - interval '1 day';
--   -- 忘記密碼、合併帳號、釋出暱稱、刪除帳號：見第 8 節的 MF_admin_* 函式。
-- ═════════════════════════════════════════════════════════════════


-- ═══ 0. 前置：pgcrypto（密碼雜湊與隨機憑證用）＋純函式（不碰資料表） ═══
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- 暱稱清理：控制字元、零寬字元、文字方向控制字元與連續空白，一律換成單一空格；去頭尾空白；最多 8 個字。
-- （零寬字元用 chr() 組出來，不直接寫在檔案裡，避免編輯器或複製貼上時把它們弄丟。）
create or replace function public."MF__clean_nick"(p text)
returns text
language sql
immutable
set search_path = ''
as $$
    select btrim(left(btrim(regexp_replace(coalesce(p, ''),
        '[[:cntrl:][:space:]' || chr(8203) || '-' || chr(8207) || chr(8234) || '-' || chr(8238)
                              || chr(8288) || '-' || chr(8292) || chr(65279) || ']+',
        ' ', 'g')), 8))
$$;

-- 暱稱的「比對鍵」：清理 → 全形轉半形（NFKC）→ 轉小寫 → 去掉所有空白。
-- 兩個暱稱的比對鍵一樣，就視為同一個暱稱（例如「Ａmy」「amy」「A my」都是同一個）。
create or replace function public."MF__nick_key"(p text)
returns text
language sql
immutable
set search_path = ''
as $$
    select lower(regexp_replace(normalize(public."MF__clean_nick"(p), nfkc), '[[:space:]]+', '', 'g'))
$$;

-- 保留字：這些名字不能當暱稱（結尾的數字先去掉再比，所以「admin123」「管理員001」也不行）。
create or replace function public."MF__is_reserved"(p_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select regexp_replace(coalesce(p_key, ''), '[0-9]+$', '') = any (array[
        '管理員', '官方', '系統', '客服', '小編', '站長',
        'admin', 'administrator', 'system', 'root', 'moderator', 'support']::text[])
$$;

-- 密碼只能是 4 個數字
create or replace function public."MF__valid_pin"(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select coalesce(p ~ '^[0-9]{4}$', false)
$$;

-- 密碼雜湊（bcrypt，成本 8）與比對
create or replace function public."MF__hash_pin"(p text)
returns text
language sql
volatile
set search_path = ''
as $$
    select extensions.crypt(p, extensions.gen_salt('bf', 8))
$$;

create or replace function public."MF__verify_pin"(p text, p_hash text)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select p_hash is not null and extensions.crypt(coalesce(p, ''), p_hash) = p_hash
$$;

-- 裝置憑證只存 sha256 雜湊
create or replace function public."MF__token_hash"(p text)
returns text
language sql
immutable
set search_path = ''
as $$
    select encode(extensions.digest(coalesce(p, ''), 'sha256'), 'hex')
$$;


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


-- ═══ 1B. 玩家身分資料表（V1.35.0 起）═══
-- MF_players：每位玩家一列。
--   player_id      玩家編號（uuid），永遠不變；新玩家由資料庫發，舊玩家沿用他瀏覽器裡原本的舊代號。
--   nickname       暱稱（顯示用，可以改）。「尚未認領」的舊玩家，這欄是他以前用的暱稱。
--   nick_key       暱稱的比對鍵（見 MF__nick_key）：已認領（claimed）的玩家之間「全站唯一」。
--   claimed        true＝已建立密碼（有帳號）；false＝舊玩家還沒設密碼（尚未認領）。
--   pin_hash       4 位數密碼的 bcrypt 雜湊（不存明文）。
--   reserved_until 尚未認領的舊玩家：他的暱稱保留到什麼時候（上線那天起 60 天）；期間別人不能用這個暱稱。
--   fail_count／lock_level／last_fail_at／locked_until  密碼限速用（見 MF__check_pin）。
--   rename_day／rename_count  改暱稱的次數限制（台灣時間一天最多 2 次）。
create table if not exists public."MF_players" (
    player_id      uuid        primary key default gen_random_uuid(),
    nickname       text        check (nickname is null or char_length(nickname) between 1 and 12),
    nick_key       text,
    claimed        boolean     not null default false,
    pin_hash       text,
    reserved_until timestamptz,
    created_at     timestamptz not null default now(),
    claimed_at     timestamptz,
    last_login_at  timestamptz,
    nick_changed_at timestamptz,
    rename_day     date,
    rename_count   int         not null default 0,
    fail_count     int         not null default 0,
    lock_level     int         not null default 0,
    last_fail_at   timestamptz,
    locked_until   timestamptz,
    -- 已認領的玩家一定要有暱稱、比對鍵與密碼
    check (not claimed or (nickname is not null and nick_key is not null and char_length(nick_key) >= 1 and pin_hash is not null))
);
-- 已認領的暱稱全站唯一（這個索引就是「暱稱不可重複」的最後防線：兩個人同時搶，資料庫只會讓一個成功）
create unique index if not exists "MF_players_nick_key_uq" on public."MF_players" (nick_key) where claimed;
create index if not exists "MF_players_nick_key_idx" on public."MF_players" (nick_key);
create index if not exists "MF_players_created_idx" on public."MF_players" (created_at);

-- MF_sessions：裝置憑證（每支登入中的瀏覽器一列）。只存雜湊，憑證本身只在登入成功時回傳一次。
create table if not exists public."MF_sessions" (
    token_hash   text        primary key,
    player_id    uuid        not null references public."MF_players" (player_id) on delete cascade,
    created_at   timestamptz not null default now(),
    last_seen_at timestamptz not null default now()
);
create index if not exists "MF_sessions_player_idx" on public."MF_sessions" (player_id, last_seen_at desc);

-- MF_player_bests：個人最佳（跨裝置同步用）。成績與關卡都只會「變好」，所以合併永遠取較好的。
create table if not exists public."MF_player_bests" (
    player_id   uuid          not null references public."MF_players" (player_id) on delete cascade,
    game_id     text          not null references public."MF_games" (game_id) on delete cascade on update cascade,
    best_score  numeric(14,4),
    best_level  int,
    updated_at  timestamptz   not null default now(),
    primary key (player_id, game_id)
);

-- MF_player_merges：帳號合併紀錄（給管理者查帳用）。
create table if not exists public."MF_player_merges" (
    id         bigint      generated always as identity primary key,
    source_id  uuid        not null,
    target_id  uuid        not null,
    merged_at  timestamptz not null default now(),
    note       text
);

-- 成績表：每個 (遊戲, 玩家) 只有一列，存這位玩家在這款遊戲的最佳成績。
--   score        成績本身（小數 4 位，跟畫面上看到的數字一樣）
--   rank_key     排序用：better='min' 時等於 score，'max' 時等於 -score，
--                這樣不管哪種遊戲，「rank_key 越小名次越前面」，一個索引通用
--   achieved_at  這個成績是什麼時候達成的（同分時，先達成的排前面）
-- V1.35.0 起沒有 nickname 欄：暱稱一律從 MF_players 帶出（改名一次，榜上全部立刻換新名字）。
create table if not exists public."MF_scores" (
    id          bigint        generated always as identity primary key,
    game_id     text          not null references public."MF_games" (game_id) on delete cascade on update cascade,
    player_id   uuid          not null,
    score       numeric(14,4) not null,
    rank_key    numeric(14,4) not null,
    achieved_at timestamptz   not null default now(),
    unique (game_id, player_id)
);

-- 查「某款遊戲的前 30 名」「刪掉第 31 名以後」都靠這個索引，資料量再大也只掃前幾列。
create index if not exists "MF_scores_rank_idx"
    on public."MF_scores" (game_id, rank_key, achieved_at, id);


-- ═══ 2. 鎖住資料表（anon／登入者都不能直接碰；只有下面的函式能） ═══
alter table public."MF_games"         enable row level security;
alter table public."MF_scores"        enable row level security;
alter table public."MF_players"       enable row level security;
alter table public."MF_sessions"      enable row level security;
alter table public."MF_player_bests"  enable row level security;
alter table public."MF_player_merges" enable row level security;
revoke all on table public."MF_games"         from public, anon, authenticated;
revoke all on table public."MF_scores"        from public, anon, authenticated;
revoke all on table public."MF_players"       from public, anon, authenticated;
revoke all on table public."MF_sessions"      from public, anon, authenticated;
revoke all on table public."MF_player_bests"  from public, anon, authenticated;
revoke all on table public."MF_player_merges" from public, anon, authenticated;

comment on table  public."MF_players"       is '玩家身分：每位玩家一列。player_id 永不更動；暱稱全站唯一（已認領者）；密碼只存 bcrypt 雜湊';
comment on column public."MF_players".player_id      is '玩家編號（永不更動）';
comment on column public."MF_players".nickname       is '暱稱（顯示用）；尚未認領的舊玩家是他以前用的暱稱';
comment on column public."MF_players".nick_key       is '暱稱比對鍵（全形半形、大小寫、空白視為相同）；已認領者全站唯一';
comment on column public."MF_players".claimed        is 'true＝已建立密碼；false＝舊玩家尚未認領';
comment on column public."MF_players".pin_hash       is '4 位數密碼的 bcrypt 雜湊（不存明文）';
comment on column public."MF_players".reserved_until is '尚未認領的舊玩家：暱稱保留到何時';
comment on column public."MF_players".created_at     is '首次出現時間（舊玩家＝他最早的一筆成績時間）';
comment on column public."MF_players".claimed_at     is '建立密碼（認領）的時間';
comment on column public."MF_players".last_login_at  is '最後一次登入（或建立）的時間';
comment on column public."MF_players".nick_changed_at is '最後一次改暱稱的時間';
comment on column public."MF_players".rename_day     is '最近一次改暱稱的日期（台灣時間）';
comment on column public."MF_players".rename_count   is 'rename_day 那天已改暱稱幾次（一天最多 2 次）';
comment on column public."MF_players".fail_count     is '連續打錯密碼的次數';
comment on column public."MF_players".lock_level     is '鎖定等級（0＝沒鎖過；1＝鎖 10 分鐘；每升一級時間加倍，上限 24 小時）';
comment on column public."MF_players".last_fail_at   is '最近一次打錯密碼的時間';
comment on column public."MF_players".locked_until   is '密碼鎖定到何時（過了就能再試）';
comment on table  public."MF_sessions"      is '登入中的裝置憑證（只存雜湊）；每位玩家最多 10 台';
comment on table  public."MF_player_bests"  is '玩家個人最佳（跨裝置同步）：成績依該遊戲 better 取較好、關卡取最大';
comment on table  public."MF_player_merges" is '帳號合併紀錄：source 併入 target';
comment on table  public."MF_scores"        is '各遊戲前 N 名成績；暱稱請 join MF_players';


-- ═══ 2B. 舊資料遷移（只有舊版資料庫會執行到；重複執行安全）═══
-- 舊版的 MF_scores 有 nickname 欄、沒有玩家表。做法：
--   1) 先備份成 MF_scores_bak_v135（只備份一次，權限已鎖）；
--   2) 榜上每個不重複的舊 player_id 建立一列「尚未認領」的玩家：暱稱＝他最新一筆成績的暱稱，
--      reserved_until＝現在起 60 天（on conflict do nothing，所以之後再執行本檔不會延長保留期）；
--      同一個暱稱有好幾個舊代號時，每個都建一列（尚未認領的列不受唯一限制，先認領的人先拿到暱稱）；
--   3) 刪掉 MF_scores.nickname（之後一律從玩家表帶出）。
do $migrate$
declare
    v_has_nick boolean;
begin
    select exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'MF_scores' and column_name = 'nickname')
      into v_has_nick;
    if v_has_nick then
        if to_regclass('public."MF_scores_bak_v135"') is null then
            execute 'create table public."MF_scores_bak_v135" as select * from public."MF_scores"';
            execute 'alter table public."MF_scores_bak_v135" enable row level security';
            execute 'revoke all on table public."MF_scores_bak_v135" from public, anon, authenticated';
            execute 'comment on table public."MF_scores_bak_v135" is ''V1.35.0 遷移前的成績表備份（含舊暱稱）；確認新系統沒問題之後可以刪除''';
        end if;
        insert into public."MF_players" (player_id, nickname, nick_key, claimed, reserved_until, created_at)
        select distinct on (s.player_id)
               s.player_id,
               nullif(btrim(s.nickname), ''),
               nullif(public."MF__nick_key"(s.nickname), ''),
               false,
               now() + interval '60 days',
               min(s.achieved_at) over (partition by s.player_id)
          from public."MF_scores" s
         order by s.player_id, s.achieved_at desc, s.id desc
        on conflict (player_id) do nothing;
        alter table public."MF_scores" drop column nickname;
    end if;
end
$migrate$;

-- 成績表的玩家一定要在玩家表裡（刪除玩家時，他的成績一起刪）
do $fk$
begin
    if not exists (select 1 from pg_constraint where conname = 'MF_scores_player_fk') then
        alter table public."MF_scores"
            add constraint "MF_scores_player_fk" foreign key (player_id) references public."MF_players" (player_id) on delete cascade;
    end if;
end
$fk$;


-- ═══ 3. 函式（RPC） ═══
-- 先把舊版（V1.34 以前）只靠 player_id 就能寫入的函式整個刪掉：沒有舊函式就沒有後門。
-- （MF_submit_score 新舊版的參數型別一樣、只有第三個參數的名字不同，所以必須先 drop 再 create；
--  舊版網頁送來的 p_nickname 欄位新函式不認得，PostgREST 會回「找不到函式」，成績只會先存在舊版手機裡。）
drop function if exists public."MF_submit_score"(text, uuid, text, numeric);
drop function if exists public."MF_rename_player"(uuid, text);
drop function if exists public."MF_submit_feedback"(text, uuid, text, text, text);
drop function if exists public."MF_submit_rating"(text, uuid, int);

-- ─── 3-0 內部函式（不開放給 anon；只有下面的公開函式在「資料庫內部」呼叫它們）───

-- 檢查裝置憑證：這把 token 是不是這位玩家的、而且還有效。順便更新「最後使用時間」（最多每分鐘寫一次）。
create or replace function public."MF__auth"(p_player_id uuid, p_token text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_hash text;
    v_seen timestamptz;
begin
    if p_player_id is null or p_token is null or p_token = '' then return false; end if;
    v_hash := public."MF__token_hash"(p_token);
    select last_seen_at into v_seen from public."MF_sessions" where token_hash = v_hash and player_id = p_player_id;
    if not found then return false; end if;
    if v_seen < now() - interval '1 minute' then
        update public."MF_sessions" set last_seen_at = now() where token_hash = v_hash;
    end if;
    return true;
end;
$$;

-- 發一把新的裝置憑證（只回傳這一次；資料庫只存雜湊）。每位玩家最多 10 台，超過就刪掉最久沒用的。
create or replace function public."MF__new_session"(p_player_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    c_max constant int := 10;
    v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
    insert into public."MF_sessions" (token_hash, player_id) values (public."MF__token_hash"(v_token), p_player_id);
    delete from public."MF_sessions"
     where player_id = p_player_id
       and token_hash not in (select token_hash from public."MF_sessions"
                               where player_id = p_player_id
                               order by last_seen_at desc, created_at desc limit c_max);
    update public."MF_players" set last_login_at = now() where player_id = p_player_id;
    return v_token;
end;
$$;

-- 驗證密碼（含限速）。回傳：
--   { ok:true }
--   { ok:false, error:'no_such_player' }                       沒有這個玩家、或還沒認領
--   { ok:false, error:'locked', wait_seconds }                 鎖定中（這時「不驗密碼」，打對了也不算）
--   { ok:false, error:'wrong_pin', attempts_left }             打錯了，還可以再試幾次
-- 限速規則（使用者指定）：連續打錯 5 次 → 鎖 10 分鐘；鎖完之後「再錯 1 次」就鎖 20 分鐘，再錯 40、80、160、320、640、1280 分鐘，
-- 上限 24 小時；打對一次全部歸零；鎖定（或最近一次打錯）之後安靜超過 24 小時，也自動歸零重算。
-- 重點：打錯時函式「正常結束」而不是丟例外，所以失敗次數一定會被寫進資料表（丟例外會連寫入一起還原）。
create or replace function public."MF__check_pin"(p_player_id uuid, p_pin text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    c_free  constant int := 5;           -- 連續打錯幾次才鎖
    c_base  constant int := 10;          -- 第一次鎖幾分鐘
    c_cap   constant int := 1440;        -- 鎖定上限（分鐘）＝ 24 小時
    c_quiet constant interval := interval '24 hours';
    v       public."MF_players"%rowtype;
    v_min   int;
begin
    select * into v from public."MF_players" where player_id = p_player_id for update;
    if not found or not v.claimed then
        return jsonb_build_object('ok', false, 'error', 'no_such_player');
    end if;
    if v.locked_until is not null and v.locked_until > now() then
        return jsonb_build_object('ok', false, 'error', 'locked',
                                  'wait_seconds', ceil(extract(epoch from (v.locked_until - now())))::int);
    end if;
    -- 安靜超過 24 小時：失敗計數與鎖定等級歸零
    if greatest(coalesce(v.last_fail_at, '-infinity'::timestamptz), coalesce(v.locked_until, '-infinity'::timestamptz)) < now() - c_quiet then
        v.fail_count := 0;
        v.lock_level := 0;
    end if;
    if public."MF__verify_pin"(p_pin, v.pin_hash) then
        update public."MF_players"
           set fail_count = 0, lock_level = 0, last_fail_at = null, locked_until = null
         where player_id = p_player_id;
        return jsonb_build_object('ok', true);
    end if;
    v.fail_count := v.fail_count + 1;
    if v.lock_level > 0 or v.fail_count >= c_free then
        v.lock_level := v.lock_level + 1;
        v_min := least(c_cap, c_base * (2 ^ least(v.lock_level - 1, 10))::int);
        update public."MF_players"
           set fail_count = v.fail_count, lock_level = v.lock_level, last_fail_at = now(),
               locked_until = now() + make_interval(mins => v_min)
         where player_id = p_player_id;
        return jsonb_build_object('ok', false, 'error', 'locked', 'wait_seconds', v_min * 60);
    end if;
    update public."MF_players"
       set fail_count = v.fail_count, lock_level = v.lock_level, last_fail_at = now()
     where player_id = p_player_id;
    return jsonb_build_object('ok', false, 'error', 'wrong_pin', 'attempts_left', c_free - v.fail_count);
end;
$$;

-- 暱稱現在的狀態：'taken'（已有人建立帳號用了）／'reserved'（被「別的」尚未認領的舊玩家保留中）／'free'。
--   p_legacy_pid：呼叫者自己的舊代號；如果「這個舊代號自己」就是用這個暱稱的舊玩家，他有權認領，不受別的舊玩家保留影響
--   （同一個暱稱有好幾位舊玩家時，誰先認領誰先拿到）。
create or replace function public."MF__nick_state"(p_key text, p_legacy_pid uuid default null)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if exists (select 1 from public."MF_players" where claimed and nick_key = p_key) then
        return 'taken';
    end if;
    if p_legacy_pid is not null and exists (select 1 from public."MF_players"
                                             where player_id = p_legacy_pid and not claimed and nick_key = p_key) then
        return 'free';
    end if;
    if exists (select 1 from public."MF_players"
                where not claimed and nick_key = p_key and reserved_until > now()
                  and player_id is distinct from p_legacy_pid) then
        return 'reserved';
    end if;
    return 'free';
end;
$$;

-- 建議一個沒人用的暱稱：原暱稱（超過 5 個字先截成 5 個字）＋隨機 3 位數（100～999），試最多 30 次；
-- 都不行就改 4 位數（原暱稱截成 4 個字）。「沒人用」＝資料表裡（不管有沒有認領、保留有沒有到期）沒有任何一列用這個比對鍵，
-- 這樣建議出來的名字一定不會跟榜上任何人重複。找不到回傳 null。
create or replace function public."MF__suggest_nick"(p_nick text, p_exclude uuid default null)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_clean text := public."MF__clean_nick"(p_nick);
    v_try   text;
    i       int;
begin
    if v_clean = '' then v_clean := '玩家'; end if;
    for i in 1..30 loop
        v_try := left(v_clean, 5) || (100 + floor(random() * 900))::int::text;
        if not exists (select 1 from public."MF_players"
                        where nick_key = public."MF__nick_key"(v_try) and player_id is distinct from p_exclude)
           and not public."MF__is_reserved"(public."MF__nick_key"(v_try)) then
            return v_try;
        end if;
    end loop;
    for i in 1..60 loop
        v_try := left(v_clean, 4) || (1000 + floor(random() * 9000))::int::text;
        if not exists (select 1 from public."MF_players"
                        where nick_key = public."MF__nick_key"(v_try) and player_id is distinct from p_exclude) then
            return v_try;
        end if;
    end loop;
    return null;
end;
$$;

-- 有人（已認領）拿到某個暱稱之後，其他「尚未認領」、暱稱一樣的舊玩家，在榜上的顯示名稱自動改成「原暱稱＋隨機數字」，
-- 這樣排行榜上永遠不會同時出現兩個一樣的名字。（他們之後來認領時，暱稱欄預設就是新名字。）
create or replace function public."MF__resolve_dups"(p_key text, p_winner uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    r     record;
    v_new text;
begin
    for r in select player_id, nickname from public."MF_players"
              where not claimed and nick_key = p_key and player_id <> p_winner
              for update loop
        v_new := public."MF__suggest_nick"(r.nickname, r.player_id);
        if v_new is not null then
            update public."MF_players" set nickname = v_new, nick_key = public."MF__nick_key"(v_new) where player_id = r.player_id;
        end if;
    end loop;
end;
$$;

-- 寫入一筆成績（呼叫前：遊戲要存在、成績要在範圍內；這裡負責排隊、判斷要不要寫、保持最多 N 名）。
--   規則：這位玩家在這款遊戲已經有紀錄 → 只有「嚴格比自己的紀錄好」才更新；
--         還沒有紀錄 → 榜上不到 N 列就直接寫入，滿了就要「嚴格勝過第 N 名」才寫入（同分算先達成的人贏）；
--         寫入後把第 N+1 名以後的列刪掉，榜單永遠最多 N 列。
--   回傳 { saved, rank }（rank 是這位玩家目前的名次，沒有紀錄為 null）。
create or replace function public."MF__write_score"(p_game_id text, p_player_id uuid, p_score numeric)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    g       public."MF_games"%rowtype;
    v_key   numeric;
    v_old   public."MF_scores"%rowtype;
    v_me    public."MF_scores"%rowtype;
    v_count int;
    v_worst numeric;
    v_saved boolean := false;
    v_rank  int;
begin
    select * into g from public."MF_games" where game_id = p_game_id;
    v_key := case g.better when 'min' then p_score else -p_score end;
    perform pg_advisory_xact_lock(hashtextextended('MF_scores:' || p_game_id, 0));
    select * into v_old from public."MF_scores" where game_id = p_game_id and player_id = p_player_id;
    if found then
        if v_key < v_old.rank_key then
            update public."MF_scores"
               set score = p_score, rank_key = v_key, achieved_at = now()
             where id = v_old.id;
            v_saved := true;
        end if;
    else
        select count(*), max(rank_key) into v_count, v_worst from public."MF_scores" where game_id = p_game_id;
        if v_count < g.top_n then
            v_saved := true;
        else
            v_saved := v_key < v_worst;
        end if;
        if v_saved then
            insert into public."MF_scores" (game_id, player_id, score, rank_key)
            values (p_game_id, p_player_id, p_score, v_key);
            delete from public."MF_scores"
             where id in (select id from public."MF_scores"
                           where game_id = p_game_id
                           order by rank_key, achieved_at, id
                          offset g.top_n);
        end if;
    end if;
    select * into v_me from public."MF_scores" where game_id = p_game_id and player_id = p_player_id;
    if found then
        select count(*) + 1 into v_rank
          from public."MF_scores"
         where game_id = p_game_id
           and (rank_key, achieved_at, id) < (v_me.rank_key, v_me.achieved_at, v_me.id);
    end if;
    return jsonb_build_object('saved', v_saved, 'rank', v_rank);
end;
$$;

-- 合併兩個玩家：把「來源」的全部資料併進「目標」，然後刪掉來源（它的暱稱因此釋出）。一個交易裡做完。
--   成績：每款遊戲兩邊都有就留較好的（同分留較早達成的）；只有來源有的就改掛到目標。合併只會讓列數不變或變少，不會擠出別人。
--   個人最佳：每款取較好（成績依該遊戲 better，關卡取最大）。
--   評價：搬到目標；撞到「同一款、同一天」的就留在原地（變成沒人認領的舊紀錄，不影響平均）。
--   意見：改掛到目標。來源的所有裝置憑證隨來源一起刪除（外鍵 on delete cascade）。
create or replace function public."MF__merge_player"(p_source uuid, p_target uuid, p_note text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    r  record;
    t  public."MF_scores"%rowtype;
begin
    if p_source is null or p_target is null or p_source = p_target then return; end if;
    -- 先替所有牽涉到的遊戲排隊（照 game_id 排序取鎖，避免兩個合併互相卡死）
    for r in select distinct game_id from public."MF_scores" where player_id in (p_source, p_target) order by game_id loop
        perform pg_advisory_xact_lock(hashtextextended('MF_scores:' || r.game_id, 0));
    end loop;
    for r in select * from public."MF_scores" where player_id = p_source loop
        select * into t from public."MF_scores" where game_id = r.game_id and player_id = p_target;
        if found then
            if (r.rank_key, r.achieved_at, r.id) < (t.rank_key, t.achieved_at, t.id) then
                delete from public."MF_scores" where id = t.id;
                update public."MF_scores" set player_id = p_target where id = r.id;
            else
                delete from public."MF_scores" where id = r.id;
            end if;
        else
            update public."MF_scores" set player_id = p_target where id = r.id;
        end if;
    end loop;
    -- 個人最佳
    insert into public."MF_player_bests" as b (player_id, game_id, best_score, best_level)
    select p_target, s.game_id, s.best_score, s.best_level from public."MF_player_bests" s where s.player_id = p_source
    on conflict (player_id, game_id) do update
        set best_score = case
                when excluded.best_score is null then b.best_score
                when b.best_score is null then excluded.best_score
                when (select better from public."MF_games" where game_id = b.game_id) = 'min' then least(b.best_score, excluded.best_score)
                else greatest(b.best_score, excluded.best_score) end,
            best_level = case
                when excluded.best_level is null then b.best_level
                when b.best_level is null then excluded.best_level
                else greatest(b.best_level, excluded.best_level) end,
            updated_at = now();
    delete from public."MF_player_bests" where player_id = p_source;
    -- 評價、意見
    update public."MF_ratings" x set player_id = p_target
     where x.player_id = p_source
       and not exists (select 1 from public."MF_ratings" y
                        where y.game_id = x.game_id and y.player_id = p_target and y.rated_on = x.rated_on);
    update public."MF_feedback" set player_id = p_target where player_id = p_source;
    insert into public."MF_player_merges" (source_id, target_id, note) values (p_source, p_target, p_note);
    delete from public."MF_players" where player_id = p_source;
end;
$$;

-- 這個呼叫者是誰（意見與評價用）：
--   'account'：帶了憑證，而且驗證通過；
--   'anon'   ：沒帶憑證，而且這個代號不屬於任何已建立帳號的玩家（沒有帳號的玩家也能給意見、評價）；
--   'deny'   ：帶了憑證但不對，或是沒帶憑證卻想用某個已建立帳號的代號（冒用）。
create or replace function public."MF__actor"(p_player_id uuid, p_token text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
    if p_player_id is null then return 'deny'; end if;
    if p_token is not null and p_token <> '' then
        return case when public."MF__auth"(p_player_id, p_token) then 'account' else 'deny' end;
    end if;
    if exists (select 1 from public."MF_players" where player_id = p_player_id and claimed) then return 'deny'; end if;
    return 'anon';
end;
$$;

-- 用暱稱或 player_id 找玩家（管理函式用）。找不到回傳 null。
create or replace function public."MF__find_player"(p_who text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_id uuid;
begin
    if p_who ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        select player_id into v_id from public."MF_players" where player_id = p_who::uuid;
        return v_id;
    end if;
    select player_id into v_id from public."MF_players" where claimed and nick_key = public."MF__nick_key"(p_who);
    if v_id is null then
        select player_id into v_id from public."MF_players" where nick_key = public."MF__nick_key"(p_who) order by created_at limit 1;
    end if;
    return v_id;
end;
$$;


-- ─── 3-1 讀取：某款遊戲的前 N 名 ───
--   p_player_id 可以不給；給了，回傳的每一列會多一個 mine（是不是這位玩家自己）。
--   回傳 JSON：{ game_id, better, limit, top: [ {rank, nick, score, mine}, ... ] }；永遠不回傳任何人的 player_id。
--   暱稱一律從玩家表（MF_players）帶出。找不到（或停用）的遊戲回傳 null。
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
                    select coalesce(p.nickname, '') as nickname, s.score, s.player_id,
                           row_number() over (order by s.rank_key, s.achieved_at, s.id) as pos
                      from public."MF_scores" s
                      join public."MF_players" p on p.player_id = s.player_id
                     where s.game_id = g.game_id
                   ) t
             where t.pos <= g.top_n
        ), '[]'::jsonb)
    )
      from public."MF_games" g
     where g.game_id = p_game_id
       and g.enabled;
$$;

-- ─── 3-2 暱稱現在能不能用（只查狀態：不驗密碼、不計入失敗次數）───
--   回傳 { ok:true, state, nick, suggestion, until }
--     state：'free'（可以用）／'taken'（已有人用）／'reserved'（保留給還沒認領的舊玩家，until 是保留到何時）／'bad'（空白或保留字）
--     nick：清理後的暱稱（最多 8 個字）；suggestion：不是 free 時，建議的暱稱（原暱稱＋隨機 3 位數，保證沒人用）。
--   p_legacy_pid：舊玩家自己的舊代號（他自己保留的暱稱對他來說是 free）。
create or replace function public."MF_check_nick"(p_nick text, p_legacy_pid uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_nick  text := public."MF__clean_nick"(p_nick);
    v_key   text := public."MF__nick_key"(p_nick);
    v_state text;
    v_until timestamptz;
begin
    if v_nick = '' or v_key = '' or public."MF__is_reserved"(v_key) then
        return jsonb_build_object('ok', true, 'state', 'bad', 'nick', v_nick);
    end if;
    v_state := public."MF__nick_state"(v_key, p_legacy_pid);
    if v_state = 'free' then
        return jsonb_build_object('ok', true, 'state', 'free', 'nick', v_nick);
    end if;
    if v_state = 'reserved' then
        select max(reserved_until) into v_until from public."MF_players"
         where not claimed and nick_key = v_key and reserved_until > now() and player_id is distinct from p_legacy_pid;
    end if;
    return jsonb_build_object('ok', true, 'state', v_state, 'nick', v_nick,
                              'suggestion', public."MF__suggest_nick"(v_nick, p_legacy_pid), 'until', v_until);
end;
$$;

-- ─── 3-3 舊玩家狀態：這個舊代號在資料庫裡是什麼情況？ ───
--   回傳 { ok:true, state:'unknown'｜'unclaimed'｜'claimed', nick }
--   unknown＝資料庫沒有這個代號（例如他早就掉出所有前 30 名），網頁把他當成新玩家；
--   unclaimed＝榜上有他的紀錄、還沒建立密碼（網頁跳「建立暱稱與密碼」）；claimed＝這個代號已經有帳號。
create or replace function public."MF_legacy_status"(p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v public."MF_players"%rowtype;
begin
    if p_player_id is null then return jsonb_build_object('ok', true, 'state', 'unknown'); end if;
    select * into v from public."MF_players" where player_id = p_player_id;
    if not found then return jsonb_build_object('ok', true, 'state', 'unknown'); end if;
    return jsonb_build_object('ok', true, 'state', case when v.claimed then 'claimed' else 'unclaimed' end, 'nick', v.nickname);
end;
$$;

-- ─── 3-4 新玩家：建立帳號＋寫入第一筆成績（同一個交易）───
--   條件：暱稱可用、密碼是 4 位數、這筆成績「真的進得了榜」。三個都符合才會建立帳號；任何一個不符合，什麼都不留下。
--   成功回傳 MF_get_top 的內容再加上 { ok:true, saved:true, rank, player_id, token, nick }（token 只回傳這一次）。
--   失敗 { ok:false, error }：unknown_game｜bad_args｜out_of_range｜bad_pin｜bad_nick｜
--     busy（這個小時新帳號太多了，稍後再試）｜nick_taken｜nick_reserved（都附 suggestion）｜not_qualified（榜單剛好被擠掉了）
create or replace function public."MF_register"(p_nick text, p_pin text, p_game_id text, p_score numeric)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    c_per_hour constant int := 60;              -- 全站每小時最多建立幾個新帳號（防機器人狂建帳號的保險絲）
    g       public."MF_games"%rowtype;
    v_nick  text := public."MF__clean_nick"(p_nick);
    v_key   text := public."MF__nick_key"(p_nick);
    v_score numeric;
    v_rk    numeric;
    v_state text;
    v_count int;
    v_worst numeric;
    v_pid   uuid;
    v_res   jsonb;
    v_token text;
begin
    select * into g from public."MF_games" where game_id = p_game_id and enabled;
    if not found then return jsonb_build_object('ok', false, 'error', 'unknown_game'); end if;
    if p_score is null then return jsonb_build_object('ok', false, 'error', 'bad_args'); end if;
    v_score := round(p_score, 4);
    if v_score < g.min_score or v_score > g.max_score then
        return jsonb_build_object('ok', false, 'error', 'out_of_range');
    end if;
    if not public."MF__valid_pin"(p_pin) then return jsonb_build_object('ok', false, 'error', 'bad_pin'); end if;
    if v_nick = '' or v_key = '' or public."MF__is_reserved"(v_key) then
        return jsonb_build_object('ok', false, 'error', 'bad_nick');
    end if;
    if (select count(*) from public."MF_players" where created_at > now() - interval '1 hour') >= c_per_hour then
        return jsonb_build_object('ok', false, 'error', 'busy');
    end if;
    -- 搶同一個暱稱的人排隊（先搶先贏）
    perform pg_advisory_xact_lock(hashtextextended('MF_nick:' || v_key, 0));
    v_state := public."MF__nick_state"(v_key, null);
    if v_state <> 'free' then
        return jsonb_build_object('ok', false, 'error', case v_state when 'taken' then 'nick_taken' else 'nick_reserved' end,
                                  'suggestion', public."MF__suggest_nick"(v_nick, null),
                                  'until', (select max(reserved_until) from public."MF_players" where not claimed and nick_key = v_key and reserved_until > now()));
    end if;
    -- 這筆成績真的進得了榜才建帳號（跟 MF__write_score 同一套規則：不到 N 名一定進；滿了要嚴格勝過最後一名）
    perform pg_advisory_xact_lock(hashtextextended('MF_scores:' || p_game_id, 0));
    v_rk := case g.better when 'min' then v_score else -v_score end;
    select count(*), max(rank_key) into v_count, v_worst from public."MF_scores" where game_id = p_game_id;
    if not (v_count < g.top_n or v_rk < v_worst) then
        return jsonb_build_object('ok', false, 'error', 'not_qualified');
    end if;
    insert into public."MF_players" (nickname, nick_key, claimed, pin_hash, claimed_at, last_login_at)
    values (v_nick, v_key, true, public."MF__hash_pin"(p_pin), now(), now())
    returning player_id into v_pid;
    perform public."MF__resolve_dups"(v_key, v_pid);
    v_res := public."MF__write_score"(p_game_id, v_pid, v_score);
    v_token := public."MF__new_session"(v_pid);
    return public."MF_get_top"(p_game_id, v_pid)
        || jsonb_build_object('ok', true, 'saved', (v_res ->> 'saved')::boolean, 'rank', v_res -> 'rank',
                              'player_id', v_pid, 'token', v_token, 'nick', v_nick);
end;
$$;

-- ─── 3-5 舊玩家認領：把暱稱＋密碼設在他原本的舊代號上 ───
--   A. 暱稱可用 → 暱稱＋密碼寫進「他原本那一列」（player_id 不變，榜上的成績、意見、評價全部照舊）。
--   B. 暱稱已被別的帳號用了 → 一律當成他按了「我就是本人，登入」：驗那個帳號的密碼（含限速）；
--      密碼相符＝同一個人的另一台裝置，改用那個帳號（第一台的 player_id），這個舊代號在榜上的成績自動併進去。
--   成功回傳 { ok:true, player_id, token, nick, joined }（joined＝true 表示併入了既有帳號）。
--   失敗 { ok:false, error }：bad_args｜bad_pin｜bad_nick｜unknown_legacy｜already_claimed｜nick_reserved（附 suggestion、until）｜
--     wrong_pin（附 attempts_left）｜locked（附 wait_seconds）
create or replace function public."MF_claim_legacy"(p_legacy_pid uuid, p_nick text, p_pin text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_nick   text := public."MF__clean_nick"(p_nick);
    v_key    text := public."MF__nick_key"(p_nick);
    v_leg    public."MF_players"%rowtype;
    v_owner  uuid;
    v_owner_nick text;
    v_chk    jsonb;
    v_token  text;
begin
    if p_legacy_pid is null then return jsonb_build_object('ok', false, 'error', 'bad_args'); end if;
    if not public."MF__valid_pin"(p_pin) then return jsonb_build_object('ok', false, 'error', 'bad_pin'); end if;
    if v_nick = '' or v_key = '' or public."MF__is_reserved"(v_key) then
        return jsonb_build_object('ok', false, 'error', 'bad_nick');
    end if;
    perform pg_advisory_xact_lock(hashtextextended('MF_nick:' || v_key, 0));
    select * into v_leg from public."MF_players" where player_id = p_legacy_pid for update;
    if not found then return jsonb_build_object('ok', false, 'error', 'unknown_legacy'); end if;
    if v_leg.claimed then return jsonb_build_object('ok', false, 'error', 'already_claimed'); end if;
    select player_id, nickname into v_owner, v_owner_nick from public."MF_players" where claimed and nick_key = v_key;
    if v_owner is not null then
        -- B：暱稱已被帳號使用 → 驗密碼
        v_chk := public."MF__check_pin"(v_owner, p_pin);
        if not coalesce((v_chk ->> 'ok')::boolean, false) then return v_chk; end if;
        perform public."MF__merge_player"(p_legacy_pid, v_owner, '舊代號併入既有帳號（同暱稱、同密碼）');
        perform public."MF__resolve_dups"(v_key, v_owner);
        v_token := public."MF__new_session"(v_owner);
        return jsonb_build_object('ok', true, 'player_id', v_owner, 'token', v_token, 'nick', v_owner_nick, 'joined', true);
    end if;
    -- A：暱稱沒有帳號在用；被「別的」舊玩家保留中就不行
    if public."MF__nick_state"(v_key, p_legacy_pid) <> 'free' then
        return jsonb_build_object('ok', false, 'error', 'nick_reserved',
                                  'suggestion', public."MF__suggest_nick"(v_nick, p_legacy_pid),
                                  'until', (select max(reserved_until) from public."MF_players" where not claimed and nick_key = v_key and reserved_until > now() and player_id <> p_legacy_pid));
    end if;
    update public."MF_players"
       set nickname = v_nick, nick_key = v_key, claimed = true, pin_hash = public."MF__hash_pin"(p_pin),
           claimed_at = now(), reserved_until = null,
           fail_count = 0, lock_level = 0, last_fail_at = null, locked_until = null
     where player_id = p_legacy_pid;
    perform public."MF__resolve_dups"(v_key, p_legacy_pid);
    v_token := public."MF__new_session"(p_legacy_pid);
    return jsonb_build_object('ok', true, 'player_id', p_legacy_pid, 'token', v_token, 'nick', v_nick, 'joined', false);
end;
$$;

-- ─── 3-6 登入：暱稱＋密碼（換手機、換瀏覽器）───
--   p_legacy_pid：這支瀏覽器原本的舊代號（有的話，榜上還沒認領的舊成績自動併進這個帳號；屬於別的已建立帳號的代號會被忽略）。
--   成功回傳 { ok:true, player_id, token, nick }；失敗 { ok:false, error }：bad_args｜bad_pin｜no_such_player｜wrong_pin｜locked
create or replace function public."MF_login"(p_nick text, p_pin text, p_legacy_pid uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_key   text := public."MF__nick_key"(p_nick);
    v_pid   uuid;
    v_nick  text;
    v_chk   jsonb;
    v_token text;
begin
    if v_key = '' then return jsonb_build_object('ok', false, 'error', 'bad_args'); end if;
    if not public."MF__valid_pin"(p_pin) then return jsonb_build_object('ok', false, 'error', 'bad_pin'); end if;
    select player_id, nickname into v_pid, v_nick from public."MF_players" where claimed and nick_key = v_key;
    if v_pid is null then return jsonb_build_object('ok', false, 'error', 'no_such_player'); end if;
    v_chk := public."MF__check_pin"(v_pid, p_pin);
    if not coalesce((v_chk ->> 'ok')::boolean, false) then return v_chk; end if;
    if p_legacy_pid is not null and p_legacy_pid <> v_pid
       and exists (select 1 from public."MF_players" where player_id = p_legacy_pid and not claimed) then
        perform public."MF__merge_player"(p_legacy_pid, v_pid, '登入時併入這支瀏覽器原本的舊代號');
        perform public."MF__resolve_dups"(v_key, v_pid);
    end if;
    v_token := public."MF__new_session"(v_pid);
    return jsonb_build_object('ok', true, 'player_id', v_pid, 'token', v_token, 'nick', v_nick);
end;
$$;

-- ─── 3-7 後悔藥：把「目前登入的帳號」合併到「另一個帳號」（暱稱＋密碼證明我是它）───
--   憑證證明我是來源帳號、暱稱＋密碼證明我是目標帳號。成功後來源帳號消失（它的暱稱釋出），這支瀏覽器改用目標帳號。
--   成功回傳 { ok:true, player_id（目標）, token（目標的新憑證）, nick }；
--   失敗 { ok:false, error }：bad_token｜bad_args｜no_such_player｜same_player｜wrong_pin｜locked
create or replace function public."MF_login_and_merge"(p_player_id uuid, p_token text, p_nick text, p_pin text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_key   text := public."MF__nick_key"(p_nick);
    v_pid   uuid;
    v_nick  text;
    v_chk   jsonb;
    v_token text;
begin
    if not public."MF__auth"(p_player_id, p_token) then return jsonb_build_object('ok', false, 'error', 'bad_token'); end if;
    if v_key = '' then return jsonb_build_object('ok', false, 'error', 'bad_args'); end if;
    if not public."MF__valid_pin"(p_pin) then return jsonb_build_object('ok', false, 'error', 'bad_pin'); end if;
    select player_id, nickname into v_pid, v_nick from public."MF_players" where claimed and nick_key = v_key;
    if v_pid is null then return jsonb_build_object('ok', false, 'error', 'no_such_player'); end if;
    if v_pid = p_player_id then return jsonb_build_object('ok', false, 'error', 'same_player'); end if;
    v_chk := public."MF__check_pin"(v_pid, p_pin);
    if not coalesce((v_chk ->> 'ok')::boolean, false) then return v_chk; end if;
    perform public."MF__merge_player"(p_player_id, v_pid, '玩家自己把一個帳號合併到另一個帳號');
    v_token := public."MF__new_session"(v_pid);
    return jsonb_build_object('ok', true, 'player_id', v_pid, 'token', v_token, 'nick', v_nick);
end;
$$;

-- ─── 3-8 寫入：送出一筆成績（一定要裝置憑證）───
--   規則（只留前 30 名、同分先到先贏、嚴格較好才更新）都在 MF__write_score。暱稱用帳號的暱稱，不再由網頁傳。
--   回傳：MF_get_top 的內容再加上 ok、saved（這次有沒有寫進榜）、rank（這位玩家目前的名次，沒上榜為 null）。
--   失敗 { ok:false, error }：unknown_game｜bad_args｜out_of_range｜bad_token
create or replace function public."MF_submit_score"(
    p_game_id   text,
    p_player_id uuid,
    p_token     text,
    p_score     numeric
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    g       public."MF_games"%rowtype;
    v_score numeric;
    v_res   jsonb;
begin
    select * into g from public."MF_games" where game_id = p_game_id and enabled;
    if not found then
        return jsonb_build_object('ok', false, 'error', 'unknown_game');
    end if;
    if p_player_id is null or p_score is null then
        return jsonb_build_object('ok', false, 'error', 'bad_args');
    end if;
    v_score := round(p_score, 4);
    if v_score < g.min_score or v_score > g.max_score then
        return jsonb_build_object('ok', false, 'error', 'out_of_range');
    end if;
    if not public."MF__auth"(p_player_id, p_token) then
        return jsonb_build_object('ok', false, 'error', 'bad_token');
    end if;
    v_res := public."MF__write_score"(p_game_id, p_player_id, v_score);
    return public."MF_get_top"(p_game_id, p_player_id)
        || jsonb_build_object('ok', true, 'saved', (v_res ->> 'saved')::boolean, 'rank', v_res -> 'rank');
end;
$$;

-- ─── 3-9 改暱稱（要裝置憑證）───
--   player_id 永遠不變，只換顯示的暱稱；榜上所有遊戲立刻換成新名字（暱稱只存在玩家表）。
--   限制：台灣時間一天最多改 2 次；新暱稱不能被別人用、也不能被別位舊玩家保留中。
--   成功回傳 { ok:true, nick, changed, left }（left＝今天還能再改幾次）；
--   失敗 { ok:false, error }：bad_token｜bad_nick｜nick_taken｜nick_reserved（附 suggestion）｜rename_too_many（附 limit）
create or replace function public."MF_rename"(p_player_id uuid, p_token text, p_nick text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    c_rename_per_day constant int := 2;
    v_nick  text := public."MF__clean_nick"(p_nick);
    v_key   text := public."MF__nick_key"(p_nick);
    v_day   date := (now() at time zone 'Asia/Taipei')::date;
    v       public."MF_players"%rowtype;
    v_cnt   int;
begin
    if not public."MF__auth"(p_player_id, p_token) then return jsonb_build_object('ok', false, 'error', 'bad_token'); end if;
    if v_nick = '' or v_key = '' or public."MF__is_reserved"(v_key) then
        return jsonb_build_object('ok', false, 'error', 'bad_nick');
    end if;
    perform pg_advisory_xact_lock(hashtextextended('MF_nick:' || v_key, 0));
    select * into v from public."MF_players" where player_id = p_player_id for update;
    if v.nickname = v_nick then
        return jsonb_build_object('ok', true, 'nick', v_nick, 'changed', false,
                                  'left', case when v.rename_day = v_day then greatest(0, c_rename_per_day - v.rename_count) else c_rename_per_day end);
    end if;
    v_cnt := case when v.rename_day = v_day then v.rename_count else 0 end;
    if v_cnt >= c_rename_per_day then
        return jsonb_build_object('ok', false, 'error', 'rename_too_many', 'limit', c_rename_per_day);
    end if;
    if exists (select 1 from public."MF_players" where claimed and nick_key = v_key and player_id <> p_player_id) then
        return jsonb_build_object('ok', false, 'error', 'nick_taken', 'suggestion', public."MF__suggest_nick"(v_nick, p_player_id));
    end if;
    if exists (select 1 from public."MF_players" where not claimed and nick_key = v_key and reserved_until > now()) then
        return jsonb_build_object('ok', false, 'error', 'nick_reserved', 'suggestion', public."MF__suggest_nick"(v_nick, p_player_id));
    end if;
    update public."MF_players"
       set nickname = v_nick, nick_key = v_key, nick_changed_at = now(), rename_day = v_day, rename_count = v_cnt + 1
     where player_id = p_player_id;
    perform public."MF__resolve_dups"(v_key, p_player_id);
    return jsonb_build_object('ok', true, 'nick', v_nick, 'changed', true, 'left', c_rename_per_day - (v_cnt + 1));
end;
$$;

-- ─── 3-10 設定新密碼（要裝置憑證；不需要舊密碼，因為已經是登入中的裝置）───
--   成功後這位玩家「其他所有裝置」都會被登出（保留現在這支），失敗計數與鎖定一併清掉。
--   失敗 { ok:false, error }：bad_token｜bad_pin
create or replace function public."MF_change_pin"(p_player_id uuid, p_token text, p_new_pin text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
    if not public."MF__auth"(p_player_id, p_token) then return jsonb_build_object('ok', false, 'error', 'bad_token'); end if;
    if not public."MF__valid_pin"(p_new_pin) then return jsonb_build_object('ok', false, 'error', 'bad_pin'); end if;
    update public."MF_players"
       set pin_hash = public."MF__hash_pin"(p_new_pin), fail_count = 0, lock_level = 0, last_fail_at = null, locked_until = null
     where player_id = p_player_id;
    delete from public."MF_sessions" where player_id = p_player_id and token_hash <> public."MF__token_hash"(p_token);
    return jsonb_build_object('ok', true);
end;
$$;

-- ─── 3-11 登出（刪掉這一把憑證）／我是誰（網頁定期確認憑證還有效、暱稱有沒有被改）───
create or replace function public."MF_logout"(p_player_id uuid, p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
    if not public."MF__auth"(p_player_id, p_token) then return jsonb_build_object('ok', false, 'error', 'bad_token'); end if;
    delete from public."MF_sessions" where token_hash = public."MF__token_hash"(p_token) and player_id = p_player_id;
    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public."MF_whoami"(p_player_id uuid, p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_nick text;
begin
    if not public."MF__auth"(p_player_id, p_token) then return jsonb_build_object('ok', false, 'error', 'bad_token'); end if;
    select nickname into v_nick from public."MF_players" where player_id = p_player_id;
    return jsonb_build_object('ok', true, 'nick', v_nick);
end;
$$;

-- ─── 3-12 個人最佳同步（要裝置憑證）───
--   p_items：[ { g: 遊戲代號, s: 最佳成績（可省略）, lv: 最佳關卡（可省略） }, … ]（一次最多 400 項）。
--   每一項「取較好的」合併進資料庫：成績依該遊戲的 better（min 取小、max 取大），關卡取大；
--   遊戲不存在、成績超出範圍、關卡不是 1～200 的整數的項目不收，列在 rejected。
--   回傳 { ok:true, items: [ { g, b（better）, s, lv }, … ]（這位玩家資料庫裡全部的最佳）, rejected: [遊戲代號…] }。
--   p_items 給空陣列＝只下載。
create or replace function public."MF_sync_bests"(p_player_id uuid, p_token text, p_items jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    c_max_items constant int := 400;
    c_max_level constant int := 200;
    it      jsonb;
    g       public."MF_games"%rowtype;
    v_s     numeric;
    v_lv    int;
    v_rej   jsonb := '[]'::jsonb;
    v_out   jsonb;
begin
    if not public."MF__auth"(p_player_id, p_token) then return jsonb_build_object('ok', false, 'error', 'bad_token'); end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' then p_items := '[]'::jsonb; end if;
    if jsonb_array_length(p_items) > c_max_items then
        return jsonb_build_object('ok', false, 'error', 'bad_args');
    end if;
    for it in select * from jsonb_array_elements(p_items) loop
        begin
            select * into g from public."MF_games" where game_id = (it ->> 'g') and enabled;
            if not found then v_rej := v_rej || to_jsonb(coalesce(it ->> 'g', '')); continue; end if;
            v_s := null; v_lv := null;
            if it ? 's' and jsonb_typeof(it -> 's') = 'number' then
                v_s := round((it ->> 's')::numeric, 4);
                if v_s < g.min_score or v_s > g.max_score then v_rej := v_rej || to_jsonb(g.game_id); continue; end if;
            end if;
            if it ? 'lv' and jsonb_typeof(it -> 'lv') = 'number' then
                if (it ->> 'lv')::numeric <> floor((it ->> 'lv')::numeric) or (it ->> 'lv')::numeric < 1 or (it ->> 'lv')::numeric > c_max_level then
                    v_rej := v_rej || to_jsonb(g.game_id); continue;
                end if;
                v_lv := (it ->> 'lv')::int;
            end if;
            if v_s is null and v_lv is null then continue; end if;
            insert into public."MF_player_bests" as b (player_id, game_id, best_score, best_level)
            values (p_player_id, g.game_id, v_s, v_lv)
            on conflict (player_id, game_id) do update
                set best_score = case
                        when excluded.best_score is null then b.best_score
                        when b.best_score is null then excluded.best_score
                        when g.better = 'min' then least(b.best_score, excluded.best_score)
                        else greatest(b.best_score, excluded.best_score) end,
                    best_level = case
                        when excluded.best_level is null then b.best_level
                        when b.best_level is null then excluded.best_level
                        else greatest(b.best_level, excluded.best_level) end,
                    updated_at = now();
        exception when others then
            v_rej := v_rej || to_jsonb(coalesce(it ->> 'g', ''));
        end;
    end loop;
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('g', b.game_id, 'b', m.better, 's', b.best_score, 'lv', b.best_level)) order by b.game_id), '[]'::jsonb)
      into v_out
      from public."MF_player_bests" b join public."MF_games" m on m.game_id = b.game_id
     where b.player_id = p_player_id;
    return jsonb_build_object('ok', true, 'items', v_out, 'rejected', v_rej);
end;
$$;


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
-- 唯一不公開的是 player_id：公開出去的話，別人就能拿它去冒充那位玩家。資料表本身仍然鎖著，所以沒有人能新增、修改或刪除意見，
-- 只有玩家透過函式 MF_submit_feedback 才寫得進去。
-- V1.35.0 起：意見可以「匿名」送（沒建立帳號的玩家也能給意見）；有登入的玩家，暱稱由資料庫從他的帳號帶入
-- （網頁傳來的暱稱不再採信）；匿名不能冒用已建立帳號的 player_id（會回 bad_token）。
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
--   失敗回傳 { ok:false, error:'unknown_game' | 'bad_args' | 'too_many' | 'bad_token' }。
create or replace function public."MF_submit_feedback"(
    p_game_id   text,
    p_player_id uuid,
    p_message   text,
    p_token     text default null,
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
    v_actor     text;
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
    -- 呼叫者：有憑證且通過＝帳號（暱稱由資料庫帶入，不信任網頁傳來的）；沒憑證、而且代號不屬於已建立帳號的玩家＝匿名（暱稱留空）；
    --         其他一律拒絕（帶了錯的憑證、或沒憑證卻想用已建立帳號的代號＝冒用）
    v_actor := public."MF__actor"(p_player_id, p_token);
    if v_actor = 'deny' then
        return jsonb_build_object('ok', false, 'error', 'bad_token');
    end if;
    if v_actor = 'account' then
        select nickname into v_nick from public."MF_players" where player_id = p_player_id;
    end if;
    -- 版本是選填；不合格式就當作沒有
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
--        { ok:false, error:'unknown_game' | 'bad_args' | 'bad_token' }
--   avg 是小數 2 位；還沒有任何評價時 avg 是 null、cnt 是 0。
create or replace function public."MF_submit_rating"(
    p_game_id   text,
    p_player_id uuid,
    p_stars     int,
    p_token     text default null
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
    -- 呼叫者：有憑證且通過＝帳號；沒憑證、代號不屬於已建立帳號＝匿名（照樣可以評價）；其他（錯的憑證、冒用已建立帳號的代號）一律拒絕
    if public."MF__actor"(p_player_id, p_token) = 'deny' then
        return jsonb_build_object('ok', false, 'error', 'bad_token');
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

revoke all on function public."MF_submit_rating"(text, uuid, int, text) from public;
revoke all on function public."MF_get_ratings"()                   from public;
grant execute on function public."MF_submit_rating"(text, uuid, int, text) to anon, authenticated;
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


-- ═══ 8. 管理者專用（只有你在 Supabase 的 SQL Editor 能執行；不開放給 anon，網頁呼叫會被拒絕）═══
-- 用法範例（把括號裡的暱稱換成玩家的暱稱；也可以填 player_id）：
--   select public."MF_admin_reset_pin"('小明', '4321');            -- 玩家忘記密碼、所有裝置都登出了：重設成 4321，並登出他全部的裝置
--   select public."MF_admin_merge"('小明417', '小明');             -- 玩家說「我有兩個帳號」：把「小明417」併進「小明」（兩邊成績每款取較好的）
--   select public."MF_admin_release_nick"('小明');                 -- 釋出暱稱：尚未認領的舊玩家→提前結束保留；已建立的帳號→暱稱改成「原暱稱＋隨機數字」
--   select public."MF_admin_delete_player"('小明');                -- 玩家要求刪除個資：刪掉帳號與他的成績、最佳紀錄、憑證
--   select * from public."MF_players_admin" order by 1;            -- 看全部玩家（欄位名稱是中文）
-- 每個函式都回傳一段 JSON，說明做了什麼（ok:false 表示沒做，error 是原因）。

create or replace function public."MF_admin_reset_pin"(p_who text, p_new_pin text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_id uuid := public."MF__find_player"(p_who);
begin
    if v_id is null then return jsonb_build_object('ok', false, 'error', 'no_such_player'); end if;
    if not public."MF__valid_pin"(p_new_pin) then return jsonb_build_object('ok', false, 'error', 'bad_pin'); end if;
    if not exists (select 1 from public."MF_players" where player_id = v_id and claimed) then
        return jsonb_build_object('ok', false, 'error', 'not_claimed');
    end if;
    update public."MF_players"
       set pin_hash = public."MF__hash_pin"(p_new_pin), fail_count = 0, lock_level = 0, last_fail_at = null, locked_until = null
     where player_id = v_id;
    delete from public."MF_sessions" where player_id = v_id;
    return jsonb_build_object('ok', true, 'player_id', v_id, 'note', '密碼已重設，並登出這位玩家所有的裝置');
end;
$$;

create or replace function public."MF_admin_merge"(p_from text, p_into text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_from uuid := public."MF__find_player"(p_from);
    v_into uuid := public."MF__find_player"(p_into);
begin
    if v_from is null or v_into is null then return jsonb_build_object('ok', false, 'error', 'no_such_player'); end if;
    if v_from = v_into then return jsonb_build_object('ok', false, 'error', 'same_player'); end if;
    if not exists (select 1 from public."MF_players" where player_id = v_into and claimed) then
        return jsonb_build_object('ok', false, 'error', 'target_not_claimed');
    end if;
    perform public."MF__merge_player"(v_from, v_into, '管理者手動合併');
    return jsonb_build_object('ok', true, 'from', v_from, 'into', v_into);
end;
$$;

create or replace function public."MF_admin_release_nick"(p_who text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v     public."MF_players"%rowtype;
    v_new text;
begin
    select * into v from public."MF_players" where player_id = public."MF__find_player"(p_who) for update;
    if not found then return jsonb_build_object('ok', false, 'error', 'no_such_player'); end if;
    if not v.claimed then
        update public."MF_players" set reserved_until = now() - interval '1 second' where player_id = v.player_id;
        return jsonb_build_object('ok', true, 'note', '已提前結束這位舊玩家的暱稱保留（他之後仍可認領，只是不再保留）');
    end if;
    v_new := public."MF__suggest_nick"(v.nickname, v.player_id);
    if v_new is null then return jsonb_build_object('ok', false, 'error', 'no_suggestion'); end if;
    update public."MF_players" set nickname = v_new, nick_key = public."MF__nick_key"(v_new), nick_changed_at = now() where player_id = v.player_id;
    return jsonb_build_object('ok', true, 'old', v.nickname, 'new', v_new);
end;
$$;

create or replace function public."MF_admin_delete_player"(p_who text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_id uuid := public."MF__find_player"(p_who);
begin
    if v_id is null then return jsonb_build_object('ok', false, 'error', 'no_such_player'); end if;
    delete from public."MF_players" where player_id = v_id;        -- 成績、最佳紀錄、憑證隨外鍵一起刪
    return jsonb_build_object('ok', true, 'player_id', v_id);
end;
$$;

-- 給人翻閱的玩家清單：欄位名稱是中文（使用者的規定：資料庫給人看的東西要有中文名稱）。只有管理者看得到。
create or replace view public."MF_players_admin" as
select p.nickname                                         as "暱稱",
       case when p.claimed then '已建立密碼' else '舊玩家尚未認領' end as "狀態",
       p.player_id                                        as "玩家編號",
       p.created_at                                       as "首次出現",
       p.claimed_at                                       as "建立密碼時間",
       p.last_login_at                                    as "最後登入",
       p.reserved_until                                   as "暱稱保留到",
       p.locked_until                                     as "密碼鎖定到",
       p.fail_count                                       as "連續打錯次數",
       (select count(*) from public."MF_scores" s where s.player_id = p.player_id)    as "榜上成績數",
       (select count(*) from public."MF_sessions" x where x.player_id = p.player_id)  as "登入中的裝置數"
  from public."MF_players" p
 order by p.claimed desc, p.created_at;
comment on view public."MF_players_admin" is '玩家清單（欄位為中文，給管理者看）；不含密碼雜湊與憑證';
revoke all on public."MF_players_admin" from public, anon, authenticated;


-- ═══ 9. 函式權限（一律先收回，再只開給網頁會呼叫的）═══
-- 內部函式（MF__ 開頭）與管理函式（MF_admin_）：不開放給 anon／authenticated，只有資料庫內部或你在 SQL Editor 能用。
revoke all on function public."MF__clean_nick"(text)                          from public, anon, authenticated;
revoke all on function public."MF__nick_key"(text)                            from public, anon, authenticated;
revoke all on function public."MF__is_reserved"(text)                         from public, anon, authenticated;
revoke all on function public."MF__valid_pin"(text)                           from public, anon, authenticated;
revoke all on function public."MF__hash_pin"(text)                            from public, anon, authenticated;
revoke all on function public."MF__verify_pin"(text, text)                    from public, anon, authenticated;
revoke all on function public."MF__token_hash"(text)                          from public, anon, authenticated;
revoke all on function public."MF__auth"(uuid, text)                          from public, anon, authenticated;
revoke all on function public."MF__new_session"(uuid)                         from public, anon, authenticated;
revoke all on function public."MF__check_pin"(uuid, text)                     from public, anon, authenticated;
revoke all on function public."MF__nick_state"(text, uuid)                    from public, anon, authenticated;
revoke all on function public."MF__suggest_nick"(text, uuid)                  from public, anon, authenticated;
revoke all on function public."MF__resolve_dups"(text, uuid)                  from public, anon, authenticated;
revoke all on function public."MF__write_score"(text, uuid, numeric)          from public, anon, authenticated;
revoke all on function public."MF__merge_player"(uuid, uuid, text)            from public, anon, authenticated;
revoke all on function public."MF__actor"(uuid, text)                         from public, anon, authenticated;
revoke all on function public."MF__find_player"(text)                         from public, anon, authenticated;
revoke all on function public."MF_admin_reset_pin"(text, text)                from public, anon, authenticated;
revoke all on function public."MF_admin_merge"(text, text)                    from public, anon, authenticated;
revoke all on function public."MF_admin_release_nick"(text)                   from public, anon, authenticated;
revoke all on function public."MF_admin_delete_player"(text)                  from public, anon, authenticated;

-- 公開函式（網頁用 anon 金鑰呼叫）
revoke all on function public."MF_get_top"(text, uuid)                        from public;
revoke all on function public."MF_check_nick"(text, uuid)                     from public;
revoke all on function public."MF_legacy_status"(uuid)                        from public;
revoke all on function public."MF_register"(text, text, text, numeric)        from public;
revoke all on function public."MF_claim_legacy"(uuid, text, text)             from public;
revoke all on function public."MF_login"(text, text, uuid)                    from public;
revoke all on function public."MF_login_and_merge"(uuid, text, text, text)    from public;
revoke all on function public."MF_submit_score"(text, uuid, text, numeric)    from public;
revoke all on function public."MF_rename"(uuid, text, text)                   from public;
revoke all on function public."MF_change_pin"(uuid, text, text)               from public;
revoke all on function public."MF_logout"(uuid, text)                         from public;
revoke all on function public."MF_whoami"(uuid, text)                         from public;
revoke all on function public."MF_sync_bests"(uuid, text, jsonb)              from public;
grant execute on function public."MF_get_top"(text, uuid)                     to anon, authenticated;
grant execute on function public."MF_check_nick"(text, uuid)                  to anon, authenticated;
grant execute on function public."MF_legacy_status"(uuid)                     to anon, authenticated;
grant execute on function public."MF_register"(text, text, text, numeric)     to anon, authenticated;
grant execute on function public."MF_claim_legacy"(uuid, text, text)          to anon, authenticated;
grant execute on function public."MF_login"(text, text, uuid)                 to anon, authenticated;
grant execute on function public."MF_login_and_merge"(uuid, text, text, text) to anon, authenticated;
grant execute on function public."MF_submit_score"(text, uuid, text, numeric) to anon, authenticated;
grant execute on function public."MF_rename"(uuid, text, text)                to anon, authenticated;
grant execute on function public."MF_change_pin"(uuid, text, text)            to anon, authenticated;
grant execute on function public."MF_logout"(uuid, text)                      to anon, authenticated;
grant execute on function public."MF_whoami"(uuid, text)                      to anon, authenticated;
grant execute on function public."MF_sync_bests"(uuid, text, jsonb)           to anon, authenticated;
