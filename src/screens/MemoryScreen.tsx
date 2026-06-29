import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  addMemory,
  deleteMemory,
  listMemories,
  Memory,
  MemorySearchResult,
  searchMemories,
} from '../api';
import { Settings } from '../settings';
import { COLORS } from '../theme';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

export function MemoryScreen({ settings }: { settings: Settings }) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<MemorySearchResult[] | null>(null);

  const refresh = useCallback(async () => {
    if (!settings.baseUrl || !settings.token) return;
    setLoading(true);
    try {
      setMemories(await listMemories(settings));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [settings]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = async () => {
    if (!text.trim()) {
      setError('Type something for the butler to remember.');
      return;
    }
    setAdding(true);
    setError('');
    try {
      await addMemory(settings, text.trim());
      setText('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string) => {
    setRemoving(id);
    try {
      await deleteMemory(settings, id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemoving(null);
    }
  };

  const runSearch = async () => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    setSearching(true);
    setError('');
    try {
      setResults(await searchMemories(settings, q));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  };

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={COLORS.text} />}
    >
      <View style={styles.card}>
        <Text style={styles.section}>Teach the butler</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={text}
          onChangeText={setText}
          placeholder="Something to remember… (e.g. I work nights, my dog is Rex)"
          placeholderTextColor={COLORS.textDim}
          multiline
        />
        <Pressable style={[styles.addBtn, adding && styles.btnBusy]} disabled={adding} onPress={add}>
          {adding ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.addBtnText}>Remember this</Text>
          )}
        </Pressable>
        {!!error && <Text style={styles.error}>{error}</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Ask what it knows</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={[styles.input, styles.flex]}
            value={query}
            onChangeText={setQuery}
            placeholder="Search memory…"
            placeholderTextColor={COLORS.textDim}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={runSearch}
          />
          <Pressable style={styles.searchBtn} disabled={searching} onPress={runSearch}>
            {searching ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.searchBtnText}>Search</Text>}
          </Pressable>
        </View>
        {results !== null && (
          <View style={styles.results}>
            {results.length === 0 ? (
              <Text style={styles.empty}>Nothing on that yet.</Text>
            ) : (
              results.map((r, i) => (
                <View key={i} style={styles.resultRow}>
                  <Text style={styles.resultText}>{r.snippet}</Text>
                </View>
              ))
            )}
          </View>
        )}
      </View>

      <Text style={styles.section}>
        Remembered {memories.length > 0 ? `(${memories.length})` : ''}
      </Text>
      {memories.length === 0 && !loading ? (
        <Text style={styles.empty}>
          Nothing yet. Tell the butler things to remember here, or just say them in Chat — it
          recalls them automatically in future conversations.
        </Text>
      ) : (
        memories.map((m) => (
          <View key={m.id} style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.rowText}>{m.text}</Text>
              <Text style={styles.rowMeta}>
                {m.source === 'butler' ? '🤖 noticed' : '✍️ you'} · {formatDate(m.created)}
                {m.tags?.length ? ` · ${m.tags.join(', ')}` : ''}
              </Text>
            </View>
            <Pressable style={styles.cancelBtn} disabled={removing === m.id} onPress={() => remove(m.id)}>
              {removing === m.id ? (
                <ActivityIndicator color={COLORS.danger} size="small" />
              ) : (
                <Text style={styles.cancelText}>✕</Text>
              )}
            </Pressable>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 14, gap: 6, paddingBottom: 30 },
  card: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, gap: 10 },
  section: {
    color: COLORS.textDim,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 12,
    marginBottom: 2,
  },
  input: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: COLORS.text,
    fontSize: 15,
  },
  multiline: { minHeight: 64, textAlignVertical: 'top' },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  searchBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  searchBtnText: { color: '#fff', fontSize: 14.5, fontWeight: '700' },
  results: { gap: 7 },
  resultRow: { backgroundColor: COLORS.surfaceAlt, borderRadius: 10, padding: 11 },
  resultText: { color: COLORS.text, fontSize: 14, lineHeight: 20 },
  addBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 11,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 2,
  },
  btnBusy: { opacity: 0.7 },
  addBtnText: { color: '#fff', fontSize: 15.5, fontWeight: '700' },
  error: { color: COLORS.danger, fontSize: 13.5 },
  empty: { color: COLORS.textDim, fontSize: 14, lineHeight: 20, paddingHorizontal: 4, paddingTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  rowMain: { flex: 1, gap: 3 },
  rowText: { color: COLORS.text, fontSize: 15.5, fontWeight: '600', lineHeight: 21 },
  rowMeta: { color: COLORS.textDim, fontSize: 12.5 },
  cancelBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,107,107,0.12)',
  },
  cancelText: { color: COLORS.danger, fontSize: 16, fontWeight: '800' },
});
