import { Tabs, useRouter } from 'expo-router'

import { BottomBar } from '@/components/nav/BottomBar'
import { useDiagnosis } from '@/services'
import { colors } from '@/theme/tokens'

// The tabs of a signed-in user, drawn by the bottom bar of the design (components/nav): the places come
// from its configuration, so a section that gets ready is added there and here nothing changes. The
// diagnosis flow, the result, the queue and the history are screens of the parent stack (app)/_layout.tsx
// and open over the tabs. The path of the home screen stays /home.
export default function TabsLayout() {
  const router = useRouter()

  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={(props) => (
        <BottomBar
          activeRoute={props.state.routes[props.state.index].name}
          onNavigate={(name) => {
            const route = props.state.routes.find((r) => r.name === name)
            if (route) props.navigateToTab(route.key)
          }}
          onCamera={() => {
            // a flow that was left in the middle must not come back with the old crop and photo
            useDiagnosis.getState().reset()
            router.push('/diagnosis')
          }}
        />
      )}
    >
      <Tabs.Screen name="home" />
    </Tabs>
  )
}
