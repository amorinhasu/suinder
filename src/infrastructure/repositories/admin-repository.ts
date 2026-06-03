import type { CompatibilityAnswers, LookingForOption, ProfileStatus, UserProfile } from '../../domain/profile.js';
import type { DatabasePool } from '../database/client.js';
import type { MatchStatus } from './profile-repository.js';

export interface AdminDashboardStats {
  activeProfiles: number;
  pendingProfiles: number;
  suspendedProfiles: number;
  bannedProfiles: number;
  activeMatches: number;
  openReports: number;
  resolvedReports: number;
  dailyLikeLimit: number;
}

export interface AdminGuildSettings {
  guildId: string;
  adminLogChannelId: string | null;
  reportLogChannelId: string | null;
  moderatorRoleId: string | null;
  profileReviewRequired: boolean;
  passExpirationDays: number;
  matchEnabled: boolean;
  reportsEnabled: boolean;
  superLikeEnabled: boolean;
  dailyLikeLimit: number;
}

export interface AdminReportSummary {
  id: string;
  reporterProfileId: string;
  reportedProfileId: string;
  reportedDisplayName: string;
  category: string;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminProfileHistory {
  profile: UserProfile;
  reports: AdminReportSummary[];
  auditLogs: AdminAuditLogSummary[];
  matches: AdminMatchSummary[];
}

export interface AdminAuditLogSummary {
  action: string;
  actorDiscordUserId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface AdminMatchSummary {
  id: string;
  status: MatchStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface CountRow {
  count: string;
}

interface DashboardRow {
  active_profiles: string;
  pending_profiles: string;
  suspended_profiles: string;
  banned_profiles: string;
  active_matches: string;
  open_reports: string;
  resolved_reports: string;
  daily_like_limit: number;
}

interface SettingsRow {
  guild_id: string;
  admin_log_channel_id: string | null;
  report_log_channel_id: string | null;
  moderator_role_id: string | null;
  profile_review_required: boolean;
  pass_expiration_days: number;
  match_enabled: boolean;
  reports_enabled: boolean;
  super_like_enabled: boolean;
  daily_like_limit: number;
}

interface ProfileRow {
  id: string;
  guild_id: string;
  discord_user_id: string;
  display_name: string;
  age: number | null;
  bio: string;
  looking_for: LookingForOption[];
  compatibility_answers: CompatibilityAnswers;
  terms_accepted_at: Date | null;
  terms_version: string | null;
  receive_dm: boolean;
  avatar_url: string | null;
  status: ProfileStatus;
  consented_at: Date | null;
  created_at: Date;
  updated_at: Date;
  paused_at: Date | null;
}

interface ReportRow {
  id: string;
  reporter_profile_id: string;
  reported_profile_id: string;
  reported_display_name: string;
  category: string;
  description: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

interface AuditRow {
  action: string;
  actor_discord_user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

interface MatchRow {
  id: string;
  status: MatchStatus;
  created_at: Date;
  updated_at: Date;
}

export class AdminRepository {
  public constructor(private readonly database: DatabasePool) {}

  public async getDashboardStats(guildId: string): Promise<AdminDashboardStats> {
    const result = await this.database.query<DashboardRow>(
      `
        select
          count(*) filter (where status = 'active') as active_profiles,
          count(*) filter (where status = 'pending_review') as pending_profiles,
          count(*) filter (where status = 'suspended') as suspended_profiles,
          count(*) filter (where status = 'banned') as banned_profiles,
          (select count(*) from matches where guild_id = $1 and status = 'active') as active_matches,
          (select count(*) from reports where guild_id = $1 and status in ('open', 'reviewing')) as open_reports,
          (select count(*) from reports where guild_id = $1 and status in ('resolved', 'dismissed')) as resolved_reports,
          coalesce((select daily_like_limit from guild_settings where guild_id = $1), 30) as daily_like_limit
        from user_profiles
        where guild_id = $1
      `,
      [guildId]
    );

    const row = result.rows[0];
    return {
      activeProfiles: toNumber(row?.active_profiles),
      pendingProfiles: toNumber(row?.pending_profiles),
      suspendedProfiles: toNumber(row?.suspended_profiles),
      bannedProfiles: toNumber(row?.banned_profiles),
      activeMatches: toNumber(row?.active_matches),
      openReports: toNumber(row?.open_reports),
      resolvedReports: toNumber(row?.resolved_reports),
      dailyLikeLimit: row?.daily_like_limit ?? 30
    };
  }

  public async findSettings(guildId: string): Promise<AdminGuildSettings | null> {
    const result = await this.database.query<SettingsRow>(
      `
        select *
        from guild_settings
        where guild_id = $1
        limit 1
      `,
      [guildId]
    );

    return result.rows[0] ? mapSettingsRow(result.rows[0]) : null;
  }

  public async getOrCreateSettings(guildId: string): Promise<AdminGuildSettings> {
    const result = await this.database.query<SettingsRow>(
      `
        insert into guild_settings (guild_id)
        values ($1)
        on conflict (guild_id) do update set updated_at = guild_settings.updated_at
        returning *
      `,
      [guildId]
    );

    return mapSettingsRow(requireSettingsRow(result.rows[0]));
  }

  public async updateSetting(guildId: string, key: string, value: string): Promise<AdminGuildSettings> {
    const allowedColumns = new Map<string, string>([
      ['admin_log_channel_id', 'admin_log_channel_id'],
      ['report_log_channel_id', 'report_log_channel_id'],
      ['profile_review_required', 'profile_review_required'],
      ['pass_expiration_days', 'pass_expiration_days'],
      ['daily_like_limit', 'daily_like_limit'],
      ['match_enabled', 'match_enabled'],
      ['reports_enabled', 'reports_enabled'],
      ['super_like_enabled', 'super_like_enabled']
    ]);
    const column = allowedColumns.get(key);
    if (!column) {
      throw new Error('Configuração administrativa inválida.');
    }

    const parsedValue = parseSettingValue(key, value);
    const result = await this.database.query<SettingsRow>(
      `
        insert into guild_settings (guild_id, ${column})
        values ($1, $2)
        on conflict (guild_id) do update set
          ${column} = excluded.${column},
          updated_at = now()
        returning *
      `,
      [guildId, parsedValue]
    );

    return mapSettingsRow(requireSettingsRow(result.rows[0]));
  }

  public async findProfileById(guildId: string, profileId: string): Promise<UserProfile | null> {
    const result = await this.database.query<ProfileRow>(
      `
        select *
        from user_profiles
        where guild_id = $1
          and id = $2
          and status <> 'deleted'
        limit 1
      `,
      [guildId, profileId]
    );

    return result.rows[0] ? mapProfileRow(result.rows[0]) : null;
  }

  public async updateProfileStatus(guildId: string, profileId: string, status: Extract<ProfileStatus, 'active' | 'suspended' | 'banned'>): Promise<UserProfile> {
    const result = await this.database.query<ProfileRow>(
      `
        update user_profiles
        set status = $3,
            paused_at = case when $3 = 'suspended' then now() else null end,
            updated_at = now()
        where guild_id = $1
          and id = $2
          and status <> 'deleted'
        returning *
      `,
      [guildId, profileId, status]
    );

    const profile = result.rows[0];
    if (!profile) {
      throw new Error('Perfil não encontrado ou deletado.');
    }

    return mapProfileRow(profile);
  }

  public async listOpenReports(guildId: string, limit = 10): Promise<AdminReportSummary[]> {
    const result = await this.database.query<ReportRow>(
      `
        select report.*, reported.display_name as reported_display_name
        from reports report
        join user_profiles reported on reported.id = report.reported_profile_id
        where report.guild_id = $1
          and report.status in ('open', 'reviewing')
        order by report.created_at asc
        limit $2
      `,
      [guildId, limit]
    );

    return result.rows.map(mapReportRow);
  }

  public async findReportById(guildId: string, reportId: string): Promise<AdminReportSummary | null> {
    const result = await this.database.query<ReportRow>(
      `
        select report.*, reported.display_name as reported_display_name
        from reports report
        join user_profiles reported on reported.id = report.reported_profile_id
        where report.guild_id = $1
          and report.id = $2
        limit 1
      `,
      [guildId, reportId]
    );

    return result.rows[0] ? mapReportRow(result.rows[0]) : null;
  }

  public async resolveReport(guildId: string, reportId: string, actorDiscordUserId: string, note: string): Promise<AdminReportSummary> {
    const result = await this.database.query<ReportRow>(
      `
        update reports report
        set status = 'resolved',
            resolved_by_discord_user_id = $3,
            resolution_note = $4,
            updated_at = now()
        from user_profiles reported
        where report.guild_id = $1
          and report.id = $2
          and reported.id = report.reported_profile_id
        returning report.*, reported.display_name as reported_display_name
      `,
      [guildId, reportId, actorDiscordUserId, note]
    );

    const report = result.rows[0];
    if (!report) {
      throw new Error('Denúncia não encontrada.');
    }

    return mapReportRow(report);
  }

  public async getProfileHistory(guildId: string, profileId: string): Promise<AdminProfileHistory> {
    const profile = await this.findProfileById(guildId, profileId);
    if (!profile) {
      throw new Error('Perfil não encontrado.');
    }

    const reports = await this.database.query<ReportRow>(
      `
        select report.*, reported.display_name as reported_display_name
        from reports report
        join user_profiles reported on reported.id = report.reported_profile_id
        where report.guild_id = $1
          and (report.reporter_profile_id = $2 or report.reported_profile_id = $2)
        order by report.created_at desc
        limit 10
      `,
      [guildId, profileId]
    );

    const auditLogs = await this.database.query<AuditRow>(
      `
        select action, actor_discord_user_id, metadata, created_at
        from admin_audit_logs
        where guild_id = $1
          and target_profile_id = $2
        order by created_at desc
        limit 10
      `,
      [guildId, profileId]
    );

    const matches = await this.database.query<MatchRow>(
      `
        select id, status, created_at, updated_at
        from matches
        where guild_id = $1
          and (profile_a_id = $2 or profile_b_id = $2)
        order by created_at desc
        limit 10
      `,
      [guildId, profileId]
    );

    return {
      profile,
      reports: reports.rows.map(mapReportRow),
      auditLogs: auditLogs.rows.map(mapAuditRow),
      matches: matches.rows.map(mapMatchRow)
    };
  }
}

function parseSettingValue(key: string, value: string): string | number | boolean | null {
  const trimmed = value.trim();

  if (['admin_log_channel_id', 'report_log_channel_id'].includes(key)) {
    if (!trimmed || ['none', 'null', 'limpar'].includes(trimmed.toLowerCase())) {
      return null;
    }

    if (!/^\d+$/.test(trimmed)) {
      throw new Error('Canal precisa ser um ID numérico do Discord ou vazio para limpar.');
    }

    return trimmed;
  }

  if (['profile_review_required', 'match_enabled', 'reports_enabled', 'super_like_enabled'].includes(key)) {
    if (['true', 'sim', 's', '1', 'yes'].includes(trimmed.toLowerCase())) {
      return true;
    }
    if (['false', 'nao', 'não', 'n', '0', 'no'].includes(trimmed.toLowerCase())) {
      return false;
    }
    throw new Error('Valor booleano inválido. Use true/false ou sim/não.');
  }

  if (key === 'pass_expiration_days') {
    const days = Number.parseInt(trimmed, 10);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      throw new Error('Dias de expiração do pass deve ser inteiro entre 1 e 365.');
    }
    return days;
  }

  if (key === 'daily_like_limit') {
    const limit = Number.parseInt(trimmed, 10);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new Error('Limite diário de likes deve ser inteiro entre 1 e 500.');
    }
    return limit;
  }

  throw new Error('Configuração administrativa inválida.');
}

function requireSettingsRow(row: SettingsRow | undefined): SettingsRow {
  if (!row) {
    throw new Error('Configurações da guild não foram retornadas pelo banco.');
  }

  return row;
}

function mapSettingsRow(row: SettingsRow): AdminGuildSettings {
  return {
    guildId: row.guild_id,
    adminLogChannelId: row.admin_log_channel_id,
    reportLogChannelId: row.report_log_channel_id,
    moderatorRoleId: row.moderator_role_id,
    profileReviewRequired: row.profile_review_required,
    passExpirationDays: row.pass_expiration_days,
    matchEnabled: row.match_enabled,
    reportsEnabled: row.reports_enabled,
    superLikeEnabled: row.super_like_enabled,
    dailyLikeLimit: row.daily_like_limit
  };
}

function mapProfileRow(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    guildId: row.guild_id,
    discordUserId: row.discord_user_id,
    displayName: row.display_name,
    age: row.age,
    bio: row.bio,
    lookingFor: row.looking_for,
    compatibilityAnswers: row.compatibility_answers ?? {},
    termsAcceptedAt: row.terms_accepted_at,
    termsVersion: row.terms_version,
    receiveDm: row.receive_dm,
    avatarUrl: row.avatar_url,
    status: row.status,
    consentedAt: row.consented_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pausedAt: row.paused_at
  };
}

function mapReportRow(row: ReportRow): AdminReportSummary {
  return {
    id: row.id,
    reporterProfileId: row.reporter_profile_id,
    reportedProfileId: row.reported_profile_id,
    reportedDisplayName: row.reported_display_name,
    category: row.category,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAuditRow(row: AuditRow): AdminAuditLogSummary {
  return {
    action: row.action,
    actorDiscordUserId: row.actor_discord_user_id,
    metadata: row.metadata,
    createdAt: row.created_at
  };
}

function mapMatchRow(row: MatchRow): AdminMatchSummary {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toNumber(value: string | undefined): number {
  return Number.parseInt(value ?? '0', 10);
}
