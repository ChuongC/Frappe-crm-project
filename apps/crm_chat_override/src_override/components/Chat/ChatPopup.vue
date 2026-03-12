<script setup>
import { ref, watch, nextTick, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chat'
import { useUserStore } from '@/stores/user'
import { sessionStore } from '@/stores/session'

const emit  = defineEmits(['close'])
const router = useRouter()

const chatStore = useChatStore()
const userStore = useUserStore()

// ── State ─────────────────────────────────────────────────────────────────────
const messages    = ref([])
const isStreaming  = ref(false)
const inputText    = ref('')
const chatEnd      = ref(null)
const inputRef     = ref(null)
const showHistory  = ref(true)
let   abortCtrl    = null
let   msgCounter   = 0

const uid = () => `msg-${Date.now()}-${++msgCounter}`

const getCsrf = () =>
  window.csrf_token ||
  document.cookie.match(/X-Frappe-CSRF-Token=([^;]+)/)?.[1] || ''

const STREAM_URL = '/api/method/crm_chat_override.api.chat_api.chat_stream'

// ── Load conversations on mount ───────────────────────────────────────────────
onMounted(async () => {
  await chatStore.loadConversations()
  // Auto-select most recent conversation if any
  if (chatStore.conversations.length && !chatStore.currentConversationId) {
    chatStore.currentConversationId = chatStore.conversations[0].id
  }
  nextTick(() => inputRef.value?.focus())
})

// ── Switch conversation ────────────────────────────────────────────────────────
watch(() => chatStore.currentConversationId, async (id) => {
  abortCtrl?.abort()
  if (!id) { messages.value = []; return }
  const history = await chatStore.getHistory(id)
  messages.value = history
  nextTick(() => chatEnd.value?.scrollIntoView())
})

// ── Send ──────────────────────────────────────────────────────────────────────
const handleSend = async () => {
  const text = inputText.value.trim()
  if (!text || isStreaming.value) return
  inputText.value = ''

  if (!chatStore.currentConversationId) {
    await chatStore.createConversation()
  }

  messages.value = [...messages.value, { id: uid(), role: 'user', content: text }]
  const assistantId = uid()
  messages.value = [...messages.value, { id: assistantId, role: 'assistant', content: '' }]
  scrollBottom()

  isStreaming.value = true
  abortCtrl = new AbortController()

  try {
    const resp = await fetch(STREAM_URL, {
      method:  'POST',
      signal:  abortCtrl.signal,
      headers: {
        'Content-Type':        'application/json',
        'X-Frappe-CSRF-Token': getCsrf(),
        'X-Conversation-Id':   chatStore.currentConversationId ?? '',
      },
      body: JSON.stringify({ messages: messages.value.map(m => ({ role: m.role, content: m.content })) }),
    })

    if (!resp.ok) throw new Error(`${resp.status}`)

    const reader  = resp.body.getReader()
    const decoder = new TextDecoder()
    let   full    = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      full += decoder.decode(value, { stream: true })
      messages.value = messages.value.map(m =>
        m.id === assistantId ? { ...m, content: full } : m
      )
      scrollBottom()
    }

    if (full && chatStore.currentConversationId) {
      const { call } = await import('frappe-ui')
      await call('crm_chat_override.api.chat_api.save_message', {
        conversation_id: chatStore.currentConversationId,
        message: text, reply: full,
      }).catch(e => console.error('save_message:', e))
    }

  } catch (err) {
    if (err.name !== 'AbortError') {
      messages.value = messages.value.map(m =>
        m.id === assistantId ? { ...m, content: 'error: ' + err.message } : m
      )
    }
  } finally {
    isStreaming.value = false
    abortCtrl = null
    nextTick(() => inputRef.value?.focus())
  }
}

const newChat = async () => {
  abortCtrl?.abort()
  messages.value = []
  await chatStore.createConversation()
}

const selectConversation = (id) => {
  chatStore.currentConversationId = id
}

const expandToFullPage = () => {
  const route = router.resolve({ name: 'ChatAI' })
  window.open(route.href, '_blank')
  emit('close')
}

const scrollBottom = () =>
  nextTick(() => chatEnd.value?.scrollIntoView({ behavior: 'smooth' }))

const fmt = (text) => {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
}

const userInitial = computed(() => {
  const name = userStore.userName || sessionStore().user || '?'
  return name[0].toUpperCase()
})

// ── Conversation context menu ─────────────────────────────────────────────────
const menuOpenId   = ref(null)   // which conv has the menu open
const renamingId   = ref(null)   // which conv is being renamed
const renameText   = ref('')
const renameInput  = ref(null)

const openMenu = (e, id) => {
  e.stopPropagation()
  menuOpenId.value = menuOpenId.value === id ? null : id
}

const startRename = (conv) => {
  menuOpenId.value = null
  renamingId.value  = conv.id
  renameText.value  = conv.name
  nextTick(() => renameInput.value?.focus())
}

const commitRename = async (id) => {
  if (renameText.value.trim()) {
    await chatStore.renameConversation(id, renameText.value.trim())
  }
  renamingId.value = null
}

const confirmDelete = async (id) => {
  menuOpenId.value = null
  await chatStore.deleteConversation(id)
}

// Close popup on Escape, close menu on any doc click
const onKeydown = (e) => { if (e.key === 'Escape') emit('close') }
onMounted(()  => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <!-- Backdrop -->
  <div class="chat-popup-backdrop" @click.self="$emit('close')">

    <!-- Popup container -->
    <div class="chat-popup">

      <!-- LEFT: History panel -->
      <Transition name="history-slide">
        <div v-if="showHistory" class="chat-popup-history">
          <div class="chat-popup-history__header">
            <span>History</span>
          </div>

          <button class="chat-popup-new-btn" @click="newChat">
            + New Chat
          </button>

          <div class="chat-popup-conv-list">
            <div
              v-for="conv in chatStore.conversations"
              :key="conv.id"
              class="chat-popup-conv-item"
              :class="{ 'chat-popup-conv-item--active': conv.id === chatStore.currentConversationId }"
              @click="selectConversation(conv.id)"
            >
              <!-- Rename input mode -->
              <input
                v-if="renamingId === conv.id"
                ref="renameInput"
                v-model="renameText"
                class="chat-popup-conv-rename"
                @keydown.enter.prevent="commitRename(conv.id)"
                @keydown.escape.prevent="renamingId = null"
                @blur="commitRename(conv.id)"
                @click.stop
              />

              <!-- Normal display mode -->
              <template v-else>
                <span class="chat-popup-conv-item__name">{{ conv.name }}</span>

                <!-- ⋮ button -->
                <button
                  class="chat-popup-conv-item__menu-btn"
                  @click.stop="openMenu($event, conv.id)"
                  title="Options"
                >⋮</button>

                <!-- Dropdown -->
                <div
                  v-if="menuOpenId === conv.id"
                  class="chat-popup-conv-menu"
                  @click.stop
                >
                  <button @click="startRename(conv)">Rename</button>
                  <button class="chat-popup-conv-menu__delete" @click="confirmDelete(conv.id)">Delete</button>
                </div>
              </template>
            </div>
            <div v-if="!chatStore.conversations.length" class="chat-popup-conv-empty">
              No conversations yet
            </div>
          </div>
        </div>
      </Transition>

      <!-- RIGHT: Chat panel -->
      <div class="chat-popup-main">

        <!-- Header -->
        <div class="chat-popup-header">
          <button class="chat-popup-header__btn" @click="showHistory = !showHistory" title="Toggle history">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="3" y1="6"  x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>

          <span class="chat-popup-header__title">Chatbot</span>

          <div class="chat-popup-header__actions">
            <!-- Expand to full page -->
            <button class="chat-popup-header__btn" @click="expandToFullPage" title="Open full page">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 3 21 3 21 9"/>
                <polyline points="9 21 3 21 3 15"/>
                <line x1="21" y1="3" x2="14" y2="10"/>
                <line x1="3"  y1="21" x2="10" y2="14"/>
              </svg>
            </button>
            <!-- Close -->
            <button class="chat-popup-header__btn" @click="$emit('close')" title="Close">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6"  x2="6"  y2="18"/>
                <line x1="6"  y1="6"  x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Messages -->
        <div class="chat-popup-messages">
          <div v-if="messages.length === 0 && !isStreaming" class="chat-popup-empty">
            <p>Hello! How can I help?</p>
          </div>

          <div
            v-for="msg in messages"
            :key="msg.id"
            class="chat-popup-msg"
            :class="`chat-popup-msg--${msg.role}`"
          >
            <div class="chat-popup-bubble" :class="`chat-popup-bubble--${msg.role}`">
              <span v-if="msg.content" v-html="fmt(msg.content)" />
              <!-- typing dots while empty assistant placeholder -->
              <span v-else class="chat-popup-typing">
                <span></span><span></span><span></span>
              </span>
            </div>
          </div>

          <div ref="chatEnd" />
        </div>

        <!-- Input bar -->
        <div class="chat-popup-inputbar">
          <input
            ref="inputRef"
            v-model="inputText"
            class="chat-popup-input"
            placeholder="Type a message..."
            :disabled="isStreaming"
            @keydown.enter.exact.prevent="handleSend"
          />
          <button
            class="chat-popup-send"
            :disabled="!inputText.trim() || isStreaming"
            @click="handleSend"
          >
            Send
          </button>
        </div>

      </div>
    </div>
  </div>
</template>