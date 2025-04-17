const OpenAI = require('openai');
const axios = require('axios');
const crypto = require('crypto');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// In-memory store for streaming responses
const streamingResponses = new Map();

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
 * Get streaming AI response from OpenAI for lower latency
 * @param {string} message - User message
 * @param {string} systemPrompt - System prompt to define AI behavior
 * @returns {Promise<{partialText: string, streamId: string, completeTextPromise: Promise<string>}>} - Partial response and promise for complete response
 */
async function getStreamingAIResponse(message, systemPrompt) {
  try {
    // Generate unique ID for this stream
    const streamId = crypto.randomUUID();
    
    // Start the stream
    const stream = await openai.chat.completions.create({
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
      stream: true,
    });
    
    // Variables to track the full response and resolution
    let fullResponse = '';
    let resolveCompleteText;
    
    // Create promise for the complete text
    const completeTextPromise = new Promise((resolve) => {
      resolveCompleteText = resolve;
    });
    
    // Process the stream chunks asynchronously
    (async () => {
      try {
        // First few words to return immediately (first chunk)
        let initialChunk = '';
        let chunkCount = 0;
        
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          fullResponse += content;
          
          // Capture the initial chunk to return immediately
          if (chunkCount === 0 && content) {
            initialChunk = content;
          }
          
          chunkCount++;
        }
        
        // Resolve the promise with the complete response
        resolveCompleteText(fullResponse.trim());
        
        // Cleanup the stream record after a delay
        setTimeout(() => {
          streamingResponses.delete(streamId);
        }, 10 * 60 * 1000); // 10 minutes
        
      } catch (error) {
        console.error('Stream processing error:', error);
        resolveCompleteText('Sorry, there was an error processing your request.');
      }
    })();
    
    // Add a small delay to ensure we get at least the first chunk
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Return the initial chunk and stream ID
    return {
      partialText: fullResponse || 'Processing your request...',
      streamId,
      completeTextPromise
    };
    
  } catch (error) {
    console.error('OpenAI Streaming API error:', error);
    throw new Error(`Failed to get streaming response from OpenAI: ${error.message}`);
  }
}

/**
 * Process the final response from the streaming API
 * @param {string} streamId - ID of the stream
 * @param {Promise<string>} completeTextPromise - Promise that resolves to the complete text
 * @returns {Promise<string>} - Complete response text
 */
async function processFinalResponse(streamId, completeTextPromise) {
  try {
    const completeText = await completeTextPromise;
    return completeText;
  } catch (error) {
    console.error('Error processing final response:', error);
    throw new Error('Failed to process complete response');
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
  getStreamingAIResponse,
  processFinalResponse,
  textToSpeech
};
