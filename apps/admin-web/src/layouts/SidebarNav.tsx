import {
  Cpu,
  Flag,
  LayoutGrid,
  Leaf,
  type LucideIcon,
  Settings,
  ShieldCheck,
  Store,
  User,
  Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'
import { BrandLink } from '@/layouts/BrandLink'
import { LanguageSwitcher } from '@/layouts/LanguageSwitcher'
import type { SidebarBadges } from '@/layouts/useSidebarCounters'
import { ROUTES } from '@/shared/constants/routes'

type NavKey =
  | 'dashboard'
  | 'aiQuality'
  | 'community'
  | 'moderation'
  | 'verification'
  | 'users'
  | 'shops'
  | 'diseases'
  | 'settings'

interface NavItem {
  labelKey: NavKey
  icon: LucideIcon
  to: string
  badge?: number
}

interface NavSection {
  titleKey: 'analytics' | 'management'
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    titleKey: 'analytics',
    items: [
      { labelKey: 'dashboard', icon: LayoutGrid, to: ROUTES.dashboard },
      { labelKey: 'aiQuality', icon: Cpu, to: ROUTES.aiQuality },
      { labelKey: 'community', icon: Users, to: ROUTES.community },
    ],
  },
  {
    titleKey: 'management',
    items: [
      { labelKey: 'moderation', icon: Flag, to: ROUTES.moderation },
      { labelKey: 'verification', icon: ShieldCheck, to: ROUTES.verification },
      { labelKey: 'users', icon: User, to: ROUTES.users },
      { labelKey: 'shops', icon: Store, to: ROUTES.shops },
      { labelKey: 'diseases', icon: Leaf, to: ROUTES.diseases },
    ],
  },
]

const SETTINGS_ITEM: NavItem = { labelKey: 'settings', icon: Settings, to: ROUTES.settings }

function SidebarLink({
  labelKey,
  icon: Icon,
  to,
  badge,
  onNavigate,
}: NavItem & { onNavigate?: () => void }) {
  const { t } = useTranslation('layout')
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      end={to === ROUTES.dashboard}
      className={({ isActive }) =>
        `flex h-10.5 items-center gap-3 rounded-[10px] px-3 text-[15px] leading-5 transition-colors ${
          isActive ? 'bg-primary-soft font-semibold text-primary-dark' : 'text-text hover:bg-bg'
        }`
      }
    >
      <Icon size={20} strokeWidth={2} aria-hidden="true" className="shrink-0" />
      <span className="flex-1 whitespace-nowrap">{t(`nav.${labelKey}`)}</span>
      {badge ? (
        <span className="flex size-5 items-center justify-center rounded-full bg-danger text-xs font-bold text-white">
          {badge}
          <span className="sr-only"> {t('nav.newItems')}</span>
        </span>
      ) : null}
    </NavLink>
  )
}

interface SidebarNavProps {
  badges: SidebarBadges
  /** Called after a link is clicked, e.g. to close the mobile menu. */
  onNavigate?: () => void
}

/** Menu content shared by the desktop sidebar and the mobile drawer. */
export function SidebarNav({ badges, onNavigate }: SidebarNavProps) {
  const { t } = useTranslation('layout')
  return (
    <>
      <BrandLink onNavigate={onNavigate} />

      <nav aria-label={t('nav.label')} className="mt-3 flex flex-1 flex-col overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={t(`nav.groups.${section.titleKey}`)} className="mt-3">
            <p className="mb-1 px-3 text-xs tracking-[0.04em] text-text-muted uppercase">
              {t(`nav.groups.${section.titleKey}`)}
            </p>
            <ul className="flex flex-col">
              {section.items.map((item) => (
                <li key={item.to}>
                  <SidebarLink {...item} badge={badges[item.to]} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-3">
        <LanguageSwitcher />
        <SidebarLink {...SETTINGS_ITEM} onNavigate={onNavigate} />
      </div>
    </>
  )
}
