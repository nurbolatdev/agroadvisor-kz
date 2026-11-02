import { z } from 'zod'

// Messages are i18n keys; the screen translates them, so the language can change at any time.
const required = 'auth.errors.required'

export const loginSchema = z.object({
  login: z.string().trim().min(1, required).max(120),
  password: z.string().min(1, required).max(72, 'auth.errors.passwordLong'),
})

export const registerSchema = z.object({
  fullName: z.string().trim().min(1, required).max(120),
  login: z.string().trim().min(1, required).max(120),
  password: z
    .string()
    .min(8, 'auth.errors.passwordShort')
    .refine((value) => new TextEncoder().encode(value).length <= 72, 'auth.errors.passwordLong'),
})

export type LoginForm = z.infer<typeof loginSchema>
export type RegisterForm = z.infer<typeof registerSchema>
