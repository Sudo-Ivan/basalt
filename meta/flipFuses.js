// electron-builder afterPack hook: flips Electron fuses on the packaged
// binary. Wire this in electron-builder.yml with a top-level entry:
//
//   afterPack: meta/flipFuses.js
//
// See https://www.electronjs.org/docs/latest/tutorial/fuses
const fs = require('fs')
const path = require('path')
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')

function electronBinaryPath(context) {
  const productFilename = context.packager.appInfo.productFilename
  switch (context.electronPlatformName) {
    case 'darwin':
      return path.join(
        context.appOutDir,
        `${productFilename}.app`,
        'Contents',
        'MacOS',
        productFilename
      )
    case 'win32':
      return path.join(context.appOutDir, `${productFilename}.exe`)
    default: {
      const candidates = [
        context.packager.executableName,
        productFilename,
        productFilename.toLowerCase()
      ].filter(Boolean)
      for (const name of candidates) {
        const candidate = path.join(context.appOutDir, name)
        if (fs.existsSync(candidate)) {
          return candidate
        }
      }
      return path.join(context.appOutDir, candidates[0])
    }
  }
}

/**
 * @param {import('electron-builder').AfterPackContext} context
 */
module.exports = async function (context) {
  const binaryPath = electronBinaryPath(context)

  await flipFuses(binaryPath, {
    version: FuseVersion.V1,
    // Flipping fuses modifies the binary, so the ad-hoc signature created
    // during packaging on macOS has to be redone or the app will not launch.
    resetAdHocDarwinSignature: true,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false
  })

  console.log(`[afterPack] Flipped Electron fuses on ${binaryPath}`)
}
