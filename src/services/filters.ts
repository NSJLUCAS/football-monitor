import { computed } from 'vue'
import { useRoute, useRouter, type LocationQuery } from 'vue-router'
import { useMonitorStore } from '../stores/monitor'

/**
 * The node group a page is narrowed to, kept in `?group=` so a refresh, a shared link and the next page
 * keep it: absent for every node, empty for the nodes without a group. A group Hub no longer has shows
 * everything rather than an empty page.
 */
export function useGroupFilter() {
  const route = useRoute(),
    router = useRouter(),
    store = useMonitorStore()
  return computed<string | null>({
    get: () => {
      const value = route.query.group
      if (typeof value !== 'string') return null
      return store.nodes.length && !store.nodes.some((n) => n.group === value) ? null : value
    },
    set: (value) => {
      const query = { ...route.query }
      if (value === null) delete query.group
      else query.group = value
      void router.replace({ query })
    },
  })
}

/** The part of a page's address that the main navigation carries to the next page. */
export const carriedQuery = (query: LocationQuery): LocationQuery =>
  typeof query.group === 'string' ? { group: query.group } : {}
