import AsyncStorage from '@react-native-async-storage/async-storage';

export type Settings = {
  baseUrl: string;
  token: string;
  /** Chat model override (bare id, e.g. "gpt-oss:20b"). Empty = gateway default. */
  model?: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
};

export type LastExchange = {
  prompt: string;
  reply: string;
  at: number;
};

const SETTINGS_KEY = 'butler.settings';
const HISTORY_KEY = 'butler.history';
const LAST_EXCHANGE_KEY = 'butler.lastExchange';
const SESSION_KEY = 'butler.session';

// The gateway keys conversation context by the `user` field. Clearing the chat
// rotates this id so the server starts a brand-new session (context "goes away")
// — the old session is left idle for the gateway to reap.
export async function loadSessionUser(): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (raw) return raw;
  } catch {}
  return 'butler-phone';
}

export async function resetSessionUser(): Promise<string> {
  const user = `butler-phone-${Date.now().toString(36)}`;
  try {
    await AsyncStorage.setItem(SESSION_KEY, user);
  } catch {}
  return user;
}

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { baseUrl: '', token: '' };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function loadHistory(): Promise<ChatMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export async function saveHistory(messages: ChatMessage[]): Promise<void> {
  // Keep storage bounded; the server session holds the real context.
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-100)));
}

export async function loadLastExchange(): Promise<LastExchange | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_EXCHANGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export async function saveLastExchange(prompt: string, reply: string): Promise<void> {
  const value: LastExchange = { prompt, reply, at: Date.now() };
  await AsyncStorage.setItem(LAST_EXCHANGE_KEY, JSON.stringify(value));
}
