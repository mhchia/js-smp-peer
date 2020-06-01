import { randomBytes } from 'crypto';

type CBDataConnectionOpen = () => Promise<void>;
type CBDataConnectionData = (data: ArrayBuffer) => void;

class MockDataConnection {
  peer: string;
  openCB?: CBDataConnectionOpen;
  dataCB?: CBDataConnectionData;
  remoteConn?: MockDataConnection;
  constructor(peerID: string) {
    this.peer = peerID;
  }

  on(event: string, cb: CBDataConnectionOpen | CBDataConnectionData) {
    if (event === 'open') {
      // TODO: Add type checking here.
      this.openCB = cb as CBDataConnectionOpen;
      // Handle both sync and async.
      this.openCB();
    } else if (event === 'data') {
      this.dataCB = cb as CBDataConnectionData;
    } else {
      throw Error(`event ${event} is not supported`);
    }
  }

  setRemote(remoteConn: MockDataConnection) {
    this.remoteConn = remoteConn;
  }

  send(data: ArrayBuffer) {
    if (this.remoteConn === undefined || this.remoteConn.dataCB === undefined) {
      throw new Error();
    }
    this.remoteConn.dataCB(data);
  }
}

type CBPeerConnection = (conn: MockDataConnection) => void;
type CBPeerOpen = (id: string) => void;

const peers = new Map<string, MockPeer>();

class MockPeer {
  id: string;
  connectionCB?: CBPeerConnection;
  conns: Map<string, MockDataConnection>;

  constructor(id?: string, options?: any) {
    if (id === undefined) {
      this.id = randomBytes(32).toString('hex');
    } else {
      this.id = id;
    }
    this.conns = new Map();
    peers.set(this.id, this);
    console.log('MOCKED!');
  }

  on(event: string, cb: CBPeerOpen | CBPeerConnection): void {
    if (event === 'open') {
      (cb as CBPeerOpen)(this.id);
    } else if (event === 'connection') {
      this.connectionCB = cb as CBPeerConnection;
    } else {
      throw Error(`event ${event} is not supported`);
    }
  }

  connect(remotePeerID: string, options?: any) {
    const remotePeer = peers.get(remotePeerID);
    if (remotePeer === undefined) {
      throw new Error(`remotePeer=${remotePeer} is not discovered`);
    }
    if (
      this.connectionCB === undefined ||
      remotePeer.connectionCB === undefined
    ) {
      throw new Error("either `localPeer` or `remotePeer` hasn't called `on`");
    }
    const localConn = new MockDataConnection(this.id);
    const remoteConn = new MockDataConnection(remotePeerID);
    localConn.setRemote(remoteConn);
    remoteConn.setRemote(localConn);
    this.conns.set(remotePeerID, remoteConn);
    remotePeer.conns.set(this.id, localConn);

    // The callback of remote is called.
    remotePeer.connectionCB(remoteConn);

    return localConn;
  }

  static resetPeers() {
    peers.clear();
  }
}

class MockPeerWrongID extends MockPeer {
  constructor(id?: string, options?: any) {
    super(id, options);
    this.id = id + '123';
  }
}

export { MockPeer, MockPeerWrongID };
