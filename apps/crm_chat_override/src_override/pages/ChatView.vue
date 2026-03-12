<script setup>
// ─────────────────────────────────────────────────────────────────────────────
// ChatView.vue
//
// We DO NOT use the Chat class from @ai-sdk/vue for HTTP — its transport layer
// ignores the custom `fetch` option and always hits /api/chat.
//
// Instead we drive streaming with native fetch() + ReadableStream, which gives
// us full control over URL, headers, and CSRF. Vue refs handle all state.
// ─────────────────────────────────────────────────────────────────────────────
import { ref, watch, nextTick, computed } from 'vue'
import { sessionStore } from '@/stores/session'
import { useChatStore } from '@/stores/chat'
import { useUserStore } from '@/stores/user'
import Header    from '@/components/Chat/Header.vue'
import ChatInput from '@/components/Chat/ChatInput.vue'
import Sidebar   from '@/components/Chat/Sidebar.vue'

const chatStore = useChatStore()
const userStore = useUserStore()

const isReady   = ref(false)
const authError = ref('')
const chatEnd   = ref(null)
const inputRef  = ref(null)

// ── Chat state ────────────────────────────────────────────────────────────────
const messages   = ref([])   // { id, role, content }[]
const isStreaming = ref(false)
const streamError = ref(null)
let   abortCtrl   = null

// ── Helpers ───────────────────────────────────────────────────────────────────
let msgCounter = 0
const uid = () => `msg-${Date.now()}-${++msgCounter}`

const getCsrf = () =>
  window.csrf_token ||
  document.cookie.match(/X-Frappe-CSRF-Token=([^;]+)/)?.[1] ||
  ''

const STREAM_URL = '/api/method/crm_chat_override.api.chat_api.chat_stream'

// ── Streaming send ────────────────────────────────────────────────────────────
const sendToRAG = async (text) => {
  if (isStreaming.value) return
  streamError.value = null

  // Add user message immediately
  messages.value = [...messages.value, { id: uid(), role: 'user', content: text }]
  scrollBottom()

  // Placeholder for the streaming assistant reply
  const assistantId = uid()
  messages.value = [...messages.value, { id: assistantId, role: 'assistant', content: '' }]

  isStreaming.value = true
  abortCtrl = new AbortController()

  try {
    const resp = await fetch(STREAM_URL, {
      method: 'POST',
      signal: abortCtrl.signal,
      headers: {
        'Content-Type':        'application/json',
        'X-Frappe-CSRF-Token': getCsrf(),
        'X-Conversation-Id':   chatStore.currentConversationId ?? '',
      },
      body: JSON.stringify({
        // Send full conversation history so RAG has context
        messages: messages.value
          .filter((m) => m.role !== 'assistant' || m.content)
          .map((m) => ({ role: m.role, content: m.content })),
      }),
    })

    if (!resp.ok) {
      const err = await resp.text()
      throw new Error(`Server error ${resp.status}: ${err}`)
    }

    // Stream plain text chunks into the assistant message
    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let fullReply = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      fullReply += chunk
      // Update the last assistant message reactively
      messages.value = messages.value.map((m) =>
        m.id === assistantId ? { ...m, content: fullReply } : m
      )
      scrollBottom()
    }

    // Persist to Frappe DB after stream completes
    if (fullReply && chatStore.currentConversationId) {
      try {
        const { call } = await import('frappe-ui')
        await call('crm_chat_override.api.chat_api.save_message', {
          conversation_id: chatStore.currentConversationId,
          message: text,
          reply:   fullReply,
        })
      } catch (e) { console.error('save_message:', e) }
    }

  } catch (err) {
    if (err.name === 'AbortError') {
      // User hit Stop — keep whatever was streamed
    } else {
      console.error('stream error:', err)
      streamError.value = err
      // Replace empty placeholder with error message
      messages.value = messages.value.map((m) =>
        m.id === assistantId
          ? { ...m, content: 'error: ' + (err.message || 'Something went wrong.') }
          : m
      )
    }
  } finally {
    isStreaming.value = false
    abortCtrl = null
  }
}

const stopStreaming = () => {
  abortCtrl?.abort()
}

// ── Markdown formatter ────────────────────────────────────────────────────────
const fmt = (text) => {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g,     '<em>$1</em>')
    .replace(/`(.*?)`/g,       '<code>$1</code>')
    .replace(/\n/g,            '<br>')
}

// ── Auto-scroll ───────────────────────────────────────────────────────────────
const scrollBottom = () =>
  nextTick(() => chatEnd.value?.scrollIntoView({ behavior: 'smooth' }))

// ── Send handler ──────────────────────────────────────────────────────────────
const handleSend = async (text) => {
  if (!chatStore.currentConversationId) {
    await chatStore.createConversation()
  }
  await sendToRAG(text)
  nextTick(() => inputRef.value?.focus())
}

// ── Switch conversations ──────────────────────────────────────────────────────
watch(() => chatStore.currentConversationId, async (id) => {
  stopStreaming()
  if (!id) { messages.value = []; return }
  const history = await chatStore.getHistory(id)
  messages.value = history
  scrollBottom()
})

// ── Mount ─────────────────────────────────────────────────────────────────────
const { user } = sessionStore()
const email = user || window.frappe?.session?.user
console.log('[ChatView] Auth as:', email)

if (!email || email === 'Guest') {
  authError.value = 'Please log in to use the AI assistant.'
} else {
  userStore.initFromFrappe?.()
  chatStore.loadConversations().then(() => { isReady.value = true })
}
</script>

<template>
  <div v-if="authError" class="chat-state chat-state--error">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
    <p>{{ authError }}</p>
  </div>

  <div v-else-if="!isReady" class="chat-state">
    <div class="chat-state__spinner"></div>
    <p>Loading assistant…</p>
  </div>

  <div v-else class="chat-shell">
    <Sidebar />

    <div class="chat-main">
      <Header />

      <div class="chat-messages" id="chat-messages">

        <div v-if="messages.length === 0 && !isStreaming" class="chat-empty">
          <div class="chat-empty__icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <p class="chat-empty__title">How can I help you today?</p>
          <p class="chat-empty__sub">Ask me anything about your CRM data, contacts, or leads.</p>
        </div>

        <TransitionGroup name="msg" tag="div" class="chat-messages__list">
          <div
            v-for="msg in messages"
            :key="msg.id"
            class="msg-row"
            :class="`msg-row--${msg.role}`"
          >
            <div v-if="msg.role === 'assistant'" class="msg-avatar msg-avatar--ai">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4M12 8h.01"/>
              </svg>
            </div>

            <div class="msg-bubble" :class="`msg-bubble--${msg.role}`">
              <span v-html="fmt(msg.content)" />
            </div>

            <div v-if="msg.role === 'user'" class="msg-avatar msg-avatar--user">
              {{ (userStore.userName || '?')[0].toUpperCase() }}
            </div>
          </div>
        </TransitionGroup>

        <!-- Typing indicator: streaming but last message is still empty -->
        <div
          v-if="isStreaming && !messages[messages.length - 1]?.content"
          class="msg-row msg-row--assistant"
        >
          <div class="msg-avatar msg-avatar--ai">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
          </div>
          <div class="msg-bubble msg-bubble--assistant msg-bubble--typing">
            <span></span><span></span><span></span>
          </div>
        </div>

        <div ref="chatEnd" />
      </div>

      <div v-if="isStreaming" class="chat-stop-wrap">
        <button class="chat-stop-btn" @click="stopStreaming">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="4" width="16" height="16" rx="2"/>
          </svg>
          Stop generating
        </button>
      </div>

      <ChatInput ref="inputRef" :disabled="isStreaming" @send="handleSend" />
    </div>
  </div>
</template>