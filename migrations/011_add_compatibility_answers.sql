alter table user_profiles
  add column if not exists compatibility_answers jsonb not null default '{}'::jsonb;

alter table user_profiles
  drop constraint if exists user_profiles_compatibility_answers_object;

alter table user_profiles
  add constraint user_profiles_compatibility_answers_object
  check (jsonb_typeof(compatibility_answers) = 'object');
