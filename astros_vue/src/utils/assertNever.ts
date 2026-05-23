// Exhaustiveness guard for discriminated-union switches. The argument's
// `never` type makes the build fail if any union variant is unhandled at
// the call site, and the runtime throw documents the same expectation in
// case the type-check is ever bypassed (e.g., data crossing an `as` cast
// or a malformed wire payload reaching the consumer).
//
// Usage:
//   switch (kind) {
//     case 'a': ...
//     case 'b': ...
//     default: return assertNever(kind);
//   }
export function assertNever(value: never): never {
  throw new Error(`Unhandled discriminated-union variant: ${JSON.stringify(value)}`);
}
