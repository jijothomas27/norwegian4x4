import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, shadow } from '../theme/tokens';
import { AppText } from './AppText';

type IconName = ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<string, { on: IconName; off: IconName; label: string }> = {
  index: { on: 'pulse', off: 'pulse-outline', label: 'Practice' },
  journal: { on: 'leaf', off: 'leaf-outline', label: 'Journal' },
};

/** Floating pill tab bar — two quiet destinations, nothing more. */
export function FloatingTabBar({ state, navigateToTab, insets }: BottomTabBarProps) {
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 14) }]}>
      <View style={[styles.bar, shadow]} accessibilityRole="tablist">
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const meta = ICONS[route.name] ?? { on: 'ellipse', off: 'ellipse-outline', label: route.name };
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={meta.label}
              onPress={() => {
                if (!focused) navigateToTab(route.key);
              }}
              style={[styles.item, focused && styles.itemActive]}
            >
              <Ionicons name={focused ? meta.on : meta.off} size={18} color={focused ? colors.lavender : colors.textTertiary} />
              <AppText variant="callout" color={focused ? colors.text : colors.textTertiary} style={styles.label}>
                {meta.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(32,32,38,0.96)',
    borderRadius: radius.pill,
    padding: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
  },
  itemActive: {
    backgroundColor: 'rgba(200,191,244,0.12)',
  },
  label: {
    marginLeft: 8,
    fontSize: 14,
  },
});
