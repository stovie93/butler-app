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
        <P>Talk to the local model on your PC — quick questions, notes, anything. It remembers the conversation.</P>
      </Section>

      <Section title="3 · Build tab">
        <P>Give Claude Code a real coding job. Enter a <Text style={styles.b}>project name</Text> (a folder under your PC's repos) and describe what to build, then tap Dispatch. It runs on your PC and you get a job id back instantly.</P>
        <P>Turn on <Text style={styles.b}>Continue</Text> to have it pick up where the last session on that project left off.</P>
        <P>The <Text style={styles.b}>Keep awake</Text> buttons stop your PC from sleeping for 1–4 hours while you work (tap Off to release). Builds already keep it awake on their own.</P>
      </Section>

      <Section title="4 · Jobs tab">
        <P>Every build shows up here with its status — <Text style={{ color: COLORS.warn }}>running</Text>, <Text style={{ color: COLORS.good }}>done</Text>, or <Text style={{ color: COLORS.danger }}>failed</Text>. Tap one to read its log. Pull down to refresh.</P>
        <P>When a build finishes, the butler also messages you automatically.</P>
      </Section>

      <Section title="5 · PC tab">
        <P>Quick remote-control for your computer. Tap to check <Text style={styles.b}>status</Text>, <Text style={styles.b}>disk</Text>, <Text style={styles.b}>battery</Text>, or top apps; <Text style={styles.b}>lock</Text> the screen; change <Text style={styles.b}>volume</Text>; or open an app like Spotify or your browser.</P>
        <P>You can also just ask in Chat — “lock my PC”, “how much disk is free?”, “open spotify”.</P>
        <P>The <Text style={styles.b}>Power</Text> section can shut down or restart the PC (with a 20s grace window and an Abort button). Asking the butler to shut down over chat needs your approval first — once it's off, the app can't turn it back on.</P>
      </Section>

      <Section title="Commands (chat shortcuts)">
        <P>Anything the tabs do, you can also type in Chat or send over WhatsApp:</P>
        <P><Mono>/build snake-game a retro snake game</Mono></P>
        <P><Mono>/build snake-game --continue add sound effects</Mono></P>
        <P><Mono>/jobs</Mono> · <Mono>/awake 2h</Mono> · <Mono>/awake off</Mono></P>
        <P><Mono>/pc disk</Mono> · <Mono>/pc lock</Mono> · <Mono>/pc open spotify</Mono></P>
        <P><Mono>/pc shutdown</Mono> · <Mono>/pc restart</Mono> · <Mono>/pc abort</Mono></P>
      </Section>

      <Section title="Good to know">
        <P>Your PC sleeps after 2 hours idle. Keep-awake stops it sleeping <Text style={styles.b}>while it's on</Text>, but the app can't wake a PC that's already asleep (hardware limit). If it's been a while, the PC may need a nudge in person before you can reach it.</P>
        <P>Everything stays on your own network — nothing is exposed to the public internet.</P>
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
