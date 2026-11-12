# AgroAdvisor KZ — Mobile

Mobile application for farmers and agrochemists. Expo (SDK 58), React Native, TypeScript (strict), Expo Router.

## Features

Done (screens in `src/app`, logic in `src/features`):

- Sign-in and registration of a farmer, refresh with rotation, language choice on first launch
- Photo diagnosis: crop selection, camera and gallery, photo quality check, upload queue, result with the
  statuses of `/predict`, top-3, treatment plan
- Diagnosis history
- Disease reference (list and card)
- Profile and language settings
- Agrochemist: registration with a diploma or certificate, verification status, documents, requests tab
- Russian, Kazakh and English interface

Planned (stage 2, not started):

- Farmer community: feed with crop, region and status filters, answers and votes, crop subscriptions
- Regional disease map and outbreak alerts
- Agro-weather with spraying recommendations
- Farm economics calculator (hectares and sotka)
- Agrochemist consultations and chat
- Nearest agro-shop with route in external navigators (2GIS, Yandex Maps)

## Structure

```
src/
  app/          # Expo Router screens and layouts: (onboarding), (auth), (app) with tabs
  api/          # HTTP client, types from the OpenAPI schema, calls per area, mock mode
  components/   # ui kit (Button, Input, GlassCard, Chip, Badge, ...) and navigation
  features/     # access (roles, feature access), auth, diagnosis, history, diseases, catalog,
                #   agrochemist, profile, home, language
  i18n/         # ru.ts (source of keys), kk.ts, en.ts, i18next setup
  store/        # zustand stores: session, diagnosis, history, profile, verification, settings
  theme/        # design tokens: colors, spacing, typography, sizes
  lib/          # helpers: storage on MMKV, token storage, JWT, route guards
assets/images/  # app icon, splash, adaptive icon (from docs/brand)
```

Rules: screens take data only through `src/api`; colors, sizes and fonts come from `src/theme/tokens.ts`; every user-facing string goes through i18n in all three languages (a test checks the keys match); tokens are stored in `expo-secure-store`, never in MMKV.

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
npm run format:check
npm run typecheck
npm test
```

## Environment

| Variable               | Meaning                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `EXPO_PUBLIC_API_URL`  | Backend address, default `http://localhost:8080`; on a phone use the laptop IP in the same Wi-Fi |
| `EXPO_PUBLIC_API_MODE` | `mock` to work without the backend; anything else (default) is `live`                            |

Copy `.env.example` to `.env` and adjust it; `.env` is not in git.
