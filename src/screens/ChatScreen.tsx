import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { dispatchBuild, setChatSession, streamChat, tryDispatchCommand } from '../api';
import {
  ChatMessage,
  loadHistory,
  loadSessionUser,
  loadUseClaude,
  resetSessionUser,
  saveHistory,
  saveLastExchange,
  saveUseClaude,
  Settings,
} from '../settings';
import { COLORS } from '../theme';
import { speak, startListening, stopListening, stopSpeaking, useSpeechRecognitionEvent } from '../voice';

let idCounter = 0;
const nextId = () => `${Date.now()}-${++idCounter}`;

// Clawdia ends a reply with a build marker when Jordan asks for something
// buildable: [[BUILD: project=<kebab> | task=<one line>]]. We pull it out of the
// visible text and turn it into a tap-to-build card (the optional "use Claude"
// hand-off). See the code-dispatch before_prompt_build nudge on the gateway.
const BUILD_MARKER = /\[\[BUILD:\s*project=([^|\]]+?)\s*\|\s*task=([\s\S]+?)\]\]/i;

type Build = { project: string; task: string };

// Tap-to-send starters on an empty chat — one per real capability (live web
// search, reminders, memory recall, PC control) so a fresh conversation shows
// what Clawdia can actually do.
const STARTERS = [
  "What's the latest news?",
  'Remind me to stretch in 30 minutes',
  'What do you know about me?',
  "How's my PC doing?",
];

function parseBuild(content: string): { text: string; build: Build | null } {
  const m = content.match(BUILD_MARKER);
  if (m) {
    return { text: content.replace(BUILD_MARKER, '').trim(), build: { project: m[1].trim(), task: m[2].trim() } };
  }
  // Hide a half-streamed marker so the raw tokens never flash in the bubble.
  const idx = content.indexOf('[[BUILD:');
  if (idx !== -1) return { text: content.slice(0, idx).trim(), build: null };
  return { text: content, build: null };
}

// The "hand this to Claude Code" affordance under a reply. Collapsed to a chip
// by default; expanded (ready to tap) when the 🤖 Use-Claude toggle is on.
function BuildCard({ settings, build, emphasized }: { settings: Settings; build: Build; emphasized: boolean }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [expanded, setExpanded] = useState(emphasized);
  const [err, setErr] = useState('');

  const go = useCallback(async () => {
    setState('sending');
    setErr('');
    try {
      await dispatchBuild(settings, build.project, build.task, false);
      setState('sent');
    } catch (e) {
      setState('error');
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [settings, build]);

  if (state === 'sent') {
    return (
      <View style={styles.buildSent}>
        <Text style={styles.buildSentText}>🚀 Sent “{build.project}” to Claude Code — watch it in the Build tab.</Text>
      </View>
    );
  }

  if (!expanded) {
    return (
      <Pressable style={styles.buildChip} onPress={() => setExpanded(true)}>
        <Text style={styles.buildChipText}>✨ Build “{build.project}” with Claude Code →</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.buildCard}>
      <Text style={styles.buildCardTitle}>🤖 Build with Claude Code</Text>
      <Text style={styles.buildCardProject}>{build.project}</Text>
      <Text style={styles.buildCardTask} numberOfLines={4}>{build.task}</Text>
      {state === 'error' && <Text style={styles.buildErr}>⚠ {err}</Text>}
      <View style={styles.buildActions}>
        <Pressable style={styles.buildGhost} onPress={() => setExpanded(false)} disabled={state === 'sending'}>
          <Text style={styles.buildGhostText}>Not now</Text>
        </Pressable>
        <Pressable style={styles.buildPrimary} onPress={go} disabled={state === 'sending'}>
          {state === 'sending' ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.buildPrimaryText}>Build it</Text>}
        </Pressable>
      </View>
    </View>
  );
}

export function ChatScreen({ settings }: { settings: Settings }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  // When on, every reply is read aloud — not just replies to spoken input.
  const [autoSpeak, setAutoSpeak] = useState(false);
  // When on, build suggestions come pre-expanded (lead with the Claude Code
  // hand-off); off keeps them as a subtle chip (local-first, Claude optional).
  const [useClaude, setUseClaude] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const abortRef = useRef<AbortController | null>(null);
  // True when the pending input came from the mic — so we speak the reply back
  // (talk → hear; type → read).
  const voiceRef = useRef(false);
  // Pad the whole screen by the keyboard's exact reported height so the input
  // row always sits right on top of it. The tab bar hides while the keyboard is
  // open (App.tsx watches the same state), so the padding maps 1:1 to screen
  // space — no layout-measurement math to get wrong.
  const keyboardPad = useKeyboardState((s) => (s.isVisible ? s.height : 0));
  // The list renders inverted (offset 0 = latest message), so it opens at the
  // bottom and stays pinned there while replies stream in.
  const listData = useMemo(() => [...messages].reverse(), [messages]);

  useEffect(() => {
    loadHistory().then(setMessages);
    loadSessionUser().then(setChatSession);
    loadUseClaude().then(setUseClaude);
  }, []);

  const toggleUseClaude = useCallback(() => {
    setUseClaude((on) => {
      saveUseClaude(!on).catch(() => {});
      return !on;
    });
  }, []);

  // Live transcript → input while listening.
  useSpeechRecognitionEvent('result', (e: any) => {
    const t = e?.results?.[0]?.transcript;
    if (typeof t === 'string') {
      voiceRef.current = true;
      setInput(t);
    }
  });
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('error', () => setListening(false));

  const toggleMic = useCallback(async () => {
    if (listening) {
      stopListening();
      setListening(false);
      return;
    }
    stopSpeaking();
    voiceRef.current = true;
    const ok = await startListening();
    if (ok) setListening(true);
    else setError('Microphone permission is needed to talk to Clawdia.');
  }, [listening]);

  const persist = useCallback((next: ChatMessage[]) => {
    setMessages(next);
    saveHistory(next).catch(() => {});
  }, []);

  // Wipe the visible thread AND rotate the gateway session so Clawdia forgets the
  // conversation context — a genuinely fresh start, not just a cleared screen.
  const clearChat = useCallback(() => {
    if (busy || messages.length === 0) return;
    Alert.alert('Clear chat?', "This erases the conversation and Clawdia's memory of it.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          stopSpeaking();
          setChatSession(await resetSessionUser());
          persist([]);
          setError(null);
        },
      },
    ]);
  }, [busy, messages.length, persist]);

  const send = useCallback(async (textOverride?: string) => {
    const prompt = (textOverride ?? input).trim();
    if (!prompt || busy) return;
    const wasVoice = voiceRef.current; // speak the reply only if you spoke to it
    voiceRef.current = false;
    if (listening) {
      stopListening();
      setListening(false);
    }
    stopSpeaking();
    setInput('');
    setError(null);
    setBusy(true);
    // A fresh send should always snap the conversation into view, even if
    // Jordan had scrolled way up. Offset 0 is the bottom on an inverted list.
    listRef.current?.scrollToOffset({ offset: 0, animated: true });

    const userMsg: ChatMessage = { id: nextId(), role: 'user', content: prompt };
    const botMsg: ChatMessage = { id: nextId(), role: 'assistant', content: '', pending: true };
    let next = [...messages, userMsg, botMsg];
    persist(next);

    const controller = new AbortController();
    abortRef.current = controller;
    let reply = '';

    try {
      const command = await tryDispatchCommand(settings, prompt);
      if (command !== null) {
        next = next.map((m) => (m.id === botMsg.id ? { ...m, content: command, pending: false } : m));
        persist(next);
        return;
      }
      for await (const delta of streamChat(settings, prompt, controller.signal)) {
        reply += delta;
        next = next.map((m) => (m.id === botMsg.id ? { ...m, content: reply } : m));
        setMessages(next);
      }
      next = next.map((m) =>
        m.id === botMsg.id ? { ...m, content: reply.trim() || '(stopped)', pending: false } : m,
      );
      persist(next);
      if (reply.trim()) {
        const spoken = parseBuild(reply.trim()).text; // never read the build marker aloud
        saveLastExchange(prompt, spoken).catch(() => {});
        if (spoken && (wasVoice || autoSpeak)) speak(spoken); // spoke to her, or 🔊 on
      }
    } catch (err) {
      if (reply.trim()) {
        // The stream dropped mid-reply. Keep what already arrived — losing
        // half an answer is worse than a banner explaining the cutoff.
        next = next.map((m) =>
          m.id === botMsg.id ? { ...m, content: reply.trim(), pending: false } : m,
        );
        persist(next);
      } else {
        // The send failed outright (e.g. PC asleep). Drop the pending bubbles
        // and hand the prompt back so it can be retried without retyping.
        persist(messages);
        setInput((cur) => (cur.trim() ? cur : prompt));
      }
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }, [input, busy, listening, autoSpeak, messages, settings, persist]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return (
    <View style={[styles.flex, keyboardPad > 0 && { paddingBottom: keyboardPad }]}>
      <View style={styles.toolbar}>
        <Pressable onPress={toggleUseClaude} hitSlop={8} style={styles.toolBtn}>
          <Text style={styles.toolGlyph}>🤖</Text>
          <Text style={[styles.toolLabel, useClaude && styles.toolLabelOn]}>
            {useClaude ? 'Claude' : 'Local'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setAutoSpeak((on) => {
              if (on) stopSpeaking();
              return !on;
            });
          }}
          hitSlop={8}
          style={styles.toolBtn}
        >
          <Text style={styles.toolGlyph}>{autoSpeak ? '🔊' : '🔇'}</Text>
          <Text style={[styles.toolLabel, autoSpeak && styles.toolLabelOn]}>
            {autoSpeak ? 'Voice on' : 'Voice off'}
          </Text>
        </Pressable>
        <Pressable
          onPress={clearChat}
          hitSlop={8}
          disabled={busy || messages.length === 0}
          style={[styles.toolBtn, (busy || messages.length === 0) && styles.toolBtnOff]}
        >
          <Text style={styles.toolGlyph}>🗑️</Text>
          <Text style={styles.toolLabel}>Clear</Text>
        </Pressable>
      </View>
      <FlatList
        ref={listRef}
        data={listData}
        // Only invert when there are messages — an inverted ListEmptyComponent
        // renders upside down (long-standing RN quirk).
        inverted={messages.length > 0}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        // Native bottom-pinning: stay put when scrolled up reading history, but
        // follow new messages whenever we're within 100px of the bottom.
        maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 100 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>💬</Text>
            <Text style={styles.emptyText}>
              Chat with the AI on your PC — or tap one to try:
            </Text>
            <View style={styles.starters}>
              {STARTERS.map((s) => (
                <Pressable key={s} style={styles.starter} onPress={() => send(s)}>
                  <Text style={styles.starterText}>{s}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.emptyHint}>
              Tip: <Text style={styles.mono}>/build myapp a snake game</Text> puts Claude Code to
              work.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          if (item.role === 'assistant' && item.content) {
            const { text, build } = parseBuild(item.content);
            const bubble = (
              <Pressable onPress={() => text && speak(text)}>
                <View style={[styles.bubble, styles.bot]}>
                  {item.pending && !text ? (
                    <ActivityIndicator color={COLORS.textDim} size="small" />
                  ) : (
                    <Text style={styles.bubbleText}>{text}</Text>
                  )}
                </View>
              </Pressable>
            );
            // Show the build card only once the reply (and its marker) is complete.
            if (build && !item.pending) {
              return (
                <View style={styles.botGroup}>
                  {bubble}
                  <BuildCard settings={settings} build={build} emphasized={useClaude} />
                </View>
              );
            }
            return bubble;
          }
          return (
            <View style={[styles.bubble, item.role === 'user' ? styles.user : styles.bot]}>
              {item.pending && !item.content ? (
                <ActivityIndicator color={COLORS.textDim} size="small" />
              ) : (
                <Text style={styles.bubbleText}>{item.content}</Text>
              )}
            </View>
          );
        }}
      />
      {error && (
        <Pressable style={styles.errorBanner} onPress={() => setError(null)}>
          <Text style={styles.errorText}>⚠ {error}</Text>
          <Text style={styles.errorDismiss}>tap to dismiss</Text>
        </Pressable>
      )}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={(t) => {
            voiceRef.current = false; // typed, so don't speak the reply back
            setInput(t);
          }}
          placeholder={listening ? 'Listening…' : 'Message Clawdia, or tap 🎤 to talk…'}
          placeholderTextColor={COLORS.textDim}
          multiline
          editable={!busy}
        />
        {/* One round button next to a full-width input: stop while generating,
            send when there's text, otherwise the mic to talk. */}
        {busy ? (
          <Pressable style={styles.action} onPress={stop}>
            <Text style={styles.stopGlyph}>■</Text>
          </Pressable>
        ) : input.trim() ? (
          <Pressable style={styles.action} onPress={() => send()}>
            <Text style={styles.sendText}>↑</Text>
          </Pressable>
        ) : (
          <Pressable style={[styles.action, listening ? styles.micActive : styles.micIdle]} onPress={toggleMic}>
            <Text style={styles.micGlyph}>🎤</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: 16, gap: 8, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 },
  emptyEmoji: { fontSize: 44 },
  emptyText: { color: COLORS.textDim, fontSize: 15, textAlign: 'center', lineHeight: 23 },
  starters: { gap: 8, alignSelf: 'stretch' },
  starter: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(79,140,255,0.35)',
  },
  starterText: { color: COLORS.text, fontSize: 14.5, textAlign: 'center' },
  emptyHint: { color: COLORS.textDim, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  mono: { color: COLORS.accent, fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier' },
  bubble: { maxWidth: '86%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  user: { alignSelf: 'flex-end', backgroundColor: COLORS.accent },
  bot: { alignSelf: 'flex-start', backgroundColor: COLORS.surface },
  bubbleText: { color: COLORS.text, fontSize: 15.5, lineHeight: 22 },
  botGroup: { alignSelf: 'flex-start', maxWidth: '90%', gap: 6 },
  buildChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(124,127,255,0.14)',
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  buildChipText: { color: COLORS.accent, fontSize: 13.5, fontWeight: '700' },
  buildCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(124,127,255,0.4)',
    padding: 13,
    gap: 5,
  },
  buildCardTitle: { color: COLORS.accent, fontSize: 12.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  buildCardProject: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  buildCardTask: { color: COLORS.textDim, fontSize: 13.5, lineHeight: 19 },
  buildErr: { color: COLORS.danger, fontSize: 12.5 },
  buildActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 6 },
  buildGhost: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  buildGhostText: { color: COLORS.textDim, fontSize: 14, fontWeight: '600' },
  buildPrimary: { backgroundColor: COLORS.accent, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 9, minWidth: 78, alignItems: 'center' },
  buildPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  buildSent: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(80,200,120,0.14)',
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 9,
    maxWidth: '90%',
  },
  buildSentText: { color: COLORS.good, fontSize: 13.5, fontWeight: '600', lineHeight: 19 },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 18,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 2,
  },
  toolBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  toolBtnOff: { opacity: 0.35 },
  toolGlyph: { fontSize: 15 },
  toolLabel: { color: COLORS.textDim, fontSize: 12.5, fontWeight: '600' },
  toolLabelOn: { color: COLORS.accent },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, gap: 8, backgroundColor: COLORS.bg },
  input: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 15.5,
    maxHeight: 130,
  },
  action: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' },
  micIdle: { backgroundColor: COLORS.surface },
  micActive: { backgroundColor: 'rgba(255,107,107,0.22)' },
  micGlyph: { fontSize: 19 },
  sendText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  stopGlyph: { color: '#fff', fontSize: 16, fontWeight: '700' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 12,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: 'rgba(220,53,69,0.14)',
  },
  errorText: { color: COLORS.danger, fontSize: 13.5, flexShrink: 1, paddingRight: 10 },
  errorDismiss: { color: COLORS.textDim, fontSize: 11.5 },
});
