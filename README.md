# basalt

A fork of [Heroic Games Launcher](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher) with the Quad4 void theme. Heroic is an open source game launcher for Linux, Windows and macOS.

## Features

- Libraries and login for GOG, the Epic Games Store and Amazon Games
- Runs Windows games on Linux and macOS with Wine, Proton or CrossOver
- Void theme by default, with a light paper variant
- No telemetry

## Install

Download a package for your platform from the [releases page](https://github.com/Sudo-Ivan/basalt/releases/latest).

## Develop

Requires Git, Node.js and pnpm 10.

```bash
git clone https://github.com/Sudo-Ivan/basalt.git
cd basalt
pnpm install
pnpm start
```

Useful scripts:

```bash
pnpm codecheck    # type-check
pnpm lint         # eslint
pnpm test:ci      # unit tests
pnpm build        # production build
pnpm dist:linux   # package for Linux (also dist:mac, dist:win)
```

## Release

Push a `v*` tag. The release workflow builds packages and publishes a draft release. Packages are unsigned.

## License

GPL-3.0-only. See [COPYING](COPYING).

basalt is a fork of [Heroic Games Launcher](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher). All credit for the launcher itself goes to the upstream authors and contributors.
