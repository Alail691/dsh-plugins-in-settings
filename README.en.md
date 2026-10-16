# dsh-plugins-in-settings

Brings the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) **sidebar's
"Plugins" page into Settings**: a new **"Plugin manager"** tab inside **Settings → Plugins** that
embeds the full official plugin panel — browse official and installed bundles, switch a bundle on or
off, switch an individual plugin row, and uninstall.

> The sidebar's own "Plugins" entry is left **exactly as it is**. This plugin adds a second way in;
> it does not dismantle the first one, so neither can break the other.

## What it looks like

```
Settings → Plugins (the official page)
┌──────────────────────────────────────────────────────────┐
│ Built-in plugins                                          │
│ Inspect the plugins this deployment ships.                │
│                                                          │
│  ┌──────────────┬──────────────┐  ← official tab strip   │
│  │ Plugin mgr.  │ Plugin list  │                        │
│  │ ▔▔▔▔▔▔▔▔     │              │  ← the tab this adds   │
│  ├──────────────┴──────────────┴──────────────────────┐ │
│  │ Changes apply live; a few plugins need…    [Refresh] │ │
│  │                                                     │ │
│  │ Official                                            │ │
│  │ ┌─────────────────────────────────────────────────┐ │ │
│  │ │ dsh-experimental-voice-input   Official  Off    │ │ │
│  │ │ …                                     [Enable]  │ │ │
│  │ └─────────────────────────────────────────────────┘ │ │
│  │                                                     │ │
│  │ Installed                                           │ │
│  │ ┌─────────────────────────────────────────────────┐ │ │
│  │ │ dsh-better-sidebar              Enabled         │ │ │
│  │ │ …                      [Disable]  [Uninstall]   │ │ │
│  │ │ ─────────────────────────────────────────────── │ │ │
│  │ │ sidebar (a row of the bundle)      [Disable]    │ │ │
│  │ └─────────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**Relationship to the official panel**: this plugin does not reimplement an installer. Listing,
switching and uninstalling all go through the **same official remote interface**
(`remote.pluginManager`) — whatever the official panel does is exactly what happens here, so the two
can never drift apart.

## Install

### 1. Settings panel (recommended)

**Settings → Plugins → Add plugin**, then give one of:

- a **local directory path** (the folder containing this repository)
- **`github:<user>/<repo>`**
- an **npm package name** (once published)

### 2. Command line (**non-desktop profiles only**)

```powershell
dsh plugin --profile tui add link:"<absolute path to this plugin>"
dsh plugin --profile tui add github:<user>/dsh-plugins-in-settings
```

> `desktop` is a profile the Electron app reserves; the CLI refuses it outright:
> `error: profile "desktop" is managed exclusively by the Electron application`.

### 3. Script (desktop profile, or when Settings has no Plugins panel)

```powershell
.\install.cmd                    # install into desktop
.\install.cmd -Profile tui       # install into another profile
.\install.cmd -WhatIf            # show what it would do, write nothing
.\install.cmd -Uninstall         # uninstall
```

The script backs up the profile's `package.json`, adds a `link:` dependency, appends the package
name to `dsh.profile.bundles`, and creates the link under the profile's `node_modules`
(a junction on Windows, a symlink elsewhere) — then verifies all three.

> To uninstall, use the panel or `install.cmd -Uninstall`. If you created a junction by hand, remove
> it with `cmd /c rmdir <junction>` — **do not** use `Remove-Item -Recurse`, which can follow the
> link and delete files inside the plugin directory.

**A full restart of DSH Desktop is required** (client bundles are injected at boot).

## How it works

| Half | What it does |
|---|---|
| `lib/index.js` (host) | No logic; one static audit of the client artifact. Its only reason to exist is to make this package a row in the cordis tree — without a host entry, `dsh.client`'s bundle is never pulled into the boot graph |
| `lib/client.js` (browser) | One tab: registers into `settings.plugins.tab` and drives list / switch / uninstall through `remote.pluginManager` |

### Where it hooks in, and why

The official `@deepseek-ai/dsh-client-ui-settings-plugins` already owns the `settings.section` page
with id `plugins` (sidebar label "Built-in plugins") and declares the child slot
**`settings.plugins.tab`** (`list`, scope `root`) for "the pages inside this section". The official
read-only inventory (`ui-settings-plugin-inventory`) sits in it with id `all`, order 10.

So this is the natural, least fragile place to fold plugins into Settings:

- **reuse** the settings navigation and tab chrome the official page already built;
- **do not** open a competing settings page;
- **do not** touch any official DOM, and **do not** take an official registration
  (this plugin uses id `manage`, order 5, ahead of the official list);
- **do not** touch the sidebar.

### Data path (official public surface only)

| Purpose | Interface |
|---|---|
| List bundles | `ctx.remote.pluginManager.listBundles()` |
| Switch a bundle | `ctx.remote.pluginManager.setBundleEnabled(name, enabled)` |
| Switch a plugin row | `ctx.remote.pluginManager.setPluginEnabled(entryId, enabled)` |
| Uninstall | `ctx.remote.pluginManager.removeBundle(name)` |

`remote.pluginManager` is exposed by the host half of the official `ui-plugin-manager`. This plugin
**soft-probes** it (`ctx.get("remote")`) instead of declaring it as a hard `inject` dependency —
declaring a service that never arrives leaves the fiber PENDING and drags down the whole plugin tree.
When the probe fails, the tab shows a readable "unavailable" note and **everything else keeps working**.

## Robustness

- **fail-open**: a missing remote namespace, missing methods, a failed list read, or any unrecognized
  shape collapses into a readable line or an empty list. Nothing throws, and Settings, the official
  Plugins page, and the sidebar entry are never affected.
- **A failed refresh keeps the previous list** (same rhythm as the official panel) and appends one
  error line below it.
- **Uninstall takes two clicks** (the first becomes "Confirm uninstall", blur reverts it).
- **Zero third-party dependencies**: only `react` and `react/jsx-runtime` from the platform seed
  table. No build step — `lib/client.js` is the published artifact (hand-written and readable).
- Every failure path is pinned by an offline assertion (see below).

## Development

```powershell
npm test            # offline assertions (97 checks)
npm run preflight   # verify contracts against the real installed official artifacts (24 checks)
```

- `test/run.mjs` checks whether **our own shape** is right: artifact contract, pure-function
  normalization, registration contract, and both the success and failure paths of the data layer.
- `test/preflight.mjs` checks whether **the place we hook into still exists**: it reads the official
  `ui-settings-plugins` / `ui-settings-plugin-inventory` / `ui-plugin-manager` artifacts (from the
  profile's `node_modules` or from `app.asar`) and verifies slot names, registration shape, and which
  ids are taken. When an official upgrade changes these, **this fails first** instead of you
  discovering an empty Settings page on a real machine.

No real React is available offline here (`app.asar` does not ship it), so the render layer runs
against a **stateful React stub** in `test/harness.mjs` (`useState` / `useMemo` / `useCallback` /
`useEffect` / `useId`, including re-renders triggered by `setState`). The data path and the
registration path execute the real code.

## Compatibility

- Depends on official **semantic contracts**: the slot name `settings.plugins.tab`, the remote
  namespace `remote.pluginManager`, and its method names. If those change, this plugin **silently
  falls back to "unavailable"** (fail-open) and never breaks the official UI; `npm run preflight`
  reports it first.
- Requires a full DSH Desktop restart to take effect.
- Registers **no host hooks, injects no session messages, and listens to no agent events** — it
  structurally touches one UI slot and a few remote management methods.

## Known limitations

- The shape of `listBundles()`'s response is decided by the host; this plugin reads the fields it has
  observed (`official` / `installed`, plus a flat array and `{ bundles: [] }` as fallbacks) and shows
  an empty list rather than guessing.
- There is no "install a new plugin" input box (package name / git address). That is the official
  panel's full flow, involving registry probing, the pnpm output stream, cancellation and retry. This
  plugin focuses on **managing plugins that are already there**; the sidebar's official panel remains
  available for installing new ones.

> That last point is a deliberate trade-off. If you want installation inside this tab too, open an
> issue — the official flow runs through `inspect` / `installBundle` / `waitForInstall`, which is
> feasible to wire up, but it is a substantially larger amount of code.

## License

MIT (see [`LICENSE`](LICENSE)). No third-party code.
