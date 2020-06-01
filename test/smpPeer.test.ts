/**
 * NOTE: Mock `Peer` with `MockPeer` since peerjs doesn't work w/ nodejs.
 * Ref:
 *  - https://github.com/mhchia/peek-a-book/issues/2
 *  - https://github.com/peers/peerjs/issues/606
 * Error: "node_modules/peerjs/dist/peerjs.min.js:48 ERROR PeerJS:  Error: The current browser does not support WebRTC"
 */

import SMPPeer from '../src/smpPeer';

import { ServerFault } from '../src/exceptions';

import { MockPeer, MockPeerWrongID } from './mock';

/**
 * NOTE: a reference to the mock class allows us to chnage the mock class
 *  on the fly.
 */
let mockPeerClass = MockPeer;

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
    await expect(peer.connectToPeerServer()).rejects.toThrow(ServerFault);
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
