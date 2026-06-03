import { readFile } from 'node:fs/promises';
import process from 'node:process';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const migration = await readFile('migrations/012_add_profile_terms.sql', 'utf8');
  const domain = await readFile('src/domain/profile.ts', 'utf8');
  const repository = await readFile('src/infrastructure/repositories/profile-repository.ts', 'utf8');
  const service = await readFile('src/application/services/profile-service.ts', 'utf8');
  const command = await readFile('src/bot/commands/suinder.ts', 'utf8');
  const pkg = await readFile('package.json', 'utf8');

  const migrationPieces = [
    'add column if not exists terms_accepted_at',
    'add column if not exists terms_version',
    'idx_user_profiles_terms'
  ];
  for (const piece of migrationPieces) {
    assert(migration.includes(piece), `Terms migration missing: ${piece}`);
  }

  const domainPieces = [
    "CURRENT_TERMS_VERSION = '2026-06'",
    'termsAcceptedAt: Date | null',
    'termsVersion: string | null',
    'hasAcceptedCurrentTerms'
  ];
  for (const piece of domainPieces) {
    assert(domain.includes(piece), `Terms domain missing: ${piece}`);
  }

  const repositoryPieces = [
    'terms_accepted_at',
    'terms_version',
    'acceptTerms(guildId: string, discordUserId: string, termsVersion: string)',
    "target.terms_version = '2026-06'"
  ];
  for (const piece of repositoryPieces) {
    assert(repository.includes(piece), `Terms repository missing: ${piece}`);
  }

  const servicePieces = [
    'acceptTerms(guildId: string, discordUserId: string)',
    'ensureCurrentTerms(viewerProfile)',
    'ensureCurrentTermsInput(profileInput)',
    'hasAcceptedCurrentTerms(profile)'
  ];
  for (const piece of servicePieces) {
    assert(service.includes(piece), `Terms service missing: ${piece}`);
  }

  const commandPieces = [
    'TERMS_ACCEPT_BUTTON_ID',
    'TERMS_DECLINE_BUTTON_ID',
    'buildTermsEmbed',
    'Aceito e quero participar',
    'Não aceito',
    'Tudo bem. Sem aceitar os termos, não é possível participar do SUÍNDER.',
    'CURRENT_TERMS_VERSION',
    'ensureDmCapability(interaction, context)',
    'showModal(buildProfileModal(\'create\'))'
  ];
  for (const piece of commandPieces) {
    assert(command.includes(piece), `Terms command missing: ${piece}`);
  }

  assert(pkg.includes('terms:check') && pkg.includes('validate-terms.mjs'), 'package.json must expose terms:check');

  console.log('Validated terms acceptance rules offline.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
