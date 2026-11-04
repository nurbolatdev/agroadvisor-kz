import { Tabs } from 'expo-router'
import { House } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'

import { colors, fonts, sizes } from '@/theme/tokens'

// The tabs of a signed-in user. The diagnosis flow, the result, the queue and the history are screens of
// the parent stack (app)/_layout.tsx and open over the tabs. The path of the home screen stays /home.
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
    </Tabs>
  )
}
