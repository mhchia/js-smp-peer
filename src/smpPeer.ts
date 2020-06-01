import Peer from 'peerjs';

import { SMPStateMachine } from 'js-smp';
import { TLV } from 'js-smp/lib/msgs';

import { defaultPeerServerConfig, TPeerServerConfig } from './config';
import { ServerUnconnected, ServerFault } from './exceptions';

const timeSleep = 10;

function createConnDataHandler(
  stateMachine: SMPStateMachine,
  conn: Peer.DataConnection
) {
  return (data: ArrayBuffer) => {
    const tlv = TLV.deserialize(new Uint8Array(data));
    const replyTLV = stateMachine.transit(tlv);
    if (replyTLV === null) {
      return;
    }
    conn.send(replyTLV.serialize());
  };
}

/* Utility functions */

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/**
 * Wait until `SMPStateMachine` is at the finished state.
 * TODO: Add timeout to avoid infinite waiting.
 */
async function waitUntilStateMachineFinished(
  stateMachine: SMPStateMachine
): Promise<void> {
  while (!stateMachine.isFinished()) {
    await sleep(timeSleep);
  }
}

class SMPPeer {
  secret: string;

  private peer?: Peer;

  /**
   * @param secret - The secret which will be used to run SMP protocol with the remote peer
   * @param localPeerID - Our peer id. We will "register" our peer id on the peer server later
   *  when calling `connectToPeerServer`.
   * @param peerServerConfig - The information of the peer server. `defaultPeerServerConfig` is
   *  used if this parameter is not supplied.
   */
  constructor(
    secret: string,
    readonly localPeerID?: string,
    readonly peerServerConfig: TPeerServerConfig = defaultPeerServerConfig
  ) {
    this.secret = secret;
  }

  /**
   * @returns Our peer id.
   * @throws `ServerUnconnected` if `id` is called when `SMPPeer` is not connected to the peer
   *  server.
   */
  get id(): string {
    // TODO: Probably shouldn't throw here, since it's reasonable(and benefitial sometimes) that
    //  `id` is called even it is not connected to the peer server. E.g. when a `SMPPeer` is
    //  disconnected from the peer server and is still running `runSMP` with other peers.
    if (this.peer === undefined) {
      throw new ServerUnconnected(
        'need to be connected to a peer server to discover other peers'
      );
    }
    return this.peer.id;
  }

  /**
   * Connect to the peer server with the infromation in `this.peerServerConfig`. A peer server
   *  allows us to discover peers and also others to find us. `connectToPeerServer` asynchronously
   *  waits until the connection to the peer server is established.
   * @throws `ServerFault` when the peer id we sent mismatches the one returned from the peer
   *  server.
   */
  async connectToPeerServer(): Promise<void> {
    const localPeer = new Peer(this.localPeerID, this.peerServerConfig);

    // Emitted when a new data connection is established from a remote peer.
    localPeer.on('connection', (conn: Peer.DataConnection) => {
      // A remote peer has connected us!
      console.log(`Received a connection from ${conn.peer}`);

      // Emitted when the connection is established and ready-to-use.
      // Ref: https://peerjs.com/docs.html#dataconnection
      conn.on('open', async () => {
        const stateMachine = new SMPStateMachine(this.secret);

        // Emitted when either you or the remote peer closes the data connection.
        // Not supported by Firefox.
        // conn.on('close', () => {});
        // Emitted when error occurs.
        // conn.on('error', () => {});
        // Emitted when data is received from the remote peer.
        conn.on('data', createConnDataHandler(stateMachine, conn));
        // TODO: Add `timeout`
        await waitUntilStateMachineFinished(stateMachine);
        console.log(
          `Finished SMP with peer=${
            conn.peer
          }: result=${stateMachine.getResult()}`
        );
        // TODO: Add `close` event
      });
    });
    // Wait until we are connected to the PeerServer
    await new Promise((resolve, reject) => {
      // Emitted when a connection to the PeerServer is established.
      localPeer.on('open', (id: string) => {
        // Sanity check
        // If we expect our PeerID to be `localPeerID` but the peer server returns another one,
        // we should be aware that something is wrong between us and the server.
        if (this.localPeerID !== undefined && id !== this.localPeerID) {
          reject(
            new ServerFault(
              'the returned id from the peer server is not the one we expect: ' +
                `returned=${id}, expected=${this.localPeerID}`
            )
          );
        }
        resolve(id);
        this.peer = localPeer;
      });
    });
  }

  /**
   * Run SMP protocol with a peer. Connecting with a peer server is required before calling
   *  `runSMP`.
   * @param remotePeerID - The id of the peer.
   * @throws `ServerUnconnected` when `runSMP` is called without connecting to a peer server.
   * @returns The result of SMP protocol, i.e. our secret is the same as the secret of the
   *  remote peer.
   */
  async runSMP(remotePeerID: string): Promise<boolean> {
    if (this.peer === undefined) {
      throw new ServerUnconnected(
        'need to be connected to a peer server to discover other peers'
      );
    }
    const conn = this.peer.connect(remotePeerID, { reliable: true });
    console.log(`Connecting ${remotePeerID}...`);
    const stateMachine = new SMPStateMachine(this.secret);
    conn.on('open', async () => {
      console.log(`Connection to ${conn.peer} is ready.`);
      const firstMsg = stateMachine.transit(null);
      // Sanity check
      if (firstMsg === null) {
        throw new Error('msg1 should not be null');
      }
      conn.on('data', createConnDataHandler(stateMachine, conn));
      conn.send(firstMsg.serialize());
      // TODO: Add `timeout`
    });
    await waitUntilStateMachineFinished(stateMachine);
    return stateMachine.getResult();
  }
}

export default SMPPeer;
