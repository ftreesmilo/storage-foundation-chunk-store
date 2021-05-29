import Promise from 'bluebird';
import { StorageFoundationChunkStore } from '../index.js';

/**
 * @param {Set.<Store>} stores
 * @param {number} chunkLength
 * @param {number} length
 * @param {{infoHash: string}} torrent
 * @returns
 */
export const newstore = async (
  stores,
  chunkLength,
  length = 1024,
  torrent = { infoHash: '1234' },
) => {
  const store = new StorageFoundationChunkStore(chunkLength, {
    length,
    torrent,
    files: [
      { path: 'b1', offset: 0, length: 1 },
      { path: 'c2', offset: 1, length: 2 },
      { path: 'a3', offset: 3, length: length - 3 },
    ],
  });
  stores.add(store);
  await store.ready;
  return store;
};

/**
 * @param {Set.<StorageFoundationChunkStore>} stores
 * @param {() => Promise)}
 */
export const destroyStores = async (stores, cb = async () => {}) => {
  await Promise.map(stores, async (store) => {
    await store.destroy();
    await cb(store);
  });
  stores.clear();
};
