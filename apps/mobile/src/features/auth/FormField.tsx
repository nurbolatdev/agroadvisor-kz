import type { ComponentProps } from 'react'
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui'

type Props<T extends FieldValues> = Omit<
  ComponentProps<typeof Input>,
  'value' | 'onChangeText' | 'onBlur' | 'error' | 'label'
> & {
  control: Control<T>
  name: Path<T>
  label: string
}

// Input bound to react-hook-form; the error message is an i18n key, translated here.
export function FormField<T extends FieldValues>({ control, name, label, ...rest }: Props<T>) {
  const { t } = useTranslation()
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Input
          {...rest}
          label={label}
          value={field.value}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          error={fieldState.error?.message ? t(fieldState.error.message as never) : undefined}
        />
      )}
    />
  )
}
