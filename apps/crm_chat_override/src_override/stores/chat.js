
// Responsibility: conversation LIST management only (sidebar CRUD).
// Message streaming is handled entirely by useChat() in ChatView.vue.

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { call } from 'frappe-ui'

const M = (fn) => `crm_chat_override.api.chat_api.${fn}`

export const useChatStore = defineStore('chat', () => {
  const conversations         = ref([])
  const currentConversationId = ref(null)
  const isSidebarOpen         = ref(true)

  // ── Load ───────────────────────────────────────────────────────────────────

  const loadConversations = async () => {
    try {
      const r = await call(M('get_conversations'))
      conversations.value = [...(r?.conversations ?? [])].reverse()
    } catch (e) { console.error('loadConversations:', e) }
  }

  // ── Create ────────────────────────────────────────────────────────────────

  const createConversation = async () => {
    try {
      const r = await call(M('create_conversation'), { name: 'New Conversation' })
      const c = r?.conversation
      if (c) {
        conversations.value.unshift(c)
        currentConversationId.value = c.id
      }
      return c
    } catch (e) { console.error('createConversation:', e) }
  }

  // ── Rename ────────────────────────────────────────────────────────────────

  const renameConversation = async (id, name) => {
    if (!name.trim()) return
    try {
      await call(M('rename_conversation'), { conversation_id: id, name: name.trim() })
      const c = conversations.value.find((c) => c.id === id)
      if (c) c.name = name.trim()
    } catch (e) { console.error('renameConversation:', e) }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  const deleteConversation = async (id) => {
    try {
      await call(M('delete_conversation'), { conversation_id: id })
      conversations.value = conversations.value.filter((c) => c.id !== id)
      if (currentConversationId.value === id) {
        currentConversationId.value = conversations.value[0]?.id ?? null
      }
    } catch (e) { console.error('deleteConversation:', e) }
  }

  // ── Switch ────────────────────────────────────────────────────────────────

  const switchConversation = (id) => {
    currentConversationId.value = id
  }

  // ── History (for initialMessages in useChat) ──────────────────────────────

  const getHistory = async (conversation_id) => {
    try {
      const r = await call(M('get_chat_history'), { conversation_id })
      // Convert DB rows → AI SDK UIMessage format
      // ai@3.x Message shape: { id, role, content } — no 'parts' field
      return (r?.message ?? []).flatMap((m) => [
        { id: `${m.name}-u`, role: 'user',      content: m.message },
        { id: `${m.name}-a`, role: 'assistant', content: m.reply   },
      ])
    } catch (e) {
      console.error('getHistory:', e)
      return []
    }
  }

  const toggleSidebar = () => { isSidebarOpen.value = !isSidebarOpen.value }

  return {
    conversations, currentConversationId, isSidebarOpen,
    loadConversations, createConversation, renameConversation,
    deleteConversation, switchConversation, getHistory, toggleSidebar,
  }
})