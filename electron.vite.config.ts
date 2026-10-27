import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react-swc'
import svgr from 'vite-plugin-svgr'
import path from 'path'

const srcAliases = ['backend', 'frontend', 'common'].map((aliasName) => ({
  find: aliasName,
  replacement: path.join(__dirname, 'src', aliasName)
}))

const dependenciesToNotExternalize = [
  '@xhmikosr/decompress',
  '@xhmikosr/decompress-targz',
  '@xhmikosr/decompress-unzip'
]

// Split the renderer bundle into stable vendor chunks so that app-code
// changes do not invalidate the cached vendor code (and vice versa).
const isPackage = (id: string, packageNames: string[]) =>
  packageNames.some((name) => id.includes(`/node_modules/${name}/`))

const rendererManualChunks = (id: string): string | undefined => {
  if (!id.includes('node_modules')) return undefined

  if (
    isPackage(id, [
      'react',
      'react-dom',
      'scheduler',
      'react-router',
      'react-router-dom',
      '@remix-run/router'
    ])
  ) {
    return 'vendor-react'
  }

  if (
    isPackage(id, [
      'i18next',
      'react-i18next',
      'i18next-http-backend',
      'html-parse-stringify',
      'void-elements'
    ])
  ) {
    return 'vendor-i18n'
  }

  if (
    id.includes('/node_modules/@mui/') ||
    id.includes('/node_modules/@emotion/') ||
    isPackage(id, ['@popperjs/core', 'react-transition-group'])
  ) {
    return 'vendor-mui'
  }

  if (id.includes('/node_modules/@fortawesome/')) {
    return 'vendor-fortawesome'
  }

  if (
    isPackage(id, [
      'recharts',
      'victory-vendor',
      'react-smooth',
      'decimal.js-light'
    ]) ||
    /\/node_modules\/d3-[^/]+\//.test(id)
  ) {
    return 'vendor-recharts'
  }

  return undefined
}

export default defineConfig(({ mode }) => ({
  main: {
    build: {
      rollupOptions: {
        input: 'src/backend/main.ts',
        output: {
          chunkFileNames: `chunks/[name].js`,
          assetFileNames: `chunks/[name].[ext]`
        }
      },
      outDir: 'build/main',
      minify: false,
      // external .map files keep source-map-support working without
      // inflating main.js with a ~9MB inline map that is parsed at startup
      sourcemap: mode === 'development' ? 'inline' : true
    },
    resolve: { alias: srcAliases },
    plugins: [externalizeDepsPlugin({ exclude: dependenciesToNotExternalize })]
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: 'src/preload/index.ts',
          webviewPreload: 'src/webviewPreload/index.ts'
        },
        output: {
          chunkFileNames: `chunks/[name].js`,
          assetFileNames: `chunks/[name].[ext]`
        }
      },
      outDir: 'build/preload',
      minify: true,
      sourcemap: mode === 'development' ? 'inline' : false
    },
    resolve: { alias: srcAliases },
    plugins: [externalizeDepsPlugin({ exclude: dependenciesToNotExternalize })]
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: path.resolve('index.html'),
        output: {
          chunkFileNames: `assets/[name].js`,
          assetFileNames: `assets/[name].[ext]`,
          manualChunks: rendererManualChunks
        }
      },
      target: 'esnext',
      outDir: 'build',
      emptyOutDir: false,
      minify: true,
      sourcemap: mode === 'development' ? 'inline' : false
    },
    resolve: { alias: srcAliases },
    plugins: [react(), svgr()]
  }
}))
