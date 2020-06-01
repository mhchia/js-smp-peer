// To workaround for the issue that "isinstance is borken when class extends `Error` type,
// we need to override `constructor` to set prototype for each error.
//  - https://github.com/Microsoft/TypeScript/issues/13965
//  - https://github.com/Microsoft/TypeScript/wiki/Breaking-Changes#extending-built-ins-like-error-array-and-map-may-no-longer-work

/**
 * The base error for `SMPPeer`.
 */
class SMPPeerError extends Error {
  constructor(m?: string) {
    super(m);
    // Set the prototype explicitly.
    Object.setPrototypeOf(this, SMPPeerError.prototype);
  }
}

/**
 * Thrown when there is something wrong with the peer server.
 */
class TimeoutError extends SMPPeerError {
  constructor(m?: string) {
    super(m);
    // Set the prototype explicitly.
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Thrown when we are not connected to the peer server.
 */
class ServerUnconnected extends SMPPeerError {
  constructor(m?: string) {
    super(m);
    // Set the prototype explicitly.
    Object.setPrototypeOf(this, ServerUnconnected.prototype);
  }
}

/**
 * Thrown when there is something wrong with the peer server.
 */
class ServerFault extends SMPPeerError {
  constructor(m?: string) {
    super(m);
    // Set the prototype explicitly.
    Object.setPrototypeOf(this, ServerFault.prototype);
  }
}

export { SMPPeerError, ServerUnconnected, ServerFault, TimeoutError };
