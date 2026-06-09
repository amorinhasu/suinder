create table if not exists user_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  discord_user_id text not null,
  terms_version text not null check (char_length(terms_version) between 1 and 40),
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (guild_id, discord_user_id, terms_version)
);

create index if not exists idx_user_terms_acceptances_current
  on user_terms_acceptances (guild_id, discord_user_id, terms_version);

insert into user_terms_acceptances (guild_id, discord_user_id, terms_version, accepted_at, created_at)
select guild_id, discord_user_id, terms_version, terms_accepted_at, least(terms_accepted_at, created_at)
from user_profiles
where terms_accepted_at is not null
  and terms_version is not null
on conflict (guild_id, discord_user_id, terms_version) do nothing;
