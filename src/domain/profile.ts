export const PROFILE_NICKNAME_MAX_LENGTH = 80;
export const PROFILE_BIO_MAX_LENGTH = 500;
export const PROFILE_MIN_AGE = 18;
export const CURRENT_TERMS_VERSION = '2026-06';

export const LOOKING_FOR_OPTIONS = [
  'Romance',
  'Amizades',
  'Jogos',
  'Filmes e Séries',
  'Música',
  'Call e Conversa'
] as const;

export const COMPATIBILITY_QUESTIONS = [
  { key: 'communication', label: 'Call ou Chat', options: ['Call', 'Chat'] },
  { key: 'routine', label: 'Dia ou Noite', options: ['Dia', 'Noite'] },
  { key: 'social', label: 'Grupo ou Conversa Individual', options: ['Grupo', 'Conversa Individual'] },
  { key: 'entertainment', label: 'Jogos ou Filmes', options: ['Jogos', 'Filmes'] },
  { key: 'planning', label: 'Planejar ou Improvisar', options: ['Planejar', 'Improvisar'] }
] as const;

const COMPATIBILITY_POINT_EMOJIS: Record<string, string> = {
  Jogos: '🎮',
  Call: '🎙️',
  Noite: '🌙',
  Dia: '☀️',
  Chat: '💬',
  Grupo: '👥',
  'Conversa Individual': '🫂',
  Filmes: '🎬',
  Planejar: '🗓️',
  Improvisar: '✨',
  Romance: '💚',
  Amizades: '🤝',
  'Filmes e Séries': '🎬',
  Música: '🎵',
  'Call e Conversa': '🎙️'
};

export type LookingForOption = (typeof LOOKING_FOR_OPTIONS)[number];
export type CompatibilityQuestionKey = (typeof COMPATIBILITY_QUESTIONS)[number]['key'];
export type CompatibilityAnswers = Partial<Record<CompatibilityQuestionKey, string>>;
export type ProfileStatus = 'active' | 'paused' | 'pending_review' | 'suspended' | 'banned' | 'deleted';

export interface CompatibilityResult {
  percentage: number;
  sharedPoints: string[];
}

export interface UserProfile {
  id: string;
  guildId: string;
  discordUserId: string;
  displayName: string;
  age: number | null;
  bio: string;
  lookingFor: LookingForOption[];
  compatibilityAnswers: CompatibilityAnswers;
  compatibility?: CompatibilityResult;
  termsAcceptedAt: Date | null;
  termsVersion: string | null;
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
  compatibilityAnswers: CompatibilityAnswers;
  termsAcceptedAt: Date;
  termsVersion: string;
  receiveDm: boolean;
  avatarUrl: string;
  consentedAt: Date;
}

const normalizedLookingFor = new Map<string, LookingForOption>(
  LOOKING_FOR_OPTIONS.map((option) => [normalizeOption(option), option])
);

const compatibilityOptionsByQuestion = new Map<CompatibilityQuestionKey, Map<string, string>>(
  COMPATIBILITY_QUESTIONS.map((question) => [
    question.key,
    new Map(question.options.map((option) => [normalizeOption(option), option]))
  ])
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

export function validateCompatibilityAnswer(questionKey: CompatibilityQuestionKey, answer: string): string {
  const normalizedAnswer = compatibilityOptionsByQuestion.get(questionKey)?.get(normalizeOption(answer));
  if (!normalizedAnswer) {
    const question = COMPATIBILITY_QUESTIONS.find((item) => item.key === questionKey);
    throw new Error(`Resposta inválida para "${question?.label ?? questionKey}": ${answer}`);
  }

  return normalizedAnswer;
}

export function parseCompatibilityAnswers(rawValue: string): CompatibilityAnswers {
  const answers: CompatibilityAnswers = {};
  const segments = rawValue
    .split(/[;\n]/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const [rawLabel, ...rawAnswerParts] = segment.split(':');
    if (!rawLabel || rawAnswerParts.length === 0) {
      continue;
    }

    const label = normalizeOption(rawLabel.replace(/^\+?18$/i, ''));
    const answer = rawAnswerParts.join(':').trim();
    const question = COMPATIBILITY_QUESTIONS.find((item) => normalizeOption(item.label) === label);
    if (!question || !answer) {
      continue;
    }

    const normalizedAnswer = compatibilityOptionsByQuestion.get(question.key)?.get(normalizeOption(answer));
    if (!normalizedAnswer) {
      throw new Error(`Resposta inválida para "${question.label}": ${answer}`);
    }

    answers[question.key] = normalizedAnswer;
  }

  return answers;
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

export function calculateCompatibility(viewer: UserProfile, target: UserProfile): CompatibilityResult {
  const sharedInterests = target.lookingFor.filter((interest) => viewer.lookingFor.includes(interest));
  const interestBase = Math.max(viewer.lookingFor.length, target.lookingFor.length, 1);
  const interestScore = (sharedInterests.length / interestBase) * 60;

  const matchingAnswers = COMPATIBILITY_QUESTIONS.filter((question) => {
    const viewerAnswer = viewer.compatibilityAnswers[question.key];
    const targetAnswer = target.compatibilityAnswers[question.key];
    return Boolean(viewerAnswer && targetAnswer && viewerAnswer === targetAnswer);
  });
  const answerScore = (matchingAnswers.length / COMPATIBILITY_QUESTIONS.length) * 40;

  const sharedPoints = [
    ...sharedInterests.map(formatCompatibilityPoint),
    ...matchingAnswers.map((question) => formatCompatibilityPoint(viewer.compatibilityAnswers[question.key] ?? question.label))
  ].slice(0, 5);

  return {
    percentage: Math.max(0, Math.min(100, Math.round(interestScore + answerScore))),
    sharedPoints
  };
}

export function hasAcceptedCurrentTerms(profile: Pick<UserProfile, 'termsAcceptedAt' | 'termsVersion'>): boolean {
  return profile.termsAcceptedAt !== null && profile.termsVersion === CURRENT_TERMS_VERSION;
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

function formatCompatibilityPoint(value: string): string {
  return `${COMPATIBILITY_POINT_EMOJIS[value] ?? '💚'} ${value}`;
}

function normalizeOption(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
