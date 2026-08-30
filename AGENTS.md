# DSH Desktop repository rules

This repository owns the desktop product around an unmodified DeepSeek Harness checkout.

## Prerequisites and setup

- Use Node.js `^22.19.0` or `>=24.0.0` and the root Yarn `4.18.0` release through Corepack.
- Initialize the pinned upstream checkout with `git submodule update --init --recursive`.
- Install root dependencies with `corepack yarn install --immutable`.

## Build, run, and verify

- Start the desktop development workflow with `corepack yarn dev`.
- Build the desktop package with `corepack yarn build`.
- Run unit tests with `corepack yarn test`.
- Run type checking with `corepack yarn typecheck`.
- Run the complete headless gate with `corepack yarn check`.
- Run upstream operations through the root scripts, such as `corepack yarn upstream:build`.

- `deepseek-harness/` is a pinned upstream Git submodule. Never edit files inside it from a desktop feature branch.
- `dsh-plugin-desktop/` owns the Cordis Host and Client faces, Electron bootstrap, packaging, and release tests.
- `dsh-community-fabric/` owns the community interoperability RFC. Until schemas and a reviewed reference adapter exist, it remains a private documentation scaffold and must not declare loadable DSH or package entry points.
- `dsh-community-market/` owns the implemented community-market Host/Client runtime, public catalog contracts, reviewed provider adapters, installation boundary, and release tests. Keep its loadable DSH/package entry points and generated contract surface aligned with the Desktop composition.
- The outer repository and all owned packages use the root Yarn release with `nodeLinker: node-modules`.
- The upstream submodule keeps its own pnpm workspace. Run upstream commands through the root `upstream:*` scripts, whose Yarn portable-shell commands enter the submodule before invoking Corepack.
- Compatibility mode must run the upstream default client without overrides. Advanced presentation belongs to desktop-owned client plugins and may replace documented slots or services through profile composition.
- Keep graphical application launch explicit. Builds, typechecks, unit tests, and Loader smokes must remain headless-safe.
- Commit before major changes of direction and keep the submodule pin update separate from desktop behavior changes.
- Keep the repository topology and package-manager split consistent with the [owning Agent Note](.agents/notes/implemented/process/2026-08-15-pinned-upstream-and-isolated-yarn-workspace.md).

## Authoritative upstream repositories and update discipline

The desktop product must track these three repositories explicitly; do not
silently substitute a fork, stale package, or hand-written replacement:

- Official Harness runtime: `https://github.com/deepseek-ai/deepseek-harness` —
  pinned by the `deepseek-harness/` submodule and its published
  `@deepseek-ai/dsh-*` family.
- Maintained sidebar/workbench: `https://github.com/omdsh-dev/DSH-better-sidebar` —
  product dependency `dsh-better-sidebar`, with only audited Yarn patches.
- Desktop reference implementation: `https://github.com/anywhere-labs/deepseek-harness-desktop` —
  read-only comparison source for Electron bootstrap, packaging, and release
  behavior; it is not a runtime dependency of this fork.

Before every upstream, dependency, sidebar, or release change:

1. Check the three remotes and package registries (`git ls-remote`, GitHub
   tags/heads, and `npm view`) and record the result in
   `docs/upstream-sync.md`.
2. Update the submodule pin, published package family, sidebar patch baseline,
   and desktop comparison commit together only when compatibility is proven.
   Keep the submodule pin update in its own commit.
3. Run `corepack yarn install --immutable`, typecheck, the focused regression
   suite, `corepack yarn check`, and the packaged smoke before tagging.
4. If upstream is newer but incompatible, do not silently keep the old pin:
   record the incompatibility, affected contracts, and the next migration
   step in the sync ledger and release notes.

The current audit snapshot and exact commands are maintained in
[`docs/upstream-sync.md`](docs/upstream-sync.md).

## Community Market live-source release discipline

Fixture tests are necessary but are not sufficient evidence for changes that
affect `dsh-community-market/`, a reviewed built-in catalog adapter, or the
restricted catalog HTTP client. Before merging or tagging such a change:

1. Replay every compiled-in reviewed source through the production restricted
   client. Record the exact endpoint and representation, HTTP/content encoding,
   provider total, normalized total, elapsed time, and configured size/item
   headroom in `docs/upstream-sync.md` or the versioned release record.
2. Grant gzip, larger response limits, synthetic-proxy hostname exceptions, or
   other relaxed transport policy only to an exact compiled-in reviewed client.
   User-added and standard sources must never inherit those exceptions.
3. Validate the exact representation the adapter consumes. Never combine or
   trust totals, revisions, timestamps, or cursors observed through a different
   endpoint, User-Agent, encoding variant, or provider view; a full catalog
   representation must prove its own identity and completeness atomically.
4. Treat a live catalog that exceeds an item, page, compressed-body,
   decoded-body, schema, or timeout bound as a release blocker. Do not silently
   raise a limit, publish a partial list, or fall back to another saved source;
   document the incompatibility, review the new bound and trust impact, add a
   regression test, and then repeat the live-source replay.

## Product README ownership

- Root `README.md`, `README.en.md`, and `README.i18n.yaml` belong exclusively
  to `https://github.com/rw0104/DSH-desktop` and describe this fork's product,
  downloads, releases, screenshots, features, and repository links.
- Never copy, restore, merge, or overwrite the root README files from
  `deepseek-ai/deepseek-harness`, `omdsh-dev/DSH-better-sidebar`,
  `anywhere-labs/deepseek-harness-desktop`, or any other upstream repository.
- Upstream README content may be used only as a cited reference while manually
  editing this product's own documentation; retain `rw0104/DSH-desktop`
  identity and links.
- During upstream synchronization, treat any root README diff that replaces
  this product's identity or points primary download/repository links at an
  upstream project as a release blocker. Do not resolve it by accepting the
  upstream side.

## Documentation publication boundary

- Public repository documentation is limited to product-facing or durable
  project records: `docs/releases/`, `docs/user-guide*`, `docs/architecture*`,
  `docs/plugin-*`, `docs/faq*`, `docs/why-desktop*`, `docs/README*`,
  `docs/PRODUCT.md`, `docs/upstream-sync.md`, and explicitly reviewed durable
  Agent Notes under `.agents/notes/`.
- Local-only development material includes scratch analysis, implementation
  plans, development diaries, command transcripts, one-off investigation
  reports, local screenshots, diagnostic summaries, and unpublished release
  working notes. Store new files of this kind under `docs/local/`.
- Never force-add files under `docs/local/`, attach them to a GitHub Release,
  or link to them from public documentation. Promote useful conclusions by
  rewriting them into an appropriate public document after explicit review;
  do not publish the local working file itself.
- Legacy date-prefixed development documents at the root of `docs/` are also
  local-only and remain ignored for compatibility with existing local links.
- Existing tracked release evidence under `docs/evidence/` may remain public;
  new local screenshots and diagnostic captures belong under
  `docs/local/evidence/` unless explicitly reviewed as durable release proof.
- A GitHub Release may contain only verified versioned deliverables and
  explicitly required release metadata. Local development documents are not
  release artifacts.

## Packaging cache and artifact hygiene

- Reuse the machine-level Electron cache (`%LOCALAPPDATA%\electron\Cache` on
  Windows); do not download or copy Electron archives into the repository.
- Do not accumulate repeated `win-unpacked`, isolated `DSH_HOME`, user-data,
  profile `node_modules`, or installer copies under the repository. Temporary
  copies must be clearly named, excluded from commits/releases, and reported
  for cleanup after the release succeeds.
- A GitHub Release uploads only the verified versioned installer (and other
  explicitly required release artifacts), never unpacked directories, caches,
  diagnostic profiles, or `.tmp-*` trees.
