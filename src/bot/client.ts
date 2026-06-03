import { Client, Collection, Events, GatewayIntentBits, type ChatInputCommandInteraction } from 'discord.js';
import type { AppContext } from '../application/context.js';
import type { AppConfig } from '../infrastructure/config.js';
import type { Logger } from '../infrastructure/logger.js';
import { handleSuinderButton, handleSuinderModalSubmit } from './commands/suinder.js';
import type { SlashCommand } from './commands/types.js';

export interface SuinderClient extends Client {
  commands: Collection<string, SlashCommand>;
}

export function createDiscordClient(commands: SlashCommand[], logger: Logger): SuinderClient {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  }) as SuinderClient;

  client.commands = new Collection(commands.map((command) => [command.data.name, command]));

  client.once(Events.ClientReady, (readyClient) => {
    logger.info('Discord client ready', { userTag: readyClient.user.tag });
  });

  return client;
}

export function bindInteractionHandlers(client: SuinderClient, contextFactory: () => AppContext): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    const context = contextFactory();

    if (interaction.isChatInputCommand()) {
      await handleChatInputCommand(interaction, client, context);
      return;
    }

    try {
      if (interaction.isButton() && await handleSuinderButton(interaction, context)) {
        return;
      }

      if (interaction.isModalSubmit() && await handleSuinderModalSubmit(interaction, context)) {
        return;
      }
    } catch (error) {
      context.logger.error('Failed to handle component interaction', {
        error: error instanceof Error ? error.message : String(error)
      });

      if (interaction.isRepliable()) {
        const response = { content: 'Erro interno ao processar a interação. Tente novamente mais tarde.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(response);
          return;
        }
        await interaction.reply(response);
      }
    }
  });
}

async function handleChatInputCommand(
  interaction: ChatInputCommandInteraction,
  client: SuinderClient,
  context: AppContext
): Promise<void> {
  const command = client.commands.get(interaction.commandName);

  if (!command) {
    context.logger.warn('Received unknown slash command', { commandName: interaction.commandName });
    await interaction.reply({ content: 'Comando não reconhecido pelo SUÍNDER.', ephemeral: true });
    return;
  }

  try {
    await command.execute(interaction, context);
  } catch (error) {
    context.logger.error('Failed to execute slash command', {
      commandName: interaction.commandName,
      error: error instanceof Error ? error.message : String(error)
    });

    const response = { content: 'Erro interno ao executar o comando. Tente novamente mais tarde.', ephemeral: true };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(response);
      return;
    }

    await interaction.reply(response);
  }
}

export async function startDiscordClient(client: Client, config: Pick<AppConfig, 'DISCORD_TOKEN'>): Promise<void> {
  await client.login(config.DISCORD_TOKEN);
}
