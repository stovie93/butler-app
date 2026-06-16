import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { streamChat, tryDispatchCommand } from '../api';
import {
  ChatMessage,
  loadHistory,
  saveHistory,
  saveLastExchange,
  Settings,
} from '../settings';
import { COLORS } from '../theme';

let idCounter = 0;
const nextId = () => `${Date.now()}-${++idCounter}`;

export function ChatScreen({ settings }: { settings: Settings }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    loadHistory().then(setMessages);
  }, []);

  const persist = useCallback((next: ChatMessage[]) => {
    setMessages(next);
    saveHistory(next).catch(() => {});
  }, []);

  const send = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || busy) return;
    setInput('');
    setBusy(true);

    const userMsg: ChatMessage = { id: nextId(), role: 'user', content: prompt };
    const botMsg: ChatMessage = { id: nextId(), role: 'assistant', content: '', pending: true };
    let next = [...messages, userMsg, botMsg];
    persist(next);

    try {
      const command = await tryDispatchCommand(settings, prompt);
      if (command !== null) {
        next = next.map((m) => (m.id === botMsg.id ? { ...m, content: command, pending: false } : m));
        persist(next);
        setBusy(false);
        return;
      }
      let reply = '';
      for await (const delta of streamChat(settings, prompt)) {
        reply += delta;
        next = next.map((m) => (m.id === botMsg.id ? { ...m, content: reply } : m));
        setMessages(next);
      }
      next = next.map((m) =>
        m.id === botMsg.id ? { ...m, content: reply.trim() || '(no reply)', pending: false } : m,
      );
      persist(next);
      saveLastExchange(prompt, reply.trim()).catch(() => {});
    } catch (err) {
      next = next.map((m) =>
        m.id === botMsg.id
          ? { ...m, content: `⚠ ${err instanceof Error ? err.message : String(err)}`, pending: false }
          : m,
      );
      persist(next);
    } finally {
      setBusy(false);
    }
  }, [input, busy, messages, settings, persist]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>💬</Text>
            <Text style={styles.emptyText}>
              Chat with the local model on your PC. Tip: type a command like{'\n'}
              <Text style={styles.mono}>/build myapp a snake game</Text> to put Claude to work.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === 'user' ? styles.user : styles.bot]}>
            {item.pending && !item.content ? (
              <ActivityIndicator color={COLORS.textDim} size="small" />
            ) : (
              <Text style={styles.bubbleText}>{item.content}</Text>
            )}
          </View>
        )}
      />
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Message your computer…"
          placeholderTextColor={COLORS.textDim}
          multiline
          editable={!busy}
        />
        <Pressable
          style={[styles.send, (busy || !input.trim()) && styles.sendOff]}
          onPress={send}
          disabled={busy || !input.trim()}
        >
          {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sendText}>↑</Text>}
        </Pressable>
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
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.4 },
  sendText: { color: '#fff', fontSize: 22, fontWeight: '700' },
});
