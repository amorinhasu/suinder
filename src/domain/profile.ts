export const PROFILE_NICKNAME_MAX_LENGTH = 80;
export const PROFILE_BIO_MAX_LENGTH = 500;
export const PROFILE_MIN_AGE = 18;

export const LOOKING_FOR_OPTIONS = [
  'Romance',
  'Amizades',
  'Jogos',
  'Filmes e Séries',
  'Música',
  'Call e Conversa'
] as const;

export type LookingForOption = (typeof LOOKING_FOR_OPTIONS)[number];
export type ProfileStatus = 'active' | 'paused' | 'pending_review' | 'suspended' | 'banned' | 'deleted';

export interface UserProfile {
  id: string;
  guildId: string;
  discordUserId: string;
  displayName: string;
  age: number | null;
  bio: string;
  lookingFor: LookingForOption[];
  receiveDm: boolean;
  avatarUrl: string | null;
  status: ProfileStatus;
  consentedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  pausedAt: Date | null;
}

export interface ProfileInput {
  guildId: string;
  discordUserId: string;
  displayName: string;
  age: number;
  bio: string;
  lookingFor: LookingForOption[];
  receiveDm: boolean;
  avatarUrl: string;
  consentedAt: Date;
}

const normalizedLookingFor = new Map<string, LookingForOption>(
  LOOKING_FOR_OPTIONS.map((option) => [normalizeOption(option), option])
);

export function parseLookingFor(rawValue: string): LookingForOption[] {
  const values = rawValue
    .split(/[,;\n]/)
    .map((value) => value.trim())
    .filter(Boolean);

  const unique = new Set<LookingForOption>();

  for (const value of values) {
    const option = normalizedLookingFor.get(normalizeOption(value));
    if (!option) {
      throw new Error(`Opção inválida em "o que procura": ${value}`);
    }
    unique.add(option);
  }

  if (unique.size === 0) {
    throw new Error('Informe pelo menos uma opção em "o que procura".');
  }

  return [...unique];
}

export function parseReceiveDm(rawValue: string): boolean {
  const normalized = normalizeOption(rawValue);

  if (['sim', 's', 'yes', 'y'].includes(normalized)) {
    return true;
  }

  if (['nao', 'n', 'no'].includes(normalized)) {
    return false;
  }

  throw new Error('O campo "receber DM" deve ser Sim ou Não.');
}

export function parseAge(rawValue: string): number {
  const age = Number.parseInt(rawValue.trim(), 10);

  if (!Number.isInteger(age)) {
    throw new Error('Idade deve ser um número inteiro.');
  }

  if (age < PROFILE_MIN_AGE) {
    throw new Error('O SUÍNDER V1 é restrito para pessoas com 18 anos ou mais.');
  }

  return age;
}

export function validateNickname(displayName: string): string {
  const trimmed = displayName.trim();

  if (!trimmed) {
    throw new Error('Apelido é obrigatório.');
  }

  if (trimmed.length > PROFILE_NICKNAME_MAX_LENGTH) {
    throw new Error(`Apelido deve ter no máximo ${PROFILE_NICKNAME_MAX_LENGTH} caracteres.`);
  }

  return trimmed;
}

export function validateBio(bio: string): string {
  const trimmed = bio.trim();

  if (trimmed.length > PROFILE_BIO_MAX_LENGTH) {
    throw new Error(`Bio deve ter no máximo ${PROFILE_BIO_MAX_LENGTH} caracteres.`);
  }

  return trimmed;
}

export function isProfileDiscoverable(profile: Pick<UserProfile, 'status' | 'age' | 'consentedAt' | 'lookingFor'>): boolean {
  return profile.status === 'active'
    && (profile.age ?? 0) >= PROFILE_MIN_AGE
    && profile.consentedAt !== null
    && profile.lookingFor.length > 0;
}

export function validateAdultConsent(rawValue: string): void {
  const normalized = normalizeOption(rawValue);

  if (!['sim', 's', 'yes', 'y'].includes(normalized)) {
    throw new Error('Consentimento +18 obrigatório para criar ou editar o perfil.');
  }
}

function normalizeOption(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
