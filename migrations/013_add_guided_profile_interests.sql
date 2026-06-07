alter table user_profiles
  drop constraint if exists user_profiles_looking_for_allowed,
  drop constraint if exists user_profiles_active_profile_complete;

update user_profiles
set looking_for = coalesce(array(
  select guided_interest
  from unnest(array[
    'Jogos',
    'Filmes e Séries',
    'Música',
    'Conversar',
    'Livros',
    'Romance',
    'Amizade',
    'Calls',
    'Arte',
    'Memes'
  ]::text[]) as guided_interest
  where case guided_interest
    when 'Conversar' then looking_for && array['Conversar', 'Call e Conversa']::text[]
    when 'Amizade' then looking_for && array['Amizade', 'Amizades']::text[]
    when 'Calls' then looking_for && array['Calls', 'Call e Conversa']::text[]
    else guided_interest = any(looking_for)
  end
  limit 5
), '{}'::text[])
where looking_for is not null;

alter table user_profiles
  add constraint user_profiles_looking_for_allowed
  check (
    looking_for <@ array[
      'Jogos',
      'Filmes e Séries',
      'Música',
      'Conversar',
      'Livros',
      'Romance',
      'Amizade',
      'Calls',
      'Arte',
      'Memes'
    ]::text[]
    and cardinality(looking_for) <= 5
  ) not valid;

alter table user_profiles
  add constraint user_profiles_active_profile_complete
  check (
    status in ('deleted', 'suspended', 'banned')
    or (
      age >= 18
      and consented_at is not null
      and looking_for <@ array[
        'Jogos',
        'Filmes e Séries',
        'Música',
        'Conversar',
        'Livros',
        'Romance',
        'Amizade',
        'Calls',
        'Arte',
        'Memes'
      ]::text[]
      and cardinality(looking_for) <= 5
    )
  ) not valid;

alter table user_profiles
  validate constraint user_profiles_looking_for_allowed;

alter table user_profiles
  validate constraint user_profiles_active_profile_complete;
