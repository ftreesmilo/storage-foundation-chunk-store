import { Buffer } from 'buffer';
import Promise from 'bluebird';
import debug from 'debug';
import PQueue from 'p-queue'; // eslint-disable-line import/no-unresolved
import './types.js';
import ChunkInfo from './ChunkInfo.js';
import NativeIOFileManager from './NativeIOFileManager.js';

const {
  open,
  delete: deleteFile,
  getAll,
  requestCapacity,
  releaseCapacity,
} = NativeIOFileManager;

const error = debug('sfcs:error');
error.log = console.log.bind(console); // eslint-disable-line no-console

const concurrency = 5; // total concurrent io ops across all stores.
const io = new PQueue({ concurrency });
const atomic = new PQueue({ concurrency: 1 });

let size = 0;

export class StorageFoundationChunkStore {
  /** @type {number} */
  static get size() { return size; }

  /**
   * A promise for when the store has been allocated and is ready.
   * Use this.ready unless setting this value
   * @type {Promise<void>}
   */
  #ready;

  #closed = false;

  /**
   * A promise for when a store is ready and open.
   * @type {Promise<void>}
   */
  get ready() {
    return this.#ready.then(() => {
      if (this.#closed) throw new Error('Store is closed.');
    });
  }

  /** @type {number} */
  chunkLength;

  /** @type {Map.<string, number>} */
  #fileidxs = new Map();

  /** @type {number} */
  length;

  /** @type {number} */
  #lastChunkLength;

  /** @type {number} */
  #lastChunkIndex;

  #chunkMap;

  /** @type {string} */
  #infoHash;

  /** @type {Map.<string, PQueue>} */
  #queues;

  /**
   * @param {number} chunkLength
   * @param {Object} opts
   * @param {{infoHash: string}} opts.torrent
   * @param {Array<FileOption>} opts.files
   * @param {number} opts.length
   * @param {string} name
   */
  constructor(chunkLength, {
    torrent: { infoHash } = {},
    files,
    length,
  } = {}) {
    this.chunkLength = chunkLength;
    this.#infoHash = infoHash;

    if (!chunkLength) throw new Error('First argument must be a chunk length.');
    if (!infoHash) throw new Error('Missing `infoHash` in torrent option.');
    if (!files || !files.length) throw new Error('`opts` must contain an array of files.');
    if (!Array.isArray(files)) throw new Error('`files` option must be an array.');

    files.sort((a, b) => a.path.localeCompare(b.path))
      .forEach((file, i) => {
        if (file.path == null) throw new Error('File is missing `path` property.');
        if (file.length == null) throw new Error('File is missing `length` property.');
        if (file.offset == null) {
          if (i === 0) {
            file.offset = 0;
          } else {
            const prevFile = files[i - 1];
            file.offset = prevFile.offset + prevFile.length;
          }
        }
        this.#fileidxs.set(file.path, i);
      });
    this.length = files.reduce((sum, { length: len }) => sum + len, 0);

    // sanity check
    if (!Number.isNaN(length) && length !== this.length) {
      throw new Error(`total 'files' length (${this.length}) is not equal to explicit 'length' option (${length}).`);
    }

    this.#lastChunkLength = (this.length % this.chunkLength) || this.chunkLength;
    this.#lastChunkIndex = Math.ceil(this.length / this.chunkLength) - 1;

    this.#queues = new Map(files.map(({ path }) => [
      this.#getStoreFileName(path),
      new PQueue({ concurrency: 1 }),
    ]));

    this.#chunkMap = ChunkInfo.buildChunkMap(chunkLength, files);
    this.#alloc(files);
  }

  /**
   * Spread out file writes wide before pushing them through io queue
   * @param {string} filename
   * @param {(file: NativeIOFile) => Promise.<void>} fn
   * @returns {Promise.<void>}
   */
  async #queue(filename, fn) {
    return this.#queues.get(filename).add(async () => {
      if (fn.length) {
        const file = await open(filename);
        try {
          return await io.add(() => fn(file));
        } finally {
          await file.close();
        }
      } else {
        return io.add(() => fn());
      }
    });
  }

  /**
   * @param {string} path
   * @returns {string} the storage filename for the file
   */
  #getStoreFileName(path) {
    if (!this.#fileidxs) {
      throw new Error(`Unknown file path '${path}'`);
    }
    return `${this.#infoHash}_${this.#fileidxs.get(path)}`;
  }

  async close(cb = () => { }) {
    try {
      try {
        await this.ready;
      } catch (e) { /* ignore */ }
      const queues = this.#queues.values();
      await Promise.map(queues, async (q) => q.onIdle());
      this.#closed = true;
    } finally {
      cb();
    }
  }

  async destroy(cb = () => { }) {
    await this.close();
    let err;
    try {
      await Promise.filter(getAll(), (n) => this.#queues.has(n))
        .map((n) => io.add(() => deleteFile(n)));
      await this.#free();
    } catch (e) {
      err = e;
      throw e;
    } finally {
      cb(err);
    }
  }

  /** @param {Array<FileOption>} files */
  #alloc(files) {
    this.#ready = atomic.add(async () => {
      size += this.length;
      await requestCapacity(this.length);
      await Promise.map(files, ({ path, length }) => {
        const name = this.#getStoreFileName(path);
        return this.#queue(name, (file) => file.setLength(length));
      });
    });
  }

  async #free() {
    return atomic.add(async () => {
      size -= this.length;
      await releaseCapacity(this.length);
    });
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

      const isLastChunk = (index === this.#lastChunkIndex);
      if (isLastChunk && buf.length !== this.#lastChunkLength) {
        throw new Error(`Last chunk length must be ${this.#lastChunkLength}`);
      }
      if (!isLastChunk && buf.length !== this.chunkLength) {
        throw new Error(`Chunk length must be ${this.chunkLength}`);
      }

      const targets = this.#chunkMap.get(index);
      await Promise.map(targets, async (target) => {
        const {
          from,
          to,
          offset,
          file: { path },
        } = target;
        const filename = this.#getStoreFileName(path);
        return this.#queue(filename, async (file) => {
          // try not to copy memory unless we need to
          if (targets.length > 1) {
            const buff = Buffer.alloc(to - from);
            buf.copy(buff, 0, from, to);
            await file.write(buff, offset);
          } else {
            await file.write(buf.slice(from, to), offset);
          }
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

      const chunkLength = (index === this.#lastChunkIndex)
        ? this.#lastChunkLength
        : this.chunkLength;
      const rangeFrom = options.offset || 0;
      const rangeTo = options.length ? rangeFrom + options.length : chunkLength;

      if (rangeFrom < 0 || rangeFrom < 0 || rangeTo > chunkLength) {
        throw new Error('Invalid offset and/or length.');
      }
      if (rangeFrom === rangeTo) {
        result = Buffer.alloc(0);
        return result;
      }

      const targets = this.#chunkMap.get(index)
        .filter(({ to, from }) => (to > rangeFrom && from < rangeTo))
        .sort((a, b) => a.from - b.from);
      if (targets.length === 0) {
        throw new Error('No files matching the requested range.');
      }

      const parts = await Promise.map(targets, async (target) => {
        let { from, to, offset } = target;
        const { file: { path } } = target;

        to = Math.min(to, rangeTo);
        if (from < rangeFrom) {
          offset += (rangeFrom - from);
          from = rangeFrom;
        }

        const filename = this.#getStoreFileName(path);
        return this.#queue(filename, async (file) => {
          const { buffer } = await file.read(new Uint8Array(to - from), offset);
          return buffer;
        });
      });

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

export default StorageFoundationChunkStore;
