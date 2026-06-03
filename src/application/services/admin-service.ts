import type { AdminLogService } from './admin-log-service.js';
import type {
  AdminDashboardStats,
  AdminGuildSettings,
  AdminProfileHistory,
  AdminReportSummary,
  AdminRepository
} from '../../infrastructure/repositories/admin-repository.js';
import type { UserProfile } from '../../domain/profile.js';

export type AdminProfileAction = 'approve' | 'suspend' | 'ban' | 'reactivate';
export type AdminReportAction = 'resolve' | 'suspend_user' | 'ban_user';

export class AdminService {
  public constructor(
    private readonly adminRepository: AdminRepository,
    private readonly adminLogs: AdminLogService
  ) {}

  public async getDashboard(guildId: string, actorDiscordUserId: string): Promise<AdminDashboardStats> {
    await this.recordAdminAction(guildId, actorDiscordUserId, 'admin.dashboard.viewed', undefined, {});
    return this.adminRepository.getDashboardStats(guildId);
  }

  public async getSettings(guildId: string): Promise<AdminGuildSettings> {
    return this.adminRepository.getOrCreateSettings(guildId);
  }

  public async findSettings(guildId: string): Promise<AdminGuildSettings | null> {
    return this.adminRepository.findSettings(guildId);
  }

  public async viewSettings(guildId: string, actorDiscordUserId: string): Promise<AdminGuildSettings> {
    await this.recordAdminAction(guildId, actorDiscordUserId, 'admin.config.viewed', undefined, {});
    return this.adminRepository.getOrCreateSettings(guildId);
  }

  public async updateSetting(guildId: string, actorDiscordUserId: string, key: string, value: string): Promise<AdminGuildSettings> {
    const settings = await this.adminRepository.updateSetting(guildId, key, value);
    await this.recordAdminAction(guildId, actorDiscordUserId, 'admin.config.updated', undefined, { key, value: sanitizeConfigValue(key, value) });
    return settings;
  }

  public async moderateProfile(
    guildId: string,
    actorDiscordUserId: string,
    targetProfileId: string,
    action: AdminProfileAction
  ): Promise<UserProfile> {
    const targetProfile = await this.adminRepository.findProfileById(guildId, targetProfileId);
    if (!targetProfile) {
      throw new Error('Perfil inexistente.');
    }

    if (targetProfile.discordUserId === actorDiscordUserId && ['suspend', 'ban'].includes(action)) {
      throw new Error('Você não pode suspender ou banir o próprio perfil.');
    }

    const status = action === 'ban'
      ? 'banned'
      : action === 'suspend'
        ? 'suspended'
        : 'active';
    const updatedProfile = await this.adminRepository.updateProfileStatus(guildId, targetProfileId, status);
    await this.recordAdminAction(guildId, actorDiscordUserId, `admin.profile.${action}`, targetProfileId, {
      previousStatus: targetProfile.status,
      status: updatedProfile.status
    });

    return updatedProfile;
  }

  public async getProfileHistory(guildId: string, actorDiscordUserId: string, profileId: string): Promise<AdminProfileHistory> {
    const history = await this.adminRepository.getProfileHistory(guildId, profileId);
    await this.recordAdminAction(guildId, actorDiscordUserId, 'admin.profile.history_viewed', profileId, {});
    return history;
  }

  public async listOpenReports(guildId: string, actorDiscordUserId: string): Promise<AdminReportSummary[]> {
    await this.recordAdminAction(guildId, actorDiscordUserId, 'admin.reports.listed', undefined, {});
    return this.adminRepository.listOpenReports(guildId);
  }

  public async getReportDetails(guildId: string, actorDiscordUserId: string, reportId: string): Promise<AdminReportSummary> {
    const report = await this.adminRepository.findReportById(guildId, reportId);
    if (!report) {
      throw new Error('Denúncia não encontrada.');
    }

    await this.recordAdminAction(guildId, actorDiscordUserId, 'admin.report.viewed', report.reportedProfileId, { reportId });
    return report;
  }

  public async moderateReport(
    guildId: string,
    actorDiscordUserId: string,
    reportId: string,
    action: AdminReportAction,
    note: string
  ): Promise<AdminReportSummary> {
    const report = await this.adminRepository.findReportById(guildId, reportId);
    if (!report) {
      throw new Error('Denúncia não encontrada.');
    }

    const targetProfile = await this.adminRepository.findProfileById(guildId, report.reportedProfileId);
    if (!targetProfile) {
      throw new Error('Perfil denunciado inexistente.');
    }

    if (targetProfile.discordUserId === actorDiscordUserId && ['suspend_user', 'ban_user'].includes(action)) {
      throw new Error('Você não pode suspender ou banir o próprio perfil via denúncia.');
    }

    if (action === 'suspend_user') {
      await this.adminRepository.updateProfileStatus(guildId, report.reportedProfileId, 'suspended');
    }
    if (action === 'ban_user') {
      await this.adminRepository.updateProfileStatus(guildId, report.reportedProfileId, 'banned');
    }

    const resolved = await this.adminRepository.resolveReport(guildId, reportId, actorDiscordUserId, note || `Ação administrativa: ${action}`);
    await this.recordAdminAction(guildId, actorDiscordUserId, `admin.report.${action}`, report.reportedProfileId, { reportId, noteProvided: Boolean(note) });
    return resolved;
  }

  private async recordAdminAction(
    guildId: string,
    actorDiscordUserId: string,
    action: string,
    targetProfileId: string | undefined,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await this.adminLogs.record({
      guildId,
      action,
      actorDiscordUserId,
      targetProfileId,
      metadata: { ...metadata, executedAt: new Date().toISOString() },
      message: `Ação administrativa registrada: ${action}.`
    });
  }
}

function sanitizeConfigValue(key: string, value: string): string | boolean {
  if (key.includes('channel_id')) {
    return value ? 'configured' : 'cleared';
  }
  return value;
}
