const axios = require('axios');

// Vonage API credentials
const VONAGE_API_KEY = process.env.VONAGE_API_KEY;
const VONAGE_API_SECRET = process.env.VONAGE_API_SECRET;

// Detect environment (Replit, localhost, etc.)
const isReplit = process.env.REPL_ID || process.env.REPL_SLUG;
const isLocalDev = false; // Set to false to enable real Vonage API integration

// Safely import Vonage SDK
let vonage;
try {
  // Import Vonage SDK - needs to be imported differently for v3
  const { Auth } = require('@vonage/auth');
  const { Vonage } = require('@vonage/server-sdk');
  const { Applications } = require('@vonage/applications');
  const { Voice } = require('@vonage/voice');
  
  // Create a function to get Vonage instance with proper credentials
  const createVonageClient = (credentials) => {
    // Basic auth with API key and secret
    if (credentials.apiKey && credentials.apiSecret) {
      return new Vonage({
        apiKey: credentials.apiKey,
        apiSecret: credentials.apiSecret
      });
    }
    // Application auth with private key
    else if (credentials.applicationId && credentials.privateKey) {
      return new Vonage({
        applicationId: credentials.applicationId,
        privateKey: credentials.privateKey
      });
    }
    else {
      throw new Error('Invalid Vonage credentials provided');
    }
  };
  
  // Export the client creator instead of a singleton
  module.exports.createVonageClient = createVonageClient;
} catch (error) {
  console.error('Failed to import Vonage SDK:', error);
  // Log detailed error to help with debugging
  console.error('Vonage SDK import error details:', {
    message: error.message,
    stack: error.stack
  });
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
  return new Promise(async (resolve, reject) => {
    try {
      // We'll use the real Vonage API regardless of URL protocol
      // This is needed for actual integration with Vonage account
      console.log('Creating real application with Vonage API using webhooks:', answerUrl, eventUrl);
      
      // For Vonage SDK v3, we need to create a client differently
      const { Vonage } = require('@vonage/server-sdk');
      const { Applications } = require('@vonage/applications');
      
      const vonage = new Vonage({
        apiKey: VONAGE_API_KEY,
        apiSecret: VONAGE_API_SECRET
      });
      
      // Access the applications API
      try {
        // Use the async/await pattern for the v3 SDK
        const result = await vonage.applications.create({
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
        });
        
        console.log('Successfully created Vonage voice application:', result.id);
        resolve(result);
      } catch (apiError) {
        console.error('API Error creating Vonage voice application:', apiError);
        
        // If we get a specific error about the API being missing, try alternative approach
        if (apiError.message && apiError.message.includes('not a function')) {
          console.log('Trying alternative API approach for Vonage SDK v3...');
          
          // Try the alternative approach for v3
          const applicationsClient = new Applications(vonage);
          
          const result = await applicationsClient.create({
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
          });
          
          console.log('Successfully created Vonage voice application using v3 API:', result.id);
          resolve(result);
        } else {
          reject(apiError);
        }
      }
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
      console.log('Starting real call using Vonage API to:', to, 'from:', from);
      
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
      console.log('Getting real call info using Vonage API for UUID:', callUuid);
      
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
  // Vonage doesn't expose a simple recordings API for non-enterprise accounts
  // So we'll handle recordings manually through webhooks
  return new Promise((resolve, reject) => {
    try {
      console.log('Getting recordings for application:', applicationId);
      
      // Create a specialized client with application credentials
      const vonageApp = new Vonage({
        applicationId,
        privateKey
      });
      
      // In a production app with persistent storage, we would:
      // 1. Query our database for stored recordings associated with this application
      // 2. Return the list of recordings with their metadata
      
      // Since we're downloading recordings via webhook, we'll check the recordings directory
      const fs = require('fs');
      const path = require('path');
      const recordingsDir = path.join(__dirname, '../../recordings');
      
      // Create the directory if it doesn't exist
      if (!fs.existsSync(recordingsDir)) {
        fs.mkdirSync(recordingsDir, { recursive: true });
        return resolve([]); // No recordings yet
      }
      
      // Read recordings from the directory
      fs.readdir(recordingsDir, (err, files) => {
        if (err) {
          console.error('Error reading recordings directory:', err);
          return reject(err);
        }
        
        // Filter for MP3 files and create recording objects
        const recordings = files
          .filter(file => file.endsWith('.mp3'))
          .map(file => {
            const stats = fs.statSync(path.join(recordingsDir, file));
            return {
              id: file.replace('.mp3', ''),
              timestamp: stats.mtime.toISOString(),
              duration: Math.floor(stats.size / 16000), // Rough estimate of duration based on file size
              size: stats.size,
              status: 'completed',
              format: 'mp3',
              filePath: path.join(recordingsDir, file)
            };
          });
        
        console.log(`Found ${recordings.length} recordings in ${recordingsDir}`);
        resolve(recordings);
      });
    } catch (error) {
      console.error('Error getting recordings:', error);
      reject(error);
    }
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