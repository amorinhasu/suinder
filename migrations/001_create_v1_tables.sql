create extension if not exists pgcrypto;

do $$ begin
  create type profile_status as enum ('draft', 'active', 'paused', 'moderator_paused', 'deleted');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type profile_action_type as enum ('like', 'pass');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type match_status as enum ('active', 'blocked', 'closed', 'moderator_closed');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type report_category as enum ('harassment', 'inappropriate_profile', 'spam', 'impersonation', 'other');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');
exception
  when duplicate_object then null;
end $$;

create table if not exists guild_settings (
  guild_id text primary key,
  admin_log_channel_id text,
  moderator_role_id text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_profiles (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  discord_user_id text not null,
  display_name text not null check (char_length(display_name) between 1 and 80),
  bio text not null default '' check (char_length(bio) <= 500),
  pronouns text check (pronouns is null or char_length(pronouns) <= 40),
  age_range text check (age_range is null or char_length(age_range) <= 40),
  status profile_status not null default 'draft',
  paused_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guild_id, discord_user_id)
);

create table if not exists profile_actions (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  actor_profile_id uuid not null references user_profiles(id) on delete cascade,
  target_profile_id uuid not null references user_profiles(id) on delete cascade,
  action profile_action_type not null,
  created_at timestamptz not null default now(),
  check (actor_profile_id <> target_profile_id),
  unique (actor_profile_id, target_profile_id)
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  profile_a_id uuid not null references user_profiles(id) on delete cascade,
  profile_b_id uuid not null references user_profiles(id) on delete cascade,
  status match_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (profile_a_id < profile_b_id),
  unique (profile_a_id, profile_b_id)
);

create table if not exists user_blocks (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  blocker_profile_id uuid not null references user_profiles(id) on delete cascade,
  blocked_profile_id uuid not null references user_profiles(id) on delete cascade,
  reason text check (reason is null or char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  check (blocker_profile_id <> blocked_profile_id),
  unique (blocker_profile_id, blocked_profile_id)
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  reporter_profile_id uuid not null references user_profiles(id) on delete cascade,
  reported_profile_id uuid not null references user_profiles(id) on delete cascade,
  category report_category not null,
  description text check (description is null or char_length(description) <= 1000),
  status report_status not null default 'open',
  resolved_by_discord_user_id text,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reporter_profile_id <> reported_profile_id)
);

create table if not exists admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  actor_discord_user_id text,
  action text not null check (char_length(action) between 1 and 120),
  target_profile_id uuid references user_profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists interaction_rate_limits (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  discord_user_id text not null,
  bucket text not null,
  count integer not null default 0 check (count >= 0),
  window_start timestamptz not null,
  updated_at timestamptz not null default now(),
  unique (guild_id, discord_user_id, bucket, window_start)
);

create index if not exists idx_user_profiles_guild_status on user_profiles (guild_id, status);
create index if not exists idx_profile_actions_actor on profile_actions (actor_profile_id, created_at desc);
create index if not exists idx_profile_actions_target on profile_actions (target_profile_id, created_at desc);
create index if not exists idx_matches_guild_status on matches (guild_id, status);
create index if not exists idx_user_blocks_blocker on user_blocks (blocker_profile_id);
create index if not exists idx_user_blocks_blocked on user_blocks (blocked_profile_id);
create index if not exists idx_reports_guild_status on reports (guild_id, status, created_at desc);
create index if not exists idx_admin_audit_logs_guild_created on admin_audit_logs (guild_id, created_at desc);
