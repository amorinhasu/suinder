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
  const migration = await readFile('migrations/006_add_unmatched_match_status.sql', 'utf8');

  const requiredCommandPieces = [
    ".setName('matches')",
    'showMatches(interaction, context)',
    'buildMatchesEmbed(matches)',
    'buildMatchActionRows(matches)',
    "buildMatchButtonId('view', match.id)",
    "buildMatchButtonId('unmatch', match.id)",
    "buildMatchButtonId('block', match.id)",
    "buildMatchButtonId('report', match.id)",
    'handleMatchButton',
    'handleMatchReportSubmit',
    'ephemeral: true',
    'Não foi possível listar seus matches'
  ];

  for (const piece of requiredCommandPieces) {
    assert(command.includes(piece), `Matches command is missing required piece: ${piece}`);
  }

  const requiredRepositoryPieces = [
    'listActiveMatchesForProfile',
    'findActiveMatchForProfile',
    "m.status = 'active'",
    'm.profile_a_id = $2 or m.profile_b_id = $2',
    "target.status not in ('deleted', 'suspended', 'banned')",
    'from user_blocks block',
    'block.blocker_profile_id = $2',
    'block.blocker_profile_id = target.id',
    'unmatch(guildId: string, viewerProfileId: string, matchId: string)',
    "update matches",
    "set status = 'unmatched'",
    "and status = 'active'",
    'returning id'
  ];

  for (const piece of requiredRepositoryPieces) {
    assert(repository.includes(piece), `Matches repository is missing required piece: ${piece}`);
  }

  assert(!/delete\s+from\s+matches/i.test(repository), 'Matches must not be physically deleted');

  const requiredServicePieces = [
    'listActiveMatches(',
    'getMatchProfile(',
    'unmatch(',
    'blockMatchedProfile(',
    'reportMatchedProfile(',
    "resolveActiveProfile(guildId, discordUserId, 'listar matches')",
    "resolveActiveProfile(guildId, discordUserId, 'desfazer match')",
    "action: 'match.ended'",
    "metadata: { matchId, status: 'unmatched' }",
    "source: 'match'",
    'blockProfile(guildId, viewerProfile.id, match.matchedProfile.id)',
    'createReport(guildId, viewerProfile.id, match.matchedProfile.id, description)'
  ];

  for (const piece of requiredServicePieces) {
    assert(service.includes(piece), `Matches service is missing required piece: ${piece}`);
  }

  assert(migration.includes("alter type match_status add value if not exists 'unmatched'"), 'Migration must add unmatched match status');

  console.log('Validated match management rules offline.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
