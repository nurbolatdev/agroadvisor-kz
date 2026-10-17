import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'
import logo from '@/assets/brand/symbol-white.svg'
import { ROUTES } from '@/shared/constants/routes'

interface BrandLinkProps {
  onNavigate?: () => void
}

/** Logo block from the mockups: green square with the symbol, product name and role. */
export function BrandLink({ onNavigate }: BrandLinkProps) {
  const { t } = useTranslation()
  return (
    <NavLink to={ROUTES.dashboard} onClick={onNavigate} className="flex items-center gap-3 px-2">
      <span className="flex size-10 items-center justify-center rounded-[10px] bg-primary">
        <img src={logo} alt="AgroAdvisor KZ" className="size-7" />
      </span>
      <span className="flex flex-col">
        <span className="text-base leading-5.5 font-semibold text-text">AgroAdvisor KZ</span>
        <span className="text-[13px] leading-4.5 text-text-muted">{t('role.admin')}</span>
      </span>
    </NavLink>
  )
}
