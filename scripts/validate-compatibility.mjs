import { readFile } from 'node:fs/promises';
import process from 'node:process';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const domain = await readFile('src/domain/profile.ts', 'utf8');
  const repository = await readFile('src/infrastructure/repositories/profile-repository.ts', 'utf8');
  const service = await readFile('src/application/services/profile-service.ts', 'utf8');
  const command = await readFile('src/bot/commands/suinder.ts', 'utf8');
  const migration = await readFile('migrations/011_add_compatibility_answers.sql', 'utf8');
  const pkg = await readFile('package.json', 'utf8');

  const domainPieces = [
    'COMPATIBILITY_QUESTIONS',
    'Call ou Chat',
    'Dia ou Noite',
    'Grupo ou Conversa Individual',
    'Jogos ou Filmes',
    'Planejar ou Improvisar',
    'parseCompatibilityAnswers',
    'calculateCompatibility',
    'interestScore',
    'answerScore',
    'percentage: Math.max(0, Math.min(100'
  ];
  for (const piece of domainPieces) {
    assert(domain.includes(piece), `Compatibility domain missing: ${piece}`);
  }

  const persistencePieces = [
    "add column if not exists compatibility_answers jsonb not null default '{}'::jsonb",
    'user_profiles_compatibility_answers_object',
    'compatibility_answers = excluded.compatibility_answers',
    'compatibility_answers = $6::jsonb',
    'JSON.stringify(input.compatibilityAnswers)',
    'compatibilityAnswers: row.compatibility_answers ?? {}'
  ];
  for (const piece of persistencePieces) {
    assert((migration + repository).includes(piece), `Compatibility persistence missing: ${piece}`);
  }

  const servicePieces = [
    'parseCompatibilityAnswers(input.compatibilityAnswers)',
    'withCompatibility(viewerProfile',
    'compatibility: calculateCompatibility(viewerProfile, targetProfile)',
    'findNextDiscoverableProfile(guildId, viewerProfile.id, filter)'
  ];
  for (const piece of servicePieces) {
    assert(service.includes(piece), `Compatibility service missing: ${piece}`);
  }

  const commandPieces = [
    'DM e preferências opcionais',
    'formatCompatibility(profile)',
    '💚 Compatibilidade:',
    'Vocês combinam em:',
    'formatCompatibilityAnswers(profile.compatibilityAnswers)',
    'compatibilityAnswers: dmAndConsent.compatibilityAnswers'
  ];
  for (const piece of commandPieces) {
    assert(command.includes(piece), `Compatibility command missing: ${piece}`);
  }

  assert(!domain.includes('openai') && !service.includes('openai') && !command.includes('openai'), 'Compatibility must not use AI/OpenAI APIs');
  assert(!domain.includes('fetch(') && !service.includes('fetch('), 'Compatibility must not call external APIs');
  assert(pkg.includes('compatibility:check') && pkg.includes('compatibilidade:check'), 'package.json must expose compatibility checks');

  console.log('Validated compatibility rules offline.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
