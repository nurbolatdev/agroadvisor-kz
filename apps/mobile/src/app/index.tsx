import { Redirect } from 'expo-router'

import { useSession } from '@/services'
import { useSettings } from '@/store/settings'

// "/" belongs to no group, so it sends the user to the right place: the home screen when signed in, the
// language screen when signed out and no language was chosen yet, the sign-in otherwise.
export default function Index() {
  const signedIn = useSession((s) => s.status === 'signedIn')
  const languageChosen = useSettings((s) => s.languageChosen)
  return <Redirect href={signedIn ? '/home' : languageChosen ? '/login' : '/language'} />
}
