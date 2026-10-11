const APP_VERSION = 'v0.1.0'

export function Footer() {
  return (
    <footer className="mt-8 border-t border-border py-4 text-caption font-normal text-text-muted">
      © {new Date().getFullYear()} AgroAdvisor KZ · {APP_VERSION}
    </footer>
  )
}
