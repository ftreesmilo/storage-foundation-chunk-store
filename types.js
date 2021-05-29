// STORAGE FOUNDATION TYPES

/**
 * @typedef NativeIOReadResult
 * @property {Uint8Array} buffer
 * @property {number} readBytes
 */

/**
 * @typedef NativeIOWriteResult
 * @property {Uint8Array} buffer
 * @property {number} writtenBytes
 */

/**
 * @typedef NativeIOFile
 * @property {() => Promise.<void>} close
 * @property {() => Promise.<void>} flush
 * @property {() => Promise.<number>} getLength
 * @property {(length: number) => Promise.<void>} setLength
 * @property {(buffer: Buffer, fileOffset: number) => Promise.<NativeIOReadResult>} read
 * @property {(buffer: Buffer, fileOffset: number) => Promise.<NativeIOWriteResult>} write
 */

// TORRENT RELATED TYPES

/**
 * @typedef {Object} FileOption
 * @property {string} path
 * @property {number} length
 * @property {number} offset
 */
