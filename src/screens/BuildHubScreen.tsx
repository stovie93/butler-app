import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Segmented } from '../components/Segmented';
import { Settings } from '../settings';
import { BuildScreen } from './BuildScreen';
import { JobsScreen } from './JobsScreen';

/** Build + Jobs behind one tab: dispatch a build, or browse running/finished jobs. */
export function BuildHubScreen({ settings }: { settings: Settings }) {
  const [view, setView] = useState<'new' | 'jobs'>('new');
  return (
    <View style={styles.flex}>
      <Segmented
        options={[
          { key: 'new', label: 'New build' },
          { key: 'jobs', label: 'Jobs' },
        ]}
        value={view}
        onChange={setView}
      />
      <View style={styles.flex}>
        {view === 'new' ? <BuildScreen settings={settings} /> : <JobsScreen settings={settings} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
