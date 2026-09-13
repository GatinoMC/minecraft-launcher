// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { sanitizeExternalHtml, sanitizeSvgIcon } from './sanitizeHtml'

describe(sanitizeExternalHtml.name, () => {
  it('removes active content and dangerous URL schemes', () => {
    const result = sanitizeExternalHtml(`
      <img src="javascript:alert(1)" onerror="alert(2)">
      <svg onload="alert(3)"><path d="M0 0"></path></svg>
      <a href="javascript:alert(4)" onclick="alert(5)">bad</a>
      <p style="background:url(javascript:alert(6))">safe text</p>
    `)

    expect(result).toContain('safe text')
    expect(result).not.toMatch(/javascript:|onerror|onload|onclick|<svg|style=/i)
  })

  it('keeps HTTPS links and unwraps CurseForge remote links safely', () => {
    const result = sanitizeExternalHtml(
      '<a href="https://www.curseforge.com/linkout?remoteUrl=https%3A%2F%2Fexample.com%2Fpage">site</a>',
    )

    expect(result).toContain('href="https://example.com/page"')
    expect(result).toContain('target="browser"')
    expect(result).toContain('rel="noopener noreferrer"')
  })
})

describe(sanitizeSvgIcon.name, () => {
  it('keeps inert geometry and removes scripts, links and event handlers', () => {
    const result = sanitizeSvgIcon(`
      <svg viewBox="0 0 24 24" onload="alert(1)">
        <path d="M1 1h2v2z"></path>
        <script>alert(2)</script>
        <a href="javascript:alert(3)"><circle cx="2" cy="2" r="1"></circle></a>
      </svg>
    `)

    expect(result).toContain('<svg')
    expect(result).toContain('<path')
    expect(result).not.toMatch(/script|javascript:|onload|<a/i)
  })
})
