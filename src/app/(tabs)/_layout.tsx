import { Tabs } from 'expo-router/js-tabs';

import { FloatingTabBar } from '../../components/FloatingTabBar';
import { colors } from '../../theme/tokens';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        animation: 'fade',
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="journal" />
    </Tabs>
  );
}
