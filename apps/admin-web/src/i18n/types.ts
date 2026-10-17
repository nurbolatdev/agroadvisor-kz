/** Plural forms that Russian has and Kazakh or English do not. */
type ExtraPluralKey = `${string}_${'zero' | 'two' | 'few' | 'many'}`

/**
 * Same keys as the Russian resource, any string values: kk and en must match ru exactly,
 * except plural forms their language lacks (`_few`, `_many`), which are optional.
 */
export type Translation<T> = {
  [K in keyof T as K extends ExtraPluralKey ? never : K]: T[K] extends string
    ? string
    : Translation<T[K]>
} & { [K in keyof T as K extends ExtraPluralKey ? K : never]?: string }
