# Contributing

Thanks for helping improve Retro Squash.

## Getting started

```bash
npm install
npm run dev     # play at http://localhost:5173
npm test        # must pass before you open a pull request
```

Read `docs/ARCHITECTURE.md` first: the pure core (physics, rules, entities,
match) must stay free of browser APIs so it keeps running in Node.

## Making changes

- **Physics or balance**: follow the workflow in `docs/DEVELOPMENT.md`
  (simulate → play-match → tests → play). Update the tables in
  `docs/PHYSICS.md` / `docs/AI.md` if numbers change.
- **Rules**: cite the World Squash rule number in the commit message and add a
  case to `tests/referee.test.js`.
- **Rendering**: keep both renderers working; the classic one is the fallback.
- **UI text**: add every new string to both `en` and `he` in `src/ui/i18n.js`.
- Keep the `@module` header and JSDoc (with units) up to date.

## Commits and pull requests

- One topic per commit; present-tense summary line under 72 characters.
- Add a line to `CHANGELOG.md` under *Unreleased*.
- Describe how you tested (which difficulty, desktop/touch, renderer).

## Reporting bugs

Include the browser and device, the renderer (`squash.rendererKind` in the
console), what you expected and, if it is a rules call, the message shown
when the rally ended.
