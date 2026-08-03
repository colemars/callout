// Deliberately duplicated from @platform/shared: financial-core depends on
// NOTHING, including shared (see .dependency-cruiser.cjs "financial-core-is-pure").
declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };
