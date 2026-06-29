import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChatModel, getChatModels } from '../api';
import { Settings } from '../settings';
import { COLORS } from '../theme';

/**
 * Pick the chat model per task. Selecting one sends the `x-openclaw-model`
 * header on every chat request (no gateway restart). "Default" clears the
 * override and uses the gateway's configured model.
 */
export function ModelPickerScreen({
  settings,
  onSelect,
}: {
  settings: Settings;
  onSelect: (model: string) => void;
}) {
  const [models, setModels] = useState<ChatModel[]>([]);
  const [def, setDef] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selected = settings.model ?? '';

  const load = useCallback(async () => {
    if (!settings.baseUrl || !settings.token) return;
    setLoading(true);
    try {
      const r = await getChatModels(settings);
      setModels(r.models);
      setDef(r.default);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [settings]);

  useEffect(() => {
    load();
  }, [load]);

  const Row = ({ id, label, tag, isSelected }: { id: string; label: string; tag?: string; isSelected: boolean }) => (
    <Pressable style={[styles.row, isSelected && styles.rowActive]} onPress={() => onSelect(id)}>
      <View style={styles.rowMain}>
        <Text style={styles.rowLabel}>{label}</Text>
        {!!tag && <Text style={styles.rowTag}>{tag}</Text>}
      </View>
      {isSelected && <Text style={styles.check}>✓</Text>}
    </Pressable>
  );

  if (loading && models.length === 0) {
    return (
      <View style={[styles.flex, styles.center]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        Pick the model for chat. Switch any time — heavier models give more personality, lighter
        ones are faster. Takes effect on your next message.
      </Text>

      <Row id="" label={`Default${def ? ` · ${def}` : ''}`} tag="recommended" isSelected={selected === ''} />

      {models.some((m) => !m.cloud) && <Text style={styles.section}>On your PC</Text>}
      {models.filter((m) => !m.cloud).map((m) => (
        <Row key={m.id} id={m.id} label={m.label} isSelected={selected === m.id} />
      ))}

      {models.some((m) => m.cloud) && <Text style={styles.section}>Cloud (external)</Text>}
      {models.filter((m) => m.cloud).map((m) => (
        <Row key={m.id} id={m.id} label={m.label} tag="cloud" isSelected={selected === m.id} />
      ))}

      {!!error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 14, gap: 8, paddingBottom: 40 },
  intro: { color: COLORS.textDim, fontSize: 14, lineHeight: 20, marginBottom: 4, paddingHorizontal: 2 },
  section: {
    color: COLORS.textDim,
    fontSize: 12.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 12,
    marginBottom: 2,
    paddingHorizontal: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 11,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rowActive: { borderColor: COLORS.accent },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowLabel: { color: COLORS.text, fontSize: 15.5, fontWeight: '600' },
  rowTag: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    backgroundColor: COLORS.surfaceAlt,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  check: { color: COLORS.accent, fontSize: 17, fontWeight: '800' },
  error: { color: COLORS.danger, fontSize: 13.5, marginTop: 10 },
});
