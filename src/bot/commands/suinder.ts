import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  userMention,
  type ButtonInteraction,
  type ModalSubmitInteraction
} from 'discord.js';
import type { AppContext } from '../../application/context.js';
import type { MatchSummary, RawProfileFormInput } from '../../application/services/profile-service.js';
import {
  LOOKING_FOR_OPTIONS,
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_NICKNAME_MAX_LENGTH,
  type UserProfile
} from '../../domain/profile.js';
import type { SlashCommand } from './types.js';

const PROFILE_CREATE_BUTTON_ID = 'suinder:profile:create';
const PROFILE_EDIT_BUTTON_ID = 'suinder:profile:edit';
const PROFILE_PAUSE_BUTTON_ID = 'suinder:profile:pause';
const PROFILE_REACTIVATE_BUTTON_ID = 'suinder:profile:reactivate';
const PROFILE_DELETE_BUTTON_ID = 'suinder:profile:delete';
const PROFILE_CREATE_MODAL_ID = 'suinder:profile:create-modal';
const PROFILE_EDIT_MODAL_ID = 'suinder:profile:edit-modal';
const DISCOVERY_REPORT_MODAL_PREFIX = 'suinder:discover-report';
const MATCH_REPORT_MODAL_PREFIX = 'suinder:match-report';
type MatchAction = 'view' | 'unmatch' | 'block' | 'report';
type DiscoveryAction = 'like' | 'pass' | 'block' | 'report' | 'next';

const reportCategories = [
  { name: 'Assédio', value: 'harassment' },
  { name: 'Perfil inadequado', value: 'inappropriate_profile' },
  { name: 'Spam', value: 'spam' },
  { name: 'Falsa identidade', value: 'impersonation' },
  { name: 'Outro', value: 'other' }
] as const;

async function ensureConfiguredGuild(
  interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction,
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
        content: buildStartPanel(),
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
      await showDiscoverableProfile(interaction, context);
      return;
    }

    if (subcommand === 'matches') {
      await showMatches(interaction, context);
      return;
    }

    if (subcommand === 'pausar') {
      const guildId = interaction.guildId ?? context.config.DISCORD_GUILD_ID;
      const profile = await context.profiles.getProfile(guildId, interaction.user.id);
      if (!profile) {
        await interaction.reply({ content: 'Você ainda não tem perfil para pausar. Use `/suinder perfil` para criar.', ephemeral: true });
        return;
      }

      const updatedProfile = await context.profiles.pauseProfile(profile);
      await interaction.reply({
        content: `⏸️ Perfil pausado. Status atual: **${formatStatus(updatedProfile.status)}**.`,
        ephemeral: true
      });
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
  if (!interaction.customId.startsWith('suinder:profile:') && !interaction.customId.startsWith('suinder:discover:') && !interaction.customId.startsWith('suinder:match:')) {
    return false;
  }

  if (!(await ensureConfiguredGuild(interaction, context))) {
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
      await interaction.reply({ content: 'Você já possui um perfil. Use `/suinder perfil` para editar ou gerenciar.', ephemeral: true });
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

  if (interaction.customId === PROFILE_EDIT_BUTTON_ID) {
    await interaction.showModal(buildProfileModal('edit', profile));
    return true;
  }

  if (interaction.customId === PROFILE_PAUSE_BUTTON_ID) {
    const updatedProfile = await context.profiles.pauseProfile(profile);
    await interaction.update({ content: buildProfilePanel(updatedProfile), components: buildProfileActionRows(updatedProfile) });
    return true;
  }

  if (interaction.customId === PROFILE_REACTIVATE_BUTTON_ID) {
    const updatedProfile = await context.profiles.reactivateProfile(profile);
    await interaction.update({ content: buildProfilePanel(updatedProfile), components: buildProfileActionRows(updatedProfile) });
    return true;
  }

  if (interaction.customId === PROFILE_DELETE_BUTTON_ID) {
    await context.profiles.deleteProfile(profile);
    await interaction.update({
      content: '🗑️ Seu perfil foi excluído. Você poderá criar um novo perfil usando `/suinder perfil`.',
      components: [buildCreateProfileActionRow()]
    });
    return true;
  }

  return false;
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

  const dmAndConsent = splitReceiveDmAndConsent(interaction.fields.getTextInputValue('receive_dm'));
  const input = {
    guildId: interaction.guildId ?? context.config.DISCORD_GUILD_ID,
    discordUserId: interaction.user.id,
    avatarUrl: interaction.user.displayAvatarURL({ size: 256 }),
    displayName: interaction.fields.getTextInputValue('display_name'),
    age: interaction.fields.getTextInputValue('age'),
    bio: interaction.fields.getTextInputValue('bio'),
    lookingFor: interaction.fields.getTextInputValue('looking_for'),
    receiveDm: dmAndConsent.receiveDm,
    adultConsent: dmAndConsent.adultConsent
  };

  try {
    const profile = interaction.customId === PROFILE_CREATE_MODAL_ID
      ? await context.profiles.createProfile(input)
      : await updateExistingProfile(interaction, context, input);

    await interaction.reply({
      content: buildProfilePanel(profile),
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

async function showProfilePanel(interaction: ChatInputCommandInteraction, context: AppContext): Promise<void> {
  const guildId = interaction.guildId ?? context.config.DISCORD_GUILD_ID;
  const profile = await context.profiles.getProfile(guildId, interaction.user.id);

  if (!profile) {
    await interaction.reply({
      content: [
        '👤 Você ainda não tem perfil no SUÍNDER.',
        '',
        'A criação é opcional, restrita a pessoas **+18**, e usa seu avatar atual do Discord como foto padrão.',
        'Clique no botão abaixo para abrir o formulário efêmero de criação.'
      ].join('\n'),
      components: [buildCreateProfileActionRow()],
      ephemeral: true
    });
    return;
  }

  await interaction.reply({
    content: buildProfilePanel(profile),
    components: buildProfileActionRows(profile),
    ephemeral: true
  });
}

async function showDiscoverableProfile(interaction: ChatInputCommandInteraction, context: AppContext): Promise<void> {
  const guildId = interaction.guildId ?? context.config.DISCORD_GUILD_ID;

  try {
    const profile = await context.profiles.findNextDiscoverableProfile(guildId, interaction.user.id);

    if (!profile) {
      await interaction.reply({
        content: [
          '🔎 Nenhum perfil elegível encontrado agora.',
          '',
          'Perfis pausados, pendentes, suspensos, banidos, deletados, bloqueados ou já passados não aparecem na descoberta.'
        ].join('\n'),
        ephemeral: true
      });
      return;
    }

    await interaction.reply({
      content: '🔎 Perfil encontrado. Esta visualização é efêmera e não registra log administrativo.',
      embeds: [buildDiscoveryProfileEmbed(profile)],
      components: buildDiscoveryActionRows(profile),
      ephemeral: true
    });
  } catch (error) {
    await interaction.reply({
      content: `⚠️ Não foi possível abrir a descoberta: ${error instanceof Error ? error.message : String(error)}`,
      ephemeral: true
    });
  }
}


async function showMatches(interaction: ChatInputCommandInteraction, context: AppContext): Promise<void> {
  const guildId = interaction.guildId ?? context.config.DISCORD_GUILD_ID;

  try {
    const matches = await context.profiles.listActiveMatches(guildId, interaction.user.id);

    if (matches.length === 0) {
      await interaction.reply({
        content: [
          '💞 Você ainda não tem matches ativos no SUÍNDER.',
          '',
          'Quando uma curtida for recíproca, o match aparecerá aqui. Matches bloqueados, deletados ou encerrados não são exibidos.'
        ].join('\n'),
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

function buildMatchesEmbed(matches: MatchSummary[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('Matches ativos do SUÍNDER')
    .setColor(0xff5c8a)
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

  return embed;
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
    .setColor(0xff5c8a);

  if (profile.avatarUrl) {
    embed.setImage(profile.avatarUrl);
  }

  return embed;
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

function buildStartPanel(): string {
  return [
    '💘 **SUÍNDER — Conexões sociais da comunidade Suíte**',
    '',
    '• Participar é **opcional**.',
    '• A V1 é restrita a pessoas **+18**.',
    '• O foco é conexão social: romance, amizades, jogos, filmes/séries, música, calls e conversas.',
    '• A V1 já possui perfil, descoberta, curtida, match, bloqueio e denúncia; não há modo anônimo, upload de imagem ou IA.',
    '• Todas as ações deste painel são efêmeras.'
  ].join('\n');
}

function buildProfilePanel(profile: UserProfile): string {
  return [
    '👤 **Seu perfil SUÍNDER**',
    '',
    `**Apelido:** ${profile.displayName}`,
    `**Idade:** ${profile.age ?? 'não informada'}`,
    `**Bio:** ${profile.bio || 'Sem bio.'}`,
    `**Procura:** ${profile.lookingFor.join(', ') || 'Não informado'}`,
    `**Receber DM:** ${profile.receiveDm ? 'Sim' : 'Não'}`,
    `**Foto padrão:** avatar atual do Discord${profile.avatarUrl ? ` (${profile.avatarUrl})` : ''}`,
    `**Status:** ${formatStatus(profile.status)}`
  ].join('\n');
}

function buildDiscoveryProfileEmbed(profile: UserProfile): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(profile.displayName)
    .setDescription(profile.bio || 'Sem bio.')
    .addFields(
      { name: 'Idade', value: String(profile.age ?? 'Não informada'), inline: true },
      { name: 'Procura', value: profile.lookingFor.join(', '), inline: false },
      { name: 'Segurança', value: 'Respeite consentimento e limites. Use bloquear/denunciar se algo parecer inadequado.', inline: false }
    )
    .setColor(0xff5c8a);

  if (profile.avatarUrl) {
    embed.setImage(profile.avatarUrl);
  }

  return embed;
}

function buildDiscoveryActionRows(profile: UserProfile): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildDiscoveryButtonId('like', profile.id))
        .setLabel('Curtir')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(buildDiscoveryButtonId('pass', profile.id))
        .setLabel('Passar')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(buildDiscoveryButtonId('next', profile.id))
        .setLabel('Próximo')
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildDiscoveryButtonId('block', profile.id))
        .setLabel('Bloquear')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(buildDiscoveryButtonId('report', profile.id))
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
      embeds: [],
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
      embeds: [],
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
    await handleDiscoveryLike(interaction, context, parsed.targetProfileId);
    return;
  }

  if (parsed.action === 'report') {
    await interaction.showModal(buildDiscoveryReportModal(parsed.targetProfileId));
    return;
  }

  try {
    const guildId = interaction.guildId ?? context.config.DISCORD_GUILD_ID;
    const nextProfile = parsed.action === 'block'
      ? await context.profiles.blockDiscoveredProfile(guildId, interaction.user.id, parsed.targetProfileId)
      : await context.profiles.passDiscoveredProfile(guildId, interaction.user.id, parsed.targetProfileId);
    const message = parsed.action === 'block'
      ? '🛡️ Bloqueio registrado. Esse perfil não aparecerá novamente e a descoberta em ambas as direções foi impedida.'
      : '➡️ Perfil descartado temporariamente. Ele não deve reaparecer enquanto o descarte estiver válido.';

    await updateDiscoveryMessage(interaction, message, nextProfile);
  } catch (error) {
    await interaction.reply({
      content: `⚠️ Não foi possível executar a ação: ${error instanceof Error ? error.message : String(error)}`,
      ephemeral: true
    });
  }
}

async function handleDiscoveryLike(interaction: ButtonInteraction, context: AppContext, targetProfileId: string): Promise<void> {
  try {
    const guildId = interaction.guildId ?? context.config.DISCORD_GUILD_ID;
    const result = await context.profiles.likeDiscoveredProfile(guildId, interaction.user.id, targetProfileId);

    if (result.matched) {
      await sendMatchDms(context, interaction.user.id, result.targetProfile);
    }

    const message = result.matched
      ? '💖 Deu match! Tentamos enviar DM para vocês dois, mas a entrega pode falhar se alguém estiver com DM fechada.'
      : '💌 Curtida enviada.';

    await updateDiscoveryMessage(interaction, message, result.nextProfile);
  } catch (error) {
    await interaction.reply({
      content: `⚠️ Não foi possível curtir: ${error instanceof Error ? error.message : String(error)}`,
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

async function handleDiscoveryReportSubmit(interaction: ModalSubmitInteraction, context: AppContext): Promise<void> {
  const targetProfileId = parseDiscoveryReportModalId(interaction.customId);
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
      interaction.fields.getTextInputValue('report_details') || undefined
    );
    const status = result.created ? 'Denúncia registrada.' : 'Você já tinha uma denúncia aberta para esse perfil.';
    await replyWithDiscoveryMessage(
      interaction,
      `🚩 ${status} Por segurança, o perfil denunciado foi bloqueado automaticamente para você.`,
      result.nextProfile
    );
  } catch (error) {
    await interaction.reply({
      content: `⚠️ Não foi possível registrar a denúncia: ${error instanceof Error ? error.message : String(error)}`,
      ephemeral: true
    });
  }
}

async function updateDiscoveryMessage(interaction: ButtonInteraction, message: string, nextProfile: UserProfile | null): Promise<void> {
  if (!nextProfile) {
    await interaction.update({
      content: `${message}

🔎 Nenhum outro perfil elegível encontrado agora.`,
      embeds: [],
      components: []
    });
    return;
  }

  await interaction.update({
    content: `${message}

🔎 Próximo perfil elegível:`,
    embeds: [buildDiscoveryProfileEmbed(nextProfile)],
    components: buildDiscoveryActionRows(nextProfile)
  });
}

async function replyWithDiscoveryMessage(interaction: ModalSubmitInteraction, message: string, nextProfile: UserProfile | null): Promise<void> {
  if (!nextProfile) {
    await interaction.reply({
      content: `${message}

🔎 Nenhum outro perfil elegível encontrado agora.`,
      embeds: [],
      components: [],
      ephemeral: true
    });
    return;
  }

  await interaction.reply({
    content: `${message}

🔎 Próximo perfil elegível:`,
    embeds: [buildDiscoveryProfileEmbed(nextProfile)],
    components: buildDiscoveryActionRows(nextProfile),
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

function buildDiscoveryReportModal(targetProfileId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${DISCOVERY_REPORT_MODAL_PREFIX}:${targetProfileId}`)
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

function buildDiscoveryButtonId(action: DiscoveryAction, targetProfileId: string): string {
  return `suinder:discover:${action}:${targetProfileId}`;
}

function parseDiscoveryButtonId(customId: string): { action: DiscoveryAction; targetProfileId: string } | null {
  const [, scope, action, targetProfileId] = customId.split(':');
  if (scope !== 'discover' || !isDiscoveryAction(action) || !targetProfileId) {
    return null;
  }

  return { action, targetProfileId };
}

function parseDiscoveryReportModalId(customId: string): string | null {
  const prefix = `${DISCOVERY_REPORT_MODAL_PREFIX}:`;
  return customId.startsWith(prefix) ? customId.slice(prefix.length) || null : null;
}

function isDiscoveryAction(action: string | undefined): action is DiscoveryAction {
  return action === 'like' || action === 'pass' || action === 'block' || action === 'report' || action === 'next';
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
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('looking_for')
          .setLabel('O que procura? Separe por vírgulas')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(LOOKING_FOR_OPTIONS.join(', '))
          .setRequired(true)
          .setValue(profile?.lookingFor.join(', ') ?? '')
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('receive_dm')
          .setLabel('Receber DM? Sim ou Não + confirme +18')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Exemplo: Sim; +18: Sim')
          .setRequired(true)
          .setValue(profile ? `${profile.receiveDm ? 'Sim' : 'Não'}; +18: Sim` : '')
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

function splitReceiveDmAndConsent(rawValue: string): { receiveDm: string; adultConsent: string } {
  const [receiveDm = '', adultConsent = ''] = rawValue.split(';').map((value) => value.replace(/^\+?18\s*:/i, '').trim());
  return { receiveDm, adultConsent };
}

async function replyEphemeral(
  interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction,
  content: string
): Promise<void> {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content, ephemeral: true });
    return;
  }

  await interaction.reply({ content, ephemeral: true });
}
