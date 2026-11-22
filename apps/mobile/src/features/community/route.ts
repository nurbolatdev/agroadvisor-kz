// The new question, opened from a diagnosis: only its id and the code of its crop travel in the route. The
// diagnosis itself is read by the form, from the store or from the server. Empty params are left out.
export function askRoute(from: { diagnosisId?: string; crop?: string } = {}) {
  return {
    pathname: '/question/new' as const,
    params: {
      ...(from.diagnosisId ? { diagnosisId: from.diagnosisId } : {}),
      ...(from.crop ? { crop: from.crop } : {}),
    },
  }
}
