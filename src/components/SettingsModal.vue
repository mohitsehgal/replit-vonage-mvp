<template>
  <v-dialog
    v-model="dialog"
    max-width="500px"
  >
    <v-card>
      <v-card-title class="headline primary white--text">
        <v-icon color="white" class="mr-2">mdi-cog</v-icon>
        Settings
      </v-card-title>
      
      <v-card-text class="pt-4">
        <v-row>
          <v-col cols="12">
            <v-select
              v-model="localSettings.voiceType"
              :items="voiceTypes"
              label="Voice Type"
              variant="outlined"
              density="comfortable"
            ></v-select>
          </v-col>
          
          <v-col cols="12">
            <v-select
              v-model="localSettings.language"
              :items="languages"
              label="Language"
              variant="outlined"
              density="comfortable"
            ></v-select>
          </v-col>
          
          <v-col cols="12">
            <div class="d-flex align-center mb-2">
              <h3 class="text-h6">System Prompt Presets</h3>
              <v-spacer></v-spacer>
              <v-btn
                icon
                variant="text"
                color="primary"
                @click="addNewPreset"
              >
                <v-icon>mdi-plus</v-icon>
              </v-btn>
            </div>
            
            <v-list>
              <v-list-item
                v-for="(preset, index) in localSettings.systemPromptPresets"
                :key="index"
              >
                <template v-slot:prepend>
                  <v-icon color="primary">mdi-text-box-outline</v-icon>
                </template>
                
                <v-list-item-title>
                  <v-text-field
                    v-model="localSettings.systemPromptPresets[index]"
                    hide-details
                    density="compact"
                    variant="plain"
                  ></v-text-field>
                </v-list-item-title>
                
                <template v-slot:append>
                  <v-btn
                    icon
                    variant="text"
                    color="error"
                    size="small"
                    @click="removePreset(index)"
                    :disabled="localSettings.systemPromptPresets.length <= 1"
                  >
                    <v-icon>mdi-delete</v-icon>
                  </v-btn>
                </template>
              </v-list-item>
            </v-list>
          </v-col>
        </v-row>
      </v-card-text>
      
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn
          color="grey-darken-1"
          variant="text"
          @click="closeDialog"
        >
          Cancel
        </v-btn>
        <v-btn
          color="primary"
          variant="text"
          @click="saveSettings"
        >
          Save
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  currentSettings: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['update:modelValue', 'update-settings']);

const dialog = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
});

const localSettings = ref({
  voiceType: 'female',
  language: 'en-US',
  systemPromptPresets: []
});

// Available voice types
const voiceTypes = [
  { title: 'Female', value: 'female' },
  { title: 'Male', value: 'male' }
];

// Available languages
const languages = [
  { title: 'English (US)', value: 'en-US' },
  { title: 'English (UK)', value: 'en-GB' },
  { title: 'Spanish', value: 'es-ES' },
  { title: 'French', value: 'fr-FR' },
  { title: 'German', value: 'de-DE' },
  { title: 'Italian', value: 'it-IT' },
  { title: 'Japanese', value: 'ja-JP' },
  { title: 'Chinese', value: 'zh-CN' }
];

// Initialize local settings when component mounts or props change
watch(() => props.currentSettings, (newSettings) => {
  localSettings.value = JSON.parse(JSON.stringify(newSettings));
}, { immediate: true, deep: true });

const closeDialog = () => {
  dialog.value = false;
};

const saveSettings = () => {
  emit('update-settings', JSON.parse(JSON.stringify(localSettings.value)));
};

const addNewPreset = () => {
  localSettings.value.systemPromptPresets.push('You are a helpful assistant.');
};

const removePreset = (index) => {
  if (localSettings.value.systemPromptPresets.length > 1) {
    localSettings.value.systemPromptPresets.splice(index, 1);
  }
};
</script>

<style scoped>
.v-list-item {
  padding-right: 0;
}
</style>
