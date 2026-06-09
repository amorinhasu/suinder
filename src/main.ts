import { AdminLogService } from './application/services/admin-log-service.js';
import { AdminService } from './application/services/admin-service.js';
import { ProfileService } from './application/services/profile-service.js';
import { bindInteractionHandlers, createDiscordClient, startDiscordClient } from './bot/client.js';
import { loadSlashCommands } from './bot/commands/index.js';
import { registerGuildSlashCommands } from './bot/register-commands.js';
import { DEFAULT_ADMIN_LOG_CHANNEL_ID, loadConfig } from './infrastructure/config.js';
import { assertDatabaseConnection, createDatabasePool } from './infrastructure/database/client.js';
import { createLogger } from './infrastructure/logger.js';
import { AdminRepository } from './infrastructure/repositories/admin-repository.js';
import { ProfileRepository } from './infrastructure/repositories/profile-repository.js';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL);
  const database = createDatabasePool(config);
  const commands = loadSlashCommands();
  const client = createDiscordClient(commands, logger);
  const adminLogs = new AdminLogService(client, database, config, logger);
  const profileRepository = new ProfileRepository(database);
  const adminRepository = new AdminRepository(database);
  const profiles = new ProfileService(profileRepository, adminLogs);
  const admin = new AdminService(adminRepository, adminLogs);

  await assertDatabaseConnection(database);
  const settings = await adminRepository.ensureDefaultAdminLogChannel(config.DISCORD_GUILD_ID, DEFAULT_ADMIN_LOG_CHANNEL_ID);
  logger.info('Ensured SUINDER default admin log channel', {
    guildId: config.DISCORD_GUILD_ID,
    adminLogChannelId: settings.adminLogChannelId
  });
  await registerGuildSlashCommands(config, commands, logger);

  bindInteractionHandlers(client, () => ({
    client,
    config,
    database,
    logger,
    adminLogs,
    admin,
    profiles
  }));

  process.once('SIGINT', () => {
    logger.info('Received SIGINT, shutting down');
    void shutdown(client, database);
  });

  process.once('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down');
    void shutdown(client, database);
  });

  await startDiscordClient(client, config);
}

async function shutdown(client: { destroy(): void }, database: { end(): Promise<void> }): Promise<void> {
  client.destroy();
  await database.end();
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
