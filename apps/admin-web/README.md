# AgroAdvisor KZ — Admin Web

Web admin panel for platform administrators.

## Features

- Dashboard with usage and diagnosis analytics
- Community post moderation
- Agrochemist verification by uploaded diploma or certificate
- Disease and pest reference management
- User management

## Stack

React, TypeScript, Vite, React Router, Tailwind CSS.

## Structure

```
src/
├── app/          # Entry point, root component, router
├── layouts/      # Main layout, navbar, footer
├── components/
│   └── ui/       # Reusable UI components
├── features/     # Feature modules: dashboard, moderation, agrochemists, diseases, users
├── pages/        # Shared pages (404)
├── services/     # API client
├── mocks/        # Mock data for local development
├── shared/       # Types, constants, hooks, utils
├── i18n/         # Translations: ru, kk, en
└── styles/       # Global styles and design tokens
```
