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

export class Group {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    create_message(provider: Provider, sender: Identity, msg: Uint8Array): Uint8Array;
    static create_new(provider: Provider, founder: Identity, group_id: string): Group;
    export_key(provider: Provider, label: string, context: Uint8Array, key_length: number): Uint8Array;
    export_ratchet_tree(): RatchetTree;
    static join(provider: Provider, welcome: Uint8Array, ratchet_tree: RatchetTree): Group;
    /**
     * Reload a group's state from a restored provider's storage, for resuming a
     * session after a restart. Errors if no such group is stored.
     */
    static load(provider: Provider, group_id: string): Group;
    merge_pending_commit(provider: Provider): void;
    process_message(provider: Provider, msg: Uint8Array): Uint8Array;
    propose_and_commit_add(provider: Provider, sender: Identity, new_member: KeyPackage): AddMessages;
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
