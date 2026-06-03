alter table guild_settings
  add column if not exists report_log_channel_id text,
  add column if not exists match_enabled boolean not null default true,
  add column if not exists reports_enabled boolean not null default true;

alter table guild_settings
  drop constraint if exists guild_settings_pass_expiration_days_range,
  add constraint guild_settings_pass_expiration_days_range
  check (pass_expiration_days between 1 and 365) not valid;

alter table guild_settings
  validate constraint guild_settings_pass_expiration_days_range;
