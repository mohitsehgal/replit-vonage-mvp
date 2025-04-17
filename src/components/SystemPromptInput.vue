<template>
  <div class="system-prompt mb-4">
    <h3 class="text-h6 mb-2">AI Personality</h3>
    
    <v-textarea
      v-model="prompt"
      label="System Prompt"
      hint="Define the AI assistant's personality and behavior"
      persistent-hint
      variant="outlined"
      rows="4"
      class="mb-2"
    ></v-textarea>
    
    <div class="d-flex mt-2">
      <v-btn color="primary" @click="updatePrompt">
        Update
      </v-btn>
      <v-btn class="ml-2" variant="text" @click="resetToDefault">
        Reset to Default
      </v-btn>
    </div>
    
    <div class="mt-4">
      <h4 class="text-subtitle-1 mb-2">Preset Personalities</h4>
      <v-chip-group>
        <v-chip
          v-for="(preset, index) in presetPrompts"
          :key="index"
          @click="setPreset(preset.prompt)"
          color="secondary"
          variant="outlined"
          class="ma-1"
        >
          {{ preset.name }}
        </v-chip>
      </v-chip-group>
    </div>
  </div>
</template>

<script>
import { ref, computed } from 'vue';
import { useStore } from 'vuex';

export default {
  name: 'SystemPromptInput',
  setup() {
    const store = useStore();
    
    const DEFAULT_PROMPT = 'You are a helpful voice assistant. Keep your responses clear and concise.';
    
    const presetPrompts = [
      { 
        name: 'Helpful Assistant', 
        prompt: DEFAULT_PROMPT 
      },
      { 
        name: 'Friendly Coach', 
        prompt: 'You are a friendly and encouraging coach. Provide motivational responses and positive reinforcement. Keep your answers brief and uplifting.' 
      },
      { 
        name: 'Technical Expert', 
        prompt: 'You are a technical expert voice assistant. Provide detailed and accurate information about technical topics. Use precise language but explain complex concepts clearly.' 
      },
      { 
        name: 'Concise Guide', 
        prompt: 'You are a concise guide focused on brevity. Keep all responses under 50 words and get straight to the point. Avoid unnecessary details.' 
      }
    ];
    
    // Get current prompt from store
    const currentPrompt = computed(() => store.getters.systemPrompt);
    
    const prompt = ref(currentPrompt.value);
    
    const updatePrompt = () => {
      store.dispatch('updateSystemPrompt', prompt.value);
    };
    
    const resetToDefault = () => {
      prompt.value = DEFAULT_PROMPT;
      updatePrompt();
    };
    
    const setPreset = (presetPrompt) => {
      prompt.value = presetPrompt;
      updatePrompt();
    };
    
    return {
      prompt,
      presetPrompts,
      updatePrompt,
      resetToDefault,
      setPreset
    };
  }
};
</script>

<style scoped>
.system-prompt {
  margin-top: 1rem;
}
</style>