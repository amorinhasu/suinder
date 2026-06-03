import 'dotenv/config';
import { z } from 'zod';

const optionalDiscordSnowflake = z
  .string()
  .regex(/^\d+$/, 'must be a Discord snowflake')
  .optional()
  .or(z.literal('').transform(() => undefined));

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
  DISCORD_CLIENT_ID: z.string().regex(/^\d+$/, 'DISCORD_CLIENT_ID must be a Discord snowflake'),
  DISCORD_GUILD_ID: z.string().regex(/^\d+$/, 'DISCORD_GUILD_ID must be a Discord snowflake'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  DATABASE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ADMIN_LOG_CHANNEL_ID: optionalDiscordSnowflake,
  MODERATOR_ROLE_ID: optionalDiscordSnowflake,
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info')
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(): AppConfig {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return parsed.data;
}
