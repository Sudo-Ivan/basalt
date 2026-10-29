declare module 'unzipper' {
  import { Readable } from 'node:stream'

  export interface ZipEntry {
    path: string
    type: string
    compressedSize?: number
    uncompressedSize?: number
    stream: () => Readable
  }

  export interface ZipDirectory {
    files: ZipEntry[]
    extract: (options: { path: string; concurrency?: number }) => Promise<void>
  }

  export const Open: {
    file: (path: string) => Promise<ZipDirectory>
    buffer: (buffer: Buffer) => Promise<ZipDirectory>
  }

  export function Extract(options: { path: string }): unknown
}
