alter table guild_settings
  add column if not exists profile_review_required boolean not null default false;

alter table user_profiles
  add column if not exists age integer check (age is null or age >= 18),
  add column if not exists looking_for text[] not null default '{}'::text[],
  add column if not exists receive_dm boolean not null default false,
  add column if not exists avatar_url text,
  add column if not exists consented_at timestamptz;

alter table user_profiles
  add constraint user_profiles_looking_for_allowed
  check (
    looking_for <@ array[
      'Romance',
      'Amizades',
      'Jogos',
      'Filmes e Séries',
      'Música',
      'Call e Conversa'
    ]::text[]
  ) not valid;

alter table user_profiles
  validate constraint user_profiles_looking_for_allowed;

create index if not exists idx_user_profiles_guild_user_status on user_profiles (guild_id, discord_user_id, status);
