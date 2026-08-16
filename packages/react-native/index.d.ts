// Public type declarations for mls4rn-react-native.
//
// The package ships TypeScript source (Metro transpiles it via the "react-native"
// field), but consumers typecheck against these declarations — so their React
// copy is never mixed with the package's during typechecking. Keep this in sync
// with src/ (a compiled .d.ts can replace it once the package has a build step).

import type { ReactElement, ReactNode } from "react";

export interface BridgeTransport {
  send(json: string): void;
}

export declare class Bridge {
  constructor(transport: BridgeTransport);
  get ready(): Promise<void>;
  request<T = unknown>(method: string, args: Record<string, unknown>): Promise<T>;
  handleMessage(raw: string): void;
}

export interface AddResult {
  welcome: Uint8Array;
  ratchetTree: Uint8Array;
  proposal: Uint8Array;
  commit: Uint8Array;
}

/** A key/value store for persistence — matches React Native's AsyncStorage. */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export declare class Group {
  add(keyPackage: Uint8Array): Promise<AddResult>;
  send(message: string): Promise<Uint8Array>;
  receiveText(ciphertext: Uint8Array): Promise<string | null>;
  exportKey(label: string, context: Uint8Array, length: number): Promise<Uint8Array>;
}

export declare class MlsClient {
  keyPackage(): Promise<Uint8Array>;
  createGroup(groupId: string): Promise<Group>;
  joinGroup(welcome: Uint8Array, ratchetTree: Uint8Array, groupId: string): Promise<Group>;
  group(groupId: string): Promise<Group | null>;
  save(): Promise<void>;
}

export declare class Mls {
  ready(): Promise<void>;
  newClient(name: string): Promise<MlsClient>;
  openClient(id: string): Promise<MlsClient>;
  save(): Promise<void>;
}

export declare function bytesToBase64(bytes: Uint8Array): string;
export declare function base64ToBytes(b64: string): Uint8Array;

export declare function MlsProvider(props: {
  children: ReactNode;
  storage?: KeyValueStore;
  storageKey?: string;
}): ReactElement;

export declare function useMls(): Mls;
