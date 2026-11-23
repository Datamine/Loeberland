export const PLAYER_CHAT_LIMIT = 140;
export const PLAYER_CHAT_COOLDOWN_MS = 700;
export const QUICK_CHAT = ['Yo', 'Ok', 'No'] as const;

export function quickChatLine(value: unknown) {
  if (typeof value !== 'string' || value.length > 2) return '';
  return QUICK_CHAT.find((phrase) => phrase.toLowerCase() === value.toLowerCase()) ?? '';
}

export function playerChatLine(value: unknown) {
  if (typeof value !== 'string' || value.length > PLAYER_CHAT_LIMIT) return '';
  return value.replace(/[\p{Cc}\u2028\u2029]/gu, ' ').trim();
}
