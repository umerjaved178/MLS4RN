// Typed errors for the mls-ts facade.
//
// The generated wasm bindings throw bare `Error`s (and, for some malformed
// input, surface a Rust panic as a thrown error). That makes it hard for
// callers to tell "you passed me bad bytes" apart from "something genuinely
// went wrong". The facade catches those at the boundary and rethrows one of the
// classes below, so application code can branch on the error type and keep the
// original wasm error available as `.cause`.
//
// All of them extend `MlsError`, so `catch (e) { if (e instanceof MlsError) }`
// matches anything thrown by this library.

/** Base class for every error thrown by mls-ts. */
export class MlsError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "MlsError";
    // Preserve the original wasm error for debugging without leaking it into
    // the message. `cause` is standard since ES2022; set it defensively.
    if (options && "cause" in options) {
      (this as { cause?: unknown }).cause = options.cause;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** A JavaScript argument was the wrong type, empty, or otherwise unusable. */
export class InvalidArgumentError extends MlsError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "InvalidArgumentError";
  }
}

/** A value that should have been a serialized KeyPackage could not be parsed. */
export class InvalidKeyPackageError extends MlsError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "InvalidKeyPackageError";
  }
}

/** A Welcome or ratchet tree could not be parsed, or the join failed. */
export class InvalidWelcomeError extends MlsError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "InvalidWelcomeError";
  }
}

/** An incoming message could not be processed (malformed or unexpected). */
export class InvalidMessageError extends MlsError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "InvalidMessageError";
  }
}

/** A membership operation (add, remove, update, leave, commit) failed. */
export class GroupOperationError extends MlsError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GroupOperationError";
  }
}

/** A persisted snapshot was missing, corrupt, or an unsupported version. */
export class SnapshotError extends MlsError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SnapshotError";
  }
}

// --- Guards and wrappers used by the facade ---------------------------------

/** Require a non-empty `Uint8Array`, or throw `InvalidArgumentError`. */
export function requireBytes(value: unknown, name: string): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new InvalidArgumentError(`${name} must be a Uint8Array`);
  }
  if (value.length === 0) {
    throw new InvalidArgumentError(`${name} must not be empty`);
  }
  return value;
}

/** Require a non-empty string, or throw `InvalidArgumentError`. */
export function requireName(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new InvalidArgumentError(`${name} must be a non-empty string`);
  }
  return value;
}

/**
 * Run a wasm call and, if it throws, rethrow it as a typed `MlsError` built by
 * `make`. An error that is already an `MlsError` (for example from an inner
 * guard) is passed through unchanged.
 */
export function wasmCall<T>(fn: () => T, make: (cause: unknown) => MlsError): T {
  try {
    return fn();
  } catch (cause) {
    if (cause instanceof MlsError) throw cause;
    throw make(cause);
  }
}
