import { Client, Collection, Events, GatewayIntentBits, type ChatInputCommandInteraction } from 'discord.js';
import type { AppContext } from '../application/context.js';
import type { AppConfig } from '../infrastructure/config.js';
import type { Logger } from '../infrastructure/logger.js';
import { handleSuinderButton, handleSuinderModalSubmit, handleSuinderSelectMenu } from './commands/suinder.js';
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
      if (interaction.isButton()) {
        context.logger.info('Button interaction received', {
          customId: interaction.customId,
          discordUserId: interaction.user.id,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          messageId: interaction.message.id
        });

        const handled = await handleSuinderButton(interaction, context);
        context.logger.info('Button interaction routed', {
          customId: interaction.customId,
          discordUserId: interaction.user.id,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          messageId: interaction.message.id,
          handled
        });

        if (handled) {
          return;
        }

        await interaction.reply({
          content: 'Este botão não está mais disponível. Use `/suinder iniciar` ou o painel mais recente do SUÍNDER.',
          ephemeral: true
        });
        return;
      }

      if (interaction.isStringSelectMenu()) {
        context.logger.info('String select interaction received', {
          customId: interaction.customId,
          discordUserId: interaction.user.id,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          messageId: interaction.message.id
        });

        const handled = await handleSuinderSelectMenu(interaction, context);
        context.logger.info('String select interaction routed', {
          customId: interaction.customId,
          discordUserId: interaction.user.id,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          messageId: interaction.message.id,
          handled
        });

        if (handled) {
          return;
        }

        await interaction.reply({
          content: 'Este menu não está mais disponível. Use `/suinder perfil` para abrir o painel mais recente.',
          ephemeral: true
        });
        return;
      }

      if (interaction.isModalSubmit() && await handleSuinderModalSubmit(interaction, context)) {
        return;
      }
    } catch (error) {
      context.logger.error('Failed to handle component interaction', {
        function: 'bindInteractionHandlers.InteractionCreate',
        customId: 'customId' in interaction ? interaction.customId : undefined,
        interactionType: interaction.type,
        discordUserId: interaction.user.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        messageId: 'message' in interaction ? interaction.message.id : undefined,
        replied: interaction.isRepliable() ? interaction.replied : undefined,
        deferred: interaction.isRepliable() ? interaction.deferred : undefined,
        error: serializeErrorForLog(error)
      });

      if (interaction.isRepliable()) {
        const response = { content: 'Erro interno ao processar a interação. Tente novamente mais tarde.', ephemeral: true };
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(response);
            return;
          }
          await interaction.reply(response);
        } catch (replyError) {
          context.logger.error('Failed to send component error response', {
            function: 'bindInteractionHandlers.InteractionCreate',
            operation: interaction.replied || interaction.deferred ? 'interaction.followUp' : 'interaction.reply',
            customId: 'customId' in interaction ? interaction.customId : undefined,
            discordUserId: interaction.user.id,
            guildId: interaction.guildId,
            channelId: interaction.channelId,
            messageId: 'message' in interaction ? interaction.message.id : undefined,
            error: serializeErrorForLog(replyError)
          });
        }
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
      function: 'handleChatInputCommand',
      commandName: interaction.commandName,
      discordUserId: interaction.user.id,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      replied: interaction.replied,
      deferred: interaction.deferred,
      error: serializeErrorForLog(error)
    });

    const response = { content: 'Erro interno ao executar o comando. Tente novamente mais tarde.', ephemeral: true };

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(response);
        return;
      }

      await interaction.reply(response);
    } catch (replyError) {
      context.logger.error('Failed to send slash command error response', {
        function: 'handleChatInputCommand',
        operation: interaction.replied || interaction.deferred ? 'interaction.followUp' : 'interaction.reply',
        commandName: interaction.commandName,
        discordUserId: interaction.user.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        error: serializeErrorForLog(replyError)
      });
    }
  }
}


function serializeErrorForLog(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }

  const maybeDiscordError = error as Error & { code?: unknown; status?: unknown; method?: unknown; url?: unknown; requestBody?: unknown };
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    code: maybeDiscordError.code,
    status: maybeDiscordError.status,
    method: maybeDiscordError.method,
    url: maybeDiscordError.url,
    requestBody: maybeDiscordError.requestBody
  };
}

export async function startDiscordClient(client: Client, config: Pick<AppConfig, 'DISCORD_TOKEN'>): Promise<void> {
  await client.login(config.DISCORD_TOKEN);
}
