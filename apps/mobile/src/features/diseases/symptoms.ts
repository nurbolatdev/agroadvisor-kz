// The reference sends the symptoms of a disease as one text or as a list of texts (in the language that was
// asked for), and the generated type says only `unknown`. This turns whatever came into at most `max`
// short lines; anything else gives no lines.
export function shortSymptoms(symptoms: unknown, max = 2): string[] {
  if (typeof symptoms === 'string') return symptoms.trim() ? [symptoms.trim()] : []
  if (Array.isArray(symptoms)) {
    return symptoms
      .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
      .map((item) => item.trim())
      .slice(0, max)
  }
  return []
}
