<template>
  <div class="vonage-call-container">
    <v-card class="vonage-card">
      <v-card-title class="vonage-card-title">
        <v-icon icon="mdi-phone" color="primary" class="mr-2"></v-icon>
        Vonage Call Recording Demo
      </v-card-title>
      
      <v-card-text>
        <v-alert
          type="info"
          variant="outlined"
          class="mb-4"
          density="compact"
        >
          <strong>Browser-Only Demo:</strong> This feature demonstrates how Vonage call recording could be integrated. No actual phone calls will be made in this demo. The application uses simulation mode to show the user interface flow.
        </v-alert>
        
        <v-form ref="form" v-model="isFormValid" @submit.prevent="setupVonageApplication">
          <!-- Application Setup -->
          <div v-if="!hasApplication" class="setup-section">
            <v-text-field
              v-model="applicationName"
              label="Vonage Application Name"
              :rules="[v => !!v || 'Name is required']"
              hint="Give your application a descriptive name"
              persistent-hint
            ></v-text-field>
            
            <v-btn
              color="primary"
              :loading="isCreatingApplication"
              :disabled="!applicationName || isCreatingApplication"
              class="mt-4"
              @click="setupVonageApplication"
              block
            >
              Create Vonage Application (Browser Demo)
            </v-btn>
          </div>
          
          <!-- Application Info -->
          <div v-else class="application-info">
            <v-alert
              type="success"
              variant="tonal"
              class="mb-4"
            >
              Vonage application created successfully.
            </v-alert>
            
            <v-sheet
              color="surface"
              class="pa-4 mb-4 rounded"
              border
            >
              <div><strong>Application ID:</strong> {{ applicationId }}</div>
              <div class="mt-2"><small>Private key has been saved for your session.</small></div>
            </v-sheet>
          </div>
          
          <!-- Call Controls -->
          <div v-if="hasApplication" class="call-controls">
            <v-alert
              type="info"
              variant="tonal"
              class="mb-4"
              icon="mdi-information-outline"
            >
              This is a browser simulation demo. No actual phone calls will be made. Enter any phone numbers to test the UI flow.
            </v-alert>
            
            <v-text-field
              v-model="phoneNumber"
              label="Phone Number to Call"
              placeholder="+15551234567"
              :rules="[v => !!v || 'Phone number is required', v => /^\+\d{10,15}$/.test(v) || 'Enter a valid phone number with country code (+)']"
              hint="Include country code, e.g., +15551234567"
              persistent-hint
              class="mb-2"
            ></v-text-field>
            
            <v-text-field
              v-model="fromNumber"
              label="Your Vonage Virtual Number"
              placeholder="+15557654321"
              :rules="[v => !!v || 'Vonage number is required', v => /^\+\d{10,15}$/.test(v) || 'Enter a valid phone number with country code (+)']"
              hint="Your Vonage virtual number"
              persistent-hint
              class="mb-2"
            ></v-text-field>
            
            <v-switch
              v-model="recordCall"
              label="Record this call"
              color="primary"
              class="mb-2"
            ></v-switch>
            
            <v-btn
              color="success"
              :loading="isCallingPhone"
              :disabled="!canMakeCall || isCallingPhone"
              class="mt-4"
              @click="makePhoneCall"
              block
            >
              <v-icon left>mdi-phone-outgoing</v-icon>
              Simulate Phone Call (Browser Demo)
            </v-btn>
          </div>
        </v-form>
        
        <!-- Active Call Information -->
        <div v-if="activeCall" class="active-call mt-4">
          <v-card variant="outlined" class="pa-4">
            <div class="d-flex align-center mb-2">
              <v-icon color="success" class="mr-2">mdi-phone-in-talk</v-icon>
              <div class="font-weight-bold">Active Call</div>
            </div>
            
            <div><strong>Call ID:</strong> {{ activeCall.uuid }}</div>
            <div><strong>Status:</strong> {{ activeCall.status }}</div>
            <div><strong>To:</strong> {{ phoneNumber }}</div>
            <div><strong>Started:</strong> {{ new Date().toLocaleTimeString() }}</div>
            
            <v-btn
              color="error"
              class="mt-4"
              @click="checkCallStatus"
              block
            >
              <v-icon left>mdi-phone-check</v-icon>
              Check Call Status
            </v-btn>
          </v-card>
        </div>
        
        <!-- Recording Section -->
        <div v-if="recordings.length > 0" class="recordings mt-4">
          <v-card variant="outlined" class="pa-4">
            <div class="d-flex align-center mb-2">
              <v-icon color="primary" class="mr-2">mdi-record-rec</v-icon>
              <div class="font-weight-bold">Call Recordings</div>
            </div>
            
            <v-list>
              <v-list-item
                v-for="(recording, index) in recordings"
                :key="index"
              >
                <v-list-item-title>
                  Recording {{ index + 1 }}
                </v-list-item-title>
                <v-list-item-subtitle>
                  {{ new Date(recording.timestamp).toLocaleString() }}
                </v-list-item-subtitle>
                <template v-slot:append>
                  <v-btn
                    icon
                    variant="text"
                    @click="downloadRecording(recording)"
                  >
                    <v-icon>mdi-download</v-icon>
                  </v-btn>
                </template>
              </v-list-item>
            </v-list>
          </v-card>
        </div>
      </v-card-text>
      
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn
          variant="text"
          color="primary"
          @click="getRecordings"
          :disabled="!hasApplication"
        >
          Refresh Recordings
        </v-btn>
      </v-card-actions>
    </v-card>
    
    <!-- Status Messages -->
    <v-snackbar
      v-model="showMessage"
      :color="messageType"
      :timeout="4000"
    >
      {{ message }}
      <template v-slot:actions>
        <v-btn
          variant="text"
          @click="showMessage = false"
        >
          Close
        </v-btn>
      </template>
    </v-snackbar>
  </div>
</template>

<script>
import { ref, computed } from 'vue';
import axios from 'axios';

export default {
  name: 'VonageCallControls',
  setup() {
    // Form
    const isFormValid = ref(false);
    
    // Application data
    const hasApplication = ref(false);
    const applicationName = ref('Voice Demo App'); // Default name for demo
    const applicationId = ref('');
    const privateKey = ref('');
    const isCreatingApplication = ref(false);
    
    // Call data
    const phoneNumber = ref('+15551234567'); // Default for demo
    const fromNumber = ref('+15557654321'); // Default for demo
    const recordCall = ref(true);
    const isCallingPhone = ref(false);
    const activeCall = ref(null);
    
    // Recordings
    const recordings = ref([]);
    
    // Status message
    const showMessage = ref(false);
    const message = ref('');
    const messageType = ref('info');
    
    // Computed properties
    const canMakeCall = computed(() => {
      return phoneNumber.value && fromNumber.value && applicationId.value && privateKey.value;
    });
    
    // Methods
    const showStatus = (msg, type = 'info') => {
      message.value = msg;
      messageType.value = type;
      showMessage.value = true;
    };
    
    const setupVonageApplication = async () => {
      if (!applicationName.value) return;
      
      isCreatingApplication.value = true;
      
      try {
        const response = await axios.post('/api/vonage/applications', {
          name: applicationName.value
        });
        
        if (response.data.success && response.data.application) {
          applicationId.value = response.data.application.id;
          privateKey.value = response.data.application.keys.private_key;
          
          hasApplication.value = true;
          
          if (response.data.mode === 'simulation') {
            showStatus('Vonage application created successfully (simulation mode)!', 'success');
          } else {
            showStatus('Vonage application created successfully!', 'success');
          }
          
          console.log('Vonage application created with ID:', applicationId.value);
        } else {
          showStatus('Failed to create Vonage application', 'error');
        }
      } catch (error) {
        console.error('Error creating Vonage application:', error);
        showStatus(`Error: ${error.response?.data?.message || error.message}`, 'error');
      } finally {
        isCreatingApplication.value = false;
      }
    };
    
    const makePhoneCall = async () => {
      if (!canMakeCall.value) return;
      
      isCallingPhone.value = true;
      
      try {
        const response = await axios.post('/api/vonage/call', {
          to: phoneNumber.value,
          from: fromNumber.value,
          record: recordCall.value,
          applicationId: applicationId.value,
          privateKey: privateKey.value
        });
        
        if (response.data.success && response.data.call) {
          activeCall.value = response.data.call;
          showStatus('Call initiated successfully!', 'success');
        } else {
          showStatus('Failed to initiate call', 'error');
        }
      } catch (error) {
        console.error('Error making phone call:', error);
        showStatus(`Error: ${error.response?.data?.message || error.message}`, 'error');
      } finally {
        isCallingPhone.value = false;
      }
    };
    
    const checkCallStatus = async () => {
      if (!activeCall.value) return;
      
      try {
        const response = await axios.get(`/api/vonage/call/${activeCall.value.uuid}`, {
          params: {
            applicationId: applicationId.value,
            privateKey: privateKey.value
          }
        });
        
        if (response.data.success && response.data.call) {
          activeCall.value = response.data.call;
          showStatus(`Call status: ${response.data.call.status}`, 'info');
        } else {
          showStatus('Failed to get call status', 'error');
        }
      } catch (error) {
        console.error('Error checking call status:', error);
        showStatus(`Error: ${error.response?.data?.message || error.message}`, 'error');
      }
    };
    
    const getRecordings = async () => {
      if (!hasApplication.value) return;
      
      try {
        const response = await axios.get('/api/vonage/recordings', {
          params: {
            applicationId: applicationId.value,
            privateKey: privateKey.value
          }
        });
        
        if (response.data.success) {
          recordings.value = response.data.recordings;
          
          if (recordings.value.length === 0) {
            showStatus('No recordings found', 'info');
          } else {
            showStatus(`Found ${recordings.value.length} recordings`, 'success');
          }
        } else {
          showStatus('Failed to get recordings', 'error');
        }
      } catch (error) {
        console.error('Error getting recordings:', error);
        showStatus(`Error: ${error.response?.data?.message || error.message}`, 'error');
      }
    };
    
    const downloadRecording = (recording) => {
      // In a real app, this would download the recording file
      // For this demo, we just show a message
      showStatus('Downloading recording is not implemented in this demo', 'info');
    };
    
    return {
      // State
      isFormValid,
      hasApplication,
      applicationName,
      applicationId,
      privateKey,
      isCreatingApplication,
      phoneNumber,
      fromNumber,
      recordCall,
      isCallingPhone,
      activeCall,
      recordings,
      showMessage,
      message,
      messageType,
      
      // Computed
      canMakeCall,
      
      // Methods
      setupVonageApplication,
      makePhoneCall,
      checkCallStatus,
      getRecordings,
      downloadRecording
    };
  }
};
</script>

<style scoped>
.vonage-call-container {
  margin-top: 20px;
}

.vonage-card {
  max-width: 600px;
  margin: 0 auto;
}

.vonage-card-title {
  background-color: #f5f5f5;
}

.setup-section,
.call-controls,
.application-info {
  margin-bottom: 24px;
}

.active-call,
.recordings {
  margin-top: 24px;
}
</style>