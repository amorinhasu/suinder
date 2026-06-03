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
  const migration = await readFile('migrations/001_create_v1_tables.sql', 'utf8');

  const requiredRepositoryPieces = [
    'recordLikeAndMaybeCreateMatch(guildId: string, actorDiscordUserId: string, actorProfileId: string, targetProfileId: string)',
    "await client.query('begin')",
    "await client.query('commit')",
    "await client.query('rollback')",
    'from user_blocks block',
    'block.blocker_profile_id = $2',
    'block.blocked_profile_id = $3',
    'block.blocker_profile_id = $3',
    'block.blocked_profile_id = $2',
    'insert into profile_actions',
    "values ($1, $2, $3, 'like', null)",
    "action = 'like'",
    'insert into matches',
    "least($2::uuid, $3::uuid)",
    "greatest($2::uuid, $3::uuid)",
    "'active'",
    'on conflict (profile_a_id, profile_b_id) do nothing',
    'returning id'
  ];

  for (const piece of requiredRepositoryPieces) {
    assert(repository.includes(piece), `Match repository is missing required piece: ${piece}`);
  }

  const requiredServicePieces = [
    'likeDiscoveredProfile(',
    "await this.profiles.consumeRateLimit(guildId, discordUserId, 'discovery_like', 30)",
    'isEligibleDiscoveryTarget(targetProfile)',
    'recordLikeAndMaybeCreateMatch(guildId, discordUserId, viewerProfile.id, targetProfile.id)',
    'if (like.matchCreated)',
    "action: 'match.created'",
    'Match criado no SUÍNDER.',
    'findNextDiscoverableProfile(guildId, viewerProfile.id, filter)'
  ];

  for (const piece of requiredServicePieces) {
    assert(service.includes(piece), `Match service is missing required piece: ${piece}`);
  }

  const forbiddenLikeLogs = ["action: 'profile.liked'", "action: 'like.created'", "action: 'profile.like.created'"];
  for (const forbidden of forbiddenLikeLogs) {
    assert(!service.includes(forbidden) && !command.includes(forbidden), `Like actions must not create admin audit logs: ${forbidden}`);
  }

  const requiredCommandPieces = [
    'handleDiscoveryLike(',
    'likeDiscoveredProfile(guildId, interaction.user.id, targetProfileId, normalizeDiscoveryFilter(filter))',
    'sendMatchDms(context, interaction.user.id, result.targetProfile)',
    '✨ Conexão encontrada!',
    '💚 Curtida enviada.',
    'context.client.users.fetch(discordUserId)',
    'await user.send({ content: message })',
    "context.logger.warn('Failed to send match DM'"
  ];

  for (const piece of requiredCommandPieces) {
    assert(command.includes(piece), `Match command is missing required piece: ${piece}`);
  }

  const requiredMigrationPieces = [
    'create table if not exists matches',
    'status match_status not null default',
    "unique (profile_a_id, profile_b_id)"
  ];

  for (const piece of requiredMigrationPieces) {
    assert(migration.includes(piece), `Match migration is missing required piece: ${piece}`);
  }

  console.log('Validated like and match rules offline.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
