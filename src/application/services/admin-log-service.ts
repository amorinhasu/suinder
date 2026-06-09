import { ChannelType, EmbedBuilder, type Client, type TextChannel } from 'discord.js';
import { DEFAULT_ADMIN_LOG_CHANNEL_ID, type AppConfig } from '../../infrastructure/config.js';
import type { DatabasePool } from '../../infrastructure/database/client.js';
import type { Logger } from '../../infrastructure/logger.js';

const SUINDER_LOG_COLOR = 0x1f8f5f;

export interface AdminLogEvent {
  guildId: string;
  action: string;
  actorDiscordUserId?: string;
  targetProfileId?: string;
  metadata?: Record<string, unknown>;
  message?: string;
}

export class AdminLogService {
  public constructor(
    private readonly client: Client,
    private readonly database: DatabasePool,
    private readonly config: Pick<AppConfig, 'SUINDER_LOG_CHANNEL' | 'ADMIN_LOG_CHANNEL_ID'>,
    private readonly logger: Logger
  ) {}

  public async record(event: AdminLogEvent): Promise<void> {
    this.logger.debug('Recording SUINDER admin audit log', {
      function: 'AdminLogService.record',
      guildId: event.guildId,
      action: event.action,
      targetProfileId: event.targetProfileId
    });

    await this.persistAuditLog(event);

    try {
      await this.sendDiscordLog(event);
    } catch (error) {
      this.logger.error('Failed to send SUINDER admin audit log to Discord', {
        function: 'AdminLogService.record',
        operation: 'sendDiscordLog',
        guildId: event.guildId,
        action: event.action,
        targetProfileId: event.targetProfileId,
        error: serializeErrorForLog(error)
      });
    }
  }

  private async persistAuditLog(event: AdminLogEvent): Promise<void> {
    await this.database.query(
      `
        insert into admin_audit_logs (
          guild_id,
          actor_discord_user_id,
          action,
          target_profile_id,
          metadata
        ) values ($1, $2, $3, $4, $5::jsonb)
      `,
      [
        event.guildId,
        event.actorDiscordUserId ?? null,
        event.action,
        event.targetProfileId ?? null,
        JSON.stringify(event.metadata ?? {})
      ]
    );
  }

  private async sendDiscordLog(event: AdminLogEvent): Promise<void> {
    const channelIds = await this.getLogChannelIds(event);
    if (channelIds.length === 0) {
      this.logger.debug('Admin log channel not configured; skipping Discord admin log', {
        function: 'AdminLogService.sendDiscordLog',
        action: event.action,
        guildId: event.guildId
      });
      return;
    }

    for (const channelId of channelIds) {
      const delivered = await this.sendDiscordLogToChannel(event, channelId);
      if (delivered) {
        return;
      }
    }

    this.logger.warn('No configured SUINDER admin log channel accepted the Discord log', {
      function: 'AdminLogService.sendDiscordLog',
      guildId: event.guildId,
      action: event.action,
      channelIds
    });
  }

  private async sendDiscordLogToChannel(event: AdminLogEvent, channelId: string): Promise<boolean> {
    this.logger.debug('Fetching SUINDER admin log channel', {
      function: 'AdminLogService.sendDiscordLogToChannel',
      operation: 'client.channels.fetch',
      guildId: event.guildId,
      action: event.action,
      channelId
    });

    const channel = await this.client.channels.fetch(channelId).catch((error: unknown) => {
      this.logger.warn('Failed to fetch admin log channel', {
        function: 'AdminLogService.sendDiscordLogToChannel',
        operation: 'client.channels.fetch',
        guildId: event.guildId,
        action: event.action,
        channelId,
        error: serializeErrorForLog(error)
      });
      return null;
    });

    if (!channel || channel.type !== ChannelType.GuildText) {
      this.logger.warn('Configured admin log channel is unavailable or not a text channel', {
        function: 'AdminLogService.sendDiscordLogToChannel',
        guildId: event.guildId,
        action: event.action,
        channelId,
        channelType: channel?.type
      });
      return false;
    }

    const textChannel = channel as TextChannel;
    this.logger.debug('Sending SUINDER admin log embed', {
      function: 'AdminLogService.sendDiscordLogToChannel',
      operation: 'TextChannel.send',
      guildId: event.guildId,
      action: event.action,
      channelId: textChannel.id
    });

    try {
      await textChannel.send({
        embeds: [buildAdminLogEmbed(event)]
      });
      return true;
    } catch (error) {
      this.logger.error('Failed to send SUINDER admin log message', {
        function: 'AdminLogService.sendDiscordLogToChannel',
        operation: 'TextChannel.send',
        guildId: event.guildId,
        action: event.action,
        channelId: textChannel.id,
        error: serializeErrorForLog(error)
      });
      return false;
    }
  }

  private async getLogChannelIds(event: AdminLogEvent): Promise<string[]> {
    const result = await this.database.query<{ admin_log_channel_id: string | null; report_log_channel_id: string | null }>(
      'select admin_log_channel_id, report_log_channel_id from guild_settings where guild_id = $1 limit 1',
      [event.guildId]
    );

    const settings = result.rows[0];
    const isReportEvent = event.action.includes('report') || event.action.includes('denuncia');
    return uniqueChannelIds([
      isReportEvent ? settings?.report_log_channel_id : undefined,
      settings?.admin_log_channel_id,
      this.config.SUINDER_LOG_CHANNEL,
      this.config.ADMIN_LOG_CHANNEL_ID,
      DEFAULT_ADMIN_LOG_CHANNEL_ID
    ]);
  }
}

function uniqueChannelIds(channelIds: Array<string | null | undefined>): string[] {
  return Array.from(new Set(channelIds.filter((channelId): channelId is string => Boolean(channelId))));
}

function buildAdminLogEmbed(event: AdminLogEvent): EmbedBuilder {
  const summary = event.message ?? `Ação administrativa registrada: ${event.action}.`;
  const embed = new EmbedBuilder()
    .setColor(SUINDER_LOG_COLOR)
    .setTitle(getLogTitle(event.action))
    .setDescription(summary)
    .addFields(
      { name: 'Evento', value: `\`${event.action}\``, inline: true },
      { name: 'Servidor', value: event.guildId, inline: true },
      { name: 'Data', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
    )
    .setTimestamp(new Date())
    .setFooter({ text: 'SUÍNDER • Auditoria' });

  if (event.actorDiscordUserId) {
    embed.addFields({ name: 'Executor', value: `<@${event.actorDiscordUserId}>`, inline: true });
  }

  if (event.targetProfileId) {
    embed.addFields({ name: 'Perfil alvo', value: `\`${event.targetProfileId}\``, inline: true });
  }

  const metadataSummary = summarizeMetadata(event.metadata);
  if (metadataSummary) {
    embed.addFields({ name: 'Contexto', value: metadataSummary, inline: false });
  }

  return embed;
}

function getLogTitle(action: string): string {
  if (action.includes('report')) {
    return '🛡️ Denúncia / moderação';
  }

  if (action.startsWith('admin.')) {
    return '🛠️ Ação administrativa';
  }

  if (action.startsWith('match.')) {
    return action === 'match.super_created' ? '⭐✨ Super Match criado' : '✨ Match atualizado';
  }

  if (action.startsWith('profile.')) {
    return '💚 Perfil SUÍNDER';
  }

  return '🛡️ Log SUÍNDER';
}

function summarizeMetadata(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata || Object.keys(metadata).length === 0) {
    return null;
  }

  const safeEntries = Object.entries(metadata)
    .filter(([key]) => !key.toLowerCase().includes('description'))
    .slice(0, 6)
    .map(([key, value]) => `**${key}:** ${formatMetadataValue(value)}`);

  return safeEntries.length > 0 ? safeEntries.join('\n').slice(0, 1000) : null;
}

function formatMetadataValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'n/a';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return JSON.stringify(value).slice(0, 120);
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
