# Contributing

Thank you for wanting to contribute to DSH Desktop. This is a community project — whether you are a regular user, a plugin author, or a developer, there is a way to contribute that fits you.

## Regular users: use, report, and spread the word

- Report problems or odd behavior in an [issue](https://github.com/rw0104/DSH-desktop/issues): include your operating system (macOS / Windows), application version, and reproduction steps.
- Feature ideas and improvement suggestions are welcome as issues too.
- Join the [QQ group](README.en.md#community) (**1106941154**) and help other users.
- Write tutorials or experience posts, or help improve and translate the documentation.
- Suggest ecosystem projects for the [related links](README.en.md#friendly-links) section.

## Plugin authors: extend the ecosystem

DSH is built around plugins. If you write plugins, start with:

- [Plugin development](docs/plugin-development.en.md): how to write ordinary DSH plugins and Desktop plugins.
- [DSH plugin ecosystem manifesto](docs/plugin-ecosystem.en.md): our vision of an open, composable, sustainable ecosystem, and the three principles — composition first, declare clearly, compatibility first.
- [DSH Community Fabric Draft](dsh-community-fabric/README.md): join the public discussion of manifests, capabilities, Host Descriptors, and event contracts.
- [Community Market design](dsh-community-market/docs/market-shell.md): how the market discovers plugins and why listing is not a security review.

Following the manifesto helps plugins coexist and describe their capabilities and compatibility in the marketplace; a listing is not a security certification.

## Developers: contribute code

### Development environment

```sh
corepack yarn check:runtime-boundary
git submodule update --init --recursive
corepack yarn install --immutable
corepack yarn check   # full headless gate: build, typecheck, tests, and smokes
corepack yarn dev     # launch the application when a graphical session is available
```

`corepack yarn dev` builds and explicitly launches the graphical app; `corepack yarn start` uses an existing build. Both audit the real Profile for dependency links into the current checkout before creating separate Harness home, Electron user-data, temporary, and working directories. That state is deleted on final exit. Do not store sessions you want to retain in a development run.

Before editing runtime code, installing dependencies, or cleaning directories, run `check:runtime-boundary`; use `--home <absolute-path>` for a custom Harness home. If a real Profile points into a checkout or staging tree you plan to change, stop affected mutations and arrange authorized recovery. Do not delete user dependencies to make the check pass. Tests and one-off smokes use `scripts/run-isolated-check.mjs` and must not connect to real user data.

### Repository boundaries (please read before starting)

- `deepseek-harness/` is the pinned upstream submodule. **Desktop development never edits files inside it**; upstream updates land through separate pin commits.
- Desktop code lives in `dsh-plugin-desktop/`; `dsh-community-fabric/` is a non-loadable community-standard documentation Draft; `dsh-community-market/` implements the market Host/Client, catalog contracts, reviewed adapters, and installation boundary. All three owned packages share the outer Yarn workspace.
- Builds, typechecks, unit tests, and smoke checks must stay headless-safe.

### Commits and pull requests

- Use conventional commit messages (for example `fix(desktop): ...`, `docs: ...`).
- Run `corepack yarn check` and `corepack yarn check:docs` and keep them green before committing.
- After changing production dependencies, run `yarn workspace dsh-plugin-desktop verify:notices` to refresh the third-party notices and commit the updated `dsh-plugin-desktop/THIRD_PARTY_NOTICES.md`.
- Documentation changes should stay bilingual and update the `README.i18n.yaml` hash record.
- Describe the change, its motivation, and how it was verified in the PR; merge after CI passes.

## Join the technical team

If you would like to join our technical team, contact us at [1576186341@qq.com](mailto:1576186341@qq.com).

## Code of conduct

Be kind and respectful, and stick to the topic. We want a community that welcomes newcomers. The [Contributor Covenant](CODE_OF_CONDUCT.en.md) applies to all project spaces.
