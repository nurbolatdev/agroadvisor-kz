import { Tabs, useRouter } from 'expo-router'
import type { ComponentProps } from 'react'

import { BottomBar } from '@/components/nav/BottomBar'
import { AGROCHEMIST_SLOTS, TAB_SLOTS } from '@/components/nav/tabSlots'
import { isFeatureEnabled } from '@/features/access/featureAccess'
import { RoleGate } from '@/features/access/RoleGate'
import { hasAgrochemistRole } from '@/features/access/roles'
import { useUnreadCount } from '@/features/chats/useUnreadCount'
import { useDiagnosis } from '@/services'
import { colors } from '@/theme/tokens'

// The tabs of a signed-in user, drawn by the bottom bar of the design (components/nav): the places come
// from its configuration, so a section that gets ready is added there and here nothing changes. The
// diagnosis flow, the result, the queue and the history are screens of the parent stack (app)/_layout.tsx
// and open over the tabs. The path of the home screen stays /home.
//
// The tabs depend on the role, so they wait for it (RoleGate; the roles are the ones saved on the phone
// or the answer of the server): a farmer has Home and Profile with the camera button, an agrochemist has
// Requests and Profile and no camera. The screens of the other role are hidden from the bar (href: null).
//
// The first tab declared is the first route of the router, and the system "Back" of Android goes to it
// (backBehavior "firstRoute"): Home for a farmer, Requests for an agrochemist, and from there out of the
// app. So the screens are declared in the order of the role, and the tabs are built again (key) when the
// answer of the server gives another role than the one saved on the phone.
export default function TabsLayout() {
  return <RoleGate>{(roles) => <RoleTabs agrochemist={hasAgrochemistRole(roles)} />}</RoleGate>
}

// The bar with the number of unread messages on the Chats tab. It is read again when another tab opens.
function TabsBar(props: ComponentProps<typeof BottomBar>) {
  const unread = useUnreadCount(props.activeRoute, isFeatureEnabled('consultations'))
  return <BottomBar {...props} badges={{ chats: unread }} />
}

function RoleTabs({ agrochemist }: { agrochemist: boolean }) {
  const router = useRouter()

  return (
    <Tabs
      key={agrochemist ? 'agrochemist' : 'farmer'}
      backBehavior="firstRoute"
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={(props) => (
        <TabsBar
          slots={agrochemist ? AGROCHEMIST_SLOTS : TAB_SLOTS}
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
      {/* direct children, not a fragment: the router reads only Screen elements, in this order */}
      {agrochemist ? <Tabs.Screen name="requests" /> : <Tabs.Screen name="home" />}
      {/* with the flag off the route is closed too, not only its button in the bar */}
      <Tabs.Screen
        name="chats"
        options={isFeatureEnabled('consultations') ? undefined : { href: null }}
      />
      <Tabs.Screen name="profile" />
      {agrochemist ? (
        <Tabs.Screen name="home" options={{ href: null }} />
      ) : (
        <Tabs.Screen name="requests" options={{ href: null }} />
      )}
    </Tabs>
  )
}
