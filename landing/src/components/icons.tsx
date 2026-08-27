import type { SVGProps } from 'react'

// Small line-art icon set (24x24, stroke-based) — consistent style across all feature cards.
function Base(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={22}
      height={22}
      aria-hidden="true"
      {...props}
    />
  )
}

export function IconLink(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Base>
  )
}

export function IconEdit(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </Base>
  )
}

export function IconGrid(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.2" />
      <rect x="14" y="3" width="7" height="7" rx="1.2" />
      <rect x="14" y="14" width="7" height="7" rx="1.2" />
      <rect x="3" y="14" width="7" height="7" rx="1.2" />
    </Base>
  )
}

export function IconCode(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M16 18l6-6-6-6" />
      <path d="M8 6L2 12l6 6" />
    </Base>
  )
}

export function IconTransfer(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M17 3l4 4-4 4" />
      <path d="M21 7H9" />
      <path d="M7 21l-4-4 4-4" />
      <path d="M3 17h12" />
    </Base>
  )
}

export function IconLayout(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
      <path d="M3 9h6" />
    </Base>
  )
}

export function IconDownload(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </Base>
  )
}

export function IconMonitor(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </Base>
  )
}

export function IconSun(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93l1.41 1.41" />
      <path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M4.93 19.07l1.41-1.41" />
      <path d="M17.66 6.34l1.41-1.41" />
    </Base>
  )
}

export function IconMoon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </Base>
  )
}
