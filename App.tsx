import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Approval, checkHealth, streamApprovals, listApprovals, testConnection } from './src/api';
import { ChatScreen } from './src/screens/ChatScreen';
import { BuildScreen } from './src/screens/BuildScreen';
import { JobsScreen } from './src/screens/JobsScreen';
import { PcScreen } from './src/screens/PcScreen';
import { ApprovalsScreen } from './src/screens/ApprovalsScreen';
import { HelpScreen } from './src/screens/HelpScreen';
import { loadSettings, saveSettings, Settings } from './src/settings';
import { COLORS } from './src/theme';

type Tab = 'chat' | 'build' | 'jobs' | 'pc' | 'approvals' | 'help';
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'chat', label: 'Chat', icon: '💬' },
  { key: 'build', label: 'Build', icon: '🔨' },
  { key: 'jobs', label: 'Jobs', icon: '📋' },
  { key: 'pc', label: 'PC', icon: '🖥️' },
  { key: 'approvals', label: 'Approvals', icon: '🛡️' },
  { key: 'help', label: 'Help', icon: '❓' },
];

// Tracks the count of pending approvals app-wide so the Approvals tab can show a
// badge from any screen. Live over SSE, with a 10s polling fallback.
function usePendingApprovals(settings: Settings): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!settings.baseUrl || !settings.token) {
      setCount(0);
      return;
    }
    const ids = new Set<string>();
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const sync = () => !cancelled && setCount(ids.size);

    const poll = async () => {
      try {
        const list = await listApprovals(settings);
        if (cancelled) return;
        ids.clear();
        list.forEach((a) => ids.add(a.id));
        sync();
      } catch {}
    };
    const startPolling = () => {
      if (pollTimer || cancelled) return;
      poll();
      pollTimer = setInterval(poll, 10000);
    };

    const stop = streamApprovals(settings, {
      onSnapshot: (list) => {
        ids.clear();
        list.forEach((a) => ids.add(a.id));
        sync();
      },
      onPending: (a: Approval) => {
        ids.add(a.id);
        sync();
      },
      onResolved: (a: Approval) => {
        ids.delete(a.id);
        sync();
      },
      onError: () => startPolling(),
    });

    return () => {
      cancelled = true;
      stop();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [settings]);

  return count;
}

type Health = 'idle' | 'checking' | 'online' | 'offline';
const HEALTH_COLOR: Record<Health, string> = {
  idle: COLORS.textDim,
  checking: COLORS.warn,
  online: COLORS.good,
  offline: COLORS.danger,
};

// Polls the gateway so the header dot shows at a glance whether the PC is awake
// and reachable. Re-checks on settings change and whenever the app refocuses.
function useHealth(settings: Settings) {
  const [health, setHealth] = useState<Health>('idle');

  const check = useCallback(async () => {
    if (!settings.baseUrl || !settings.token) {
      setHealth('idle');
      return;
    }
    setHealth((h) => (h === 'online' || h === 'offline' ? h : 'checking'));
    const ok = await checkHealth(settings);
    setHealth(ok ? 'online' : 'offline');
  }, [settings]);

  useEffect(() => {
    let active = true;
    const run = () => {
      if (active) check();
    };
    run();
    const id = setInterval(run, 25000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') run();
    });
    return () => {
      active = false;
      clearInterval(id);
      sub.remove();
    };
  }, [check]);

  return { health, refresh: check };
}

export default function App() {
  const [settings, setSettings] = useState<Settings>({ baseUrl: '', token: '' });
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('chat');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { health, refresh: refreshHealth } = useHealth(settings);
  const pendingApprovals = usePendingApprovals(settings);

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      setLoaded(true);
      if (!s.baseUrl) {
        setTab('help');
        setSettingsOpen(true);
      }
    });
  }, []);

  if (!loaded) {
    return (
      <View style={[styles.root, styles.center]}>
        <StatusBar style="light" />
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>{TABS.find((t) => t.key === tab)?.label}</Text>
          <Pressable onPress={refreshHealth} hitSlop={12}>
            <View style={[styles.dot, { backgroundColor: HEALTH_COLOR[health] }]} />
          </Pressable>
        </View>
        <Pressable onPress={() => setSettingsOpen(true)} hitSlop={10}>
          <Text style={styles.gear}>⚙</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        {tab === 'chat' && <ChatScreen settings={settings} />}
        {tab === 'build' && <BuildScreen settings={settings} />}
        {tab === 'jobs' && <JobsScreen settings={settings} />}
        {tab === 'pc' && <PcScreen settings={settings} onNavigateToApprovals={() => setTab('approvals')} />}
        {tab === 'approvals' && <ApprovalsScreen settings={settings} />}
        {tab === 'help' && <HelpScreen onOpenSettings={() => setSettingsOpen(true)} />}
      </View>

      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <Pressable key={t.key} style={styles.tab} onPress={() => setTab(t.key)}>
            <View>
              <Text style={[styles.tabIcon, tab === t.key && styles.tabIconActive]}>{t.icon}</Text>
              {t.key === 'approvals' && pendingApprovals > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{pendingApprovals > 9 ? '9+' : pendingApprovals}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

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
    <Modal visible={props.visible} animationType="slide" transparent onRequestClose={props.onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Gateway connection</Text>
          <Text style={styles.fieldLabel}>Gateway URL</Text>
          <TextInput
            style={styles.fieldInput}
            value={baseUrl}
            onChangeText={setBaseUrl}
            placeholder="https://your-pc.your-tailnet.ts.net"
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
          {testResult && (
            <Text style={[styles.testResult, testResult.startsWith('✗') ? styles.bad : styles.good]}>
              {testResult}
            </Text>
          )}
          <View style={styles.modalActions}>
            <Pressable style={styles.btnSecondary} onPress={runTest} disabled={testing}>
              {testing ? <ActivityIndicator color={COLORS.text} size="small" /> : <Text style={styles.btnSecondaryText}>Test</Text>}
            </Pressable>
            <Pressable style={styles.btnSecondary} onPress={props.onClose}>
              <Text style={styles.btnSecondaryText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.btnPrimary} onPress={() => props.onSave({ baseUrl: baseUrl.trim(), token: token.trim() })}>
              <Text style={styles.btnPrimaryText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 54,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { color: COLORS.text, fontSize: 22, fontWeight: '800' },
  dot: { width: 9, height: 9, borderRadius: 5 },
  gear: { color: COLORS.textDim, fontSize: 22 },
  body: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    paddingTop: 8,
    paddingBottom: 26,
    borderTopWidth: 1,
    borderTopColor: '#000',
  },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  tabIcon: { fontSize: 20, opacity: 0.5 },
  tabIconActive: { opacity: 1 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  tabLabel: { color: COLORS.textDim, fontSize: 11 },
  tabLabelActive: { color: COLORS.accent, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: COLORS.surfaceAlt, borderRadius: 18, padding: 20, gap: 8 },
  modalTitle: { color: COLORS.text, fontSize: 19, fontWeight: '700', marginBottom: 6 },
  fieldLabel: { color: COLORS.textDim, fontSize: 13, marginTop: 6 },
  fieldInput: { backgroundColor: COLORS.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: COLORS.text, fontSize: 15 },
  testResult: { fontSize: 13.5, marginTop: 8 },
  good: { color: COLORS.good },
  bad: { color: COLORS.danger },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 },
  btnPrimary: { backgroundColor: COLORS.accent, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnSecondary: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, minWidth: 64, alignItems: 'center' },
  btnSecondaryText: { color: COLORS.textDim, fontSize: 15 },
});
