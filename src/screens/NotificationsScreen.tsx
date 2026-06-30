import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getNotifications, Notification } from '../api';
import { Settings } from '../settings';
import { COLORS } from '../theme';

const ICON: Record<string, string> = {
  approval: '🛡️',
  reminder: '⏰',
  build: '🔨',
  info: '🔔',
};

function when(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function NotificationsScreen({ settings }: { settings: Settings }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!settings.baseUrl || !settings.token) return;
    setLoading(true);
    try {
      setItems(await getNotifications(settings));
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

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={COLORS.text} />}
    >
      {items.length === 0 && !loading ? (
        <Text style={styles.empty}>No notifications yet. Approvals, reminders, and finished builds show up here.</Text>
      ) : (
        items.map((n, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.icon}>{ICON[n.type] ?? '🔔'}</Text>
            <View style={styles.main}>
              <Text style={styles.title}>{n.title}</Text>
              {!!n.body && <Text style={styles.body}>{n.body}</Text>}
              <Text style={styles.time}>{when(n.ts)}</Text>
            </View>
          </View>
        ))
      )}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 14, gap: 8, paddingBottom: 30 },
  empty: { color: COLORS.textDim, fontSize: 14, lineHeight: 20, padding: 16, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 12, backgroundColor: COLORS.surface, borderRadius: 12, padding: 14 },
  icon: { fontSize: 20, marginTop: 1 },
  main: { flex: 1, gap: 2 },
  title: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  body: { color: COLORS.text, fontSize: 14, lineHeight: 19 },
  time: { color: COLORS.textDim, fontSize: 12, marginTop: 2 },
  error: { color: COLORS.danger, fontSize: 13.5, padding: 8 },
});
