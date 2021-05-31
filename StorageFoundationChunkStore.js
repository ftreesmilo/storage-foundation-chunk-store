import { Buffer } from 'buffer';
import Promise from 'bluebird';

import './types.js';
import ChunkInfo from './ChunkInfo.js';
import AbstractStorageFoundationFileStore from './AbstractStorageFoundationFileStore.js';

/** @type {Map.<string, StorageFoundationChunkStore>} */
const stores = new Map();

export default class StorageFoundationChunkStore extends AbstractStorageFoundationFileStore {
  /** @param {string} infoHash */
  static getStore(infoHash) { return stores.get(infoHash); }

  #infoHash;

  /** @type {number} */
  chunkLength;

  #lastChunkLength;

  #lastChunkIndex;

  /** @type {Map.<string, number>} */
  #fileidxs = new Map();

  #chunkMap;

  /**
   * @param {number} chunkLength
   * @param {Object} opts
   * @param {{infoHash: string}} opts.torrent
   * @param {Array<FileOption>} opts.files
   * @param {number} opts.length
   */
  constructor(chunkLength, {
    torrent: { infoHash } = {},
    files,
    length,
  } = {}) {
    if (!chunkLength) throw new Error('First argument must be a chunk length.');
    if (!infoHash) throw new Error('Missing `infoHash` in torrent option.');
    super(files, length, (path) => `${infoHash}_${this.#fileidxs.get(path)}`);

    this.#infoHash = infoHash;
    this.chunkLength = chunkLength;
    this.#lastChunkLength = (this.length % chunkLength) || chunkLength;
    this.#lastChunkIndex = Math.ceil(this.length / chunkLength) - 1;

    [...files] // Don't sort the array in place
      .sort((a, b) => a.path.localeCompare(b.path))
      .forEach(({ path }, i) => this.#fileidxs.set(path, i));
    this.#chunkMap = ChunkInfo.buildChunkMap(chunkLength, files);
    stores.set(infoHash, this);
    this.ready.catch(() => stores.delete(infoHash));
  }

  async destroy() {
    stores.delete(this.#infoHash);
    return super.destroy();
  }

  /**
   * @param {number} index
   * @returns {number} length of chunk at index
   */
  #lengthAt(index) {
    return (index === this.#lastChunkIndex)
      ? this.#lastChunkLength
      : this.chunkLength;
  }

  /**
   * @param {number} index
   * @param {Buffer} buf
   * @param {(error: Error?) => undefined} [cb]
   * @returns {Promise<undefined>}
   */
  async put(index, buf, cb = () => { }) {
    let err;
    try {
      if (!this.#chunkMap.has(index)) throw new Error('Invalid chunk.');
      await this.ready;

      if (this.#lengthAt(index) !== buf.length) {
        throw new Error(`Chunk length must be ${this.#lengthAt(index)}`);
      }

      await Promise.resolve(this.#chunkMap.get(index))
        .map(async (target, idx, len) => {
          const { from, to, offset } = target;
          const { file: { path } } = target;
          return this.queue(path, async (file) => {
            const data = buf.slice(from, to);
            // try not to copy memory unless we need to
            await file.write(len === 1 ? data : Buffer.alloc(to - from, data), offset);
          });
        });
    } catch (e) {
      err = e;
      throw e;
    } finally {
      cb(err);
    }
  }

  /**
   * @param {number} index
   * @param {{offset: number, length: number}} options
   * @param {(error: Error?, buff: Buffer?) => undefined} [cb]
   * @returns {Promise<Buffer>}
   */
  async get(index, options = {}, cb = () => { }) {
    if (typeof opts === 'function') return this.get(index, undefined, options);
    if (options === null) return this.get(index, undefined, cb);
    let err;
    let result;
    try {
      if (!this.#chunkMap.has(index)) throw new Error('Invalid chunk.');
      await this.ready;

      const chunkLength = this.#lengthAt(index);
      const rangeFrom = options.offset || 0;
      const rangeTo = options.length ? rangeFrom + options.length : chunkLength;

      if (rangeFrom < 0 || rangeFrom < 0 || rangeTo > chunkLength) {
        throw new Error('Invalid offset and/or length.');
      }
      if (rangeFrom === rangeTo) {
        result = Buffer.alloc(0);
        return result;
      }

      const parts = await Promise.resolve(this.#chunkMap.get(index))
        .filter(({ to, from }) => (to > rangeFrom && from < rangeTo))
        .map(async (target) => {
          let { from, to, offset } = target;

          to = Math.min(to, rangeTo);
          if (from < rangeFrom) {
            offset += (rangeFrom - from);
            from = rangeFrom;
          }

          const { file: { path } } = target;
          return this.queue(path, (file) => file.read(new Uint8Array(to - from), offset));
        })
        .map(({ buffer }) => buffer);

      result = Buffer.concat(parts);
      return result;
    } catch (e) {
      err = e;
      throw e;
    } finally {
      cb(err, result);
    }
  }
}
