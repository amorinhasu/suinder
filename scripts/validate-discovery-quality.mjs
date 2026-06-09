import { readFile } from 'node:fs/promises';
import process from 'node:process';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const migration = await readFile('migrations/010_add_daily_like_limit.sql', 'utf8');
  const repository = await readFile('src/infrastructure/repositories/profile-repository.ts', 'utf8');
  const service = await readFile('src/application/services/profile-service.ts', 'utf8');
  const command = await readFile('src/bot/commands/suinder.ts', 'utf8');
  const publicPanel = await readFile('src/bot/public-panel.ts', 'utf8');
  const adminCommand = await readFile('src/bot/commands/suinder-admin.ts', 'utf8');
  const adminRepository = await readFile('src/infrastructure/repositories/admin-repository.ts', 'utf8');
  const pkg = await readFile('package.json', 'utf8');

  const migrationPieces = [
    'add column if not exists daily_like_limit integer not null default 30',
    'guild_settings_daily_like_limit_range',
    'check (daily_like_limit between 1 and 500)'
  ];
  for (const piece of migrationPieces) {
    assert(migration.includes(piece), `Daily like migration missing: ${piece}`);
  }

  const dailyLimitPieces = [
    'recordLikeAndMaybeCreateMatch(guildId: string, actorDiscordUserId: string',
    'daily_like_limit',
    "'daily_like'",
    "date_trunc('day', now())",
    'Você atingiu o limite diário',
    'recordSuperLikeAndMaybeCreateMatch',
    'likeAlreadyRecorded',
    'if (!likeAlreadyRecorded)'
  ];
  for (const piece of dailyLimitPieces) {
    assert(repository.includes(piece), `Repository missing daily-like rule: ${piece}`);
  }

  const likeMethod = repository.slice(repository.indexOf('recordLikeAndMaybeCreateMatch'), repository.indexOf('recordSuperLikeAndMaybeCreateMatch'));
  assert(likeMethod.indexOf('if (!likeAlreadyRecorded)') < likeMethod.indexOf("'daily_like'"), 'Daily like limit must only be consumed when a new valid like is recorded');
  assert(likeMethod.includes('for update') && likeMethod.includes('pg_advisory_xact_lock'), 'Like idempotency must be concurrency-safe');

  const superLikeMethod = repository.slice(repository.indexOf('recordSuperLikeAndMaybeCreateMatch'));
  assert(!superLikeMethod.slice(0, superLikeMethod.indexOf('public async recordPass')).includes("'daily_like'"), 'Super Like must not consume the daily like bucket');

  const filterPieces = [
    '$3::text is null or $3 = any(target.looking_for)',
    '$4::text is null or $4 = any(target.looking_for)',
    'filter?: LookingForOption | null',
    'findNextDiscoverableProfile(guildId, viewerProfile.id, filter)',
    '.setName(\'filtro\')',
    'discoveryFilterChoices',
    'encodeDiscoveryFilter(filter)',
    'decodeDiscoveryFilter',
    'parsePublicDiscoveryFilter',
    'Filtro da sessão'
  ];
  for (const piece of filterPieces) {
    assert((repository + service + command).includes(piece), `Discovery filter missing: ${piece}`);
  }

  assert(publicPanel.includes('filter_all') && publicPanel.includes('Filtro: Todos'), 'Public panel must expose discovery filter buttons');
  assert(publicPanel.includes('LOOKING_FOR_OPTIONS'), 'Public panel filters must use allowed profile interests');
  assert(publicPanel.includes('chunkInterestFilterButtons') && publicPanel.includes('index += 5'), 'Public panel must chunk guided interest filters into valid Discord action rows');
  assert(command.includes('PROFILE_INTERESTS_BUTTON_ID') && command.includes('buildInterestsSelectRows(profile)'), 'Profile panel must expose guided interests selection');
  assert(command.includes('INTERESTS_SELECT_ID') && command.includes('setMaxValues(MAX_PROFILE_INTERESTS)'), 'Guided interests must use a bounded multi-select menu');
  assert(repository.includes('updateLookingFor(guildId: string, profileId: string, lookingFor: LookingForOption[])'), 'Repository must persist guided interests in looking_for');
  assert(adminCommand.includes("value: 'daily_like_limit'"), 'Admin config command must expose daily_like_limit');
  assert(adminCommand.includes('settings.dailyLikeLimit'), 'Admin settings embed must show daily like limit');
  assert(adminRepository.includes("['daily_like_limit', 'daily_like_limit']"), 'Admin repository must allow daily_like_limit updates');
  assert(adminRepository.includes('Limite diário de likes deve ser inteiro entre 1 e 500'), 'Admin repository must validate daily_like_limit');
  assert(pkg.includes('quality:check') && pkg.includes('validate-discovery-quality.mjs'), 'package.json must expose quality:check');

  console.log('Validated discovery quality rules offline.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
