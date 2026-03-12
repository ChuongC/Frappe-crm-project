<script setup>
import { useUserStore } from '@/stores/user'
import { call } from 'frappe-ui'   // frappe-ui's call() automatically attaches the CSRF token

const userStore = useUserStore()

const logout = async () => {
  // Must POST with CSRF token — window.location.href (GET) causes 400 CSRFTokenError
  await call('logout')
  window.location.href = '/login'
}

const initial = () => (userStore.userName || userStore.userEmail || '?')[0].toUpperCase()
</script>

<template>
  <header class="chat-header">
    <div class="chat-header__left">
      <div class="chat-header__avatar-wrap">
        <!-- <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle  cx="12" cy="12" r="10"/>
          <path d="M12 16v-4M12 8h.01"/>
        </svg> -->
        <img src="../../assets/robot.png" alt="AI Avatar" width="16" height="16">
      </div>
      <div>
        <p class="chat-header__title">AI Assistant</p>
        <p class="chat-header__status">
          <span class="chat-header__dot"></span>Online
        </p>
      </div>
    </div>

    <div class="chat-header__right">
      <div class="chat-header__user">
        <span class="chat-header__user-name">{{ userStore.userName || userStore.userEmail }}</span>
        <div class="chat-header__user-avatar">{{ initial() }}</div>
      </div>
      <button class="chat-header__logout" @click="logout" title="Logout">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      </button>
    </div>
  </header>
</template>