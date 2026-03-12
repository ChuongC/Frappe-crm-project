<script setup>
import { ref, nextTick } from 'vue'

const props = defineProps({
  disabled: { type: Boolean, default: false }
})
const emit        = defineEmits(['send'])
const message     = ref('')
const textareaRef = ref(null)

// REQUIRED: exposes focus() so ChatView can call inputRef.value.focus()
defineExpose({
  focus: () => nextTick(() => textareaRef.value?.focus())
})

const sendMessage = () => {
  if (!message.value.trim() || props.disabled) return
  emit('send', message.value)
  message.value = ''
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto'
      textareaRef.value.focus()
    }
  })
}

const autoResize = (e) => {
  const el = e.target
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 140) + 'px'
}
</script>

<template>
  <div class="chat-input-bar">
    <div class="chat-input-wrap">
      <textarea
        ref="textareaRef"
        v-model="message"
        class="chat-input"
        :class="{ 'chat-input--disabled': disabled }"
        :placeholder="disabled ? 'AI is responding…' : 'Ask anything…'"
        :disabled="disabled"
        rows="1"
        @keydown.enter.exact.prevent="sendMessage"
        @input="autoResize"
      />
      <button
        class="chat-input__send"
        :class="{ 'chat-input__send--active': message.trim() && !disabled }"
        :disabled="!message.trim() || disabled"
        @click="sendMessage"
        title="Send (Enter)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2.2"
          stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>
    <p class="chat-input__hint">
      Press <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for new line
    </p>
  </div>
</template>