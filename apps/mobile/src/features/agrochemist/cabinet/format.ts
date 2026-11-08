// The first word of the name: "Aigul Sarsenova" greets as "Aigul"
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? ''
}

// "4 Oct" in the language of the app
export function shortDate(iso: string, language: string): string {
  return new Date(iso).toLocaleDateString(language, { day: 'numeric', month: 'short' })
}
