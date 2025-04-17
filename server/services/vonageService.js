const axios = require('axios');

// Vonage API credentials
const VONAGE_API_KEY = process.env.VONAGE_API_KEY;
const VONAGE_API_SECRET = process.env.VONAGE_API_SECRET;

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
  try {
    // Map language to Vonage voice name
    const voiceName = getVoiceName(language, voiceType);
    
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
  // This is a placeholder function showing how it would work
  return new Promise((resolve, reject) => {
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