const OpenAI = require('openai');
const axios = require('axios');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here'
});

/**
 * Get AI response from OpenAI
 * @param {string} message - User message
 * @param {string} systemPrompt - System prompt to define AI behavior
 * @returns {Promise<string>} - AI response
 */
async function getAIResponse(message, systemPrompt) {
  try {
    // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: systemPrompt || "You are a helpful AI assistant who responds concisely and clearly."
        },
        {
          role: "user",
          content: message
        }
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    if (!response.choices || response.choices.length === 0) {
      throw new Error('No response from OpenAI');
    }

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('OpenAI API error:', error);
    throw new Error(`Failed to get response from OpenAI: ${error.message}`);
  }
}

/**
 * Convert text to speech using OpenAI TTS API
 * @param {string} text - Text to convert to speech
 * @param {string} voiceType - Voice type (male/female)
 * @returns {Promise<Buffer>} - Audio buffer
 */
async function textToSpeech(text, voiceType = 'female') {
  try {
    // Choose the appropriate voice based on the voiceType
    const voice = voiceType === 'male' ? 'onyx' : 'nova';
    
    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: voice,
      input: text,
    });

    // Get the audio data as an ArrayBuffer
    const buffer = await response.arrayBuffer();
    
    // Convert ArrayBuffer to Buffer for Node.js
    return Buffer.from(buffer);
  } catch (error) {
    console.error('OpenAI TTS API error:', error);
    throw new Error(`Failed to convert text to speech using OpenAI: ${error.message}`);
  }
}

module.exports = {
  getAIResponse,
  textToSpeech
};
