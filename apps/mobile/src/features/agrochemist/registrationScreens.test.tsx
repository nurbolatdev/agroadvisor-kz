import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { BackHandler } from 'react-native'

import { ApiError, NetworkError } from '@/api/errors'
import ApplicationSentScreen from '@/app/(auth)/register-sent'
import QualificationScreen from '@/app/(auth)/register-qualification'
import RegisterScreen from '@/app/(auth)/register'
import { initI18n } from '@/i18n'

const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockBack = jest.fn()
const mockChoose = jest.fn()

const mockSetOptions = jest.fn()
let mockFocused = true

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => true,
  }),
  useIsFocused: () => mockFocused,
  useNavigation: () => ({ setOptions: mockSetOptions }),
  Link: ({ children }: { children: unknown }) => children,
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native')
    return <Text>{`redirect to ${href}`}</Text>
  },
}))
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/features/agrochemist/chooseDocument', () => ({
  chooseDocument: (...args: unknown[]) => mockChoose(...args),
}))
jest.mock('@/store/settings', () => ({
  useSettings: (select: (s: object) => unknown) => select({ language: 'en' }),
}))
jest.mock('@/services', () => {
  const { createApplicationStore } = require('@/features/agrochemist/application')
  const deps = {
    register: jest.fn(async () => undefined),
    login: jest.fn(async () => undefined),
    upload: jest.fn(async () => undefined),
    documentCount: jest.fn(async () => 0),
    releaseEntry: jest.fn(),
    language: () => 'en',
  }
  const farmerRegister = jest.fn(async () => undefined)
  return {
    __deps: deps,
    __farmerRegister: farmerRegister,
    useApplication: createApplicationStore(deps),
    useSession: (select: (s: object) => unknown) => select({ register: farmerRegister }),
  }
})

const services = jest.requireMock('@/services') as {
  __deps: {
    register: jest.Mock
    upload: jest.Mock
    releaseEntry: jest.Mock
  }
  __farmerRegister: jest.Mock
  useApplication: typeof import('@/services').useApplication
}

const diploma = {
  file: { uri: 'file:///diploma.pdf', name: 'diploma.pdf', type: 'application/pdf' },
  name: 'diploma.pdf',
  size: 2_516_582, // 2.4 MB
}

beforeAll(() => {
  initI18n('en')
})

beforeEach(() => {
  jest.clearAllMocks()
  mockFocused = true
  services.useApplication.getState().reset()
  mockChoose.mockResolvedValue({ status: 'chosen', document: diploma })
})

async function fillAccount() {
  await fireEvent.changeText(screen.getByLabelText('Full name'), 'Aigul Sarsenova')
  await fireEvent.changeText(screen.getByLabelText('Phone or e-mail'), '+77001112233')
  await fireEvent.changeText(screen.getByLabelText('Password'), 'secret-pass-1')
}

describe('registration, step 1 (frame 03)', () => {
  it('a farmer has one step: the account button and no step line', async () => {
    await render(<RegisterScreen />)

    expect(screen.getByRole('radio', { name: /Farmer/ })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Agrochemist/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create account' })).toBeTruthy()
    expect(screen.queryByText('Step 1 of 2')).toBeNull()
  })

  it('a farmer registers right away with the role farmer', async () => {
    await render(<RegisterScreen />)
    await fillAccount()

    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(services.__farmerRegister).toHaveBeenCalledTimes(1))
    expect(services.__farmerRegister.mock.calls[0][0]).toMatchObject({
      role: 'farmer',
      login: '+77001112233',
    })
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('an agrochemist sees two steps and goes on to step 2 without registering', async () => {
    await render(<RegisterScreen />)
    await fireEvent.press(screen.getByRole('radio', { name: /Agrochemist/ }))
    expect(screen.getByText('Step 1 of 2')).toBeTruthy()
    await fillAccount()

    await fireEvent.press(screen.getByRole('button', { name: 'Next' }))

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/register-qualification'))
    expect(services.__farmerRegister).not.toHaveBeenCalled()
    expect(services.__deps.register).not.toHaveBeenCalled()
    expect(services.useApplication.getState().account).toEqual({
      fullName: 'Aigul Sarsenova',
      login: '+77001112233',
      password: 'secret-pass-1',
    })
  })

  it('coming back with a taken login shows it under the login field, keeps the rest and forgets the failure', async () => {
    const store = services.useApplication.getState()
    store.setAccount({ fullName: 'Aigul', login: '+77001112233', password: 'secret-pass-1' })
    // what step 2 leaves when the server says the login is taken
    services.useApplication.setState({
      failure: { stage: 'register', error: new ApiError(409, 'login_taken', 'taken') },
    })

    await render(<RegisterScreen />)

    expect(await screen.findByText('This phone or e-mail is already taken')).toBeTruthy()
    expect(screen.getByLabelText('Phone or e-mail').props.value).toBe('+77001112233')
    expect(
      screen.getByRole('radio', { name: /Agrochemist/ }).props.accessibilityState.checked,
    ).toBe(true)
    expect(services.useApplication.getState().failure).toBeNull()
  })

  it('does not go on with an empty form', async () => {
    await render(<RegisterScreen />)
    await fireEvent.press(screen.getByRole('radio', { name: /Agrochemist/ }))

    await fireEvent.press(screen.getByRole('button', { name: 'Next' }))

    await waitFor(() => expect(screen.getAllByText('Fill in this field').length).toBeGreaterThan(0))
    expect(mockPush).not.toHaveBeenCalled()
  })
})

describe('registration, step 2 (frame 03a)', () => {
  function withAccount() {
    services.useApplication
      .getState()
      .setAccount({ fullName: 'Aigul', login: '+77001112233', password: 'secret-pass-1' })
  }

  async function chooseDocumentOnScreen() {
    await fireEvent.press(screen.getByRole('button', { name: 'Upload a document' }))
    await fireEvent.press(await screen.findByRole('button', { name: 'Choose a PDF' }))
    await screen.findByText('diploma.pdf')
  }

  it('a taken login takes the person back to step 1 and no document is sent', async () => {
    withAccount()
    services.__deps.register.mockRejectedValueOnce(new ApiError(409, 'login_taken', 'taken'))
    await render(<QualificationScreen />)
    await fireEvent.press(screen.getByRole('button', { name: 'Agrochemistry' }))
    await fireEvent.changeText(screen.getByLabelText('Years of experience'), '3')
    await chooseDocumentOnScreen()
    await fireEvent.press(screen.getByRole('checkbox'))

    await fireEvent.press(screen.getByRole('button', { name: 'Send for review' }))

    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1))
    expect(services.__deps.upload).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('a failure that is not about step 1 keeps the person here', async () => {
    withAccount()
    services.__deps.register.mockRejectedValueOnce(new NetworkError())
    await render(<QualificationScreen />)
    await fireEvent.press(screen.getByRole('button', { name: 'Agrochemistry' }))
    await fireEvent.changeText(screen.getByLabelText('Years of experience'), '3')
    await chooseDocumentOnScreen()
    await fireEvent.press(screen.getByRole('checkbox'))

    await fireEvent.press(screen.getByRole('button', { name: 'Send for review' }))

    expect(await screen.findByText(/No connection to the server/)).toBeTruthy()
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('without step 1 goes back to it', async () => {
    await render(<QualificationScreen />)

    expect(screen.getByText('redirect to /register')).toBeTruthy()
  })

  it('shows step 2 of 2 and the four specializations', async () => {
    withAccount()
    await render(<QualificationScreen />)

    expect(screen.getByText('Step 2 of 2')).toBeTruthy()
    for (const name of ['Plant protection', 'Agrochemistry', 'Phytopathology', 'Soil science']) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
  })

  it('does not send without a specialization, the years, a document and the agreement', async () => {
    withAccount()
    await render(<QualificationScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'Send for review' }))

    expect(await screen.findByText('Choose at least one specialization')).toBeTruthy()
    expect(screen.getByText('Enter experience from 0 to 80 years')).toBeTruthy()
    expect(screen.getByText('Upload a diploma or certificate')).toBeTruthy()
    expect(screen.getByText('Confirm your agreement')).toBeTruthy()
    expect(services.__deps.register).not.toHaveBeenCalled()
  })

  it('refuses experience over 80', async () => {
    withAccount()
    await render(<QualificationScreen />)
    await fireEvent.press(screen.getByRole('button', { name: 'Agrochemistry' }))
    await fireEvent.changeText(screen.getByLabelText('Years of experience'), '81')
    await chooseDocumentOnScreen()
    await fireEvent.press(screen.getByRole('checkbox'))

    await fireEvent.press(screen.getByRole('button', { name: 'Send for review' }))

    expect(await screen.findByText('Enter experience from 0 to 80 years')).toBeTruthy()
    expect(services.__deps.register).not.toHaveBeenCalled()
  })

  it('shows the chosen file with its size and lets the person remove it', async () => {
    withAccount()
    await render(<QualificationScreen />)

    await chooseDocumentOnScreen()

    expect(screen.getByText('2.4 MB · uploaded')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Remove the document' }))
    expect(screen.queryByText('diploma.pdf')).toBeNull()
  })

  it('tells why a file was refused', async () => {
    withAccount()
    mockChoose.mockResolvedValue({ status: 'refused', problem: 'too_large' })
    await render(<QualificationScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'Upload a document' }))
    await fireEvent.press(await screen.findByRole('button', { name: 'Choose a PDF' }))

    expect(await screen.findByText(/larger than 10 MB/)).toBeTruthy()
  })

  it('sends the application: the account once, then the document, then the sent screen', async () => {
    withAccount()
    await render(<QualificationScreen />)
    await fireEvent.press(screen.getByRole('button', { name: 'Plant protection' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Agrochemistry' }))
    await fireEvent.changeText(screen.getByLabelText('Years of experience'), '12')
    await chooseDocumentOnScreen()
    await fireEvent.press(screen.getByRole('checkbox'))

    await fireEvent.press(screen.getByRole('button', { name: 'Send for review' }))

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/register-sent'))
    expect(services.__deps.register).toHaveBeenCalledTimes(1)
    expect(services.__deps.register.mock.calls[0][0]).toMatchObject({
      role: 'agrochemist',
      specializations: ['plant_protection', 'agrochemistry'],
      experienceYears: 12,
    })
    expect(services.__deps.upload).toHaveBeenCalledWith(diploma.file, { kind: 'diploma' })
  })

  it('after a failed send says the account exists and sends only the document again', async () => {
    withAccount()
    services.__deps.upload.mockRejectedValueOnce(new Error('boom'))
    await render(<QualificationScreen />)
    await fireEvent.press(screen.getByRole('button', { name: 'Agrochemistry' }))
    await fireEvent.changeText(screen.getByLabelText('Years of experience'), '3')
    await chooseDocumentOnScreen()
    await fireEvent.press(screen.getByRole('checkbox'))

    await fireEvent.press(screen.getByRole('button', { name: 'Send for review' }))
    expect(await screen.findByText(/Your account is created/)).toBeTruthy()
    expect(mockReplace).not.toHaveBeenCalled()

    await fireEvent.press(screen.getByRole('button', { name: 'Send for review' }))

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/register-sent'))
    expect(services.__deps.register).toHaveBeenCalledTimes(1)
    expect(services.__deps.upload).toHaveBeenCalledTimes(2)
  })
})

describe('no way back once the account exists', () => {
  const entered = {
    qualification: { specializations: ['agrochemistry' as const], experienceYears: 7 },
    document: {
      file: { uri: 'file:///d.pdf', name: 'd.pdf', type: 'application/pdf' },
      meta: { kind: 'diploma' as const },
    },
    account: { fullName: 'Aigul', login: '+77001112233', password: '' },
  }

  function backHandlers() {
    const handlers: (() => boolean)[] = []
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      handlers.push(handler as () => boolean)
      return { remove: jest.fn() }
    })
    return handlers
  }

  it('step 2 locks the swipe and the system Back and draws no arrow', async () => {
    const handlers = backHandlers()
    services.useApplication.setState({ ...entered, phase: 'registered' })

    await render(<QualificationScreen />)

    expect(mockSetOptions).toHaveBeenLastCalledWith({ gestureEnabled: false })
    expect(handlers).toHaveLength(1)
    expect(handlers[0]()).toBe(true) // the press is handled: the system does not go back
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('step 2 before the account exists can still be left', async () => {
    const handlers = backHandlers()
    services.useApplication.getState().setAccount(entered.account)

    await render(<QualificationScreen />)

    expect(mockSetOptions).toHaveBeenLastCalledWith({ gestureEnabled: true })
    expect(handlers).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy()
  })

  it('step 2 opened again after the account was made shows what was entered', async () => {
    services.useApplication.setState({ ...entered, phase: 'registered' })

    await render(<QualificationScreen />)

    expect(screen.getByLabelText('Years of experience').props.value).toBe('7')
    expect(
      screen.getByRole('button', { name: 'Agrochemistry' }).props.accessibilityState.selected,
    ).toBe(true)
    expect(screen.getByText('d.pdf')).toBeTruthy()
    expect(screen.getByRole('checkbox').props.accessibilityState.checked).toBe(true)
  })

  it('step 1 leads on to step 2 instead of letting the person register a second account', async () => {
    services.useApplication.setState({ ...entered, phase: 'registered' })

    await render(<RegisterScreen />)

    expect(screen.getByText('redirect to /register-qualification')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Create account' })).toBeNull()
    expect(services.__farmerRegister).not.toHaveBeenCalled()
  })

  it('step 1 leads on to the sent screen when the application is sent', async () => {
    services.useApplication.setState({ ...entered, phase: 'sent' })

    await render(<RegisterScreen />)

    expect(screen.getByText('redirect to /register-sent')).toBeTruthy()
  })

  it('the sent screen locks the swipe and the system Back', async () => {
    const handlers = backHandlers()

    await render(<ApplicationSentScreen />)

    expect(mockSetOptions).toHaveBeenLastCalledWith({ gestureEnabled: false })
    expect(handlers[0]()).toBe(true)
  })
})

describe('the refusal of step 1 found on step 2', () => {
  const refused = {
    failure: { stage: 'register' as const, error: new ApiError(409, 'login_taken', 'taken') },
    account: { fullName: 'Aigul', login: '+77001112233', password: 'secret-pass-1' },
  }

  it('step 1 under step 2 leaves the failure alone: step 2 is still using it', async () => {
    services.useApplication.setState(refused)
    mockFocused = false

    await render(<RegisterScreen />)

    expect(screen.queryByText('This phone or e-mail is already taken')).toBeNull()
    expect(services.useApplication.getState().failure).not.toBeNull()
  })

  it('step 1 shows it as soon as it is the screen on top, and then forgets it', async () => {
    services.useApplication.setState(refused)
    mockFocused = false
    const view = await render(<RegisterScreen />)

    mockFocused = true
    await view.rerender(<RegisterScreen />)

    expect(await screen.findByText('This phone or e-mail is already taken')).toBeTruthy()
    expect(services.useApplication.getState().failure).toBeNull()
  })

  it('step 2 takes the person back by the outcome, whoever else watches the store', async () => {
    services.useApplication.getState().setAccount(refused.account)
    services.__deps.register.mockRejectedValueOnce(new ApiError(409, 'login_taken', 'taken'))
    // a screen under step 2 that takes the failure the moment it is set, as step 1 once did
    const stop = services.useApplication.subscribe((state) => {
      if (state.failure) services.useApplication.getState().clearFailure()
    })
    await render(<QualificationScreen />)
    await fireEvent.press(screen.getByRole('button', { name: 'Agrochemistry' }))
    await fireEvent.changeText(screen.getByLabelText('Years of experience'), '3')
    fireEvent.press(screen.getByRole('button', { name: 'Upload a document' }))
    await fireEvent.press(await screen.findByRole('button', { name: 'Choose a PDF' }))
    await screen.findByText('diploma.pdf')
    await fireEvent.press(screen.getByRole('checkbox'))

    await fireEvent.press(screen.getByRole('button', { name: 'Send for review' }))

    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1))
    stop()
  })
})

describe('application sent (frame 03b)', () => {
  it('tells what happens next and opens the app on the button', async () => {
    await render(<ApplicationSentScreen />)

    expect(screen.getByText('Application sent')).toBeTruthy()
    expect(screen.getByText('Farmers cannot see your profile yet')).toBeTruthy()

    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Open the app' }))
    })

    expect(services.__deps.releaseEntry).toHaveBeenCalledTimes(1)
  })
})
