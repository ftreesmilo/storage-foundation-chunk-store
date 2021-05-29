import './types.js';

export default class ChunkInfo {
  /**
   * @param {Array.<FileOption>} files
   * @returns {Map.<number, Array.<ChunkInfo>}
   */
  static buildChunkMap(chunkLength, files) {
    /** @type {Map.<number, Array.<ChunkInfo>>} */
    const map = new Map();

    files.forEach((file) => {
      const fileStart = file.offset;
      const fileEnd = fileStart + file.length;

      const firstChunk = Math.floor(fileStart / chunkLength);
      const lastChunk = Math.floor((fileEnd - 1) / chunkLength);

      for (let idx = firstChunk; idx <= lastChunk; ++idx) {
        const chunkStart = idx * chunkLength;
        const chunkEnd = chunkStart + chunkLength;

        const from = (fileStart < chunkStart) ? 0 : fileStart - chunkStart;
        const to = (fileEnd > chunkEnd) ? chunkLength : fileEnd - chunkStart;
        const offset = (fileStart > chunkStart) ? 0 : chunkStart - fileStart;

        let info = map.get(idx);
        if (!info) {
          map.set(idx, info = []);
        }
        info.push(new ChunkInfo(from, to, offset, file));
      }
    });
    return map;
  }

  from;

  to;

  offset;

  file;

  /**
   * @param {number} from start of the file in the chunk
   * @param {number} to end of the file in the chunk
   * @param {number} offset offset of the file in the chunk (`from` is not start of `file` if > 0)
   * @param {FileOption} file the file in the chunk
   */
  constructor(from, to, offset, file) {
    this.from = from;
    this.to = to;
    this.offset = offset;
    this.file = file;
  }
}
