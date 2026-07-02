import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../theme';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.h}>{title}</Text>
      {children}
    </View>
  );
}

const P = ({ children }: { children: React.ReactNode }) => <Text style={styles.p}>{children}</Text>;
const Mono = ({ children }: { children: React.ReactNode }) => <Text style={styles.mono}>{children}</Text>;

export function HelpScreen({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <Text style={styles.title}>🤖 Butler</Text>
      <P>
        Butler is a remote control for the AI on your PC. The local model handles chat; for real
        work it hands tasks to Claude Code, which builds things autonomously while you're away.
      </P>

      <Section title="1 · One-time setup">
        <P>• Install the <Text style={styles.b}>Tailscale</Text> app on this phone and sign in with the same account as your PC, then turn its VPN on. This is what lets the app reach your computer from anywhere.</P>
        <P>• Open <Text style={styles.b}>Settings</Text> (the gear, top-right) and enter your gateway URL and token, then tap Test. You only do this once.</P>
        <Pressable style={styles.btn} onPress={onOpenSettings}>
          <Text style={styles.btnText}>Open Settings</Text>
        </Pressable>
      </Section>

      <Section title="2 · Chat tab">
        <P>Talk to your butler — it lives on your PC, knows the time, what's running, and what it remembers about you. Ask for <Text style={styles.b}>the latest news, weather, or prices</Text> and it looks them up on the live web.</P>
        <P>Tap <Text style={styles.b}>🎤 to talk</Text> instead of typing — when you speak to it, it speaks back. Tap any reply bubble to hear it aloud, or turn <Text style={styles.b}>🔊 Voice on</Text> to hear every reply. <Text style={styles.b}>🗑️ Clear</Text> wipes the conversation and starts genuinely fresh.</P>
        <P>The <Text style={styles.b}>🤖 Local/Claude</Text> toggle sets how build suggestions appear: on “Claude”, offers to hand work to Claude Code come pre-expanded; on “Local” they stay as a subtle chip.</P>
      </Section>

      <Section title="3 · Build tab">
        <P>Give Claude Code a real coding job. Enter a <Text style={styles.b}>project name</Text> (a folder under your PC's repos) and describe what to build, then tap Dispatch. Switch to <Text style={styles.b}>Jobs</Text> to watch it run — <Text style={{ color: COLORS.warn }}>running</Text>, <Text style={{ color: COLORS.good }}>done</Text>, or <Text style={{ color: COLORS.danger }}>failed</Text> — and tap a job for its live log. Your phone gets a push when a build finishes.</P>
        <P>Turn on <Text style={styles.b}>Continue</Text> to have it pick up where the last session on that project left off.</P>
        <P>The <Text style={styles.b}>Keep awake</Text> buttons stop your PC from sleeping for 1–4 hours (tap Off to release). Builds already keep it awake on their own.</P>
      </Section>

      <Section title="4 · PC tab">
        <P>Quick remote-control for your computer. Tap to check <Text style={styles.b}>status</Text>, <Text style={styles.b}>disk</Text>, <Text style={styles.b}>battery</Text>, or top apps; <Text style={styles.b}>lock</Text> the screen; change <Text style={styles.b}>volume</Text>; or open an app like Spotify or your browser.</P>
        <P>You can also just ask in Chat — “lock my PC”, “how much disk is free?”, “open spotify”.</P>
        <P>The <Text style={styles.b}>Power</Text> section can shut down or restart the PC. Because the app can't turn it back on once it's off, shutdown/restart always go through an approval — tapping one (or asking in chat) creates a card in the <Text style={styles.b}>Approvals</Text> tab that you confirm, with a 20s grace window and an Abort button.</P>
      </Section>

      <Section title="5 · Memory tab">
        <P>The butler keeps a durable memory of who you are. Type something to <Text style={styles.b}>remember</Text> — “I work nights”, “my dog is Rex” — or just mention it naturally in Chat and it's picked up <Text style={styles.b}>on its own</Text> (say “remember that…” to force it). Everything it knows is listed here; search it or delete entries with the ✕. Remembered facts come back automatically in every future chat.</P>
        <P>The <Text style={styles.b}>Reminders</Text> view sets timed nudges in plain language — “in 2 hours”, “tomorrow at 9am”. When one is due, your phone gets a push (even with the app closed) and your PC pops a notification. Asking in Chat works too: “remind me to call mum in 2 hours”.</P>
      </Section>

      <Section title="6 · Approvals tab">
        <P>When the butler needs your OK for something sensitive (like shutting down the PC), the request shows here as a card — and pushes to your phone even with the app closed. Approve or deny; nothing runs until you decide.</P>
      </Section>

      <Section title="Make it yours">
        <P>In Settings: <Text style={styles.b}>🎭 Persona</Text> shapes your butler's name, vibe, and personality everywhere it talks. <Text style={styles.b}>🤖 Chat model</Text> switches which model answers — heavier ones have more personality, lighter ones are faster. Takes effect on your next message, no restart.</P>
      </Section>

      <Section title="Commands (chat shortcuts)">
        <P>Anything the tabs do, you can also type in Chat:</P>
        <P><Mono>/build snake-game a retro snake game</Mono></P>
        <P><Mono>/build snake-game --continue add sound effects</Mono></P>
        <P><Mono>/jobs</Mono> · <Mono>/awake 2h</Mono> · <Mono>/awake off</Mono></P>
        <P><Mono>/pc disk</Mono> · <Mono>/pc lock</Mono> · <Mono>/pc open spotify</Mono></P>
        <P><Mono>/pc shutdown</Mono> · <Mono>/pc restart</Mono> · <Mono>/pc abort</Mono></P>
        <P><Mono>/remind in 2 hours | call mum</Mono> · <Mono>/remind list</Mono> · <Mono>/remind cancel &lt;id&gt;</Mono></P>
        <P><Mono>/remember I prefer concise replies</Mono> · <Mono>/recall &lt;query&gt;</Mono> · <Mono>/forget &lt;id&gt;</Mono></P>
      </Section>

      <Section title="Good to know">
        <P>Your PC sleeps after 2 hours idle. Keep-awake stops it sleeping <Text style={styles.b}>while it's on</Text>, but the app can't wake a PC that's already asleep (hardware limit). If it's been a while, the PC may need a nudge in person before you can reach it.</P>
        <P>Everything stays on your own network — chat, memory, and voice all run on your own hardware; nothing is exposed to the public internet.</P>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, gap: 18, paddingBottom: 48 },
  title: { color: COLORS.text, fontSize: 26, fontWeight: '800' },
  section: { gap: 7 },
  h: { color: COLORS.accent, fontSize: 16, fontWeight: '700', marginBottom: 2 },
  p: { color: COLORS.text, fontSize: 14.5, lineHeight: 22 },
  b: { fontWeight: '700' },
  mono: { color: COLORS.accent, fontFamily: 'monospace', fontSize: 13.5 },
  btn: { backgroundColor: COLORS.accent, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 22 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14.5 },
});
