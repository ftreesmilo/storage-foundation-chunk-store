// These tests are assinine
// import tests from 'abstract-chunk-store/tests/index.js';
import Promise from 'bluebird';
import chai from 'chai';
import asPromised from 'chai-as-promised';
import { newstore, destroyStores } from './util.js';
import StorageFoundationChunkStore from '../StorageFoundationChunkStore.js';

chai.use(asPromised);
const { expect } = chai;

const makeBuffer = (num) => {
  const buf = Buffer.alloc(10);
  buf.fill(num);
  return buf;
};

describe('abstract-chunks-store tests', function () {
  /** @type {Set.<StorageFoundationChunkStore>} */
  const stores = new Set();

  afterEach(async function () {
    await destroyStores(stores);
    expect(StorageFoundationChunkStore.size).to.equal(0);
  });

  it('basic put, then get', async function () {
    const store = await newstore(stores, 10);
    await store.put(0, Buffer.from('0123456789'));
    const actual = await store.get(0);
    expect(actual).to.deep.equal(Buffer.from('0123456789'));
  });

  it('put invalid chunk length gives error', async function () {
    const store = await newstore(stores, 10);
    await expect(store.put(0, Buffer.from('0123'))).to.eventually.be.rejected;
  });

  it('concurrent puts, then concurrent gets', async function () {
    const store = await newstore(stores, 10);
    await Promise.map(new Array(100), async (elem, i) => {
      await store.put(i, makeBuffer(i));
    });
    await Promise.map(new Array(100), async (elem, i) => {
      const actual = await store.get(i);
      expect(actual).to.deep.equal(makeBuffer(i));
    });
  });

  it('interleaved puts and gets', async function () {
    const store = await newstore(stores, 10);
    await Promise.map(new Array(100), async (elem, i) => {
      await store.put(i, makeBuffer(i));
      const actual = await store.get(i);
      expect(actual).to.deep.equal(makeBuffer(i));
    });
  });

  it('get with `offset` and `length` options', async function () {
    const store = await newstore(stores, 10);
    await store.put(0, Buffer.from('0123456789'));
    const actual = await store.get(0, { offset: 2, length: 3 });
    expect(actual).to.deep.equal(Buffer.from('234'));
  });

  it('get with null option', async function () {
    const store = await newstore(stores, 10);
    await store.put(0, Buffer.from('0123456789'));
    const actual = await store.get(0, null);
    expect(actual).to.deep.equal(Buffer.from('0123456789'));
  });

  it('get with empty object option', async function () {
    const store = await newstore(stores, 10);
    await store.put(0, Buffer.from('0123456789'));
    const actual = await store.get(0, {});
    expect(actual).to.deep.equal(Buffer.from('0123456789'));
  });

  it('get with `offset` option', async function () {
    const store = await newstore(stores, 10);
    await store.put(0, Buffer.from('0123456789'));
    const actual = await store.get(0, { offset: 2 });
    expect(actual).to.deep.equal(Buffer.from('23456789'));
  });

  it('get with `length` option', async function () {
    const store = await newstore(stores, 10);
    await store.put(0, Buffer.from('0123456789'));
    const actual = await store.get(0, { length: 5 });
    expect(actual).to.deep.equal(Buffer.from('01234'));
  });

  it('test for sparsely populated support', async function () {
    const store = await newstore(stores, 10);
    await store.put(10, Buffer.from('0123456789'));
    const actual = await store.get(10);
    expect(actual).to.deep.equal(Buffer.from('0123456789'));
  });

  it('chunkLength property', async function () {
    const store = await newstore(stores, 10);
    expect(store.chunkLength).to.equal(10);
  });

  it('test empty store\'s `close` calls its callback', async function () {
    const store = await newstore(stores, 10);
    await store.close();
  });

  it('test non-empty store\'s `close` calls its callback', async function () {
    const store = await newstore(stores, 10);
    await store.put(0, Buffer.from('0123456789'));
    await store.close();
  });
});
