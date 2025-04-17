import { createStore as createVuexStore } from 'vuex';
import axios from 'axios';

export function createStore() {
  return createVuexStore({
    state: {
      messages: [],
      isProcessing: false,
      error: null,
      systemPrompt: 'You are a helpful voice assistant. Keep your responses clear and concise.',
      voiceSettings: {
        language: 'en-US',
        voiceType: 'female'
      },
      pendingResponses: {}, // For storing streaming response IDs and polling status
      pollingActive: false // Whether polling for responses is active
    },
    
    mutations: {
      ADD_MESSAGE(state, message) {
        state.messages.push({ ...message, timestamp: new Date().toISOString() });
      },
      
      UPDATE_MESSAGE(state, { index, updates }) {
        if (index >= 0 && index < state.messages.length) {
          state.messages[index] = { ...state.messages[index], ...updates };
        }
      },
      
      SET_PROCESSING(state, status) {
        state.isProcessing = status;
      },
      
      SET_ERROR(state, error) {
        state.error = error;
      },
      
      ADD_PENDING_RESPONSE(state, { streamId, messageIndex }) {
        state.pendingResponses[streamId] = { messageIndex, retries: 0 };
      },
      
      REMOVE_PENDING_RESPONSE(state, streamId) {
        if (state.pendingResponses[streamId]) {
          delete state.pendingResponses[streamId];
        }
      },
      
      SET_POLLING_ACTIVE(state, isActive) {
        state.pollingActive = isActive;
      },
      
      INCREMENT_RETRY_COUNT(state, streamId) {
        if (state.pendingResponses[streamId]) {
          state.pendingResponses[streamId].retries++;
        }
      },
      
      UPDATE_SYSTEM_PROMPT(state, prompt) {
        state.systemPrompt = prompt;
      },
      
      UPDATE_VOICE_SETTINGS(state, settings) {
        state.voiceSettings = { ...state.voiceSettings, ...settings };
      },
      
      CLEAR_MESSAGES(state) {
        state.messages = [];
      }
    },
    
    actions: {
      async addMessage({ commit, state, dispatch }, message) {
        // Add user message to conversation
        commit('ADD_MESSAGE', { 
          role: 'user', 
          content: message,
          audio: null
        });
        
        commit('SET_PROCESSING', true);
        commit('SET_ERROR', null);
        
        try {
          // Get streaming AI response for lower latency
          const response = await axios.post('/api/chat', {
            message,
            systemPrompt: state.systemPrompt,
            voiceSettings: state.voiceSettings
          });
          
          if (response.data.isPartial && response.data.streamId) {
            // Add initial partial AI response right away
            commit('ADD_MESSAGE', {
              role: 'assistant',
              content: response.data.text || 'Thinking...',
              audio: null,
              isPartial: true
            });
            
            // Get the index of the message we just added
            const messageIndex = state.messages.length - 1;
            
            // Register this as a pending response to be polled for completion
            commit('ADD_PENDING_RESPONSE', { 
              streamId: response.data.streamId,
              messageIndex
            });
            
            // Start polling for complete response if not already polling
            if (!state.pollingActive) {
              dispatch('startPollingCompletedResponses');
            }
          } else {
            // For non-streaming response, add complete message immediately
            commit('ADD_MESSAGE', {
              role: 'assistant',
              content: response.data.text,
              audio: response.data.audioUrl
            });
            commit('SET_PROCESSING', false);
          }
        } catch (error) {
          console.error('Error communicating with AI:', error);
          commit('SET_ERROR', 'Failed to get response from AI. Please try again.');
          commit('SET_PROCESSING', false);
        }
      },
      
      // Start polling for completed responses
      startPollingCompletedResponses({ commit, state, dispatch }) {
        if (state.pollingActive) return; // Don't start if already polling
        
        commit('SET_POLLING_ACTIVE', true);
        
        const pollInterval = setInterval(async () => {
          const pendingStreamIds = Object.keys(state.pendingResponses);
          
          if (pendingStreamIds.length === 0) {
            // No more pending responses, stop polling
            clearInterval(pollInterval);
            commit('SET_POLLING_ACTIVE', false);
            return;
          }
          
          // Check each pending response
          for (const streamId of pendingStreamIds) {
            await dispatch('checkCompletedResponse', streamId);
          }
        }, 500); // Poll every 500ms
      },
      
      // Check if a specific response is completed
      async checkCompletedResponse({ commit, state }, streamId) {
        const pendingResponse = state.pendingResponses[streamId];
        if (!pendingResponse) return;
        
        try {
          const response = await axios.get(`/api/response/${streamId}`);
          
          if (response.data.complete) {
            // Update the message with complete text and audio
            commit('UPDATE_MESSAGE', {
              index: pendingResponse.messageIndex,
              updates: {
                content: response.data.text,
                audio: response.data.audioUrl,
                isPartial: false
              }
            });
            
            // Remove from pending responses
            commit('REMOVE_PENDING_RESPONSE', streamId);
            
            // If this was the last pending response, set processing to false
            if (Object.keys(state.pendingResponses).length === 0) {
              commit('SET_PROCESSING', false);
            }
          } else {
            // Increment retry count
            commit('INCREMENT_RETRY_COUNT', streamId);
            
            // If we've retried too many times, give up on this response
            if (pendingResponse.retries > 30) { // 15 seconds at 500ms intervals
              console.warn(`Giving up on streaming response ${streamId} after too many retries`);
              commit('REMOVE_PENDING_RESPONSE', streamId);
              
              // If this was the last pending response, set processing to false
              if (Object.keys(state.pendingResponses).length === 0) {
                commit('SET_PROCESSING', false);
              }
            }
          }
        } catch (error) {
          console.error(`Error checking completed response ${streamId}:`, error);
          commit('INCREMENT_RETRY_COUNT', streamId);
        }
      },
      
      // Called when audio response finishes playing
      audioEnded({ commit, state, dispatch }) {
        console.log('Audio finished playing - ready for next input');
        // We could dispatch an event for VoiceAgent to auto-restart listening here
        document.dispatchEvent(new CustomEvent('ai-response-complete', {
          detail: { autoRestartListening: true }
        }));
      },
      
      updateSystemPrompt({ commit }, prompt) {
        commit('UPDATE_SYSTEM_PROMPT', prompt);
      },
      
      updateVoiceSettings({ commit }, settings) {
        commit('UPDATE_VOICE_SETTINGS', settings);
      },
      
      clearMessages({ commit }) {
        commit('CLEAR_MESSAGES');
      }
    },
    
    getters: {
      allMessages: (state) => state.messages,
      isProcessing: (state) => state.isProcessing,
      systemPrompt: (state) => state.systemPrompt,
      voiceSettings: (state) => state.voiceSettings,
      error: (state) => state.error
    }
  });
}