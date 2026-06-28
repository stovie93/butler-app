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

// A sleeping/unreachable PC over Tailscale can leave a bare fetch hanging for
// 30–60s before the OS gives up. Cap every call so the UI fails fast and clear.
const DEFAULT_TIMEOUT_MS = 10000;

async function fetchWithTimeout(
  url: string,
  options: Parameters<typeof fetch>[1],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(
        `No response within ${Math.round(timeoutMs / 1000)}s — is the PC awake and reachable?`,
      );
    }
    if (err instanceof TypeError) {
      throw new Error('Could not reach the gateway — is the PC awake and on Tailscale?');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Lightweight reachability probe for the header status dot. Never throws. */
export async function checkHealth(settings: Settings): Promise<boolean> {
  if (!settings.baseUrl || !settings.token) return false;
  try {
    const res = await fetchWithTimeout(
      `${normalizeBaseUrl(settings.baseUrl)}/v1/models`,
      { headers: { Authorization: `Bearer ${settings.token}` } },
      6000,
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function testConnection(settings: Settings): Promise<string> {
  requireSettings(settings);
  const res = await fetchWithTimeout(`${normalizeBaseUrl(settings.baseUrl)}/v1/models`, {
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
  const res = await fetchWithTimeout(`${normalizeBaseUrl(settings.baseUrl)}/api/v1/code-dispatch`, {
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

// ---- Structured dispatch API used by the GUI screens ----

export type Job = {
  id: string;
  project: string;
  task: string;
  status: 'running' | 'done' | 'failed' | string;
  started: string | null;
  finished: string | null;
};

export type AwakeStatus = {
  blockingSleep: boolean;
  active: boolean;
  holdUntil: string | null;
  checkedAt: string | null;
  runningJobs: number;
};

async function dispatchPost(
  settings: Settings,
  payload: Record<string, unknown>,
): Promise<any> {
  requireSettings(settings);
  const res = await fetchWithTimeout(`${normalizeBaseUrl(settings.baseUrl)}/api/v1/code-dispatch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Gateway answered HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Dispatch a build to Claude Code. Returns the gateway's confirmation text. */
export async function dispatchBuild(
  settings: Settings,
  project: string,
  task: string,
  continueSession: boolean,
): Promise<string> {
  const body = await dispatchPost(settings, {
    action: 'build',
    project,
    task,
    continue: continueSession,
  });
  return typeof body?.text === 'string' ? body.text : '(no output)';
}

export async function listJobs(settings: Settings, limit = 30): Promise<Job[]> {
  const body = await dispatchPost(settings, { action: 'jobsData', limit });
  return Array.isArray(body?.jobs) ? (body.jobs as Job[]) : [];
}

export async function getJobLog(settings: Settings, jobId: string): Promise<string> {
  const body = await dispatchPost(settings, { action: 'jobLog', jobId });
  return typeof body?.log === 'string' ? body.log : '(no log)';
}

export async function setAwake(
  settings: Settings,
  duration: string,
): Promise<{ text: string; status?: AwakeStatus }> {
  const body = await dispatchPost(settings, { action: 'awake', duration });
  return { text: body?.text ?? '', status: body?.status };
}

export async function getStatus(settings: Settings): Promise<AwakeStatus> {
  const body = await dispatchPost(settings, { action: 'status' });
  return body?.status as AwakeStatus;
}

/** One-shot, non-streaming request. Used by the home-screen widget. */
export async function chatOnce(settings: Settings, prompt: string): Promise<string> {
  requireSettings(settings);
  const res = await fetchWithTimeout(`${normalizeBaseUrl(settings.baseUrl)}/v1/chat/completions`, {
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

/**
 * Streaming request; yields reply text deltas as they arrive.
 * Pass `signal` to let the caller stop generation (the Stop button).
 */
export async function* streamChat(
  settings: Settings,
  prompt: string,
  signal?: AbortSignal,
): AsyncGenerator<string, void, void> {
  requireSettings(settings);

  // Internal controller drives the fetch; it's tripped by either the caller's
  // stop signal or a connection timeout (cleared once headers arrive, so a
  // long-running generation is never cut off mid-stream).
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort);
  }
  let connectTimer: ReturnType<typeof setTimeout> | null = setTimeout(
    () => controller.abort(),
    12000,
  );
  const clearConnectTimer = () => {
    if (connectTimer) {
      clearTimeout(connectTimer);
      connectTimer = null;
    }
  };

  let res: Awaited<ReturnType<typeof expoFetch>>;
  try {
    res = await expoFetch(`${normalizeBaseUrl(settings.baseUrl)}/v1/chat/completions`, {
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
      signal: controller.signal,
    });
  } catch (err) {
    clearConnectTimer();
    if (signal) signal.removeEventListener('abort', onAbort);
    if (signal?.aborted) return; // caller stopped before we connected
    if (controller.signal.aborted) {
      throw new Error('No response within 12s — is the PC awake and reachable?');
    }
    throw err;
  }
  clearConnectTimer();

  if (!res.ok) {
    if (signal) signal.removeEventListener('abort', onAbort);
    throw new Error(`Gateway answered HTTP ${res.status}: ${await res.text()}`);
  }
  if (!res.body) {
    if (signal) signal.removeEventListener('abort', onAbort);
    throw new Error('Gateway response has no body');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      let done: boolean;
      let value: Uint8Array | undefined;
      try {
        ({ done, value } = await reader.read());
      } catch (err) {
        if (controller.signal.aborted) return; // stopped by the user
        throw err;
      }
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
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

export type JobLogEnd = { status: string; result?: unknown; exitCode?: number | null };

/**
 * Open the live job-log stream (SSE) for a running job. `onSnapshot` fires with
 * each full formatted log snapshot, `onEnd` once when the job reaches a terminal
 * state, and `onError` if the stream can't be established (caller should fall
 * back to polling). Returns a stop function.
 */
export function streamJobLog(
  settings: Settings,
  jobId: string,
  handlers: {
    onSnapshot: (log: string) => void;
    onEnd: (info: JobLogEnd) => void;
    onError: (err: Error) => void;
  },
): () => void {
  const controller = new AbortController();
  let stopped = false;
  const stop = () => {
    stopped = true;
    controller.abort();
  };

  (async () => {
    // Trip the fetch if headers never arrive; cleared once the stream connects
    // so a long-running build is never cut off mid-stream.
    let connectTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => controller.abort(), 12000);
    const clearConnectTimer = () => {
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }
    };
    try {
      requireSettings(settings);
      const url = `${normalizeBaseUrl(settings.baseUrl)}/api/v1/code-dispatch/stream?jobId=${encodeURIComponent(jobId)}`;
      const res = await expoFetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${settings.token}`, Accept: 'text/event-stream' },
        signal: controller.signal,
      });
      clearConnectTimer();
      if (!res.ok) throw new Error(`Gateway answered HTTP ${res.status}`);
      if (!res.body) throw new Error('Stream has no body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        let done: boolean;
        let value: Uint8Array | undefined;
        try {
          ({ done, value } = await reader.read());
        } catch (err) {
          if (stopped) return; // caller closed the stream
          throw err;
        }
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          let eventType = 'message';
          const dataLines: string[] = [];
          for (const line of block.split('\n')) {
            if (line.startsWith(':')) continue; // keep-alive comment
            if (line.startsWith('event:')) eventType = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
          }
          if (!dataLines.length) continue;
          let payload: any;
          try {
            payload = JSON.parse(dataLines.join('\n'));
          } catch {
            continue;
          }
          if (eventType === 'end') {
            handlers.onEnd({
              status: typeof payload?.status === 'string' ? payload.status : 'unknown',
              result: payload?.result,
              exitCode: payload?.exitCode ?? null,
            });
            return;
          }
          if (typeof payload?.log === 'string') handlers.onSnapshot(payload.log);
        }
      }
    } catch (err) {
      clearConnectTimer();
      if (stopped) return;
      handlers.onError(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return stop;
}

// ---- PC quick-actions: remote-control the computer ----

/**
 * Run a PC quick-action on the gateway machine. Returns the result text.
 * Power actions (shutdown/restart) are gated server-side: the request blocks
 * until you approve in the Approvals tab, so pass a longer `timeoutMs` for those.
 */
export async function pcAction(
  settings: Settings,
  action: string,
  arg?: string,
  timeoutMs?: number,
): Promise<string> {
  requireSettings(settings);
  const res = await fetchWithTimeout(
    `${normalizeBaseUrl(settings.baseUrl)}/api/v1/pc`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.token}`,
      },
      body: JSON.stringify(arg ? { action, arg } : { action }),
    },
    timeoutMs,
  );
  if (!res.ok) {
    let msg = `Gateway answered HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {}
    throw new Error(msg);
  }
  const body = await res.json();
  return typeof body?.text === 'string' ? body.text : '(no output)';
}

// ---- Approvals: the butler asks, you decide ----

export type Approval = {
  id: string;
  toolName: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical' | string;
  argsBrief: string;
  status: 'pending' | 'allowed' | 'denied' | 'expired' | string;
  createdAt: string;
  expiresAt: string;
};

export type ApprovalDecision = 'allow-once' | 'deny';

async function approvalsPost(settings: Settings, payload: Record<string, unknown>): Promise<any> {
  requireSettings(settings);
  const res = await fetchWithTimeout(`${normalizeBaseUrl(settings.baseUrl)}/api/v1/approvals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Gateway answered HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function listApprovals(settings: Settings): Promise<Approval[]> {
  const body = await approvalsPost(settings, { action: 'list' });
  return Array.isArray(body?.approvals) ? (body.approvals as Approval[]) : [];
}

export async function decideApproval(
  settings: Settings,
  id: string,
  decision: ApprovalDecision,
): Promise<void> {
  await approvalsPost(settings, { action: 'decide', id, decision });
}

/**
 * Live approval stream (SSE). `onSnapshot` fires once with the current pending
 * set, then `onPending`/`onResolved` fire as approvals arrive and get decided.
 * `onError` fires if the stream can't connect (caller should fall back to polling).
 * Returns a stop function.
 */
// ---- Reminders: plain-language nudges that fire a toast / WhatsApp ----

export type Reminder = {
  id: string;
  text: string;
  when: string;
  fireAt: number;
  fireAtISO: string;
  status: 'pending' | 'fired' | 'cancelled' | string;
  createdAt: string;
  relative?: string;
};

async function remindersPost(settings: Settings, payload: Record<string, unknown>): Promise<any> {
  requireSettings(settings);
  const res = await fetchWithTimeout(`${normalizeBaseUrl(settings.baseUrl)}/api/v1/reminders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let msg = `Gateway answered HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export async function listReminders(settings: Settings): Promise<Reminder[]> {
  const body = await remindersPost(settings, { action: 'list' });
  return Array.isArray(body?.reminders) ? (body.reminders as Reminder[]) : [];
}

/** Create a reminder. `when` is plain language: "in 2 hours", "at 6pm", "tomorrow at 9am". */
export async function addReminder(
  settings: Settings,
  text: string,
  when: string,
): Promise<Reminder> {
  const body = await remindersPost(settings, { action: 'add', text, when });
  return body?.reminder as Reminder;
}

export async function cancelReminder(settings: Settings, id: string): Promise<void> {
  await remindersPost(settings, { action: 'cancel', id });
}

export function streamApprovals(
  settings: Settings,
  handlers: {
    onSnapshot?: (approvals: Approval[]) => void;
    onPending?: (approval: Approval) => void;
    onResolved?: (approval: Approval) => void;
    onError?: (err: Error) => void;
  },
): () => void {
  const controller = new AbortController();
  let stopped = false;
  const stop = () => {
    stopped = true;
    controller.abort();
  };

  (async () => {
    let connectTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => controller.abort(), 12000);
    const clearConnectTimer = () => {
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }
    };
    try {
      requireSettings(settings);
      const url = `${normalizeBaseUrl(settings.baseUrl)}/api/v1/approvals/stream`;
      const res = await expoFetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${settings.token}`, Accept: 'text/event-stream' },
        signal: controller.signal,
      });
      clearConnectTimer();
      if (!res.ok) throw new Error(`Gateway answered HTTP ${res.status}`);
      if (!res.body) throw new Error('Stream has no body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        let done: boolean;
        let value: Uint8Array | undefined;
        try {
          ({ done, value } = await reader.read());
        } catch (err) {
          if (stopped) return;
          throw err;
        }
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          let eventType = 'message';
          const dataLines: string[] = [];
          for (const line of block.split('\n')) {
            if (line.startsWith(':')) continue;
            if (line.startsWith('event:')) eventType = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
          }
          if (!dataLines.length) continue;
          let payload: any;
          try {
            payload = JSON.parse(dataLines.join('\n'));
          } catch {
            continue;
          }
          if (eventType === 'snapshot' && Array.isArray(payload?.approvals)) handlers.onSnapshot?.(payload.approvals);
          else if (eventType === 'pending') handlers.onPending?.(payload);
          else if (eventType === 'resolved') handlers.onResolved?.(payload);
        }
      }
    } catch (err) {
      clearConnectTimer();
      if (stopped) return;
      handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return stop;
}
