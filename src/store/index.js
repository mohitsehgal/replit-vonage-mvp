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
      }
    },
    
    mutations: {
      ADD_MESSAGE(state, message) {
        state.messages.push({ ...message, timestamp: new Date().toISOString() });
      },
      
      SET_PROCESSING(state, status) {
        state.isProcessing = status;
      },
      
      SET_ERROR(state, error) {
        state.error = error;
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
      async addMessage({ commit, state }, message) {
        // Add user message to conversation
        commit('ADD_MESSAGE', { 
          role: 'user', 
          content: message,
          audio: null
        });
        
        commit('SET_PROCESSING', true);
        commit('SET_ERROR', null);
        
        try {
          // Get AI response from server
          const response = await axios.post('/api/chat', {
            message,
            systemPrompt: state.systemPrompt,
            voiceSettings: state.voiceSettings
          });
          
          // Add AI response to conversation
          commit('ADD_MESSAGE', {
            role: 'assistant',
            content: response.data.text,
            audio: response.data.audioUrl
          });
          
        } catch (error) {
          console.error('Error communicating with AI:', error);
          commit('SET_ERROR', 'Failed to get response from AI. Please try again.');
        } finally {
          commit('SET_PROCESSING', false);
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