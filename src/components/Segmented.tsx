import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../theme';

/** A compact segmented toggle used to put two screens behind one tab. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <View style={styles.row}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            style={[styles.seg, active && styles.segActive]}
            onPress={() => onChange(o.key)}
          >
            <Text style={[styles.segText, active && styles.segTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 4,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 2,
    gap: 4,
  },
  seg: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  segActive: { backgroundColor: COLORS.accent },
  segText: { color: COLORS.textDim, fontSize: 14.5, fontWeight: '700' },
  segTextActive: { color: '#fff' },
});
