import { useNavigation } from 'expo-router'
import { useEffect } from 'react'
import { BackHandler } from 'react-native'

// While locked, the person cannot leave the screen backwards: no swipe on iOS, no system "Back" on Android.
// Used on the registration screens after the account is made: going back to step 1 from there would let the
// person register a second account or find a form that no longer works.
export function useLockedBack(locked: boolean) {
  const navigation = useNavigation()

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !locked })
  }, [navigation, locked])

  useEffect(() => {
    if (!locked) return
    // returning true means the press is handled here: the system does not go back
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true)
    return () => subscription.remove()
  }, [locked])
}
