import {
  CURRENT_TERMS_VERSION,
  calculateCompatibility,
  hasAcceptedCurrentTerms,
  parseAge,
  parseCompatibilityAnswers,
  parseLookingFor,
  parseReceiveDm,
  validateAdultConsent,
  validateBio,
  validateNickname,
  type LookingForOption,
  type CompatibilityAnswers,
  type ProfileInput,
  type UserProfile
} from '../../domain/profile.js';
import type { MatchWithProfile, ProfileRepository } from '../../infrastructure/repositories/profile-repository.js';
import type { AdminLogService } from './admin-log-service.js';

export type MatchSummary = MatchWithProfile;

export interface RawProfileFormInput {
  guildId: string;
  discordUserId: string;
  avatarUrl: string;
  displayName: string;
  age: string;
  bio: string;
  lookingFor: string;
  compatibilityAnswers: string;
  receiveDm: string;
  adultConsent: string;
  termsAcceptedAt?: Date;
  termsVersion?: string;
}

export class ProfileService {
  public constructor(
    private readonly profiles: ProfileRepository,
    private readonly adminLogs: AdminLogService
  ) {}

  public async getProfile(guildId: string, discordUserId: string): Promise<UserProfile | null> {
    return this.profiles.findByDiscordUser(guildId, discordUserId);
  }

  public hasAcceptedCurrentTerms(profile: UserProfile | null): boolean {
    return Boolean(profile && hasAcceptedCurrentTerms(profile));
  }

  public async acceptTerms(guildId: string, discordUserId: string): Promise<UserProfile | null> {
    return this.profiles.acceptTerms(guildId, discordUserId, CURRENT_TERMS_VERSION);
  }

  public async listActiveMatches(guildId: string, discordUserId: string): Promise<MatchSummary[]> {
    await this.ensureMatchEnabled(guildId);
    await this.profiles.consumeRateLimit(guildId, discordUserId, 'match_list', 30);
    const viewerProfile = await this.resolveActiveProfile(guildId, discordUserId, 'listar matches');
    return this.profiles.listActiveMatchesForProfile(guildId, viewerProfile.id);
  }

  public async getMatchProfile(guildId: string, discordUserId: string, matchId: string): Promise<MatchSummary> {
    await this.ensureMatchEnabled(guildId);
    await this.profiles.consumeRateLimit(guildId, discordUserId, 'match_view', 30);
    const viewerProfile = await this.resolveActiveProfile(guildId, discordUserId, 'ver match');
    const match = await this.profiles.findActiveMatchForProfile(guildId, viewerProfile.id, matchId);

    if (!match) {
      throw new Error('Match não encontrado, encerrado ou indisponível para você.');
    }

    return match;
  }

  public async unmatch(guildId: string, discordUserId: string, matchId: string): Promise<MatchSummary[]> {
    await this.ensureMatchEnabled(guildId);
    await this.profiles.consumeRateLimit(guildId, discordUserId, 'match_action', 20);
    const viewerProfile = await this.resolveActiveProfile(guildId, discordUserId, 'desfazer match');
    const match = await this.profiles.findActiveMatchForProfile(guildId, viewerProfile.id, matchId);

    if (!match) {
      throw new Error('Match não encontrado, encerrado ou indisponível para você.');
    }

    const ended = await this.profiles.unmatch(guildId, viewerProfile.id, matchId);
    if (!ended) {
      throw new Error('Não foi possível desfazer este match.');
    }

    await this.adminLogs.record({
      guildId,
      action: 'match.ended',
      actorDiscordUserId: discordUserId,
      targetProfileId: match.matchedProfile.id,
      metadata: { matchId, status: 'unmatched' },
      message: 'Match encerrado pelo usuário no SUÍNDER.'
    });

    return this.profiles.listActiveMatchesForProfile(guildId, viewerProfile.id);
  }

  public async blockMatchedProfile(guildId: string, discordUserId: string, matchId: string): Promise<MatchSummary[]> {
    await this.profiles.consumeRateLimit(guildId, discordUserId, 'match_action', 20);
    const viewerProfile = await this.resolveActiveProfile(guildId, discordUserId, 'bloquear match');
    const match = await this.profiles.findActiveMatchForProfile(guildId, viewerProfile.id, matchId);

    if (!match) {
      throw new Error('Match não encontrado, encerrado ou indisponível para você.');
    }

    await this.profiles.blockProfile(guildId, viewerProfile.id, match.matchedProfile.id);
    await this.adminLogs.record({
      guildId,
      action: 'profile.blocked',
      actorDiscordUserId: discordUserId,
      targetProfileId: match.matchedProfile.id,
      metadata: { source: 'match', matchId },
      message: 'Usuário bloqueou um match no SUÍNDER.'
    });

    return this.profiles.listActiveMatchesForProfile(guildId, viewerProfile.id);
  }

  public async reportMatchedProfile(
    guildId: string,
    discordUserId: string,
    matchId: string,
    reason: string,
    details?: string,
    filter?: LookingForOption | null
  ): Promise<{ reportId: string; created: boolean; matches: MatchSummary[] }> {
    await this.ensureReportsEnabled(guildId);
    await this.profiles.consumeRateLimit(guildId, discordUserId, 'match_report', 10);
    const viewerProfile = await this.resolveActiveProfile(guildId, discordUserId, 'denunciar match');
    const match = await this.profiles.findActiveMatchForProfile(guildId, viewerProfile.id, matchId);

    if (!match) {
      throw new Error('Match não encontrado, encerrado ou indisponível para você.');
    }

    const normalizedReason = reason.trim();
    const normalizedDetails = details?.trim() ?? '';

    if (!normalizedReason) {
      throw new Error('Motivo da denúncia é obrigatório.');
    }

    const description = [
      `Motivo: ${normalizedReason}`,
      normalizedDetails ? `Detalhes: ${normalizedDetails}` : undefined
    ].filter(Boolean).join('\n');

    const report = await this.profiles.createReport(guildId, viewerProfile.id, match.matchedProfile.id, description);
    await this.profiles.blockProfile(guildId, viewerProfile.id, match.matchedProfile.id);
    await this.adminLogs.record({
      guildId,
      action: 'profile.reported',
      actorDiscordUserId: discordUserId,
      targetProfileId: match.matchedProfile.id,
      metadata: { reportId: report.id, created: report.created, autoBlocked: true, source: 'match', matchId },
      message: 'Denúncia de match registrada no SUÍNDER; bloqueio automático aplicado para segurança.'
    });

    return {
      reportId: report.id,
      created: report.created,
      matches: await this.profiles.listActiveMatchesForProfile(guildId, viewerProfile.id)
    };
  }

  public async findNextDiscoverableProfile(guildId: string, discordUserId: string, filter?: LookingForOption | null): Promise<UserProfile | null> {
    const viewerProfile = await this.profiles.findByDiscordUser(guildId, discordUserId);

    if (!viewerProfile) {
      throw new Error('Você precisa criar um perfil antes de descobrir outros perfis.');
    }

    this.ensureCurrentTerms(viewerProfile);

    if (viewerProfile.status !== 'active') {
      throw new Error('Seu perfil precisa estar ativo para usar a descoberta.');
    }

    if (!viewerProfile.consentedAt || (viewerProfile.age ?? 0) < 18 || viewerProfile.lookingFor.length === 0) {
      throw new Error('Seu perfil precisa estar completo, com +18, consentimento e interesses válidos.');
    }

    return this.withCompatibility(viewerProfile, await this.profiles.findNextDiscoverableProfile(guildId, viewerProfile.id, filter));
  }

  public async likeDiscoveredProfile(
    guildId: string,
    discordUserId: string,
    targetProfileId: string,
    filter?: LookingForOption | null
  ): Promise<{ matched: boolean; matchCreated: boolean; matchId: string | null; targetProfile: UserProfile; nextProfile: UserProfile | null }> {
    await this.ensureMatchEnabled(guildId);
    await this.profiles.consumeRateLimit(guildId, discordUserId, 'discovery_like', 30);
    const { viewerProfile, targetProfile } = await this.resolveDiscoveryActionProfiles(guildId, discordUserId, targetProfileId);

    if (!isEligibleDiscoveryTarget(targetProfile)) {
      throw new Error('Este perfil não está elegível para curtida.');
    }

    const like = await this.profiles.recordLikeAndMaybeCreateMatch(guildId, discordUserId, viewerProfile.id, targetProfile.id);

    if (like.matchCreated) {
      await this.adminLogs.record({
        guildId,
        action: 'match.created',
        actorDiscordUserId: discordUserId,
        targetProfileId: targetProfile.id,
        metadata: { matchId: like.matchId },
        message: 'Match criado no SUÍNDER.'
      });
    }

    return {
      matched: like.matched,
      matchCreated: like.matchCreated,
      matchId: like.matchId,
      targetProfile,
      nextProfile: this.withCompatibility(viewerProfile, await this.profiles.findNextDiscoverableProfile(guildId, viewerProfile.id, filter))
    };
  }

  public async superLikeDiscoveredProfile(
    guildId: string,
    discordUserId: string,
    targetProfileId: string,
    filter?: LookingForOption | null
  ): Promise<{ matched: boolean; matchCreated: boolean; matchId: string | null; targetProfile: UserProfile; nextProfile: UserProfile | null }> {
    await this.ensureMatchEnabled(guildId);
    await this.ensureSuperLikeEnabled(guildId);
    await this.profiles.consumeRateLimit(guildId, discordUserId, 'discovery_super_like', 10);
    const { viewerProfile, targetProfile } = await this.resolveDiscoveryActionProfiles(guildId, discordUserId, targetProfileId);

    if (!isEligibleDiscoveryTarget(targetProfile)) {
      throw new Error('Este perfil não está elegível para Super Like.');
    }

    const superLike = await this.profiles.recordSuperLikeAndMaybeCreateMatch(
      guildId,
      discordUserId,
      viewerProfile.id,
      targetProfile.id
    );

    if (superLike.matchCreated) {
      await this.adminLogs.record({
        guildId,
        action: 'match.super_created',
        actorDiscordUserId: discordUserId,
        targetProfileId: targetProfile.id,
        metadata: { matchId: superLike.matchId, isSuperMatch: true },
        message: 'Super Match criado no SUÍNDER.'
      });
    }

    return {
      matched: superLike.matched,
      matchCreated: superLike.matchCreated,
      matchId: superLike.matchId,
      targetProfile,
      nextProfile: this.withCompatibility(viewerProfile, await this.profiles.findNextDiscoverableProfile(guildId, viewerProfile.id, filter))
    };
  }

  public async passDiscoveredProfile(guildId: string, discordUserId: string, targetProfileId: string, filter?: LookingForOption | null): Promise<UserProfile | null> {
    await this.profiles.consumeRateLimit(guildId, discordUserId, 'discovery_action', 30);
    const { viewerProfile, targetProfile } = await this.resolveDiscoveryActionProfiles(guildId, discordUserId, targetProfileId);
    await this.profiles.recordPass(guildId, viewerProfile.id, targetProfile.id);
    return this.withCompatibility(viewerProfile, await this.profiles.findNextDiscoverableProfile(guildId, viewerProfile.id, filter));
  }

  public async blockDiscoveredProfile(guildId: string, discordUserId: string, targetProfileId: string, filter?: LookingForOption | null): Promise<UserProfile | null> {
    await this.profiles.consumeRateLimit(guildId, discordUserId, 'discovery_action', 30);
    const { viewerProfile, targetProfile } = await this.resolveDiscoveryActionProfiles(guildId, discordUserId, targetProfileId);
    await this.profiles.blockProfile(guildId, viewerProfile.id, targetProfile.id);
    await this.adminLogs.record({
      guildId,
      action: 'profile.blocked',
      actorDiscordUserId: discordUserId,
      targetProfileId: targetProfile.id,
      metadata: { source: 'discovery' },
      message: 'Usuário bloqueou outro perfil no SUÍNDER.'
    });

    return this.withCompatibility(viewerProfile, await this.profiles.findNextDiscoverableProfile(guildId, viewerProfile.id, filter));
  }

  public async reportDiscoveredProfile(
    guildId: string,
    discordUserId: string,
    targetProfileId: string,
    reason: string,
    details?: string,
    filter?: LookingForOption | null
  ): Promise<{ reportId: string; created: boolean; nextProfile: UserProfile | null }> {
    await this.ensureReportsEnabled(guildId);
    await this.profiles.consumeRateLimit(guildId, discordUserId, 'discovery_report', 10);
    const { viewerProfile, targetProfile } = await this.resolveDiscoveryActionProfiles(guildId, discordUserId, targetProfileId);
    const normalizedReason = reason.trim();
    const normalizedDetails = details?.trim() ?? '';

    if (!normalizedReason) {
      throw new Error('Motivo da denúncia é obrigatório.');
    }

    const description = [
      `Motivo: ${normalizedReason}`,
      normalizedDetails ? `Detalhes: ${normalizedDetails}` : undefined
    ].filter(Boolean).join('\n');

    const report = await this.profiles.createReport(guildId, viewerProfile.id, targetProfile.id, description);
    await this.profiles.blockProfile(guildId, viewerProfile.id, targetProfile.id);
    await this.adminLogs.record({
      guildId,
      action: 'profile.reported',
      actorDiscordUserId: discordUserId,
      targetProfileId: targetProfile.id,
      metadata: { reportId: report.id, created: report.created, autoBlocked: true },
      message: 'Denúncia registrada no SUÍNDER; bloqueio automático aplicado para segurança.'
    });

    return {
      reportId: report.id,
      created: report.created,
      nextProfile: this.withCompatibility(viewerProfile, await this.profiles.findNextDiscoverableProfile(guildId, viewerProfile.id, filter))
    };
  }

  public async createProfile(input: RawProfileFormInput): Promise<UserProfile> {
    const existingProfile = await this.profiles.findByDiscordUser(input.guildId, input.discordUserId);
    if (existingProfile) {
      throw new Error('Você já possui um perfil no SUÍNDER.');
    }

    const profileInput = normalizeProfileInput(input);
    this.ensureCurrentTermsInput(profileInput);
    const requireReview = await this.profiles.shouldRequireProfileReview(input.guildId);
    const profile = await this.profiles.create(profileInput, requireReview ? 'pending_review' : 'active');

    await this.adminLogs.record({
      guildId: input.guildId,
      action: 'profile.created',
      actorDiscordUserId: input.discordUserId,
      targetProfileId: profile.id,
      metadata: { status: profile.status, receiveDm: profile.receiveDm },
      message: `Perfil criado com status ${profile.status}.`
    });

    return profile;
  }

  public async updateProfile(profileId: string, input: RawProfileFormInput): Promise<UserProfile> {
    const profileInput = normalizeProfileInput(input);
    const profile = await this.profiles.update(input.guildId, profileId, {
      displayName: profileInput.displayName,
      age: profileInput.age,
      bio: profileInput.bio,
      lookingFor: profileInput.lookingFor,
      compatibilityAnswers: profileInput.compatibilityAnswers,
      receiveDm: profileInput.receiveDm,
      consentedAt: profileInput.consentedAt
    });

    await this.adminLogs.record({
      guildId: input.guildId,
      action: 'profile.edited',
      actorDiscordUserId: input.discordUserId,
      targetProfileId: profile.id,
      metadata: { status: profile.status, receiveDm: profile.receiveDm },
      message: 'Perfil editado.'
    });

    return profile;
  }

  public async pauseProfile(profile: UserProfile): Promise<UserProfile> {
    if (profile.status === 'paused') {
      return profile;
    }

    const updatedProfile = await this.profiles.setStatus(profile.guildId, profile.id, 'paused');
    await this.adminLogs.record({
      guildId: profile.guildId,
      action: 'profile.paused',
      actorDiscordUserId: profile.discordUserId,
      targetProfileId: profile.id,
      metadata: { previousStatus: profile.status },
      message: 'Perfil pausado pelo usuário.'
    });

    return updatedProfile;
  }

  public async reactivateProfile(profile: UserProfile): Promise<UserProfile> {
    if (profile.status !== 'paused') {
      return profile;
    }

    const requireReview = await this.profiles.shouldRequireProfileReview(profile.guildId);
    const updatedProfile = await this.profiles.setStatus(profile.guildId, profile.id, requireReview ? 'pending_review' : 'active');
    await this.adminLogs.record({
      guildId: profile.guildId,
      action: 'profile.reactivated',
      actorDiscordUserId: profile.discordUserId,
      targetProfileId: profile.id,
      metadata: { status: updatedProfile.status },
      message: `Perfil reativado com status ${updatedProfile.status}.`
    });

    return updatedProfile;
  }

  public async deleteProfile(profile: UserProfile): Promise<UserProfile> {
    return this.profiles.setStatus(profile.guildId, profile.id, 'deleted');
  }

  public async ensureMatchEnabled(guildId: string): Promise<void> {
    if (!await this.profiles.isMatchEnabled(guildId)) {
      throw new Error('O sistema de match está desativado neste servidor.');
    }
  }

  public async ensureSuperLikeEnabled(guildId: string): Promise<void> {
    if (!await this.profiles.isSuperLikeEnabled(guildId)) {
      throw new Error('O Super Like está desativado neste servidor.');
    }
  }

  public async ensureReportsEnabled(guildId: string): Promise<void> {
    if (!await this.profiles.areReportsEnabled(guildId)) {
      throw new Error('O sistema de denúncias está desativado neste servidor.');
    }
  }


  private ensureCurrentTerms(profile: UserProfile): void {
    if (!hasAcceptedCurrentTerms(profile)) {
      throw new Error('Você precisa aceitar os termos atuais do SUÍNDER antes de continuar.');
    }
  }

  private ensureCurrentTermsInput(input: ProfileInput): void {
    if (input.termsVersion !== CURRENT_TERMS_VERSION || !input.termsAcceptedAt) {
      throw new Error('Aceite os termos atuais do SUÍNDER antes de criar seu perfil.');
    }
  }

  private withCompatibility(viewerProfile: UserProfile, targetProfile: UserProfile | null): UserProfile | null {
    if (!targetProfile) {
      return null;
    }

    return {
      ...targetProfile,
      compatibility: calculateCompatibility(viewerProfile, targetProfile)
    };
  }

  private async resolveActiveProfile(guildId: string, discordUserId: string, actionDescription: string): Promise<UserProfile> {
    const viewerProfile = await this.profiles.findByDiscordUser(guildId, discordUserId);
    if (!viewerProfile) {
      throw new Error(`Você precisa criar um perfil antes de ${actionDescription}.`);
    }

    this.ensureCurrentTerms(viewerProfile);

    if (viewerProfile.status !== 'active') {
      throw new Error(`Seu perfil precisa estar ativo para ${actionDescription}.`);
    }

    return viewerProfile;
  }

  private async resolveDiscoveryActionProfiles(
    guildId: string,
    discordUserId: string,
    targetProfileId: string
  ): Promise<{ viewerProfile: UserProfile; targetProfile: UserProfile }> {
    const viewerProfile = await this.profiles.findByDiscordUser(guildId, discordUserId);
    if (!viewerProfile) {
      throw new Error('Você precisa criar um perfil antes de usar ações da descoberta.');
    }

    this.ensureCurrentTerms(viewerProfile);

    if (viewerProfile.status !== 'active') {
      throw new Error('Seu perfil precisa estar ativo para usar ações da descoberta.');
    }

    const targetProfile = await this.profiles.findById(guildId, targetProfileId);
    if (!targetProfile) {
      throw new Error('Perfil alvo não encontrado.');
    }

    if (viewerProfile.id === targetProfile.id) {
      throw new Error('Você não pode executar essa ação no próprio perfil.');
    }

    return { viewerProfile, targetProfile };
  }
}

function isEligibleDiscoveryTarget(profile: UserProfile): boolean {
  return profile.status === 'active'
    && (profile.age ?? 0) >= 18
    && Boolean(profile.consentedAt)
    && hasAcceptedCurrentTerms(profile)
    && profile.lookingFor.length > 0;
}

function normalizeProfileInput(input: RawProfileFormInput): ProfileInput {
  validateAdultConsent(input.adultConsent);
  const compatibilityAnswers: CompatibilityAnswers = parseCompatibilityAnswers(input.compatibilityAnswers);

  return {
    guildId: input.guildId,
    discordUserId: input.discordUserId,
    displayName: validateNickname(input.displayName),
    age: parseAge(input.age),
    bio: validateBio(input.bio),
    lookingFor: parseLookingFor(input.lookingFor),
    compatibilityAnswers,
    termsAcceptedAt: input.termsAcceptedAt ?? new Date(0),
    termsVersion: input.termsVersion ?? '',
    receiveDm: parseReceiveDm(input.receiveDm),
    avatarUrl: input.avatarUrl,
    consentedAt: new Date()
  };
}
