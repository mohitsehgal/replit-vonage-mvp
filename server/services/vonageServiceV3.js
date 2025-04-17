/**
 * Vonage API Service with V3 compatibility
 * For use with @vonage/server-sdk v3.x
 */

const axios = require('axios');

// Vonage API credentials
const VONAGE_API_KEY = process.env.VONAGE_API_KEY;
const VONAGE_API_SECRET = process.env.VONAGE_API_SECRET;

// Import required Vonage SDK V3 modules
const { Auth } = require('@vonage/auth');
const { Vonage } = require('@vonage/server-sdk');
const { Applications } = require('@vonage/applications');
const { Voice } = require('@vonage/voice');

/**
 * Create a Vonage client for V3 SDK
 * @param {Object} options - Client options
 * @returns {Object} Vonage client
 */
function createVonageClient(options = {}) {
  if (options.applicationId && options.privateKey) {
    // Application auth for specific application API access
    return new Vonage({
      applicationId: options.applicationId,
      privateKey: options.privateKey
    });
  } else {
    // Basic auth for general API access
    return new Vonage({
      apiKey: VONAGE_API_KEY,
      apiSecret: VONAGE_API_SECRET
    });
  }
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
 * @returns {Promise<Object>} Application details
 */
async function createVoiceApplication(name, answerUrl, eventUrl) {
  try {
    console.log('Creating Vonage application with V3 SDK:', name);
    console.log('Using webhooks:', { answerUrl, eventUrl });
    
    // Create a Vonage client with basic auth
    const vonage = createVonageClient();
    
    // Create an Applications client
    const applicationsClient = new Applications(vonage);
    
    // Create the application using the V3 SDK pattern
    const application = await applicationsClient.create({
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
    
    console.log('Successfully created Vonage application:', application.id);
    return application;
  } catch (error) {
    console.error('Error creating Vonage application:', error);
    throw error;
  }
}

/**
 * Start a voice call with recording capability
 * @param {string} to - Phone number to call
 * @param {string} from - Your Vonage virtual number
 * @param {boolean} record - Whether to record the call
 * @param {string} applicationId - Vonage application ID
 * @param {string} privateKey - Private key for the application
 * @returns {Promise<Object>} Call information
 */
async function startCall(to, from, record = true, applicationId, privateKey) {
  try {
    console.log('Starting call using Vonage V3 SDK to:', to, 'from:', from);
    
    // Create a Vonage client with application credentials
    const vonage = createVonageClient({
      applicationId,
      privateKey
    });
    
    // Create a Voice client
    const voiceClient = new Voice(vonage);
    
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
    
    // Start the call with V3 SDK
    const call = await voiceClient.createOutboundCall({
      to: [{ type: 'phone', number: to }],
      from: { type: 'phone', number: from },
      ncco
    });
    
    console.log('Call started successfully:', call);
    return call;
  } catch (error) {
    console.error('Error starting call:', error);
    throw error;
  }
}

/**
 * Get information about a specific call
 * @param {string} callUuid - UUID of the call
 * @param {string} applicationId - Vonage application ID
 * @param {string} privateKey - Private key for the application
 * @returns {Promise<Object>} Call details
 */
async function getCallInfo(callUuid, applicationId, privateKey) {
  try {
    console.log('Getting call info using Vonage V3 SDK for UUID:', callUuid);
    
    // Create a Vonage client with application credentials
    const vonage = createVonageClient({
      applicationId,
      privateKey
    });
    
    // Create a Voice client
    const voiceClient = new Voice(vonage);
    
    // Get call information
    const call = await voiceClient.getCall(callUuid);
    
    return call;
  } catch (error) {
    console.error('Error getting call info:', error);
    throw error;
  }
}

/**
 * Get a list of recordings
 * We'll use the local filesystem as Vonage doesn't provide an API for listing recordings
 * @param {string} applicationId - Vonage application ID (not used, included for API compatibility)
 * @param {string} privateKey - Private key for the application (not used, included for API compatibility)
 * @returns {Promise<Array>} List of recordings
 */
async function getRecordings(applicationId, privateKey) {
  try {
    console.log('Getting recordings from local storage for application:', applicationId);
    
    // Import filesystem modules
    const fs = require('fs');
    const path = require('path');
    
    // Path to recordings directory
    const recordingsDir = path.join(__dirname, '../../recordings');
    
    // Create the directory if it doesn't exist
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true });
      return [];
    }
    
    // Read the directory for MP3 files
    const files = fs.readdirSync(recordingsDir);
    
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
    return recordings;
  } catch (error) {
    console.error('Error getting recordings:', error);
    throw error;
  }
}

module.exports = {
  createVonageClient,
  textToSpeech,
  getVoiceName,
  createVoiceApplication,
  startCall,
  getCallInfo,
  getRecordings
};