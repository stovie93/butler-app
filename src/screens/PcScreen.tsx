import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { pcAction } from '../api';
import { Settings } from '../settings';
import { COLORS } from '../theme';

type Btn = { label: string; action: string; arg?: string };
// A power button optionally asks for confirmation before firing (shutdown/restart).
type PowerBtn = Btn & { confirm?: { title: string; body: string; verb: string } };

// Read-only checks — tapping shows the result in the output panel.
const INFO: Btn[] = [
  { label: '📊 Status', action: 'status' },
  { label: '💾 Disk', action: 'disk' },
  { label: '🔋 Battery', action: 'battery' },
  { label: '📈 Top apps', action: 'processes' },
];

// Benign, reversible controls.
const CONTROL: Btn[] = [
  { label: '🔒 Lock', action: 'lock' },
  { label: '🔉 Vol −', action: 'volume', arg: 'down' },
  { label: '🔇 Mute', action: 'volume', arg: 'mute' },
  { label: '🔊 Vol +', action: 'volume', arg: 'up' },
];

// Power actions. Shutdown/restart confirm first — once the PC is off the app
// can't turn it back on. Abort cancels the 20s grace window.
const POWER: PowerBtn[] = [
  {
    label: '⏻ Shut down',
    action: 'shutdown',
    confirm: {
      title: 'Shut down PC?',
      body: 'Powers off your computer in 20s. You cannot turn it back on remotely.',
      verb: 'Shut down',
    },
  },
  {
    label: '🔁 Restart',
    action: 'restart',
    confirm: {
      title: 'Restart PC?',
      body: 'Reboots your computer in 20s. It may be briefly unreachable.',
      verb: 'Restart',
    },
  },
  { label: '✖ Abort', action: 'abort' },
];

// Allow-listed apps to launch (must match the gateway's OPEN_TARGETS keys).
const OPEN: Btn[] = [
  { label: 'Spotify', action: 'open', arg: 'spotify' },
  { label: 'Browser', action: 'open', arg: 'browser' },
  { label: 'Explorer', action: 'open', arg: 'explorer' },
  { label: 'VS Code', action: 'open', arg: 'code' },
  { label: 'Calc', action: 'open', arg: 'calc' },
  { label: 'Settings', action: 'open', arg: 'settings' },
  { label: 'Terminal', action: 'open', arg: 'terminal' },
];

export function PcScreen({ settings }: { settings: Settings }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string>('');
  const [isError, setIsError] = useState(false);

  const run = async (btn: Btn) => {
    const key = btn.action + (btn.arg ? ':' + btn.arg : '');
    setBusy(key);
    setIsError(false);
    try {
      const text = await pcAction(settings, btn.action, btn.arg);
      setResult(text);
    } catch (err) {
      setIsError(true);
      setResult(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  // Power buttons confirm before firing; abort runs immediately.
  const runPower = (btn: PowerBtn) => {
    if (!btn.confirm) {
      run(btn);
      return;
    }
    Alert.alert(btn.confirm.title, btn.confirm.body, [
      { text: 'Cancel', style: 'cancel' },
      { text: btn.confirm.verb, style: 'destructive', onPress: () => run(btn) },
    ]);
  };

  const renderRow = (btns: Btn[]) => (
    <View style={styles.grid}>
      {btns.map((b) => {
        const key = b.action + (b.arg ? ':' + b.arg : '');
        return (
          <Pressable
            key={key}
            style={[styles.btn, busy === key && styles.btnBusy]}
            disabled={!!busy}
            onPress={() => run(b)}
          >
            {busy === key ? (
              <ActivityIndicator color={COLORS.text} size="small" />
            ) : (
              <Text style={styles.btnText}>{b.label}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <View style={[styles.output, isError && styles.outputError]}>
        <Text style={styles.outputText}>
          {result || 'Tap an action to control your PC. Results show here.'}
        </Text>
      </View>

      <Text style={styles.section}>Info</Text>
      {renderRow(INFO)}

      <Text style={styles.section}>Controls</Text>
      {renderRow(CONTROL)}

      <Text style={styles.section}>Open app</Text>
      {renderRow(OPEN)}

      <Text style={styles.section}>Power</Text>
      <View style={styles.grid}>
        {POWER.map((b) => {
          const key = b.action;
          const danger = !!b.confirm;
          return (
            <Pressable
              key={key}
              style={[styles.btn, danger && styles.btnDanger, busy === key && styles.btnBusy]}
              disabled={!!busy}
              onPress={() => runPower(b)}
            >
              {busy === key ? (
                <ActivityIndicator color={COLORS.text} size="small" />
              ) : (
                <Text style={[styles.btnText, danger && styles.btnDangerText]}>{b.label}</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 14, gap: 6, paddingBottom: 30 },
  output: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    minHeight: 84,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
  },
  outputError: { borderLeftColor: COLORS.danger },
  outputText: { color: COLORS.text, fontSize: 14, fontFamily: 'monospace', lineHeight: 20 },
  section: {
    color: COLORS.textDim,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 12,
    marginBottom: 2,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 11,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minWidth: 84,
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnBusy: { opacity: 0.7 },
  btnText: { color: COLORS.text, fontSize: 14.5, fontWeight: '600' },
  btnDanger: { backgroundColor: 'rgba(255,107,107,0.12)', borderWidth: 1, borderColor: COLORS.danger },
  btnDangerText: { color: COLORS.danger },
});
