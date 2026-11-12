# ADR 0007: Testing Library and jsdom for component tests of the admin web

- Status: accepted (approved by the team lead, 12 Nov 2026)
- Scope: `apps/admin-web`

## Context

The admin web (React 18, Vite, Vitest 5) had tests for logic only: the HTTP client, the session, the mappers.
The screens that decide who gets in, `RequireAuth` and `LoginPage`, had none, so a change of the redirect or of
the error messages could break the sign-in unnoticed. Testing a component needs a DOM and a way to render it,
find elements and click them. Adding that is a new library in the stack, a decision of the team lead.

## Decision

- **React Testing Library** (`@testing-library/react`, built on `@testing-library/dom`) renders the components.
  `@testing-library/user-event` types and clicks like a person does, `@testing-library/jest-dom` adds matchers
  such as `toBeInTheDocument`. All four are `devDependencies`: they never reach the production bundle.
- **jsdom** is the DOM for Vitest (`test.environment` in `vite.config.ts`). The logic tests do not care about it.
- Elements are found the way a person finds them: by role, label and text (`getByRole('button', { name: … })`,
  `getByLabelText`), not by class names or component internals.
- The tests replace only the edges of the screen: the session (`src/test/fakeSession.ts`), the mode flag and the
  language switcher. The router (`MemoryRouter`), the translations (react-i18next in English) and the form
  components are the real ones.
- Component tests stay at the level of one screen or one guard. Whole-flow checks in a real browser (Playwright)
  are not part of this decision; they can be added later next to these tests.

## Why this fits the project

- The tests check behaviour, which is what the requirements describe ("a signed-out person is sent to the
  sign-in", "a wrong password shows a message and clears the field"). A refactoring of the markup does not break
  them.
- Texts are checked through the real i18n resources, so a missing translation key fails a test.
- It works with the Vitest we already run in CI; no new runner, one extra setup file.
- It is the tool the React documentation points to for component tests, and the most widely used one, so a new
  team member or a reviewer finds the usual patterns.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Enzyme | No longer maintained, no adapter for React 18; tests the state and the instance of a component, not what the person sees |
| `react-test-renderer` | Deprecated in current React; gives a tree of objects instead of a DOM, so no clicks and no queries by role |
| Playwright / Cypress component tests | Need a real browser, which makes CI slower and heavier; too much for checking a redirect or an error text. Useful later for whole flows |
| Vitest browser mode | Needs a browser runner as well and is younger; jsdom is enough for these screens |
| Rendering with `react-dom` by hand | Means writing our own `act` handling, queries and events, in effect a small copy of Testing Library |

## Consequences

- Five dev packages are added: the three Testing Library packages, `@testing-library/dom` (its required peer
  dependency) and `jsdom`. The admin web CI job `Test` runs the new tests without changes.
- All admin tests now run in jsdom. It is slower to start than plain Node, and tests that rely on Node-only
  behaviour would have to opt out (`// @vitest-environment node`); none does today.
- jsdom does not do layout, so the tests cannot judge the look (blur, spacing). That stays a check against the
  Figma mockups by a person.
- Further screens (verification, diseases) can be covered the same way, with the fake session and a mocked API
  client.
