import { readFile } from 'node:fs/promises';
import process from 'node:process';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const command = await readFile('src/bot/commands/suinder-admin.ts', 'utf8');
  const index = await readFile('src/bot/commands/index.ts', 'utf8');
  const service = await readFile('src/application/services/admin-service.ts', 'utf8');
  const repository = await readFile('src/infrastructure/repositories/admin-repository.ts', 'utf8');
  const context = await readFile('src/application/context.ts', 'utf8');
  const adminLogService = await readFile('src/application/services/admin-log-service.ts', 'utf8');
  const main = await readFile('src/main.ts', 'utf8');
  const config = await readFile('src/infrastructure/config.ts', 'utf8');
  const migration = await readFile('migrations/007_add_admin_settings.sql', 'utf8');
  const defaultLogMigration = await readFile('migrations/014_configure_default_admin_log_channel.sql', 'utf8');

  const requiredCommandPieces = [
    ".setName('suinder-admin')",
    ".setName('dashboard')",
    ".setName('perfil')",
    ".setName('denuncias')",
    ".setName('config')",
    'PermissionFlagsBits.Administrator',
    'MODERATOR_ROLE_ID',
    'admin.access.denied',
    'findSettings(context.config.DISCORD_GUILD_ID)',
    'ephemeral: true',
    "value: 'approve'",
    "value: 'suspend'",
    "value: 'ban'",
    "value: 'reactivate'",
    "value: 'history'",
    "value: 'resolve'",
    "value: 'suspend_user'",
    "value: 'ban_user'",
    "value: 'admin_log_channel_id'",
    "value: 'report_log_channel_id'",
    "value: 'profile_review_required'",
    "value: 'pass_expiration_days'",
    "value: 'match_enabled'",
    "value: 'reports_enabled'"
  ];

  for (const piece of requiredCommandPieces) {
    assert(command.includes(piece), `Admin command missing required piece: ${piece}`);
  }

  assert(index.includes('suinderAdminCommand'), 'Admin command must be loaded by command loader');
  assert(context.includes('admin: AdminService'), 'AppContext must expose AdminService');
  assert(config.includes("DEFAULT_ADMIN_LOG_CHANNEL_ID = '1513997908138266866'"), 'Config must define the default SUINDER admin log channel');
  assert(config.includes('SUINDER_LOG_CHANNEL: optionalDiscordSnowflake'), 'Config must support SUINDER_LOG_CHANNEL for Square Cloud');
  assert(adminLogService.includes('getLogChannelIds') && adminLogService.includes('report_log_channel_id'), 'Admin log service must read configured log channels from guild settings');
  assert(adminLogService.includes('this.config.SUINDER_LOG_CHANNEL') && adminLogService.includes('this.config.ADMIN_LOG_CHANNEL_ID') && adminLogService.includes('DEFAULT_ADMIN_LOG_CHANNEL_ID'), 'Admin log service must use log-channel fallback order including SUINDER_LOG_CHANNEL and legacy ADMIN_LOG_CHANNEL_ID');
  assert(adminLogService.includes('Failed to send SUINDER admin audit log to Discord') && adminLogService.includes('Failed to send SUINDER admin log message'), 'Admin log Discord delivery failures must be logged without failing user flows');
  assert(adminLogService.includes('serializeErrorForLog(error)') && adminLogService.includes('stack: error.stack'), 'Admin log errors must include detailed stack traces');
  assert(adminLogService.includes("operation: 'TextChannel.send'") && adminLogService.includes('channelId: textChannel.id'), 'Admin log Discord send must log channel and operation context');
  assert(adminLogService.includes('EmbedBuilder') && adminLogService.includes('buildAdminLogEmbed') && adminLogService.includes('embeds: [buildAdminLogEmbed(event)]') && adminLogService.includes('uniqueChannelIds'), 'Admin logs must be sent as Discord embeds');
  assert(adminLogService.includes('SUINDER_LOG_COLOR = 0x1f8f5f'), 'Admin log embeds must use SUINDER green color');
  assert(main.includes('new AdminRepository(database)') && main.includes('new AdminService(adminRepository, adminLogs)'), 'Bootstrap must wire AdminRepository and AdminService');
  assert(main.includes('ensureDefaultAdminLogChannel(config.DISCORD_GUILD_ID, DEFAULT_ADMIN_LOG_CHANNEL_ID)'), 'Bootstrap must seed the default admin log channel for the main guild');

  const requiredRepositoryPieces = [
    'getDashboardStats',
    "count(*) filter (where status = 'active')",
    "count(*) filter (where status = 'pending_review')",
    "count(*) filter (where status = 'suspended')",
    "count(*) filter (where status = 'banned')",
    "from matches where guild_id = $1 and status = 'active'",
    "from reports where guild_id = $1 and status in ('open', 'reviewing')",
    "from reports where guild_id = $1 and status in ('resolved', 'dismissed')",
    'updateProfileStatus',
    'findSettings(guildId: string)',
    'ensureDefaultAdminLogChannel',
    'getProfileHistory',
    'listOpenReports',
    'resolveReport',
    'updateSetting',
    'report_log_channel_id',
    'match_enabled',
    'reports_enabled'
  ];

  for (const piece of requiredRepositoryPieces) {
    assert(repository.includes(piece), `Admin repository missing required piece: ${piece}`);
  }

  const requiredServicePieces = [
    'admin.dashboard.viewed',
    'admin.config.updated',
    'admin.config.viewed',
    'admin.profile.history_viewed',
    'admin.reports.listed',
    'admin.report.viewed',
    'targetProfile.discordUserId === actorDiscordUserId',
    "['suspend', 'ban'].includes(action)",
    "['suspend_user', 'ban_user'].includes(action)",
    'recordAdminAction',
    'executedAt: new Date().toISOString()'
  ];

  for (const piece of requiredServicePieces) {
    assert(service.includes(piece), `Admin service missing required piece: ${piece}`);
  }

  assert(migration.includes('report_log_channel_id'), 'Admin migration must add report log channel setting');
  assert(migration.includes('match_enabled'), 'Admin migration must add match feature toggle');
  assert(migration.includes('reports_enabled'), 'Admin migration must add reports feature toggle');
  assert(defaultLogMigration.includes("admin_log_channel_id = '1513997908138266866'"), 'Default admin log migration must configure the requested channel for existing guild settings');

  console.log('Validated admin command and moderation rules offline.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
