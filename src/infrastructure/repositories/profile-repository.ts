import type { CompatibilityAnswers, LookingForOption, ProfileInput, ProfileStatus, UserProfile } from '../../domain/profile.js';
import type { DatabasePool } from '../database/client.js';

interface ReportRow {
  id: string;
}

interface MatchRow {
  id: string;
}

interface SuperLikeUsageRow {
  id: string;
}

interface MatchWithProfileRow extends ProfileRow {
  match_id: string;
  match_status: MatchStatus;
  match_created_at: Date;
}

export type MatchStatus = 'active' | 'blocked' | 'closed' | 'moderator_closed' | 'unmatched';

export interface MatchWithProfile {
  id: string;
  status: MatchStatus;
  createdAt: Date;
  matchedProfile: UserProfile;
}

export interface LikeResult {
  matched: boolean;
  matchCreated: boolean;
  matchId: string | null;
}

export interface SuperLikeResult extends LikeResult {
  superLikeCreated: boolean;
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

export class ProfileRepository {
  public constructor(private readonly database: DatabasePool) {}

  public async findByDiscordUser(guildId: string, discordUserId: string): Promise<UserProfile | null> {
    const result = await this.database.query<ProfileRow>(
      `
        select *
        from user_profiles
        where guild_id = $1
          and discord_user_id = $2
          and status <> 'deleted'
        limit 1
      `,
      [guildId, discordUserId]
    );

    return result.rows[0] ? mapProfileRow(result.rows[0]) : null;
  }

  public async findById(guildId: string, profileId: string): Promise<UserProfile | null> {
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

  public async create(input: ProfileInput, status: Extract<ProfileStatus, 'active' | 'pending_review'>): Promise<UserProfile> {
    const result = await this.database.query<ProfileRow>(
      `
        insert into user_profiles (
          guild_id,
          discord_user_id,
          display_name,
          age,
          bio,
          looking_for,
          compatibility_answers,
          terms_accepted_at,
          terms_version,
          receive_dm,
          avatar_url,
          status,
          consented_at
        ) values ($1, $2, $3, $4, $5, $6::text[], $7::jsonb, $8, $9, $10, $11, $12, $13)
        on conflict (guild_id, discord_user_id)
        do update set
          display_name = excluded.display_name,
          age = excluded.age,
          bio = excluded.bio,
          looking_for = excluded.looking_for,
          compatibility_answers = excluded.compatibility_answers,
          terms_accepted_at = excluded.terms_accepted_at,
          terms_version = excluded.terms_version,
          receive_dm = excluded.receive_dm,
          avatar_url = excluded.avatar_url,
          status = excluded.status,
          consented_at = excluded.consented_at,
          paused_at = null,
          updated_at = now()
        where user_profiles.status = 'deleted'
        returning *
      `,
      [
        input.guildId,
        input.discordUserId,
        input.displayName,
        input.age,
        input.bio,
        input.lookingFor,
        JSON.stringify(input.compatibilityAnswers),
        input.termsAcceptedAt,
        input.termsVersion,
        input.receiveDm,
        input.avatarUrl,
        status,
        input.consentedAt
      ]
    );

    const profile = result.rows[0];
    if (!profile) {
      throw new Error('Você já possui um perfil no SUÍNDER.');
    }

    return mapProfileRow(profile);
  }

  public async acceptTerms(guildId: string, discordUserId: string, termsVersion: string): Promise<UserProfile | null> {
    const result = await this.database.query<ProfileRow>(
      `
        update user_profiles
        set terms_accepted_at = now(),
            terms_version = $3,
            updated_at = now()
        where guild_id = $1
          and discord_user_id = $2
          and status <> 'deleted'
        returning *
      `,
      [guildId, discordUserId, termsVersion]
    );

    return result.rows[0] ? mapProfileRow(result.rows[0]) : null;
  }

  public async update(guildId: string, profileId: string, input: Omit<ProfileInput, 'guildId' | 'discordUserId' | 'avatarUrl' | 'termsAcceptedAt' | 'termsVersion'>): Promise<UserProfile> {
    const result = await this.database.query<ProfileRow>(
      `
        update user_profiles
        set display_name = $2,
            age = $3,
            bio = $4,
            looking_for = $5::text[],
            compatibility_answers = $6::jsonb,
            receive_dm = $7,
            consented_at = $8,
            updated_at = now()
        where id = $1
          and guild_id = $9
          and status <> 'deleted'
          and status not in ('suspended', 'banned')
        returning *
      `,
      [profileId, input.displayName, input.age, input.bio, input.lookingFor, JSON.stringify(input.compatibilityAnswers), input.receiveDm, input.consentedAt, guildId]
    );

    const profile = result.rows[0];
    if (!profile) {
      throw new Error('Perfil não encontrado ou indisponível para edição.');
    }

    return mapProfileRow(profile);
  }

  public async updateCompatibilityAnswers(guildId: string, profileId: string, answers: CompatibilityAnswers): Promise<UserProfile> {
    const result = await this.database.query<ProfileRow>(
      `
        update user_profiles
        set compatibility_answers = $3::jsonb,
            updated_at = now()
        where guild_id = $1
          and id = $2
          and status <> 'deleted'
          and status not in ('suspended', 'banned')
        returning *
      `,
      [guildId, profileId, JSON.stringify(answers)]
    );

    const profile = result.rows[0];
    if (!profile) {
      throw new Error('Perfil não encontrado ou indisponível para edição de compatibilidade.');
    }

    return mapProfileRow(profile);
  }

  public async setStatus(guildId: string, profileId: string, status: ProfileStatus): Promise<UserProfile> {
    const pausedAtExpression = status === 'paused' || status === 'suspended' ? 'now()' : 'null';
    const result = await this.database.query<ProfileRow>(
      `
        update user_profiles
        set status = $2,
            paused_at = ${pausedAtExpression},
            updated_at = now()
        where id = $1
          and guild_id = $3
          and status <> 'deleted'
          and status not in ('suspended', 'banned')
        returning *
      `,
      [profileId, status, guildId]
    );

    const profile = result.rows[0];
    if (!profile) {
      throw new Error('Perfil não encontrado ou indisponível para alteração.');
    }

    return mapProfileRow(profile);
  }

  public async listActiveMatchesForProfile(guildId: string, viewerProfileId: string, limit = 5): Promise<MatchWithProfile[]> {
    const result = await this.database.query<MatchWithProfileRow>(
      `
        select
          m.id as match_id,
          m.status as match_status,
          m.created_at as match_created_at,
          target.*
        from matches m
        join user_profiles target
          on target.id = case
            when m.profile_a_id = $2 then m.profile_b_id
            else m.profile_a_id
          end
        where m.guild_id = $1
          and m.status = 'active'
          and (m.profile_a_id = $2 or m.profile_b_id = $2)
          and target.guild_id = $1
          and target.status not in ('deleted', 'suspended', 'banned')
          and not exists (
            select 1
            from user_blocks block
            where block.guild_id = $1
              and (
                (block.blocker_profile_id = $2 and block.blocked_profile_id = target.id)
                or (block.blocker_profile_id = target.id and block.blocked_profile_id = $2)
              )
          )
        order by m.created_at desc
        limit $3
      `,
      [guildId, viewerProfileId, limit]
    );

    return result.rows.map(mapMatchWithProfileRow);
  }

  public async findActiveMatchForProfile(guildId: string, viewerProfileId: string, matchId: string): Promise<MatchWithProfile | null> {
    const result = await this.database.query<MatchWithProfileRow>(
      `
        select
          m.id as match_id,
          m.status as match_status,
          m.created_at as match_created_at,
          target.*
        from matches m
        join user_profiles target
          on target.id = case
            when m.profile_a_id = $2 then m.profile_b_id
            else m.profile_a_id
          end
        where m.guild_id = $1
          and m.id = $3
          and m.status = 'active'
          and (m.profile_a_id = $2 or m.profile_b_id = $2)
          and target.guild_id = $1
          and target.status not in ('deleted', 'suspended', 'banned')
          and not exists (
            select 1
            from user_blocks block
            where block.guild_id = $1
              and (
                (block.blocker_profile_id = $2 and block.blocked_profile_id = target.id)
                or (block.blocker_profile_id = target.id and block.blocked_profile_id = $2)
              )
          )
        limit 1
      `,
      [guildId, viewerProfileId, matchId]
    );

    return result.rows[0] ? mapMatchWithProfileRow(result.rows[0]) : null;
  }

  public async unmatch(guildId: string, viewerProfileId: string, matchId: string): Promise<boolean> {
    const result = await this.database.query<MatchRow>(
      `
        update matches
        set status = 'unmatched',
            updated_at = now()
        where guild_id = $1
          and id = $2
          and status = 'active'
          and (profile_a_id = $3 or profile_b_id = $3)
        returning id
      `,
      [guildId, matchId, viewerProfileId]
    );

    return Boolean(result.rows[0]);
  }

  public async findNextDiscoverableProfile(guildId: string, viewerProfileId: string, filter?: LookingForOption | null): Promise<UserProfile | null> {
    const result = await this.database.query<ProfileRow>(
      `
        select target.*
        from user_profiles target
        where target.guild_id = $1
          and target.id <> $2
          and target.status = 'active'
          and target.age >= 18
          and target.consented_at is not null
          and target.terms_accepted_at is not null
          and target.terms_version = '2026-06'
          and cardinality(target.looking_for) > 0
          and ($3::text is null or $3 = any(target.looking_for))
          and not exists (
            select 1
            from user_blocks block
            where block.guild_id = target.guild_id
              and (
                (block.blocker_profile_id = $2 and block.blocked_profile_id = target.id)
                or (block.blocker_profile_id = target.id and block.blocked_profile_id = $2)
              )
          )
          and not exists (
            select 1
            from profile_actions action
            where action.guild_id = target.guild_id
              and action.actor_profile_id = $2
              and action.target_profile_id = target.id
              and (
                action.action in ('like', 'super_like')
                or (action.action = 'pass' and action.expires_at > now())
              )
          )
        order by random()
        limit 1
      `,
      [guildId, viewerProfileId, filter ?? null]
    );

    return result.rows[0] ? mapProfileRow(result.rows[0]) : null;
  }

  public async findDiscoverableCandidates(guildId: string, viewerProfileId: string, limit = 20, filter?: LookingForOption | null): Promise<UserProfile[]> {
    const result = await this.database.query<ProfileRow>(
      `
        select target.*
        from user_profiles target
        where target.guild_id = $1
          and target.id <> $2
          and target.status = 'active'
          and target.age >= 18
          and target.consented_at is not null
          and target.terms_accepted_at is not null
          and target.terms_version = '2026-06'
          and cardinality(target.looking_for) > 0
          and ($4::text is null or $4 = any(target.looking_for))
          and not exists (
            select 1
            from user_blocks block
            where block.guild_id = target.guild_id
              and (
                (block.blocker_profile_id = $2 and block.blocked_profile_id = target.id)
                or (block.blocker_profile_id = target.id and block.blocked_profile_id = $2)
              )
          )
          and not exists (
            select 1
            from profile_actions action
            where action.guild_id = target.guild_id
              and action.actor_profile_id = $2
              and action.target_profile_id = target.id
              and (
                action.action in ('like', 'super_like')
                or (action.action = 'pass' and action.expires_at > now())
              )
          )
        order by target.updated_at desc
        limit $3
      `,
      [guildId, viewerProfileId, limit, filter ?? null]
    );

    return result.rows.map(mapProfileRow);
  }

  public async consumeRateLimit(
    guildId: string,
    discordUserId: string,
    bucket: string,
    maxCount: number
  ): Promise<void> {
    const result = await this.database.query<{ count: number }>(
      `
        insert into interaction_rate_limits (guild_id, discord_user_id, bucket, count, window_start)
        values ($1, $2, $3, 1, date_trunc('minute', now()))
        on conflict (guild_id, discord_user_id, bucket, window_start)
        do update set count = interaction_rate_limits.count + 1,
                      updated_at = now()
        returning count
      `,
      [guildId, discordUserId, bucket]
    );

    if ((result.rows[0]?.count ?? 0) > maxCount) {
      throw new Error('Muitas ações em pouco tempo. Aguarde um minuto e tente novamente.');
    }
  }

  public async recordLikeAndMaybeCreateMatch(guildId: string, actorDiscordUserId: string, actorProfileId: string, targetProfileId: string): Promise<LikeResult> {
    const client = await this.database.connect();

    try {
      await client.query('begin');
      const blocked = await client.query<{ exists: boolean }>(
        `
          select exists (
            select 1
            from user_blocks block
            where block.guild_id = $1
              and (
                (block.blocker_profile_id = $2 and block.blocked_profile_id = $3)
                or (block.blocker_profile_id = $3 and block.blocked_profile_id = $2)
              )
          ) as exists
        `,
        [guildId, actorProfileId, targetProfileId]
      );

      if (blocked.rows[0]?.exists) {
        throw new Error('Não é possível curtir um perfil bloqueado.');
      }

      const limitResult = await client.query<{ daily_like_limit: number }>(
        `
          select coalesce(
            (select daily_like_limit from guild_settings where guild_id = $1),
            30
          ) as daily_like_limit
        `,
        [guildId]
      );
      const dailyLimit = limitResult.rows[0]?.daily_like_limit ?? 30;
      const usage = await client.query<{ count: number }>(
        `
          insert into interaction_rate_limits (guild_id, discord_user_id, bucket, count, window_start)
          values ($1, $2, 'daily_like', 1, date_trunc('day', now()))
          on conflict (guild_id, discord_user_id, bucket, window_start)
          do update set count = interaction_rate_limits.count + 1,
                        updated_at = now()
          returning count
        `,
        [guildId, actorDiscordUserId]
      );

      if ((usage.rows[0]?.count ?? 0) > dailyLimit) {
        throw new Error(`Você atingiu o limite diário de ${dailyLimit} curtidas deste servidor.`);
      }

      await client.query(
        `
          insert into profile_actions (guild_id, actor_profile_id, target_profile_id, action, expires_at)
          values ($1, $2, $3, 'like', null)
          on conflict (actor_profile_id, target_profile_id)
          do update set action = 'like',
                        expires_at = null
        `,
        [guildId, actorProfileId, targetProfileId]
      );

      const reciprocal = await client.query<{ exists: boolean }>(
        `
          select exists (
            select 1
            from profile_actions action
            where action.guild_id = $1
              and action.actor_profile_id = $3
              and action.target_profile_id = $2
              and action.action in ('like', 'super_like')
          ) as exists
        `,
        [guildId, actorProfileId, targetProfileId]
      );

      if (!reciprocal.rows[0]?.exists) {
        await client.query('commit');
        return { matched: false, matchCreated: false, matchId: null };
      }

      const match = await client.query<MatchRow>(
        `
          insert into matches (guild_id, profile_a_id, profile_b_id, status)
          values ($1, least($2::uuid, $3::uuid), greatest($2::uuid, $3::uuid), 'active')
          on conflict (profile_a_id, profile_b_id) do nothing
          returning id
        `,
        [guildId, actorProfileId, targetProfileId]
      );

      if (match.rows[0]) {
        await client.query('commit');
        return { matched: true, matchCreated: true, matchId: match.rows[0].id };
      }

      const existingMatch = await client.query<MatchRow>(
        `
          select id
          from matches
          where guild_id = $1
            and profile_a_id = least($2::uuid, $3::uuid)
            and profile_b_id = greatest($2::uuid, $3::uuid)
          limit 1
        `,
        [guildId, actorProfileId, targetProfileId]
      );

      await client.query('commit');
      return { matched: true, matchCreated: false, matchId: existingMatch.rows[0]?.id ?? null };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  public async recordSuperLikeAndMaybeCreateMatch(
    guildId: string,
    actorDiscordUserId: string,
    actorProfileId: string,
    targetProfileId: string
  ): Promise<SuperLikeResult> {
    const client = await this.database.connect();

    try {
      await client.query('begin');
      const blocked = await client.query<{ exists: boolean }>(
        `
          select exists (
            select 1
            from user_blocks block
            where block.guild_id = $1
              and (
                (block.blocker_profile_id = $3 and block.blocked_profile_id = $4)
                or (block.blocker_profile_id = $4 and block.blocked_profile_id = $3)
              )
          ) as exists
        `,
        [guildId, actorDiscordUserId, actorProfileId, targetProfileId]
      );

      if (blocked.rows[0]?.exists) {
        throw new Error('Não é possível enviar Super Like para um perfil bloqueado.');
      }

      const usage = await client.query<SuperLikeUsageRow>(
        `
          insert into super_like_usages (
            guild_id,
            actor_discord_user_id,
            actor_profile_id,
            target_profile_id,
            week_start
          ) values ($1, $2, $3, $4, date_trunc('week', now()))
          on conflict (guild_id, actor_discord_user_id, week_start) do nothing
          returning id
        `,
        [guildId, actorDiscordUserId, actorProfileId, targetProfileId]
      );

      if (!usage.rows[0]) {
        throw new Error('Você já usou seu Super Like desta semana. Tente novamente na próxima janela semanal.');
      }

      await client.query(
        `
          insert into profile_actions (guild_id, actor_profile_id, target_profile_id, action, expires_at)
          values ($1, $2, $3, 'super_like', null)
          on conflict (actor_profile_id, target_profile_id)
          do update set action = 'super_like',
                        expires_at = null
        `,
        [guildId, actorProfileId, targetProfileId]
      );

      const reciprocal = await client.query<{ exists: boolean }>(
        `
          select exists (
            select 1
            from profile_actions action
            where action.guild_id = $1
              and action.actor_profile_id = $3
              and action.target_profile_id = $2
              and action.action in ('like', 'super_like')
          ) as exists
        `,
        [guildId, actorProfileId, targetProfileId]
      );

      if (!reciprocal.rows[0]?.exists) {
        await client.query('commit');
        return { matched: false, matchCreated: false, matchId: null, superLikeCreated: true };
      }

      const match = await client.query<MatchRow>(
        `
          insert into matches (guild_id, profile_a_id, profile_b_id, status, is_super_match)
          values ($1, least($2::uuid, $3::uuid), greatest($2::uuid, $3::uuid), 'active', true)
          on conflict (profile_a_id, profile_b_id) do update set
            is_super_match = true,
            updated_at = now()
          where matches.status = 'active'
          returning id
        `,
        [guildId, actorProfileId, targetProfileId]
      );

      if (match.rows[0]) {
        await client.query('commit');
        return { matched: true, matchCreated: true, matchId: match.rows[0].id, superLikeCreated: true };
      }

      const existingMatch = await client.query<MatchRow>(
        `
          select id
          from matches
          where guild_id = $1
            and profile_a_id = least($2::uuid, $3::uuid)
            and profile_b_id = greatest($2::uuid, $3::uuid)
          limit 1
        `,
        [guildId, actorProfileId, targetProfileId]
      );

      await client.query('commit');
      return { matched: true, matchCreated: false, matchId: existingMatch.rows[0]?.id ?? null, superLikeCreated: true };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  public async recordPass(guildId: string, actorProfileId: string, targetProfileId: string): Promise<void> {
    await this.database.query(
      `
        insert into profile_actions (guild_id, actor_profile_id, target_profile_id, action, expires_at)
        values (
          $1,
          $2,
          $3,
          'pass',
          now() + (coalesce((select pass_expiration_days from guild_settings where guild_id = $1), 30) * interval '1 day')
        )
        on conflict (actor_profile_id, target_profile_id)
        do update set action = 'pass',
                      expires_at = now() + (coalesce((select pass_expiration_days from guild_settings where guild_id = $1), 30) * interval '1 day')
      `,
      [guildId, actorProfileId, targetProfileId]
    );
  }

  public async blockProfile(guildId: string, blockerProfileId: string, blockedProfileId: string): Promise<void> {
    const client = await this.database.connect();

    try {
      await client.query('begin');
      await client.query(
        `
          insert into user_blocks (guild_id, blocker_profile_id, blocked_profile_id)
          values ($1, $2, $3)
          on conflict (blocker_profile_id, blocked_profile_id) do nothing
        `,
        [guildId, blockerProfileId, blockedProfileId]
      );
      await client.query(
        `
          update matches
          set status = 'blocked',
              updated_at = now()
          where guild_id = $1
            and status = 'active'
            and (
              (profile_a_id = least($2::uuid, $3::uuid) and profile_b_id = greatest($2::uuid, $3::uuid))
              or (profile_a_id = least($3::uuid, $2::uuid) and profile_b_id = greatest($3::uuid, $2::uuid))
            )
        `,
        [guildId, blockerProfileId, blockedProfileId]
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  public async createReport(
    guildId: string,
    reporterProfileId: string,
    reportedProfileId: string,
    description: string
  ): Promise<{ id: string; created: boolean }> {
    const existing = await this.database.query<ReportRow>(
      `
        select id
        from reports
        where guild_id = $1
          and reporter_profile_id = $2
          and reported_profile_id = $3
          and status in ('open', 'reviewing')
        order by created_at desc
        limit 1
      `,
      [guildId, reporterProfileId, reportedProfileId]
    );

    if (existing.rows[0]) {
      return { id: existing.rows[0].id, created: false };
    }

    const result = await this.database.query<ReportRow>(
      `
        insert into reports (guild_id, reporter_profile_id, reported_profile_id, category, description)
        values ($1, $2, $3, 'other', $4)
        returning id
      `,
      [guildId, reporterProfileId, reportedProfileId, description]
    );

    const report = result.rows[0];
    if (!report) {
      throw new Error('Não foi possível registrar a denúncia.');
    }

    return { id: report.id, created: true };
  }

  public async isMatchEnabled(guildId: string): Promise<boolean> {
    const result = await this.database.query<{ match_enabled: boolean }>(
      'select match_enabled from guild_settings where guild_id = $1 limit 1',
      [guildId]
    );

    return result.rows[0]?.match_enabled ?? true;
  }

  public async isSuperLikeEnabled(guildId: string): Promise<boolean> {
    const result = await this.database.query<{ super_like_enabled: boolean }>(
      'select super_like_enabled from guild_settings where guild_id = $1 limit 1',
      [guildId]
    );

    return result.rows[0]?.super_like_enabled ?? true;
  }

  public async areReportsEnabled(guildId: string): Promise<boolean> {
    const result = await this.database.query<{ reports_enabled: boolean }>(
      'select reports_enabled from guild_settings where guild_id = $1 limit 1',
      [guildId]
    );

    return result.rows[0]?.reports_enabled ?? true;
  }

  public async shouldRequireProfileReview(guildId: string): Promise<boolean> {
    const result = await this.database.query<{ profile_review_required: boolean }>(
      'select profile_review_required from guild_settings where guild_id = $1 limit 1',
      [guildId]
    );

    return result.rows[0]?.profile_review_required ?? false;
  }
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

function mapMatchWithProfileRow(row: MatchWithProfileRow): MatchWithProfile {
  return {
    id: row.match_id,
    status: row.match_status,
    createdAt: row.match_created_at,
    matchedProfile: mapProfileRow(row)
  };
}
