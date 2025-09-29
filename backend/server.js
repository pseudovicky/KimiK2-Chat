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
const { spawn } = require('child_process');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

const app = express();

// Configuration
const PORT = parseInt(process.env.PORT) || 3000;
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const MODEL_NAME = process.env.MODEL_NAME || 'kimi-k2:1t-cloud';
const AUTO_START_OLLAMA = process.env.AUTO_START_OLLAMA !== 'false'; // Default to true
const MAX_OLLAMA_WAIT_TIME = 30000; // 30 seconds

// Global variables for Ollama process management
let ollamaProcess = null;

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
 * Serve static files from the frontend directory
 */
const path = require('path');
app.use(express.static(path.join(__dirname, '../frontend')));

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
 * Server Configuration Endpoint
 * Returns the current server configuration for frontend
 * 
 * @route GET /config
 * @returns {Object} Server configuration including ports and URLs
 */
app.get('/config', (req, res) => {
  const port = process.server ? process.server.address().port : PORT;
  res.json({
    port: port,
    baseUrl: `http://localhost:${port}`,
    apiUrl: `http://localhost:${port}/api/chat`,
    healthUrl: `http://localhost:${port}/health`,
    timestamp: new Date().toISOString()
  });
});

/**
 * Serve the main frontend application
 * @route GET /
 * @returns {HTML} The main index.html file
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
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
      'GET /',
      'GET /health',
      'GET /config',
      'POST /api/chat'
    ]
  });
});

/**
 * Start Ollama service if not running
 * @returns {Promise<boolean>} True if Ollama is available, false otherwise
 */
async function startOllamaIfNeeded() {
    try {
        // First check if Ollama is already running
        const response = await axios.get(`${OLLAMA_HOST}/api/version`, { timeout: 5000 });
        console.log(`Ollama service is already running (version: ${response.data.version || 'unknown'})`);
        return true;
    } catch (error) {
        if (!AUTO_START_OLLAMA) {
            console.log('Ollama is not running and auto-start is disabled');
            console.log('To start Ollama manually, run: ollama serve');
            return false;
        }

        console.log('Ollama service not detected, attempting to start...');
        
        try {
            // Try to start Ollama
            ollamaProcess = spawn('ollama', ['serve'], {
                detached: false,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            // Handle process output
            ollamaProcess.stdout.on('data', (data) => {
                const output = data.toString().trim();
                if (output) console.log(`Ollama: ${output}`);
            });

            ollamaProcess.stderr.on('data', (data) => {
                const message = data.toString().trim();
                if (!message.includes('address already in use') && message) {
                    console.log(`Ollama: ${message}`);
                }
            });

            ollamaProcess.on('error', (error) => {
                console.error('Failed to start Ollama process:', error.message);
            });

            ollamaProcess.on('exit', (code, signal) => {
                if (code !== 0 && code !== null) {
                    console.log(`Ollama process exited with code ${code}`);
                }
            });

            // Wait for Ollama to be ready
            console.log('Waiting for Ollama service to be ready...');
            const startTime = Date.now();
            
            while (Date.now() - startTime < MAX_OLLAMA_WAIT_TIME) {
                try {
                    await sleep(2000);
                    const response = await axios.get(`${OLLAMA_HOST}/api/version`, { timeout: 3000 });
                    console.log(`Ollama service is now ready (version: ${response.data.version || 'unknown'})`);
                    return true;
                } catch (waitError) {
                    // Service not ready yet, continue waiting
                }
            }

            console.error('Ollama service did not become ready within the timeout period');
            return false;

        } catch (startError) {
            console.error('Failed to start Ollama:', startError.message);
            return false;
        }
    }
}

/**
 * Ensure the required model is available
 * @returns {Promise<boolean>} True if model is available, false otherwise
 */
async function ensureModelAvailable() {
    try {
        console.log(`Checking if model "${MODEL_NAME}" is available...`);
        
        const response = await axios.get(`${OLLAMA_HOST}/api/tags`, { timeout: 10000 });
        const models = response.data.models || [];
        
        const modelExists = models.some(model => model.name === MODEL_NAME);
        
        if (modelExists) {
            console.log(`Model "${MODEL_NAME}" is available`);
            return true;
        }

        console.log(`Model "${MODEL_NAME}" not found. Available models:`, 
            models.map(m => m.name).join(', ') || 'none');
        
        console.log(`Attempting to pull model "${MODEL_NAME}"...`);
        console.log('This may take several minutes depending on model size...');

        // Attempt to pull the model
        const pullResponse = await axios.post(`${OLLAMA_HOST}/api/pull`, {
            name: MODEL_NAME
        }, { 
            timeout: 300000, // 5 minutes timeout for model pulling
            responseType: 'stream'
        });

        return new Promise((resolve, reject) => {
            let lastProgress = '';
            
            pullResponse.data.on('data', (chunk) => {
                const lines = chunk.toString().split('\n').filter(line => line.trim());
                
                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);
                        if (data.status && data.status !== lastProgress) {
                            console.log(`Pull progress: ${data.status}`);
                            lastProgress = data.status;
                        }
                        
                        if (data.status === 'success') {
                            console.log(`Model "${MODEL_NAME}" pulled successfully`);
                            resolve(true);
                            return;
                        }
                        
                        if (data.error) {
                            console.error('Model pull error:', data.error);
                            resolve(false);
                            return;
                        }
                    } catch (parseError) {
                        // Ignore JSON parse errors for progress updates
                    }
                }
            });

            pullResponse.data.on('end', () => {
                console.log(`Model "${MODEL_NAME}" pull completed`);
                resolve(true);
            });

            pullResponse.data.on('error', (error) => {
                console.error('Error during model pull:', error.message);
                resolve(false);
            });
        });

    } catch (error) {
        console.error('Error checking/pulling model:', error.message);
        console.log(`To install the model manually, run: ollama pull ${MODEL_NAME}`);
        return false;
    }
}

/**
 * Initialize Ollama service and ensure model availability
 * @returns {Promise<boolean>} True if everything is ready, false otherwise
 */
async function initializeOllama() {
    console.log('Initializing Ollama service...');
    
    // Step 1: Start Ollama if needed
    const ollamaStarted = await startOllamaIfNeeded();
    if (!ollamaStarted) {
        console.log('Failed to start or connect to Ollama service');
        return false;
    }
    
    // Step 2: Ensure model is available
    const modelReady = await ensureModelAvailable();
    if (!modelReady) {
        console.log('Model is not available and could not be installed');
        return false;
    }
    
    console.log('Ollama initialization completed successfully');
    return true;
}

/**
 * Starts the server with automatic port fallback
 * If the specified port is in use, tries the next available port
 * 
 * @param {number} port - Initial port to try
 * @returns {Promise<Server>} Express server instance
 */
async function startServer(port) {
  // Initialize Ollama service and model
  console.log('Starting Kimi-K2 Chatbot Backend...');
  const ollamaReady = await initializeOllama();
  
  if (!ollamaReady) {
    console.log('Warning: Ollama is not ready. The server will start but chat functionality may not work.');
    console.log('You can manually start Ollama with: ollama serve');
    console.log(`Then pull the model with: ollama pull ${MODEL_NAME}`);
  }
  
  const server = app.listen(port, () => {
    // Write the actual port to a config file for frontend to read
    const fs = require('fs');
    const configPath = path.join(__dirname, '../frontend/server-config.json');
    const config = {
      port: port,
      baseUrl: `http://localhost:${port}`,
      apiUrl: `http://localhost:${port}/api/chat`,
      healthUrl: `http://localhost:${port}/health`,
      timestamp: new Date().toISOString()
    };
    
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log(`Server configuration written to: ${configPath}`);
    } catch (error) {
      console.warn('Failed to write server config file:', error.message);
    }
    
    console.log('');
    console.log('='.repeat(60));
    console.log(`  Kimi-K2 Chatbot Backend running on port ${port}`);
    console.log('='.repeat(60));
    console.log(`  Ollama host: ${OLLAMA_HOST}`);
    console.log(`  Model: ${MODEL_NAME}`);
    console.log(`  Auto-start Ollama: ${AUTO_START_OLLAMA ? 'enabled' : 'disabled'}`);
    console.log('');
    console.log('  API Endpoints:');
    console.log(`    Health check: http://localhost:${port}/health`);
    console.log(`    Chat API: http://localhost:${port}/api/chat`);
    console.log('');
    console.log('  Frontend should connect to: http://localhost:' + port);
    console.log('');
    console.log('  Press Ctrl+C to stop the server');
    console.log('='.repeat(60));
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is already in use. Trying port ${port + 1}...`);
      return startServer(port + 1);
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
 * Properly close the server and Ollama process on interrupt signals
 */
function gracefulShutdown(signal) {
  console.log(`${signal} received, shutting down gracefully...`);
  
  // Close the Express server
  if (process.server) {
    process.server.close(() => {
      console.log('Server closed successfully');
      
      // Close Ollama process if we started it
      if (ollamaProcess && !ollamaProcess.killed) {
        console.log('Stopping Ollama process...');
        ollamaProcess.kill('SIGTERM');
        
        // Give it 5 seconds to shut down gracefully
        setTimeout(() => {
          if (!ollamaProcess.killed) {
            console.log('Force killing Ollama process...');
            ollamaProcess.kill('SIGKILL');
          }
          process.exit(0);
        }, 5000);
      } else {
        process.exit(0);
      }
    });
  } else {
    // Close Ollama process if we started it
    if (ollamaProcess && !ollamaProcess.killed) {
      console.log('Stopping Ollama process...');
      ollamaProcess.kill('SIGTERM');
      
      setTimeout(() => {
        if (!ollamaProcess.killed) {
          console.log('Force killing Ollama process...');
          ollamaProcess.kill('SIGKILL');
        }
        process.exit(0);
      }, 5000);
    } else {
      process.exit(0);
    }
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));