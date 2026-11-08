// The Hermes engine of the phones has no Intl.PluralRules, which i18next uses to pick the plural form of a
// text (`count`). Without it every number but 1 would take the "other" form (Russian would say "12 года").
// The polyfill is added only when the engine lacks the API, with the data of the three languages of the app.
// (The package lists its files with the extension in `exports`, so the paths end in .js.)
import '@formatjs/intl-pluralrules/polyfill.js'
import '@formatjs/intl-pluralrules/locale-data/ru.js'
import '@formatjs/intl-pluralrules/locale-data/kk.js'
import '@formatjs/intl-pluralrules/locale-data/en.js'
