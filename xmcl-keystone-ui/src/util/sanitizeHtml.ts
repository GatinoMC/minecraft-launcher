import DOMPurify from 'dompurify'

const RICH_TEXT_FORBIDDEN_TAGS = [
  'base',
  'button',
  'embed',
  'form',
  'iframe',
  'input',
  'link',
  'math',
  'meta',
  'object',
  'option',
  'script',
  'select',
  'style',
  'svg',
  'textarea',
]

function safeHttpUrl(value: string, base = 'https://www.curseforge.com/'): string | undefined {
  try {
    const url = new URL(value, base)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

/**
 * Sanitize network-provided rich text before it reaches Vue's `v-html` sink.
 * Links are normalized after DOMPurify so redirects and active URL schemes do
 * not regain script execution through an otherwise valid anchor.
 */
export function sanitizeExternalHtml(value: string): string {
  const sanitized = DOMPurify.sanitize(value, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target'],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    FORBID_ATTR: ['srcset', 'style'],
    FORBID_TAGS: RICH_TEXT_FORBIDDEN_TAGS,
  }) as string

  const root = document.createElement('div')
  root.innerHTML = sanitized

  for (const link of root.querySelectorAll<HTMLAnchorElement>('a')) {
    const rawHref = link.getAttribute('href') ?? ''
    let href = safeHttpUrl(rawHref)
    if (href) {
      const remoteUrl = new URL(href).searchParams.get('remoteUrl')
      if (remoteUrl) href = safeHttpUrl(remoteUrl)
    }
    if (!href) {
      link.removeAttribute('href')
      link.removeAttribute('target')
      link.removeAttribute('rel')
      continue
    }
    link.href = href
    link.target = 'browser'
    link.rel = 'noopener noreferrer'
  }

  for (const image of root.querySelectorAll<HTMLImageElement>('img')) {
    const src = safeHttpUrl(image.getAttribute('src') ?? '')
    if (src?.startsWith('https://')) {
      image.src = src
      image.removeAttribute('srcset')
      image.loading = 'lazy'
    } else {
      image.remove()
    }
  }

  return root.innerHTML
}

/** Sanitize remote category icons while allowing only inert SVG geometry. */
export function sanitizeSvgIcon(value: string): string {
  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS: ['svg', 'g', 'path', 'circle', 'ellipse', 'line', 'polygon', 'polyline', 'rect'],
    ALLOWED_ATTR: [
      'aria-hidden', 'class', 'cx', 'cy', 'd', 'fill', 'fill-rule', 'height', 'points',
      'preserveAspectRatio', 'r', 'rx', 'ry', 'stroke', 'stroke-linecap', 'stroke-linejoin',
      'stroke-width', 'viewBox', 'width', 'x', 'x1', 'x2', 'y', 'y1', 'y2',
    ],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
  }) as string
}
