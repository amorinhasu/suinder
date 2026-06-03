import type { SlashCommand } from './types.js';
import { suinderAdminCommand } from './suinder-admin.js';
import { suinderCommand } from './suinder.js';

export function loadSlashCommands(): SlashCommand[] {
  return [suinderCommand, suinderAdminCommand];
}
