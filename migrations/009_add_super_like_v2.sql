alter table guild_settings
  add column if not exists super_like_enabled boolean not null default true;

alter table matches
  add column if not exists is_super_match boolean not null default false;

create table if not exists super_like_usages (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  actor_discord_user_id text not null,
  actor_profile_id uuid not null references user_profiles(id) on delete restrict,
  target_profile_id uuid not null references user_profiles(id) on delete restrict,
  week_start timestamptz not null,
  created_at timestamptz not null default now(),
  check (actor_profile_id <> target_profile_id),
  unique (guild_id, actor_discord_user_id, week_start)
);

create index if not exists idx_super_like_usages_actor_week
  on super_like_usages (guild_id, actor_discord_user_id, week_start desc);

create index if not exists idx_profile_actions_super_like
  on profile_actions (actor_profile_id, target_profile_id, created_at desc)
  where action = 'super_like';
