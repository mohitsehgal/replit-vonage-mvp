const express = require('express');
const router = express.Router();
const openaiService = require('../services/openaiService');
const vonageService = require('../services/vonageService');

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Chat endpoint with streaming response for lower latency
router.post('/chat', async (req, res) => {
  try {
    const { message, systemPrompt, voiceSettings } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }
    
    // Start streaming response for lower latency
    const streamingResponse = await openaiService.getStreamingAIResponse(message, systemPrompt);
    
    // Return the initial streaming response immediately to reduce perceived latency
    res.json({
      success: true,
      text: streamingResponse.partialText,
      isPartial: true,
      streamId: streamingResponse.streamId,
      audioUrl: null // Audio will be generated on completion
    });
    
    // Continue processing in the background to generate full response and audio
    openaiService.processFinalResponse(streamingResponse.streamId, streamingResponse.completeTextPromise)
      .then(async (finalText) => {
        console.log('Final AI response ready:', finalText.substring(0, 50) + '...');
        
        // Generate audio for the response
        let audioData;
        try {
          // First try Vonage TTS
          audioData = await vonageService.textToSpeech(
            finalText, 
            voiceSettings?.voiceType || 'female',
            voiceSettings?.language || 'en-US'
          );
        } catch (vonageError) {
          console.warn('Vonage TTS failed, falling back to OpenAI TTS:', vonageError.message);
          
          // Fallback to OpenAI TTS
          audioData = await openaiService.textToSpeech(
            finalText, 
            voiceSettings?.voiceType || 'female'
          );
        }
        
        // Create a temporary audio file path for frontend access
        const timestamp = Date.now();
        const audioFileName = `audio_${timestamp}.mp3`;
        const audioPath = `/api/audio/${audioFileName}`;
        
        // Store the audio data in memory for retrieval
        if (!req.app.locals.audioCache) {
          req.app.locals.audioCache = {};
        }
        req.app.locals.audioCache[audioFileName] = audioData;
        
        // Store the full response to be fetched by client polling
        if (!req.app.locals.responseCache) {
          req.app.locals.responseCache = {};
        }
        req.app.locals.responseCache[streamingResponse.streamId] = {
          text: finalText,
          audioUrl: audioPath,
          timestamp: Date.now()
        };
        
        // Cleanup old cache entries occasionally
        cleanupOldCacheEntries(req.app.locals);
        
      }).catch(error => {
        console.error('Background processing error:', error);
      });
      
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get AI response',
      error: error.message
    });
  }
});

// Endpoint to check for completed responses
router.get('/response/:streamId', (req, res) => {
  const { streamId } = req.params;
  
  if (!req.app.locals.responseCache || !req.app.locals.responseCache[streamId]) {
    return res.json({
      success: true,
      complete: false
    });
  }
  
  // Return the completed response with audio URL
  const completeResponse = req.app.locals.responseCache[streamId];
  
  // Remove from cache to save memory
  delete req.app.locals.responseCache[streamId];
  
  return res.json({
    success: true,
    complete: true,
    text: completeResponse.text,
    audioUrl: completeResponse.audioUrl
  });
});

// Helper function to clean up old cache entries
function cleanupOldCacheEntries(appLocals) {
  const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes
  const now = Date.now();
  
  if (appLocals.responseCache) {
    Object.keys(appLocals.responseCache).forEach(key => {
      if (now - appLocals.responseCache[key].timestamp > MAX_AGE_MS) {
        delete appLocals.responseCache[key];
      }
    });
  }
  
  // Also clean up audio cache occasionally
  if (appLocals.audioCache && Object.keys(appLocals.audioCache).length > 100) {
    // If we have too many cached audio files, remove the oldest ones
    const audioFiles = Object.keys(appLocals.audioCache);
    // Keep only the 50 most recent files
    audioFiles.slice(0, audioFiles.length - 50).forEach(file => {
      delete appLocals.audioCache[file];
    });
  }
}

// Text-to-Speech endpoint
router.post('/tts', async (req, res) => {
  try {
    const { text, voiceType, language } = req.body;
    
    if (!text) {
      return res.status(400).json({
        success: false,
        message: 'Text is required'
      });
    }
    
    // First try Vonage TTS
    try {
      const audioBuffer = await vonageService.textToSpeech(text, voiceType, language);
      
      res.set('Content-Type', 'audio/mp3');
      return res.send(audioBuffer);
    } catch (vonageError) {
      console.error('Vonage TTS failed, falling back to OpenAI TTS:', vonageError);
      
      // Fallback to OpenAI TTS
      const audioBuffer = await openaiService.textToSpeech(text, voiceType);
      
      res.set('Content-Type', 'audio/mp3');
      return res.send(audioBuffer);
    }
  } catch (error) {
    console.error('Error in TTS endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to convert text to speech',
      error: error.message
    });
  }
});

// Serve audio files from the in-memory cache
router.get('/audio/:filename', (req, res) => {
  const { filename } = req.params;
  
  // Check if the audio file exists in the cache
  if (!req.app.locals.audioCache || !req.app.locals.audioCache[filename]) {
    return res.status(404).json({
      success: false,
      message: 'Audio file not found'
    });
  }
  
  // Set appropriate headers
  res.set('Content-Type', 'audio/mp3');
  res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
  
  // Send the audio data
  res.send(req.app.locals.audioCache[filename]);
});

// Speech-to-Text endpoint (for non-Web Speech API compatible browsers)
router.post('/stt', async (req, res) => {
  try {
    // This would typically be a file upload, but we're keeping it simple
    // by using the Web Speech API on the frontend
    res.status(501).json({
      success: false,
      message: 'Speech-to-text via API not implemented. Please use the browser\'s Web Speech API.'
    });
  } catch (error) {
    console.error('Error in STT endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to convert speech to text',
      error: error.message
    });
  }
});

module.exports = router;
