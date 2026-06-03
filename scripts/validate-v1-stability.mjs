import { readFile } from 'node:fs/promises';
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
    "profile.status === 'active'"
  ], 'Profile service');

  requireAll(profileRepository, [
    'public async update(guildId: string, profileId: string',
    'and guild_id = $8',
    'public async setStatus(guildId: string, profileId: string',
    'and guild_id = $3',
    'target.status = \'active\'',
    'target.age >= 18',
    'target.consented_at is not null',
    'cardinality(target.looking_for) > 0',
    'block.blocker_profile_id = target.id',
    "action.action = 'like'",
    'action.expires_at > now()',
    'isMatchEnabled(guildId: string)',
    'areReportsEnabled(guildId: string)'
  ], 'Profile repository');

  requireAll(suinderCommand, [
    'parseDiscoveryButtonId',
    'parseMatchButtonId',
    'parseDiscoveryReportModalId',
    'parseMatchReportModalId',
    'ensureReportsEnabled(guildId)',
    'ephemeral: true'
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
    'reports_enabled'
  ], 'Admin repository');

  requireAll(adminCommand, [
    'PermissionFlagsBits.Administrator',
    'findSettings(context.config.DISCORD_GUILD_ID)',
    'admin.access.denied',
    'ephemeral: true'
  ], 'Admin command');

  assert(!/delete\s+from\s+user_profiles/i.test(profileRepository), 'Profile repository must not physically delete profiles');
  assert(!/delete\s+from\s+matches/i.test(profileRepository), 'Profile repository must not physically delete matches');
  assert(!/delete\s+from\s+reports/i.test(adminRepository), 'Admin repository must not physically delete reports');

  console.log('Validated V1 stability invariants offline.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
