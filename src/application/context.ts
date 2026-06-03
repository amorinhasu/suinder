import type { Client } from 'discord.js';
import type { AppConfig } from '../infrastructure/config.js';
import type { DatabasePool } from '../infrastructure/database/client.js';
import type { Logger } from '../infrastructure/logger.js';
import type { AdminLogService } from './services/admin-log-service.js';
import type { AdminService } from './services/admin-service.js';
import type { ProfileService } from './services/profile-service.js';

export interface AppContext {
  client: Client;
  config: AppConfig;
  database: DatabasePool;
  logger: Logger;
  adminLogs: AdminLogService;
  admin: AdminService;
  profiles: ProfileService;
}
