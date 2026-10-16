# dsh-plugins-in-settings

Brings the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) **sidebar's
"Plugins" page into Settings**: a new **"Plugin manager"** tab inside **Settings → Plugins** that
brings in what the official plugin panel does — browse official and installed bundles,
**add a plugin**, switch a bundle on or off, switch an individual plugin row, and uninstall.

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
│  │ ┌─ Add a plugin ──────────────────────────────────┐ │ │
│  │ │ Enter a package name, GitHub address, or path.   │ │ │
│  │ │ [dsh-plugin-whale-pet    ] [Registry▾] [Install] │ │ │
│  │ │ Make sure the plugin's source is trustworthy.    │ │ │
│  │ └─────────────────────────────────────────────────┘ │ │
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
installing, switching and uninstalling all go through the **same official remote interface**
(`remote.pluginManager`) — whatever the official panel does is exactly what happens here, so the two
can never drift apart.

### "Add plugin" in four steps

1. **Give a spec** — a package name (`dsh-xxx`), `github:owner/repo`, or an absolute local path.
2. **The host reads it first** (`inspect`) — a spec that is not a plugin package, whose registry is
   unreachable, or that pnpm would refuse is reported **before anything is installed**, with your
   input kept for editing.
3. **Install for real** (`installBundle`) — installed **enabled**, and the list refreshes when done.
4. **Read the outcome** — from the host's `application`: installed / installed but needs a restart /
   failed (including install scripts pnpm blocked, with **Allow and retry**) / cancelled.

You can **cancel at any point**. If the reply is lost mid-flight (timeout, dropped connection), the
plugin asks the host for that same task's result by id; when the host has no record, it says the
outcome is **unknown** rather than claiming success.

## Install

### 1. Settings panel (recommended)

**Settings → Plugins → Add plugin**, then give one of:

- a **local directory path** (the folder containing this repository)
- **`github:Alail691/dsh-plugins-in-settings`**
- an **npm package name** (once published)

### 2. Command line (**non-desktop profiles only**)

```powershell
dsh plugin --profile tui add link:"<absolute path to this plugin>"
dsh plugin --profile tui add github:Alail691/dsh-plugins-in-settings
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
| **Pre-install check** | `ctx.remote.pluginManager.inspect(spec, { registry }, signal)` |
| **Install** | `ctx.remote.pluginManager.installBundle(spec, { enabled, requestId, registry, approvedBuilds? })` |
| **Recover a result** | `ctx.remote.pluginManager.waitForInstall(requestId)` |
| **Cancel** | `ctx.remote.pluginManager.cancelInstall(requestId)` |
| Switch a bundle | `ctx.remote.pluginManager.setBundleEnabled(name, enabled)` |
| Switch a plugin row | `ctx.remote.pluginManager.setPluginEnabled(entryId, enabled)` |
| Uninstall | `ctx.remote.pluginManager.removeBundle(name)` |

Installing is a **four-method chain**: `inspect` asks whether the spec can be installed,
`installBundle` really starts it under a **`requestId` this plugin generates**, a lost reply is
recovered with `waitForInstall` under that same id, and a mid-flight cancel goes through
`cancelInstall` (which may answer `too-late`, meaning it already finished).

`remote.pluginManager` is exposed by the host half of the official `ui-plugin-manager`. This plugin
**soft-probes** it (`ctx.get("remote")`) instead of declaring it as a hard `inject` dependency —
declaring a service that never arrives leaves the fiber PENDING and drags down the whole plugin tree.
When the probe fails, the tab shows a readable "unavailable" note and **everything else keeps working**.

## Robustness

- **fail-open**: a missing remote namespace, missing methods, a failed list read, or any unrecognized
  shape collapses into a readable line or an empty list. Nothing throws, and Settings, the official
  Plugins page, and the sidebar entry are never affected.
- **It never claims a false success**: the install outcome is decided by `application`, and an
  unrecognized value counts as *unknown* rather than success. A lost reply is recovered from the host
  first; if the host has no record, the plugin says so.
- **Older hosts degrade gracefully**: on a host with the management methods but no install methods,
  the Install button is **disabled** and everything else keeps working — one missing method never
  takes down the whole page.
- **A failed refresh keeps the previous list** (same rhythm as the official panel) and appends one
  error line below it.
- **An install can be cancelled at any point**, and cancelling leaves no half-installed illusion.
- **Uninstall takes two clicks** (the first becomes "Confirm uninstall", blur reverts it).
- **Zero third-party dependencies**: only `react` and `react/jsx-runtime` from the platform seed
  table. No build step — `lib/client.js` is the published artifact (hand-written and readable).
- Every failure path is pinned by an offline assertion (see below).

## Development

```powershell
npm test              # offline assertions (154 checks)
npm run preflight     # verify contracts against the real installed official artifacts (35 checks)
npm run publish:check # publish readiness (22 checks): placeholders / private / files allowlist / artifact consistency
npm run verify        # all three, in order
```

**Publishing to GitHub** (for the repository author):

```powershell
npm run push:check    # check only: branch, working tree, whether the repo exists, dsh-plugin topic
npm run push          # add the remote + push main + tag
```

See [`docs/PUBLISHING.md`](docs/PUBLISHING.md) and [`docs/GITHUB-SETUP.md`](docs/GITHUB-SETUP.md).

- `test/run.mjs` checks whether **our own shape** is right: artifact contract, pure-function
  normalization, registration contract, and both the success and failure paths of the data layer
  (including the install chain's `ready` / `refused` / lost-reply / `too-late` branches).
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
- **Registries** come from the host's `registries()` plus one "default registry". The official panel
  additionally **probes** the official npm registry and npmmirror in parallel on first use, remembers
  the choice in `localStorage`, and offers the mirror when GitHub is unreachable — **this plugin does
  none of that**. The registry defaults to whatever pnpm is configured with; pick another from the
  dropdown when you need to.
- **No live pnpm output.** The official panel folds the pnpm command line and its output behind
  "Show install details"; this plugin reports the final outcome and the failure reason only.
- Installs always pass **`enabled: true`** (install and enable in one go). The official panel
  installs first and lets you decide separately whether to enable it now.

Those three are deliberate trade-offs: make management solid here, and leave the long tail of the
install experience to the official panel (whose sidebar entry is still there). Open an issue if you
want any of them covered.

## License

MIT (see [`LICENSE`](LICENSE)). No third-party code.
