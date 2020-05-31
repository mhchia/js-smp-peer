/**
 * NOTE: Mock `Peer` with `MockPeer` since peerjs doesn't work w/ nodejs.
 * Ref:
 *  - https://github.com/mhchia/peek-a-book/issues/2
 *  - https://github.com/peers/peerjs/issues/606
 * Error: "node_modules/peerjs/dist/peerjs.min.js:48 ERROR PeerJS:  Error: The current browser does not support WebRTC"
 */

import { MockPeer } from './mock';
import SMPPeer from '../src/smpPeer';

jest.mock('peerjs', () => {
  return MockPeer;
});

describe('SMPPeer', () => {
  const params = [
    ['1', '1'],
    ['1', '2'],
  ]
  const expectedResults = [
    true,
    false,
  ];
  test('Succeeds', async () => {
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
  return (await alice.runSMP(peerIDB));
}
