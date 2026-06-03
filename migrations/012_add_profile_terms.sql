alter table user_profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

create index if not exists idx_user_profiles_terms
  on user_profiles (guild_id, discord_user_id, terms_version)
  where status <> 'deleted';
