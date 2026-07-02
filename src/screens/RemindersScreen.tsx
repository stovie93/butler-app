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
import { addReminder, cancelReminder, listReminders, Reminder } from '../api';
import { Settings } from '../settings';
import { COLORS } from '../theme';

// Quick-pick time phrases — tapping one fills the "when" field. The gateway
// parses plain language, so these are just shortcuts for the common cases.
const WHEN_PRESETS = ['in 30 minutes', 'in 1 hour', 'in 2 hours', 'at 6pm', 'tomorrow at 9am'];

function formatWhen(r: Reminder): string {
  const d = new Date(r.fireAt);
  const when = Number.isNaN(d.getTime()) ? r.when : d.toLocaleString();
  return r.relative ? `${r.relative} · ${when}` : when;
}

export function RemindersScreen({ settings }: { settings: Settings }) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [when, setWhen] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!settings.baseUrl || !settings.token) return;
    setLoading(true);
    try {
      setReminders(await listReminders(settings));
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
    if (!text.trim() || !when.trim()) {
      setError('Enter both what to remind you about and when.');
      return;
    }
    setAdding(true);
    setError('');
    try {
      await addReminder(settings, text.trim(), when.trim());
      setText('');
      setWhen('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string) => {
    setCancelling(id);
    try {
      await cancelReminder(settings, id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCancelling(null);
    }
  };

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={COLORS.text} />}
    >
      <View style={styles.card}>
        <Text style={styles.section}>New reminder</Text>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Remind me to…  (e.g. call mum)"
          placeholderTextColor={COLORS.textDim}
        />
        <TextInput
          style={styles.input}
          value={when}
          onChangeText={setWhen}
          placeholder="When?  e.g. in 2 hours, at 6pm, tomorrow at 9am"
          placeholderTextColor={COLORS.textDim}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.presets}>
          {WHEN_PRESETS.map((p) => (
            <Pressable key={p} style={styles.chip} onPress={() => setWhen(p)}>
              <Text style={styles.chipText}>{p}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={[styles.addBtn, adding && styles.btnBusy]} disabled={adding} onPress={add}>
          {adding ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.addBtnText}>Set reminder</Text>
          )}
        </Pressable>
        {!!error && <Text style={styles.error}>{error}</Text>}
      </View>

      <Text style={styles.section}>
        Pending {reminders.length > 0 ? `(${reminders.length})` : ''}
      </Text>
      {reminders.length === 0 && !loading ? (
        <Text style={styles.empty}>
          No pending reminders. When one is due it pushes to this phone (even with the app closed)
          and pops a notification on your PC.
        </Text>
      ) : (
        reminders.map((r) => (
          <View key={r.id} style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.rowText}>{r.text}</Text>
              <Text style={styles.rowWhen}>{formatWhen(r)}</Text>
            </View>
            <Pressable
              style={styles.cancelBtn}
              disabled={cancelling === r.id}
              onPress={() => remove(r.id)}
            >
              {cancelling === r.id ? (
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
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: { color: COLORS.accent, fontSize: 13, fontWeight: '600' },
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
  rowText: { color: COLORS.text, fontSize: 15.5, fontWeight: '600' },
  rowWhen: { color: COLORS.textDim, fontSize: 13 },
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
