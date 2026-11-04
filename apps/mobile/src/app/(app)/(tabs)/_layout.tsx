import { Tabs } from 'expo-router'
import { History, House } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'

import { colors, fonts, sizes } from '@/theme/tokens'

// The two main tabs of a signed-in user. The diagnosis flow, the result and the queue are screens of the
// parent stack (app)/_layout.tsx and open over the tabs. The paths stay /home and /history.
export default function TabsLayout() {
  const { t } = useTranslation()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: fonts.medium },
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.border },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('home.title'),
          tabBarIcon: ({ color }) => <House color={color} size={sizes.icon} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: t('history.title'),
          tabBarIcon: ({ color }) => <History color={color} size={sizes.icon} />,
        }}
      />
    </Tabs>
  )
}
