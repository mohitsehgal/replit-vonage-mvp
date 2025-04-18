/**
 * Vonage API Service using REST API directly
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Vonage API credentials
const VONAGE_API_KEY = process.env.VONAGE_API_KEY;
const VONAGE_API_SECRET = process.env.VONAGE_API_SECRET;

// Vonage API endpoints
const API_BASE_URL = 'https://api.nexmo.com';
const APPLICATIONS_URL = `${API_BASE_URL}/v2/applications`;
const CALLS_URL = `${API_BASE_URL}/v1/calls`;
const TTS_URL = `${API_BASE_URL}/v0.1/tts`;

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
    
    const response = await axios({
      method: 'post',
      url: TTS_URL,
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
    console.log('Creating Vonage application using REST API:', name);
    console.log('Using webhooks:', { answerUrl, eventUrl });

    // Basic auth for Vonage API
    const auth = Buffer.from(`${VONAGE_API_KEY}:${VONAGE_API_SECRET}`).toString('base64');
    
    // Application payload
    const applicationData = {
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
    };
    
    // Create application using REST API
    const response = await axios({
      method: 'post',
      url: APPLICATIONS_URL,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      data: applicationData
    });
    
    console.log('Successfully created Vonage application with REST API:', response.data.id);
    return response.data;
  } catch (error) {
    console.error('Error creating Vonage application with REST API:', error.response?.data || error.message);
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
    console.log('Starting call using Vonage REST API to:', to, 'from:', from);
    
    // Create JWT token for authentication
    const token = generateJWT(applicationId, privateKey);
    
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
    
    // Call payload
    const callData = {
      to: [{ type: 'phone', number: to }],
      from: { type: 'phone', number: from },
      ncco
    };
    
    // Start the call with REST API
    const response = await axios({
      method: 'post',
      url: CALLS_URL,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: callData
    });
    
    console.log('Call started successfully with REST API:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error starting call with REST API:', error.response?.data || error.message);
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
    console.log('Getting call info using Vonage REST API for UUID:', callUuid);
    
    // Create JWT token for authentication
    const token = generateJWT(applicationId, privateKey);
    
    // Get call information
    const response = await axios({
      method: 'get',
      url: `${CALLS_URL}/${callUuid}`,
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error getting call info with REST API:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get a list of recordings from local storage
 * @param {string} applicationId - Vonage application ID (used for filtering)
 * @param {string} privateKey - Private key for the application (not used but kept for API compatibility)
 * @returns {Promise<Array>} List of recordings
 */
async function getRecordings(applicationId, privateKey) {
  try {
    console.log('Getting recordings from local storage for application:', applicationId);
    
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
    console.error('Error getting recordings from local storage:', error);
    throw error;
  }
}

/**
 * Generate JWT token for Vonage API authentication
 * @param {string} applicationId - Vonage application ID
 * @param {string} privateKey - Private key for the application
 * @returns {string} JWT token
 */
function generateJWT(applicationId, privateKey) {
  // Prepare header
  const header = {
    typ: 'JWT',
    alg: 'RS256'
  };
  
  // Prepare payload
  const payload = {
    application_id: applicationId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400, // 24 hours
    jti: crypto.randomUUID()
  };
  
  // Base64 encode header and payload
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  
  // Create the signing input
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  
  // Sign the token
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = signer.sign(privateKey, 'base64url');
  
  // Return the complete JWT
  return `${signingInput}.${signature}`;
}

module.exports = {
  textToSpeech,
  getVoiceName,
  createVoiceApplication,
  startCall,
  getCallInfo,
  getRecordings
};