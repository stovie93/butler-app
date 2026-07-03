import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AwakeStatus,
  BrainRecord,
  dispatchBuild,
  getJobLog,
  getStatus,
  Job,
  listBrain,
  listJobs,
  setAwake,
  streamJobLog,
} from '../api';
import { Settings } from '../settings';
import { COLORS, relativeTime, statusColor } from '../theme';

// One feed of everything Claude is doing on the PC: build jobs (code-dispatch)
// and brain questions (butler-brain), newest first.
type FeedItem =
  | { kind: 'build'; key: string; at: string; job: Job }
  | { kind: 'ask'; key: string; at: string; ask: BrainRecord };

function toFeed(jobs: Job[], asks: BrainRecord[]): FeedItem[] {
  const items: FeedItem[] = [
    ...jobs.map((job): FeedItem => ({
      kind: 'build',
      key: `b:${job.id}`,
      at: job.finished ?? job.started ?? '',
      job,
    })),
    ...asks.map((ask): FeedItem => ({
      kind: 'ask',
      key: `a:${ask.id}`,
      at: ask.createdAt ?? '',
      ask,
    })),
  ];
  // Parse, don't string-compare: job timestamps carry the PC's UTC offset while
  // brain ones are Z-suffixed, and mixed forms don't sort lexicographically.
  return items.sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
}

export function ActivityScreen({ settings }: { settings: Settings }) {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [status, setStatus] = useState<AwakeStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedAsk, setSelectedAsk] = useState<BrainRecord | null>(null);

  const refresh = useCallback(async () => {
    if (!settings.baseUrl) return;
    setLoading(true);
    // Jobs are the primary source; brain asks are an optional plugin, and the
    // awake status is decoration — neither may take the feed down with it.
    const [jobsRes, asksRes, statusRes] = await Promise.allSettled([
      listJobs(settings),
      listBrain(settings),
      getStatus(settings),
    ]);
    if (jobsRes.status === 'fulfilled') {
      setError(null);
      setFeed(toFeed(jobsRes.value, asksRes.status === 'fulfilled' ? asksRes.value : []));
    } else {
      setError(jobsRes.reason instanceof Error ? jobsRes.reason.message : String(jobsRes.reason));
    }
    if (statusRes.status === 'fulfilled') setStatus(statusRes.value);
    setLoading(false);
  }, [settings]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  const hold = useCallback(
    async (duration: string) => {
      try {
        const r = await setAwake(settings, duration);
        if (r.status) setStatus(r.status);
        else refresh();
      } catch {}
    },
    [settings, refresh],
  );

  const holding = status?.blockingSleep ?? false;

  return (
    <View style={styles.flex}>
      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: holding ? COLORS.good : COLORS.textDim }]} />
          <Text style={styles.statusText}>
            {status
              ? holding
                ? `Awake — staying up${status.holdUntil ? ` until ${new Date(status.holdUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`
                : 'Idle — normal sleep (2h)'
              : 'Checking computer…'}
          </Text>
        </View>
        <View style={styles.chipRow}>
          <Text style={styles.chipLabel}>Keep awake</Text>
          {(['1h', '2h', '4h'] as const).map((d) => (
            <Pressable key={d} style={styles.chip} onPress={() => hold(d)}>
              <Text style={styles.chipText}>{d}</Text>
            </Pressable>
          ))}
          <Pressable style={[styles.chip, styles.chipOff]} onPress={() => hold('off')}>
            <Text style={styles.chipText}>Off</Text>
          </Pressable>
          <View style={styles.flex} />
          <Pressable style={styles.newBtn} onPress={() => setComposerOpen(true)}>
            <Text style={styles.newBtnText}>+ New build</Text>
          </Pressable>
        </View>
      </View>

      {error && <Text style={styles.error}>⚠ {error}</Text>}
      <FlatList
        data={feed}
        keyExtractor={(i) => i.key}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={COLORS.textDim} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>⚡</Text>
              <Text style={styles.emptyText}>
                Nothing yet. Dispatch a build, or say “ask Claude …” in Chat — everything Claude
                does on your PC shows up here.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const st = item.kind === 'build' ? item.job.status : item.ask.status;
          return (
            <Pressable
              style={styles.row}
              onPress={() => (item.kind === 'build' ? setSelectedJob(item.job) : setSelectedAsk(item.ask))}
            >
              <Text style={styles.rowIcon}>{item.kind === 'build' ? '🔨' : '🧠'}</Text>
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.kind === 'build' ? item.job.project : 'Asked Claude'}
                  </Text>
                  <Text style={styles.time}>{relativeTime(item.at || null)}</Text>
                </View>
                <Text style={styles.rowText} numberOfLines={2}>
                  {item.kind === 'build' ? item.job.task : item.ask.question}
                </Text>
                <Text style={[styles.status, { color: statusColor(st) }]}>{st}</Text>
              </View>
            </Pressable>
          );
        }}
      />

      <ComposerSheet
        visible={composerOpen}
        settings={settings}
        onClose={() => setComposerOpen(false)}
        onDispatched={refresh}
      />
      <JobSheet
        job={selectedJob}
        settings={settings}
        onClose={() => setSelectedJob(null)}
        onFinished={refresh}
      />
      <AskSheet ask={selectedAsk} onClose={() => setSelectedAsk(null)} />
    </View>
  );
}

// Bottom sheet with the new-build form. Kept mounted-per-open so state resets.
function ComposerSheet({
  visible,
  settings,
  onClose,
  onDispatched,
}: {
  visible: boolean;
  settings: Settings;
  onClose: () => void;
  onDispatched: () => void;
}) {
  const [project, setProject] = useState('');
  const [task, setTask] = useState('');
  const [cont, setCont] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setTask('');
      setCont(false);
      setResult(null);
    }
  }, [visible]);

  const dispatch = async () => {
    if (!project.trim() || !task.trim() || busy) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(await dispatchBuild(settings, project.trim(), task.trim(), cont));
      onDispatched();
    } catch (err) {
      setResult(`⚠ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New build</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
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
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Dispatch to Claude Code</Text>}
          </Pressable>
          {result && <Text style={styles.result}>{result}</Text>}
        </View>
      </View>
    </Modal>
  );
}

// Job detail: live-streams the log over SSE while running (3s polling fallback),
// same behavior the old Jobs screen had.
function JobSheet({
  job,
  settings,
  onClose,
  onFinished,
}: {
  job: Job | null;
  settings: Settings;
  onClose: () => void;
  onFinished: () => void;
}) {
  const [log, setLog] = useState('');
  const [logLoading, setLogLoading] = useState(false);
  const [liveStatus, setLiveStatus] = useState('');

  const loadLog = useCallback(async () => {
    if (!job) return;
    setLogLoading(true);
    try {
      setLog(await getJobLog(settings, job.id));
    } catch (err) {
      setLog(`⚠ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLogLoading(false);
    }
  }, [settings, job]);

  useEffect(() => {
    if (!job) return;
    setLiveStatus(job.status);
    setLog('');
    loadLog();
  }, [job, loadLog]);

  useEffect(() => {
    if (!job || liveStatus !== 'running') return;
    const jobId = job.id;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (pollTimer || cancelled) return;
      pollTimer = setInterval(async () => {
        try {
          const [l, js] = await Promise.all([getJobLog(settings, jobId), listJobs(settings)]);
          if (cancelled) return;
          setLog(l);
          const updated = js.find((j) => j.id === jobId);
          if (updated && updated.status !== 'running') {
            setLiveStatus(updated.status);
            onFinished();
          }
        } catch {}
      }, 3000);
    };

    const stop = streamJobLog(settings, jobId, {
      onSnapshot: (l) => {
        if (!cancelled) setLog(l);
      },
      onEnd: ({ status }) => {
        if (cancelled) return;
        setLiveStatus(status);
        onFinished(); // pick up the finished status in the feed
      },
      onError: () => startPolling(),
    });

    return () => {
      cancelled = true;
      stop();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [job, liveStatus, settings, onFinished]);

  return (
    <Modal visible={!!job} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} numberOfLines={1}>
              🔨 {job?.project}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
          <Text style={[styles.status, { color: statusColor(liveStatus || (job?.status ?? '')) }]}>
            {liveStatus || job?.status}
            {liveStatus === 'running' ? '  ● live' : ''}
          </Text>
          <Text style={styles.rowText}>{job?.task}</Text>
          <Text style={styles.label}>{liveStatus === 'running' ? 'Log (updating live…)' : 'Log'}</Text>
          <ScrollView style={styles.logBox}>
            {logLoading ? (
              <ActivityIndicator color={COLORS.textDim} />
            ) : (
              <Text style={styles.logText}>{log || '(empty)'}</Text>
            )}
          </ScrollView>
          <Pressable style={styles.refreshBtn} onPress={loadLog}>
            <Text style={styles.refreshText}>Refresh log</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// Ask detail: the question and Claude's full answer (or what went wrong).
function AskSheet({ ask, onClose }: { ask: BrainRecord | null; onClose: () => void }) {
  return (
    <Modal visible={!!ask} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} numberOfLines={1}>
              🧠 Asked Claude
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
          <Text style={[styles.status, { color: statusColor(ask?.status ?? '') }]}>{ask?.status}</Text>
          <ScrollView style={styles.answerBox}>
            <Text style={styles.rowText}>{ask?.question}</Text>
            {ask?.status === 'running' && (
              <Text style={styles.answerText}>Claude is thinking — the answer lands in Chat (and as a push).</Text>
            )}
            {!!ask?.answer && <Text style={styles.answerText}>{ask.answer}</Text>}
            {!!ask?.error && <Text style={[styles.answerText, { color: COLORS.danger }]}>{ask.error}</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  statusCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    marginHorizontal: 12,
    marginTop: 8,
    padding: 12,
    gap: 10,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { color: COLORS.text, fontSize: 14 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chipLabel: { color: COLORS.textDim, fontSize: 12.5, marginRight: 2 },
  chip: { backgroundColor: COLORS.surfaceAlt, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
  chipOff: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.surfaceAlt },
  chipText: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  newBtn: { backgroundColor: COLORS.accent, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  newBtnText: { color: '#fff', fontSize: 13.5, fontWeight: '700' },
  error: { color: COLORS.danger, fontSize: 13, paddingHorizontal: 14, paddingTop: 10 },
  list: { padding: 12, gap: 8, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60, paddingHorizontal: 24 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { color: COLORS.textDim, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  row: { flexDirection: 'row', gap: 10, backgroundColor: COLORS.surface, borderRadius: 12, padding: 13 },
  rowIcon: { fontSize: 18, marginTop: 1 },
  rowBody: { flex: 1, gap: 3 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  rowTitle: { color: COLORS.text, fontSize: 15, fontWeight: '700', flex: 1 },
  time: { color: COLORS.textDim, fontSize: 12 },
  rowText: { color: COLORS.textDim, fontSize: 13.5, lineHeight: 19 },
  status: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: COLORS.surfaceAlt,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 8,
    maxHeight: '85%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { color: COLORS.text, fontSize: 19, fontWeight: '700', flex: 1 },
  close: { color: COLORS.textDim, fontSize: 20, paddingHorizontal: 6 },
  label: { color: COLORS.textDim, fontSize: 13, marginTop: 6 },
  input: {
    backgroundColor: COLORS.surface,
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
  logBox: { backgroundColor: COLORS.bg, borderRadius: 10, padding: 12, maxHeight: 320 },
  logText: { color: COLORS.text, fontSize: 12, fontFamily: 'monospace', lineHeight: 17 },
  answerBox: { backgroundColor: COLORS.bg, borderRadius: 10, padding: 14, maxHeight: 420 },
  answerText: { color: COLORS.text, fontSize: 14.5, lineHeight: 21, marginTop: 10 },
  refreshBtn: { backgroundColor: COLORS.surface, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 4 },
  refreshText: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
});
