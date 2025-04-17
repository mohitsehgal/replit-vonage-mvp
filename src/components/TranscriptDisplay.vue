<template>
  <div class="transcript-container">
    <div class="transcript" ref="transcriptRef">
      <v-card 
        v-for="(message, index) in messages" 
        :key="index"
        :class="['message-card mb-3', message.role === 'user' ? 'user-message' : 'ai-message']"
        variant="outlined"
        :color="message.role === 'user' ? 'primary' : 'secondary'"
      >
        <v-card-title class="text-subtitle-1 px-4 py-2">
          <v-icon :icon="message.role === 'user' ? 'mdi-account' : 'mdi-robot'" class="mr-2"></v-icon>
          {{ message.role === 'user' ? 'You' : 'AI Assistant' }}
          <v-spacer></v-spacer>
          <span class="text-caption">{{ formatTime(message.timestamp) }}</span>
        </v-card-title>
        
        <v-card-text class="pa-4">
          {{ message.content }}
        </v-card-text>
        
        <v-card-actions v-if="message.role === 'assistant' && message.audio" class="pa-2">
          <audio 
            :src="message.audio" 
            controls 
            class="audio-player"
          ></audio>
        </v-card-actions>
      </v-card>
      
      <div v-if="isProcessing" class="processing-indicator">
        <v-progress-circular indeterminate></v-progress-circular>
        <span class="ml-2">Processing...</span>
      </div>
      
      <div v-if="error" class="error-message mt-3">
        <v-alert type="error" variant="tonal" dense>
          {{ error }}
        </v-alert>
      </div>
      
      <div v-if="messages.length === 0" class="empty-state">
        <v-icon icon="mdi-text-box-outline" size="large" class="mb-2"></v-icon>
        <p>No messages yet. Start speaking or typing to begin the conversation.</p>
      </div>
    </div>
  </div>
</template>

<script>
import { computed, ref, watch } from 'vue';
import { useStore } from 'vuex';

export default {
  name: 'TranscriptDisplay',
  setup() {
    const store = useStore();
    const transcriptRef = ref(null);
    
    const messages = computed(() => store.getters.allMessages);
    const isProcessing = computed(() => store.getters.isProcessing);
    const error = computed(() => store.getters.error);
    
    // Scroll to bottom when new messages arrive
    watch(messages, () => {
      setTimeout(() => {
        if (transcriptRef.value) {
          transcriptRef.value.scrollTop = transcriptRef.value.scrollHeight;
        }
      }, 100);
    }, { deep: true });
    
    // Format timestamp
    const formatTime = (timestamp) => {
      if (!timestamp) return '';
      
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };
    
    return {
      messages,
      isProcessing,
      error,
      transcriptRef,
      formatTime
    };
  }
};
</script>

<style scoped>
.transcript-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.transcript {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
}

.message-card {
  width: 85%;
  border-radius: 12px;
}

.user-message {
  align-self: flex-end;
}

.ai-message {
  align-self: flex-start;
}

.audio-player {
  width: 100%;
  margin-top: 0.5rem;
}

.processing-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 1rem 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: #666;
  padding: 2rem;
}
</style>