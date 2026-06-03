import { readFile } from 'node:fs/promises';
import process from 'node:process';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const repository = await readFile('src/infrastructure/repositories/profile-repository.ts', 'utf8');
  const command = await readFile('src/bot/commands/suinder.ts', 'utf8');

  const requiredRepositoryRules = [
    "target.status = 'active'",
    'target.age >= 18',
    'target.consented_at is not null',
    'cardinality(target.looking_for) > 0',
    'target.id <> $2',
    'from user_blocks block',
    'block.blocker_profile_id = $2',
    'block.blocked_profile_id = target.id',
    'block.blocker_profile_id = target.id',
    'block.blocked_profile_id = $2',
    'from profile_actions action',
    "action.action in ('like', 'super_like')",
    "action.action = 'pass'",
    'action.expires_at > now()',
    '$3::text is null or $3 = any(target.looking_for)'
  ];

  for (const rule of requiredRepositoryRules) {
    assert(repository.includes(rule), `Discovery repository is missing required rule: ${rule}`);
  }


  const requiredActionPieces = [
    'recordPass(guildId: string, actorProfileId: string, targetProfileId: string)',
    'blockProfile(guildId: string, blockerProfileId: string, blockedProfileId: string)',
    'createReport(',
    "on conflict (actor_profile_id, target_profile_id)",
    'pass_expiration_days',
    'expires_at = now()',
    "on conflict (blocker_profile_id, blocked_profile_id) do nothing",
    "status = 'blocked'",
    'consumeRateLimit(',
    'interaction_rate_limits'
  ];

  for (const piece of requiredActionPieces) {
    assert(repository.includes(piece), `Discovery repository is missing required action piece: ${piece}`);
  }

  const discoveryFunctionMatch = command.match(/async function showDiscoverableProfile[\s\S]*?\n}\n\nfunction buildStartPanel/);
  assert(discoveryFunctionMatch, 'Could not find showDiscoverableProfile function');
  const discoveryFunction = discoveryFunctionMatch[0];
  assert(!discoveryFunction.includes('adminLogs.record'), 'Discovery view must not write admin audit logs');

  const requiredCommandPieces = [
    'buildDiscoveryProfileEmbed(profile, filter)',
    'buildDiscoveryActionRows(profile, filter)',
    'ephemeral: true',
    "buildDiscoveryButtonId('like', profile.id, filter)",
    "buildDiscoveryButtonId('super_like', profile.id, filter)",
    "buildDiscoveryButtonId('pass', profile.id, filter)",
    "buildDiscoveryButtonId('block', profile.id, filter)",
    "buildDiscoveryButtonId('report', profile.id, filter)",
    "buildDiscoveryButtonId('next', profile.id, filter)",
    'handleDiscoveryLike',
    'handleDiscoveryReportSubmit',
    'Por segurança, o perfil denunciado foi bloqueado automaticamente'
  ];

  for (const piece of requiredCommandPieces) {
    assert(command.includes(piece), `Discovery command is missing required piece: ${piece}`);
  }

  console.log('Validated discovery rules offline.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
