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

## Prerequisites

- **Node.js**: Version 16 or higher
- **Ollama**: Installed and running locally
- **Kimi-K2 Model**: Available in Ollama

## Installation

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Install and Setup Ollama
```bash
# Install Ollama (if not already installed)
curl -fsSL https://ollama.ai/install.sh | sh

# Start Ollama service
ollama serve

# Pull the Kimi-K2 model
ollama pull kimi-k2:1t-cloud
```

### 3. Start the Application
```bash
# Start backend server
cd backend
npm start

# Open frontend in browser
# Open frontend/index.html in your web browser
# Or serve via a local web server for best experience
```

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

**Port already in use**: The application automatically finds available ports starting from 3000.

**Ollama not accessible**: Ensure Ollama is running with `ollama serve` and the model is pulled.

**Model not found**: Install the required model with `ollama pull kimi-k2:1t-cloud`.

### Debugging
- Check browser console for frontend errors
- Monitor backend logs for API issues
- Verify Ollama status with `ollama list`

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