import { describe, expect, it } from 'vitest'
import type { RouteLocationNormalized } from 'vue-router'
import { router } from '../src/router'

const at = (path: string, query: Record<string, string> = {}, hash = '') =>
  ({ path, query, hash }) as unknown as RouteLocationNormalized

describe('router scroll behaviour', () => {
  const scroll = router.options.scrollBehavior!
  it('keeps the scroll position when only the query changes', () => {
    expect(scroll(at('/', { q: 'tok' }), at('/', { q: 'to' }), null)).toBe(false)
  })
  it('scrolls to the top on navigation and to a hash target', () => {
    expect(scroll(at('/node/1'), at('/', { q: 'x' }), null)).toEqual({ top: 0 })
    expect(scroll(at('/node/1', {}, '#score'), at('/'), null)).toEqual({ el: '#score', top: 20 })
  })
  it('has no About page route', () => {
    expect(router.getRoutes().some((r) => r.path === '/about')).toBe(false)
  })
})
