import { describe, expect, it } from 'vitest'
import { isSafeExternalUrl, isTrustedRendererUrl, MAIN_RENDERER_CSP } from './rendererSecurity'

describe(isTrustedRendererUrl.name, () => {
  it('accepts only packaged launcher origins in production', () => {
    expect(isTrustedRendererUrl('http://xmcl.runtime/index.html')).toBe(true)
    expect(isTrustedRendererUrl('http://app/settings')).toBe(true)
    expect(isTrustedRendererUrl('https://evil.example/app')).toBe(false)
    expect(isTrustedRendererUrl('http://xmcl.runtime.evil.example/')).toBe(false)
    expect(isTrustedRendererUrl('http://xmcl.runtime:8080/index.html')).toBe(false)
    expect(isTrustedRendererUrl('javascript:alert(1)')).toBe(false)
  })
})

describe(isSafeExternalUrl.name, () => {
  it('allows web URLs and rejects active operating-system schemes', () => {
    expect(isSafeExternalUrl('https://example.com/')).toBe(true)
    expect(isSafeExternalUrl('http://example.com/')).toBe(true)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('file:///C:/Windows/System32/calc.exe')).toBe(false)
    expect(isSafeExternalUrl('ms-settings:privacy')).toBe(false)
  })
})

describe('main renderer CSP', () => {
  it('blocks inline code, plugins and base URL rewriting', () => {
    expect(MAIN_RENDERER_CSP).not.toContain('unsafe-inline')
    expect(MAIN_RENDERER_CSP).not.toContain('unsafe-eval')
    expect(MAIN_RENDERER_CSP).toContain("object-src 'none'")
    expect(MAIN_RENDERER_CSP).toContain("base-uri 'none'")
  })
})
