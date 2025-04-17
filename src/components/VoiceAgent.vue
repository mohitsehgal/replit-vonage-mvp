<template>
  <v-card class="voice-agent-container" elevation="2">
    <!-- Transcript Display for Conversation History -->
    <TranscriptDisplay />
    
    <!-- Voice Input UI -->
    <div class="voice-input-container">
      <!-- Waveform Animation -->
      <SpeechWaveform 
        :is-listening="isListening" 
        :is-playing="isPlaying"
        :audio-level="audioLevel" 
      />
      
      <!-- Input Controls -->
      <div class="input-controls pa-3">
        <v-text-field
          v-model="textInput"
          label="Type a message..."
          variant="outlined"
          density="comfortable"
          hide-details
          append-inner-icon="mdi-send"
          @click:append-inner="sendTextMessage"
          @keyup.enter="sendTextMessage"
          :disabled="isProcessing"
        ></v-text-field>
        
        <div class="d-flex mt-2">
          <v-btn
            color="primary"
            :disabled="!microphoneAvailable || isProcessing"
            :icon="isListening ? 'mdi-microphone-off' : 'mdi-microphone'"
            @click="toggleListening"
            class="mr-2"
          ></v-btn>
          
          <v-btn
            color="secondary"
            icon="mdi-export-variant"
            @click="exportConversation"
            :disabled="!hasMessages"
          ></v-btn>
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
          
          if (event.results[0].isFinal) {
            textInput.value = transcript;
            sendTextMessage();
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
    
    // Send text message to AI
    const sendTextMessage = () => {
      if (!textInput.value.trim() || store.getters.isProcessing) return;
      
      store.dispatch('addMessage', textInput.value.trim());
      textInput.value = '';
      
      // Simulate audio playback for response
      setTimeout(() => {
        isPlaying.value = true;
        
        // Simulate audio playback ending
        setTimeout(() => {
          isPlaying.value = false;
        }, 3000);
      }, 1500);
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
}

.voice-input-container {
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  background-color: rgba(30, 30, 30, 0.5);
}

.input-controls {
  display: flex;
  flex-direction: column;
}

@media (max-width: 600px) {
  .input-controls {
    padding: 8px;
  }
}
</style>