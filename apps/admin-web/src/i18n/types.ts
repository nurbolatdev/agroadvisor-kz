/** Same keys as the Russian resource, any string values: kk and en must match ru exactly. */
export type Translation<T> = { [K in keyof T]: T[K] extends string ? string : Translation<T[K]> }
