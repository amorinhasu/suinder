alter table guild_settings
  add column if not exists pass_expiration_days integer not null default 30
  check (pass_expiration_days > 0 and pass_expiration_days <= 365);

alter table profile_actions
  add column if not exists expires_at timestamptz;

update profile_actions
set expires_at = coalesce(expires_at, created_at + interval '30 days')
where action = 'pass';

alter table profile_actions
  drop constraint if exists profile_actions_pass_expiration,
  add constraint profile_actions_pass_expiration
  check (
    (action = 'pass' and expires_at is not null)
    or (action <> 'pass')
  ) not valid;

alter table profile_actions
  validate constraint profile_actions_pass_expiration;

create index if not exists idx_profile_actions_pass_valid
  on profile_actions (actor_profile_id, target_profile_id, expires_at)
  where action = 'pass';
