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
import { NavLink } from 'react-router-dom'
import { BrandLink } from '@/layouts/BrandLink'
import { LanguageSwitcher } from '@/layouts/LanguageSwitcher'
import type { SidebarBadges } from '@/layouts/useSidebarCounters'
import { ROUTES } from '@/shared/constants/routes'

interface NavItem {
  label: string
  icon: LucideIcon
  to: string
  badge?: number
}

interface NavSection {
  title: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Аналитика',
    items: [
      { label: 'Обзор', icon: LayoutGrid, to: ROUTES.dashboard },
      { label: 'Качество ИИ', icon: Cpu, to: ROUTES.aiQuality },
      { label: 'Сообщество', icon: Users, to: ROUTES.community },
    ],
  },
  {
    title: 'Управление',
    items: [
      { label: 'Модерация', icon: Flag, to: ROUTES.moderation },
      { label: 'Верификация', icon: ShieldCheck, to: ROUTES.verification },
      { label: 'Пользователи', icon: User, to: ROUTES.users },
      { label: 'Агромагазины', icon: Store, to: ROUTES.shops },
      { label: 'Болезни и препараты', icon: Leaf, to: ROUTES.diseases },
    ],
  },
]

const SETTINGS_ITEM: NavItem = { label: 'Настройки', icon: Settings, to: ROUTES.settings }

function SidebarLink({
  label,
  icon: Icon,
  to,
  badge,
  onNavigate,
}: NavItem & { onNavigate?: () => void }) {
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
      <span className="flex-1 whitespace-nowrap">{label}</span>
      {badge ? (
        <span className="flex size-5 items-center justify-center rounded-full bg-danger text-xs font-bold text-white">
          {badge}
          <span className="sr-only"> новых</span>
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
  return (
    <>
      <BrandLink onNavigate={onNavigate} />

      <nav aria-label="Основная навигация" className="mt-3 flex flex-1 flex-col overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mt-3">
            <p className="mb-1 px-3 text-xs tracking-[0.04em] text-text-muted uppercase">
              {section.title}
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
