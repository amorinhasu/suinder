import { readFile } from 'node:fs/promises';
import process from 'node:process';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const repository = await readFile('src/infrastructure/repositories/profile-repository.ts', 'utf8');
  const service = await readFile('src/application/services/profile-service.ts', 'utf8');
  const command = await readFile('src/bot/commands/suinder.ts', 'utf8');
  const adminCommand = await readFile('src/bot/commands/suinder-admin.ts', 'utf8');
  const adminRepository = await readFile('src/infrastructure/repositories/admin-repository.ts', 'utf8');
  const migrations = [
    await readFile('migrations/008_add_super_like_action.sql', 'utf8'),
    await readFile('migrations/009_add_super_like_v2.sql', 'utf8')
  ].join('\n');

  const requiredMigrationPieces = [
    "add value if not exists 'super_like'",
    'add column if not exists super_like_enabled boolean not null default true',
    'add column if not exists is_super_match boolean not null default false',
    'create table if not exists super_like_usages',
    'actor_discord_user_id text not null',
    'unique (guild_id, actor_discord_user_id, week_start)',
    'idx_super_like_usages_actor_week',
    'idx_profile_actions_super_like'
  ];

  for (const piece of requiredMigrationPieces) {
    assert(migrations.includes(piece), `Super Like migration is missing: ${piece}`);
  }

  const requiredRepositoryPieces = [
    'recordSuperLikeAndMaybeCreateMatch(',
    "await client.query('begin')",
    "await client.query('commit')",
    "await client.query('rollback')",
    'from user_blocks block',
    'insert into super_like_usages',
    "date_trunc('week', now())",
    'on conflict (guild_id, actor_discord_user_id, week_start) do nothing',
    "values ($1, $2, $3, 'super_like', null)",
    "action.action in ('like', 'super_like')",
    'insert into matches (guild_id, profile_a_id, profile_b_id, status, is_super_match)',
    'on conflict (profile_a_id, profile_b_id) do update set',
    'is_super_match = true',
    'isSuperLikeEnabled(guildId: string)'
  ];

  for (const piece of requiredRepositoryPieces) {
    assert(repository.includes(piece), `Super Like repository is missing: ${piece}`);
  }

  const requiredServicePieces = [
    'superLikeDiscoveredProfile(',
    'await this.ensureMatchEnabled(guildId)',
    'await this.ensureSuperLikeEnabled(guildId)',
    "await this.profiles.consumeRateLimit(guildId, discordUserId, 'discovery_super_like', 10)",
    'isEligibleDiscoveryTarget(targetProfile)',
    'recordSuperLikeAndMaybeCreateMatch(',
    "action: 'match.super_created'",
    'Super Match criado no SUÍNDER.',
    'findNextDiscoverableProfile(guildId, viewerProfile.id, filter)'
  ];

  for (const piece of requiredServicePieces) {
    assert(service.includes(piece), `Super Like service is missing: ${piece}`);
  }

  const forbiddenSuperLikeLogs = ["action: 'super_like.created'", "action: 'profile.super_liked'", "action: 'profile.super_like.created'"];
  for (const forbidden of forbiddenSuperLikeLogs) {
    assert(!service.includes(forbidden) && !command.includes(forbidden), `Regular Super Like must not create admin audit logs: ${forbidden}`);
  }

  const requiredCommandPieces = [
    "type DiscoveryAction = 'like' | 'super_like'",
    "buildDiscoveryButtonId('super_like', profile.id, filter)",
    '⭐ Super Like',
    'handleDiscoverySuperLike(',
    'superLikeDiscoveredProfile(guildId, interaction.user.id, targetProfileId, normalizeDiscoveryFilter(filter))',
    'sendSuperLikeNoticeDm(context, result.targetProfile)',
    'sendSuperMatchDms(context, interaction.user.id, interaction.user.username, result.targetProfile)',
    '⭐ Super Like enviado.',
    '✨ Super Match!',
    'BANNER_SUPER_LIKE',
    'BANNER_SUPER_MATCH',
    'Failed to send super like DM',
    'Failed to send super match DM'
  ];

  for (const piece of requiredCommandPieces) {
    assert(command.includes(piece), `Super Like command is missing: ${piece}`);
  }

  const requiredAdminPieces = [
    'super_like_enabled',
    'superLikeEnabled',
    'Ativar/desativar Super Like'
  ];

  for (const piece of requiredAdminPieces) {
    assert(adminCommand.includes(piece) || adminRepository.includes(piece), `Super Like admin/config is missing: ${piece}`);
  }

  console.log('Validated Super Like V2 rules offline.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
