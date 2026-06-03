import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from 'discord.js';
import { LOOKING_FOR_OPTIONS } from '../domain/profile.js';
import { applyVisualBanner } from './visual-assets.js';

export const PUBLIC_PANEL_BUTTON_PREFIX = 'suinder:public';

export type PublicPanelAction =
  | 'profile'
  | 'discover'
  | 'matches'
  | 'pause'
  | 'help'
  | 'filter_all'
  | 'filter_0'
  | 'filter_1'
  | 'filter_2'
  | 'filter_3'
  | 'filter_4'
  | 'filter_5';

const filterActions = ['filter_all', ...LOOKING_FOR_OPTIONS.map((_, index) => `filter_${index}`)] as PublicPanelAction[];

export function buildPublicPanelButtonId(action: PublicPanelAction): string {
  return `${PUBLIC_PANEL_BUTTON_PREFIX}:${action}`;
}

export function parsePublicPanelButtonId(customId: string): PublicPanelAction | null {
  if (!customId.startsWith(`${PUBLIC_PANEL_BUTTON_PREFIX}:`)) {
    return null;
  }

  const action = customId.slice(`${PUBLIC_PANEL_BUTTON_PREFIX}:`.length);
  if (['profile', 'discover', 'matches', 'pause', 'help', ...filterActions].includes(action as PublicPanelAction)) {
    return action as PublicPanelAction;
  }

  return null;
}

export function buildPublicPanelEmbed(): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('SUÍNDER — acesso rápido')
    .setDescription([
      'Use os botões abaixo para acessar os principais fluxos do SUÍNDER sem precisar digitar slash commands.',
      'Todas as respostas dos botões são efêmeras e só aparecem para quem clicou.',
      'Os filtros de descoberta valem apenas para a sessão aberta pelo botão e não alteram seu perfil salvo.',
      'Participação opcional, restrita a pessoas **+18**, com foco em conexões sociais na comunidade Suíte.'
    ].join('\n'))
    .setColor(0xff5c8a);

  return applyVisualBanner(embed, 'BANNER_INICIAL');
}

export function buildPublicPanelActionRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildPublicPanelButtonId('profile'))
        .setLabel('Criar/Ver Perfil')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(buildPublicPanelButtonId('discover'))
        .setLabel('Descobrir Pessoas')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(buildPublicPanelButtonId('matches'))
        .setLabel('Meus Matches')
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildPublicPanelButtonId('pause'))
        .setLabel('Pausar/Reativar Perfil')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(buildPublicPanelButtonId('help'))
        .setLabel('Ajuda')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(buildPublicPanelButtonId('filter_all'))
        .setLabel('Filtro: Todos')
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...LOOKING_FOR_OPTIONS.slice(0, 4).map((option, index) => new ButtonBuilder()
        .setCustomId(buildPublicPanelButtonId(`filter_${index}` as PublicPanelAction))
        .setLabel(`Filtro: ${option}`)
        .setStyle(ButtonStyle.Secondary))
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...LOOKING_FOR_OPTIONS.slice(4).map((option, offset) => new ButtonBuilder()
        .setCustomId(buildPublicPanelButtonId(`filter_${offset + 4}` as PublicPanelAction))
        .setLabel(`Filtro: ${option}`)
        .setStyle(ButtonStyle.Secondary))
    )
  ];
}
