import { ChannelType, type Client, type TextChannel } from 'discord.js';
import type { AppConfig } from '../../infrastructure/config.js';
import type { DatabasePool } from '../../infrastructure/database/client.js';
import type { Logger } from '../../infrastructure/logger.js';

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
    private readonly config: Pick<AppConfig, 'ADMIN_LOG_CHANNEL_ID'>,
    private readonly logger: Logger
  ) {}

  public async record(event: AdminLogEvent): Promise<void> {
    await this.persistAuditLog(event);
    await this.sendDiscordLog(event);
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
    const channelId = await this.getLogChannelId(event);
    if (!channelId) {
      this.logger.debug('Admin log channel not configured; skipping Discord admin log', { action: event.action });
      return;
    }

    const channel = await this.client.channels.fetch(channelId).catch((error: unknown) => {
      this.logger.warn('Failed to fetch admin log channel', { error: String(error) });
      return null;
    });

    if (!channel || channel.type !== ChannelType.GuildText) {
      this.logger.warn('Configured admin log channel is unavailable or not a text channel', {
        channelId
      });
      return;
    }

    const textChannel = channel as TextChannel;
    const summary = event.message ?? `Ação administrativa registrada: ${event.action}`;
    await textChannel.send({
      content: `🛡️ **SUÍNDER** — ${summary}`
    });
  }

  private async getLogChannelId(event: AdminLogEvent): Promise<string | undefined> {
    const result = await this.database.query<{ admin_log_channel_id: string | null; report_log_channel_id: string | null }>(
      'select admin_log_channel_id, report_log_channel_id from guild_settings where guild_id = $1 limit 1',
      [event.guildId]
    );

    const settings = result.rows[0];
    const isReportEvent = event.action.includes('report') || event.action.includes('denuncia');
    return (isReportEvent ? settings?.report_log_channel_id : undefined)
      ?? settings?.admin_log_channel_id
      ?? this.config.ADMIN_LOG_CHANNEL_ID;
  }
}
