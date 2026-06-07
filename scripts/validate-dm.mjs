import { readFile } from 'node:fs/promises';
import process from 'node:process';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const command = await readFile('src/bot/commands/suinder.ts', 'utf8');
  const packageJson = await readFile('package.json', 'utf8');

  const requiredCommandPieces = [
    "const DM_TEST_BUTTON_ID = 'suinder:dm:test'",
    'handleDmTestButton(',
    'ensureDmCapability(',
    'verifiedDmCapabilities',
    'hasVerifiedDmCapability(guildId, discordUserId)',
    'markDmCapabilityVerified(guildId, discordUserId)',
    'Skipping SUINDER DM verification; capability already verified in this runtime',
    'Skipping SUINDER DM verification; profile already has verified DM capability',
    'Sending SUINDER DM verification message',
    'context.client.users.fetch(discordUserId)',
    'await user.send({ content: buildDmVerificationMessage() })',
    '💚 Bem-vindo ao SUÍNDER.',
    'Esta é uma mensagem de verificação.',
    'Se você recebeu este aviso, sua conta está pronta para participar.',
    'buildDmVerificationFailureMessage()',
    '⚠️ Não consegui te enviar uma DM.',
    'O SUÍNDER usa mensagens privadas para avisos importantes, como Matches, Super Likes e Suíte às Cegas.',
    'Ative suas mensagens diretas e tente novamente.',
    'buildDmRetryActionRow()',
    ".setLabel('Testar Novamente')",
    'Failed to verify SUINDER DM capability',
    "interaction.customId === DM_TEST_BUTTON_ID",
    'PROFILE_CREATE_MODAL_ID && !await ensureDmCapability(interaction, context)',
    "profile.status === 'paused' && !await ensureDmCapability(interaction, context)",
    'async function showDiscoverableProfile',
    'async function handleDiscoveryLike',
    'async function handleDiscoverySuperLike'
  ];

  for (const piece of requiredCommandPieces) {
    assert(command.includes(piece), `DM validation command flow is missing: ${piece}`);
  }

  const discoveryFunction = command.match(/async function showDiscoverableProfile[\s\S]*?\n}\n\n+async function showMatches/);
  assert(discoveryFunction?.[0].includes('ensureDmCapability(interaction, context)'), 'Discovery must validate DM before loading profiles');

  const likeFunction = command.match(/async function handleDiscoveryLike[\s\S]*?\n}\n\n\nasync function handleDiscoverySuperLike/);
  assert(likeFunction?.[0].includes('ensureDmCapability(interaction, context)'), 'Like must validate DM before sending like');

  const superLikeFunction = command.match(/async function handleDiscoverySuperLike[\s\S]*?\n}\n\nasync function sendMatchDms/);
  assert(superLikeFunction?.[0].includes('ensureDmCapability(interaction, context)'), 'Super Like must validate DM before sending Super Like');

  const dmFailureFunction = command.match(/async function replyDmVerificationFailed[\s\S]*?\n}\n\nfunction buildDmVerificationMessage/);
  assert(dmFailureFunction && !dmFailureFunction[0].includes('adminLogs.record'), 'DM failures must not write admin audit logs');

  assert(packageJson.includes('"dm:check"'), 'package.json must expose dm:check');
  assert(packageJson.includes('npm run dm:check'), 'v1:check must include dm:check');

  console.log('Validated DM verification rules offline.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
