
const config = {
    ontimeWsUrl: 'ws://localhost:4001/ws', // Korrigierte WebSocket-URL für ontime
    fireworkApiUrl: 'http://localhost:8000', // HTTP-API-URL für die Feuerwerkssteuerung
    pollInterval: 2000, // Abfrageintervall für Firewerk-API in ms
    reconnectInterval: 5000 // Intervall für WebSocket-Wiederverbindungsversuche in ms
};

const elements = {
    currentTime: document.getElementById('current-time'),
    eventList: document.getElementById('event-list'),
    currentEvent: document.getElementById('current-event'),
    eventRemainingTime: document.getElementById('event-remaining-time'),
    eventStatus: document.getElementById('event-status'),
    fireworkStatus: document.getElementById('firework-status'),
    emergencyButton: document.getElementById('emergency-button'),
    messageList: document.getElementById('message-list')
};

let state = {
    ontime: {
        events: [],
        currentEventId: null,
        currentEventIndex: null,
        nextEventId: null,
        playbackState: null,
        timeRemaining: 0
    },
    firework: {
        sequences: []
    },
    messages: [],
    websocket: null,
    websocketConnected: false
};

function updateClock() {
    const now = new Date();
    elements.currentTime.textContent = now.toLocaleTimeString('de-DE');
}

function initClock() {
    updateClock();
    setInterval(updateClock, 1000);
}

function updateEventList() {
    elements.eventList.innerHTML = '';
    
    if (state.ontime.events.length === 0) {
        const noEvents = document.createElement('div');
        noEvents.textContent = 'Keine Events verfügbar.';
        elements.eventList.appendChild(noEvents);
        return;
    }
    
    state.ontime.events.forEach((event, index) => {
        const eventItem = document.createElement('div');
        eventItem.className = 'event-item';
        
        // Markiere das aktuelle und nächste Event
        if (state.ontime.currentEventIndex === index) {
            eventItem.classList.add('active');
        } else if (state.ontime.currentEventIndex + 1 === index) {
            eventItem.classList.add('next');
        }
        
        const eventName = document.createElement('div');
        eventName.className = 'event-name';
        eventName.textContent = event.title;
        
        const eventDuration = document.createElement('div');
        eventDuration.className = 'event-duration';
        const duration = Math.round(event.duration / 1000);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        eventDuration.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
        
        eventItem.appendChild(eventName);
        eventItem.appendChild(eventDuration);
        elements.eventList.appendChild(eventItem);
    });
}

function updateCurrentEvent() {
    if (state.ontime.currentEventIndex !== null && state.ontime.events.length > 0 && 
        state.ontime.currentEventIndex < state.ontime.events.length) {
        const currentEvent = state.ontime.events[state.ontime.currentEventIndex];
        
        const eventTitleElement = elements.currentEvent.querySelector('.event-title');
        eventTitleElement.textContent = currentEvent.title;
        
        const seconds = Math.round(state.ontime.timeRemaining / 1000);
        const minutes = Math.floor(Math.abs(seconds) / 60);
        const remainingSeconds = Math.abs(seconds) % 60;
        elements.eventRemainingTime.textContent = 
            `${seconds < 0 ? '-' : ''}${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
        
        elements.eventStatus.className = 'event-status';
        
        if (state.ontime.playbackState === 'play') {
            elements.eventStatus.textContent = 'Läuft';
            elements.eventStatus.classList.add('running');
        } else if (state.ontime.playbackState === 'pause') {
            elements.eventStatus.textContent = 'Pausiert';
            elements.eventStatus.classList.add('paused');
        } else if (state.ontime.playbackState === 'stop') {
            elements.eventStatus.textContent = 'Gestoppt';
            elements.eventStatus.classList.add('stopped');
        } else {
            elements.eventStatus.textContent = 'Nicht aktiv';
        }
    } else {
        const eventTitleElement = elements.currentEvent.querySelector('.event-title');
        eventTitleElement.textContent = 'Kein aktives Event';
        elements.eventRemainingTime.textContent = '--:--';
        elements.eventStatus.className = 'event-status';
        elements.eventStatus.textContent = 'Nicht aktiv';
    }
}

function updateFireworkStatus() {
    elements.fireworkStatus.innerHTML = '';
    
    if (state.firework.sequences.length === 0) {
        const noSequences = document.createElement('div');
        noSequences.textContent = 'Keine Feuerwerkssequenzen verfügbar.';
        elements.fireworkStatus.appendChild(noSequences);
        return;
    }
    
    state.firework.sequences.forEach(sequence => {
        const sequenceItem = document.createElement('div');
        sequenceItem.className = 'firework-sequence';
        
        const sequenceName = document.createElement('div');
        sequenceName.className = 'sequence-name';
        sequenceName.textContent = sequence.name;
        
        const sequenceStatus = document.createElement('div');
        sequenceStatus.className = `sequence-status status-${sequence.status}`;
        sequenceStatus.textContent = translateStatus(sequence.status);
        
        sequenceItem.appendChild(sequenceName);
        sequenceItem.appendChild(sequenceStatus);
        elements.fireworkStatus.appendChild(sequenceItem);
    });
}

function translateStatus(status) {
    const statusMap = {
        'saved': 'Bereit',
        'first_stage': '1. Freigabe',
        'second_stage': '2. Freigabe',
        'running': 'Aktiv',
        'paused': 'Pausiert',
        'stopped': 'Gestoppt'
    };
    
    return statusMap[status] || status;
}

function addMessage(message, type = 'info') {
    if (message === '[object Object]' || (typeof message === 'object' && message !== null)) {
        try {
            message = JSON.stringify(message);
        } catch (e) {
            message = 'Nicht anzeigbare Nachricht';
        }
    }
    
    const now = new Date();
    
    state.messages.unshift({
        time: now,
        text: message,
        type: type
    });
    
    if (state.messages.length > 20) {
        state.messages.pop();
    }
    
    updateMessages();
}

function updateMessages() {
    elements.messageList.innerHTML = '';
    
    if (state.messages.length === 0) {
        const noMessages = document.createElement('div');
        noMessages.textContent = 'Keine Meldungen vorhanden.';
        elements.messageList.appendChild(noMessages);
        return;
    }
    
    state.messages.forEach(message => {
        const messageItem = document.createElement('div');
        messageItem.className = `message-item ${message.type}`;
        
        const messageTime = document.createElement('div');
        messageTime.className = 'message-time';
        messageTime.textContent = message.time.toLocaleTimeString('de-DE');
        
        const messageText = document.createElement('div');
        messageText.className = 'message-text';
        messageText.textContent = message.text;
        
        messageItem.appendChild(messageTime);
        messageItem.appendChild(messageText);
        elements.messageList.appendChild(messageItem);
    });
}

function connectWebSocket() {
    if (state.websocket) {
        state.websocket.close();
    }
    
    try {
        state.websocket = new WebSocket(config.ontimeWsUrl);
        
        state.websocket.onopen = () => {
            console.log('WebSocket-Verbindung hergestellt');
            addMessage('Verbindung zu ontime hergestellt', 'info');
            state.websocketConnected = true;
            
            sendWebSocketMessage({ type: 'poll' });
        };
        
        state.websocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('Received message:', data);
                
                if (data.type === 'poll' && data.payload) {
                    processOntimeData(data.payload);
                } else if (data.type === 'ontime-timer' && data.payload) {
                    updateTimer(data.payload);
                } else if (data.type === 'ontime-runtime' && data.payload) {
                    updateRuntime(data.payload);
                } else if (data.type === 'message' && data.payload) {
                    if (data.payload.external && typeof data.payload.external === 'string') {
                        addMessage(data.payload.external, 'info');
                    }
                }
            } catch (error) {
                console.error('Fehler beim Verarbeiten der WebSocket-Nachricht:', error);
                console.log('Raw message:', event.data);
            }
        };
        
        state.websocket.onclose = (event) => {
            console.log('WebSocket-Verbindung geschlossen:', event.code, event.reason);
            addMessage('Verbindung zu ontime getrennt', 'warning');
            state.websocketConnected = false;
            
            setTimeout(connectWebSocket, config.reconnectInterval);
        };
        
        state.websocket.onerror = (error) => {
            console.error('WebSocket-Fehler:', error);
            addMessage('Fehler in der ontime-Verbindung', 'error');
        };
    } catch (error) {
        console.error('Fehler beim Erstellen der WebSocket-Verbindung:', error);
        addMessage('Konnte keine Verbindung zu ontime herstellen', 'error');
        
        setTimeout(connectWebSocket, config.reconnectInterval);
    }
}

function sendWebSocketMessage(message) {
    if (state.websocketConnected && state.websocket) {
        try {
            state.websocket.send(JSON.stringify(message));
        } catch (error) {
            console.error('Fehler beim Senden der WebSocket-Nachricht:', error);
        }
    } else {
        console.warn('WebSocket nicht verbunden. Nachricht konnte nicht gesendet werden.');
    }
}

function updateTimer(data) {
    state.ontime.timeRemaining = data.current;
    state.ontime.playbackState = data.playback;
    
    updateCurrentEvent();
}

function updateRuntime(data) {
    if (data.selectedEventIndex !== undefined) {
        state.ontime.currentEventIndex = data.selectedEventIndex;
    }
    
    if (data.numEvents !== undefined && data.numEvents > 0 && state.ontime.events.length === 0) {
        fetchEventList();
    }
}

function processOntimeData(data) {
    console.log('Processing ontime data:', data);
    
    if (data.timer) {
        state.ontime.playbackState = data.timer.playback;
        state.ontime.timeRemaining = data.timer.current;
    }
    
    if (data.eventNow) {
        const eventExists = state.ontime.events.some(e => e.id === data.eventNow.id);
        if (!eventExists) {
            state.ontime.events.push(data.eventNow);
        }
    }
    
    if (data.eventNext) {
        const eventExists = state.ontime.events.some(e => e.id === data.eventNext.id);
        if (!eventExists) {
            state.ontime.events.push(data.eventNext);
        }
    }
    
    if (data.runtime) {
        if (data.runtime.selectedEventIndex !== undefined) {
            state.ontime.currentEventIndex = data.runtime.selectedEventIndex;
        }
        if (state.ontime.events.length < 2 && data.runtime.numEvents > 0) {
            fetchEventList();
        }
    }
    
    if (data.message && data.message.external) {
        const externalMessage = data.message.external;
        if (externalMessage && typeof externalMessage === 'string' &&
            (state.messages.length === 0 || state.messages[0].text !== externalMessage)) {
            
            const messageType = externalMessage.includes('FEHLER') ? 'error' : 
                                externalMessage.includes('WARNUNG') ? 'warning' : 'info';
            
            addMessage(externalMessage, messageType);
        }
    }
    
    updateEventList();
    updateCurrentEvent();
}

async function fetchEventList() {
    try {
        const response = await fetch(`${config.ontimeWsUrl.replace('ws://', 'http://').replace('/ws', '')}/api/data/rundown`);
        if (!response.ok) {
            throw new Error(`HTTP-Fehler! Status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Event list data:', data);
        
        if (data && data.payload && Array.isArray(data.payload)) {
            state.ontime.events = data.payload;
            updateEventList();
        }
    } catch (error) {
        console.error('Fehler beim Abrufen der Event-Liste:', error);
    }
}

async function fetchFireworkStatus() {
    try {
        const response = await fetch(`${config.fireworkApiUrl}/`);
        
        if (!response.ok) {
            throw new Error(`HTTP-Fehler! Status: ${response.status}`);
        }
        
        state.firework.sequences = await response.json();
        updateFireworkStatus();
        
        if (state.firework.connectionError) {
            state.firework.connectionError = false;
            addMessage('Verbindung zur Feuerwerkssteuerung wiederhergestellt', 'info');
        }
    } catch (error) {
        console.error('Fehler beim Abrufen des Feuerwerk-Status:', error);
        
        if (!state.firework.connectionError) {
            addMessage('Keine Verbindung zur Feuerwerkssteuerung', 'warning');
            state.firework.connectionError = true;
        }
    }
}

async function triggerEmergencyStop() {
    elements.emergencyButton.disabled = true;
    elements.emergencyButton.textContent = 'WIRD AUSGEFÜHRT...';
    
    // Timer für Timeout
    const resetButton = () => {
        elements.emergencyButton.disabled = false;
        elements.emergencyButton.textContent = 'NOTAUS';
    };
    setTimeout(resetButton, 3000);
    
    try {
        if (state.websocketConnected) {
            sendWebSocketMessage({ type: 'pause' });
        } else {
            const ontimeResponse = await fetch(`${config.ontimeWsUrl.replace('ws://', 'http://').replace('/ws', '')}/api/pause`);
            if (!ontimeResponse.ok) {
                throw new Error(`HTTP-Fehler bei ontime! Status: ${ontimeResponse.status}`);
            }
        }
        
        addMessage('Notaus ausgelöst: Event pausiert', 'warning');
        
        const fireworkResponse = await fetch(`${config.fireworkApiUrl}/stop`, {
            method: 'POST'
        });
        
        if (!fireworkResponse.ok) {
            throw new Error(`HTTP-Fehler bei Feuerwerk! Status: ${fireworkResponse.status}`);
        }
        
        addMessage('Notaus ausgelöst: Feuerwerk gestoppt', 'warning');
        
        if (state.websocketConnected) {
            sendWebSocketMessage({ type: 'poll' });
        }
        fetchFireworkStatus();
        
    } catch (error) {
        console.error('Fehler beim Auslösen des Notaus:', error);
        addMessage(`Fehler beim Notaus: ${error.message}`, 'error');
        resetButton();
    }
}

function startPolling() {
    setInterval(() => {
        if (state.websocketConnected) {
            sendWebSocketMessage({ type: 'poll' });
        }
    }, config.pollInterval);
    
    setInterval(fetchFireworkStatus, config.pollInterval);
}

function init() {
    initClock();
    
    connectWebSocket();
    
    startPolling();
    
    elements.emergencyButton.addEventListener('click', triggerEmergencyStop);
    
    addMessage('Feuerwerk-Monitoring gestartet', 'info');
}

document.addEventListener('DOMContentLoaded', init);