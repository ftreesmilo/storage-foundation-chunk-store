import Promise from 'bluebird';
import chai from 'chai';
import asPromised from 'chai-as-promised';
import { newstore, destroyStores } from './util.js';
import NativeIOFileManager from '../NativeIOFileManager.js';
import { StorageFoundationChunkStore } from '../index.js';

const {
  getAll,
  delete: deleteFile,
  releaseCapacity,
  getRemainingCapacity,
} = NativeIOFileManager;

chai.use(asPromised);
const { expect } = chai;

describe('storage', function () {
  /** @type {Set.<StorageFoundationChunkStore>} */
  const stores = new Set();

  beforeEach(async function () {
    await Promise.each(getAll(), deleteFile);
    const capacity = await getRemainingCapacity();
    if (capacity) {
      console.warn(`uncollected capacity: ${capacity}`);
      await releaseCapacity(capacity);
    }
    expect(await getAll()).to.deep.equal([]);
    expect(await getRemainingCapacity()).to.equal(0);
  });

  afterEach(async function () {
    const size = await Promise.reduce(stores, (prev, store) => prev + store.length, 0);
    expect(size).to.be.greaterThan(0);
    expect(StorageFoundationChunkStore.size).to.equal(size);
    await destroyStores(stores);
    expect(StorageFoundationChunkStore.size).to.equal(0);
    expect(await getRemainingCapacity()).to.equal(0);
  });

  /**
   * The store contains 3 files
   * 1st file: 1 byte
   * 2nd file: 2 bytes
   * 3rd file: 7 bytes
   * The store total size is 10 bytes
   * The store has 2 chunks that spans all 3 files, 5 bytes each
   */
  it('is empty before and after tests (write 1st chunk)', async function () {
    const length = 10;
    const store = await newstore(stores, 5, length);
    expect(store.length).to.equal(length);
    expect(StorageFoundationChunkStore.size).to.equal(length);
    expect(await getRemainingCapacity()).to.equal(0);
    await store.put(0, Buffer.from('01234'));
    expect(await getRemainingCapacity()).to.equal(0);
  });

  /**
   * The store contains 3 files
   * 1st file: 1 byte
   * 2nd file: 2 bytes
   * 3rd file: 7 bytes
   * The store total size is 10 bytes
   * The store has 2 chunks that spans all 3 files, 5 bytes each
   */
  it('is empty before and after tests (write 2nd chunk)', async function () {
    const length = 10;
    const store = await newstore(stores, 5, length);
    expect(store.length).to.equal(length);
    expect(StorageFoundationChunkStore.size).to.equal(length);
    expect(await getRemainingCapacity()).to.equal(0);
    await store.put(1, Buffer.from('01234'));
    expect(await getRemainingCapacity()).to.equal(0);
  });

  it('total size is sum of all stores', async function () {
    const length = 10;
    // The store contains 3 files
    // 1st file: 1 byte
    // 2nd file: 2 bytes
    // 3rd file: 7 bytes
    // The store total size is 10 bytes
    // The store has 1 chunk that spans all 3 files, 10 bytes
    const store1 = await newstore(stores, 100, length, { infoHash: 'store1' });
    await store1.put(0, Buffer.from('0123456789'));
    expect(StorageFoundationChunkStore.size).to.equal(length);
    expect(await getRemainingCapacity()).to.equal(0);
    // The store contains 3 files
    // 1st file: 1 byte
    // 2nd file: 2 bytes
    // 3rd file: 17 bytes
    // The store total size is 20 bytes
    // The store has 2 chunks that spans all 3 files, 10 bytes each
    const store2 = await newstore(stores, 10, length * 2, { infoHash: 'store2' });
    await store2.put(0, Buffer.from('0123456789'));
    expect(StorageFoundationChunkStore.size).to.equal(length * 3);
    expect(await getRemainingCapacity()).to.equal(0);
    // The store contains 3 files
    // 1st file: 1 byte
    // 2nd file: 2 bytes
    // 3rd file: 17 bytes
    // The store total size is 20 bytes
    // The store has 2 chunks that spans all 3 files, 10 bytes each
    const store3 = await newstore(stores, 10, length * 2, { infoHash: 'store3' });
    await store3.put(1, Buffer.from('0123456789'));
    expect(StorageFoundationChunkStore.size).to.equal(50);
    expect(await getRemainingCapacity()).to.equal(0);
  });
});
