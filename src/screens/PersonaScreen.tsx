import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { getPersona, Persona, savePersona } from '../api';
import { Settings } from '../settings';
import { COLORS } from '../theme';

export function PersonaScreen({ settings }: { settings: Settings }) {
  const [persona, setPersona] = useState<Persona | null>(null);
  const [name, setName] = useState('');
  const [vibe, setVibe] = useState('');
  const [emoji, setEmoji] = useState('');
  const [personality, setPersonality] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!settings.baseUrl || !settings.token) return;
    setLoading(true);
    try {
      const p = await getPersona(settings);
      setPersona(p);
      setName(p.name);
      setVibe(p.vibe);
      setEmoji(p.emoji);
      setPersonality(p.personality);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [settings]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!name.trim()) {
      setError("Your butler needs a name.");
      return;
    }
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const p = await savePersona(settings, {
        name: name.trim(),
        vibe: vibe.trim(),
        emoji: emoji.trim(),
        personality: personality.trim(),
      });
      setPersona(p);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !persona) {
    return (
      <View style={[styles.flex, styles.center]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.intro}>
        Shape your butler's identity. This drives how it talks to you everywhere.
      </Text>

      <View style={styles.row2}>
        <View style={styles.nameCol}>
          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Clawdia" placeholderTextColor={COLORS.textDim} />
        </View>
        <View style={styles.emojiCol}>
          <Text style={styles.label}>Emoji</Text>
          <TextInput style={[styles.input, styles.emojiInput]} value={emoji} onChangeText={setEmoji} placeholder="🫧" placeholderTextColor={COLORS.textDim} />
        </View>
      </View>

      <Text style={styles.label}>Vibe</Text>
      <TextInput style={styles.input} value={vibe} onChangeText={setVibe} placeholder="bubbly & playful" placeholderTextColor={COLORS.textDim} />

      <Text style={styles.label}>Personality</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={personality}
        onChangeText={setPersonality}
        placeholder="Describe how your butler should act, talk, and feel…"
        placeholderTextColor={COLORS.textDim}
        multiline
      />

      <Pressable style={[styles.saveBtn, saving && styles.busy]} disabled={saving} onPress={save}>
        {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Save persona</Text>}
      </Pressable>
      {saved && <Text style={styles.ok}>✓ Saved — it takes effect on your next message.</Text>}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 18, gap: 8, paddingBottom: 40 },
  intro: { color: COLORS.textDim, fontSize: 14, lineHeight: 20, marginBottom: 6 },
  row2: { flexDirection: 'row', gap: 12 },
  nameCol: { flex: 1 },
  emojiCol: { width: 80 },
  label: {
    color: COLORS.textDim,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: COLORS.text,
    fontSize: 15,
  },
  emojiInput: { textAlign: 'center', fontSize: 20 },
  multiline: { minHeight: 120, textAlignVertical: 'top', lineHeight: 21 },
  saveBtn: { backgroundColor: COLORS.accent, borderRadius: 11, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  busy: { opacity: 0.7 },
  saveText: { color: '#fff', fontSize: 15.5, fontWeight: '700' },
  ok: { color: COLORS.good, fontSize: 13.5, marginTop: 10 },
  error: { color: COLORS.danger, fontSize: 13.5, marginTop: 10 },
});
