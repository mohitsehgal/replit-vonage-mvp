<template>
  <div class="transcript-container">
    <div class="transcript" ref="transcriptRef">
      <!-- Call-like continuous conversation display -->
      <div class="call-container">
        <div class="call-header">
          <v-chip color="success" class="mr-2" size="small" label>Connected</v-chip>
          <span class="call-title">Voice Conversation</span>
          <v-spacer></v-spacer>
          <span class="call-timer">{{ callDuration }}</span>
        </div>
        
        <div class="call-messages">
          <div 
            v-for="(message, index) in messages" 
            :key="index"
            :class="['message', message.role === 'user' ? 'user-message' : 'ai-message']"
          >
            <div class="message-header">
              <v-avatar :color="message.role === 'user' ? 'primary' : 'secondary'" size="32" class="mr-2">
                <v-icon :icon="message.role === 'user' ? 'mdi-account' : 'mdi-robot'" size="16"></v-icon>
              </v-avatar>
              <span class="message-name">{{ message.role === 'user' ? 'You' : 'AI Assistant' }}</span>
              <v-spacer></v-spacer>
              <span class="message-time">{{ formatTime(message.timestamp) }}</span>
            </div>
            
            <div class="message-content">
              {{ message.content }}
            </div>
            
            <div v-if="message.role === 'assistant' && message.audio" class="message-audio">
              <audio 
                :src="message.audio" 
                controls 
                class="audio-player"
              ></audio>
            </div>
          </div>
          
          <div v-if="isProcessing" class="processing-indicator">
            <v-progress-circular indeterminate size="24"></v-progress-circular>
            <span class="ml-2">AI is responding...</span>
          </div>
        </div>
      </div>
      
      <div v-if="error" class="error-message mt-3">
        <v-alert type="error" variant="tonal" dense>
          {{ error }}
        </v-alert>
      </div>
      
      <div v-if="messages.length === 0" class="empty-state">
        <v-avatar color="primary" size="64" class="mb-4">
          <v-icon size="36">mdi-phone-in-talk</v-icon>
        </v-avatar>
        <h3 class="text-h6 mb-2">Start Your Conversation</h3>
        <p class="text-subtitle-2">Click the microphone button or type a message to begin talking with the AI assistant.</p>
      </div>
    </div>
  </div>
</template>

<script>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { useStore } from 'vuex';

export default {
  name: 'TranscriptDisplay',
  setup() {
    const store = useStore();
    const transcriptRef = ref(null);
    const startTime = ref(new Date());
    const callDuration = ref('00:00');
    const durationInterval = ref(null);
    
    const messages = computed(() => store.getters.allMessages);
    const isProcessing = computed(() => store.getters.isProcessing);
    const error = computed(() => store.getters.error);
    
    // Start call timer
    const startCallTimer = () => {
      durationInterval.value = setInterval(() => {
        const now = new Date();
        const diff = Math.floor((now - startTime.value) / 1000);
        const minutes = Math.floor(diff / 60).toString().padStart(2, '0');
        const seconds = (diff % 60).toString().padStart(2, '0');
        callDuration.value = `${minutes}:${seconds}`;
      }, 1000);
    };
    
    // Start timer on component creation
    startCallTimer();
    
    // Clean up interval when component is destroyed
    onBeforeUnmount(() => {
      if (durationInterval.value) {
        clearInterval(durationInterval.value);
      }
    });
    
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
      formatTime,
      callDuration
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