// These errors are intentional. Node ambient types must not enter browser code.
// @ts-expect-error Browser code has no Node process global.
export type NoProcess = typeof process;
// @ts-expect-error Browser code has no Node Buffer global.
export type NoBuffer = typeof Buffer;
// @ts-expect-error Browser code has no CommonJS require global.
export type NoRequire = typeof require;
export type BrowserDocument = typeof document;
