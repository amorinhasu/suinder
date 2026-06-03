alter table guild_settings
  add column if not exists daily_like_limit integer not null default 30;

alter table guild_settings
  drop constraint if exists guild_settings_daily_like_limit_range;

alter table guild_settings
  add constraint guild_settings_daily_like_limit_range
  check (daily_like_limit between 1 and 500);
