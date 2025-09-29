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
        this.apiUrl = null;
        this.healthUrl = null;
        this.maxRetries = 3;
        this.retryDelay = 1000;
        
        this.initializeElements();
        this.bindEvents();
        this.initializeServerConfig();
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
    }
    
    /**
     * Initialize server configuration by detecting the backend port
     */
    async initializeServerConfig() {
        // Try to detect the server configuration
        const possiblePorts = [3000, 3001, 3002, 3003, 3004, 3005];
        
        for (const port of possiblePorts) {
            try {
                const configUrl = `http://localhost:${port}/config`;
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);
                
                const response = await fetch(configUrl, { 
                    signal: controller.signal,
                    method: 'GET'
                });
                
                clearTimeout(timeoutId);
                
                if (response.ok) {
                    const config = await response.json();
                    this.apiUrl = config.apiUrl;
                    this.healthUrl = config.healthUrl;
                    console.log(`Connected to backend on port ${config.port}`);
                    
                    // Update status and check backend health
                    this.checkBackendStatus();
                    return;
                }
            } catch (error) {
                // Continue trying other ports
                console.log(`Failed to connect to port ${port}:`, error.message);
                continue;
            }
        }
        
        // Fallback: use default URLs and show warning
        console.warn('Could not detect backend server. Using default configuration.');
        this.apiUrl = 'http://localhost:3000/api/chat';
        this.healthUrl = 'http://localhost:3000/health';
        this.updateStatus('Backend Not Found', 'error');
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
        // Store code blocks to protect them from other processing
        const codeBlocks = [];
        content = content.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
            const lang = language || 'javascript';
            const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
            codeBlocks.push(`<pre><code class="language-${lang}">${this.escapeHtml(code.trim())}</code></pre>`);
            return placeholder;
        });
        
        // Store inline code to protect it
        const inlineCodes = [];
        content = content.replace(/`([^`]+)`/g, (match, code) => {
            const placeholder = `__INLINE_CODE_${inlineCodes.length}__`;
            inlineCodes.push(`<code>${this.escapeHtml(code)}</code>`);
            return placeholder;
        });
        
        // Process tables
        content = this.formatTables(content);
        
        // Process headers (h1-h6)
        content = content.replace(/^(#{1,6})\s+(.+)$/gm, (match, hashes, text) => {
            const level = hashes.length;
            return `<h${level}>${text.trim()}</h${level}>`;
        });
        
        // Process unordered lists
        content = this.formatLists(content);
        
        // Process blockquotes
        content = content.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');
        
        // Process horizontal rules
        content = content.replace(/^[-*_]{3,}$/gm, '<hr>');
        
        // Process bold and italic text
        content = content.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        content = content.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        content = content.replace(/\*(.+?)\*/g, '<em>$1</em>');
        
        // Process strikethrough
        content = content.replace(/~~(.+?)~~/g, '<del>$1</del>');
        
        // Convert URLs to links
        content = content.replace(
            /(https?:\/\/[^\s]+)/g, 
            '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
        );
        
        // Process paragraphs and line breaks
        content = this.formatParagraphs(content);
        
        // Restore code blocks
        codeBlocks.forEach((block, index) => {
            content = content.replace(`__CODE_BLOCK_${index}__`, block);
        });
        
        // Restore inline codes
        inlineCodes.forEach((code, index) => {
            content = content.replace(`__INLINE_CODE_${index}__`, code);
        });
        
        return content;
    }
    
    formatTables(content) {
        const lines = content.split('\n');
        const result = [];
        let inTable = false;
        let tableRows = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Check if this line looks like a table row
            if (line.includes('|') && line.split('|').length > 2) {
                if (!inTable) {
                    inTable = true;
                    tableRows = [];
                }
                tableRows.push(line);
            } else {
                // If we were in a table, process it
                if (inTable) {
                    result.push(this.processTable(tableRows));
                    tableRows = [];
                    inTable = false;
                }
                result.push(line);
            }
        }
        
        // Handle table at end of content
        if (inTable && tableRows.length > 0) {
            result.push(this.processTable(tableRows));
        }
        
        return result.join('\n');
    }
    
    processTable(rows) {
        if (rows.length < 2) return rows.join('\n');
        
        let table = '<table class="markdown-table">';
        
        // Process header row
        const headerCells = rows[0].split('|').map(cell => cell.trim()).filter(cell => cell);
        table += '<thead><tr>';
        headerCells.forEach(cell => {
            table += `<th>${cell}</th>`;
        });
        table += '</tr></thead>';
        
        // Skip separator row (usually contains dashes)
        const dataRows = rows.slice(2);
        
        if (dataRows.length > 0) {
            table += '<tbody>';
            dataRows.forEach(row => {
                const cells = row.split('|').map(cell => cell.trim()).filter(cell => cell);
                table += '<tr>';
                cells.forEach(cell => {
                    table += `<td>${cell}</td>`;
                });
                table += '</tr>';
            });
            table += '</tbody>';
        }
        
        table += '</table>';
        return table;
    }
    
    formatLists(content) {
        const lines = content.split('\n');
        const result = [];
        let inList = false;
        let listItems = [];
        let listType = null; // 'ul' or 'ol'
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            
            // Check for unordered list items
            if (trimmed.match(/^[-*+]\s+(.+)/)) {
                if (!inList || listType !== 'ul') {
                    if (inList) {
                        result.push(this.processListItems(listItems, listType));
                    }
                    inList = true;
                    listType = 'ul';
                    listItems = [];
                }
                const content = trimmed.replace(/^[-*+]\s+/, '');
                listItems.push(content);
            }
            // Check for ordered list items
            else if (trimmed.match(/^\d+\.\s+(.+)/)) {
                if (!inList || listType !== 'ol') {
                    if (inList) {
                        result.push(this.processListItems(listItems, listType));
                    }
                    inList = true;
                    listType = 'ol';
                    listItems = [];
                }
                const content = trimmed.replace(/^\d+\.\s+/, '');
                listItems.push(content);
            }
            else {
                if (inList) {
                    result.push(this.processListItems(listItems, listType));
                    inList = false;
                    listItems = [];
                    listType = null;
                }
                result.push(line);
            }
        }
        
        // Handle list at end of content
        if (inList && listItems.length > 0) {
            result.push(this.processListItems(listItems, listType));
        }
        
        return result.join('\n');
    }
    
    processListItems(items, type) {
        const tag = type === 'ol' ? 'ol' : 'ul';
        let list = `<${tag} class="markdown-list">`;
        items.forEach(item => {
            list += `<li>${item}</li>`;
        });
        list += `</${tag}>`;
        return list;
    }
    
    formatParagraphs(content) {
        // Split content into paragraphs (double line breaks)
        const paragraphs = content.split(/\n\s*\n/);
        
        return paragraphs.map(para => {
            const trimmed = para.trim();
            if (!trimmed) return '';
            
            // Don't wrap if it's already a block element
            if (trimmed.match(/^<(h[1-6]|table|ul|ol|blockquote|pre|hr)/)) {
                return trimmed;
            }
            
            // Replace single line breaks with <br> within paragraphs
            const withBreaks = trimmed.replace(/\n/g, '<br>');
            return `<p>${withBreaks}</p>`;
        }).filter(p => p).join('\n\n');
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
    
    // Focus input on load
    document.getElementById('message-input').focus();
    
    console.log('Kimi-K2 Chatbot initialized successfully!');
});

// Service worker for offline functionality (optional future enhancement)
// Disabled for now to avoid 404 errors
/*
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
*/