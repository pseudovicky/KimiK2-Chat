/**
 * Kimi-K2 Coding Copilot Backend Server
 * 
 * A Node.js Express server that acts as a proxy between the frontend
 * and Ollama API for the Kimi-K2 language model.
 * 
 * @version 1.0.0
 * @author Kimi-K2 Chatbot Team
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const axios = require('axios');

const app = express();

// Configuration
const PORT = parseInt(process.env.PORT) || 3000;
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const MODEL_NAME = process.env.MODEL_NAME || 'kimi-k2:1t-cloud';

/**
 * Global error handlers for uncaught exceptions and unhandled rejections
 */
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

/**
 * Middleware Configuration
 */
app.use(helmet({
  contentSecurityPolicy: false // Allow inline scripts for development
}));

app.use(cors({
  origin: [
    'http://localhost:3000', 
    'http://localhost:3001', 
    'http://localhost:8080', 
    'http://127.0.0.1:5500'
  ],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));

/**
 * Request logging middleware
 * Logs all incoming requests with timestamp and method
 */
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

/**
 * Health Check Endpoint
 * Returns server status and Ollama connectivity information
 * 
 * @route GET /health
 * @returns {Object} Server health status and Ollama connectivity
 */
app.get('/health', async (req, res) => {
  try {
    // Check if Ollama is accessible
    const ollamaResponse = await axios.get(`${OLLAMA_HOST}/api/version`, { 
      timeout: 5000 
    });
    
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      model: MODEL_NAME,
      ollama_status: 'connected',
      ollama_version: ollamaResponse.data.version || 'unknown'
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'degraded', 
      timestamp: new Date().toISOString(),
      model: MODEL_NAME,
      ollama_status: 'disconnected',
      error: 'Ollama service not accessible'
    });
  }
});

/**
 * Chat API Endpoint
 * Processes chat messages and forwards them to Ollama API
 * 
 * @route POST /api/chat
 * @param {Object} req.body - Request body containing messages array
 * @param {Array} req.body.messages - Array of message objects with role and content
 * @returns {Object} Response containing AI reply and usage statistics
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    
    // Validate request body structure
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: 'Invalid request: messages array is required'
      });
    }

    // Validate individual message format
    for (const message of messages) {
      if (!message.role || !message.content) {
        return res.status(400).json({
          error: 'Invalid message format: role and content are required'
        });
      }
      
      if (!['user', 'assistant', 'system'].includes(message.role)) {
        return res.status(400).json({
          error: 'Invalid role: must be user, assistant, or system'
        });
      }
    }

    console.log(`Sending request to Ollama for model: ${MODEL_NAME}`);
    console.log(`Messages count: ${messages.length}`);

    // Prepare request payload for Ollama API
    const ollamaRequest = {
      model: MODEL_NAME,
      messages: messages,
      stream: false,
      options: {
        temperature: 0.6, // Balanced creativity vs consistency
        num_predict: 2048 // Response length limit
      }
    };

    // Make request to Ollama with timing
    const startTime = Date.now();
    const response = await axios.post(`${OLLAMA_HOST}/api/chat`, ollamaRequest, {
      timeout: 30000, // 30 second timeout
      headers: {
        'Content-Type': 'application/json'
      }
    });
    const endTime = Date.now();
    const responseTime = endTime - startTime;

    console.log(`Ollama response received in ${responseTime}ms`);

    // Extract and validate response
    const assistantMessage = response.data.message;
    if (!assistantMessage || !assistantMessage.content) {
      throw new Error('Invalid response from Ollama: missing message content');
    }

    // Return formatted response according to API specification
    res.json({
      reply: assistantMessage.content,
      usage: {
        prompt_tokens: response.data.prompt_eval_count || 0,
        completion_tokens: response.data.eval_count || 0,
        total_tokens: (response.data.prompt_eval_count || 0) + (response.data.eval_count || 0),
        response_time_ms: responseTime
      }
    });

  } catch (error) {
    console.error('Error in /api/chat:', error.message);
    
    // Handle specific error types with appropriate responses
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Ollama service is not available. Please ensure Ollama is running.',
        details: 'Connection refused to Ollama server'
      });
    }
    
    if (error.code === 'ENOTFOUND') {
      return res.status(503).json({
        error: 'Cannot reach Ollama server. Please check your configuration.',
        details: 'Hostname not found'
      });
    }
    
    if (error.response && error.response.status === 404) {
      return res.status(404).json({
        error: `Model "${MODEL_NAME}" not found. Please pull the model first with: ollama pull ${MODEL_NAME}`,
        details: 'Model not available in Ollama'
      });
    }
    
    if (error.code === 'ETIMEDOUT') {
      return res.status(408).json({
        error: 'Request timeout. The model took too long to respond.',
        details: 'Request timed out after 30 seconds'
      });
    }
    
    // Generic error response for unhandled cases
    res.status(500).json({
      error: 'Internal server error occurred while processing your request.',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
    });
  }
});

/**
 * Global error handling middleware
 * Catches any unhandled errors in the application
 */
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'An unexpected error occurred',
    details: process.env.NODE_ENV === 'development' ? err.message : 'Please try again later'
  });
});

/**
 * 404 handler for undefined routes
 * Returns available endpoints for reference
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    available_endpoints: [
      'GET /health',
      'POST /api/chat'
    ]
  });
});

/**
 * Checks Ollama connectivity and model availability on startup
 * @returns {Promise<boolean>} True if Ollama is accessible, false otherwise
 */
async function checkOllamaConnection() {
  try {
    console.log('Checking Ollama connection...');
    const response = await axios.get(`${OLLAMA_HOST}/api/version`, { 
      timeout: 10000 
    });
    console.log(`Ollama is accessible (version: ${response.data.version || 'unknown'})`);
    
    // Check if the specified model is available
    try {
      const modelsResponse = await axios.get(`${OLLAMA_HOST}/api/tags`, { 
        timeout: 10000 
      });
      const availableModels = modelsResponse.data.models || [];
      const modelExists = availableModels.some(model => model.name === MODEL_NAME);
      
      if (modelExists) {
        console.log(`Model "${MODEL_NAME}" is available`);
      } else {
        console.log(`Warning: Model "${MODEL_NAME}" not found`);
        console.log('Available models:', 
          availableModels.map(m => m.name).join(', ') || 'none');
        console.log(`To install the model, run: ollama pull ${MODEL_NAME}`);
      }
    } catch (modelError) {
      console.log('Warning: Could not check available models');
    }
    
    return true;
  } catch (error) {
    console.log('Ollama is not accessible. Please ensure Ollama is running.');
    console.log(`Expected Ollama at: ${OLLAMA_HOST}`);
    if (error.code === 'ECONNREFUSED') {
      console.log('To start Ollama, run: ollama serve');
    }
    return false;
  }
}

/**
 * Starts the server with automatic port fallback
 * If the specified port is in use, tries the next available port
 * 
 * @param {number} port - Initial port to try
 * @returns {Promise<Server>} Express server instance
 */
async function startServer(port) {
  // Check Ollama connection on startup
  await checkOllamaConnection();
  
  const server = app.listen(port, () => {
    console.log(`Kimi-K2 Chatbot Backend running on port ${port}`);
    console.log(`Ollama host: ${OLLAMA_HOST}`);
    console.log(`Model: ${MODEL_NAME}`);
    console.log(`Health check: http://localhost:${port}/health`);
    console.log(`Chat API: http://localhost:${port}/api/chat`);
    console.log('');
    console.log('To test the server:');
    console.log(`  curl http://localhost:${port}/health`);
    console.log('');
    console.log('Frontend should connect to: http://localhost:' + port);
    console.log('Press Ctrl+C to stop the server');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is already in use. Trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });

  return server;
}

/**
 * Initialize and start the server
 */
startServer(PORT).then(server => {
  // Store server reference for graceful shutdown
  process.server = server;
}).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

/**
 * Graceful shutdown handlers
 * Properly close the server on interrupt signals
 */
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  if (process.server) {
    process.server.close(() => {
      console.log('Server closed successfully');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  if (process.server) {
    process.server.close(() => {
      console.log('Server closed successfully');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});