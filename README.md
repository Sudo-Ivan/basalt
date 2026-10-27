# heroicx

A personal fork of [Heroic Games Launcher](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher), themed with the Quad4 void design system. Heroic is an open source game launcher for Linux, Windows and macOS.

## Features

- Launch games from GOG, the Epic Games Store and Amazon Games
- Log in with Epic, GOG and Amazon accounts
- Run games with Wine, Proton or Crossover on Linux and macOS
- Native Windows support
- Ships with the Quad4 void theme by default

## Install

Download a package for your platform from the [releases page](https://github.com/Sudo-Ivan/heroicx/releases), or build from source as described below.

## Development

Requires Git, Node.js and pnpm 10.

```bash
git clone https://github.com/Sudo-Ivan/heroicx.git
cd heroicx
pnpm install
pnpm start
```

`pnpm start` runs the app in development mode with hot reload via electron-vite.

### Building binaries

Run `pnpm build` followed by electron-builder, or use one of the combined scripts:

```bash
pnpm dist:linux   # Linux (AppImage by default; optionally pass deb, rpm, pacman or tar.xz)
pnpm dist:mac     # macOS
pnpm dist:win     # Windows
```

## Credits

heroicx is a fork of [Heroic Games Launcher](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher). All credit for the launcher itself goes to the upstream authors and contributors.

## License

GPL-3.0-only. See [COPYING](COPYING).
