import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Segmented } from '../components/Segmented';
import { Settings } from '../settings';
import { MemoryScreen } from './MemoryScreen';
import { RemindersScreen } from './RemindersScreen';

/** Memory + Reminders behind one tab: what the butler knows, and timed nudges. */
export function MemoryHubScreen({ settings }: { settings: Settings }) {
  const [view, setView] = useState<'memory' | 'reminders'>('memory');
  return (
    <View style={styles.flex}>
      <Segmented
        options={[
          { key: 'memory', label: 'Memory' },
          { key: 'reminders', label: 'Reminders' },
        ]}
        value={view}
        onChange={setView}
      />
      <View style={styles.flex}>
        {view === 'memory' ? <MemoryScreen settings={settings} /> : <RemindersScreen settings={settings} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
