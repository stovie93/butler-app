import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getJobLog, Job, listJobs } from '../api';
import { Settings } from '../settings';
import { COLORS, relativeTime, statusColor } from '../theme';

export function JobsScreen({ settings }: { settings: Settings }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Job | null>(null);
  const [log, setLog] = useState<string>('');
  const [logLoading, setLogLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!settings.baseUrl) return;
    setLoading(true);
    try {
      setJobs(await listJobs(settings));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [settings]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  const openJob = useCallback(
    async (job: Job) => {
      setSelected(job);
      setLog('');
      setLogLoading(true);
      try {
        setLog(await getJobLog(settings, job.id));
      } catch (err) {
        setLog(`⚠ ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLogLoading(false);
      }
    },
    [settings],
  );

  return (
    <View style={styles.flex}>
      {error && <Text style={styles.error}>⚠ {error}</Text>}
      <FlatList
        data={jobs}
        keyExtractor={(j) => j.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={COLORS.textDim} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>📋</Text>
              <Text style={styles.emptyText}>No builds yet. Start one from the Build tab.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => openJob(item)}>
            <View style={[styles.dot, { backgroundColor: statusColor(item.status) }]} />
            <View style={styles.rowBody}>
              <View style={styles.rowTop}>
                <Text style={styles.project}>{item.project}</Text>
                <Text style={styles.time}>{relativeTime(item.finished ?? item.started)}</Text>
              </View>
              <Text style={styles.task} numberOfLines={2}>
                {item.task}
              </Text>
              <Text style={[styles.status, { color: statusColor(item.status) }]}>{item.status}</Text>
            </View>
          </Pressable>
        )}
      />

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {selected?.project}
              </Text>
              <Pressable onPress={() => setSelected(null)} hitSlop={10}>
                <Text style={styles.close}>✕</Text>
              </Pressable>
            </View>
            <Text style={[styles.status, { color: statusColor(selected?.status ?? '') }]}>
              {selected?.status}
            </Text>
            <Text style={styles.task}>{selected?.task}</Text>
            <Text style={styles.logLabel}>Log</Text>
            <ScrollView style={styles.logBox}>
              {logLoading ? (
                <ActivityIndicator color={COLORS.textDim} />
              ) : (
                <Text style={styles.logText}>{log || '(empty)'}</Text>
              )}
            </ScrollView>
            <Pressable style={styles.refreshBtn} onPress={() => selected && openJob(selected)}>
              <Text style={styles.refreshText}>Refresh log</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  error: { color: COLORS.danger, fontSize: 13, padding: 12 },
  list: { padding: 12, gap: 8, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 80 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { color: COLORS.textDim, fontSize: 15, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 12, backgroundColor: COLORS.surface, borderRadius: 12, padding: 14 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  rowBody: { flex: 1, gap: 3 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between' },
  project: { color: COLORS.text, fontSize: 15.5, fontWeight: '700' },
  time: { color: COLORS.textDim, fontSize: 12 },
  task: { color: COLORS.textDim, fontSize: 13.5, lineHeight: 19 },
  status: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.surfaceAlt, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 8, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { color: COLORS.text, fontSize: 19, fontWeight: '700', flex: 1 },
  close: { color: COLORS.textDim, fontSize: 20, paddingHorizontal: 6 },
  logLabel: { color: COLORS.textDim, fontSize: 13, marginTop: 6 },
  logBox: { backgroundColor: COLORS.bg, borderRadius: 10, padding: 12, maxHeight: 320 },
  logText: { color: COLORS.text, fontSize: 12, fontFamily: 'monospace', lineHeight: 17 },
  refreshBtn: { backgroundColor: COLORS.surface, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 4 },
  refreshText: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
});
