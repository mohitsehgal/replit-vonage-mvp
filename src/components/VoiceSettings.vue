<template>
  <div class="voice-settings">
    <h3 class="text-h6 mb-3">Voice Settings</h3>
    
    <v-select
      v-model="voiceType"
      :items="voiceTypes"
      label="Voice Type"
      density="comfortable"
      variant="outlined"
      class="mb-4"
    ></v-select>
    
    <v-select
      v-model="language"
      :items="languages"
      label="Language"
      density="comfortable"
      variant="outlined"
      class="mb-4"
    ></v-select>
  </div>
</template>

<script>
import { ref, computed, watch } from 'vue';
import { useStore } from 'vuex';

export default {
  name: 'VoiceSettings',
  setup() {
    const store = useStore();
    
    const languages = [
      { title: 'English (US)', value: 'en-US' },
      { title: 'English (UK)', value: 'en-GB' },
      { title: 'Spanish', value: 'es-ES' },
      { title: 'French', value: 'fr-FR' },
      { title: 'German', value: 'de-DE' },
      { title: 'Japanese', value: 'ja-JP' }
    ];
    
    const voiceTypes = [
      { title: 'Female', value: 'female' },
      { title: 'Male', value: 'male' }
    ];
    
    // Get current settings from store
    const currentSettings = computed(() => store.getters.voiceSettings);
    
    const language = ref(currentSettings.value.language);
    const voiceType = ref(currentSettings.value.voiceType);
    
    // Update store when settings change
    watch([language, voiceType], ([newLang, newVoice]) => {
      store.dispatch('updateVoiceSettings', {
        language: newLang,
        voiceType: newVoice
      });
    });
    
    return {
      language,
      voiceType,
      languages,
      voiceTypes
    };
  }
};
</script>

<style scoped>
.voice-settings {
  margin-top: 1rem;
}
</style>