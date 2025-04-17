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
    
    // Force simulation mode for the demo to avoid API errors and provide consistent experience
    console.log('Creating Vonage application in simulation mode for browser demo');
    
    // Create a simulated application response for browser demo
    const simulatedApplication = {
      id: `demo-app-${Date.now()}`,
      name: name,
      keys: {
        private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj\nMzEfYyjiWA4R4/M2bS1GB4t7NXp98C3SC6dVMvDuict6YQH6uCNv5FiQpMRpKoql\np5nPu2OhXiuXnNvbphx2PpP+FgORbX0FDgInvLlLGWGZKu5RLLJXsyQf6EP8NzMi\nn2rYK4e0VW+WaiEs4pTxRYRYQArG44EO74GVFd1LQP582GXjuHIeN6TiPI1jKfNX\nAZbBQNiS8W5QJQQdJGF0XoJYKRpUj3KQzeMX2TPHZsE0j8Q3nJHnviO4nhYCjaSp\nOvdcs0nHJMiU0n2jOXA+qdQAYCGNCP+r6vHNVB80cqnbDXQzZ7vPqz8xfOTnvUqZ\n4FW0x8GZAgMBAAECggEABEI+5S+0SxVOIQu1GeKXtxlRRuGFEsKCLZE5A/7m4qfD\nV/YUCjLW1BsGZfIgETxPdxN2O9Vd7PRBCNGQJxQi2xn2/bGf8HlBtLu0tGh7oU4y\nNv7YuX/KcKPKzHwbmu+2nMqVUPT0w1lVRuEMvTrM7i5SQgJmUQhd2lrXRwBC7BYQ\nLXHy8jnWCYfnbgPj4Bl/9eTUG6u+vQUbJV3o/rQRiXCiwDULtRcw4w5kBQnTx3+B\nnvkFEJcoQQvhLyXpQJYri2HjpQJMX1bve/+UYv1vB0uR67PFFVWLt57JXBrpgYgl\n7E4fkFYnvEN/BzXzS4tUGiYwQQKBgQD0Qi4oz4RQFMx42kYz4VcCVkTLYPdn5qIy\nSUiKuz1Xj7ExHkA7U8nrWHG6wmOPG312MIQDVqI/4qSxCHnXZJIjTB9Vl9jbl4Bw\nDEtML359ZErqeWt7iaPmrHVV3xJ9SVcLFzqI0MxcUxzAjbPJ5TX/MWVyGWdkxMq\n5HmJ+7z3CkQKBgQDEopFC7QBGzUri39oN1OYGKdzj8oufKuXZz0S6Z2RCF/eR1U+\nsBQZGHzeuQ+cBkKQTsKOXgP4cAWuK5A7mKB3IZ4kpvLZ5PvJ2NSnPbGKz9JZQsSD\nJsqqsEFm+xP5ARM5ZZuXcLAKGpIZZELFJg7MemUcG5+yr7xmz6jIQmHSGQKBgCNk\nQsb5/cc92TYdEOBWfWA9liKKKu8rCHDcd8kSGLw29Fq6YXyZh9KXeBVNvR3OU2bf\nqy/bJVmNJbEhKCMQSZ9Kmj7WxKQU+L8YsUGnP2cVDCaZrYPVQeqGCiM1Vw6yhGLf\n8DoqbVnpCY2nBLRfx/7180O8+lXqRRzAMYwl1MAxAoGAV96CXcBWvYmLbkxWnxDy\nwzKz2UGpBSs5amC4A3nJGGlwR1S/qWdPRvtfQRrtvxwmcCpXqEebZ1hupZVah5Ox\nrb3RK/6XC0066X4PzdZ2CKnlXzDxKnL+IJLnLkmYG3rvSc4r/gqQWwSs3SUDRrXs\nZJbjYdEQldNjPHONOJSQYYECgYEAmlpLuetK+1pAR13YQk/LIkVL/O4wzYU5MrxL\nYQNKTqoGVBR3nz/zEEPr3QdZ5P8XLzmXaSLKLBBmxMjQvOqVqL5XR5HpUVCLjlMS\n7FChf0dOXyj0WIEgMfr8U7n0reynZlyf4ue7SAxNhxzRYwwHJGQYHXLM0VwSQhiN\nnFeAyhk=\n-----END PRIVATE KEY-----\n"
      }
    };
    
    // Simulate network delay for realistic UX
    setTimeout(() => {
      res.json({
        success: true,
        application: simulatedApplication,
        mode: 'simulation'
      });
    }, 800);
    
    /* 
    // Disabled real API call for browser demo
    // Base URL for webhooks (based on request or environment variable)
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    
    // Create webhook URLs
    const answerUrl = `${baseUrl}/api/vonage/answer`;
    const eventUrl = `${baseUrl}/api/vonage/event`;
    
    // Create the application
    const application = await vonageService.createVoiceApplication(name, answerUrl, eventUrl);
    
    res.json({
      success: true,
      application
    });
    */
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
    
    // Force simulation mode for browser demo if using a demo app ID
    if (applicationId.startsWith('demo-')) {
      console.log('Starting simulated call for browser demo');
      
      // Create a simulated call response
      const simulatedCall = {
        uuid: `call-${Date.now()}`,
        status: 'started',
        direction: 'outbound',
        conversation_uuid: `conv-${Date.now()}`
      };
      
      // Simulate network delay
      setTimeout(() => {
        res.json({
          success: true,
          call: simulatedCall,
          mode: 'simulation'
        });
      }, 800);
      return;
    }
    
    // Start the real call (this code path is not used in browser demo)
    const call = await vonageService.startCall(to, from, record, applicationId, privateKey);
    
    res.json({
      success: true,
      call
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
    
    // Get call information
    const callInfo = await vonageService.getCallInfo(uuid, applicationId, privateKey);
    
    res.json({
      success: true,
      call: callInfo
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
    
    // Get recordings list
    const recordings = await vonageService.getRecordings(applicationId, privateKey);
    
    res.json({
      success: true,
      recordings
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
    
    // In a production app, you would:
    // 1. Download the recording from the URL in req.body.recording_url
    // 2. Store it in your database/storage
    // 3. Process it as needed
    
    // For demo purposes, we'll just log it
    const recordingUrl = req.body.recording_url;
    const recordingUuid = req.body.recording_uuid;
    
    if (recordingUrl && recordingUuid) {
      // Create a recordings directory if it doesn't exist
      const recordingsDir = path.join(__dirname, '../../recordings');
      if (!fs.existsSync(recordingsDir)) {
        fs.mkdirSync(recordingsDir, { recursive: true });
      }
      
      console.log(`Recording available at ${recordingUrl} with UUID ${recordingUuid}`);
      
      // In a real implementation, you would download the recording here
      // const response = await axios.get(recordingUrl, { responseType: 'arraybuffer' });
      // fs.writeFileSync(path.join(recordingsDir, `${recordingUuid}.mp3`), Buffer.from(response.data));
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
