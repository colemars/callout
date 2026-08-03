declare const brand: unique symbol;

/**
 * Nominal typing helper: `Brand<string, "AccountId">` is assignable to string,
 * but a plain string is not assignable to it without an explicit constructor.
 */
export type Brand<T, B extends string> = T & { readonly [brand]: B };
