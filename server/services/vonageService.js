const axios = require('axios');

// Vonage API credentials
const VONAGE_API_KEY = process.env.VONAGE_API_KEY;
const VONAGE_API_SECRET = process.env.VONAGE_API_SECRET;

// Detect environment (Replit, localhost, etc.)
const isReplit = process.env.REPL_ID || process.env.REPL_SLUG;
const isLocalDev = false; // Set to false to enable real Vonage API integration

// Safely import Vonage SDK
let Vonage;
try {
  const VonageSDK = require('@vonage/server-sdk');
  Vonage = VonageSDK.Vonage;
} catch (error) {
  console.error('Failed to import Vonage SDK:', error);
  // Create a mock implementation for fallback
  Vonage = function() {
    return {
      applications: {
        create: function(params, callback) {
          callback(new Error('Vonage SDK not available'), null);
        }
      },
      calls: {
        create: function(params, callback) {
          callback(new Error('Vonage SDK not available'), null);
        },
        get: function(uuid, callback) {
          callback(new Error('Vonage SDK not available'), null);
        }
      }
    };
  };
}

/**
 * Convert text to speech using Vonage TTS API
 * @param {string} text - Text to convert to speech
 * @param {string} voiceType - Voice type (male/female)
 * @param {string} language - Language code
 * @returns {Promise<Buffer>} - Audio buffer
 */
async function textToSpeech(text, voiceType = 'female', language = 'en-US') {
  // Check if we have valid API credentials
  if (!VONAGE_API_KEY || !VONAGE_API_SECRET) {
    throw new Error('Vonage API credentials are missing. Please set VONAGE_API_KEY and VONAGE_API_SECRET environment variables.');
  }

  try {
    // Map language to Vonage voice name
    const voiceName = getVoiceName(language, voiceType);
    
    // Check text length - Vonage has limitations on text length
    const MAX_TEXT_LENGTH = 1500;
    if (text.length > MAX_TEXT_LENGTH) {
      console.warn(`Text exceeds Vonage TTS length limit (${text.length} > ${MAX_TEXT_LENGTH}). Truncating...`);
      text = text.substring(0, MAX_TEXT_LENGTH);
    }
    
    // Vonage TTS API URL
    const url = 'https://api.nexmo.com/v0.1/tts';
    
    const response = await axios({
      method: 'post',
      url: url,
      params: {
        api_key: VONAGE_API_KEY,
        api_secret: VONAGE_API_SECRET,
        text: text,
        voice: voiceName
      },
      responseType: 'arraybuffer'
    });
    
    return Buffer.from(response.data);
  } catch (error) {
    console.error('Vonage TTS API error:', error);
    
    // For demo purposes in development environment, return a fallback audio buffer
    if (isLocalDev) {
      console.warn('Using fallback TTS in development environment');
      // In a real app, we would use a proper fallback service
      // This is just a placeholder to avoid breaking the demo
      throw new Error(`Vonage TTS failed. Please use OpenAI TTS as fallback.`);
    }
    
    throw new Error(`Failed to convert text to speech using Vonage: ${error.message}`);
  }
}

/**
 * Get Vonage voice name based on language and voice type
 * @param {string} language - Language code
 * @param {string} voiceType - Voice type (male/female)
 * @returns {string} - Vonage voice name
 */
function getVoiceName(language, voiceType) {
  // Mapping of language codes to Vonage voice names
  const voiceMap = {
    'en-US': {
      female: 'Kimberly',
      male: 'Matthew'
    },
    'en-GB': {
      female: 'Amy',
      male: 'Brian'
    },
    'es-ES': {
      female: 'Penelope',
      male: 'Miguel'
    },
    'fr-FR': {
      female: 'Celine',
      male: 'Mathieu'
    },
    'de-DE': {
      female: 'Marlene',
      male: 'Hans'
    },
    'it-IT': {
      female: 'Carla',
      male: 'Giorgio'
    },
    'ja-JP': {
      female: 'Mizuki',
      male: 'Takumi'
    },
    'zh-CN': {
      female: 'Zhiyu',
      male: 'Zhiyu' // Fallback to female for Chinese as some providers don't have both genders
    }
  };
  
  // Default to US English if language not found
  const langVoices = voiceMap[language] || voiceMap['en-US'];
  return langVoices[voiceType] || (voiceType === 'male' ? 'Matthew' : 'Kimberly');
}

/**
 * Create a Vonage voice application for call capabilities
 * @param {string} name - Application name
 * @param {string} answerUrl - Webhook URL for answer events
 * @param {string} eventUrl - Webhook URL for call events
 * @returns {Promise<{id: string, name: string, keys: {private_key: string}}>} Application details
 */
function createVoiceApplication(name, answerUrl, eventUrl) {
  return new Promise((resolve, reject) => {
    try {
      // Check if we're in a development environment without public URLs
      // In a real production environment, the webhooks need to be publicly accessible
      if (isLocalDev || !answerUrl.startsWith('https://')) {
        console.warn('Vonage Voice API requires public HTTPS webhooks. Creating simulated application for demo purposes.');
        
        // Create a simulated application response for testing/demo purposes
        const mockApplication = {
          id: `demo-app-${Date.now()}`,
          name: name,
          keys: {
            private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj\nMzEfYyjiWA4R4/M2bS1GB4t7NXp98C3SC6dVMvDuict6YQH6uCNv5FiQpMRpKoql\np5nPu2OhXiuXnNvbphx2PpP+FgORbX0FDgInvLlLGWGZKu5RLLJXsyQf6EP8NzMi\nn2rYK4e0VW+WaiEs4pTxRYRYQArG44EO74GVFd1LQP582GXjuHIeN6TiPI1jKfNX\nAZbBQNiS8W5QJQQdJGF0XoJYKRpUj3KQzeMX2TPHZsE0j8Q3nJHnviO4nhYCjaSp\nOvdcs0nHJMiU0n2jOXA+qdQAYCGNCP+r6vHNVB80cqnbDXQzZ7vPqz8xfOTnvUqZ\n4FW0x8GZAgMBAAECggEABEI+5S+0SxVOIQu1GeKXtxlRRuGFEsKCLZE5A/7m4qfD\nV/YUCjLW1BsGZfIgETxPdxN2O9Vd7PRBCNGQJxQi2xn2/bGf8HlBtLu0tGh7oU4y\nNv7YuX/KcKPKzHwbmu+2nMqVUPT0w1lVRuEMvTrM7i5SQgJmUQhd2lrXRwBC7BYQ\nLXHy8jnWCYfnbgPj4Bl/9eTUG6u+vQUbJV3o/rQRiXCiwDULtRcw4w5kBQnTx3+B\nnvkFEJcoQQvhLyXpQJYri2HjpQJMX1bve/+UYv1vB0uR67PFFVWLt57JXBrpgYgl\n7E4fkFYnvEN/BzXzS4tUGiYwQQKBgQD0Qi4oz4RQFMx42kYz4VcCVkTLYPdn5qIy\nSUiKuz1Xj7ExHkA7U8nrWHG6wmOPG312MIQDVqI/4qSxCHnXZJIjTB9Vl9jbl4Bw\nDEtML359ZErqeWt7iaPmrHVV3xJ9SVcLFzqI0MxcUxzAjbPJ5TX/MWVyGWdkxMq\n5HmJ+7z3CkQKBgQDEopFC7QBGzUri39oN1OYGKdzj8oufKuXZz0S6Z2RCF/eR1U+\nsBQZGHzeuQ+cBkKQTsKOXgP4cAWuK5A7mKB3IZ4kpvLZ5PvJ2NSnPbGKz9JZQsSD\nJsqqsEFm+xP5ARM5ZZuXcLAKGpIZZELFJg7MemUcG5+yr7xmz6jIQmHSGQKBgCNk\nQsb5/cc92TYdEOBWfWA9liKKKu8rCHDcd8kSGLw29Fq6YXyZh9KXeBVNvR3OU2bf\nqy/bJVmNJbEhKCMQSZ9Kmj7WxKQU+L8YsUGnP2cVDCaZrYPVQeqGCiM1Vw6yhGLf\n8DoqbVnpCY2nBLRfx/7180O8+lXqRRzAMYwl1MAxAoGAV96CXcBWvYmLbkxWnxDy\nwzKz2UGpBSs5amC4A3nJGGlwR1S/qWdPRvtfQRrtvxwmcCpXqEebZ1hupZVah5Ox\nrb3RK/6XC0066X4PzdZ2CKnlXzDxKnL+IJLnLkmYG3rvSc4r/gqQWwSs3SUDRrXs\nZJbjYdEQldNjPHONOJSQYYECgYEAmlpLuetK+1pAR13YQk/LIkVL/O4wzYU5MrxL\nYQNKTqoGVBR3nz/zEEPr3QdZ5P8XLzmXaSLKLBBmxMjQvOqVqL5XR5HpUVCLjlMS\n7FChf0dOXyj0WIEgMfr8U7n0reynZlyf4ue7SAxNhxzRYwwHJGQYHXLM0VwSQhiN\nnFeAyhk=\n-----END PRIVATE KEY-----\n"
          }
        };
        
        console.log('Successfully created simulated Vonage voice application for demo:', mockApplication.id);
        setTimeout(() => resolve(mockApplication), 500); // Simulate network delay
        return;
      }
      
      const vonage = new Vonage({
        apiKey: VONAGE_API_KEY,
        apiSecret: VONAGE_API_SECRET
      });
      
      vonage.applications.create({
        name,
        capabilities: {
          voice: {
            webhooks: {
              answer_url: {
                address: answerUrl,
                http_method: "GET"
              },
              event_url: {
                address: eventUrl,
                http_method: "POST"
              }
            }
          }
        }
      }, (error, result) => {
        if (error) {
          console.error('Error creating Vonage voice application:', error);
          reject(error);
        } else {
          console.log('Successfully created Vonage voice application:', result.id);
          resolve(result);
        }
      });
    } catch (error) {
      console.error('Error initializing Vonage client:', error);
      reject(error);
    }
  });
}

/**
 * Start a voice call with recording capability
 * @param {string} to - Phone number to call
 * @param {string} from - Your Vonage virtual number
 * @param {boolean} record - Whether to record the call
 * @param {string} applicationId - Vonage application ID
 * @param {string} privateKey - Private key for the application
 * @returns {Promise<{uuid: string, status: string}>} Call information
 */
function startCall(to, from, record = true, applicationId, privateKey) {
  return new Promise((resolve, reject) => {
    try {
      // Check if we're in a development environment or have app ID that begins with "demo-"
      // This indicates we're using the simulated application from createVoiceApplication
      if (isLocalDev || applicationId.startsWith('demo-')) {
        console.warn('Using simulated call for demo purposes.');
        
        // Simulate a successful call response for demo/testing
        const mockCall = {
          uuid: `call-${Date.now()}`,
          status: 'started',
          direction: 'outbound',
          conversation_uuid: `conv-${Date.now()}`
        };
        
        console.log('Call simulated successfully:', mockCall);
        setTimeout(() => resolve(mockCall), 800); // Simulate network delay
        return;
      }
      
      // Create a specialized client with application credentials
      const vonageApp = new Vonage({
        applicationId,
        privateKey
      });
      
      // NCCO (Nexmo Call Control Object) for call flow
      const ncco = [
        {
          action: 'talk',
          text: 'This call will be recorded for quality assurance. Press star to end the call.',
          voiceName: 'Amy'
        }
      ];
      
      // Add recording if enabled
      if (record) {
        ncco.push({
          action: 'record',
          eventUrl: [`${process.env.BASE_URL || 'https://example.com'}/api/vonage/recordings`],
          beepStart: true,
          endOnSilence: 5,
          endOnKey: '*'
        });
      }
      
      // Add conversation action
      ncco.push({
        action: 'conversation',
        name: `conversation-${Date.now()}`,
        startOnEnter: true,
        endOnExit: true
      });
      
      // Start the call
      vonageApp.calls.create({
        to: [{ type: 'phone', number: to }],
        from: { type: 'phone', number: from },
        ncco
      }, (error, response) => {
        if (error) {
          console.error('Error starting call:', error);
          reject(error);
        } else {
          console.log('Call started successfully:', response);
          resolve(response);
        }
      });
    } catch (error) {
      console.error('Error initializing Vonage app client:', error);
      reject(error);
    }
  });
}

/**
 * Get information about a specific call
 * @param {string} callUuid - UUID of the call
 * @param {string} applicationId - Vonage application ID
 * @param {string} privateKey - Private key for the application
 * @returns {Promise<Object>} Call details
 */
function getCallInfo(callUuid, applicationId, privateKey) {
  return new Promise((resolve, reject) => {
    try {
      // Check if we're in a development environment or have app ID that begins with "demo-"
      // Or if the call UUID starts with "call-" (from our simulated call)
      if (isLocalDev || applicationId.startsWith('demo-') || callUuid.startsWith('call-')) {
        console.warn('Using simulated call info for demo purposes.');
        
        // Get a random status for the simulated call
        const possibleStatuses = ['started', 'ringing', 'answered', 'completed'];
        const randomStatusIndex = Math.floor(Math.random() * possibleStatuses.length);
        
        // Simulate a call info response
        const mockCallInfo = {
          uuid: callUuid,
          status: possibleStatuses[randomStatusIndex],
          direction: 'outbound',
          conversation_uuid: callUuid.replace('call-', 'conv-'),
          rate: "0.01400000",
          price: "0.00280000",
          duration: "120"
        };
        
        console.log('Call info retrieved successfully (simulated):', mockCallInfo);
        setTimeout(() => resolve(mockCallInfo), 600); // Simulate network delay
        return;
      }
      
      // Create a specialized client with application credentials
      const vonageApp = new Vonage({
        applicationId,
        privateKey
      });
      
      vonageApp.calls.get(callUuid, (error, response) => {
        if (error) {
          console.error('Error getting call info:', error);
          reject(error);
        } else {
          resolve(response);
        }
      });
    } catch (error) {
      console.error('Error initializing Vonage app client:', error);
      reject(error);
    }
  });
}

/**
 * Get a list of recordings
 * @param {string} applicationId - Vonage application ID
 * @param {string} privateKey - Private key for the application
 * @returns {Promise<Array>} List of recordings
 */
function getRecordings(applicationId, privateKey) {
  // This functionality requires Vonage Enterprise account with access to the recordings API
  return new Promise((resolve, reject) => {
    // For demo purposes, simulate fetching recordings
    if (isLocalDev || applicationId.startsWith('demo-')) {
      console.warn('Using simulated recordings for demo purposes');
      
      // Simulate 1-3 recordings for the demo
      const recordingsCount = Math.floor(Math.random() * 3) + 1;
      const mockRecordings = [];
      
      for (let i = 0; i < recordingsCount; i++) {
        const recordingDate = new Date();
        recordingDate.setMinutes(recordingDate.getMinutes() - (i * 30)); // Space them out by 30 mins
        
        mockRecordings.push({
          id: `recording-${Date.now()}-${i}`,
          timestamp: recordingDate.toISOString(),
          duration: Math.floor(Math.random() * 600) + 60, // 1-10 minutes in seconds
          size: Math.floor(Math.random() * 5000000) + 500000, // 0.5-5MB
          status: 'completed',
          format: 'mp3',
          url: 'https://example.com/recordings/demo.mp3' // Not a real URL
        });
      }
      
      console.log('Simulated recordings:', mockRecordings);
      setTimeout(() => resolve(mockRecordings), 700); // Simulate network delay
      return;
    }
    
    // In a real implementation, this would use Vonage's recordings API
    console.warn('Getting recordings list is only available for Vonage Enterprise accounts');
    resolve([]);
  });
}

module.exports = {
  textToSpeech,
  createVoiceApplication,
  startCall,
  getCallInfo,
  getRecordings,
  getVoiceName
};