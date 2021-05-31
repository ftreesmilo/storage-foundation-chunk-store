import Promise from 'bluebird';
import PQueue from 'p-queue'; // eslint-disable-line import/no-unresolved

import './types.js';
import NativeIOFileManager from './NativeIOFileManager.js';

const {
  open,
  delete: deleteFile,
  getAll,
  requestCapacity,
  releaseCapacity,
} = NativeIOFileManager;

const io = new PQueue({ concurrency: 5 }); // total concurrent io ops across all stores.
const atomic = new PQueue({ concurrency: 1 });
let size = 0;

export default class AbstractFileChunkStore {
  /** @type {number} */
  static get size() { return size; }

  #length;

  get length() { return this.#length; }

  #closed = false;

  /**
   * A promise for when the store has been allocated and is ready.
   * Use this.ready unless setting this value
   * @type {Promise<void>}
   */
  #ready;

  /**
   * A promise for when a store is ready and open.
   * @type {Promise<void>}
   */
  get ready() {
    return this.#ready.then(() => { if (this.#closed) throw new Error(''); });
  }

  /** @type {Map.<string, PQueue>} */
  #queues = new Map();

  #pathMapper;

  /**
   * @param {Array<FileOption>} files
   * @param {number} length
   * @param {(file: FileOption) => string} pathMapper
   */
  constructor(files, length, pathMapper = ({ path }) => path) {
    if (!files || !files.length) throw new Error('`opts` must contain an array of files.');
    if (!Array.isArray(files)) throw new Error('`files` option must be an array.');
    this.#pathMapper = pathMapper;

    this.#length = files.reduce((sum, file, i) => {
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
      return sum + file.length;
    }, 0);

    // sanity check
    if (!Number.isNaN(length) && length !== this.length) {
      throw new Error(`total 'files' length (${this.length}) is not equal to explicit 'length' option (${length}).`);
    }

    files.forEach(({ path }) => {
      this.#queues.set(path, new PQueue({ concurrency: 1 }));
    });
    this.#ready = this.#alloc(files);
  }

  /** @param {Array<FileOption>} files */
  async #alloc(files) {
    return atomic.add(async () => {
      size += this.length;
      await requestCapacity(this.length);
      await Promise.resolve(files)
        .map(({ path, length }) => this.queue(path, (file) => file.setLength(length)));
    });
  }

  async #free() {
    return atomic.add(async () => {
      size -= this.length;
      await releaseCapacity(this.length);
    });
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
    const files = new Set([...this.#queues.keys()].map(this.#pathMapper));
    let err;
    try {
      await Promise.filter(getAll(), (n) => files.has(n))
        .map((n) => io.add(() => deleteFile(n)));
      await this.#free();
    } catch (e) {
      err = e;
      throw e;
    } finally {
      cb(err);
    }
  }

  /**
   * Spread out file writes wide before pushing them through io queue
   * @param {string} path
   * @param {(file: NativeIOFile) => Promise.<void>} fn
   * @returns {Promise.<void>}
   */
  async queue(path, fn) {
    return this.#queues.get(path)
      .add(() => Promise.using(open(this.#pathMapper(path)), fn));
  }
}
