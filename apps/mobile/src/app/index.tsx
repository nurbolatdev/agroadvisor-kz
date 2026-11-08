import { Redirect } from 'expo-router'

import { hasAgrochemistRole } from '@/features/access/roles'
import { useProfile, useSession } from '@/services'
import { useSettings } from '@/store/settings'

// "/" belongs to no group, so it sends the user to the right place: the home screen when signed in (an
// agrochemist, by the role saved on the phone, goes straight to the requests tab and does not pass through
// the home path), the language screen when signed out and no language was chosen yet, the sign-in otherwise.
export default function Index() {
  const signedIn = useSession((s) => s.status === 'signedIn')
  const agrochemist = useProfile((s) => hasAgrochemistRole(s.roles))
  const languageChosen = useSettings((s) => s.languageChosen)
  const home = agrochemist ? '/requests' : '/home'
  return <Redirect href={signedIn ? home : languageChosen ? '/login' : '/language'} />
}
