type WasmAsyncInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;
/** A wasm module's Rust heap, from the allocator's counters. */
interface WasmHeapStats {
    /** Bytes allocated now. */
    liveBytes: number;
    /** The most bytes allocated at once since the module started. */
    peakBytes: number;
    /** Size of the allocation the memory could not satisfy, or 0. */
    failedAllocationBytes: number;
}
/** One instantiated wasm module's memory in this thread; heap counters only for modules that keep them. */
interface WasmModuleMemory extends Partial<WasmHeapStats> {
    label: string;
    /**
     * Size of its linear memory. It only grows, so it is also the module's
     * high-water mark.
     */
    bufferBytes: number;
}
/** The address space of a wasm32 memory: 4 GiB. */
declare const WASM32_MEMORY_LIMIT_BYTES: number;
/** The memory of every wasm module instantiated in this thread, by label. */
declare function wasmModuleMemories(): WasmModuleMemory[];

export { type WasmAsyncInput as W, type WasmModuleMemory as a, WASM32_MEMORY_LIMIT_BYTES as b, type WasmHeapStats as c, wasmModuleMemories as w };
