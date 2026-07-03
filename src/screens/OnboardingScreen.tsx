import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { getPersona, savePersona, testConnection } from '../api';
import { registerForPush } from '../push';
import { Settings } from '../settings';
import { COLORS } from '../theme';

const GATEWAY_REPO = 'https://github.com/stovie93/butler-gateway';
const TAILSCALE_PLAY = 'https://play.google.com/store/apps/details?id=com.tailscale.ipn';

const STEPS = ['welcome', 'tailscale', 'connect', 'persona', 'notify'] as const;
type Step = (typeof STEPS)[number];

/**
 * First-run setup wizard. Walks a brand-new user from "what is this?" to a
 * working connection, a named butler, and push notifications. Every step past
 * "connect" is skippable; finishing (or skipping out) hands the collected
 * settings back to App so it can save them and never show the wizard again.
 */
export function OnboardingScreen({
  initialSettings,
  onDone,
}: {
  initialSettings: Settings;
  onDone: (settings: Settings | null) => void;
}) {
  const [step, setStep] = useState<Step>('welcome');
  const [baseUrl, setBaseUrl] = useState(initialSettings.baseUrl);
  const [token, setToken] = useState(initialSettings.token);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const settings: Settings = { baseUrl: baseUrl.trim(), token: token.trim() };
  const stepIndex = STEPS.indexOf(step);

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(`✓ ${await testConnection(settings)}`);
      setConnected(true);
    } catch (err) {
      setTestResult(`✗ ${err instanceof Error ? err.message : String(err)}`);
      setConnected(false);
    } finally {
      setTesting(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.progressRow}>
        {STEPS.map((s, i) => (
          <View key={s} style={[styles.progressDot, i <= stepIndex && styles.progressDotActive]} />
        ))}
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {step === 'welcome' && (
          <>
            <Text style={styles.emoji}>🤖</Text>
            <Text style={styles.title}>Welcome to Butler</Text>
            <Text style={styles.body}>
              Butler is your own AI that lives on <Text style={styles.b}>your PC</Text> — this app
              is the remote control. Chat with it, give it memories, have it run builds, control
              your computer, and get pushes when it needs you. Everything stays on your own
              hardware.
            </Text>
            <Text style={styles.body}>To set it up you'll need two things:</Text>
            <View style={styles.checklist}>
              <Text style={styles.checkItem}>
                1. The <Text style={styles.b}>Butler gateway</Text> running on your PC — follow
                SETUP.md in the gateway repo.
              </Text>
              <Text style={styles.checkItem}>
                2. <Text style={styles.b}>Tailscale</Text> on both your PC and this phone, so the
                app can reach your computer from anywhere.
              </Text>
            </View>
            <Pressable style={styles.linkBtn} onPress={() => Linking.openURL(GATEWAY_REPO)}>
              <Text style={styles.linkBtnText}>Open the gateway repo ↗</Text>
            </Pressable>
          </>
        )}

        {step === 'tailscale' && (
          <>
            <Text style={styles.emoji}>🔗</Text>
            <Text style={styles.title}>Connect your network</Text>
            <Text style={styles.body}>
              Tailscale is a free private network between your devices. It's how this app reaches
              your PC from anywhere — no port forwarding, nothing exposed to the internet.
            </Text>
            <View style={styles.checklist}>
              <Text style={styles.checkItem}>1. Install the Tailscale app on this phone.</Text>
              <Text style={styles.checkItem}>
                2. Sign in with the <Text style={styles.b}>same account</Text> as your PC.
              </Text>
              <Text style={styles.checkItem}>3. Turn its VPN toggle on.</Text>
            </View>
            <Pressable style={styles.linkBtn} onPress={() => Linking.openURL(TAILSCALE_PLAY)}>
              <Text style={styles.linkBtnText}>Get Tailscale on Google Play ↗</Text>
            </Pressable>
            <Text style={styles.dim}>Already using Tailscale? Just continue.</Text>
          </>
        )}

        {step === 'connect' && (
          <>
            <Text style={styles.emoji}>🖥️</Text>
            <Text style={styles.title}>Point at your PC</Text>
            <Text style={styles.body}>
              Enter your gateway's URL and token. Both are printed at the end of the gateway
              setup — the URL comes from <Text style={styles.mono}>tailscale serve</Text>, the
              token from your gateway config.
            </Text>
            <Text style={styles.fieldLabel}>Gateway URL</Text>
            <TextInput
              style={styles.input}
              value={baseUrl}
              onChangeText={(v) => {
                setBaseUrl(v);
                setConnected(false);
              }}
              placeholder="https://your-pc.your-tailnet.ts.net"
              placeholderTextColor={COLORS.textDim}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.fieldLabel}>Token</Text>
            <TextInput
              style={styles.input}
              value={token}
              onChangeText={(v) => {
                setToken(v);
                setConnected(false);
              }}
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
            <Pressable
              style={[styles.linkBtn, testing && styles.busy]}
              disabled={testing || !baseUrl.trim() || !token.trim()}
              onPress={runTest}
            >
              {testing ? (
                <ActivityIndicator color={COLORS.accent} size="small" />
              ) : (
                <Text style={styles.linkBtnText}>Test connection</Text>
              )}
            </Pressable>
          </>
        )}

        {step === 'persona' && (
          <PersonaStep settings={settings} onNext={() => setStep('notify')} />
        )}

        {step === 'notify' && (
          <>
            <Text style={styles.emoji}>🔔</Text>
            <Text style={styles.title}>Stay in the loop</Text>
            <Text style={styles.body}>
              With notifications on, your butler can reach this phone even when the app is closed
              — approval requests, finished builds, reminders, and anything it decides you should
              know.
            </Text>
            <Text style={styles.dim}>
              Android will ask for permission. You can change this anytime in system settings.
            </Text>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {step === 'welcome' && (
          <>
            <Pressable style={styles.skipBtn} onPress={() => onDone(null)}>
              <Text style={styles.skipText}>Skip setup</Text>
            </Pressable>
            <Pressable style={styles.nextBtn} onPress={() => setStep('tailscale')}>
              <Text style={styles.nextText}>Get started</Text>
            </Pressable>
          </>
        )}
        {step === 'tailscale' && (
          <>
            <Pressable style={styles.skipBtn} onPress={() => setStep('welcome')}>
              <Text style={styles.skipText}>Back</Text>
            </Pressable>
            <Pressable style={styles.nextBtn} onPress={() => setStep('connect')}>
              <Text style={styles.nextText}>Continue</Text>
            </Pressable>
          </>
        )}
        {step === 'connect' && (
          <>
            <Pressable style={styles.skipBtn} onPress={() => setStep('tailscale')}>
              <Text style={styles.skipText}>Back</Text>
            </Pressable>
            {connected ? (
              <Pressable style={styles.nextBtn} onPress={() => setStep('persona')}>
                <Text style={styles.nextText}>Continue</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.skipBtn} onPress={() => onDone(null)}>
                <Text style={styles.skipText}>I'll do this later</Text>
              </Pressable>
            )}
          </>
        )}
        {step === 'persona' && (
          <Pressable style={styles.skipBtn} onPress={() => setStep('connect')}>
            <Text style={styles.skipText}>Back</Text>
          </Pressable>
        )}
        {step === 'notify' && (
          <>
            <Pressable style={styles.skipBtn} onPress={() => onDone(settings)}>
              <Text style={styles.skipText}>Not now</Text>
            </Pressable>
            <Pressable
              style={styles.nextBtn}
              onPress={async () => {
                await registerForPush(settings);
                onDone(settings);
              }}
            >
              <Text style={styles.nextText}>Enable notifications</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

// Names the butler and the owner in one screen. Loads current persona to
// prefill (a fresh gateway ships defaults), saves only the two name fields so
// the rest of the persona is untouched.
function PersonaStep({ settings, onNext }: { settings: Settings; onNext: () => void }) {
  const [butlerName, setButlerName] = useState('');
  const [owner, setOwner] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getPersona(settings)
      .then((p) => {
        setButlerName(p.name);
        setOwner(p.owner ?? '');
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await savePersona(settings, {
        ...(butlerName.trim() ? { name: butlerName.trim() } : {}),
        owner: owner.trim(),
      });
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Text style={styles.emoji}>🎭</Text>
      <Text style={styles.title}>Make it yours</Text>
      <Text style={styles.body}>
        Give your butler a name, and tell it yours. It'll use your name everywhere — memories,
        briefings, notifications. You can fine-tune its whole personality later under Settings →
        Persona.
      </Text>
      <Text style={styles.fieldLabel}>Butler's name</Text>
      <TextInput
        style={styles.input}
        value={butlerName}
        onChangeText={setButlerName}
        placeholder="Butler"
        placeholderTextColor={COLORS.textDim}
      />
      <Text style={styles.fieldLabel}>Your name</Text>
      <TextInput
        style={styles.input}
        value={owner}
        onChangeText={setOwner}
        placeholder="What should it call you?"
        placeholderTextColor={COLORS.textDim}
      />
      {!!error && <Text style={[styles.testResult, styles.bad]}>{error}</Text>}
      <View style={styles.inlineActions}>
        <Pressable style={styles.skipBtn} onPress={onNext}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
        <Pressable style={[styles.nextBtn, saving && styles.busy]} disabled={saving} onPress={save}>
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.nextText}>Save & continue</Text>
          )}
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  content: { padding: 24, paddingTop: 12, gap: 12 },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 18,
    paddingBottom: 6,
  },
  progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.surfaceAlt },
  progressDotActive: { backgroundColor: COLORS.accent },
  emoji: { fontSize: 44, textAlign: 'center', marginTop: 12 },
  title: { color: COLORS.text, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  body: { color: COLORS.text, fontSize: 15, lineHeight: 22 },
  b: { fontWeight: '700' },
  mono: { fontFamily: 'monospace', color: COLORS.accent, fontSize: 14 },
  dim: { color: COLORS.textDim, fontSize: 13.5, lineHeight: 19 },
  checklist: { gap: 8, marginTop: 2 },
  checkItem: { color: COLORS.text, fontSize: 14.5, lineHeight: 21 },
  linkBtn: {
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 8,
  },
  linkBtnText: { color: COLORS.accent, fontWeight: '700', fontSize: 14.5 },
  fieldLabel: {
    color: COLORS.textDim,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 8,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: COLORS.text,
    fontSize: 15,
  },
  testResult: { fontSize: 13.5, marginTop: 4 },
  good: { color: COLORS.good },
  bad: { color: COLORS.danger },
  busy: { opacity: 0.7 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 28,
  },
  inlineActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 14,
  },
  skipBtn: { paddingVertical: 12, paddingHorizontal: 10 },
  skipText: { color: COLORS.textDim, fontSize: 15 },
  nextBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 11,
    paddingVertical: 13,
    paddingHorizontal: 26,
    minWidth: 130,
    alignItems: 'center',
  },
  nextText: { color: '#fff', fontSize: 15.5, fontWeight: '700' },
});
