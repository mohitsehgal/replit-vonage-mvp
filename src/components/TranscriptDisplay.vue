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

/* Call-like UI styles */
.call-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  background-color: rgba(0, 0, 0, 0.03);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.call-header {
  display: flex;
  align-items: center;
  padding: 1rem;
  background-color: rgba(30, 30, 30, 0.5);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.call-title {
  font-weight: 500;
  font-size: 1rem;
}

.call-timer {
  font-family: monospace;
  font-size: 0.9rem;
  color: #aaa;
}

.call-messages {
  display: flex;
  flex-direction: column;
  flex: 1;
  padding: 1rem;
  overflow-y: auto;
}

.message {
  margin-bottom: 1.5rem;
  max-width: 90%;
  transition: all 0.3s ease;
}

.message-header {
  display: flex;
  align-items: center;
  margin-bottom: 0.5rem;
}

.message-name {
  font-weight: 500;
  font-size: 0.9rem;
}

.message-time {
  font-size: 0.8rem;
  color: #aaa;
}

.message-content {
  padding: 0.75rem 1rem;
  border-radius: 8px;
  background-color: rgba(255, 255, 255, 0.05);
  margin-left: 2.5rem;
  line-height: 1.5;
}

.message-audio {
  margin-top: 0.5rem;
  margin-left: 2.5rem;
}

.user-message {
  align-self: flex-end;
}

.user-message .message-content {
  background-color: rgba(25, 118, 210, 0.15);
  margin-left: 0;
  margin-right: 2.5rem;
}

.user-message .message-header {
  flex-direction: row-reverse;
}

.user-message .message-audio {
  margin-left: 0;
  margin-right: 2.5rem;
}

.ai-message {
  align-self: flex-start;
}

.audio-player {
  width: 100%;
  border-radius: 8px;
  background-color: rgba(0, 0, 0, 0.2);
}

.processing-indicator {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin: 1rem 0 1rem 2.5rem;
  color: #aaa;
  font-size: 0.9rem;
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