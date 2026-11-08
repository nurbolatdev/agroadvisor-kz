import {
  Camera,
  House,
  Inbox,
  MessageCircle,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react-native'

export type SlotId = 'home' | 'requests' | 'community' | 'camera' | 'chats' | 'profile'

// The text of a slot: a key of the i18n files (src/i18n)
export type SlotLabel =
  'tabs.home' | 'tabs.requests' | 'tabs.community' | 'tabs.camera' | 'tabs.chats' | 'tabs.profile'

export type TabSlot = {
  id: SlotId
  // a route: opens a tab of (app)/(tabs); an action: does something (the camera button starts a diagnosis)
  kind: 'route' | 'action'
  // the file of the tab in (app)/(tabs), for a route
  route?: string
  icon: LucideIcon
  label: SlotLabel
  // The bar shows only what exists: a slot of a section that is not built yet is not drawn at all, no
  // "soon" stub. A task that builds a section turns its slot on.
  implemented: boolean
}

// The five places of the bottom bar in the order of the design (screens 04 and 19): Home, Community, the
// camera button in the middle, Chats, Profile.
export const TAB_SLOTS: readonly TabSlot[] = [
  { id: 'home', kind: 'route', route: 'home', icon: House, label: 'tabs.home', implemented: true },
  {
    id: 'community',
    kind: 'route',
    route: 'community',
    icon: Users,
    label: 'tabs.community',
    implemented: false, // M16
  },
  { id: 'camera', kind: 'action', icon: Camera, label: 'tabs.camera', implemented: true },
  {
    id: 'chats',
    kind: 'route',
    route: 'chats',
    icon: MessageCircle,
    label: 'tabs.chats',
    implemented: false, // M14
  },
  {
    id: 'profile',
    kind: 'route',
    route: 'profile',
    icon: User,
    label: 'tabs.profile',
    implemented: true,
  },
]

// The places of an agrochemist (frames 21a, 22a-22c): Requests, Community, Chats, Profile; no camera, an
// agrochemist does not diagnose. Community and Chats are drawn when their sections exist (M16, M14).
export const AGROCHEMIST_SLOTS: readonly TabSlot[] = [
  {
    id: 'requests',
    kind: 'route',
    route: 'requests',
    icon: Inbox,
    label: 'tabs.requests',
    implemented: true,
  },
  {
    id: 'community',
    kind: 'route',
    route: 'community',
    icon: Users,
    label: 'tabs.community',
    implemented: false, // M16
  },
  {
    id: 'chats',
    kind: 'route',
    route: 'chats',
    icon: MessageCircle,
    label: 'tabs.chats',
    implemented: false, // M14
  },
  {
    id: 'profile',
    kind: 'route',
    route: 'profile',
    icon: User,
    label: 'tabs.profile',
    implemented: true,
  },
]

export function visibleSlots(slots: readonly TabSlot[] = TAB_SLOTS): TabSlot[] {
  return slots.filter((slot) => slot.implemented)
}
