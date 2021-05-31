import Promise from 'bluebird';
import chai from 'chai';
import asPromised from 'chai-as-promised';
import { newstore, destroyStores } from './util.js';

// eslint-disable-next-line no-unused-vars
import StorageFoundationChunkStore from '../StorageFoundationChunkStore.js';

chai.use(asPromised);
const { expect } = chai;

describe('torrent store', function () {
  /** @type {Map.<string, StorageFoundationChunkStore} */
  const stores = new Map();

  afterEach(async function () {
    await destroyStores(stores);
    expect(StorageFoundationChunkStore.size).to.equal(0);
  });

  it('handles chunk values larger than the torrent length', async function () {
    const store = await newstore(stores, 100, 10);
    await store.put(0, Buffer.from('0123456789'));
    const actual = await store.get(0, { length: 10 });
    expect(actual).to.deep.equal(Buffer.from('0123456789'));
  });

  it('handles chunk values smaller than some files (str)', async function () {
    const store = await newstore(stores, 1, 10);

    await Promise.map('0123456789', (value, i) => store.put(i, Buffer.from(value)));
    const chunks = await Promise.map(new Array(10), (val, i) => store.get(i));
    const actual = Buffer.concat(chunks);
    expect(actual).to.deep.equal(Buffer.from('0123456789'));
  });

  it('handles chunk values smaller than some files (num)', async function () {
    const store = await newstore(stores, 1, 10);
    const data = [255, 155, 100, 31, 10, 5, 43, 22, 84, 6];
    await Promise.map(data, (value, i) => store.put(i, Buffer.from([value])));
    const chunks = await Promise.map(new Array(10), (val, i) => store.get(i));
    const actual = Buffer.concat(chunks);
    expect(actual).to.deep.equal(Buffer.from(data));
  });
});
