import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'

interface SectionPlaceholderProps {
  title: string
  subtitle: string
  icon: LucideIcon
  /** What the section will contain, so reviewers see the plan, not a blank page. */
  description: string
}

/** Page for sections that are planned after v0.1.0. */
export function SectionPlaceholder({
  title,
  subtitle,
  icon,
  description,
}: SectionPlaceholderProps) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <Card>
        <EmptyState icon={icon} title="Раздел в разработке" description={description} />
      </Card>
    </>
  )
}
