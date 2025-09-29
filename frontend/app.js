/**
 * Kimi-K2 Coding Copilot Frontend Application
 * 
 * A modern chat interface for interacting with the Kimi-K2 language model
 * through a backend API that connects to Ollama.
 * 
 * @version 1.0.0
 * @author Kimi-K2 Chatbot Team
 */

/**
 * Main ChatApp class that manages the entire chat application
 */
class ChatApp {
    /**
     * Initialize the chat application
     */
    constructor() {
        this.messages = [];
        this.isLoading = false;
        this.apiUrl = 'http://localhost:3001/api/chat';
        this.healthUrl = 'http://localhost:3001/health';
        this.maxRetries = 3;
        this.retryDelay = 1000;
        
        this.initializeElements();
        this.bindEvents();
        this.checkBackendStatus();
        this.initializeTemplates();
    }
    
    /**
     * Cache DOM elements for better performance
     */
    initializeElements() {
        this.chatContainer = document.getElementById('chat-container');
        this.messageInput = document.getElementById('message-input');
        this.sendButton = document.getElementById('send-button');
        this.loadingContainer = document.getElementById('loading-container');
        this.charCount = document.getElementById('char-count');
        this.welcomeMessage = document.getElementById('welcome-message');
        this.statusIndicator = document.getElementById('status-indicator');
        this.errorModal = document.getElementById('error-modal');
        this.templatesContent = document.getElementById('templates-content');
        this.toggleIcon = document.getElementById('toggle-icon');
    }
    
    /**
     * Bind event listeners to DOM elements
     */
    bindEvents() {
        // Send button click handler
        this.sendButton.addEventListener('click', () => this.sendMessage());
        
        // Keyboard shortcuts for sending messages
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.sendMessage();
            } else if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // Input validation and character counting
        this.messageInput.addEventListener('input', () => {
            this.updateCharCount();
            this.validateInput();
            this.autoResize();
        });
        
        // Template button handlers
        document.querySelectorAll('.template-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const template = btn.dataset.template;
                this.useTemplate(template);
            });
        });
    }
    
    /**
     * Initialize prompt templates for quick access
     */
    initializeTemplates() {
        this.templates = {
            'generate-function': {
                prompt: "Generate a JavaScript function that",
                placeholder: "describes what the function should do"
            },
            'debug-code': {
                prompt: "Please help me debug this code and fix any issues:\n\n```\n",
                placeholder: "paste your code here"
            },
            'explain-code': {
                prompt: "Please explain what this code does and how it works:\n\n```\n",
                placeholder: "paste your code here"
            },
            'optimize-code': {
                prompt: "Please optimize this code for better performance and readability:\n\n```\n",
                placeholder: "paste your code here"
            },
            'write-tests': {
                prompt: "Write comprehensive unit tests for this code:\n\n```\n",
                placeholder: "paste your code here"
            },
            'refactor-code': {
                prompt: "Please refactor this code to improve its structure and maintainability:\n\n```\n",
                placeholder: "paste your code here"
            }
        };
    }
    
    /**
     * Update character count display with color coding
     */
    updateCharCount() {
        const count = this.messageInput.value.length;
        this.charCount.textContent = count;
        
        if (count > 3500) {
            this.charCount.style.color = '#e74c3c';
        } else if (count > 3000) {
            this.charCount.style.color = '#f39c12';
        } else {
            this.charCount.style.color = '#6c757d';
        }
    }
    
    /**
     * Validate input and update send button state
     */
    validateInput() {
        const message = this.messageInput.value.trim();
        const isValid = message.length > 0 && message.length <= 4000 && !this.isLoading;
        
        this.sendButton.disabled = !isValid;
        this.sendButton.style.opacity = isValid ? '1' : '0.6';
    }
    
    /**
     * Auto-resize textarea based on content
     */
    autoResize() {
        this.messageInput.style.height = 'auto';
        this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 120) + 'px';
    }
    
    /**
     * Check backend server health and update status indicator
     */
    async checkBackendStatus() {
        try {
            const response = await fetch(this.healthUrl);
            if (response.ok) {
                const data = await response.json();
                if (data.ollama_status === 'connected') {
                    this.updateStatus('Ready', 'success');
                } else {
                    this.updateStatus('Ollama Offline', 'warning');
                }
            } else {
                this.updateStatus('Backend Error', 'error');
            }
        } catch (error) {
            this.updateStatus('Backend Offline', 'error');
        }
    }
    
    /**
     * Update status indicator display
     * @param {string} text - Status text to display
     * @param {string} type - Status type: success, warning, or error
     */
    updateStatus(text, type) {
        const statusText = this.statusIndicator.querySelector('.status-text');
        const statusDot = this.statusIndicator.querySelector('.status-dot');
        
        statusText.textContent = text;
        
        // Update status dot color based on type
        statusDot.className = 'status-dot';
        switch (type) {
            case 'error':
                statusDot.style.background = '#e74c3c';
                break;
            case 'warning':
                statusDot.style.background = '#f39c12';
                break;
            default:
                statusDot.style.background = '#27ae60';
        }
    }
    
    /**
     * Apply a prompt template to the input field
     * @param {string} templateKey - Key of the template to use
     */
    useTemplate(templateKey) {
        const template = this.templates[templateKey];
        if (!template) return;
        
        this.messageInput.value = template.prompt;
        this.messageInput.focus();
        
        // Position cursor for user input
        if (template.prompt.includes('```')) {
            const cursorPosition = template.prompt.indexOf('```') + 3;
            this.messageInput.setSelectionRange(cursorPosition, cursorPosition);
        } else {
            this.messageInput.setSelectionRange(template.prompt.length, template.prompt.length);
        }
        
        this.updateCharCount();
        this.validateInput();
        this.autoResize();
        
        // Collapse templates after selection
        this.toggleTemplates(false);
    }
    
    /**
     * Send a message to the chat API
     */
    async sendMessage() {
        const messageText = this.messageInput.value.trim();
        if (!messageText || this.isLoading) return;
        
        // Hide welcome message on first interaction
        if (this.welcomeMessage) {
            this.welcomeMessage.style.display = 'none';
        }
        
        // Add user message to chat history
        this.addMessage('user', messageText);
        
        // Clear and reset input field
        this.messageInput.value = '';
        this.updateCharCount();
        this.validateInput();
        this.autoResize();
        
        // Show loading state
        this.setLoading(true);
        
        try {
            // Prepare message history for API
            const messages = this.messages.map(msg => ({
                role: msg.role,
                content: msg.content
            }));
            
            const response = await this.callChatAPI(messages);
            
            if (response.reply) {
                this.addMessage('assistant', response.reply, response.usage);
            } else {
                throw new Error('Empty response from server');
            }
            
        } catch (error) {
            console.error('Chat error:', error);
            this.showError('Failed to get response', error.message);
            this.updateStatus('Error', 'error');
        } finally {
            this.setLoading(false);
        }
    }
    
    /**
     * Make API call to chat endpoint with retry logic
     * @param {Array} messages - Array of message objects
     * @param {number} retryCount - Current retry attempt
     * @returns {Promise<Object>} API response data
     */
    async callChatAPI(messages, retryCount = 0) {
        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ messages }),
                signal: AbortSignal.timeout(60000) // 60 second timeout
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            this.updateStatus('Ready', 'success');
            return data;
            
        } catch (error) {
            // Retry logic for network-related errors
            if (retryCount < this.maxRetries && (
                error.name === 'AbortError' || 
                error.message.includes('fetch') ||
                error.message.includes('network')
            )) {
                console.log(`Retrying API call (${retryCount + 1}/${this.maxRetries})...`);
                await this.delay(this.retryDelay * (retryCount + 1));
                return this.callChatAPI(messages, retryCount + 1);
            }
            throw error;
        }
    }
    
    /**
     * Utility function to add delay for retry logic
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise} Resolved promise after delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    addMessage(role, content, usage = null) {
        const message = {
            id: Date.now(),
            role,
            content,
            timestamp: new Date(),
            usage
        };
        
        this.messages.push(message);
        this.renderMessage(message);
        this.scrollToBottom();
    }
    
    renderMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.role}`;
        messageElement.setAttribute('data-message-id', message.id);
        
        const avatar = message.role === 'user' ? '👤' : '🤖';
        const sender = message.role === 'user' ? 'You' : 'Kimi-K2';
        const timestamp = this.formatTime(message.timestamp);
        
        let usageInfo = '';
        if (message.usage) {
            usageInfo = `
                <div class="message-usage">
                    <small>
                        Tokens: ${message.usage.total_tokens || 0} 
                        (${message.usage.prompt_tokens || 0}+${message.usage.completion_tokens || 0})
                        • Response time: ${message.usage.response_time_ms || 0}ms
                    </small>
                </div>
            `;
        }
        
        messageElement.innerHTML = `
            <div class="message-header">
                <div class="message-avatar">${avatar}</div>
                <div class="message-sender">${sender}</div>
                <div class="message-timestamp">${timestamp}</div>
            </div>
            <div class="message-content">
                ${this.formatContent(message.content)}
            </div>
            ${usageInfo}
        `;
        
        this.chatContainer.appendChild(messageElement);
        
        // Trigger syntax highlighting for code blocks
        if (window.Prism) {
            Prism.highlightAllUnder(messageElement);
        }
    }
    
    formatContent(content) {
        // Convert markdown-style code blocks to HTML
        content = content.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
            const lang = language || 'javascript';
            return `<pre><code class="language-${lang}">${this.escapeHtml(code.trim())}</code></pre>`;
        });
        
        // Convert inline code
        content = content.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Convert line breaks
        content = content.replace(/\n/g, '<br>');
        
        // Convert URLs to links
        content = content.replace(
            /(https?:\/\/[^\s]+)/g, 
            '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
        );
        
        return content;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    formatTime(date) {
        return date.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }
    
    setLoading(loading) {
        this.isLoading = loading;
        this.loadingContainer.style.display = loading ? 'block' : 'none';
        this.validateInput();
        
        if (loading) {
            this.updateStatus('Thinking...', 'warning');
            this.scrollToBottom();
        }
    }
    
    scrollToBottom() {
        requestAnimationFrame(() => {
            this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
        });
    }
    
    showError(title, details) {
        const errorMessage = document.getElementById('error-message');
        const errorDetails = document.getElementById('error-details-content');
        
        errorMessage.textContent = title;
        errorDetails.textContent = details;
        
        this.errorModal.style.display = 'flex';
    }
    
    clearChat() {
        this.messages = [];
        this.chatContainer.innerHTML = '';
        if (this.welcomeMessage) {
            this.welcomeMessage.style.display = 'flex';
            this.chatContainer.appendChild(this.welcomeMessage);
        }
    }
}

/**
 * Template toggle functionality
 * @param {boolean|null} forceState - Force expand (true) or collapse (false), or toggle if null
 */
function toggleTemplates(forceState = null) {
    const content = document.getElementById('templates-content');
    const icon = document.getElementById('toggle-icon');
    
    if (forceState !== null) {
        if (forceState) {
            content.classList.add('expanded');
            icon.classList.add('rotated');
        } else {
            content.classList.remove('expanded');
            icon.classList.remove('rotated');
        }
    } else {
        content.classList.toggle('expanded');
        icon.classList.toggle('rotated');
    }
}

/**
 * Close the error modal
 */
function closeErrorModal() {
    document.getElementById('error-modal').style.display = 'none';
}

/**
 * Global keyboard shortcuts
 */
document.addEventListener('keydown', (e) => {
    // Escape to close error modal
    if (e.key === 'Escape') {
        closeErrorModal();
    }
    
    // Ctrl/Cmd + K to focus input
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('message-input').focus();
    }
    
    // Ctrl/Cmd + L to clear chat
    if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        if (confirm('Clear chat history?')) {
            window.chatApp.clearChat();
        }
    }
});

/**
 * Click outside modal to close
 */
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        closeErrorModal();
    }
});

/**
 * Initialize the application when DOM is ready
 */
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the chat application
    window.chatApp = new ChatApp();
    
    // Set initial template state
    toggleTemplates(true);
    
    // Focus input field
    document.getElementById('message-input').focus();
    
    console.log('Kimi-K2 Chatbot initialized successfully');
});

/**
 * Optional: Service worker registration for offline functionality
 * Currently commented out but can be enabled for PWA features
 */
/*
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('Service Worker registered:', registration);
            })
            .catch(registrationError => {
                console.log('Service Worker registration failed:', registrationError);
            });
    });
}
*/

// Error modal functions
function closeErrorModal() {
    document.getElementById('error-modal').style.display = 'none';
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Escape to close error modal
    if (e.key === 'Escape') {
        closeErrorModal();
    }
    
    // Ctrl/Cmd + K to focus input
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('message-input').focus();
    }
    
    // Ctrl/Cmd + L to clear chat
    if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        if (confirm('Clear chat history?')) {
            window.chatApp.clearChat();
        }
    }
});

// Click outside modal to close
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        closeErrorModal();
    }
});

// Copy code functionality (enhanced with Prism.js)
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the chat app
    window.chatApp = new ChatApp();
    
    // Initialize templates as collapsed
    toggleTemplates(true);
    
    // Focus input on load
    document.getElementById('message-input').focus();
    
    console.log('Kimi-K2 Chatbot initialized successfully!');
});

// Service worker for offline functionality (optional future enhancement)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('SW registered: ', registration);
            })
            .catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}