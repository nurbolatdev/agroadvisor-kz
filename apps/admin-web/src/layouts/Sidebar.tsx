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
import logo from '@/assets/brand/symbol-white.svg'
import { LanguageSwitcher } from '@/layouts/LanguageSwitcher'
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

function SidebarLink({ label, icon: Icon, to, badge }: NavItem) {
  return (
    <NavLink
      to={to}
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
        </span>
      ) : null}
    </NavLink>
  )
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-62 shrink-0 flex-col border-r border-border bg-white px-4 pt-5 pb-6 lg:flex">
      <NavLink to={ROUTES.dashboard} className="flex items-center gap-3 px-2">
        <span className="flex size-10 items-center justify-center rounded-[10px] bg-primary">
          <img src={logo} alt="AgroAdvisor KZ" className="size-7" />
        </span>
        <span className="flex flex-col">
          <span className="text-base leading-5.5 font-semibold text-text">AgroAdvisor KZ</span>
          <span className="text-[13px] leading-4.5 text-text-muted">Администратор</span>
        </span>
      </NavLink>

      <nav aria-label="Основная навигация" className="mt-3 flex flex-1 flex-col overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mt-3">
            <p className="mb-1 px-3 text-xs tracking-[0.04em] text-text-muted uppercase">
              {section.title}
            </p>
            <ul className="flex flex-col">
              {section.items.map((item) => (
                <li key={item.to}>
                  <SidebarLink {...item} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-3">
        <LanguageSwitcher />
        <SidebarLink {...SETTINGS_ITEM} />
      </div>
    </aside>
  )
}
