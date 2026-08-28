/* tslint:disable */
/* eslint-disable */

export class AddMessages {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly commit: Uint8Array;
    readonly proposal: Uint8Array;
    readonly welcome: Uint8Array;
}

/**
 * Messages produced by a commit that is not an add: remove, update, leave, or a
 * batched commit of pending proposals. `proposal` is empty when the commit was
 * created directly from pending proposals (e.g. committing a received leave).
 * `welcome` is empty unless the batch also added members.
 */
export class CommitResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly commit: Uint8Array;
    readonly proposal: Uint8Array;
    readonly welcome: Uint8Array;
}

export class Group {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Commit all currently pending proposals (staged locally or received from
     * others). Produces a commit, plus a welcome if any adds were pending. The
     * committer must then merge.
     */
    commit_pending(provider: Provider, sender: Identity): CommitResult;
    create_message(provider: Provider, sender: Identity, msg: Uint8Array): Uint8Array;
    static create_new(provider: Provider, founder: Identity, group_id: string): Group;
    export_key(provider: Provider, label: string, context: Uint8Array, key_length: number): Uint8Array;
    export_ratchet_tree(): RatchetTree;
    /**
     * Whether this member is still an active participant. Returns false once the
     * member has been removed or has left (after merging that commit).
     */
    is_active(): boolean;
    static join(provider: Provider, welcome: Uint8Array, ratchet_tree: RatchetTree): Group;
    /**
     * Create a self-removal (leave) proposal. A member cannot commit its own
     * removal, so this returns only a proposal: another member commits it (via
     * [`Group::commit_pending`] after receiving it), which removes the leaver.
     */
    leave(provider: Provider, sender: Identity): Uint8Array;
    /**
     * Reload a group's state from a restored provider's storage, for resuming a
     * session after a restart. Errors if no such group is stored.
     */
    static load(provider: Provider, group_id: string): Group;
    /**
     * The identities (names) of the current group members.
     */
    members(): string[];
    merge_pending_commit(provider: Provider): void;
    process_message(provider: Provider, msg: Uint8Array): Uint8Array;
    /**
     * Stage an add proposal without committing (for batching several changes
     * into one commit). Returns the proposal to distribute.
     */
    propose_add(provider: Provider, sender: Identity, new_member: KeyPackage): Uint8Array;
    propose_and_commit_add(provider: Provider, sender: Identity, new_member: KeyPackage): AddMessages;
    /**
     * Remove a member, identified by its credential identity (the `name` it was
     * created with). Produces a proposal + commit to distribute to the other
     * members; the committer must then call [`Group::merge_pending_commit`].
     */
    propose_and_commit_remove(provider: Provider, sender: Identity, removed: string): CommitResult;
    /**
     * Rotate this member's own leaf key (an Update proposal). This is what
     * delivers post-compromise security. Produces a proposal + commit; the
     * committer must then merge.
     */
    propose_and_commit_update(provider: Provider, sender: Identity): CommitResult;
    /**
     * Stage a remove proposal without committing (for batching). Returns the
     * proposal to distribute.
     */
    propose_remove(provider: Provider, sender: Identity, removed: string): Uint8Array;
    /**
     * Stage a self-update proposal without committing (for batching).
     */
    propose_update(provider: Provider, sender: Identity): Uint8Array;
}

export class Identity {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Restore an identity from `name` plus bytes from [`Identity::serialize`].
     */
    static from_bytes(name: string, bytes: Uint8Array): Identity;
    key_package(provider: Provider): KeyPackage;
    constructor(provider: Provider, name: string);
    /**
     * Serialize this identity's signature key pair so it can be persisted and
     * restored. The public credential is rebuilt from `name` on restore.
     */
    serialize(): Uint8Array;
}

export class KeyPackage {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Deserialize a KeyPackage from bytes
     */
    static from_bytes(bytes: Uint8Array): KeyPackage;
    /**
     * Serialize this KeyPackage to bytes
     */
    to_bytes(): Uint8Array;
}

export class NoWelcomeError {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
}

export class Provider {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Restore a provider from bytes produced by [`Provider::serialize`].
     */
    static from_bytes(bytes: Uint8Array): Provider;
    constructor();
    /**
     * Snapshot this provider's entire storage (key material, group state,
     * secrets) to bytes, so it can be persisted and restored later.
     */
    serialize(): Uint8Array;
}

export class RatchetTree {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Deserialize a RatchetTree from bytes
     */
    static from_bytes(bytes: Uint8Array): RatchetTree;
    /**
     * Serialize this RatchetTree to bytes
     */
    to_bytes(): Uint8Array;
}

export function greet(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_addmessages_free: (a: number, b: number) => void;
    readonly __wbg_group_free: (a: number, b: number) => void;
    readonly __wbg_identity_free: (a: number, b: number) => void;
    readonly __wbg_keypackage_free: (a: number, b: number) => void;
    readonly __wbg_nowelcomeerror_free: (a: number, b: number) => void;
    readonly __wbg_provider_free: (a: number, b: number) => void;
    readonly __wbg_ratchettree_free: (a: number, b: number) => void;
    readonly addmessages_commit: (a: number) => any;
    readonly addmessages_proposal: (a: number) => any;
    readonly addmessages_welcome: (a: number) => any;
    readonly group_commit_pending: (a: number, b: number, c: number) => [number, number, number];
    readonly group_create_message: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly group_create_new: (a: number, b: number, c: number, d: number) => number;
    readonly group_export_key: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly group_export_ratchet_tree: (a: number) => number;
    readonly group_is_active: (a: number) => number;
    readonly group_join: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly group_leave: (a: number, b: number, c: number) => [number, number, number];
    readonly group_load: (a: number, b: number, c: number) => [number, number, number];
    readonly group_members: (a: number) => [number, number];
    readonly group_merge_pending_commit: (a: number, b: number) => [number, number];
    readonly group_process_message: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly group_propose_add: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly group_propose_and_commit_add: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly group_propose_and_commit_remove: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly group_propose_and_commit_update: (a: number, b: number, c: number) => [number, number, number];
    readonly group_propose_remove: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly group_propose_update: (a: number, b: number, c: number) => [number, number, number];
    readonly identity_from_bytes: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly identity_key_package: (a: number, b: number) => number;
    readonly identity_new: (a: number, b: number, c: number) => [number, number, number];
    readonly identity_serialize: (a: number) => [number, number, number, number];
    readonly keypackage_from_bytes: (a: number, b: number) => [number, number, number];
    readonly keypackage_to_bytes: (a: number) => [number, number];
    readonly provider_from_bytes: (a: number, b: number) => [number, number, number];
    readonly provider_new: () => number;
    readonly provider_serialize: (a: number) => [number, number];
    readonly ratchettree_from_bytes: (a: number, b: number) => [number, number, number];
    readonly ratchettree_to_bytes: (a: number) => [number, number];
    readonly greet: () => void;
    readonly commitresult_welcome: (a: number) => any;
    readonly commitresult_proposal: (a: number) => any;
    readonly commitresult_commit: (a: number) => any;
    readonly __wbg_commitresult_free: (a: number, b: number) => void;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_drop_slice: (a: number, b: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
