import { readdir, readFile } from 'node:fs/promises';
import process from 'node:process';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function requireAll(source, pieces, label) {
  for (const piece of pieces) {
    assert(source.includes(piece), `${label} is missing required stability piece: ${piece}`);
  }
}

async function main() {
  const profileService = await readFile('src/application/services/profile-service.ts', 'utf8');
  const profileRepository = await readFile('src/infrastructure/repositories/profile-repository.ts', 'utf8');
  const adminService = await readFile('src/application/services/admin-service.ts', 'utf8');
  const adminRepository = await readFile('src/infrastructure/repositories/admin-repository.ts', 'utf8');
  const suinderCommand = await readFile('src/bot/commands/suinder.ts', 'utf8');
  const adminCommand = await readFile('src/bot/commands/suinder-admin.ts', 'utf8');
  const domain = await readFile('src/domain/profile.ts', 'utf8');
  const migrations = (await readdir('migrations')).filter((file) => file.endsWith('.sql')).sort();

  requireAll(profileService, [
    'ensureMatchEnabled(guildId)',
    'ensureReportsEnabled(guildId)',
    "consumeRateLimit(guildId, discordUserId, 'match_list', 30)",
    "consumeRateLimit(guildId, discordUserId, 'match_view', 30)",
    "consumeRateLimit(guildId, discordUserId, 'match_action', 20)",
    "consumeRateLimit(guildId, discordUserId, 'match_report', 10)",
    "consumeRateLimit(guildId, discordUserId, 'discovery_like', 30)",
    "consumeRateLimit(guildId, discordUserId, 'discovery_report', 10)",
    'this.profiles.update(input.guildId, profileId',
    'this.profiles.setStatus(profile.guildId, profile.id',
    "viewerProfile.status !== 'active'",
    "profile.status === 'active'",
    'parseCompatibilityAnswers(input.compatibilityAnswers)',
    'withCompatibility(viewerProfile',
    'calculateCompatibility(viewerProfile, targetProfile)',
    'ensureSuperLikeEnabled(guildId)',
    'ensureReportsEnabled(guildId)',
    'ensureCurrentTerms(viewerProfile)',
    'ensureCurrentTermsInput(profileInput)'
  ], 'Profile service');

  requireAll(profileRepository, [
    'public async update(guildId: string, profileId: string',
    'and guild_id = $9',
    'public async setStatus(guildId: string, profileId: string',
    'and guild_id = $3',
    'target.status = \'active\'',
    'target.age >= 18',
    'target.consented_at is not null',
    'cardinality(target.looking_for) > 0',
    'block.blocker_profile_id = target.id',
    "action.action in ('like', 'super_like')",
    'action.expires_at > now()',
    'isMatchEnabled(guildId: string)',
    'areReportsEnabled(guildId: string)',
    '$3::text is null or $3 = any(target.looking_for)',
    '$4::text is null or $4 = any(target.looking_for)',
    'daily_like_limit',
    "'daily_like'",
    "date_trunc('day', now())",
    'compatibility_answers',
    'terms_accepted_at',
    'terms_version',
    "target.terms_version = '2026-06'"
  ], 'Profile repository');

  requireAll(suinderCommand, [
    'parseDiscoveryButtonId',
    'parseMatchButtonId',
    'parseDiscoveryReportModalId',
    'parseMatchReportModalId',
    'ensureReportsEnabled(guildId)',
    'ephemeral: true',
    'ensureDmCapability(interaction, context)',
    'formatCompatibility(profile)',
    'parseDiscoveryFilter',
    'normalizeDiscoveryFilter',
    'encodeDiscoveryFilter(filter)',
    'DM_TEST_BUTTON_ID',
    "buildDiscoveryButtonId('super_like', profile.id, filter)",
    'TERMS_ACCEPT_BUTTON_ID',
    'TERMS_DECLINE_BUTTON_ID',
    'buildTermsEmbed',
    'showTermsPanel(interaction)'
  ], 'SUÍNDER command');

  requireAll(adminService, [
    "['suspend', 'ban'].includes(action)",
    "['suspend_user', 'ban_user'].includes(action)",
    'targetProfile.discordUserId === actorDiscordUserId',
    'recordAdminAction',
    'executedAt: new Date().toISOString()'
  ], 'Admin service');

  requireAll(adminRepository, [
    'findSettings(guildId: string)',
    'where guild_id = $1',
    'updateProfileStatus',
    'and status <> \'deleted\'',
    'resolveReport',
    'report_log_channel_id',
    'match_enabled',
    'reports_enabled',
    'daily_like_limit'
  ], 'Admin repository');

  requireAll(adminCommand, [
    'PermissionFlagsBits.Administrator',
    'findSettings(context.config.DISCORD_GUILD_ID)',
    'admin.access.denied',
    'ephemeral: true',
    "value: 'daily_like_limit'"
  ], 'Admin command');


  requireAll(domain, [
    'COMPATIBILITY_QUESTIONS',
    'calculateCompatibility',
    'interestScore',
    'answerScore',
    'CURRENT_TERMS_VERSION',
    'hasAcceptedCurrentTerms'
  ], 'Profile domain');

  assert(migrations.includes('010_add_daily_like_limit.sql'), 'Daily like migration must exist');
  assert(migrations.includes('011_add_compatibility_answers.sql'), 'Compatibility migration must exist');
  assert(migrations.includes('012_add_profile_terms.sql'), 'Terms migration must exist');
  assert(migrations.indexOf('010_add_daily_like_limit.sql') < migrations.indexOf('011_add_compatibility_answers.sql'), 'Migrations must keep daily-like before compatibility in sorted order');
  assert(migrations.indexOf('011_add_compatibility_answers.sql') < migrations.indexOf('012_add_profile_terms.sql'), 'Migrations must keep compatibility before terms in sorted order');

  const superLikeMethod = profileRepository.slice(profileRepository.indexOf('recordSuperLikeAndMaybeCreateMatch'));
  assert(!superLikeMethod.slice(0, superLikeMethod.indexOf('public async recordPass')).includes("'daily_like'"), 'Super Like must not consume daily like limit');
  assert(!profileRepository.includes('update user_profiles set looking_for') || profileRepository.includes('compatibility_answers'), 'Compatibility persistence must not overwrite discovery filter/profile interests unexpectedly');
  assert(profileRepository.includes("target.terms_version = '2026-06'"), 'Discovery must hide profiles without current accepted terms');

  assert(!/delete\s+from\s+user_profiles/i.test(profileRepository), 'Profile repository must not physically delete profiles');
  assert(!/delete\s+from\s+matches/i.test(profileRepository), 'Profile repository must not physically delete matches');
  assert(!/delete\s+from\s+reports/i.test(adminRepository), 'Admin repository must not physically delete reports');

  console.log('Validated V1 stability invariants offline.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
