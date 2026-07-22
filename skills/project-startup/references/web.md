# Web / Frontend Project Notes

Short reference for the tech-selection decisions that matter most on a web project and are easy to get wrong silently. Consult this during Stage 0 / Stage 1 of `SKILL.md` before locking in choices.

## TypeScript strictness

Use TypeScript, not plain JavaScript — strong typing is the baseline principle. And turn the strictness all the way up from the start; loosening later is easy, tightening later is painful because existing code won't compile.

In `tsconfig.json`:

- `"strict": true` — enables the full strict family (`noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, etc.). Non-negotiable.
- Ban `any`: configure `@typescript-eslint` with `no-explicit-any` as an error. `any` silently disables the type system's main benefit.
- Forbid `// @ts-ignore` and `// @ts-expect-error`: they mute real type errors. If a suppression is genuinely unavoidable, require an inline `eslint-disable-next-line` with a written justification — never a bare ignore. The friction is the feature: it makes "fix the type" the path of least resistance.

The point of all this is that the type system only helps if it's actually catching things. A `strict: false` TS config gives you the complexity of types with almost none of the safety.

## Component library — don't write raw HTML

Do **not** hand-roll raw HTML elements for a real application unless the user explicitly asks for it. Pick a component library. Writing `<div>`s and styling them by hand for buttons, modals, dropdowns, tables, date pickers etc. burns enormous time, produces inconsistent a11y, and is unmaintainable as a team scales.

Confirm the library with the user (it's a consequential, hard-to-reverse choice), but the default is "use one". Common picks:

- React: Ant Design, MUI (Material UI), shadcn/ui, Chakra UI, Mantine.
- Vue: Element Plus, Ant Design Vue, Vuetify, Naive UI.

Let the library drive a lot of the surrounding decisions (theming, form handling, date utils) rather than fighting it.

## CSS strategy — don't write raw CSS

Same principle as components: don't write raw global CSS unless the user explicitly asks. Global CSS doesn't scale — specificity wars, dead styles, name collisions. Pick a strategy that scopes styles:

- **CSS-in-JS**: styled-components, Emotion, vanilla-extract (the latter is zero-runtime and currently favored for perf).
- **CSS Modules**: built into most bundlers, scoped by default, low magic.
- **Utility-first**: Tailwind CSS (the dominant choice). Pairs especially well with headless component libraries like shadcn/ui.
- **Component-library-provided**: if you picked Ant/MUI/etc., lean on their theming and styling APIs first before adding a parallel system.

Pick one and use it consistently. Mixing three styling systems in one codebase is a common, expensive mess.

## Package manager & repo layout

Two related decisions:

### Package manager
- **pnpm** is the current strong default for new projects — fast, disk-efficient (symlinked store), strict about phantom deps, first-class monorepo support.
- **yarn** (especially yarn classic) is legacy; yarn berry (v2+) is capable but less commonly the default now.
- **npm** is fine for a simple single-package project; its workspaces support is adequate.
- Don't mix managers in one repo. Pick one and commit its lockfile.

### Monorepo vs single repo
- **Single repo** if the project is genuinely one deployable thing. Simpler tooling, simpler mental model. Don't monorepo "just in case".
- **Monorepo** if there are clearly multiple packages that share code and release together (e.g. a library + its CLI + its docs site, or several services sharing a core). Use proper monorepo tooling — pnpm workspaces, Turborepo, or Nx — not ad-hoc path aliases.
- The decision is hard to reverse cheaply, so make it deliberately. When in doubt, start single-repo; extracting into a monorepo later is easier than collapsing one.

## Build tool / framework

For a new web app, the current defaults worth raising with the user:

- **Meta-framework**: Next.js (React), Nuxt (Vue), SvelteKit (Svelte), Astro (content/static). These bundle routing, SSR, build tooling, and deployment conventions. Strongly prefer a meta-framework over assembling Vite + react-router + your-own-SSR by hand unless there's a specific reason.
- **Build tool** (for non-meta-framework work or libraries): Vite is the default. Webpack is legacy; esbuild/rollup directly is for library builds.

Confirm with the user — this is a consequential choice driven by deployment target and team familiarity, not something to default silently.

## Internationalization (i18n)

Decide up front whether the app needs to ship in more than one language — even if "not yet, but maybe later" — because retrofitting i18n into a codebase full of hardcoded user-facing strings is slow, error-prone, and inevitably misses strings. Wiring in the i18n plumbing from day one is cheap; the cost is just routing every user-facing string through a `t()` call instead of inlining it.

Ask the user:

- **How many locales, now and realistically later?** Even a single-locale app benefits from the i18n abstraction if a second locale is plausible — it forces you to externalize strings and keeps the door open.
- **Translation workflow**: who produces translations? In-house devs, a translation team, a service (Lokalise, Crowdin, Phrase)? This affects whether you need extraction tooling and a translation-management integration.
- **RTL support?** If Arabic / Hebrew etc. are in scope, RTL must be designed in from the start — it affects layout, icons, and component-library support, not just text direction.

Library selection (pick the standard for the framework — don't roll your own message catalog):

- React: **react-i18next** (i18next) is the dominant choice; **FormatJS / react-intl** is the alternative (ICU MessageFormat, good for pluralization/gender). Next.js: use `next-intl` or the app-router-native `next-international`.
- Vue: **vue-i18n** (the official choice).
- Svelte: **svelte-i18n** or Paraglide.
- Prefer libraries built on **ICU MessageFormat** when pluralization, gender, or complex interpolation matter — homegrown string templates break on plurals ("1 items").

Practical baseline to set during scaffolding:

- All user-facing strings go through `t('key')`, never inlined. Lint for this if a rule exists.
- Locale detection: browser `Accept-Language`, URL prefix (`/en/...`, `/zh/...`), or a cookie — pick one strategy and be consistent. URL-prefix is best for SEO and shareable links.
- Default to a single source-of-truth locale file format (JSON or the library's native format) and keep keys namespaced by feature so catalogs stay navigable.
- Set the `<html lang>` attribute and route-level locale metadata so SSR and SEO are correct.
- Confirm the chosen component library has locale support for its own strings (date pickers, pagination, empty states) — Ant Design, MUI, Element Plus etc. all ship locale packs; wire them in alongside your app's locale.
