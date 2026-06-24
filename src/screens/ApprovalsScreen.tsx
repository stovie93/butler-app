import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Approval, decideApproval, listApprovals, streamApprovals } from '../api';
import { Settings } from '../settings';
import { COLORS, relativeTime } from '../theme';

function severityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return COLORS.danger;
    case 'warning':
      return COLORS.warn;
    default:
      return COLORS.accent;
  }
}

export function ApprovalsScreen({ settings }: { settings: Settings }) {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const upsert = useCallback((a: Approval) => {
    setApprovals((prev) => [a, ...prev.filter((p) => p.id !== a.id)]);
  }, []);
  const remove = useCallback((id: string) => {
    setApprovals((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Live stream of pending approvals, with a 4s polling fallback if it drops.
  useEffect(() => {
    if (!settings.baseUrl) return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const list = await listApprovals(settings);
        if (!cancelled) {
          setApprovals(list);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    };

    const startPolling = () => {
      if (pollTimer || cancelled) return;
      poll();
      pollTimer = setInterval(poll, 4000);
    };

    setLoading(true);
    poll().finally(() => !cancelled && setLoading(false));

    const stop = streamApprovals(settings, {
      onSnapshot: (list) => {
        if (!cancelled) {
          setApprovals(list);
          setError(null);
        }
      },
      onPending: (a) => !cancelled && upsert(a),
      onResolved: (a) => !cancelled && remove(a.id),
      onError: () => startPolling(),
    });

    return () => {
      cancelled = true;
      stop();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [settings, upsert, remove]);

  const decide = useCallback(
    async (id: string, decision: 'allow-once' | 'deny') => {
      setBusy((b) => ({ ...b, [id]: true }));
      try {
        await decideApproval(settings, id, decision);
        remove(id); // resolved event will also remove; this is the optimistic path
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy((b) => {
          const next = { ...b };
          delete next[id];
          return next;
        });
      }
    },
    [settings, remove],
  );

  return (
    <View style={styles.flex}>
      {error && <Text style={styles.error}>⚠ {error}</Text>}
      <FlatList
        data={approvals}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🛡️</Text>
              <Text style={styles.emptyText}>No pending approvals. The butler will ask here when it needs your OK.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const color = severityColor(item.severity);
          const working = !!busy[item.id];
          return (
            <View style={[styles.card, { borderLeftColor: color }]}>
              <View style={styles.cardTop}>
                <Text style={[styles.severity, { color }]}>{item.severity}</Text>
                <Text style={styles.time}>{relativeTime(item.createdAt)}</Text>
              </View>
              <Text style={styles.title}>{item.title}</Text>
              {!!item.description && <Text style={styles.desc}>{item.description}</Text>}
              {!!item.argsBrief && <Text style={styles.args} numberOfLines={3}>{item.argsBrief}</Text>}
              <View style={styles.actions}>
                <Pressable
                  style={[styles.btn, styles.deny]}
                  disabled={working}
                  onPress={() => decide(item.id, 'deny')}
                >
                  {working ? <ActivityIndicator color={COLORS.text} size="small" /> : <Text style={styles.denyText}>Deny</Text>}
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.approve]}
                  disabled={working}
                  onPress={() => decide(item.id, 'allow-once')}
                >
                  <Text style={styles.approveText}>Approve</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  error: { color: COLORS.danger, fontSize: 13, padding: 12 },
  list: { padding: 12, gap: 10, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 80, paddingHorizontal: 24 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { color: COLORS.textDim, fontSize: 15, textAlign: 'center', lineHeight: 21 },
  card: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, gap: 6, borderLeftWidth: 4 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  severity: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  time: { color: COLORS.textDim, fontSize: 12 },
  title: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  desc: { color: COLORS.textDim, fontSize: 13.5, lineHeight: 19 },
  args: { color: COLORS.text, fontSize: 12.5, fontFamily: 'monospace', backgroundColor: COLORS.bg, borderRadius: 8, padding: 10, marginTop: 2 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6 },
  btn: { borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, alignItems: 'center', minWidth: 96 },
  approve: { backgroundColor: COLORS.good },
  approveText: { color: '#06210f', fontWeight: '800', fontSize: 14.5 },
  deny: { backgroundColor: COLORS.surfaceAlt },
  denyText: { color: COLORS.danger, fontWeight: '700', fontSize: 14.5 },
});
