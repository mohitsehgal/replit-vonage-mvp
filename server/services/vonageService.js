const axios = require('axios');

// Vonage API credentials
const VONAGE_API_KEY = process.env.VONAGE_API_KEY;
const VONAGE_API_SECRET = process.env.VONAGE_API_SECRET;

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

module.exports = {
  textToSpeech
};
