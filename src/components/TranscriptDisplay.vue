<template>
  <div class="transcript-container">
    <div class="transcript" ref="transcriptRef">
      <!-- True phone call-like continuous conversation display -->
      <div class="call-container">
        <div class="call-header">
          <div class="call-status">
            <v-icon color="success" class="status-icon" size="small">mdi-phone</v-icon>
            <v-chip color="success" class="status-chip" size="small" label>Live Call</v-chip>
          </div>
          <span class="call-title">AI Assistant</span>
          <v-spacer></v-spacer>
          <span class="call-timer">{{ callDuration }}</span>
        </div>
        
        <div class="continuous-conversation">
          <!-- Single transcript of the entire conversation -->
          <div class="transcript-content">
            <!-- Previous messages rolled into a continuous transcript -->
            <div v-if="messages.length > 0" class="transcript-text">
              <template v-for="(message, index) in messages" :key="index">
                <div :class="['transcript-entry', message.role]">
                  <strong>{{ message.role === 'user' ? 'You' : 'AI' }}:</strong> {{ message.content }}
                </div>
              </template>
            </div>
            
            <!-- Processing indicator -->  
            <div v-if="isProcessing" class="live-indicator">
              <v-icon size="small" color="success" class="pulse-icon">mdi-message-processing</v-icon>
              <span>AI is responding...</span>
            </div>
          </div>
          
          <!-- Only show the current/latest audio response -->
          <div v-if="currentAudioPlaying" class="current-audio-container">
            <audio 
              :ref="el => currentAudio = el"
              :src="currentAudioPlaying"
              class="audio-player"
              controls
              @ended="audioEnded"
            ></audio>
          </div>
        </div>
        
        <!-- Audio visualization during call -->
        <div class="audio-visualizer-container">
          <div class="audio-bars">
            <div v-for="n in 10" :key="n" class="audio-bar" :style="{ height: getRandomHeight() }"></div>
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
    const currentAudio = ref(null);
    const startTime = ref(new Date());
    const callDuration = ref('00:00');
    const durationInterval = ref(null);
    const visualizerInterval = ref(null);
    const currentAudioPlaying = ref(null);
    
    const messages = computed(() => store.getters.allMessages);
    const isProcessing = computed(() => store.getters.isProcessing);
    const error = computed(() => store.getters.error);
    
    // Set audio from the latest assistant message
    watch(messages, (newMessages) => {
      if (newMessages.length > 0) {
        const latestMessage = newMessages[newMessages.length - 1];
        if (latestMessage.role === 'assistant' && latestMessage.audio) {
          currentAudioPlaying.value = latestMessage.audio;
          
          // Focus the audio element and auto-play
          setTimeout(() => {
            if (currentAudio.value) {
              currentAudio.value.play().catch(err => console.error('Failed to auto-play audio:', err));
            }
          }, 100);
        }
      }
    }, { deep: true });
    
    // Audio ending handler - signal parent to possibly restart listening
    const audioEnded = () => {
      store.dispatch('audioEnded');
      currentAudioPlaying.value = null;
    };
    
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
    
    // Start audio visualizer animation
    const startVisualizer = () => {
      visualizerInterval.value = setInterval(() => {
        // Force a UI update to animate bars
        if (document.querySelector('.audio-bars')) {
          document.querySelector('.audio-bars').style.opacity = '0.99';
          setTimeout(() => {
            if (document.querySelector('.audio-bars')) {
              document.querySelector('.audio-bars').style.opacity = '1';
            }
          }, 50);
        }
      }, 500);
    };
    
    // Generate a random height for audio visualizer bars
    const getRandomHeight = () => {
      // More active when audio is playing or AI is responding
      const maxHeight = (currentAudioPlaying.value || isProcessing.value) ? 100 : 30;
      const minHeight = 5;
      const height = Math.floor(Math.random() * (maxHeight - minHeight + 1) + minHeight);
      return `${height}%`;
    };
    
    // Start timer and visualizer on component creation
    startCallTimer();
    startVisualizer();
    
    // Clean up intervals when component is destroyed
    onBeforeUnmount(() => {
      if (durationInterval.value) {
        clearInterval(durationInterval.value);
      }
      if (visualizerInterval.value) {
        clearInterval(visualizerInterval.value);
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
      currentAudio,
      formatTime,
      callDuration,
      currentAudioPlaying,
      audioEnded,
      getRandomHeight
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

/* Phone Call-like UI styles */
.call-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  background-color: rgba(15, 15, 15, 0.9);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
}

.call-header {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  background-color: rgba(10, 10, 10, 0.8);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.call-status {
  display: flex;
  align-items: center;
  margin-right: 0.75rem;
}

.status-icon {
  margin-right: 0.5rem;
  animation: pulse 1.5s infinite;
}

.status-chip {
  height: 20px;
}

.call-title {
  font-weight: 500;
  font-size: 1rem;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.call-timer {
  font-family: monospace;
  font-size: 0.9rem;
  color: #aaa;
  letter-spacing: 1px;
}

.continuous-conversation {
  display: flex;
  flex-direction: column;
  flex: 1;
  padding: 1rem;
  overflow-y: auto;
  position: relative;
}

.transcript-content {
  flex: 1;
  padding: 0.5rem;
  margin-bottom: 1rem;
  font-size: 1rem;
  line-height: 1.6;
}

.transcript-text {
  padding: 0.5rem;
  background-color: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  margin-bottom: 1rem;
}

.transcript-entry {
  margin-bottom: 1rem;
  padding: 0.5rem;
  border-radius: 6px;
  transition: all 0.3s ease;
}

.transcript-entry.assistant {
  color: rgba(255, 255, 255, 0.9);
  border-left: 2px solid #66bb6a;
  padding-left: 0.75rem;
}

.transcript-entry.user {
  color: rgba(255, 255, 255, 0.95);
  border-left: 2px solid #42a5f5;
  padding-left: 0.75rem;
}

.live-indicator {
  display: flex;
  align-items: center;
  padding: 0.5rem;
  font-size: 0.9rem;
  color: #4caf50;
  animation: fadeInOut 1.5s infinite;
}

.pulse-icon {
  margin-right: 0.5rem;
  animation: pulse 1.5s infinite;
}

.current-audio-container {
  padding: 0.5rem;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  margin-top: 0.5rem;
}

.audio-player {
  width: 100%;
  border-radius: 8px;
  background-color: rgba(0, 0, 0, 0.2);
  height: 40px;
}

/* Audio visualization */
.audio-visualizer-container {
  height: 60px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0.5rem;
  background-color: rgba(0, 0, 0, 0.2);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.audio-bars {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
  height: 100%;
  gap: 3px;
  transition: all 0.3s ease;
}

.audio-bar {
  width: 6px;
  background: linear-gradient(to top, #2196f3, #4caf50);
  border-radius: 3px;
  transition: height 0.2s ease-in-out;
}

@keyframes pulse {
  0% { opacity: 0.5; }
  50% { opacity: 1; }
  100% { opacity: 0.5; }
}

@keyframes fadeInOut {
  0% { opacity: 0.7; }
  50% { opacity: 1; }
  100% { opacity: 0.7; }
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