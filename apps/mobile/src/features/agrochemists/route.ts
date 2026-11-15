// The list of agrochemists, opened from a diagnosis: its id travels on to the profile (where the results are
// sent), its crop is the first filter, and the name of the disease (when the result has one) is the line
// under the title. Nothing of the diagnosis itself goes into the route.
export function agrochemistsRoute(from: { diagnosisId: string; crop: string; name?: string }) {
  return {
    pathname: '/agrochemists' as const,
    params: {
      diagnosisId: from.diagnosisId,
      crop: from.crop,
      ...(from.name ? { name: from.name } : {}),
    },
  }
}
