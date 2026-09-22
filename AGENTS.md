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
- The normal desktop experience must provide the same product capabilities with system or native window appearance. Legacy `compatibility`/`advanced` values are migration inputs, not feature tiers. The explicit upstream diagnostic experience runs the upstream default client without desktop or third-party UI overrides; its startup must not consume normal Profile selections or installation recovery transactions. Desktop presentation remains owned by client plugins through documented slots or services.
- Keep graphical application launch explicit. Builds, typechecks, unit tests, and Loader smokes must remain headless-safe.
- Commit before major changes of direction and keep the submodule pin update separate from desktop behavior changes.
- Keep the repository topology and package-manager split consistent with the [owning Agent Note](.agents/notes/implemented/process/2026-08-15-pinned-upstream-and-isolated-yarn-workspace.md).

## Installed application and user-data isolation

- Treat the installed application, its updater/download directories, the real
  Harness home (normally `%USERPROFILE%\.dsh`), and Electron user-data (normally
  `%APPDATA%\DSH Desktop`) as protected. Identify custom paths from the actual
  installation and launch configuration; never assume the defaults are the only
  protected locations. Development, build, test, and cleanup authorization does
  not authorize installation, repair, migration, plugin operations, or writes in
  these protected locations. Read-only diagnosis is allowed; writing requires
  an explicit user request covering the particular installed application/data.
- Before changing runtime code/dependencies, running development or test
  applications, or cleaning build/dependency trees, audit the real Profile's
  dependency links with `corepack yarn check:runtime-boundary` (pass `--home`
  for a custom Harness home). This is a read-only audit, separate from isolated
  test execution. A Profile link into this checkout, another development
  checkout, or disposable staging makes that location part of the installed
  runtime: changing it can break the installed application without changing its
  EXE or ASAR. Do not proceed with mutations affecting a detected target until
  that coupling is removed under an authorized recovery plan. Metadata-only
  investigation and rule/documentation changes may continue.
- Establish absolute, disposable `DSH_HOME`, `TEMP`, `TMP`, and `TMPDIR` before
  importing or invoking any boot/Profile/session/plugin code, including one-off
  Node commands. Use `scripts/run-isolated-check.mjs` for tests and smokes.
  Graphical probes additionally require a unique `--user-data-dir`, an isolated
  working directory, and an explicit launch. Never use plain `yarn dev`,
  `yarn start`, CLI/Profile initialization, or package-manager operations with
  an unset/default real home as a development probe. A temporary workspace or
  working directory alone does not isolate session storage.
- Never create symlinks, junctions, hard links, fallback package projections,
  or configuration references from protected installed/user-data locations into
  a checkout or temporary test package. Before writing/copying/deleting paths,
  verify canonical destinations and link ancestry; do not mutate shared hard
  link contents. Cleanup must unlink owned links without traversing their
  targets. Never recursively clean the real Profile's `node_modules`, sessions,
  settings, credentials, or recovery state as a test cleanup operation.
- For an explicitly authorized installed-runtime repair, first record versions,
  hashes, link targets, and a reviewed before/after plan with rollback metadata.
  Preserve user plugins, credentials, settings, and session originals. A newer
  test package must not be installed as an unrequested repair. Quarantine only
  confirmed test records under a separately authorized plan; do not delete or
  rewrite unknown user sessions to silence compatibility errors.
- Report installed-file integrity and user-data/dependency isolation as separate
  findings. "No installer was run" and unchanged EXE/ASAR timestamps do not
  prove that the installed runtime or user data were unaffected. Historical
  cross-links remain a risk after new tests adopt an isolated runner.

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
- Run `corepack yarn check:docs` before committing or publishing. The indexed
  path check also rejects force-added local notes and generated dependency or
  packaging trees. CI must run this check even for documentation-only changes.
- Removing a document from the current tree does not erase older Git commits,
  tags, remote branches, or previously published assets. Report historical
  exposure explicitly; do not rewrite shared history as routine cleanup.

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
- After a verified package is delivered, run `corepack yarn clean:local` to
  review cleanup and `corepack yarn clean:local -Apply` to keep one newest local
  installer and remove older artifacts/staging. Use `-AllArtifacts` only when
  the user requests all test packages removed. Do not prune the last verified
  installer while a replacement is still unverified.
- Keep Yarn's shared cache and the machine-level Electron cache reusable. Do
  not create per-product-version download caches, wipe active node_modules on
  every release, or treat different workspace dependency versions as duplicates.
- Standard tests and Host smokes must use `scripts/run-isolated-check.mjs` so
  `TEMP`, `TMP`, `TMPDIR`, and `DSH_HOME` belong to one disposable run. Normal
  success/failure must clean that root. Interrupted runs may be reviewed with
  `clean:local -IncludeLegacyTemp`; never follow directory links into installed
  dependencies or touch the user's real Harness home during cleanup.
