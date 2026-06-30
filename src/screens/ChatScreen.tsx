import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { setChatSession, streamChat, tryDispatchCommand } from '../api';
import {
  ChatMessage,
  loadHistory,
  loadSessionUser,
  resetSessionUser,
  saveHistory,
  saveLastExchange,
  Settings,
} from '../settings';
import { COLORS } from '../theme';
import { speak, startListening, stopListening, stopSpeaking, useSpeechRecognitionEvent } from '../voice';

let idCounter = 0;
const nextId = () => `${Date.now()}-${++idCounter}`;

export function ChatScreen({ settings }: { settings: Settings }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  // When on, every reply is read aloud — not just replies to spoken input.
  const [autoSpeak, setAutoSpeak] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const abortRef = useRef<AbortController | null>(null);
  const atBottomRef = useRef(true);
  // True when the pending input came from the mic — so we speak the reply back
  // (talk → hear; type → read).
  const voiceRef = useRef(false);

  useEffect(() => {
    loadHistory().then(setMessages);
    loadSessionUser().then(setChatSession);
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

  const send = useCallback(async () => {
    const prompt = input.trim();
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
    atBottomRef.current = true; // a fresh send should always scroll into view

    const userMsg: ChatMessage = { id: nextId(), role: 'user', content: prompt };
    const botMsg: ChatMessage = { id: nextId(), role: 'assistant', content: '', pending: true };
    let next = [...messages, userMsg, botMsg];
    persist(next);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const command = await tryDispatchCommand(settings, prompt);
      if (command !== null) {
        next = next.map((m) => (m.id === botMsg.id ? { ...m, content: command, pending: false } : m));
        persist(next);
        return;
      }
      let reply = '';
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
        saveLastExchange(prompt, reply.trim()).catch(() => {});
        if (wasVoice || autoSpeak) speak(reply.trim()); // spoke to her, or 🔊 on
      }
    } catch (err) {
      // The send failed (e.g. PC asleep). Drop the pending bubbles and hand the
      // prompt back so it can be retried without retyping.
      persist(messages);
      setInput((cur) => (cur.trim() ? cur : prompt));
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }, [input, busy, listening, autoSpeak, messages, settings, persist]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <View style={styles.toolbar}>
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
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        scrollEventThrottle={120}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          atBottomRef.current =
            contentOffset.y + layoutMeasurement.height >= contentSize.height - 60;
        }}
        onContentSizeChange={() => {
          if (atBottomRef.current) listRef.current?.scrollToEnd({ animated: true });
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>💬</Text>
            <Text style={styles.emptyText}>
              Chat with the local model on your PC. Tip: type a command like{'\n'}
              <Text style={styles.mono}>/build myapp a snake game</Text> to put Claude to work.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const bubble = (
            <View style={[styles.bubble, item.role === 'user' ? styles.user : styles.bot]}>
              {item.pending && !item.content ? (
                <ActivityIndicator color={COLORS.textDim} size="small" />
              ) : (
                <Text style={styles.bubbleText}>{item.content}</Text>
              )}
            </View>
          );
          // Tap one of Clawdia's replies to hear it read aloud.
          if (item.role === 'assistant' && item.content) {
            return <Pressable onPress={() => speak(item.content)}>{bubble}</Pressable>;
          }
          return bubble;
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
          <Pressable style={styles.action} onPress={send}>
            <Text style={styles.sendText}>↑</Text>
          </Pressable>
        ) : (
          <Pressable style={[styles.action, listening ? styles.micActive : styles.micIdle]} onPress={toggleMic}>
            <Text style={styles.micGlyph}>🎤</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: 16, gap: 8, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 },
  emptyEmoji: { fontSize: 44 },
  emptyText: { color: COLORS.textDim, fontSize: 15, textAlign: 'center', lineHeight: 23 },
  mono: { color: COLORS.accent, fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier' },
  bubble: { maxWidth: '86%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  user: { alignSelf: 'flex-end', backgroundColor: COLORS.accent },
  bot: { alignSelf: 'flex-start', backgroundColor: COLORS.surface },
  bubbleText: { color: COLORS.text, fontSize: 15.5, lineHeight: 22 },
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
