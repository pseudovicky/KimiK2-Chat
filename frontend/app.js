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
        
        // Request optimization
        this.activeRequest = null;
        this.requestCache = new Map();
        this.contextCache = null;
        this.contextCacheTime = 0;
        
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
            const latestSession = this.chatHistory.sessions;
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
        const possiblePorts =[3000, 3001, 3002];
        
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
     * Send a message to the chat API with optimizations
     */
    async sendMessage() {
        const messageText = this.messageInput.value.trim();
        if (!messageText || this.isLoading) return;
        
        // Prevent duplicate requests
        if (this.activeRequest) {
            console.log('Request already in progress, ignoring duplicate');
            return;
        }
        
        // Hide welcome message on first interaction
        if (this.welcomeMessage) {
            this.welcomeMessage.style.display = 'none';
        }
        
        // Clear and reset input field early for better UX
        this.messageInput.value = '';
        this.updateCharCount();
        this.validateInput();
        this.autoResize();
        
        // Show loading state
        this.setLoading(true);
        
        try {
            // Add user message to chat (optimized to batch with response)
            const userMessage = await this.addMessage('user', messageText);
            
            // Get messages for API request with caching
            const messages = await this.getOptimizedMessagesForRequest();
            
            // Create request signature for deduplication
            const requestSignature = this.createRequestSignature(messages);
            
            // Set active request
            this.activeRequest = requestSignature;
            
            const response = await this.callChatAPI(messages);
            
            if (response.reply) {
                // Add assistant message
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
            this.activeRequest = null;
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
                    'Cache-Control': 'no-cache',
                },
                body: JSON.stringify({ messages }),
                signal: controller.signal,
                cache: 'no-cache'
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
     * Get optimized messages for request with caching
     */
    async getOptimizedMessagesForRequest() {
        const now = Date.now();
        
        // Use cached context if fresh (within 30 seconds)
        if (this.contextCache && (now - this.contextCacheTime) < 30000) {
            return this.contextCache;
        }
        
        // Get fresh context
        const messages = await this.chatHistory.getMessagesForRequest();
        
        // Cache for future use
        this.contextCache = messages;
        this.contextCacheTime = now;
        
        return messages;
    }
    
    /**
     * Create request signature for deduplication
     */
    createRequestSignature(messages) {
        // Create hash of last few messages for deduplication
        const lastMessages = messages.slice(-3);
        const jsonString = JSON.stringify(lastMessages);
        // Escape multi-byte characters and then re-encode as binary string
        const binaryString = unescape(encodeURIComponent(jsonString));
        return btoa(binaryString).substring(0, 16);
    }
    
    /**
     * Cache response with TTL
     */
    cacheResponse(signature, response) {
        // Cache with 5-minute TTL
        this.requestCache.set(signature, {
            ...response,
            timestamp: Date.now()
        });
        
        // Clean old cache entries (keep last 10)
        if (this.requestCache.size > 10) {
            const entries = Array.from(this.requestCache.entries());
            entries.sort((a, b) => a.timestamp - b.timestamp);
            
            // Remove oldest entries
            for (let i = 0; i < entries.length - 10; i++) {
                this.requestCache.delete(entries[i]);
            }
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
        
        const messageElement = this.renderMessage(message);

        if (role === 'assistant') {
            await this.streamMessageContent(messageElement, message, usage);
        } else {
            this.updateMessageContent(messageElement, message, usage);
            // Highlight syntax for user-posted code blocks
            if (window.Prism) {
                Prism.highlightAllUnder(messageElement);
            }
        }
        
        this.scrollToBottom();

        // Optimize: Save to history with debouncing for better performance
        if (saveToHistory) {
            try {
                // Use immediate save for better UX, debounce session updates
                await this.chatHistory.saveMessage(role, content, usage);
                
                // Debounce session activity updates
                this.debouncedUpdateActivity();
                
                // Invalidate context cache after save
                this.contextCache = null;
            } catch (error) {
                console.error('Failed to save message to history:', error);
            }
        }
        
        return message;
    }
    
    /**
     * Debounced session activity update to optimize IndexedDB operations
     */
    debouncedUpdateActivity = this.debounce(async () => {
        try {
            if (this.chatHistory.currentSessionId) {
                await this.chatHistory.updateSessionActivity(this.chatHistory.currentSessionId);
            }
        } catch (error) {
            console.error('Failed to update session activity:', error);
        }
    }, 1000);
    
    /**
     * Debounce utility function
     */
    debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }
    
    renderMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.role}`;
        messageElement.setAttribute('data-message-id', message.id);

        this.chatContainer.appendChild(messageElement);

        return messageElement;
    }

    updateMessageContent(messageElement, message, usage = null) {
        const avatar = message.role === 'user' ? '👤' : '🤖';
        const sender = message.role === 'user' ? 'You' : 'Kimi-K2';
        const timestamp = this.formatTime(message.timestamp);

        let usageInfo = '';
        if (usage) {
            usageInfo = `
                <div class="message-usage">
                    <small>
                        Tokens: ${usage.total_tokens || 0}
                        (${usage.prompt_tokens || 0}+${usage.completion_tokens || 0})
                        • Response time: ${usage.response_time_ms || 0}ms
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
    }

    async streamMessageContent(messageElement, message, usage = null) {
        const avatar = message.role === 'user' ? '👤' : '🤖';
        const sender = message.role === 'user' ? 'You' : 'Kimi-K2';
        const timestamp = this.formatTime(message.timestamp);

        // Initial render with empty content
        messageElement.innerHTML = `
            <div class="message-header">
                <div class="message-avatar">${avatar}</div>
                <div class="message-sender">${sender}</div>
                <div class="message-timestamp">${timestamp}</div>
            </div>
            <div class="message-content"></div>
        `;

        const contentDiv = messageElement.querySelector('.message-content');
        const formattedContent = this.formatContent(message.content);
        
        // Check if content is already HTML-formatted
        const htmlTagPattern = /<\/?[a-z][\s\S]*>/i;
        const isHTMLFormatted = htmlTagPattern.test(formattedContent);
        
        if (isHTMLFormatted) {
            // Content is HTML, render it directly without streaming animation
            contentDiv.innerHTML = formattedContent;
        } else {
            // Content is plain text, use streaming animation
            const tokens = formattedContent.split(/(\s+|&[a-z]+;|<[^>]+>)/g);
            
            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i];
                
                if (token.startsWith('<')) {
                    // If it's an HTML tag, append it instantly
                    contentDiv.innerHTML += token;
                } else {
                    contentDiv.innerHTML += token;
                }

                this.scrollToBottom();

                // Delay for typing effect
                let delay = Math.random() * (120 - 50) + 50; // 50-120ms
                if (token.endsWith(',')) delay = 180;
                if (token.endsWith('.')) delay = 350;
                await this.delay(delay);
            }
        }

        // Render usage info after streaming is complete
        if (usage) {
            const usageInfo = `
                <div class="message-usage">
                    <small>
                        Tokens: ${usage.total_tokens || 0}
                        (${usage.prompt_tokens || 0}+${usage.completion_tokens || 0})
                        • Response time: ${usage.response_time_ms || 0}ms
                    </small>
                </div>
            `;
            messageElement.innerHTML += usageInfo;
        }

        // Highlight syntax after streaming
        if (window.Prism) {
            Prism.highlightAllUnder(messageElement);
        }
    }
    
    formatContent(content) {
        // Add debugging to understand the content we're receiving
        console.log('formatContent input (first 200 chars):', content.substring(0, 200));
        
        // Check if the content is already HTML-formatted (contains HTML tags)
        const htmlTagPattern = /<\/?[a-z][\s\S]*>/i;
        const hasHTMLTags = htmlTagPattern.test(content);
        
        console.log('Content has HTML tags:', hasHTMLTags);
        
        if (hasHTMLTags) {
            // Content is already HTML-formatted, return as-is but clean up any encoding issues
            let cleanedContent = content;
            
            // Fix common HTML encoding issues
            cleanedContent = cleanedContent.replace(/&lt;/g, '<');
            cleanedContent = cleanedContent.replace(/&gt;/g, '>');
            cleanedContent = cleanedContent.replace(/&amp;/g, '&');
            cleanedContent = cleanedContent.replace(/&quot;/g, '"');
            
            console.log('Returning cleaned HTML content (first 200 chars):', cleanedContent.substring(0, 200));
            return cleanedContent;
        }
        
        // Content is plain text, process it normally
        console.log('Processing as plain text content');
        
        // First, let's normalize line breaks and handle cases where code might not be in proper markdown blocks
        content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        // Store code blocks to protect them from other processing
        const codeBlocks = [];
        
        // Enhanced regex to handle code blocks with or without language specification
        content = content.replace(/```(\w+)?\s*\n?([\s\S]*?)```/g, (match, language, code) => {
            const lang = language || 'text';
            const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
            // Preserve original formatting and indentation
            const cleanCode = code.replace(/^\n+/, '').replace(/\n+$/, '');
            codeBlocks.push(`<pre><code class="language-${lang}">${this.escapeHtml(cleanCode)}</code></pre>`);
            return placeholder;
        });
        
        // Handle potential code blocks that might be missing markdown formatting
        // Look for patterns that suggest code (multiple lines with programming syntax)
        content = content.replace(/(?:^|\n)((?:(?:#include|class|public:|private:|protected:|int|void|string|const|return|if|for|while|switch|namespace|using|\{|\}|;|\/\/|\/\*|\*\/|#define|template|typedef).+\n?){3,})/gm, (match, codeContent) => {
            // Only process if it's not already in a placeholder
            if (!codeContent.includes('__CODE_BLOCK_')) {
                const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
                const cleanCode = codeContent.trim();
                codeBlocks.push(`<pre><code class="language-cpp">${this.escapeHtml(cleanCode)}</code></pre>`);
                return placeholder;
            }
            return match;
        });
        
        // Store inline code to protect it
        const inlineCodes = [];
        content = content.replace(/`([^`\n]+)`/g, (match, code) => {
            const placeholder = `__INLINE_CODE_${inlineCodes.length}__`;
            inlineCodes.push(`<code>${this.escapeHtml(code)}</code>`);
            return placeholder;
        });
        
        // Process tables
        content = this.formatTables(content);
        
        // Process headers (h1-h6)
        content = content.replace(/^(#{1,6})\s+(.+)$/gm, (match, hashes, text) => {
            const level = hashes.length;
            const contentText = text.trim();
            // Heuristic to prevent formatting code as a header
            if (/[<>{}\[\];()]/.test(contentText) || contentText.startsWith('include') || contentText.startsWith('define')) {
                // Return as escaped text within a paragraph to avoid markdown processing
                return `<p>${this.escapeHtml(match)}</p>`;
            }
            return `<h${level}>${contentText}</h${level}>`;
        });
        
        // Process lists
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
        
        // Final pass: handle any remaining unformatted code-like content
        content = this.handleUnformattedCode(content);
        
        return content;
    }
    
    /**
     * Handle code-like content that might not be properly formatted in markdown
     */
    handleUnformattedCode(content) {
        // First, let's check if the content looks like code that's been flattened into one line
        const codeIndicators = [
            /#include\s*<[^>]+>/g,           // C/C++ includes
            /class\s+\w+/g,                 // Class declarations  
            /public:|private:|protected:/g,  // Access specifiers
            /std::/g,                       // Standard library
            /return\s+\w+/g,                // Return statements
            /\w+\(\s*\)/g,                  // Function calls
            /\{|\}/g                        // Braces
        ];
        
        let codeIndicatorCount = 0;
        codeIndicators.forEach(pattern => {
            const matches = content.match(pattern);
            if (matches) {
                codeIndicatorCount += matches.length;
            }
        });
        
        // If we have multiple code indicators, this is likely code
        if (codeIndicatorCount >= 3) {
            // Try to add line breaks at logical places for C/C++ code
            let formattedContent = content;
            
            // Add line breaks after includes
            formattedContent = formattedContent.replace(/(#include\s*<[^>]+>)/g, '$1\n');
            
            // Add line breaks before/after class declarations
            formattedContent = formattedContent.replace(/(class\s+\w+[^{]*{)/g, '\n$1\n');
            
            // Add line breaks around access specifiers
            formattedContent = formattedContent.replace(/(public:|private:|protected:)/g, '\n    $1\n');
            
            // Add line breaks after semicolons (but not inside function calls)
            formattedContent = formattedContent.replace(/;\s*(?![^()]*\))/g, ';\n');
            
            // Add line breaks around braces
            formattedContent = formattedContent.replace(/\s*{\s*/g, ' {\n    ');
            formattedContent = formattedContent.replace(/\s*}\s*/g, '\n}\n');
            
            // Add line breaks before return statements
            formattedContent = formattedContent.replace(/\s+(return\s+[^;]+;)/g, '\n    $1');
            
            // Clean up excessive whitespace
            formattedContent = formattedContent.replace(/\n\s*\n\s*\n/g, '\n\n');
            formattedContent = formattedContent.trim();
            
            // Wrap in code block
            return `<pre><code class="language-cpp">${this.escapeHtml(formattedContent)}</code></pre>`;
        }
        
        // Fallback: Look for other programming patterns and handle them
        const otherCodePatterns = [
            /function\s+\w+/g,              // JavaScript functions
            /def\s+\w+/g,                   // Python functions
            /import\s+\w+/g,                // Import statements
            /console\.log/g,                // Console logs
            /document\./g                   // DOM manipulation
        ];
        
        let otherCodeCount = 0;
        otherCodePatterns.forEach(pattern => {
            const matches = content.match(pattern);
            if (matches) {
                otherCodeCount += matches.length;
            }
        });
        
        if (otherCodeCount >= 2) {
            // Basic formatting for other languages
            let formattedContent = content;
            formattedContent = formattedContent.replace(/;\s*/g, ';\n');
            formattedContent = formattedContent.replace(/\s*{\s*/g, ' {\n    ');
            formattedContent = formattedContent.replace(/\s*}\s*/g, '\n}\n');
            formattedContent = formattedContent.trim();
            
            return `<pre><code class="language-javascript">${this.escapeHtml(formattedContent)}</code></pre>`;
        }
        
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

        // Basic validation for a markdown table separator row
        if (!rows[1] || !rows[1].includes('-')) {
            return rows.join('\n');
        }

        let table = '<table class="markdown-table">';

        // Process header row
        const headerCells = rows[0].split('|').slice(1, -1).map(cell => cell.trim());
        table += '<thead><tr>';
        headerCells.forEach(cell => {
            table += `<th>${this.escapeHtml(cell)}</th>`;
        });
        table += '</tr></thead>';

        // Process data rows, skipping separator
        const dataRows = rows.slice(2);

        if (dataRows.length > 0) {
            table += '<tbody>';
            dataRows.forEach(row => {
                const cells = row.split('|').slice(1, -1).map(cell => cell.trim());
                // Ensure row has same number of columns as header
                if (cells.length === headerCells.length) {
                    table += '<tr>';
                    cells.forEach(cell => {
                        table += `<td>${this.escapeHtml(cell)}</td>`;
                    });
                    table += '</tr>';
                }
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
        // Split content by double line breaks to identify paragraphs
        const paragraphs = content.split(/\n\s*\n/);
        
        return paragraphs.map(para => {
            const trimmed = para.trim();
            if (!trimmed) return '';

            // Check if this paragraph contains block-level elements
            const blockElementRegex = /<(h[1-6]|table|ul|ol|blockquote|pre|hr|div)/i;
            const match = trimmed.match(blockElementRegex);

            // If a block element is found
            if (match && match.index !== undefined) {
                // Get the text before the first block element
                const textBefore = trimmed.substring(0, match.index).trim();
                const restOfContent = trimmed.substring(match.index);

                // If there is text before the block element, wrap it in a <p> tag
                if (textBefore) {
                    // Better line break handling - preserve intentional line breaks
                    const withBreaks = textBefore.replace(/\n(?!\s*\n)/g, '<br>');
                    return `<p>${withBreaks}</p>\n\n${restOfContent}`;
                } else {
                    // Otherwise, return the block element content as is
                    return restOfContent;
                }
            }
            
            // If no block element is found, treat as a standard paragraph
            // Better handling of line breaks within paragraphs
            const withBreaks = trimmed.replace(/\n(?!\s*\n)/g, '<br>');
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