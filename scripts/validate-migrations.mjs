import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const migrationsDir = path.resolve('migrations');
const requiredObjects = [
  'create type profile_status',
  'create type profile_action_type',
  'create type match_status',
  'create type report_category',
  'create type report_status',
  'create table if not exists guild_settings',
  'create table if not exists user_profiles',
  'create table if not exists profile_actions',
  'create table if not exists matches',
  'create table if not exists user_blocks',
  'create table if not exists reports',
  'create table if not exists admin_audit_logs',
  'create table if not exists interaction_rate_limits'
];

const requiredProfileV1Fields = [
  'profile_review_required',
  'add column if not exists age',
  'add column if not exists looking_for',
  'add column if not exists receive_dm',
  'add column if not exists avatar_url',
  'add column if not exists consented_at',
  'user_profiles_looking_for_allowed',
  'pending_review',
  'suspended',
  'banned',
  'user_profiles_status_allowed',
  'user_profiles_active_profile_complete',
  'on delete restrict',
  'idx_user_profiles_discoverable',
  'pass_expiration_days',
  'add column if not exists expires_at',
  'profile_actions_pass_expiration',
  'idx_profile_actions_pass_valid',
  "add value if not exists 'unmatched'",
  'report_log_channel_id',
  'match_enabled',
  'reports_enabled',
  'guild_settings_pass_expiration_days_range',
  "add value if not exists 'super_like'",
  'super_like_enabled',
  'add column if not exists is_super_match',
  'create table if not exists super_like_usages',
  'unique (guild_id, actor_discord_user_id, week_start)',
  'idx_super_like_usages_actor_week',
  'idx_profile_actions_super_like',
  'add column if not exists daily_like_limit',
  'guild_settings_daily_like_limit_range',
  'add column if not exists compatibility_answers',
  'user_profiles_compatibility_answers_object',
  'add column if not exists terms_accepted_at',
  'add column if not exists terms_version',
  'idx_user_profiles_terms',
  'conversar',
  'livros',
  'amizade',
  'calls',
  'memes',
  'cardinality(looking_for) <= 5',
  'limit 5',
];

const forbiddenProductionOperations = [
  /\bdrop\s+database\b/i,
  /\bdrop\s+schema\b/i,
  /\btruncate\s+table\b/i
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function stripSqlComments(sql) {
  return sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

function validateBalancedDollarBlocks(sql, file) {
  const dollarBlockCount = (sql.match(/\$\$/g) ?? []).length;
  assert(dollarBlockCount % 2 === 0, `${file}: unbalanced PostgreSQL dollar-quoted blocks`);
}

function validateStatementTerminators(sql, file) {
  const normalized = stripSqlComments(sql).trim();
  assert(normalized.length > 0, `${file}: migration is empty`);
  assert(normalized.endsWith(';'), `${file}: migration must end with a semicolon`);
}

function validateRequiredObjects(sql, file) {
  const lowerSql = sql.toLowerCase();

  for (const requiredObject of requiredObjects) {
    assert(lowerSql.includes(requiredObject), `${file}: missing required V1 object: ${requiredObject}`);
  }
}

function validateForbiddenOperations(sql, file) {
  for (const pattern of forbiddenProductionOperations) {
    assert(!pattern.test(sql), `${file}: forbidden destructive operation detected: ${pattern}`);
  }
}

async function main() {
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
  assert(files.length > 0, 'No SQL migrations found');

  for (const file of files) {
    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    validateStatementTerminators(sql, file);
    validateBalancedDollarBlocks(sql, file);
    validateForbiddenOperations(sql, file);
  }

  const initialMigration = await readFile(path.join(migrationsDir, files[0]), 'utf8');
  validateRequiredObjects(initialMigration, files[0]);

  const combinedSql = await Promise.all(files.map((file) => readFile(path.join(migrationsDir, file), 'utf8')));
  const lowerCombinedSql = combinedSql.join('\n').toLowerCase();
  for (const requiredField of requiredProfileV1Fields) {
    assert(lowerCombinedSql.includes(requiredField), `missing required profile V1 field or constraint: ${requiredField}`);
  }

  console.log(`Validated ${files.length} migration file(s) offline.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
