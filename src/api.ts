import { fetch as expoFetch } from 'expo/fetch';
import type { Settings } from './settings';

// The OpenClaw gateway holds conversation context server-side, keyed by the
// `user` field — so each request only needs the newest user message.
const SESSION_USER = 'butler-phone';

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function requireSettings(settings: Settings): void {
  if (!settings.baseUrl) throw new Error('No gateway URL configured. Open settings.');
  if (!settings.token) throw new Error('No gateway token configured. Open settings.');
}

export async function testConnection(settings: Settings): Promise<string> {
  requireSettings(settings);
  const res = await fetch(`${normalizeBaseUrl(settings.baseUrl)}/v1/models`, {
    headers: { Authorization: `Bearer ${settings.token}` },
  });
  if (!res.ok) throw new Error(`Gateway answered HTTP ${res.status}`);
  const body = await res.json();
  const count = Array.isArray(body?.data) ? body.data.length : 0;
  return `Connected — ${count} model${count === 1 ? '' : 's'} available`;
}

/**
 * Deterministic command dispatch (no LLM): /build and /jobs go straight to the
 * code-dispatch plugin's HTTP route on the gateway.
 * Returns the command output, or null if the text isn't a dispatch command.
 */
export async function tryDispatchCommand(
  settings: Settings,
  text: string,
): Promise<string | null> {
  const trimmed = text.trim();
  let payload: Record<string, unknown> | null = null;

  const build = trimmed.match(/^\/build\s+([\s\S]+)$/i);
  if (build) {
    let rest = build[1].trim();
    let continueSession = false;
    if (/(^|\s)--continue(\s|$)/.test(rest)) {
      continueSession = true;
      rest = rest.replace(/(^|\s)--continue(\s|$)/, ' ').trim();
    }
    const parts = rest.match(/^(\S+)\s+([\s\S]+)$/);
    if (!parts) return 'Usage: /build <project> <task…>  (add --continue to resume)';
    payload = { action: 'build', project: parts[1], task: parts[2], continue: continueSession };
  } else {
    const jobs = trimmed.match(/^\/jobs(?:\s+(\S+))?$/i);
    if (jobs) {
      payload = { action: 'jobs', ...(jobs[1] ? { jobId: jobs[1] } : {}) };
    } else {
      const awake = trimmed.match(/^\/awake(?:\s+(.+))?$/i);
      if (awake) payload = { action: 'awake', duration: (awake[1] ?? '2h').trim() };
    }
  }

  if (!payload) return null;
  requireSettings(settings);
  const res = await fetch(`${normalizeBaseUrl(settings.baseUrl)}/api/v1/code-dispatch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Gateway answered HTTP ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return typeof body?.text === 'string' ? body.text : '(no output)';
}

/** One-shot, non-streaming request. Used by the home-screen widget. */
export async function chatOnce(settings: Settings, prompt: string): Promise<string> {
  requireSettings(settings);
  const res = await fetch(`${normalizeBaseUrl(settings.baseUrl)}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.token}`,
    },
    body: JSON.stringify({
      model: 'openclaw',
      user: SESSION_USER,
      stream: false,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Gateway answered HTTP ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('Gateway returned no reply');
  return content.trim();
}

/** Streaming request; yields reply text deltas as they arrive. */
export async function* streamChat(
  settings: Settings,
  prompt: string,
): AsyncGenerator<string, void, void> {
  requireSettings(settings);
  const res = await expoFetch(`${normalizeBaseUrl(settings.baseUrl)}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.token}`,
    },
    body: JSON.stringify({
      model: 'openclaw',
      user: SESSION_USER,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Gateway answered HTTP ${res.status}: ${await res.text()}`);
  if (!res.body) throw new Error('Gateway response has no body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        for (const line of event.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') return;
          try {
            const chunk = JSON.parse(data);
            const delta = chunk?.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta) yield delta;
          } catch {
            // Ignore malformed keep-alive/comment frames.
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
