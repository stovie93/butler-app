import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AwakeStatus, dispatchBuild, getStatus, setAwake } from '../api';
import { Settings } from '../settings';
import { COLORS } from '../theme';

function StatusLine({ status }: { status: AwakeStatus | null }) {
  if (!status) return <Text style={styles.statusDim}>Checking computer…</Text>;
  const holding = status.blockingSleep;
  const until = status.holdUntil ? new Date(status.holdUntil) : null;
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.statusRow}>
        <View style={[styles.dot, { backgroundColor: holding ? COLORS.good : COLORS.textDim }]} />
        <Text style={styles.statusText}>
          {holding ? 'Awake — staying up' : 'Idle — normal sleep (2h)'}
        </Text>
      </View>
      {status.runningJobs > 0 && (
        <Text style={styles.statusDim}>
          {status.runningJobs} build{status.runningJobs === 1 ? '' : 's'} running
        </Text>
      )}
      {until && holding && (
        <Text style={styles.statusDim}>Holding until {until.toLocaleTimeString()}</Text>
      )}
    </View>
  );
}

export function BuildScreen({ settings }: { settings: Settings }) {
  const [status, setStatus] = useState<AwakeStatus | null>(null);
  const [project, setProject] = useState('');
  const [task, setTask] = useState('');
  const [cont, setCont] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!settings.baseUrl) return;
    getStatus(settings).then(setStatus).catch(() => {});
  }, [settings]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 20000);
    return () => clearInterval(t);
  }, [refresh]);

  const hold = useCallback(
    async (duration: string) => {
      try {
        const r = await setAwake(settings, duration);
        if (r.status) setStatus(r.status);
        else refresh();
      } catch (err) {
        setResult(`⚠ ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [settings, refresh],
  );

  const dispatch = useCallback(async () => {
    if (!project.trim() || !task.trim() || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const text = await dispatchBuild(settings, project.trim(), task.trim(), cont);
      setResult(text);
      setTask('');
      setCont(false);
      setTimeout(refresh, 1500);
    } catch (err) {
      setResult(`⚠ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [project, task, cont, busy, settings, refresh]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Computer</Text>
        <StatusLine status={status} />
        <Text style={styles.label}>Keep awake</Text>
        <View style={styles.chipRow}>
          {(['1h', '2h', '4h'] as const).map((d) => (
            <Pressable key={d} style={styles.chip} onPress={() => hold(d)}>
              <Text style={styles.chipText}>{d}</Text>
            </Pressable>
          ))}
          <Pressable style={[styles.chip, styles.chipOff]} onPress={() => hold('off')}>
            <Text style={styles.chipText}>Off</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>New build</Text>
        <Text style={styles.label}>Project</Text>
        <TextInput
          style={styles.input}
          value={project}
          onChangeText={setProject}
          placeholder="e.g. snake-game"
          placeholderTextColor={COLORS.textDim}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.label}>What should Claude build?</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={task}
          onChangeText={setTask}
          placeholder="Describe it in plain English — be as detailed as you like."
          placeholderTextColor={COLORS.textDim}
          multiline
        />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Continue this project's last session</Text>
          <Switch
            value={cont}
            onValueChange={setCont}
            trackColor={{ true: COLORS.accent, false: COLORS.surface }}
            thumbColor="#fff"
          />
        </View>
        <Pressable
          style={[styles.button, (busy || !project.trim() || !task.trim()) && styles.buttonOff]}
          onPress={dispatch}
          disabled={busy || !project.trim() || !task.trim()}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Dispatch to Claude Code</Text>
          )}
        </Pressable>
        {result && <Text style={styles.result}>{result}</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 16 },
  card: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, gap: 10 },
  cardTitle: { color: COLORS.text, fontSize: 17, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: COLORS.text, fontSize: 15 },
  statusDim: { color: COLORS.textDim, fontSize: 13 },
  label: { color: COLORS.textDim, fontSize: 13, marginTop: 4 },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { backgroundColor: COLORS.surfaceAlt, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 9 },
  chipOff: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.surfaceAlt },
  chipText: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  input: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 15,
  },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  switchLabel: { color: COLORS.text, fontSize: 14, flex: 1, paddingRight: 12 },
  button: { backgroundColor: COLORS.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 6 },
  buttonOff: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 15.5, fontWeight: '700' },
  result: { color: COLORS.good, fontSize: 13.5, marginTop: 4, lineHeight: 20 },
});
