# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities privately:

- Preferred: GitHub private vulnerability reporting on the
  [basalt repository](https://github.com/Sudo-Ivan/basalt/security/advisories/new)
- Alternatively: email ivan@quad4.io

Please do not open public issues for security reports. You can expect an
acknowledgement within a few days and a status update once the report has
been assessed.

## Supported Versions

Only the latest release is supported with security fixes. There are no
backports to older versions.

| Version        | Supported |
| -------------- | --------- |
| latest release | yes       |
| older releases | no        |

## Scope and Threat Model

This is an Electron desktop application. Threats in scope include remote
content loaded inside `<webview>` tags and `BrowserWindow` instances (store
login pages, embedded documentation), the IPC surface exposed to the
renderer through `contextBridge`, the integrity of downloaded binaries and
auto-updates, and secrets stored via Electron's `safeStorage`.

Out of scope:

- Bugs in upstream Heroic Games Launcher or bundled helper binaries
  (legendary, gogdl, nile, comet). Report those to their own projects.
- Attacks that already require local code execution, root access, or
  physical access to the machine.
- The Electron/Chromium/Node runtimes themselves. Report those upstream.

Note that release builds are currently unsigned. On Windows and macOS the
auto-updater verifies downloaded updates only against the sha512 checksum
published over HTTPS in the release metadata, so a compromised release
channel or repository can deliver malicious updates. Supply-chain
compromise of update metadata is therefore a known limitation, not a bug
this project can fix without code signing.
