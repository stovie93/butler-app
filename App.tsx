import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { streamChat, testConnection } from './src/api';
import {
  ChatMessage,
  loadHistory,
  loadSettings,
  saveHistory,
  saveLastExchange,
  saveSettings,
  Settings,
} from './src/settings';

const COLORS = {
  bg: '#0e1116',
  surface: '#1a1f29',
  surfaceAlt: '#222937',
  accent: '#4f8cff',
  text: '#e8ecf3',
  textDim: '#8b93a3',
  danger: '#ff6b6b',
};

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `${Date.now()}-${idCounter}`;
}

export default function App() {
  const [settings, setSettings] = useState<Settings>({ baseUrl: '', token: '' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    (async () => {
      const [loadedSettings, history] = await Promise.all([loadSettings(), loadHistory()]);
      setSettings(loadedSettings);
      setMessages(history);
      if (!loadedSettings.baseUrl) setSettingsOpen(true);
    })();
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
    const assistantMsg: ChatMessage = { id: nextId(), role: 'assistant', content: '', pending: true };
    let next = [...messages, userMsg, assistantMsg];
    persist(next);

    try {
      let reply = '';
      for await (const delta of streamChat(settings, prompt)) {
        reply += delta;
        next = next.map((m) => (m.id === assistantMsg.id ? { ...m, content: reply } : m));
        setMessages(next);
      }
      next = next.map((m) =>
        m.id === assistantMsg.id
          ? { ...m, content: reply.trim() || '(no reply)', pending: false }
          : m,
      );
      persist(next);
      saveLastExchange(prompt, reply.trim()).catch(() => {});
    } catch (err) {
      next = next.map((m) =>
        m.id === assistantMsg.id
          ? { ...m, content: `⚠ ${err instanceof Error ? err.message : String(err)}`, pending: false }
          : m,
      );
      persist(next);
    } finally {
      setBusy(false);
    }
  }, [input, busy, messages, settings, persist]);

  const clearChat = useCallback(() => {
    persist([]);
  }, [persist]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Butler</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={clearChat} hitSlop={8}>
            <Text style={styles.headerAction}>Clear</Text>
          </Pressable>
          <Pressable onPress={() => setSettingsOpen(true)} hitSlop={8}>
            <Text style={styles.headerAction}>⚙</Text>
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>🤖</Text>
              <Text style={styles.emptyText}>
                Talk to your computer. Messages go straight to the local model running on your PC.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.bubble,
                item.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant,
              ]}
            >
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
            placeholder="Ask your computer…"
            placeholderTextColor={COLORS.textDim}
            multiline
            editable={!busy}
          />
          <Pressable
            style={[styles.sendButton, (busy || !input.trim()) && styles.sendButtonDisabled]}
            onPress={send}
            disabled={busy || !input.trim()}
          >
            {busy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sendButtonText}>↑</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <SettingsModal
        visible={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={(s) => {
          setSettings(s);
          saveSettings(s).catch(() => {});
          setSettingsOpen(false);
        }}
      />
    </View>
  );
}

function SettingsModal(props: {
  visible: boolean;
  settings: Settings;
  onClose: () => void;
  onSave: (s: Settings) => void;
}) {
  const [baseUrl, setBaseUrl] = useState(props.settings.baseUrl);
  const [token, setToken] = useState(props.settings.token);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setBaseUrl(props.settings.baseUrl);
    setToken(props.settings.token);
    setTestResult(null);
  }, [props.settings, props.visible]);

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(`✓ ${await testConnection({ baseUrl: baseUrl.trim(), token: token.trim() })}`);
    } catch (err) {
      setTestResult(`✗ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Modal visible={props.visible} animationType="slide" transparent>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Gateway connection</Text>

          <Text style={styles.fieldLabel}>Gateway URL</Text>
          <TextInput
            style={styles.fieldInput}
            value={baseUrl}
            onChangeText={setBaseUrl}
            placeholder="https://smithpc.your-tailnet.ts.net"
            placeholderTextColor={COLORS.textDim}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.fieldLabel}>Token</Text>
          <TextInput
            style={styles.fieldInput}
            value={token}
            onChangeText={setToken}
            placeholder="gateway auth token"
            placeholderTextColor={COLORS.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />

          {testResult ? (
            <Text
              style={[
                styles.testResult,
                testResult.startsWith('✗') ? styles.testResultBad : styles.testResultGood,
              ]}
            >
              {testResult}
            </Text>
          ) : null}

          <View style={styles.modalActions}>
            <Pressable style={styles.modalButtonSecondary} onPress={runTest} disabled={testing}>
              {testing ? (
                <ActivityIndicator color={COLORS.text} size="small" />
              ) : (
                <Text style={styles.modalButtonSecondaryText}>Test</Text>
              )}
            </Pressable>
            <Pressable style={styles.modalButtonSecondary} onPress={props.onClose}>
              <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={styles.modalButtonPrimary}
              onPress={() => props.onSave({ baseUrl: baseUrl.trim(), token: token.trim() })}
            >
              <Text style={styles.modalButtonPrimaryText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: { color: COLORS.text, fontSize: 24, fontWeight: '700' },
  headerActions: { flexDirection: 'row', gap: 20, alignItems: 'center' },
  headerAction: { color: COLORS.textDim, fontSize: 17 },
  body: { flex: 1 },
  listContent: { padding: 16, gap: 8, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyTitle: { fontSize: 44 },
  emptyText: { color: COLORS.textDim, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  bubble: { maxWidth: '85%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: COLORS.accent },
  bubbleAssistant: { alignSelf: 'flex-start', backgroundColor: COLORS.surface },
  bubbleText: { color: COLORS.text, fontSize: 15.5, lineHeight: 22 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    gap: 8,
    backgroundColor: COLORS.bg,
  },
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
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.4 },
  sendButtonText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { backgroundColor: COLORS.surfaceAlt, borderRadius: 18, padding: 20, gap: 8 },
  modalTitle: { color: COLORS.text, fontSize: 19, fontWeight: '700', marginBottom: 6 },
  fieldLabel: { color: COLORS.textDim, fontSize: 13, marginTop: 6 },
  fieldInput: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 15,
  },
  testResult: { fontSize: 13.5, marginTop: 8 },
  testResultGood: { color: '#5dd97c' },
  testResultBad: { color: COLORS.danger },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 },
  modalButtonPrimary: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  modalButtonPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modalButtonSecondary: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 64,
    alignItems: 'center',
  },
  modalButtonSecondaryText: { color: COLORS.textDim, fontSize: 15 },
});
