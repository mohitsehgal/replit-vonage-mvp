const express = require('express');
const router = express.Router();
const openaiService = require('../services/openaiService');
const vonageService = require('../services/vonageService');
const fs = require('fs');
const path = require('path');

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
    
    // We'll generate audio for initial chunk immediately to start speaking right away
    let initialAudioData;
    let initialAudioPath = null;
    
    if (streamingResponse.partialText && streamingResponse.partialText.length > 10) {
      try {
        // Generate audio for the initial chunk
        const timestamp = Date.now();
        const initialAudioFileName = `audio_initial_${timestamp}.mp3`;
        
        try {
          // First try Vonage TTS for initial chunk
          initialAudioData = await vonageService.textToSpeech(
            streamingResponse.partialText,
            voiceSettings?.voiceType || 'female',
            voiceSettings?.language || 'en-US'
          );
        } catch (vonageError) {
          console.warn('Vonage TTS failed for initial chunk, using OpenAI TTS:', vonageError.message);
          
          // Fallback to OpenAI TTS
          initialAudioData = await openaiService.textToSpeech(
            streamingResponse.partialText,
            voiceSettings?.voiceType || 'female'
          );
        }
        
        initialAudioPath = `/api/audio/${initialAudioFileName}`;
        
        // Store the audio data in memory for retrieval
        if (!req.app.locals.audioCache) {
          req.app.locals.audioCache = {};
        }
        req.app.locals.audioCache[initialAudioFileName] = initialAudioData;
        
        console.log('Generated initial audio for first chunk');
      } catch (audioError) {
        console.error('Failed to generate initial audio:', audioError);
      }
    }
    
    // Return the initial streaming response immediately with initial audio if available
    res.json({
      success: true,
      text: streamingResponse.partialText,
      isPartial: true,
      streamId: streamingResponse.streamId,
      audioUrl: initialAudioPath
    });
    
    // Continue processing in the background to generate full response and audio
    openaiService.processFinalResponse(streamingResponse.streamId, streamingResponse.completeTextPromise)
      .then(async (finalText) => {
        console.log('Final AI response ready:', finalText.substring(0, 50) + '...');
        
        // Skip regenerating audio for the entire response if it's very similar to the initial chunk
        // This prevents weird audio stuttering when responses are very short
        if (initialAudioPath && 
            streamingResponse.partialText && 
            finalText.length < streamingResponse.partialText.length * 1.5) {
          
          console.log('Using initial audio chunk as final audio (response similar to initial chunk)');
          
          // Store the full response to be fetched by client polling
          if (!req.app.locals.responseCache) {
            req.app.locals.responseCache = {};
          }
          req.app.locals.responseCache[streamingResponse.streamId] = {
            text: finalText,
            audioUrl: initialAudioPath,
            timestamp: Date.now()
          };
          
          // Cleanup old cache entries occasionally
          cleanupOldCacheEntries(req.app.locals);
          return;
        }
        
        // For longer responses, generate audio for the complete text
        // We'll strip out the initial text that was already spoken to avoid repetition
        let audioText = finalText;
        if (initialAudioPath && streamingResponse.partialText) {
          // Only generate audio for the remainder of the text to avoid repetition
          const initialLength = streamingResponse.partialText.length;
          if (initialLength > 0 && finalText.startsWith(streamingResponse.partialText)) {
            audioText = finalText.substring(initialLength);
            console.log('Generating audio only for the remainder of the response');
          }
        }
        
        // If there's no additional text to speak, just use the initial audio
        if (!audioText || audioText.trim().length === 0) {
          if (initialAudioPath) {
            console.log('No additional text to speak, using initial audio only');
            
            // Store the full response to be fetched by client polling
            if (!req.app.locals.responseCache) {
              req.app.locals.responseCache = {};
            }
            req.app.locals.responseCache[streamingResponse.streamId] = {
              text: finalText,
              audioUrl: initialAudioPath,
              timestamp: Date.now()
            };
            
            // Cleanup old cache entries occasionally
            cleanupOldCacheEntries(req.app.locals);
            return;
          }
        }
        
        // Generate audio for the remaining response text
        let audioData;
        try {
          // First try Vonage TTS
          audioData = await vonageService.textToSpeech(
            audioText, 
            voiceSettings?.voiceType || 'female',
            voiceSettings?.language || 'en-US'
          );
        } catch (vonageError) {
          console.warn('Vonage TTS failed, falling back to OpenAI TTS:', vonageError.message);
          
          // Fallback to OpenAI TTS
          audioData = await openaiService.textToSpeech(
            audioText, 
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
        
        // If we have initial audio and continuation audio, we need to indicate this
        // so client can play them in sequence
        if (initialAudioPath) {
          req.app.locals.responseCache[streamingResponse.streamId] = {
            text: finalText,
            audioUrl: audioPath,
            initialAudioUrl: initialAudioPath,
            hasMultipartAudio: true,
            timestamp: Date.now()
          };
        } else {
          req.app.locals.responseCache[streamingResponse.streamId] = {
            text: finalText,
            audioUrl: audioPath,
            timestamp: Date.now()
          };
        }
        
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
  
  // Check if this is a multipart audio response
  if (completeResponse.hasMultipartAudio) {
    return res.json({
      success: true,
      complete: true,
      text: completeResponse.text,
      audioUrl: completeResponse.audioUrl,
      initialAudioUrl: completeResponse.initialAudioUrl,
      hasMultipartAudio: true
    });
  } else {
    return res.json({
      success: true,
      complete: true,
      text: completeResponse.text,
      audioUrl: completeResponse.audioUrl
    });
  }
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

// Vonage Voice API endpoints

// Create a Vonage Voice application
router.post('/vonage/applications', async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Application name is required'
      });
    }
    
    console.log('Creating real Vonage application:', name);
    
    // Base URL for webhooks (based on request or environment variable)
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    
    // Create webhook URLs
    const answerUrl = `${baseUrl}/api/vonage/answer`;
    const eventUrl = `${baseUrl}/api/vonage/event`;
    
    // Create the application
    const application = await vonageService.createVoiceApplication(name, answerUrl, eventUrl);
    
    res.json({
      success: true,
      application,
      mode: 'production'
    });
  } catch (error) {
    console.error('Error creating Vonage application:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create Vonage application',
      error: error.message
    });
  }
});

// Start a phone call
router.post('/vonage/call', async (req, res) => {
  try {
    const { to, from, record, applicationId, privateKey } = req.body;
    
    if (!to || !from || !applicationId || !privateKey) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: to, from, applicationId, privateKey'
      });
    }
    
    console.log('Starting real phone call to:', to, 'from:', from);
    
    // Start the real call with real Vonage API
    const call = await vonageService.startCall(to, from, record, applicationId, privateKey);
    
    res.json({
      success: true,
      call,
      mode: 'production'
    });
  } catch (error) {
    console.error('Error starting call:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start call',
      error: error.message
    });
  }
});

// Get call information
router.get('/vonage/call/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params;
    const { applicationId, privateKey } = req.query;
    
    if (!applicationId || !privateKey) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: applicationId, privateKey'
      });
    }
    
    console.log('Getting call information for UUID:', uuid);
    
    // Get call information using real Vonage API
    const callInfo = await vonageService.getCallInfo(uuid, applicationId, privateKey);
    
    res.json({
      success: true,
      call: callInfo,
      mode: 'production'
    });
  } catch (error) {
    console.error('Error getting call info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get call information',
      error: error.message
    });
  }
});

// List recordings
router.get('/vonage/recordings', async (req, res) => {
  try {
    const { applicationId, privateKey } = req.query;
    
    if (!applicationId || !privateKey) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: applicationId, privateKey'
      });
    }
    
    console.log('Getting recordings list for application:', applicationId);
    
    // Get recordings list from real Vonage API
    const recordings = await vonageService.getRecordings(applicationId, privateKey);
    
    res.json({
      success: true,
      recordings,
      mode: 'production'
    });
  } catch (error) {
    console.error('Error listing recordings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list recordings',
      error: error.message
    });
  }
});

// NCCO answer webhook for Vonage Voice API
router.get('/vonage/answer', (req, res) => {
  // This endpoint provides the call flow instructions when a call connects
  // Return a Nexmo Call Control Object (NCCO)
  const ncco = [
    {
      action: 'talk',
      text: 'Welcome to the AI Voice Agent. This call may be recorded for quality assurance.',
      voiceName: 'Amy'
    },
    {
      action: 'conversation',
      name: `conversation-${Date.now()}`,
      startOnEnter: true,
      endOnExit: true,
      record: true
    }
  ];
  
  res.json(ncco);
});

// Event webhook for Vonage Voice API
router.post('/vonage/event', (req, res) => {
  // This endpoint receives call events (started, ringing, answered, completed, etc.)
  console.log('Vonage call event received:', req.body);
  
  // No specific processing needed, just acknowledge receipt
  res.status(204).end();
});

// Recording webhook for Vonage Voice API
router.post('/vonage/recordings', async (req, res) => {
  try {
    // This webhook receives recording information when a call recording completes
    console.log('Recording webhook received:', req.body);
    
    const recordingUrl = req.body.recording_url;
    const recordingUuid = req.body.recording_uuid;
    
    if (recordingUrl && recordingUuid) {
      // Create a recordings directory if it doesn't exist
      const recordingsDir = path.join(__dirname, '../../recordings');
      if (!fs.existsSync(recordingsDir)) {
        fs.mkdirSync(recordingsDir, { recursive: true });
      }
      
      console.log(`Recording available at ${recordingUrl} with UUID ${recordingUuid}`);
      
      try {
        // Download the recording
        const axios = require('axios');
        const response = await axios.get(recordingUrl, { 
          responseType: 'arraybuffer',
          headers: {
            'Authorization': `Basic ${Buffer.from(`${process.env.VONAGE_API_KEY}:${process.env.VONAGE_API_SECRET}`).toString('base64')}`
          }
        });
        
        // Save the recording to the recordings directory
        const fs = require('fs');
        const recordingPath = path.join(recordingsDir, `${recordingUuid}.mp3`);
        fs.writeFileSync(recordingPath, Buffer.from(response.data));
        
        console.log(`Successfully downloaded recording to ${recordingPath}`);
      } catch (downloadError) {
        console.error('Error downloading recording:', downloadError);
      }
    }
    
    res.status(204).end();
  } catch (error) {
    console.error('Error processing recording webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process recording',
      error: error.message
    });
  }
});

module.exports = router;
