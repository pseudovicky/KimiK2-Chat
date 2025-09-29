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
 * IndexedDB wrapper for chat history storage
 */
class ChatDatabase {
    constructor() {
        this.dbName = 'kimi-k2-chat-history';
        this.version = 1;
        this.db = null;
    }

    /**
     * Initialize the database
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create sessions store
                if (!db.objectStoreNames.contains('sessions')) {
                    const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
                    sessionStore.createIndex('lastActivity', 'lastActivity', { unique: false });
                    sessionStore.createIndex('title', 'title', { unique: false });
                }

                // Create messages store
                if (!db.objectStoreNames.contains('messages')) {
                    const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
                    messageStore.createIndex('sessionId', 'sessionId', { unique: false });
                    messageStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }

    /**
     * Get all sessions ordered by last activity
     */
    async getAllSessions() {
        const transaction = this.db.transaction(['sessions'], 'readonly');
        const store = transaction.objectStore('sessions');
        const index = store.index('lastActivity');
        
        return new Promise((resolve, reject) => {
            const request = index.getAll();
            request.onsuccess = () => {
                // Sort by lastActivity descending (most recent first)
                const sessions = request.result.sort((a, b) => 
                    new Date(b.lastActivity) - new Date(a.lastActivity)
                );
                resolve(sessions);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get a specific session by ID
     */
    async getSession(sessionId) {
        const transaction = this.db.transaction(['sessions'], 'readonly');
        const store = transaction.objectStore('sessions');
        
        return new Promise((resolve, reject) => {
            const request = store.get(sessionId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Save or update a session
     */
    async saveSession(session) {
        const transaction = this.db.transaction(['sessions'], 'readwrite');
        const store = transaction.objectStore('sessions');
        
        return new Promise((resolve, reject) => {
            const request = store.put(session);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete a session and all its messages
     */
    async deleteSession(sessionId) {
        const transaction = this.db.transaction(['sessions', 'messages'], 'readwrite');
        const sessionStore = transaction.objectStore('sessions');
        const messageStore = transaction.objectStore('messages');
        
        // Delete session
        sessionStore.delete(sessionId);
        
        // Delete all messages for this session
        const messageIndex = messageStore.index('sessionId');
        const deletePromises = [];
        
        return new Promise((resolve, reject) => {
            const request = messageIndex.getAll(sessionId);
            request.onsuccess = () => {
                const messages = request.result;
                messages.forEach(message => {
                    messageStore.delete(message.id);
                });
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get messages for a session
     */
    async getSessionMessages(sessionId) {
        const transaction = this.db.transaction(['messages'], 'readonly');
        const store = transaction.objectStore('messages');
        const index = store.index('sessionId');
        
        return new Promise((resolve, reject) => {
            const request = index.getAll(sessionId);
            request.onsuccess = () => {
                // Sort by timestamp ascending
                const messages = request.result.sort((a, b) => 
                    new Date(a.timestamp) - new Date(b.timestamp)
                );
                resolve(messages);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Save a message to a session
     */
    async saveMessage(sessionId, message) {
        const messageWithId = {
            ...message,
            id: `${sessionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            sessionId: sessionId
        };

        const transaction = this.db.transaction(['messages'], 'readwrite');
        const store = transaction.objectStore('messages');
        
        return new Promise((resolve, reject) => {
            const request = store.put(messageWithId);
            request.onsuccess = () => resolve(messageWithId);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get recent N messages from a session (for context window)
     */
    async getRecentMessages(sessionId, count = 10) {
        const messages = await this.getSessionMessages(sessionId);
        
        // Return last N messages, but ensure we have pairs (user + assistant)
        const recentMessages = messages.slice(-count * 2);
        return recentMessages;
    }

    /**
     * Prune old sessions if above limit
     */
    async pruneOldSessions(maxSessions = 50) {
        const sessions = await this.getAllSessions();
        
        if (sessions.length > maxSessions) {
            const sessionsToDelete = sessions.slice(maxSessions);
            const deletePromises = sessionsToDelete.map(session => 
                this.deleteSession(session.id)
            );
            await Promise.all(deletePromises);
        }
    }
}

/**
 * Chat History Manager
 */
class ChatHistory {
    constructor() {
        this.db = new ChatDatabase();
        this.currentSessionId = null;
        this.sessions = [];
        this.maxSessions = 50;
        this.contextWindowSize = 10; // Number of message pairs to include
        this.systemPrompt = "You are Kimi-K2, a helpful AI coding assistant. Provide clear, accurate, and helpful responses about programming, software development, and technical topics.";
    }

    /**
     * Initialize the history system
     */
    async init() {
        try {
            await this.db.init();
            await this.loadSessions();
            console.log('Chat history initialized successfully');
        } catch (error) {
            console.error('Failed to initialize chat history:', error);
        }
    }

    /**
     * Load all sessions from IndexedDB
     */
    async loadSessions() {
        try {
            this.sessions = await this.db.getAllSessions();
        } catch (error) {
            console.error('Failed to load sessions:', error);
            this.sessions = [];
        }
    }

    /**
     * Create a new session
     */
    async createSession(title = null) {
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const session = {
            id: sessionId,
            title: title || this.generateSessionTitle(),
            lastActivity: new Date().toISOString(),
            messageCount: 0,
            createdAt: new Date().toISOString()
        };

        try {
            await this.db.saveSession(session);
            this.sessions.unshift(session); // Add to beginning of array
            this.currentSessionId = sessionId;
            
            // Prune old sessions
            await this.db.pruneOldSessions(this.maxSessions);
            
            return session;
        } catch (error) {
            console.error('Failed to create session:', error);
            throw error;
        }
    }

    /**
     * Load a specific session
     */
    async loadSession(sessionId) {
        try {
            const session = await this.db.getSession(sessionId);
            if (!session) {
                throw new Error(`Session ${sessionId} not found`);
            }

            const messages = await this.db.getSessionMessages(sessionId);
            this.currentSessionId = sessionId;
            
            return { session, messages };
        } catch (error) {
            console.error('Failed to load session:', error);
            throw error;
        }
    }

    /**
     * Save a message to the current session
     */
    async saveMessage(role, content, usage = null) {
        if (!this.currentSessionId) {
            // Create a new session if none exists
            await this.createSession();
        }

        const message = {
            role,
            content,
            timestamp: new Date().toISOString(),
            usage
        };

        try {
            const savedMessage = await this.db.saveMessage(this.currentSessionId, message);
            
            // Update session activity and message count
            await this.updateSessionActivity(this.currentSessionId);
            
            return savedMessage;
        } catch (error) {
            console.error('Failed to save message:', error);
            throw error;
        }
    }

    /**
     * Get messages for Ollama request (system + recent context)
     */
    async getMessagesForRequest(sessionId = null) {
        const targetSessionId = sessionId || this.currentSessionId;
        if (!targetSessionId) {
            return [{ role: 'system', content: this.systemPrompt }];
        }

        try {
            const recentMessages = await this.db.getRecentMessages(targetSessionId, this.contextWindowSize);
            
            // Build request with system prompt + recent messages
            const messages = [
                { role: 'system', content: this.systemPrompt },
                ...recentMessages.map(msg => ({
                    role: msg.role,
                    content: msg.content
                }))
            ];

            return messages;
        } catch (error) {
            console.error('Failed to get messages for request:', error);
            return [{ role: 'system', content: this.systemPrompt }];
        }
    }

    /**
     * Update session activity timestamp and message count
     */
    async updateSessionActivity(sessionId) {
        try {
            const session = await this.db.getSession(sessionId);
            if (session) {
                const messages = await this.db.getSessionMessages(sessionId);
                session.lastActivity = new Date().toISOString();
                session.messageCount = messages.length;
                
                await this.db.saveSession(session);
                
                // Update local sessions array
                const sessionIndex = this.sessions.findIndex(s => s.id === sessionId);
                if (sessionIndex !== -1) {
                    this.sessions[sessionIndex] = session;
                    // Move to top if it's not already there
                    if (sessionIndex > 0) {
                        this.sessions.splice(sessionIndex, 1);
                        this.sessions.unshift(session);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to update session activity:', error);
        }
    }

    /**
     * Rename a session
     */
    async renameSession(sessionId, newTitle) {
        try {
            const session = await this.db.getSession(sessionId);
            if (session) {
                session.title = newTitle;
                await this.db.saveSession(session);
                
                // Update local sessions array
                const sessionIndex = this.sessions.findIndex(s => s.id === sessionId);
                if (sessionIndex !== -1) {
                    this.sessions[sessionIndex] = session;
                }
            }
        } catch (error) {
            console.error('Failed to rename session:', error);
            throw error;
        }
    }

    /**
     * Delete a session
     */
    async deleteSession(sessionId) {
        try {
            await this.db.deleteSession(sessionId);
            
            // Remove from local sessions array
            this.sessions = this.sessions.filter(s => s.id !== sessionId);
            
            // If this was the current session, clear it
            if (this.currentSessionId === sessionId) {
                this.currentSessionId = null;
            }
        } catch (error) {
            console.error('Failed to delete session:', error);
            throw error;
        }
    }

    /**
     * Generate a default session title
     */
    generateSessionTitle() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = now.toLocaleDateString([], { month: 'short', day: 'numeric' });
        return `Chat ${dateStr} ${timeStr}`;
    }

    /**
     * Search sessions by title
     */
    searchSessions(query) {
        if (!query.trim()) return this.sessions;
        
        const lowerQuery = query.toLowerCase();
        return this.sessions.filter(session => 
            session.title.toLowerCase().includes(lowerQuery)
        );
    }

    /**
     * Get current session info
     */
    getCurrentSession() {
        if (!this.currentSessionId) return null;
        return this.sessions.find(s => s.id === this.currentSessionId);
    }
}

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

        // History system
        this.chatHistory = new ChatHistory();
        this.historyButton = null;
        this.historySidebar = null;
        this.isHistoryOpen = false;
        
        this.initializeElements();
        this.initializeApp();
    }

    async initializeApp() {
        // Initialize history system first
        await this.chatHistory.init();
        
        this.bindEvents();
        await this.initializeServerConfig();
        
        // Create history UI
        this.createHistoryUI();
        
        // Check for existing session or create new one
        if (this.chatHistory.sessions.length === 0 || !this.chatHistory.currentSessionId) {
            await this.chatHistory.createSession();
        } else {
            // Load the most recent session
            const latestSession = this.chatHistory.sessions[0];
            await this.loadSession(latestSession.id);
        }
        
        console.log('Chat application initialized successfully');
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
     * Create the history UI components
     */
    createHistoryUI() {
        // Add history button to the controls
        const controls = document.querySelector('.controls');
        if (controls && !this.historyButton) {
            this.historyButton = document.createElement('button');
            this.historyButton.id = 'history-button';
            this.historyButton.innerHTML = '<i class="fas fa-history"></i> History';
            this.historyButton.className = 'control-btn history-btn';
            this.historyButton.title = 'Chat History';
            
            // Insert before the clear button
            const clearButton = document.getElementById('clear-button');
            controls.insertBefore(this.historyButton, clearButton);
        }

        // Create history sidebar
        if (!this.historySidebar) {
            this.historySidebar = document.createElement('div');
            this.historySidebar.id = 'history-sidebar';
            this.historySidebar.className = 'history-sidebar';
            this.historySidebar.innerHTML = `
                <div class="history-header">
                    <h3><i class="fas fa-history"></i> Chat History</h3>
                    <div class="history-controls">
                        <button id="new-session-btn" class="new-session-btn" title="New Chat">
                            <i class="fas fa-plus"></i>
                        </button>
                        <button id="close-history-btn" class="close-history-btn" title="Close">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                <div class="history-search">
                    <input type="text" id="history-search-input" placeholder="Search sessions...">
                    <i class="fas fa-search"></i>
                </div>
                <div class="history-list" id="history-list">
                    <!-- Sessions will be populated here -->
                </div>
            `;
            
            document.body.appendChild(this.historySidebar);
        }

        // Update sessions display
        this.updateHistoryDisplay();
        
        // Bind history events
        this.bindHistoryEvents();
    }

    /**
     * Bind history-related event listeners
     */
    bindHistoryEvents() {
        // History button click
        if (this.historyButton) {
            this.historyButton.addEventListener('click', () => this.toggleHistory());
        }

        // Close history button
        const closeHistoryBtn = document.getElementById('close-history-btn');
        if (closeHistoryBtn) {
            closeHistoryBtn.addEventListener('click', () => this.closeHistory());
        }

        // New session button
        const newSessionBtn = document.getElementById('new-session-btn');
        if (newSessionBtn) {
            newSessionBtn.addEventListener('click', () => this.createNewSession());
        }

        // History search
        const searchInput = document.getElementById('history-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.searchSessions(e.target.value));
        }

        // Click outside to close
        document.addEventListener('click', (e) => {
            if (this.isHistoryOpen && 
                !this.historySidebar.contains(e.target) && 
                !this.historyButton.contains(e.target)) {
                this.closeHistory();
            }
        });
    }

    /**
     * Toggle history sidebar
     */
    toggleHistory() {
        if (this.isHistoryOpen) {
            this.closeHistory();
        } else {
            this.openHistory();
        }
    }

    /**
     * Open history sidebar
     */
    openHistory() {
        if (this.historySidebar) {
            this.historySidebar.classList.add('open');
            this.isHistoryOpen = true;
            this.updateHistoryDisplay();
        }
    }

    /**
     * Close history sidebar
     */
    closeHistory() {
        if (this.historySidebar) {
            this.historySidebar.classList.remove('open');
            this.isHistoryOpen = false;
        }
    }

    /**
     * Update the history display with current sessions
     */
    updateHistoryDisplay() {
        const historyList = document.getElementById('history-list');
        if (!historyList) return;

        historyList.innerHTML = '';

        if (this.chatHistory.sessions.length === 0) {
            historyList.innerHTML = '<div class="no-sessions">No chat history yet</div>';
            return;
        }

        this.chatHistory.sessions.forEach(session => {
            const sessionElement = this.createSessionElement(session);
            historyList.appendChild(sessionElement);
        });
    }

    /**
     * Create a session element for the history list
     */
    createSessionElement(session) {
        const sessionDiv = document.createElement('div');
        sessionDiv.className = `session-item ${session.id === this.chatHistory.currentSessionId ? 'active' : ''}`;
        sessionDiv.dataset.sessionId = session.id;

        const lastActivity = new Date(session.lastActivity);
        const timeAgo = this.getTimeAgo(lastActivity);
        
        sessionDiv.innerHTML = `
            <div class="session-info">
                <div class="session-title" title="${session.title}">${session.title}</div>
                <div class="session-meta">
                    <span class="session-time">${timeAgo}</span>
                    <span class="session-count">${session.messageCount || 0} messages</span>
                </div>
            </div>
            <div class="session-actions">
                <button class="session-action rename-session" title="Rename">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="session-action delete-session" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        // Bind session events
        sessionDiv.addEventListener('click', (e) => {
            if (!e.target.closest('.session-actions')) {
                this.loadSession(session.id);
            }
        });

        const renameBtn = sessionDiv.querySelector('.rename-session');
        renameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.renameSession(session.id, session.title);
        });

        const deleteBtn = sessionDiv.querySelector('.delete-session');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteSession(session.id);
        });

        return sessionDiv;
    }

    /**
     * Get human-readable time ago string
     */
    getTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 30) return `${diffDays}d ago`;
        
        return date.toLocaleDateString();
    }

    /**
     * Search sessions by title
     */
    searchSessions(query) {
        const sessions = this.chatHistory.searchSessions(query);
        const historyList = document.getElementById('history-list');
        
        if (!historyList) return;
        
        historyList.innerHTML = '';
        
        if (sessions.length === 0) {
            historyList.innerHTML = '<div class="no-sessions">No sessions found</div>';
            return;
        }

        sessions.forEach(session => {
            const sessionElement = this.createSessionElement(session);
            historyList.appendChild(sessionElement);
        });
    }

    /**
     * Create a new chat session
     */
    async createNewSession() {
        try {
            await this.chatHistory.createSession();
            this.clearChat();
            this.updateHistoryDisplay();
            this.closeHistory();
        } catch (error) {
            console.error('Failed to create new session:', error);
            this.showError('Failed to create new session');
        }
    }

    /**
     * Load a specific session
     */
    async loadSession(sessionId) {
        try {
            const { session, messages } = await this.chatHistory.loadSession(sessionId);
            
            // Clear current chat
            this.clearChat();
            
            // Load messages into UI
            this.messages = [];
            messages.forEach(message => {
                this.addMessage(message.role, message.content, message.usage, false); // false = don't save to history
            });
            
            // Update UI
            this.updateHistoryDisplay();
            this.closeHistory();
            
            console.log(`Loaded session: ${session.title}`);
        } catch (error) {
            console.error('Failed to load session:', error);
            this.showError('Failed to load session');
        }
    }

    /**
     * Rename a session
     */
    async renameSession(sessionId, currentTitle) {
        const newTitle = prompt('Enter new session title:', currentTitle);
        if (newTitle && newTitle.trim() && newTitle !== currentTitle) {
            try {
                await this.chatHistory.renameSession(sessionId, newTitle.trim());
                this.updateHistoryDisplay();
            } catch (error) {
                console.error('Failed to rename session:', error);
                this.showError('Failed to rename session');
            }
        }
    }

    /**
     * Delete a session
     */
    async deleteSession(sessionId) {
        const session = this.chatHistory.sessions.find(s => s.id === sessionId);
        if (!session) return;

        if (confirm(`Are you sure you want to delete "${session.title}"?`)) {
            try {
                await this.chatHistory.deleteSession(sessionId);
                
                // If this was the current session, create a new one
                if (sessionId === this.chatHistory.currentSessionId) {
                    this.clearChat();
                    await this.chatHistory.createSession();
                }
                
                this.updateHistoryDisplay();
            } catch (error) {
                console.error('Failed to delete session:', error);
                this.showError('Failed to delete session');
            }
        }
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
                const timeoutId = setTimeout(() => controller.abort(), 3000); // Increased timeout to 3 seconds
                
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
                    console.log(`API URL: ${this.apiUrl}`);
                    
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
        
        // Add user message to chat history (will auto-save to IndexedDB)
        await this.addMessage('user', messageText);
        
        // Clear and reset input field
        this.messageInput.value = '';
        this.updateCharCount();
        this.validateInput();
        this.autoResize();
        
        // Show loading state
        this.setLoading(true);
        
        try {
            // Get messages for API request (includes system prompt + recent context)
            const messages = await this.chatHistory.getMessagesForRequest();
            
            const response = await this.callChatAPI(messages);
            
            if (response.reply) {
                await this.addMessage('assistant', response.reply, response.usage);
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
            // Create abort controller for timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
            
            console.log(`Making API request to: ${this.apiUrl}`);
            const startTime = Date.now();
            
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ messages }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            const responseTime = Date.now() - startTime;
            console.log(`Frontend request completed in ${responseTime}ms`);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            this.updateStatus('Ready', 'success');
            return data;
            
        } catch (error) {
            // Log detailed error information
            console.error('Chat API Error:', {
                message: error.message,
                name: error.name,
                retryCount,
                apiUrl: this.apiUrl
            });
            
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
    
    async addMessage(role, content, usage = null, saveToHistory = true) {
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

        // Save to history if requested
        if (saveToHistory) {
            try {
                await this.chatHistory.saveMessage(role, content, usage);
            } catch (error) {
                console.error('Failed to save message to history:', error);
            }
        }
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