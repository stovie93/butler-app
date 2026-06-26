import React, { useState } from 'react';
import {
  ActivityIndicator,
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
// Power buttons are `gated`: shutdown/restart need your approval (a card you
// approve in the Approvals tab). Abort is immediate.
type PowerBtn = Btn & { gated?: boolean };

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

// Power actions. Shutdown/restart are gated: they create an approval you confirm
// in the Approvals tab (once the PC is off, the app can't turn it back on). Abort
// cancels the 20s grace window immediately.
const POWER: PowerBtn[] = [
  { label: '⏻ Shut down', action: 'shutdown', gated: true },
  { label: '🔁 Restart', action: 'restart', gated: true },
  { label: '✖ Abort', action: 'abort' },
];

// Power requests block until you approve, so they need a long timeout.
const POWER_TIMEOUT_MS = 130000;

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

export function PcScreen({
  settings,
  onNavigateToApprovals,
}: {
  settings: Settings;
  onNavigateToApprovals?: () => void;
}) {
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

  // Gated power actions (shutdown/restart) create an approval on the gateway and
  // hold until you approve — so we fire the request and send you to the Approvals
  // tab to confirm it. Abort runs immediately.
  const runPower = (btn: PowerBtn) => {
    if (!btn.gated) {
      run(btn);
      return;
    }
    pcAction(settings, btn.action, undefined, POWER_TIMEOUT_MS).catch(() => {});
    setIsError(false);
    setResult(`Requested ${btn.action} — approve it in the Approvals tab to continue.`);
    onNavigateToApprovals?.();
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
          const danger = !!b.gated;
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
