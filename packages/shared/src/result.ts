export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(r: Result<T, E>): r is { readonly ok: true; readonly value: T } {
  return r.ok;
}

export function isErr<T, E>(r: Result<T, E>): r is { readonly ok: false; readonly error: E } {
  return !r.ok;
}

/** Throws the error if the result is not ok. For boundaries and tests, not domain code. */
export function unwrap<T, E>(r: Result<T, E>): T {
  if (!r.ok) {
    throw r.error instanceof Error ? r.error : new Error(String(r.error));
  }
  return r.value;
}
