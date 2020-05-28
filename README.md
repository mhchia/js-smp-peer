# js-smp-peer

`js-smp-peer` lets you run [SMP(Socialist Millionaire Problem) Protocol][smp_paper] with other users through network connections. Check out the [wiki page][smp_wiki] to know more about SMP, and also the [paper][smp_paper] to understand the protocol.

Advantages of using `js-smp-peer`:
- Privacy: With SMP Protocol, users can compare their **secrets** without leaking any information. SMP Protocol implementation can be found in [`js-smp`][js_smp].
- Connection establishment at ease: A peer-to-peer connection is established for each run of SMP Protocol. Users don't need to worry about the annoying NAT traversals and other issues. They are handled by [`PeerJS`][peerjs], which utilizes [WebRTC][webrtc].

## Setup
Install the library with npm
```bash
npm install js-smp-peer
```

## Components

### SMPPeer
`SMPPeer` is the core of `js-smp-peer`. It can initiate SMP requests and handle the requests from others.

### Peer server
A Peer server makes the peers capable of discovering each others and exchanging necessary data used to establish WebRTC connections. We use [`PeerServer`][peerjs_server] which is supported by [`PeerJS`][peerjs]. Check out [`PeerServer`][peerjs_server] for more information.

## Usage

### Connect to the default peer server and run SMP with a peer
```typescript
import SMPPeer from 'js-smp-peer';

async function main() {
    // Secret is a plain string.
    const secret: string = 'my-secret';
    // Peer ID is the entity of you. It's a plain string as well.
    const peerID: string = 'my-peer-id';
    // Initialize a `SMPPeer`.
    const peer = new SMPPeer(secret, peerID);
    // Or you can omit `peerID`. The peer server will choose a uuid when connected to it.
    // const peer = new SMPPeer(secret);

    // Connect to the peer server, to contact or be contacted with the other peers.
    await peer.connectToPeerServer();

    // Run SMP with the peer whose id is "another-peer".
    const anotherPeer = 'another-peer';
    const result: boolean = await peer.runSMP(anotherPeer);
    console.log(`Finished running SMP with peer ${anotherPeer}, result=${result}`);
}

main();
```

### Use a custom peer server

By default, `SMPPeer` connects to the server specified in `defaultPeerConfig` in `src/config.ts`. You can connect to other peer servers by specifying a config when initializing `SMPPeer`.

```typescript
const customConfig = {
  host: 'my-server'
  port: 5566,
  path: '/myapp',
  secure: true,
};

// Connect to the custom peer server.
const peer = new SMPPeer(secret, peerID, customConfig);
```

[peerjs]: https://github.com/peers/peerjs
[peerjs_server]: https://github.com/peers/peerjs-server
[smp_wiki]: https://en.wikipedia.org/wiki/Socialist_millionaires
[smp_paper]: https://www.win.tue.nl/~berry/papers/dam.pdf
[js_smp]: https://github.com/mhchia/js-smp
[webrtc]: https://webrtc.org
