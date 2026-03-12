import { createRouter, createWebHistory } from 'vue-router'
import { usersStore } from '@/stores/users'
import { sessionStore } from '@/stores/session'
import { viewsStore } from '@/stores/views'

const handleMobileView = (componentName) => {
  return window.innerWidth < 768 ? `Mobile${componentName}` : componentName
}

const routes = [
  { path: '/', name: 'Home' },
  {
    path: '/notifications',
    name: 'Notifications',
    component: () => import('@/pages/MobileNotification.vue'),
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/pages/Dashboard.vue'),
  },
  {
    alias: '/leads',
    path: '/leads/view/:viewType?',
    name: 'Leads',
    component: () => import('@/pages/Leads.vue'),
  },
  {
    path: '/leads/:leadId',
    name: 'Lead',
    component: () => import(`@/pages/${handleMobileView('Lead')}.vue`),
    props: true,
  },
  {
    alias: '/deals',
    path: '/deals/view/:viewType?',
    name: 'Deals',
    component: () => import('@/pages/Deals.vue'),
  },
  {
    path: '/deals/:dealId',
    name: 'Deal',
    component: () => import(`@/pages/${handleMobileView('Deal')}.vue`),
    props: true,
  },
  {
    alias: '/notes',
    path: '/notes/view/:viewType?',
    name: 'Notes',
    component: () => import('@/pages/Notes.vue'),
  },
  {
    alias: '/tasks',
    path: '/tasks/view/:viewType?',
    name: 'Tasks',
    component: () => import('@/pages/Tasks.vue'),
  },
  {
    alias: '/contacts',
    path: '/contacts/view/:viewType?',
    name: 'Contacts',
    component: () => import('@/pages/Contacts.vue'),
  },
  {
    path: '/contacts/:contactId',
    name: 'Contact',
    component: () => import(`@/pages/${handleMobileView('Contact')}.vue`),
    props: true,
  },
  {
    alias: '/organizations',
    path: '/organizations/view/:viewType?',
    name: 'Organizations',
    component: () => import('@/pages/Organizations.vue'),
  },
  {
    path: '/organizations/:organizationId',
    name: 'Organization',
    component: () => import(`@/pages/${handleMobileView('Organization')}.vue`),
    props: true,
  },
  {
    alias: '/call-logs',
    path: '/call-logs/view/:viewType?',
    name: 'Call Logs',
    component: () => import('@/pages/CallLogs.vue'),
  },
  {
    path: '/calendar',
    name: 'Calendar',
    component: () => import('@/pages/Calendar.vue'),
  },
  {
    path: '/data-import',
    name: 'DataImportList',
    component: () => import('@/pages/DataImport.vue'),
  },
  {
    path: '/data-import/doctype/:doctype',
    name: 'NewDataImport',
    component: () => import('@/pages/DataImport.vue'),
    props: true,
  },
  {
    path: '/data-import/:importName',
    name: 'DataImport',
    component: () => import('@/pages/DataImport.vue'),
    props: true,
  },
  { path: '/welcome', name: 'Welcome', component: () => import('@/pages/Welcome.vue') },

  // ── Chat AI ────────────────────────────────────────────────────────────────
  {
    path: '/chat-ai',
    name: 'ChatAI',
    component: () => import('@/pages/ChatView.vue'),
  },
  // ──────────────────────────────────────────────────────────────────────────

  { path: '/not-permitted', name: 'Not Permitted', component: () => import('@/pages/NotPermitted.vue') },
  { path: '/:invalidpath',  name: 'Invalid Page',  component: () => import('@/pages/InvalidPage.vue') },
]

let router = createRouter({
  history: createWebHistory('/crm'),
  routes,
})

router.beforeEach(async (to, from, next) => {
  const { isLoggedIn } = sessionStore()
  const { users, isCrmUser } = usersStore()

  // ── 1. Not logged in at all → redirect to login ──────────────────────────
  if (!isLoggedIn) {
    window.location.href = `/login?redirect-to=/crm${to.path}`
    return
  }

  // ── 2. Load users if not yet fetched ─────────────────────────────────────
  if (!users.fetched) {
    try { await users.promise } catch (e) { console.error('Error loading users', e) }
  }

  // ── 3. ChatAI bypasses the CRM-user check — any Frappe user can use it ───
  if (to.name === 'ChatAI') {
    next()
    return
  }

  // ── 4. Non-CRM users are blocked from everything else ────────────────────
  if (to.name !== 'Not Permitted' && !isCrmUser()) {
    next({ name: 'Not Permitted' })
    return
  }

  // ── 5. Home redirect logic ────────────────────────────────────────────────
  if (to.name === 'Home') {
    const { views, getDefaultView } = viewsStore()
    await views.promise

    let defaultView = getDefaultView()
    if (!defaultView) { next({ name: 'Leads' }); return }

    let { route_name, type, name, is_standard } = defaultView
    route_name = route_name || 'Leads'

    if (name && !is_standard) {
      next({ name: route_name, params: { viewType: type }, query: { view: name } })
    } else {
      next({ name: route_name, params: { viewType: type } })
    }
    return
  }

  // ── 6. Remember last tab for Deal / Lead ──────────────────────────────────
  if (['Deal', 'Lead'].includes(to.name) && !to.hash) {
    const storageKey = to.name === 'Deal' ? 'lastDealTab' : 'lastLeadTab'
    const activeTab = localStorage.getItem(storageKey) || 'activity'
    next({ ...to, hash: '#' + activeTab })
    return
  }

  // ── 7. Default view resolution for list pages ─────────────────────────────
  if (
    ['Leads','Deals','Contacts','Organizations','Notes','Tasks','Call Logs'].includes(to.name) &&
    !to.query?.view
  ) {
    const { views, standardViews, getDefaultView } = viewsStore()
    await views.promise

    const viewType = to.params?.viewType ?? ''
    const standardViewTypes = ['list', 'kanban', 'group_by']

    if (!viewType) {
      const doctypeMap = {
        Leads: 'CRM Lead', Deals: 'CRM Deal', Contacts: 'Contact',
        Organizations: 'CRM Organization', Notes: 'FCRM Note',
        Tasks: 'CRM Task', 'Call Logs': 'CRM Call Log',
      }
      const doctype = doctypeMap[to.name]
      let defaultViewType = 'list'

      let globalDefault = getDefaultView()
      if (globalDefault && globalDefault.route_name === to.name) {
        defaultViewType = globalDefault.type || 'list'
        if (globalDefault.name && !globalDefault.is_standard) {
          next({ name: to.name, params: { viewType: defaultViewType }, query: { ...to.query, view: globalDefault.name } })
          return
        }
      }

      for (const vt of standardViewTypes) {
        const sv = standardViews.value?.[doctype + ' ' + vt]
        if (sv?.is_default) { defaultViewType = vt; break }
      }

      next({ name: to.name, params: { viewType: defaultViewType }, query: to.query })
    } else if (!standardViewTypes.includes(viewType)) {
      const view = views.data?.find((v) => v.name == viewType || v.label === viewType)
      if (view) {
        next({ name: to.name, params: { viewType: view.type || 'list' }, query: { ...to.query, view: view.name } })
      } else {
        next({ name: to.name, params: { viewType: 'list' }, query: to.query })
      }
    } else {
      next()
    }
    return
  }

  // ── 8. Catch-all ──────────────────────────────────────────────────────────
  if (to.matched.length === 0) {
    next({ name: 'Invalid Page' })
    return
  }

  next()
})

export default router