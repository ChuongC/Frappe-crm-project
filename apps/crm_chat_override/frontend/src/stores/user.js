// stores/user.js
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { call } from 'frappe-ui'
import { sessionStore } from '@/stores/session'

export const useUserStore = defineStore('user', () => {
  const userEmail = ref('')
  const userName  = ref('')

  function initFromFrappe() {
    // Try window.frappe first (available after boot), fall back to sessionStore
    const f = window.frappe
    if (f?.session?.user && f.session.user !== 'Guest') {
      userEmail.value = f.session.user
      userName.value  = f.boot?.user_info?.full_name ?? f.session.user
      return
    }
    // Fallback: use CRM's own sessionStore (already loaded by the time ChatView mounts)
    const { user } = sessionStore()
    userEmail.value = user ?? ''
    userName.value  = window.frappe?.boot?.user_info?.full_name ?? user ?? ''
  }

  async function logout() {
    try {
      await call('logout')
    } finally {
      window.location.href = '/login'
    }
  }

  return { userEmail, userName, initFromFrappe, logout }
})