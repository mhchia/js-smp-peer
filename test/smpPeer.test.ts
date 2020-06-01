/**
 * NOTE: Mock `Peer` with `MockPeer` since peerjs doesn't work w/ nodejs.
 * Ref:
 *  - https://github.com/mhchia/peek-a-book/issues/2
 *  - https://github.com/peers/peerjs/issues/606
 * Error: "node_modules/peerjs/dist/peerjs.min.js:48 ERROR PeerJS:  Error: The current browser does not support WebRTC"
 */

import SMPPeer from '../src/smpPeer';

import {
  ServerFault,
  TimeoutError,
  ServerUnconnected,
} from '../src/exceptions';

import { MockPeer, MockPeerWrongID, MockPeerFakeSend } from './mock';

/**
 * NOTE: a reference to the mock class allows us to chnage the mock class
 *  on the fly.
 */
let mockPeerClass: typeof MockPeer = MockPeer;

function MockCtor(...args: any[]) {
  return new mockPeerClass(...args);
}

jest.mock('peerjs', () => {
  return MockCtor;
});

beforeEach(() => {
  // Set `MockPeer` as the mock peer class by default.
  mockPeerClass = MockPeer;
});

afterEach(() => {
  mockPeerClass.resetPeers();
});

describe('connectToPeerServer', () => {
  const secret = '123';
  const pid = 'pid';
  test('succeeds', async () => {
    const peer = new SMPPeer(secret, pid);
    await peer.connectToPeerServer();
  });

  test('fails when the peer server returns a different peer id', async () => {
    mockPeerClass = MockPeerWrongID;

    const peer = new SMPPeer(secret, pid);
    await expect(peer.connectToPeerServer()).rejects.toThrowError(ServerFault);
  });
});

describe('runSMP', () => {
  const params = [
    ['1', '1'],
    ['1', '2'],
  ];
  const expectedResults = [true, false];

  test('succeeds', async () => {
    for (const i in params) {
      const param = params[i];
      const expectedResult = expectedResults[i];
      const actual = await smp(param[0], param[1]);
      expect(actual).toEqual(expectedResult);
    }
  });

  test('fails when calling `runSMP` before running `connectToPeerServer`', async () => {
    const alice = new SMPPeer('1', 'A');
    const bob = new SMPPeer('1', 'B');
    await bob.connectToPeerServer();
    await expect(alice.runSMP(bob.id)).rejects.toThrowError(ServerUnconnected);
  });

  test('fails when the remote peer is not on the peer server', async () => {
    const alice = new SMPPeer('1', 'A');
    await alice.connectToPeerServer();
    await expect(alice.runSMP('B')).rejects.toThrow();
  });

  test('fails when timeout', async () => {
    // Mock `Peer` with `MockPeerFakeSend`. `runSMP` will timeout because
    // data is not sent to remote at all.
    mockPeerClass = MockPeerFakeSend;
    // A timeout smaller than the default one in jest's test.
    const timeout = 1;
    const alice = new SMPPeer('1', 'A', undefined, timeout);
    await alice.connectToPeerServer();
    const bob = new SMPPeer('1', 'B', undefined, timeout);
    await bob.connectToPeerServer();
    await expect(alice.runSMP(bob.id)).rejects.toThrow(TimeoutError);
  });
});

async function smp(x: string, y: string) {
  const peerIDA = 'A';
  const peerIDB = 'B';
  const alice = new SMPPeer(x, peerIDA);
  const bob = new SMPPeer(y, peerIDB);
  await alice.connectToPeerServer();
  await bob.connectToPeerServer();
  return await alice.runSMP(peerIDB);
}
