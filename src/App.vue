<template>
  <v-app>
    <v-app-bar color="primary" dark app>
      <v-toolbar-title>AI Voice Agent Demo</v-toolbar-title>
      <v-spacer></v-spacer>
      <v-btn icon @click="showSettings = !showSettings">
        <v-icon>mdi-cog</v-icon>
      </v-btn>
    </v-app-bar>

    <v-main>
      <v-container fluid class="fill-height">
        <v-row class="fill-height">
          <v-col cols="12" md="8" class="d-flex flex-column">
            <!-- Main Voice Agent Interface -->
            <VoiceAgent />
          </v-col>
          
          <v-col cols="12" md="4" class="settings-panel" v-if="showSettings">
            <!-- Settings Panel -->
            <v-card class="pa-4 h-100">
              <v-card-title>Settings</v-card-title>
              <v-card-text>
                <SystemPromptInput />
                <VoiceSettings />
              </v-card-text>
              <v-card-actions>
                <v-btn color="error" @click="clearConversation">
                  Clear Conversation
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-main>

    <v-footer app>
      <span>&copy; {{ new Date().getFullYear() }} AI Voice Agent Demo</span>
    </v-footer>
  </v-app>
</template>

<script>
import { ref } from 'vue';
import { useStore } from 'vuex';
import VoiceAgent from './components/VoiceAgent.vue';
import SystemPromptInput from './components/SystemPromptInput.vue';
import VoiceSettings from './components/VoiceSettings.vue';

export default {
  name: 'App',
  components: {
    VoiceAgent,
    SystemPromptInput,
    VoiceSettings
  },
  setup() {
    const store = useStore();
    const showSettings = ref(false);
    
    const clearConversation = () => {
      store.dispatch('clearMessages');
    };
    
    return {
      showSettings,
      clearConversation
    };
  }
};
</script>

<style>
.settings-panel {
  height: 100%;
  overflow-y: auto;
}
</style>