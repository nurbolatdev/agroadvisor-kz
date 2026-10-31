import type { Translation } from './ru'

export const en: Translation = {
  app: {
    name: 'AgroAdvisor KZ',
    tagline: 'Plant disease diagnosis and agronomy advice',
  },
  language: {
    title: 'Language',
    ru: 'Русский',
    kk: 'Қазақша',
    en: 'English',
  },
  auth: {
    loginTitle: 'Sign in',
    registerTitle: 'Sign up',
    login: 'Phone or e-mail',
    password: 'Password',
    fullName: 'Full name',
    signIn: 'Sign in',
    signUp: 'Create account',
    noAccount: 'No account? Sign up',
    haveAccount: 'Already have an account? Sign in',
    signOut: 'Sign out',
    errors: {
      required: 'Fill in this field',
      passwordShort: 'At least 8 characters',
      passwordLong: 'The password is too long',
      blocked: 'The account is blocked. Contact support',
      invalidCredentials: 'Wrong phone, e-mail or password',
      loginTaken: 'This phone or e-mail is already taken',
      invalidLogin: 'Enter a phone number or an e-mail',
      network: 'No connection to the server. Check the internet and try again',
      generic: 'Something went wrong. Try again later',
    },
  },
  common: {
    empty: 'Nothing here yet',
    error: 'Something went wrong',
    retry: 'Try again',
  },
  home: {
    title: 'Home',
    scaffoldReady: 'The app scaffold is ready',
  },
}
