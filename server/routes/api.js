const express = require('express');
const router = express.Router();
const openaiService = require('../services/openaiService');
const vonageService = require('../services/vonageService');

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Chat endpoint
router.post('/chat', async (req, res) => {
  try {
    const { message, systemPrompt } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }
    
    const response = await openaiService.getAIResponse(message, systemPrompt);
    
    res.json({
      success: true,
      response
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
