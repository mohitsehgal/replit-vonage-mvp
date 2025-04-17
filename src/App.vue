<template>
  <v-app>
    <v-app-bar color="primary" dark app>
      <v-toolbar-title>AI Voice Agent Demo</v-toolbar-title>
      <v-spacer></v-spacer>
      <v-btn 
        icon 
        @click="showSettings = !showSettings"
        :color="showSettings ? 'success' : 'default'"
      >
        <v-icon>mdi-cog</v-icon>
      </v-btn>
    </v-app-bar>

    <v-main>
      <v-container fluid class="fill-height">
        <v-row class="fill-height">
          <v-col :cols="12" :md="showSettings ? 8 : 12" class="d-flex flex-column transition-col">
            <!-- Main Voice Agent Interface -->
            <VoiceAgent />
          </v-col>
          
          <v-col v-if="showSettings" cols="12" md="4" class="settings-panel">
            <!-- Settings Panel -->
            <v-card class="pa-4 h-100">
              <div class="d-flex align-center">
                <v-card-title>Settings</v-card-title>
                <v-spacer></v-spacer>
                <v-btn
                  icon
                  size="small"
                  @click="showSettings = false"
                  class="mr-2"
                >
                  <v-icon>mdi-close</v-icon>
                </v-btn>
              </div>
              <v-divider class="mb-3"></v-divider>
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
  transition: all 0.3s ease;
  box-shadow: -2px 0 10px rgba(0, 0, 0, 0.1);
}

.transition-col {
  transition: all 0.3s ease;
}

/* Make settings panel fullscreen on small devices */
@media (max-width: 960px) {
  .settings-panel {
    position: fixed;
    top: 64px; /* Adjust based on app bar height */
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 100;
  }
}
</style>