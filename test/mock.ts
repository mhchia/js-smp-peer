import { randomBytes } from 'crypto';
import { ServerUnconnected } from '../src/exceptions';

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
      Promise.resolve(this.openCB()).then((_) => {});
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

class MockDataConnectionFakeSend extends MockDataConnection {
  send(data: ArrayBuffer) {
    // Send nothing!
  }
}

type CBPeerConnection = (conn: MockDataConnection) => void;
type CBPeerDisconnected = () => void;
type CBPeerOpen = (id: string) => void;
type CBError = (error: string) => void;

const peers = new Map<string, MockPeer>();

class MockPeer {
  id: string;
  connectionCB?: CBPeerConnection;
  disconnectedCB?: CBPeerDisconnected;
  errorCB?: CBError;
  conns: Map<string, MockDataConnection>;
  isConnectedToServer: boolean;

  constructor(id?: string, options?: any) {
    if (id === undefined) {
      this.id = randomBytes(32).toString('hex');
    } else {
      this.id = id;
    }
    this.conns = new Map();
    peers.set(this.id, this);
    this.isConnectedToServer = false;
  }

  on(event: string, cb: CBPeerOpen | CBPeerConnection | CBError): void {
    if (event === 'open') {
      (cb as CBPeerOpen)(this.id);
      this.isConnectedToServer = true;
    } else if (event === 'connection') {
      this.connectionCB = cb as CBPeerConnection;
    } else if (event === 'disconnected') {
      this.disconnectedCB = cb as CBPeerDisconnected;
    } else if (event === 'error') {
      this.errorCB = cb as CBError;
    } else {
      throw Error(`event ${event} is not supported`);
    }
  }

  connect(remotePeerID: string, options?: any) {
    if (!this.isConnectedToServer) {
      throw new ServerUnconnected('');
    }
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
    const localConn = new MockDataConnection(remotePeerID);
    const remoteConn = new MockDataConnection(this.id);
    localConn.setRemote(remoteConn);
    remoteConn.setRemote(localConn);
    this.conns.set(remotePeerID, remoteConn);
    remotePeer.conns.set(this.id, localConn);

    // The callback of remote is called.
    remotePeer.connectionCB(remoteConn);

    return localConn;
  }

  disconnect() {
    if (this.disconnectedCB !== undefined) {
      this.disconnectedCB();
    }
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

class MockPeerFakeSend extends MockPeer {
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
    // Use `MockDataConnectionFakeSend`, to prevent data from being sent.
    const localConn = new MockDataConnectionFakeSend(remotePeerID);
    const remoteConn = new MockDataConnectionFakeSend(this.id);
    localConn.setRemote(remoteConn);
    remoteConn.setRemote(localConn);
    this.conns.set(remotePeerID, remoteConn);
    remotePeer.conns.set(this.id, localConn);

    // The callback of remote is called.
    remotePeer.connectionCB(remoteConn);

    return localConn;
  }
}

class MockPeerErrorWhenRegiser extends MockPeer {
  on(event: string, cb: CBPeerOpen | CBPeerConnection | CBError): void {
    super.on(event, cb);
    if (event === 'error') {
      // Emit errors immediately if event == 'error'.
      if (this.errorCB === undefined) {
        throw new Error('`errorCB` should have been registered');
      }
      this.errorCB('ERROR!');
    }
  }
}

export {
  MockPeer,
  MockPeerWrongID,
  MockPeerFakeSend,
  MockPeerErrorWhenRegiser,
};
