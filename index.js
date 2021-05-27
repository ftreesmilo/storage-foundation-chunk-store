import { Buffer } from 'buffer';
import Promise from 'bluebird';
import debug from 'debug';
import PQueue from 'p-queue'; // eslint-disable-line import/no-unresolved

const error = debug('sfcs:error');
error.log = console.log.bind(console); // eslint-disable-line no-console

let total = 0;

/**
 * @typedef {Object} FileOption
 * @property {string} path
 * @property {number} length
 * @property {number} offset
 */

/**
 * @typedef {Object} ChunkInfo
 * @property {number} from start of the file in the chunk
 * @property {number} to end of the file in the chunk
 * @property {number} offset offset of the file in the chunk (`from` is not start of `file` if > 0)
 * @property {FileOption} file the file in the chunk
 */

export class StorageFoundationChunkStore {
  #closed = false;

  /** @type {number} */
  chunkLength;

  /** @type {Array.<FileOption} */
  #files;

  /** @type {Map.<string, number>} */
  #fileidxs = new Map();

  /** @type {number} */
  #length;

  /** @type {number} */
  #lastChunkLength;

  /** @type {number} */
  #lastChunkIndex;

  /** @type {Map.<number, Array.<ChunkInfo>>} */
  #chunkMap = new Map();

  /** @type {string} */
  #infoHash;

  /** @type {Map.<string, PQueue} */
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
    if (!chunkLength) throw new Error('First argument must be a chunk length.');
    this.chunkLength = chunkLength;

    if (!files || !files.length) throw new Error('`opts` must contain an array of files.');
    if (!Array.isArray(files)) throw new Error('`files` option must be an array.');
    files.forEach((file, i) => {
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
    this.#files = files;

    this.#length = files.reduce((sum, { length: len }) => sum + len, 0);
    total += this.#length;

    // sanity check
    if (!Number.isNaN(length) && length !== this.#length) {
      throw new Error(`total 'files' length (${this.#length}) is not equal to explicit 'length' option (${length}).`);
    }

    this.#lastChunkLength = (this.#length % this.chunkLength) || this.chunkLength;
    this.#lastChunkIndex = Math.ceil(this.#length / this.chunkLength) - 1;

    if (!infoHash) throw new Error('Missing `infoHash` in torrent option.');
    this.#infoHash = infoHash;

    this.#queues = new Map(files.map(({ path }) => [path, new PQueue({ concurrency: 1 })]));

    this.#buildChunkMap();
  }

  #buildChunkMap() {
    this.#files.forEach((file) => {
      const fileStart = file.offset;
      const fileEnd = fileStart + file.length;

      const firstChunk = Math.floor(fileStart / this.chunkLength);
      const lastChunk = Math.floor((fileEnd - 1) / this.chunkLength);

      for (let idx = firstChunk; idx <= lastChunk; ++idx) {
        const chunkStart = idx * this.chunkLength;
        const chunkEnd = chunkStart + this.chunkLength;

        const from = (fileStart < chunkStart) ? 0 : fileStart - chunkStart;
        const to = (fileEnd > chunkEnd) ? this.chunkLength : fileEnd - chunkStart;
        const offset = (fileStart > chunkStart) ? 0 : chunkStart - fileStart;

        let info = this.#chunkMap.get(idx);
        if (!info) {
          this.#chunkMap.set(idx, info = []);
        }
        info.push({
          from,
          to,
          offset,
          file,
        });
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
    this.#closed = true;
    cb();
  }

  async destroy(cb = () => { }) {
    try {
      const filenames = (await window.storageFoundation.getAll())
        .filter((filename) => filename.startsWith(this.#infoHash));
      await Promise.all(
        filenames.map((filename) => window.storageFoundation.delete(filename)),
      );
      await window.storageFoundation.releaseCapacity(this.#length);
    } catch (e) {
      cb(e);
      throw e;
    }
    cb();
  }

  /**
   * @param {number} index
   * @param {Buffer} buf
   * @param {(error: Error?) => undefined} [cb]
   * @returns {Promise<undefined>}
   */
  async put(index, buf, cb = () => { }) {
    try {
      if (this.#closed) throw new Error('Storage is closed.');
      await window.storageFoundation.requestCapacity(total);

      const isLastChunk = (index === this.#lastChunkIndex);
      if (isLastChunk && buf.length !== this.#lastChunkLength) {
        throw new Error(`Last chunk length must be ${this.#lastChunkLength}`);
      }
      if (!isLastChunk && buf.length !== this.chunkLength) {
        throw new Error(`Chunk length must be ${this.chunkLength}`);
      }

      const targets = this.#chunkMap.get(index);
      if (!targets) throw new Error('No files matching the request range.');
      await Promise.map(targets, async (target) => {
        const {
          from,
          to,
          offset,
          file: { path },
        } = target;
        return this.#queues.get(path).add(async () => {
          const shared = new SharedArrayBuffer(to - from);
          const view = new Uint8Array(shared);
          view.set(buf.slice(from, to));
          const file = await window.storageFoundation.open(this.#getStoreFileName(path));
          try {
            await file.write(view, offset);
          } finally {
            await file.close();
          }
        });
      }, { concurrency: 5 });

      cb();
    } catch (e) {
      error(e);
      cb(e);
      throw e;
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
    try {
      if (this.#closed) throw new Error('Storage is closed.');

      const chunkLength = (index === this.#lastChunkIndex)
        ? this.#lastChunkLength
        : this.chunkLength;
      const rangeFrom = options?.offset || 0;
      const rangeTo = options?.length ? rangeFrom + options?.length : chunkLength;
      if (rangeFrom < 0 || rangeFrom < 0 || rangeTo > chunkLength) {
        throw new Error('Invalid offset and/or length.');
      }

      if (!this.#chunkMap.has(index)) throw new Error('No files matching the request range.');

      const targets = this.#chunkMap.get(index)
        .filter((target) => (target.to > rangeFrom && target.from < rangeTo));
      if (targets.length === 0) {
        throw new Error('No files matching the requested range.');
      }

      if (rangeFrom === rangeTo) {
        const buf = Buffer.alloc(0);
        cb(null, buf);
        return buf;
      }

      const parts = await Promise.map(targets, async (target) => {
        let { from, to, offset } = target;
        const { file: { path } } = target;

        if (options) {
          if (to > rangeTo) to = rangeTo;
          if (from < rangeFrom) {
            offset += (rangeFrom - from);
            from = rangeFrom;
          }
        }

        return this.#queues.get(path).add(async () => {
          const shared = new SharedArrayBuffer(to - from);
          const view = new Uint8Array(shared);
          const file = await window.storageFoundation.open(this.#getStoreFileName(path));
          try {
            const read = await file.read(view, offset);
            return view.slice(0, read);
          } finally {
            await file.close();
          }
        });
      }, { concurrency: 5 });

      const result = Buffer.concat(parts);
      cb(null, result);
      return result;
    } catch (e) {
      error(e);
      cb(e);
      throw e;
    }
  }
}

export default StorageFoundationChunkStore;
