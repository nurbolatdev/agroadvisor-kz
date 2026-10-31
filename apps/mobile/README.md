# AgroAdvisor KZ — Mobile

Mobile application for farmers and agrochemists. Expo (SDK 58), React Native, TypeScript (strict), Expo Router.

## Features

- Photo diagnosis: crop selection, photo quality check, disease, confidence, chemical and biological treatment
- Farmer community: feed with crop, region and status filters, answers and votes, crop subscriptions
- Regional disease map and outbreak alerts
- Agro-weather with spraying recommendations
- Disease and pest reference
- Farm economics calculator (hectares and sotka)
- Agrochemist consultations and chat
- Nearest agro-shop with route in external navigators (2GIS, Yandex Maps)
- Russian, Kazakh and English interface

## Structure

```
src/
  app/          # Expo Router screens and layouts
  i18n/         # ru.ts (source of keys), kk.ts, en.ts, i18next setup
  store/        # zustand stores (settings: language)
  theme/        # design tokens: colors, spacing, typography, sizes
  lib/          # helpers (storage on MMKV)
assets/images/  # app icon, splash, adaptive icon (from docs/brand)
```

Rules: screens take data only through `src/api` (added in M3); colors, sizes and fonts come from `src/theme/tokens.ts`; every user-facing string goes through i18n in all three languages (a test checks the keys match); tokens are stored in `expo-secure-store`, never in MMKV.

## Run

```bash
cd apps/mobile
npm install
npx expo run:ios       # development build, needs Xcode
npx expo run:android   # development build, needs Android Studio
npm start              # Metro for an installed development build
```

The app uses a development build (`expo-dev-client`), not Expo Go: native modules (MMKV, later maps and push) do not run in Expo Go.

## Checks

```bash
npm run lint
npm run typecheck
npm test
```

## Environment

| Variable | Meaning |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | Backend address (added in M3); on a phone use the laptop IP in the same Wi-Fi |
| `EXPO_PUBLIC_API_MODE` | `mock` to work without the backend (added in M3) |
