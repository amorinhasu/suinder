update guild_settings
set admin_log_channel_id = '1513997908138266866',
    updated_at = now()
where admin_log_channel_id is null;
