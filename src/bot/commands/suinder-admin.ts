import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildMemberRoleManager
} from 'discord.js';
import type { AppContext } from '../../application/context.js';
import type { AdminDashboardStats, AdminGuildSettings, AdminProfileHistory, AdminReportSummary } from '../../infrastructure/repositories/admin-repository.js';
import type { SlashCommand } from './types.js';

const profileActions = [
  { name: 'Aprovar perfil', value: 'approve' },
  { name: 'Suspender perfil', value: 'suspend' },
  { name: 'Banir perfil', value: 'ban' },
  { name: 'Reativar perfil', value: 'reactivate' },
  { name: 'Ver histórico', value: 'history' }
] as const;

const reportActions = [
  { name: 'Listar denúncias abertas', value: 'list' },
  { name: 'Ver detalhes', value: 'view' },
  { name: 'Marcar como resolvida', value: 'resolve' },
  { name: 'Suspender usuário denunciado', value: 'suspend_user' },
  { name: 'Banir usuário denunciado', value: 'ban_user' }
] as const;

const configKeys = [
  { name: 'Canal de logs', value: 'admin_log_channel_id' },
  { name: 'Canal de denúncias', value: 'report_log_channel_id' },
  { name: 'Aprovação manual de perfil', value: 'profile_review_required' },
  { name: 'Dias de expiração do pass', value: 'pass_expiration_days' },
  { name: 'Ativar/desativar match', value: 'match_enabled' },
  { name: 'Ativar/desativar denúncias', value: 'reports_enabled' }
] as const;

type ProfileAction = (typeof profileActions)[number]['value'];
type ReportAction = (typeof reportActions)[number]['value'];

export const suinderAdminCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('suinder-admin')
    .setDescription('Painel administrativo do SUÍNDER')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('dashboard')
        .setDescription('Mostra indicadores administrativos do SUÍNDER')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('perfil')
        .setDescription('Modera um perfil do SUÍNDER')
        .addStringOption((option) =>
          option
            .setName('acao')
            .setDescription('Ação administrativa sobre o perfil')
            .setRequired(true)
            .addChoices(...profileActions)
        )
        .addStringOption((option) =>
          option
            .setName('perfil_id')
            .setDescription('ID interno do perfil alvo')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('denuncias')
        .setDescription('Gerencia denúncias do SUÍNDER')
        .addStringOption((option) =>
          option
            .setName('acao')
            .setDescription('Ação sobre denúncias')
            .setRequired(true)
            .addChoices(...reportActions)
        )
        .addStringOption((option) =>
          option
            .setName('denuncia_id')
            .setDescription('ID da denúncia para ver/resolver/suspender/banir')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('nota')
            .setDescription('Nota de resolução ou contexto administrativo')
            .setMaxLength(1000)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('config')
        .setDescription('Consulta ou altera configurações administrativas')
        .addStringOption((option) =>
          option
            .setName('chave')
            .setDescription('Configuração a alterar')
            .setRequired(false)
            .addChoices(...configKeys)
        )
        .addStringOption((option) =>
          option
            .setName('valor')
            .setDescription('Novo valor; deixe vazio para apenas ver a configuração')
            .setRequired(false)
        )
    ),

  async execute(interaction, context) {
    if (!(await ensureAdminAccess(interaction, context))) {
      return;
    }

    const guildId = interaction.guildId ?? context.config.DISCORD_GUILD_ID;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'dashboard') {
      const stats = await context.admin.getDashboard(guildId, interaction.user.id);
      await interaction.reply({ embeds: [buildDashboardEmbed(stats)], ephemeral: true });
      return;
    }

    if (subcommand === 'perfil') {
      await handleProfileAdmin(interaction, context, guildId);
      return;
    }

    if (subcommand === 'denuncias') {
      await handleReportsAdmin(interaction, context, guildId);
      return;
    }

    if (subcommand === 'config') {
      await handleConfigAdmin(interaction, context, guildId);
      return;
    }

    await interaction.reply({ content: 'Subcomando administrativo não reconhecido.', ephemeral: true });
  }
};

async function ensureAdminAccess(interaction: ChatInputCommandInteraction, context: AppContext): Promise<boolean> {
  if (!interaction.inCachedGuild()) {
    await interaction.reply({ content: 'O painel administrativo só pode ser usado no servidor configurado.', ephemeral: true });
    return false;
  }

  if (interaction.guildId !== context.config.DISCORD_GUILD_ID) {
    await interaction.reply({ content: 'Este servidor não está configurado para o SUÍNDER.', ephemeral: true });
    return false;
  }

  const hasAdministrator = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
  const configuredSettings = await context.admin.findSettings(context.config.DISCORD_GUILD_ID);
  const moderatorRoleId = configuredSettings?.moderatorRoleId ?? context.config.MODERATOR_ROLE_ID;
  const roles = interaction.member.roles as GuildMemberRoleManager;
  const hasModeratorRole = moderatorRoleId ? roles.cache.has(moderatorRoleId) : false;

  if (!hasAdministrator && !hasModeratorRole) {
    await context.adminLogs.record({
      guildId: context.config.DISCORD_GUILD_ID,
      action: 'admin.access.denied',
      actorDiscordUserId: interaction.user.id,
      metadata: { commandName: interaction.commandName, executedAt: new Date().toISOString() },
      message: 'Tentativa de acesso administrativo sem permissão.'
    });
    await interaction.reply({ content: 'Você não tem permissão para usar o painel administrativo do SUÍNDER.', ephemeral: true });
    return false;
  }

  return true;
}

async function handleProfileAdmin(interaction: ChatInputCommandInteraction, context: AppContext, guildId: string): Promise<void> {
  const action = interaction.options.getString('acao', true) as ProfileAction;
  const profileId = interaction.options.getString('perfil_id', true);

  try {
    if (action === 'history') {
      const history = await context.admin.getProfileHistory(guildId, interaction.user.id, profileId);
      await interaction.reply({ embeds: [buildProfileHistoryEmbed(history)], ephemeral: true });
      return;
    }

    const profile = await context.admin.moderateProfile(guildId, interaction.user.id, profileId, action);
    await interaction.reply({
      content: `✅ Perfil **${profile.displayName}** atualizado para **${profile.status}**. A ação foi registrada em log administrativo.`,
      ephemeral: true
    });
  } catch (error) {
    await interaction.reply({ content: `⚠️ Ação administrativa falhou: ${formatError(error)}`, ephemeral: true });
  }
}

async function handleReportsAdmin(interaction: ChatInputCommandInteraction, context: AppContext, guildId: string): Promise<void> {
  const action = interaction.options.getString('acao', true) as ReportAction;
  const reportId = interaction.options.getString('denuncia_id') ?? undefined;
  const note = interaction.options.getString('nota') ?? '';

  try {
    if (action === 'list') {
      const reports = await context.admin.listOpenReports(guildId, interaction.user.id);
      await interaction.reply({ embeds: [buildReportsListEmbed(reports)], ephemeral: true });
      return;
    }

    if (!reportId) {
      await interaction.reply({ content: 'Informe `denuncia_id` para esta ação.', ephemeral: true });
      return;
    }

    if (action === 'view') {
      const report = await context.admin.getReportDetails(guildId, interaction.user.id, reportId);
      await interaction.reply({ embeds: [buildReportDetailsEmbed(report)], ephemeral: true });
      return;
    }

    const report = await context.admin.moderateReport(guildId, interaction.user.id, reportId, action, note);
    await interaction.reply({
      content: `✅ Denúncia **${report.id}** atualizada para **${report.status}**. A ação foi registrada em log administrativo.`,
      ephemeral: true
    });
  } catch (error) {
    await interaction.reply({ content: `⚠️ Ação sobre denúncia falhou: ${formatError(error)}`, ephemeral: true });
  }
}

async function handleConfigAdmin(interaction: ChatInputCommandInteraction, context: AppContext, guildId: string): Promise<void> {
  const key = interaction.options.getString('chave') ?? undefined;
  const value = interaction.options.getString('valor') ?? undefined;

  try {
    const settings = key && value !== undefined
      ? await context.admin.updateSetting(guildId, interaction.user.id, key, value)
      : await context.admin.viewSettings(guildId, interaction.user.id);
    await interaction.reply({ embeds: [buildSettingsEmbed(settings)], ephemeral: true });
  } catch (error) {
    await interaction.reply({ content: `⚠️ Não foi possível alterar configuração: ${formatError(error)}`, ephemeral: true });
  }
}

function buildDashboardEmbed(stats: AdminDashboardStats): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('Painel administrativo SUÍNDER')
    .setDescription('Indicadores privados de moderação e operação.')
    .addFields(
      { name: 'Perfis ativos', value: String(stats.activeProfiles), inline: true },
      { name: 'Perfis pendentes', value: String(stats.pendingProfiles), inline: true },
      { name: 'Perfis suspensos', value: String(stats.suspendedProfiles), inline: true },
      { name: 'Perfis banidos', value: String(stats.bannedProfiles), inline: true },
      { name: 'Matches ativos', value: String(stats.activeMatches), inline: true },
      { name: 'Denúncias abertas', value: String(stats.openReports), inline: true },
      { name: 'Denúncias resolvidas', value: String(stats.resolvedReports), inline: true }
    )
    .setColor(0x5865f2);
}

function buildSettingsEmbed(settings: AdminGuildSettings): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('Configurações administrativas SUÍNDER')
    .addFields(
      { name: 'Canal de logs', value: settings.adminLogChannelId ?? 'Não configurado', inline: true },
      { name: 'Canal de denúncias', value: settings.reportLogChannelId ?? 'Não configurado', inline: true },
      { name: 'Aprovação manual', value: settings.profileReviewRequired ? 'Ativa' : 'Inativa', inline: true },
      { name: 'Expiração do pass', value: `${settings.passExpirationDays} dia(s)`, inline: true },
      { name: 'Match', value: settings.matchEnabled ? 'Ativo' : 'Inativo', inline: true },
      { name: 'Denúncias', value: settings.reportsEnabled ? 'Ativas' : 'Inativas', inline: true }
    )
    .setColor(0x5865f2);
}

function buildReportsListEmbed(reports: AdminReportSummary[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('Denúncias abertas')
    .setColor(0xffcc00);

  if (reports.length === 0) {
    embed.setDescription('Não há denúncias abertas no momento.');
    return embed;
  }

  for (const report of reports) {
    embed.addFields({
      name: `${report.reportedDisplayName} — ${report.category}`,
      value: [`ID: ${report.id}`, `Status: ${report.status}`, `Criada: ${formatDiscordDate(report.createdAt)}`].join('\n'),
      inline: false
    });
  }

  return embed;
}

function buildReportDetailsEmbed(report: AdminReportSummary): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`Denúncia ${report.id}`)
    .setDescription(report.description ?? 'Sem descrição.')
    .addFields(
      { name: 'Perfil denunciado', value: report.reportedDisplayName, inline: true },
      { name: 'Categoria', value: report.category, inline: true },
      { name: 'Status', value: report.status, inline: true },
      { name: 'Criada', value: formatDiscordDate(report.createdAt), inline: true }
    )
    .setColor(0xffcc00);
}

function buildProfileHistoryEmbed(history: AdminProfileHistory): EmbedBuilder {
  const reportSummary = history.reports.length === 0
    ? 'Sem denúncias recentes.'
    : history.reports.map((report) => `${report.status}: ${report.category} (${formatDiscordDate(report.createdAt)})`).join('\n');
  const auditSummary = history.auditLogs.length === 0
    ? 'Sem logs administrativos recentes.'
    : history.auditLogs.map((log) => `${log.action} (${formatDiscordDate(log.createdAt)})`).join('\n');
  const matchSummary = history.matches.length === 0
    ? 'Sem matches recentes.'
    : history.matches.map((match) => `${match.status} (${formatDiscordDate(match.createdAt)})`).join('\n');

  return new EmbedBuilder()
    .setTitle(`Histórico de ${history.profile.displayName}`)
    .addFields(
      { name: 'Status atual', value: history.profile.status, inline: true },
      { name: 'Denúncias recentes', value: truncate(reportSummary), inline: false },
      { name: 'Logs recentes', value: truncate(auditSummary), inline: false },
      { name: 'Matches recentes', value: truncate(matchSummary), inline: false }
    )
    .setColor(0x5865f2);
}

function formatDiscordDate(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}

function truncate(value: string): string {
  return value.length > 1000 ? `${value.slice(0, 997)}...` : value;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
