import { useParams } from 'react-router-dom'

export function DiseaseDetailPage() {
  const { id } = useParams()

  return <h1 className="text-h1 text-primary-dark">Disease {id}</h1>
}
