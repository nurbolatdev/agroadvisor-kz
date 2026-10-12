import { cn } from '@/shared/utils/cn'

export interface AvatarProps {
  name: string
  size?: 'sm' | 'md'
  className?: string
}

const SIZE_CLASSES = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-small',
}

/** "Динара Ким" → "ДК", "Нурлан Б." → "НБ". */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

/** Round avatar with the person's initials; decorative, the name is always shown next to it. */
export function Avatar({ name, size = 'sm', className }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary',
        SIZE_CLASSES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
