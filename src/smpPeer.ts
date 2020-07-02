import Peer from 'peerjs';

import { SMPStateMachine } from 'js-smp';
import { TLV } from 'js-smp/lib/msgs';

import { defaultPeerServerConfig, TPeerServerConfig } from './config';
import {
  ServerUnconnected,
  ServerFault,
  TimeoutError,
  EventUnsupported,
} from './exceptions';

const timeSleep = 10;
const defaultTimeout = 30000; // 30 seconds

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
 */
async function waitUntilStateMachineFinished(
  stateMachine: SMPStateMachine
): Promise<void> {
  while (!stateMachine.isFinished()) {
    await sleep(timeSleep);
  }
}

async function waitUntilStateMachineFinishedOrTimeout(
  stateMachine: SMPStateMachine,
  timeout: number
): Promise<void> {
  let timeoutID;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutID = setTimeout(
      () =>
        reject(
          new TimeoutError('state machine is not finished before timeout')
        ),
      timeout
    );
  });
  await Promise.race([
    waitUntilStateMachineFinished(stateMachine),
    timeoutPromise,
  ]);
  if (timeoutID !== undefined) {
    clearTimeout(timeoutID);
  }
}

const eventServerConnected = 'connected';
const eventServerDisconnected = 'disconnected';
const eventError = 'error';
const eventIncomingSMP = 'incoming';

type TSMPPeerEvent =
  | typeof eventServerConnected
  | typeof eventServerDisconnected
  | typeof eventError
  | typeof eventIncomingSMP;

type TCBServerConnected = () => void;
type TCBServerDisconnected = () => void;
type TCBError = (error: string) => void;
type TCBIncomingSMP = (remotePeerID: string, result: boolean) => void;
type TCBSMPPeer =
  | TCBServerConnected
  | TCBServerDisconnected
  | TCBError
  | TCBIncomingSMP;

class SMPPeer {
  secret: string;

  cbServerConnected?: TCBServerConnected;
  cbServerDisconnected?: TCBServerDisconnected;
  cbError?: TCBError;
  cbIncomingSMP?: TCBIncomingSMP;

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
    readonly peerServerConfig: TPeerServerConfig = defaultPeerServerConfig,
    readonly timeout: number = defaultTimeout
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
    localPeer.on('disconnected', () => {
      if (this.cbServerDisconnected !== undefined) {
        this.cbServerDisconnected();
      }
    });
    localPeer.on('error', (error: string) => {
      if (this.cbError !== undefined) {
        this.cbError(error);
      }
    });
    localPeer.on('connection', (conn: Peer.DataConnection) => {
      // A remote peer has connected us!
      console.debug(`Received a connection from ${conn.peer}`);

      // Emitted when the connection is established and ready-to-use.
      // Ref: https://peerjs.com/docs.html#dataconnection
      conn.on('open', async () => {
        const stateMachine = new SMPStateMachine(this.secret);
        conn.on('data', createConnDataHandler(stateMachine, conn));
        try {
          await waitUntilStateMachineFinishedOrTimeout(
            stateMachine,
            this.timeout
          );
        } catch (e) {
          console.error(`${e} is thrown when running SMP with peer=${conn.peer}`);
          return;
        }
        const result = stateMachine.getResult();
        console.debug(`Finished SMP with peer=${conn.peer}: result=${result}`);
        if (this.cbIncomingSMP !== undefined) {
          this.cbIncomingSMP(conn.peer, result);
        }
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
        if (this.cbServerConnected !== undefined) {
          this.cbServerConnected();
        }
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
    console.debug(`Connecting ${remotePeerID}...`);
    const stateMachine = new SMPStateMachine(this.secret);
    conn.on('open', async () => {
      console.debug(`Connection to ${conn.peer} is ready.`);
      const firstMsg = stateMachine.transit(null);
      // Sanity check
      if (firstMsg === null) {
        throw new Error('msg1 should not be null');
      }
      conn.on('data', createConnDataHandler(stateMachine, conn));
      conn.send(firstMsg.serialize());
    });
    await waitUntilStateMachineFinishedOrTimeout(stateMachine, this.timeout);
    return stateMachine.getResult();
  }

  /**
   * Disconnect from the peer server.
   */
  disconnect(): void {
    if (this.peer === undefined) {
      throw new ServerUnconnected(
        'need to be connected to a peer server to disconnect'
      );
    }
    this.peer.disconnect();
  }

  /**
   * Emitted when connected to the peer server.
   * @param event - Event name
   * @param cb - Callback function
   */
  on(event: typeof eventServerConnected, cb: TCBServerConnected): void;

  /**
   * Emitted when the connection to the peer server is closed.
   * @param event - Event name
   * @param cb - Callback function
   */
  on(event: typeof eventServerDisconnected, cb: TCBServerDisconnected): void;

  /**
   * Emitted when an error occurs in networking.
   * @param event - Event name
   * @param cb - Callback function
   */
  on(event: typeof eventError, cb: TCBError): void;

  /**
   * Emitted when an incoming SMP request is finished.
   * @param event - Event name
   * @param cb - Callback function
   */
  on(event: typeof eventIncomingSMP, cb: TCBIncomingSMP): void;

  /**
   * Set callback functions for events.
   * @param event - Event name
   * @param cb - Callback function
   */
  on(event: TSMPPeerEvent, cb: TCBSMPPeer) {
    if (event === eventServerConnected) {
      this.cbServerConnected = cb as TCBServerConnected;
    } else if (event === eventServerDisconnected) {
      this.cbServerDisconnected = cb as TCBServerDisconnected;
    } else if (event === eventIncomingSMP) {
      this.cbIncomingSMP = cb as TCBIncomingSMP;
    } else if (event === eventError) {
      this.cbError = cb as TCBError;
    } else {
      throw new EventUnsupported(`event unsupported: ${event}`);
    }
  }
}

export default SMPPeer;
