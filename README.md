# Kimi-K2 Coding Copilot Chatbot

A professional web-based chatbot interface for the Kimi-K2 language model via Ollama, specifically designed for coding assistance and code generation.

## Overview

This application provides a clean, modern interface for interacting with the Kimi-K2 AI model through Ollama. Built with vanilla JavaScript and Node.js, it offers a lightweight yet powerful solution for AI-powered coding assistance.

## Features

### Core Functionality
- **AI-Powered Coding Assistant**: Leverages Kimi-K2 (1T-parameter MoE model) for intelligent code generation and debugging
- **Conversational Interface**: Multi-turn conversations with full context preservation
- **Syntax Highlighting**: Automatic code block detection and highlighting with copy functionality
- **Prompt Templates**: Six built-in templates for common coding tasks

### User Experience
- **Responsive Design**: Works seamlessly across desktop and mobile devices
- **Real-time Status**: Live backend and Ollama connectivity indicators
- **Error Handling**: Comprehensive error management with user-friendly messages
- **Accessibility**: WCAG compliant with proper ARIA labels and keyboard navigation

### Technical Features
- **Automatic Port Management**: Smart port fallback for seamless deployment
- **Retry Logic**: Robust network error handling with exponential backoff
- **Performance Optimized**: Minimal dependencies and efficient resource usage

## Architecture

```
┌─────────────────┐    HTTP/JSON    ┌─────────────────┐    REST API    ┌─────────────────┐
│                 │    Requests     │                 │   Requests     │                 │
│    Frontend     │◄───────────────►│     Backend     │◄──────────────►│     Ollama      │
│   (HTML/CSS/JS) │                 │  (Node.js/Express)               │   (Kimi-K2)     │
│                 │                 │                 │                │                 │
└─────────────────┘                 └─────────────────┘                └─────────────────┘
```

- **Frontend**: Modern HTML5, CSS3, and vanilla JavaScript
- **Backend**: Node.js with Express.js (API Gateway pattern)
- **AI Model**: Kimi-K2 served via Ollama REST API
- **Communication**: RESTful HTTP/JSON API

## 🚀 Quick Start

### Prerequisites
- **Node.js** (v18 or higher)
- **Ollama** installed on your system

### Installation & Setup

1. **Clone and Setup**
   ```bash
   cd backend
   npm install
   ```

2. **Automated Startup (Recommended)**
   ```bash
   # Full automated setup - starts Ollama, pulls model, starts server
   npm run start:full
   
   # For Windows users
   npm run start:win
   
   # Setup only (installs Ollama and model without starting server)
   npm run setup
   ```

3. **Manual Startup**
   ```bash
   # Start Ollama service
   ollama serve
   
   # Pull the required model (in another terminal)
   ollama pull kimi-k2:1t-cloud
   
   # Start the backend server
   npm start
   ```

4. **Open Frontend**
   Open `frontend/index.html` in your browser or use a local server:
   ```bash
   # Using Python
   cd frontend
   python -m http.server 8080
   
   # Using Node.js (if you have http-server)
   npx http-server frontend -p 8080
   ```

### Environment Configuration

Create a `.env` file in the backend directory for custom configuration:

```env
PORT=3000
OLLAMA_HOST=http://localhost:11434
MODEL_NAME=kimi-k2:1t-cloud
AUTO_START_OLLAMA=true
NODE_ENV=development
```

### Startup Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start server only (requires Ollama to be running) |
| `npm run start:full` | Full automated startup with Ollama management (Unix/Linux/macOS) |
| `npm run start:win` | Full automated startup for Windows |
| `npm run setup` | Install Ollama and pull model without starting server |
| `npm run dev` | Development mode with auto-restart |

## API Reference

### Health Check
```http
GET /health
```
Returns server status and Ollama connectivity information.

### Chat Endpoint
```http
POST /api/chat
Content-Type: application/json

{
  "messages": [
    {
      "role": "user",
      "content": "Generate a JavaScript function to sort an array"
    }
  ]
}
```

**Response:**
```json
{
  "reply": "Here's a JavaScript function to sort an array...",
  "usage": {
    "prompt_tokens": 15,
    "completion_tokens": 120,
    "total_tokens": 135,
    "response_time_ms": 1250
  }
}
```

## Configuration

The application can be configured using environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Backend server port |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama server URL |
| `MODEL_NAME` | `kimi-k2:1t-cloud` | AI model name |
| `NODE_ENV` | `development` | Environment mode |

## Development

### Code Quality
- **ESLint**: Linting rules for consistent code style
- **Documentation**: Comprehensive JSDoc comments throughout
- **Error Handling**: Robust error management at all levels
- **Accessibility**: WCAG 2.1 AA compliant

### Project Structure
```
kimi-k2-chatbot/
├── backend/
│   ├── server.js           # Main server file
│   ├── package.json        # Dependencies and scripts
│   └── .env.example        # Environment configuration template
├── frontend/
│   ├── index.html          # Main HTML file
│   ├── styles.css          # Application styles
│   └── app.js              # Frontend JavaScript
├── README.md               # Project documentation
└── .gitignore              # Git ignore rules
```

### Available Scripts
```bash
# Start development server
npm start

# Start with auto-restart
npm run dev
```

## Troubleshooting

### Common Issues

**Ollama not starting automatically:**
- Ensure Ollama is installed: `ollama --version`
- Check if Ollama is already running: `curl http://localhost:11434/api/version`
- Try manual startup: `ollama serve`

**Model download failing:**
- Check internet connection
- Verify model name: `ollama list`
- Try manual pull: `ollama pull kimi-k2:1t-cloud`

**Port conflicts:**
- The server automatically tries the next available port if 3000 is in use
- Check the console output for the actual port being used
- Update frontend configuration if needed

**Permission errors on Unix systems:**
- Make startup script executable: `chmod +x backend/start.sh`
- Run with proper permissions or use `npm run start:full`

**Frontend not connecting:**
- Check browser console for errors
- Ensure CORS is enabled (automatically configured)
- Verify the backend URL in browser network tab

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Backend server port |
| `OLLAMA_HOST` | http://localhost:11434 | Ollama service URL |
| `MODEL_NAME` | kimi-k2:1t-cloud | AI model to use |
| `AUTO_START_OLLAMA` | true | Automatically start Ollama if not running |
| `NODE_ENV` | development | Environment mode |

### Performance Tips

- **Model Loading**: First response may be slower while the model loads into memory
- **Memory Usage**: Large models require significant RAM (8GB+ recommended)
- **Response Time**: Typical response time is 2-10 seconds depending on query complexity
- **Concurrent Users**: Server supports multiple simultaneous connections

### Debugging
- **Backend Logs**: Check console for Ollama connection status, model availability, and request details
- **Frontend Debugging**: Open browser Developer Tools (F12) and check Console/Network tabs
- **Health Check**: Visit `http://localhost:3000/health` to verify server and Ollama status
- **Model Status**: Run `ollama list` to see available models

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- Check the troubleshooting section above
- Review the API documentation
- Open an issue on GitHub