<template>
  <v-card class="voice-agent-container" elevation="2">
    <!-- Transcript Display for Conversation History -->
    <TranscriptDisplay />
    
    <!-- Voice Input UI - Call-like interface -->
    <div class="voice-input-container">
      <!-- Waveform Animation -->
      <SpeechWaveform 
        :is-listening="isListening" 
        :is-playing="isPlaying"
        :audio-level="audioLevel" 
      />
      
      <!-- Call Controls -->
      <div class="call-controls pa-3">
        <v-text-field
          v-model="textInput"
          label="Say something or type a message..."
          variant="outlined"
          density="comfortable"
          hide-details
          rounded
          bg-color="rgba(0, 0, 0, 0.3)"
          dark
          append-inner-icon="mdi-send"
          @click:append-inner="sendTextMessage"
          @keyup.enter="sendTextMessage"
          :disabled="isProcessing"
          class="message-input"
        ></v-text-field>
        
        <div class="call-buttons mt-3">
          <v-btn
            :color="isListening ? 'error' : 'success'"
            :variant="isListening ? 'flat' : 'elevated'"
            :disabled="!microphoneAvailable || isProcessing"
            rounded
            size="large"
            class="mic-button" 
            @click="toggleListening"
          >
            <v-icon :icon="isListening ? 'mdi-microphone-off' : 'mdi-microphone'" size="large" class="mr-1"></v-icon>
            {{ isListening ? 'Stop' : 'Speak' }}
          </v-btn>
          
          <div class="secondary-controls">
            <v-btn
              color="primary"
              variant="tonal"
              icon="mdi-cog"
              size="small"
              class="mr-2"
              @click="$emit('open-settings')"
            ></v-btn>
            
            <v-btn
              color="primary"
              variant="tonal"
              icon="mdi-export-variant"
              size="small"
              @click="exportConversation"
              :disabled="!hasMessages"
            ></v-btn>
          </div>
        </div>
      </div>
    </div>
  </v-card>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useStore } from 'vuex';
import TranscriptDisplay from './TranscriptDisplay.vue';
import SpeechWaveform from './SpeechWaveform.vue';

export default {
  name: 'VoiceAgent',
  components: {
    TranscriptDisplay,
    SpeechWaveform
  },
  emits: ['open-settings'],
  setup() {
    const store = useStore();
    const textInput = ref('');
    const isListening = ref(false);
    const isPlaying = ref(false);
    const audioLevel = ref(0);
    const microphoneAvailable = ref(false);
    
    // Speech recognition setup
    let recognition = null;
    let audioContext = null;
    let analyser = null;
    let microphone = null;
    let dataArray = null;
    
    // Check if browser supports speech recognition
    const setupSpeechRecognition = () => {
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        
        recognition.onresult = (event) => {
          const transcript = Array.from(event.results)
            .map(result => result[0])
            .map(result => result.transcript)
            .join('');
          
          // Update textInput in real-time for visual feedback
          textInput.value = transcript;
          
          // When recognition is final, send the message
          if (event.results[0].isFinal) {
            // Stop listening first to prevent overlap
            recognition.stop();
            isListening.value = false;
            
            // Send the transcript as message
            store.dispatch('addMessage', transcript).then(() => {
              // Clear the input field
              textInput.value = '';
              
              // Audio will be automatically played by TranscriptDisplay component
              // which watches for new messages with audio attachments
            });
          }
        };
        
        recognition.onend = () => {
          if (isListening.value) {
            isListening.value = false;
          }
        };
        
        recognition.onerror = (event) => {
          console.error('Speech recognition error', event.error);
          isListening.value = false;
        };
        
        microphoneAvailable.value = true;
      } else {
        console.error('Speech recognition not supported');
        microphoneAvailable.value = false;
      }
    };
    
    // Set up audio analysis for visualization
    const setupAudioAnalysis = async () => {
      try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);
        
        // Start audio level monitoring
        updateAudioLevel();
      } catch (error) {
        console.error('Error accessing microphone:', error);
        microphoneAvailable.value = false;
      }
    };
    
    // Update audio level for visualization
    const updateAudioLevel = () => {
      if (!analyser || !isListening.value) {
        audioLevel.value = 0;
        return;
      }
      
      analyser.getByteFrequencyData(dataArray);
      
      // Calculate average level
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      
      const average = sum / dataArray.length;
      audioLevel.value = average / 128; // Normalize to 0-1 range
      
      // Continue monitoring
      requestAnimationFrame(updateAudioLevel);
    };
    
    // Toggle listening state
    const toggleListening = () => {
      if (!recognition) return;
      
      if (isListening.value) {
        // Stop listening
        recognition.stop();
        isListening.value = false;
      } else {
        // Start listening
        recognition.start();
        isListening.value = true;
        updateAudioLevel();
      }
    };
    
    // Setup auto-listening after AI response
    const setupAutoListening = () => {
      // Listen for AI response completion
      document.addEventListener('ai-response-complete', (event) => {
        if (event.detail.autoRestartListening && !isListening.value && !isProcessing.value && microphoneAvailable.value) {
          console.log('Auto-restarting listening after AI response');
          // Small delay to give the user a moment
          setTimeout(() => {
            toggleListening();
          }, 300);
        }
      });
    };
    
    // Send text message to AI and handle continuous conversation
    const sendTextMessage = async () => {
      if ((!textInput.value.trim() && !isListening.value) || store.getters.isProcessing) return;
      
      // If we're listening, use the transcript from speech recognition
      // Otherwise use the text input
      const messageText = isListening.value ? '' : textInput.value.trim();
      
      if (messageText) {
        // Send message to AI through store action
        await store.dispatch('addMessage', messageText);
        textInput.value = '';
        
        // Audio will be automatically played by TranscriptDisplay component
        // which watches for new messages with audio attachments
      }
    };
    
    // Export conversation as text
    const exportConversation = () => {
      const messages = store.getters.allMessages;
      if (!messages.length) return;
      
      let conversationText = "# AI Voice Agent Conversation\n\n";
      
      messages.forEach(message => {
        const timestamp = new Date(message.timestamp).toLocaleString();
        const role = message.role === 'user' ? 'You' : 'AI Assistant';
        conversationText += `## ${role} (${timestamp})\n${message.content}\n\n`;
      });
      
      // Create a download link
      const blob = new Blob([conversationText], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `conversation-${new Date().toISOString().slice(0, 10)}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };
    
    // Computed properties
    const isProcessing = computed(() => store.getters.isProcessing);
    const hasMessages = computed(() => store.getters.allMessages.length > 0);
    
    // Lifecycle hooks
    onMounted(() => {
      setupSpeechRecognition();
      setupAudioAnalysis();
      setupAutoListening();
    });
    
    onBeforeUnmount(() => {
      if (recognition) {
        recognition.stop();
      }
      
      if (audioContext) {
        audioContext.close();
      }
    });
    
    return {
      textInput,
      isListening,
      isPlaying,
      audioLevel,
      microphoneAvailable,
      isProcessing,
      hasMessages,
      toggleListening,
      sendTextMessage,
      exportConversation
    };
  }
};
</script>

<style scoped>
.voice-agent-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  position: relative;
}

.voice-input-container {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background-color: rgba(10, 10, 10, 0.8);
  padding-bottom: 12px;
}

.call-controls {
  display: flex;
  flex-direction: column;
}

.message-input {
  border-radius: 24px;
}

.call-buttons {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.mic-button {
  min-width: 120px;
  border-radius: 24px;
  transition: all 0.3s ease;
}

.mic-button:hover {
  transform: scale(1.05);
}

.secondary-controls {
  display: flex;
  align-items: center;
}

@media (max-width: 600px) {
  .call-controls {
    padding: 8px;
  }
  
  .call-buttons {
    flex-direction: column;
    gap: 10px;
  }
  
  .mic-button {
    width: 100%;
  }
  
  .secondary-controls {
    width: 100%;
    justify-content: center;
  }
}
</style>