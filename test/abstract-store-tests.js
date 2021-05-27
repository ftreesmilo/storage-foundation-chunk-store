// These tests are assinine
// import tests from 'abstract-chunk-store/tests/index.js';
import Promise from 'bluebird';
import chai from 'chai';
import asPromised from 'chai-as-promised';
import Store from '../index.js';

chai.use(asPromised);
const { expect } = chai;

const length = 1024;
const torrent = { infoHash: '1234' };
const newstore = (chunkLength) => new Store(chunkLength, {
  length,
  torrent,
  files: [
    { path: 'tmp/multi1', length: length / 2 },
    { path: 'tmp/multi2', length: length / 2 },
  ],
});

describe('abstract-chunks-store tests', function () {
  const makeBuffer = (num) => {
    const buf = Buffer.alloc(10);
    buf.fill(num);
    return buf;
  };

  it('basic put, then get', async function () {
    const store = newstore(10);
    const expected = Buffer.from('0123456789');
    await store.put(0, expected);
    const actual = await store.get(0);
    expect(actual).to.deep.equal(expected);
  });

  it('put invalid chunk length gives error', async function () {
    const store = newstore(10);
    await expect(store.put(0, Buffer.from('0123'))).to.eventually.be.rejected;
    await store.destroy();
  });

  it('concurrent puts, then concurrent gets', async function () {
    const store = newstore(10);
    await Promise.map(new Array(100), async (elem, i) => {
      await store.put(i, makeBuffer(i));
    });
    await Promise.map(new Array(100), async (elem, i) => {
      const actual = await store.get(i);
      expect(actual).to.deep.equal(makeBuffer(i));
    });
  });

  it('interleaved puts and gets', async function () {
    const store = newstore(10);
    await Promise.map(new Array(100), async (elem, i) => {
      const expected = makeBuffer(i);
      await store.put(i, expected);
      const actual = await store.get(i);
      expect(actual).to.deep.equal(expected);
    });
  });

  it('get with `offset` and `length` options', async function () {
    const store = newstore(10);
    await store.put(0, Buffer.from('0123456789'));
    const actual = await store.get(0, { offset: 2, length: 3 });
    expect(actual).to.deep.equal(Buffer.from('234'));
  });

  it('get with null option', async function () {
    const store = newstore(10);
    const expected = Buffer.from('0123456789');
    await store.put(10, expected);
    const actual = await store.get(0, null);
    expect(actual).to.deep.equal(expected);
  });

  it('get with empty object option', async function () {
    const store = newstore(10);
    const expected = Buffer.from('0123456789');
    await store.put(10, expected);
    const actual = await store.get(0, {});
    expect(actual).to.deep.equal(expected);
  });

  it('get with `offset` option', async function () {
    const store = newstore(10);
    await store.put(0, Buffer.from('0123456789'));
    const actual = await store.get(0, { offset: 2 });
    expect(actual).to.deep.equal(Buffer.from('23456789'));
  });

  it('get with `length` option', async function () {
    const store = newstore(10);
    await store.put(0, Buffer.from('0123456789'));
    const actual = await store.get(0, { length: 5 });
    expect(actual).to.deep.equal(Buffer.from('01234'));
  });

  it('test for sparsely populated support', async function () {
    const store = newstore(10);
    const expected = Buffer.from('0123456789');
    await store.put(10, expected);
    const actual = await store.get(10);
    expect(actual).to.deep.equal(expected);
  });

  it('chunkLength property', async function () {
    const store = newstore(10);
    expect(store.chunkLength).to.equal(10);
    await store.destroy();
  });

  it('test empty store\'s `close` calls its callback', async function () {
    const store = newstore(10);
    await store.close();
    await store.destroy();
  });

  it('test non-empty store\'s `close` calls its callback', async function () {
    const store = newstore(10);
    await store.put(0, Buffer.from('0123456789'));
    await store.close();
    await store.destroy();
  });
});
