import { REST, Routes } from 'discord.js';
import type { AppConfig } from '../infrastructure/config.js';
import type { Logger } from '../infrastructure/logger.js';
import type { SlashCommand } from './commands/types.js';

export async function registerGuildSlashCommands(
  config: Pick<AppConfig, 'DISCORD_TOKEN' | 'DISCORD_CLIENT_ID' | 'DISCORD_GUILD_ID'>,
  commands: SlashCommand[],
  logger: Logger
): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
  const body = commands.map((command) => command.data.toJSON());

  await rest.put(Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID), { body });
  logger.info('Registered guild slash commands', { count: body.length, guildId: config.DISCORD_GUILD_ID });
}
