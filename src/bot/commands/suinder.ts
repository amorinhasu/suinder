import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  userMention,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction
} from 'discord.js';
import type { AppContext } from '../../application/context.js';
import type { MatchSummary, RawProfileFormInput } from '../../application/services/profile-service.js';
import {
  COMPATIBILITY_QUESTIONS,
  CURRENT_TERMS_VERSION,
  LOOKING_FOR_OPTIONS,
  type CompatibilityAnswers,
  type CompatibilityQuestionKey,
  type LookingForOption,
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_NICKNAME_MAX_LENGTH,
  type UserProfile
} from '../../domain/profile.js';
import {
  buildPublicPanelActionRows,
  parsePublicPanelButtonId
} from '../public-panel.js';
import { SUINDER_EMBED_COLOR, applyVisualBanner } from '../visual-assets.js';
import type { SlashCommand } from './types.js';

const PROFILE_CREATE_BUTTON_ID = 'suinder:profile:create';
const PROFILE_EDIT_BUTTON_ID = 'suinder:profile:edit';
const PROFILE_PAUSE_BUTTON_ID = 'suinder:profile:pause';
const PROFILE_REACTIVATE_BUTTON_ID = 'suinder:profile:reactivate';
const PROFILE_DELETE_BUTTON_ID = 'suinder:profile:delete';
const PROFILE_COMPATIBILITY_BUTTON_ID = 'suinder:profile:compatibility';
const PROFILE_CREATE_MODAL_ID = 'suinder:profile:create-modal';
const PROFILE_EDIT_MODAL_ID = 'suinder:profile:edit-modal';
const COMPATIBILITY_SELECT_PREFIX = 'suinder:compatibility';
const DISCOVERY_REPORT_MODAL_PREFIX = 'suinder:discover-report';
const MATCH_REPORT_MODAL_PREFIX = 'suinder:match-report';
const DM_TEST_BUTTON_ID = 'suinder:dm:test';
const TERMS_ACCEPT_BUTTON_ID = 'suinder:terms:accept';
const TERMS_DECLINE_BUTTON_ID = 'suinder:terms:decline';
const pendingTermsAcceptances = new Set<string>();
type MatchAction = 'view' | 'unmatch' | 'block' | 'report';
type DiscoveryAction = 'like' | 'super_like' | 'pass' | 'block' | 'report' | 'next';
type SuinderUserInteraction = ChatInputCommandInteraction | ButtonInteraction;
type DiscoveryFilter = LookingForOption | 'Todos';

const discoveryFilterChoices = [
  { name: 'Todos', value: 'Todos' },
  ...LOOKING_FOR_OPTIONS.map((option) => ({ name: option, value: option }))
] as const;

const reportCategories = [
  { name: 'Assédio', value: 'harassment' },
  { name: 'Perfil inadequado', value: 'inappropriate_profile' },
  { name: 'Spam', value: 'spam' },
  { name: 'Falsa identidade', value: 'impersonation' },
  { name: 'Outro', value: 'other' }
] as const;

async function ensureConfiguredGuild(
  interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction,
  context: AppContext
): Promise<boolean> {
  if (!interaction.inCachedGuild()) {
    await replyEphemeral(interaction, 'O SUÍNDER só pode ser usado dentro do servidor configurado.');
    return false;
  }

  if (interaction.guildId !== context.config.DISCORD_GUILD_ID) {
    await replyEphemeral(interaction, 'Este servidor não está configurado para usar o SUÍNDER.');
    return false;
  }

  return true;
}

export const suinderCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('suinder')
    .setDescription('Comandos principais do SUÍNDER')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('iniciar')
        .setDescription('Mostra o painel inicial efêmero do SUÍNDER')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('perfil')
        .setDescription('Cria ou gerencia seu perfil SUÍNDER')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('descobrir')
        .setDescription('Mostra um perfil elegível para descoberta')
        .addStringOption((option) =>
          option
            .setName('filtro')
            .setDescription('Filtra a descoberta desta sessão por interesse')
            .setRequired(false)
            .addChoices(...discoveryFilterChoices)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('matches')
        .setDescription('Lista seus matches ativos no SUÍNDER')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('pausar')
        .setDescription('Pausa seu perfil SUÍNDER')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('denunciar')
        .setDescription('Registra uma intenção de denúncia para validação futura')
        .addUserOption((option) =>
          option
            .setName('usuario')
            .setDescription('Usuário que será referenciado na denúncia')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('categoria')
            .setDescription('Categoria inicial da denúncia')
            .setRequired(true)
            .addChoices(...reportCategories)
        )
        .addStringOption((option) =>
          option
            .setName('descricao')
            .setDescription('Descrição opcional, com no máximo 1000 caracteres')
            .setMaxLength(1000)
            .setRequired(false)
        )
    ),

  async execute(interaction, context) {
    if (!(await ensureConfiguredGuild(interaction, context))) {
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'iniciar') {
      await interaction.reply({
        embeds: [buildStartPanelEmbed()],
        components: [buildCreateProfileActionRow()],
        ephemeral: true
      });
      return;
    }

    if (subcommand === 'perfil') {
      await showProfilePanel(interaction, context);
      return;
    }

    if (subcommand === 'descobrir') {
      await showDiscoverableProfile(interaction, context, parseDiscoveryFilter(interaction.options.getString('filtro')));
      return;
    }

    if (subcommand === 'matches') {
      await showMatches(interaction, context);
      return;
    }

    if (subcommand === 'pausar') {
      await toggleProfilePause(interaction, context);
      return;
    }

    if (subcommand === 'denunciar') {
      const targetUser = interaction.options.getUser('usuario', true);
      const category = interaction.options.getString('categoria', true);
      const description = interaction.options.getString('descricao') ?? undefined;

      if (targetUser.id === interaction.user.id) {
        await interaction.reply({ content: 'Você não pode denunciar a si mesmo.', ephemeral: true });
        return;
      }

      const guildId = interaction.guildId ?? context.config.DISCORD_GUILD_ID;
      try {
        await context.profiles.ensureReportsEnabled(guildId);
      } catch (error) {
        await interaction.reply({ content: `⚠️ Não foi possível denunciar: ${error instanceof Error ? error.message : String(error)}`, ephemeral: true });
        return;
      }

      await context.adminLogs.record({
        guildId,
        action: 'report.placeholder_created',
        actorDiscordUserId: interaction.user.id,
        metadata: {
          reportedDiscordUserId: targetUser.id,
          category,
          hasDescription: Boolean(description)
        },
        message: `Denúncia placeholder criada por ${userMention(interaction.user.id)} contra ${userMention(targetUser.id)}.`
      });

      await interaction.reply({
        content: '🚩 Denúncia registrada como placeholder administrativo. A persistência completa em `reports` será ligada quando o fluxo de denúncias for implementado.',
        ephemeral: true
      });
      return;
    }

    await interaction.reply({ content: 'Subcomando não reconhecido.', ephemeral: true });
  }
};

export async function handleSuinderButton(interaction: ButtonInteraction, context: AppContext): Promise<boolean> {
  if (!interaction.customId.startsWith('suinder:profile:') && !interaction.customId.startsWith('suinder:discover:') && !interaction.customId.startsWith('suinder:match:') && !interaction.customId.startsWith('suinder:public:') && !interaction.customId.startsWith('suinder:terms:') && interaction.customId !== DM_TEST_BUTTON_ID) {
    return false;
  }

  if (!(await ensureConfiguredGuild(interaction, context))) {
    return true;
  }

  if (interaction.customId === DM_TEST_BUTTON_ID) {
    await handleDmTestButton(interaction, context);
    return true;
  }

  if (interaction.customId === TERMS_ACCEPT_BUTTON_ID || interaction.customId === TERMS_DECLINE_BUTTON_ID) {
    await handleTermsButton(interaction, context);
    return true;
  }

  if (interaction.customId.startsWith('suinder:public:')) {
    await handlePublicPanelButton(interaction, context);
    return true;
  }

  if (interaction.customId.startsWith('suinder:discover:')) {
    await handleDiscoveryButton(interaction, context);
    return true;
  }

  if (interaction.customId.startsWith('suinder:match:')) {
    await handleMatchButton(interaction, context);
    return true;
  }

  if (interaction.customId === PROFILE_CREATE_BUTTON_ID) {
    const guildId = interaction.guildId ?? context.config.DISCORD_GUILD_ID;
    const existingProfile = await context.profiles.getProfile(guildId, interaction.user.id);
    if (existingProfile) {
      if (!context.profiles.hasAcceptedCurrentTerms(existingProfile)) {
        await showTermsPanel(interaction);
        return true;
      }

      await interaction.reply({ content: 'Você já possui um perfil. Use `/suinder perfil` para editar ou gerenciar.', ephemeral: true });
      return true;
    }

    if (!hasPendingTermsAcceptance(guildId, interaction.user.id)) {
      await showTermsPanel(interaction);
      return true;
    }

    if (!await ensureDmCapability(interaction, context)) {
      return true;
    }

    await interaction.showModal(buildProfileModal('create'));
    return true;
  }

  const guildId = interaction.guildId ?? context.config.DISCORD_GUILD_ID;
  const profile = await context.profiles.getProfile(guildId, interaction.user.id);
  if (!profile) {
    await interaction.reply({ content: 'Você ainda não tem perfil. Use o botão de criação em `/suinder perfil`.', ephemeral: true });
    return true;
  }

  if (!context.profiles.hasAcceptedCurrentTerms(profile)) {
    await showTermsPanel(interaction);
    return true;
  }

  if (interaction.customId === PROFILE_EDIT_BUTTON_ID) {
    await interaction.showModal(buildProfileModal('edit', profile));
    return true;
  }

  if (interaction.customId === PROFILE_COMPATIBILITY_BUTTON_ID) {
    await interaction.reply({
      content: '✨ Escolha suas preferências rápidas. Elas são opcionais e podem ser alteradas a qualquer momento.',
      embeds: [buildProfilePanelEmbed(profile)],
      components: buildCompatibilitySelectRows(profile),
      ephemeral: true
    });
    return true;
  }

  if (interaction.customId === PROFILE_PAUSE_BUTTON_ID) {
    const updatedProfile = await context.profiles.pauseProfile(profile);
    await interaction.update({ embeds: [buildProfilePanelEmbed(updatedProfile)], components: buildProfileActionRows(updatedProfile) });
    return true;
  }

  if (interaction.customId === PROFILE_REACTIVATE_BUTTON_ID) {
    if (!await ensureDmCapability(interaction, context)) {
      return true;
    }

    const updatedProfile = await context.profiles.reactivateProfile(profile);
    await interaction.update({ embeds: [buildProfilePanelEmbed(updatedProfile)], components: buildProfileActionRows(updatedProfile) });
    return true;
  }

  if (interaction.customId === PROFILE_DELETE_BUTTON_ID) {
    await context.profiles.deleteProfile(profile);
    await interaction.update({
      content: '🗑️ Seu perfil foi excluído. Você poderá criar um novo perfil usando `/suinder perfil`.',
      embeds: [buildCreateProfileEmbed()],
      components: [buildCreateProfileActionRow()]
    });
    return true;
  }

  return false;
}

export async function handleSuinderSelectMenu(interaction: StringSelectMenuInteraction, context: AppContext): Promise<boolean> {
  if (!interaction.customId.startsWith(`${COMPATIBILITY_SELECT_PREFIX}:`)) {
    return false;
  }

  if (!(await ensureConfiguredGuild(interaction, context))) {
    return true;
  }

  const questionKey = parseCompatibilitySelectId(interaction.customId);
  const selectedAnswer = interaction.values[0];
  if (!questionKey || !selectedAnswer) {
    await interaction.reply({ content: '⚠️ Preferência de compatibilidade inválida. Abra o painel de perfil novamente.', ephemeral: true });
    return true;
  }

  try {
    const profile = await context.profiles.updateCompatibilityAnswer(
      interaction.guildId ?? context.config.DISCORD_GUILD_ID,
      interaction.user.id,
      questionKey,
      selectedAnswer
    );

    await interaction.update({
      content: '✨ Preferências de compatibilidade atualizadas. Você pode ajustar outras opções abaixo.',
      embeds: [buildProfilePanelEmbed(profile)],
      components: buildCompatibilitySelectRows(profile)
    });
  } catch (error) {
    await interaction.reply({
      content: `⚠️ Não foi possível atualizar suas preferências: ${error instanceof Error ? error.message : String(error)}`,
      ephemeral: true
    });
  }

  return true;
}


async function handleTermsButton(interaction: ButtonInteraction, context: AppContext): Promise<void> {
  const guildId = interaction.guildId ?? context.config.DISCORD_GUILD_ID;

  if (interaction.customId === TERMS_DECLINE_BUTTON_ID) {
    clearPendingTermsAcceptance(guildId, interaction.user.id);
    await interaction.update({
      content: 'Tudo bem. Sem aceitar os termos, não é possível participar do SUÍNDER.',
      embeds: [],
      components: []
    });
    return;
  }

  markPendingTermsAcceptance(guildId, interaction.user.id);
  const profile = await context.profiles.acceptTerms(guildId, interaction.user.id);
  if (profile) {
    await interaction.update({
      content: '✅ Termos aceitos. Você já pode continuar usando o SUÍNDER.',
      embeds: [buildProfilePanelEmbed(profile)],
      components: buildProfileActionRows(profile)
    });
    return;
  }

  await interaction.showModal(buildProfileModal('create'));
}

async function showTermsPanel(interaction: SuinderUserInteraction): Promise<void> {
  await interaction.reply({
    embeds: [buildTermsEmbed()],
    components: [buildTermsActionRow()],
    ephemeral: true
  });
}

function markPendingTermsAcceptance(guildId: string, discordUserId: string): void {
  pendingTermsAcceptances.add(`${guildId}:${discordUserId}:${CURRENT_TERMS_VERSION}`);
}

function hasPendingTermsAcceptance(guildId: string, discordUserId: string): boolean {
  return pendingTermsAcceptances.has(`${guildId}:${discordUserId}:${CURRENT_TERMS_VERSION}`);
}

function clearPendingTermsAcceptance(guildId: string, discordUserId: string): void {
  pendingTermsAcceptances.delete(`${guildId}:${discordUserId}:${CURRENT_TERMS_VERSION}`);
}

async function handleDmTestButton(interaction: ButtonInteraction, context: AppContext): Promise<void> {
  if (!await ensureDmCapability(interaction, context)) {
    return;
  }

  await interaction.reply({
    content: '✅ DM verificada com sucesso. Você já pode voltar ao SUÍNDER e tentar a ação novamente.',
    ephemeral: true
  });
}

async function ensureDmCapability(
  interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction,
  context: AppContext
): Promise<boolean> {
  try {
    const user = await context.client.users.fetch(interaction.user.id);
    await user.send({ content: buildDmVerificationMessage() });
    return true;
  } catch (error) {
    context.logger.warn('Failed to verify SUINDER DM capability', {
      discordUserId: interaction.user.id,
      error: error instanceof Error ? error.message : String(error)
    });

    await replyDmVerificationFailed(interaction);
    return false;
  }
}

async function replyDmVerificationFailed(
  interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction
): Promise<void> {
  const response = {
    content: buildDmVerificationFailureMessage(),
    components: [buildDmRetryActionRow()],
    ephemeral: true
  };

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(response);
    return;
  }

  await interaction.reply(response);
}

function buildDmVerificationMessage(): string {
  return [
    '💚 Bem-vindo ao SUÍNDER.',
    '',
    'Esta é uma mensagem de verificação.',
    'Se você recebeu este aviso, sua conta está pronta para participar.'
  ].join('\n');
}

function buildDmVerificationFailureMessage(): string {
  return [
    '⚠️ Não foi possível enviar uma mensagem privada para você.',
    '',
    'O SUÍNDER utiliza mensagens privadas para:',
    '• Matches',
    '• Super Likes',
    '• Suíte às Cegas',
    '',
    'Ative suas DMs e tente novamente.'
  ].join('\n');
}

function buildDmRetryActionRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(DM_TEST_BUTTON_ID)
      .setLabel('Testar Novamente')
      .setStyle(ButtonStyle.Primary)
  );
}

async function handlePublicPanelButton(interaction: ButtonInteraction, context: AppContext): Promise<void> {
  const action = parsePublicPanelButtonId(interaction.customId);
  if (!action) {
    await interaction.reply({ content: 'Botão do painel público inválido.', ephemeral: true });
    return;
  }

  if (action === 'profile') {
    await showProfilePanel(interaction, context);
    return;
  }

  if (action === 'discover') {
    await showDiscoverableProfile(interaction, context, 'Todos');
    return;
  }

  if (action === 'matches') {
    await showMatches(interaction, context);
    return;
  }

  if (action.startsWith('filter_')) {
    await showDiscoverableProfile(interaction, context, parsePublicDiscoveryFilter(action));
    return;
  }

  if (action === 'pause') {
    await toggleProfilePause(interaction, context);
    return;
  }

  await interaction.reply({
    embeds: [buildPublicPanelHelpEmbed()],
    components: buildPublicPanelActionRows(),
    ephemeral: true
  });
}

async function toggleProfilePause(interaction: SuinderUserInteraction, context: AppContext): Promise<void> {
  const guildId = interaction.guildId ?? context.config.DISCORD_GUILD_ID;
  const profile = await context.profiles.getProfile(guildId, interaction.user.id);
  if (!profile) {
    await interaction.reply({ content: 'Você ainda não tem perfil para pausar ou reativar. Use `/suinder perfil` para criar.', ephemeral: true });
    return;
  }

  if (profile.status === 'paused' && !await ensureDmCapability(interaction, context)) {
    return;
  }

  const updatedProfile = profile.status === 'paused'
    ? await context.profiles.reactivateProfile(profile)
    : await context.profiles.pauseProfile(profile);
  const message = updatedProfile.status === 'paused'
    ? '⏸️ Perfil pausado. Ele não aparecerá na descoberta enquanto estiver pausado.'
    : '▶️ Perfil reativado. O status atualizado já está refletido abaixo.';

  await interaction.reply({
    content: message,
    embeds: [buildProfilePanelEmbed(updatedProfile)],
    components: buildProfileActionRows(updatedProfile),
    ephemeral: true
  });
}

export async function handleSuinderModalSubmit(interaction: ModalSubmitInteraction, context: AppContext): Promise<boolean> {
  if (interaction.customId.startsWith(`${MATCH_REPORT_MODAL_PREFIX}:`)) {
    if (!(await ensureConfiguredGuild(interaction, context))) {
      return true;
    }

    await handleMatchReportSubmit(interaction, context);
    return true;
  }

  if (interaction.customId.startsWith(`${DISCOVERY_REPORT_MODAL_PREFIX}:`)) {
    if (!(await ensureConfiguredGuild(interaction, context))) {
      return true;
    }

    await handleDiscoveryReportSubmit(interaction, context);
    return true;
  }

  if (![PROFILE_CREATE_MODAL_ID, PROFILE_EDIT_MODAL_ID].includes(interaction.customId)) {
    return false;
  }

  if (!(await ensureConfiguredGuild(interaction, context))) {
    return true;
  }

  const guildId = interaction.guildId ?? context.config.DISCORD_GUILD_ID;
  const existingProfile = interaction.customId === PROFILE_EDIT_MODAL_ID
    ? await context.profiles.getProfile(guildId, interaction.user.id)
    : null;
  const input = buildProfileFormInput(interaction, guildId, existingProfile);

  try {
    if (interaction.customId === PROFILE_CREATE_MODAL_ID && !await ensureDmCapability(interaction, context)) {
      return true;
    }

    if (interaction.customId === PROFILE_CREATE_MODAL_ID && !hasPendingTermsAcceptance(input.guildId, interaction.user.id)) {
      throw new Error('Aceite os termos atuais do SUÍNDER antes de criar seu perfil.');
    }

    const profile = interaction.customId === PROFILE_CREATE_MODAL_ID
      ? await context.profiles.createProfile(input)
      : await updateExistingProfile(interaction, context, input);

    clearPendingTermsAcceptance(input.guildId, interaction.user.id);

    await interaction.reply({
      embeds: [buildProfilePanelEmbed(profile)],
      components: buildProfileActionRows(profile),
      ephemeral: true
    });
  } catch (error) {
    await interaction.reply({
      content: `⚠️ Não foi possível salvar seu perfil: ${error instanceof Error ? error.message : String(error)}`,
      ephemeral: true
    });
  }

  return true;
}

async function updateExistingProfile(
  interaction: ModalSubmitInteraction,
  context: AppContext,
  input: RawProfileFormInput
): Promise<UserProfile> {
  const guildId = interaction.guildId ?? context.config.DISCORD_GUILD_ID;
  const profile = await context.profiles.getProfile(guildId, interaction.user.id);
  if (!profile) {
    throw new Error('Perfil não encontrado para edição.');
  }

  return context.profiles.updateProfile(profile.id, input);
}

function buildProfileFormInput(
  interaction: ModalSubmitInteraction,
  guildId: string,
  existingProfile: UserProfile | null
): RawProfileFormInput {
  return {
    guildId,
    discordUserId: interaction.user.id,
    avatarUrl: interaction.user.displayAvatarURL({ size: 256 }),
    displayName: interaction.fields.getTextInputValue('display_name'),
    age: interaction.fields.getTextInputValue('age'),
    bio: interaction.fields.getTextInputValue('bio'),
    lookingFor: existingProfile ? existingProfile.lookingFor.join(', ') : LOOKING_FOR_OPTIONS.join(', '),
    compatibilityAnswers: existingProfile ? serializeCompatibilityAnswers(existingProfile.compatibilityAnswers) : '',
    receiveDm: 'Sim',
    adultConsent: 'Sim',
    termsAcceptedAt: hasPendingTermsAcceptance(guildId, interaction.user.id) ? new Date() : undefined,
    termsVersion: hasPendingTermsAcceptance(guildId, interaction.user.id) ? CURRENT_TERMS_VERSION : undefined
  };
}

async function showProfilePanel(interaction: SuinderUserInteraction, context: AppContext): Promise<void> {
  const guildId = interaction.guildId ?? context.config.DISCORD_GUILD_ID;
  const profile = await context.profiles.getProfile(guildId, interaction.user.id);

  if (!profile) {
    if (!hasPendingTermsAcceptance(guildId, interaction.user.id)) {
      await showTermsPanel(interaction);
      return;
    }

    await interaction.reply({
      embeds: [buildCreateProfileEmbed()],
      components: [buildCreateProfileActionRow()],
      ephemeral: true
    });
    return;
  }

  if (!context.profiles.hasAcceptedCurrentTerms(profile)) {
    await showTermsPanel(interaction);
    return;
  }

  await interaction.reply({
    embeds: [buildProfilePanelEmbed(profile)],
    components: buildProfileActionRows(profile),
    ephemeral: true
  });
}

async function showDiscoverableProfile(interaction: SuinderUserInteraction, context: AppContext, filter: DiscoveryFilter = 'Todos'): Promise<void> {
  const guildId = interaction.guildId ?? context.config.DISCORD_GUILD_ID;

  if (!await ensureDmCapability(interaction, context)) {
    return;
  }

  try {
    const profile = await context.profiles.findNextDiscoverableProfile(guildId, interaction.user.id, normalizeDiscoveryFilter(filter));

    if (!profile) {
      await interaction.reply({
        embeds: [buildNoProfilesEmbed(filter)],
        ephemeral: true
      });
      return;
    }

    await interaction.reply({
      content: '🔎 Perfil encontrado. Esta visualização é efêmera e não registra log administrativo.',
      embeds: [buildDiscoveryProfileEmbed(profile, filter)],
      components: buildDiscoveryActionRows(profile, filter),
      ephemeral: true
    });
  } catch (error) {
    await interaction.reply({
      content: `⚠️ Não foi possível abrir a descoberta: ${error instanceof Error ? error.message : String(error)}`,
      ephemeral: true
    });
  }
}


async function showMatches(interaction: SuinderUserInteraction, context: AppContext): Promise<void> {
  const guildId = interaction.guildId ?? context.config.DISCORD_GUILD_ID;

  try {
    const matches = await context.profiles.listActiveMatches(guildId, interaction.user.id);

    if (matches.length === 0) {
      await interaction.reply({
        embeds: [buildNoMatchesEmbed()],
        ephemeral: true
      });
      return;
    }

    await interaction.reply({
      content: '💞 Seus matches ativos. Esta lista é efêmera e não revela IDs de usuários.',
      embeds: [buildMatchesEmbed(matches)],
      components: buildMatchActionRows(matches),
      ephemeral: true
    });
  } catch (error) {
    await interaction.reply({
      content: `⚠️ Não foi possível listar seus matches: ${error instanceof Error ? error.message : String(error)}`,
      ephemeral: true
    });
  }
}

function buildNoMatchesEmbed(): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('Sem matches ativos no SUÍNDER')
    .setDescription('Quando uma curtida for recíproca, o match aparecerá aqui. Matches bloqueados, deletados ou encerrados não são exibidos.')
    .setColor(SUINDER_EMBED_COLOR);

  return applyVisualBanner(embed, 'BANNER_MATCHES');
}

function buildMatchesEmbed(matches: MatchSummary[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('Matches ativos do SUÍNDER')
    .setColor(SUINDER_EMBED_COLOR)
    .setDescription('Use as ações abaixo para ver perfil, desfazer match, bloquear ou denunciar. Segurança: respeite consentimento e limites.');

  for (const [index, match] of matches.entries()) {
    embed.addFields({
      name: `${index + 1}. ${match.matchedProfile.displayName}`,
      value: [
        `**Idade:** ${match.matchedProfile.age ?? 'não informada'}`,
        `**Procura:** ${match.matchedProfile.lookingFor.join(', ') || 'Não informado'}`,
        `**Data do match:** ${formatDiscordDate(match.createdAt)}`,
        `**Status:** ${formatMatchStatus(match.status)}`
      ].join('\n'),
      inline: false
    });
  }

  return applyVisualBanner(embed, 'BANNER_MATCHES');
}

function buildMatchProfileEmbed(match: MatchSummary): EmbedBuilder {
  const profile = match.matchedProfile;
  const embed = new EmbedBuilder()
    .setTitle(profile.displayName)
    .setDescription(profile.bio || 'Sem bio.')
    .addFields(
      { name: 'Idade', value: String(profile.age ?? 'Não informada'), inline: true },
      { name: 'Procura', value: profile.lookingFor.join(', ') || 'Não informado', inline: false },
      { name: 'Data do match', value: formatDiscordDate(match.createdAt), inline: true },
      { name: 'Status do match', value: formatMatchStatus(match.status), inline: true },
      { name: 'Segurança', value: 'Este perfil é exibido de forma efêmera. Use bloquear/denunciar se algo parecer inadequado.', inline: false }
    )
    .setColor(SUINDER_EMBED_COLOR);

  if (profile.avatarUrl) {
    embed.setThumbnail(profile.avatarUrl);
  }

  return applyVisualBanner(embed, 'BANNER_MATCH');
}

function buildMatchActionRows(matches: MatchSummary[]): ActionRowBuilder<ButtonBuilder>[] {
  return matches.slice(0, 5).map((match, index) => new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildMatchButtonId('view', match.id))
      .setLabel(`${index + 1} Ver perfil`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildMatchButtonId('unmatch', match.id))
      .setLabel(`${index + 1} Desfazer`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildMatchButtonId('block', match.id))
      .setLabel(`${index + 1} Bloquear`)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(buildMatchButtonId('report', match.id))
      .setLabel(`${index + 1} Denunciar`)
      .setStyle(ButtonStyle.Danger)
  ));
}

function buildPublicPanelHelpEmbed(): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('Ajuda rápida do SUÍNDER')
    .setDescription([
      'Use **Criar/Ver Perfil** para criar ou gerenciar seu perfil.',
      'Use **Descobrir Pessoas** para ver perfis elegíveis de forma efêmera.',
      'Use **Meus Matches** para listar matches ativos.',
      'Use **Pausar/Reativar Perfil** para controlar sua visibilidade na descoberta.',
      'Você também pode usar os slash commands `/suinder perfil`, `/suinder descobrir`, `/suinder matches` e `/suinder pausar`.'
    ].join('\n'))
    .setColor(SUINDER_EMBED_COLOR);

  return applyVisualBanner(embed, 'BANNER_INICIAL');
}

function buildStartPanelEmbed(): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('💚 SUÍNDER — Conexões da comunidade Suíte')
    .setDescription([
      'Um espaço para conhecer pessoas da comunidade através de interesses em comum, conversas leves e conexões reais.',
      '',
      'Aqui você pode encontrar:',
      '🎮 parceiros de jogos',
      '🎬 pessoas para falar sobre filmes e séries',
      '🎵 quem combina com seu gosto musical',
      '💬 novas amizades',
      '❤️ conexões especiais',
      '',
      'Participar é opcional.',
      'A comunidade vem em primeiro lugar, por isso o SUÍNDER foi pensado para ser seguro, respeitoso e sem pressão.',
      '',
      'Clique abaixo para começar.'
    ].join('\n'))
    .setColor(SUINDER_EMBED_COLOR);

  return applyVisualBanner(embed, 'BANNER_INICIAL');
}

function buildCreateProfileEmbed(): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('Criar perfil SUÍNDER')
    .setDescription([
      'Você ainda não tem perfil no SUÍNDER.',
      'A criação é opcional, restrita a pessoas **+18**, e usa seu avatar atual do Discord como foto padrão.',
      'Clique no botão abaixo para abrir o formulário efêmero de criação.'
    ].join('\n'))
    .setColor(SUINDER_EMBED_COLOR);

  return applyVisualBanner(embed, 'BANNER_CRIAR_PERFIL');
}

function buildProfilePanelEmbed(profile: UserProfile): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('Seu perfil SUÍNDER')
    .addFields(
      { name: 'Apelido', value: profile.displayName, inline: true },
      { name: 'Idade', value: String(profile.age ?? 'não informada'), inline: true },
      { name: 'Bio', value: profile.bio || 'Sem bio.', inline: false },
      { name: 'Procura', value: profile.lookingFor.join(', ') || 'Não informado', inline: false },
      { name: 'Perguntas rápidas', value: formatCompatibilityAnswers(profile.compatibilityAnswers), inline: false },
      { name: 'Receber DM', value: profile.receiveDm ? 'Sim' : 'Não', inline: true },
      { name: 'Foto padrão', value: 'Avatar atual do Discord', inline: true },
      { name: 'Status', value: formatStatus(profile.status), inline: true }
    )
    .setColor(SUINDER_EMBED_COLOR);

  if (profile.avatarUrl) {
    embed.setThumbnail(profile.avatarUrl);
  }

  return applyVisualBanner(embed, profile.status === 'paused' ? 'BANNER_PERFIL_PAUSADO' : 'BANNER_PERFIL');
}

function buildDiscoveryProfileEmbed(profile: UserProfile, filter: DiscoveryFilter = 'Todos'): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(profile.displayName)
    .setDescription(profile.bio || 'Sem bio.')
    .addFields(
      { name: 'Idade', value: String(profile.age ?? 'Não informada'), inline: true },
      { name: 'Procura', value: profile.lookingFor.join(', '), inline: false },
      { name: 'Compatibilidade', value: formatCompatibility(profile), inline: false },
      { name: 'Filtro da sessão', value: filter, inline: true },
      { name: 'Segurança', value: 'Respeite consentimento e limites. Use bloquear/denunciar se algo parecer inadequado.', inline: false }
    )
    .setColor(SUINDER_EMBED_COLOR);

  if (profile.avatarUrl) {
    embed.setThumbnail(profile.avatarUrl);
  }

  return applyVisualBanner(embed, 'BANNER_DESCOBRIR');
}

function buildMatchCreatedEmbed(): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('Deu match no SUÍNDER!')
    .setDescription('Vocês se curtiram mutuamente. Tentamos enviar DM para as duas pessoas, mas a entrega pode falhar se alguém estiver com DM fechada.')
    .setColor(SUINDER_EMBED_COLOR);

  return applyVisualBanner(embed, 'BANNER_MATCH');
}

function buildSuperLikeSentEmbed(): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('Super Like enviado')
    .setDescription('Seu Super Like semanal foi registrado. Se não houver match agora, a outra pessoa receberá um aviso especial sem revelar quem enviou.')
    .setColor(0xffd700);

  return applyVisualBanner(embed, 'BANNER_SUPER_LIKE');
}

function buildSuperLikeReceivedEmbed(): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('Você recebeu um Super Like')
    .setDescription('Alguém demonstrou interesse especial em você no SUÍNDER.')
    .setColor(0xffd700);

  return applyVisualBanner(embed, 'BANNER_SUPER_LIKE');
}

function buildSuperMatchEmbed(): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('SUPER MATCH!')
    .setDescription('Agora vocês sabem quem se interessou. Conversem com respeito, consentimento e segurança.')
    .setColor(0xffd700);

  return applyVisualBanner(embed, 'BANNER_SUPER_MATCH');
}

function buildNoProfilesEmbed(filter: DiscoveryFilter = 'Todos'): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('Nenhum perfil elegível encontrado agora')
    .setDescription(`Perfis pausados, pendentes, suspensos, banidos, deletados, bloqueados ou já passados não aparecem na descoberta. Filtro atual: ${filter}.`)
    .setColor(SUINDER_EMBED_COLOR);

  return applyVisualBanner(embed, 'BANNER_SEM_PERFIS');
}

function buildDiscoveryActionRows(profile: UserProfile, filter: DiscoveryFilter = 'Todos'): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildDiscoveryButtonId('like', profile.id, filter))
        .setLabel('Curtir')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(buildDiscoveryButtonId('super_like', profile.id, filter))
        .setLabel('⭐ Super Like')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(buildDiscoveryButtonId('pass', profile.id, filter))
        .setLabel('Passar')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(buildDiscoveryButtonId('next', profile.id, filter))
        .setLabel('Próximo')
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildDiscoveryButtonId('block', profile.id, filter))
        .setLabel('Bloquear')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(buildDiscoveryButtonId('report', profile.id, filter))
        .setLabel('Denunciar')
        .setStyle(ButtonStyle.Danger)
    )
  ];
}


async function handleMatchButton(interaction: ButtonInteraction, context: AppContext): Promise<void> {
  const parsed = parseMatchButtonId(interaction.customId);
  if (!parsed) {
    await interaction.reply({ content: 'Ação de match inválida.', ephemeral: true });
    return;
  }

  if (parsed.action === 'report') {
    await interaction.showModal(buildMatchReportModal(parsed.matchId));
    return;
  }

  const guildId = interaction.guildId ?? context.config.DISCORD_GUILD_ID;

  try {
    if (parsed.action === 'view') {
      const match = await context.profiles.getMatchProfile(guildId, interaction.user.id, parsed.matchId);
      await interaction.reply({
        content: '👁️ Perfil do match. Esta visualização é efêmera e não revela dados administrativos.',
        embeds: [buildMatchProfileEmbed(match)],
        ephemeral: true
      });
      return;
    }

    const matches = parsed.action === 'block'
      ? await context.profiles.blockMatchedProfile(guildId, interaction.user.id, parsed.matchId)
      : await context.profiles.unmatch(guildId, interaction.user.id, parsed.matchId);
    const message = parsed.action === 'block'
      ? '🛡️ Bloqueio registrado. O match ativo foi encerrado e a descoberta em ambas as direções foi impedida.'
      : '💔 Match desfeito. O registro foi preservado para segurança e a outra pessoa não foi notificada por DM.';

    await updateMatchesMessage(interaction, message, matches);
  } catch (error) {
    await interaction.reply({
      content: `⚠️ Não foi possível executar a ação do match: ${error instanceof Error ? error.message : String(error)}`,
      ephemeral: true
    });
  }
}

async function handleMatchReportSubmit(interaction: ModalSubmitInteraction, context: AppContext): Promise<void> {
  const matchId = parseMatchReportModalId(interaction.customId);
  if (!matchId) {
    await interaction.reply({ content: 'Denúncia de match inválida.', ephemeral: true });
    return;
  }

  try {
    const guildId = interaction.guildId ?? context.config.DISCORD_GUILD_ID;
    const result = await context.profiles.reportMatchedProfile(
      guildId,
      interaction.user.id,
      matchId,
      interaction.fields.getTextInputValue('report_reason'),
      interaction.fields.getTextInputValue('report_details') || undefined
    );
    const status = result.created ? 'Denúncia registrada.' : 'Você já tinha uma denúncia aberta para esse perfil.';
    await replyWithMatchesMessage(
      interaction,
      `🚩 ${status} Por segurança, o perfil denunciado foi bloqueado automaticamente e o match ativo foi encerrado.`,
      result.matches
    );
  } catch (error) {
    await interaction.reply({
      content: `⚠️ Não foi possível registrar a denúncia do match: ${error instanceof Error ? error.message : String(error)}`,
      ephemeral: true
    });
  }
}

async function updateMatchesMessage(interaction: ButtonInteraction, message: string, matches: MatchSummary[]): Promise<void> {
  if (matches.length === 0) {
    await interaction.update({
      content: `${message}\n\n💞 Você não tem outros matches ativos agora.`,
      embeds: [buildNoMatchesEmbed()],
      components: []
    });
    return;
  }

  await interaction.update({
    content: `${message}\n\n💞 Matches ativos restantes:`,
    embeds: [buildMatchesEmbed(matches)],
    components: buildMatchActionRows(matches)
  });
}

async function replyWithMatchesMessage(interaction: ModalSubmitInteraction, message: string, matches: MatchSummary[]): Promise<void> {
  if (matches.length === 0) {
    await interaction.reply({
      content: `${message}\n\n💞 Você não tem outros matches ativos agora.`,
      embeds: [buildNoMatchesEmbed()],
      components: [],
      ephemeral: true
    });
    return;
  }

  await interaction.reply({
    content: `${message}\n\n💞 Matches ativos restantes:`,
    embeds: [buildMatchesEmbed(matches)],
    components: buildMatchActionRows(matches),
    ephemeral: true
  });
}

async function handleDiscoveryButton(interaction: ButtonInteraction, context: AppContext): Promise<void> {
  const parsed = parseDiscoveryButtonId(interaction.customId);
  if (!parsed) {
    await interaction.reply({ content: 'Ação de descoberta inválida.', ephemeral: true });
    return;
  }

  if (parsed.action === 'like') {
    await handleDiscoveryLike(interaction, context, parsed.targetProfileId, parsed.filter);
    return;
  }

  if (parsed.action === 'super_like') {
    await handleDiscoverySuperLike(interaction, context, parsed.targetProfileId, parsed.filter);
    return;
  }

  if (parsed.action === 'report') {
    await interaction.showModal(buildDiscoveryReportModal(parsed.targetProfileId, parsed.filter));
    return;
  }

  try {
    const guildId = interaction.guildId ?? context.config.DISCORD_GUILD_ID;
    const nextProfile = parsed.action === 'block'
      ? await context.profiles.blockDiscoveredProfile(guildId, interaction.user.id, parsed.targetProfileId, normalizeDiscoveryFilter(parsed.filter))
      : await context.profiles.passDiscoveredProfile(guildId, interaction.user.id, parsed.targetProfileId, normalizeDiscoveryFilter(parsed.filter));
    const message = parsed.action === 'block'
      ? '🛡️ Bloqueio registrado. Esse perfil não aparecerá novamente e a descoberta em ambas as direções foi impedida.'
      : '➡️ Perfil descartado temporariamente. Ele não deve reaparecer enquanto o descarte estiver válido.';

    await updateDiscoveryMessage(interaction, message, nextProfile, undefined, parsed.filter);
  } catch (error) {
    await interaction.reply({
      content: `⚠️ Não foi possível executar a ação: ${error instanceof Error ? error.message : String(error)}`,
      ephemeral: true
    });
  }
}

async function handleDiscoveryLike(interaction: ButtonInteraction, context: AppContext, targetProfileId: string, filter: DiscoveryFilter): Promise<void> {
  if (!await ensureDmCapability(interaction, context)) {
    return;
  }

  try {
    const guildId = interaction.guildId ?? context.config.DISCORD_GUILD_ID;
    const result = await context.profiles.likeDiscoveredProfile(guildId, interaction.user.id, targetProfileId, normalizeDiscoveryFilter(filter));

    if (result.matched) {
      await sendMatchDms(context, interaction.user.id, result.targetProfile);
    }

    const message = result.matched
      ? '💖 Deu match! Tentamos enviar DM para vocês dois, mas a entrega pode falhar se alguém estiver com DM fechada.'
      : '💌 Curtida enviada.';

    await updateDiscoveryMessage(
      interaction,
      message,
      result.nextProfile,
      result.matched ? buildMatchCreatedEmbed() : undefined,
      filter
    );
  } catch (error) {
    await interaction.reply({
      content: `⚠️ Não foi possível curtir: ${error instanceof Error ? error.message : String(error)}`,
      ephemeral: true
    });
  }
}


async function handleDiscoverySuperLike(interaction: ButtonInteraction, context: AppContext, targetProfileId: string, filter: DiscoveryFilter): Promise<void> {
  if (!await ensureDmCapability(interaction, context)) {
    return;
  }

  try {
    const guildId = interaction.guildId ?? context.config.DISCORD_GUILD_ID;
    const result = await context.profiles.superLikeDiscoveredProfile(guildId, interaction.user.id, targetProfileId, normalizeDiscoveryFilter(filter));

    if (result.matched) {
      await sendSuperMatchDms(context, interaction.user.id, interaction.user.username, result.targetProfile);
    } else {
      await sendSuperLikeNoticeDm(context, result.targetProfile);
    }

    const message = result.matched
      ? '✨ Super Match! Tentamos enviar DM para vocês dois, mas a entrega pode falhar se alguém estiver com DM fechada.'
      : '⭐ Super Like enviado.';

    await updateDiscoveryMessage(
      interaction,
      message,
      result.nextProfile,
      result.matched ? buildSuperMatchEmbed() : buildSuperLikeSentEmbed(),
      filter
    );
  } catch (error) {
    await interaction.reply({
      content: `⚠️ Não foi possível enviar Super Like: ${error instanceof Error ? error.message : String(error)}`,
      ephemeral: true
    });
  }
}

async function sendMatchDms(context: AppContext, actorDiscordUserId: string, targetProfile: UserProfile): Promise<void> {
  const message = [
    '💖 Deu match no SUÍNDER!',
    '',
    'Vocês se curtiram mutuamente. Conversem com respeito, consentimento e segurança.'
  ].join('\n');

  const recipients = [actorDiscordUserId, targetProfile.discordUserId];
  await Promise.all(recipients.map(async (discordUserId) => {
    try {
      const user = await context.client.users.fetch(discordUserId);
      await user.send({ content: message });
    } catch (error) {
      context.logger.warn('Failed to send match DM', {
        discordUserId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }));
}


async function sendSuperLikeNoticeDm(context: AppContext, targetProfile: UserProfile): Promise<void> {
  try {
    const user = await context.client.users.fetch(targetProfile.discordUserId);
    await user.send({
      content: '⭐ Alguém demonstrou interesse especial em você no SUÍNDER.',
      embeds: [buildSuperLikeReceivedEmbed()]
    });
  } catch (error) {
    context.logger.warn('Failed to send super like DM', {
      discordUserId: targetProfile.discordUserId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function sendSuperMatchDms(context: AppContext, actorDiscordUserId: string, actorDisplayName: string, targetProfile: UserProfile): Promise<void> {
  const recipients = [actorDiscordUserId, targetProfile.discordUserId];
  await Promise.all(recipients.map(async (discordUserId) => {
    try {
      const user = await context.client.users.fetch(discordUserId);
      await user.send({
        content: `✨ SUPER MATCH! Agora vocês sabem quem se interessou. ${actorDisplayName} enviou um Super Like no SUÍNDER.`,
        embeds: [buildSuperMatchEmbed()]
      });
    } catch (error) {
      context.logger.warn('Failed to send super match DM', {
        discordUserId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }));
}

async function handleDiscoveryReportSubmit(interaction: ModalSubmitInteraction, context: AppContext): Promise<void> {
  const parsedReport = parseDiscoveryReportModalId(interaction.customId);
  const targetProfileId = parsedReport?.targetProfileId;
  if (!targetProfileId) {
    await interaction.reply({ content: 'Denúncia inválida.', ephemeral: true });
    return;
  }

  try {
    const guildId = interaction.guildId ?? context.config.DISCORD_GUILD_ID;
    const result = await context.profiles.reportDiscoveredProfile(
      guildId,
      interaction.user.id,
      targetProfileId,
      interaction.fields.getTextInputValue('report_reason'),
      interaction.fields.getTextInputValue('report_details') || undefined,
      normalizeDiscoveryFilter(parsedReport.filter)
    );
    const status = result.created ? 'Denúncia registrada.' : 'Você já tinha uma denúncia aberta para esse perfil.';
    await replyWithDiscoveryMessage(
      interaction,
      `🚩 ${status} Por segurança, o perfil denunciado foi bloqueado automaticamente para você.`,
      result.nextProfile,
      parsedReport.filter
    );
  } catch (error) {
    await interaction.reply({
      content: `⚠️ Não foi possível registrar a denúncia: ${error instanceof Error ? error.message : String(error)}`,
      ephemeral: true
    });
  }
}

async function updateDiscoveryMessage(
  interaction: ButtonInteraction,
  message: string,
  nextProfile: UserProfile | null,
  statusEmbed?: EmbedBuilder,
  filter: DiscoveryFilter = 'Todos'
): Promise<void> {
  if (!nextProfile) {
    await interaction.update({
      content: `${message}

🔎 Nenhum outro perfil elegível encontrado agora.`,
      embeds: statusEmbed ? [statusEmbed, buildNoProfilesEmbed(filter)] : [buildNoProfilesEmbed(filter)],
      components: []
    });
    return;
  }

  await interaction.update({
    content: `${message}

🔎 Próximo perfil elegível:`,
    embeds: statusEmbed ? [statusEmbed, buildDiscoveryProfileEmbed(nextProfile, filter)] : [buildDiscoveryProfileEmbed(nextProfile, filter)],
    components: buildDiscoveryActionRows(nextProfile, filter)
  });
}

async function replyWithDiscoveryMessage(interaction: ModalSubmitInteraction, message: string, nextProfile: UserProfile | null, filter: DiscoveryFilter = 'Todos'): Promise<void> {
  if (!nextProfile) {
    await interaction.reply({
      content: `${message}

🔎 Nenhum outro perfil elegível encontrado agora.`,
      embeds: [buildNoProfilesEmbed(filter)],
      components: [],
      ephemeral: true
    });
    return;
  }

  await interaction.reply({
    content: `${message}

🔎 Próximo perfil elegível:`,
    embeds: [buildDiscoveryProfileEmbed(nextProfile, filter)],
    components: buildDiscoveryActionRows(nextProfile, filter),
    ephemeral: true
  });
}


function buildMatchReportModal(matchId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${MATCH_REPORT_MODAL_PREFIX}:${matchId}`)
    .setTitle('Denunciar match')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('report_reason')
          .setLabel('Motivo')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(120)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('report_details')
          .setLabel('Detalhes opcionais')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setRequired(false)
      )
    );
}

function buildMatchButtonId(action: MatchAction, matchId: string): string {
  return `suinder:match:${action}:${matchId}`;
}

function parseMatchButtonId(customId: string): { action: MatchAction; matchId: string } | null {
  const [, scope, action, matchId] = customId.split(':');
  if (scope !== 'match' || !isMatchAction(action) || !matchId) {
    return null;
  }

  return { action, matchId };
}

function parseMatchReportModalId(customId: string): string | null {
  const prefix = `${MATCH_REPORT_MODAL_PREFIX}:`;
  return customId.startsWith(prefix) ? customId.slice(prefix.length) || null : null;
}

function isMatchAction(action: string | undefined): action is MatchAction {
  return action === 'view' || action === 'unmatch' || action === 'block' || action === 'report';
}

function formatDiscordDate(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:D>`;
}

function formatMatchStatus(status: MatchSummary['status']): string {
  const labels: Record<MatchSummary['status'], string> = {
    active: 'Ativo',
    blocked: 'Bloqueado',
    closed: 'Encerrado',
    moderator_closed: 'Encerrado pela moderação',
    unmatched: 'Desfeito'
  };

  return labels[status];
}

function buildDiscoveryReportModal(targetProfileId: string, filter: DiscoveryFilter = 'Todos'): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${DISCOVERY_REPORT_MODAL_PREFIX}:${targetProfileId}:${encodeDiscoveryFilter(filter)}`)
    .setTitle('Denunciar perfil')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('report_reason')
          .setLabel('Motivo')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(120)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('report_details')
          .setLabel('Detalhes opcionais')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setRequired(false)
      )
    );
}

function buildDiscoveryButtonId(action: DiscoveryAction, targetProfileId: string, filter: DiscoveryFilter = 'Todos'): string {
  return `suinder:discover:${action}:${targetProfileId}:${encodeDiscoveryFilter(filter)}`;
}

function parseDiscoveryButtonId(customId: string): { action: DiscoveryAction; targetProfileId: string; filter: DiscoveryFilter } | null {
  const [, scope, action, targetProfileId, rawFilter] = customId.split(':');
  if (scope !== 'discover' || !isDiscoveryAction(action) || !targetProfileId) {
    return null;
  }

  return { action, targetProfileId, filter: decodeDiscoveryFilter(rawFilter) };
}

function parseDiscoveryReportModalId(customId: string): { targetProfileId: string; filter: DiscoveryFilter } | null {
  const prefix = `${DISCOVERY_REPORT_MODAL_PREFIX}:`;
  if (!customId.startsWith(prefix)) {
    return null;
  }

  const [targetProfileId, rawFilter] = customId.slice(prefix.length).split(':');
  return targetProfileId ? { targetProfileId, filter: decodeDiscoveryFilter(rawFilter) } : null;
}

function encodeDiscoveryFilter(filter: DiscoveryFilter): string {
  return filter === 'Todos' ? 'all' : String(LOOKING_FOR_OPTIONS.indexOf(filter));
}

function decodeDiscoveryFilter(rawFilter: string | undefined): DiscoveryFilter {
  if (!rawFilter || rawFilter === 'all') {
    return 'Todos';
  }

  const index = Number.parseInt(rawFilter, 10);
  return LOOKING_FOR_OPTIONS[index] ?? 'Todos';
}

function parseDiscoveryFilter(rawFilter: string | null): DiscoveryFilter {
  if (rawFilter === 'Todos' || LOOKING_FOR_OPTIONS.includes(rawFilter as LookingForOption)) {
    return rawFilter as DiscoveryFilter;
  }

  return 'Todos';
}

function parsePublicDiscoveryFilter(action: string): DiscoveryFilter {
  return decodeDiscoveryFilter(action.replace(/^filter_/, ''));
}

function normalizeDiscoveryFilter(filter: DiscoveryFilter): LookingForOption | null {
  return filter === 'Todos' ? null : filter;
}

function isDiscoveryAction(action: string | undefined): action is DiscoveryAction {
  return action === 'like' || action === 'super_like' || action === 'pass' || action === 'block' || action === 'report' || action === 'next';
}


function buildTermsEmbed(): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('💚 Antes de entrar no SUÍNDER')
    .setDescription([
      'O SUÍNDER é um espaço opcional para conhecer pessoas da comunidade com respeito, segurança e leveza.',
      '',
      'Ao participar, você concorda que:',
      '',
      '• Tem 18 anos ou mais',
      '• Vai respeitar os outros participantes',
      '• Não vai usar o sistema para assédio, exposição ou insistência',
      '• Não vai se passar por outra pessoa',
      '• Entende que denúncias podem ser analisadas pela moderação',
      '• Pode pausar seu perfil, bloquear, denunciar ou sair quando quiser',
      '',
      'Participar é opcional. A comunidade vem em primeiro lugar.',
      '',
      `Versão dos termos: ${CURRENT_TERMS_VERSION}`
    ].join('\n'))
    .setColor(SUINDER_EMBED_COLOR);

  return applyVisualBanner(embed, 'BANNER_INICIAL');
}

function buildTermsActionRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(TERMS_ACCEPT_BUTTON_ID)
      .setLabel('Aceito e quero participar')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(TERMS_DECLINE_BUTTON_ID)
      .setLabel('Não aceito')
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildCreateProfileActionRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(PROFILE_CREATE_BUTTON_ID)
      .setLabel('Criar perfil')
      .setStyle(ButtonStyle.Primary)
  );
}

function buildProfileActionRows(profile: UserProfile): ActionRowBuilder<ButtonBuilder>[] {
  const pauseOrReactivateButton = profile.status === 'paused'
    ? new ButtonBuilder()
      .setCustomId(PROFILE_REACTIVATE_BUTTON_ID)
      .setLabel('Reativar')
      .setStyle(ButtonStyle.Success)
    : new ButtonBuilder()
      .setCustomId(PROFILE_PAUSE_BUTTON_ID)
      .setLabel('Pausar')
      .setStyle(ButtonStyle.Secondary);

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(PROFILE_EDIT_BUTTON_ID)
        .setLabel('Editar')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(PROFILE_COMPATIBILITY_BUTTON_ID)
        .setLabel('✨ Compatibilidade')
        .setStyle(ButtonStyle.Success),
      pauseOrReactivateButton,
      new ButtonBuilder()
        .setCustomId(PROFILE_DELETE_BUTTON_ID)
        .setLabel('Excluir')
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

function buildProfileModal(mode: 'create' | 'edit', profile?: UserProfile): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(mode === 'create' ? PROFILE_CREATE_MODAL_ID : PROFILE_EDIT_MODAL_ID)
    .setTitle(mode === 'create' ? 'Criar perfil SUÍNDER' : 'Editar perfil SUÍNDER')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('display_name')
          .setLabel('Apelido')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(PROFILE_NICKNAME_MAX_LENGTH)
          .setRequired(true)
          .setValue(profile?.displayName ?? '')
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('age')
          .setLabel('Idade (+18 obrigatório)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(profile?.age ? String(profile.age) : '')
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('bio')
          .setLabel('Bio curta')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(PROFILE_BIO_MAX_LENGTH)
          .setRequired(true)
          .setValue(profile?.bio ?? '')
      )
    );
}

function formatStatus(status: UserProfile['status']): string {
  const labels: Record<UserProfile['status'], string> = {
    active: 'Ativo',
    paused: 'Pausado',
    pending_review: 'Pendente de revisão',
    suspended: 'Suspenso pela moderação',
    banned: 'Banido',
    deleted: 'Excluído'
  };

  return labels[status];
}

function buildCompatibilitySelectRows(profile: UserProfile): ActionRowBuilder<StringSelectMenuBuilder>[] {
  return COMPATIBILITY_QUESTIONS.map((question) => (
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${COMPATIBILITY_SELECT_PREFIX}:${question.key}`)
        .setPlaceholder(question.label)
        .addOptions(question.options.map((option) => ({
          label: option === 'Conversa Individual' ? 'Individual' : option,
          value: option,
          default: profile.compatibilityAnswers[question.key] === option
        })))
    )
  ));
}

function parseCompatibilitySelectId(customId: string): CompatibilityQuestionKey | null {
  const [, scope, key] = customId.split(':');
  const question = scope === 'compatibility'
    ? COMPATIBILITY_QUESTIONS.find((item) => item.key === key)
    : undefined;

  return question?.key ?? null;
}

function serializeCompatibilityAnswers(answers: CompatibilityAnswers): string {
  return COMPATIBILITY_QUESTIONS
    .map((question) => answers[question.key] ? `${question.label}: ${answers[question.key]}` : undefined)
    .filter(Boolean)
    .join('; ');
}

function formatCompatibilityAnswers(answers: CompatibilityAnswers): string {
  const answerParts = COMPATIBILITY_QUESTIONS
    .map((question) => answers[question.key] ? `**${question.label}:** ${answers[question.key]}` : undefined)
    .filter(Boolean);

  return answerParts.length > 0 ? answerParts.join('\n') : 'Não informado.';
}

function formatCompatibility(profile: UserProfile): string {
  if (!profile.compatibility) {
    return '💚 Compatibilidade: não calculada nesta visualização.';
  }

  const sharedPoints = profile.compatibility.sharedPoints.length > 0
    ? `\n\nVocês combinam em:\n${profile.compatibility.sharedPoints.join('\n')}`
    : '\n\nAinda não há pontos principais em comum.';

  return `💚 Compatibilidade: ${profile.compatibility.percentage}%${sharedPoints}`;
}

async function replyEphemeral(
  interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction,
  content: string
): Promise<void> {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content, ephemeral: true });
    return;
  }

  await interaction.reply({ content, ephemeral: true });
}
