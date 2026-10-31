import { Redirect } from 'expo-router'

import { useSession } from '@/services'

// "/" belongs to neither group, so it sends the user to the right place.
export default function Index() {
  const signedIn = useSession((s) => s.status === 'signedIn')
  return <Redirect href={signedIn ? '/home' : '/login'} />
}
