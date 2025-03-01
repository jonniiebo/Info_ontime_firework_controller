// Konfiguration
<<<<<<< HEAD:webapp/app.js
const config = {
    ontimeWsUrl: 'ws://localhost:4001/ws', // Korrigierte WebSocket-URL für ontime
    fireworkApiUrl: 'http://localhost:8000', // HTTP-API-URL für die Feuerwerkssteuerung
    pollInterval: 2000, // Abfrageintervall für Firewerk-API in ms
    reconnectInterval: 5000 // Intervall für WebSocket-Wiederverbindungsversuche in ms
=======
const CONFIG = {
    // ontime WebSocket-Verbindung
    ONTIME_WS_URL: 'ws://localhost:4001/ws', // Ontime WebSocket URL
    
    // Feuerwerkssteuerung HTTP-Schnittstelle
    FIREWORKS_API_URL: 'http://localhost:8000/api', // URL zur Feuerwerkssteuerung
    
    // Aktualisierungsintervalle (in ms)
    UPDATE_INTERVAL: 1000, // Interval für Clock-Updates
    FIREWORKS_POLL_INTERVAL: 2000, // Interval für Feuerwerkssequenz-Updates
>>>>>>> 7a6ebc35b9b1745ba0854950ed38d6633a6610cf:webapp/static/app.js
};

// DOM-Elemente
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

// Globale Zustandsvariablen
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

// Aktualisiere die Uhrzeit
function updateClock() {
    const now = new Date();
    elements.currentTime.textContent = now.toLocaleTimeString('de-DE');
}

// Initialisiere die Uhrzeit und aktualisiere sie jede Sekunde
function initClock() {
    updateClock();
    setInterval(updateClock, 1000);
}

<<<<<<< HEAD:webapp/app.js
// Event-Liste aktualisieren
function updateEventList() {
=======
/**
 * Erzeugt einen Status-Tag mit entsprechender Farbe
 */
function createStatusTag(status) {
    return `<span class="status-tag status-${status}">${status}</span>`;
}


function initOntimeWebSocket() {
    ontimeWebSocket = new WebSocket(CONFIG.ONTIME_WS_URL);
    
    ontimeWebSocket.onopen = () => {
        console.log('WebSocket-Verbindung zu ontime hergestellt');
        addMessage('info', 'Verbindung zu ontime hergestellt');
    };
    
    ontimeWebSocket.onclose = () => {
        console.log('WebSocket-Verbindung zu ontime geschlossen');
        addMessage('warning', 'Verbindung zu ontime unterbrochen');
        
        // Automatischer Wiederverbindungsversuch nach 5 Sekunden
        setTimeout(initOntimeWebSocket, 5000);
    };
    
    ontimeWebSocket.onerror = (error) => {
        console.error('WebSocket Fehler:', error);
        addMessage('error', 'WebSocket-Fehler: Verbindung zu ontime fehlgeschlagen');
    };
    
    ontimeWebSocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleOntimeMessage(data);
        } catch (error) {
            console.error('Fehler beim Verarbeiten der WebSocket-Nachricht:', error);
        }
    };
}

/**
 * Verarbeitet eingehende WebSocket-Nachrichten von ontime
 */
function handleOntimeMessage(data) {
    // Verarbeite verschiedene Nachrichtentypen von ontime
    if (data.type === 'state') {
        // Aktuellen Zustand verarbeiten (Events, aktuelles Event, etc.)
        updateOntimeState(data);
    } else if (data.type === 'externalMessage') {
        // Externe Nachricht von anderen Systemen (z.B. Fehler vom Feuerwerk)
        addMessage('error', data.message);
    }
}

/**
 * Aktualisiert den Zustand basierend auf ontime-Daten
 */
function updateOntimeState(data) {
    if (data.events) {
        eventsList = data.events;
        renderEventsList();
    }
    
    if (data.rundownState) {
        // Aktuelles Event und Zeit
        currentEventId = data.rundownState.currentEventId || null;

        // Verbleibende Zeit des aktuellen Events
        if (data.rundownState.currentEvent) {
            const remaining = data.rundownState.currentEvent.remainingTime || 0;
            elements.currentEventTime.textContent = `Restzeit: ${formatDuration(remaining)}`;
            
            // Automatisch die Feuerwerkssequenz für das Event erstellen, falls nicht vorhanden
            const currentEvent = data.rundownState.currentEvent;
            if (currentEvent && currentEvent.title) {
                const eventTitle = currentEvent.title;
                if (!fireworkSequences.some(seq => seq.name === eventTitle)) {
                    maybeCreateSequenceForEvent(eventTitle);
                }
            }
        } else {
            elements.currentEventTime.textContent = 'Restzeit: --:--';
        }
        
        updateCurrentAndNextEvent();
    }
}

/**
 * Prüft, ob eine Sequenz für ein Event erstellt werden sollte und erstellt sie, falls nötig
 */
async function maybeCreateSequenceForEvent(eventTitle) {
    // Prüfen, ob bereits eine Sequenz mit diesem Namen existiert
    const existingSequence = fireworkSequences.find(seq => seq.name === eventTitle);
    if (!existingSequence) {
        try {
            await createSequence(eventTitle);
        } catch (error) {
            console.error(`Fehler beim automatischen Erstellen der Sequenz für ${eventTitle}:`, error);
        }
    }
}

/**
 * Aktualisiert die Anzeige des aktuellen und nächsten Events
 */
function updateCurrentAndNextEvent() {
    let currentEvent = null;
    let nextEvent = null;
    
    // Finde aktuelles und nächstes Event
    for (let i = 0; i < eventsList.length; i++) {
        if (eventsList[i].id === currentEventId) {
            currentEvent = eventsList[i];
            if (i + 1 < eventsList.length) {
                nextEvent = eventsList[i + 1];
            }
            break;
        }
    }
    
    // Aktuelles Event anzeigen
    if (currentEvent) {
        elements.currentEventName.textContent = currentEvent.title || currentEvent.id;
    } else {
        elements.currentEventName.textContent = '-';
    }
    
    // Nächstes Event anzeigen
    if (nextEvent) {
        elements.nextEventName.textContent = nextEvent.title || nextEvent.id;
    } else {
        elements.nextEventName.textContent = '-';
    }
    
    // Events-Liste aktualisieren
    renderEventsList();
}

/**
 * Rendert die Liste aller Events
 */
function renderEventsList() {
>>>>>>> 7a6ebc35b9b1745ba0854950ed38d6633a6610cf:webapp/static/app.js
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

// Aktuelles Event-Detail aktualisieren
function updateCurrentEvent() {
    if (state.ontime.currentEventIndex !== null && state.ontime.events.length > 0 && 
        state.ontime.currentEventIndex < state.ontime.events.length) {
        const currentEvent = state.ontime.events[state.ontime.currentEventIndex];
        
        // Event-Titel
        const eventTitleElement = elements.currentEvent.querySelector('.event-title');
        eventTitleElement.textContent = currentEvent.title;
        
        // Verbleibende Zeit
        const seconds = Math.round(state.ontime.timeRemaining / 1000);
        const minutes = Math.floor(Math.abs(seconds) / 60);
        const remainingSeconds = Math.abs(seconds) % 60;
        elements.eventRemainingTime.textContent = 
            `${seconds < 0 ? '-' : ''}${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
        
        // Event-Status
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
        // Kein aktives Event
        const eventTitleElement = elements.currentEvent.querySelector('.event-title');
        eventTitleElement.textContent = 'Kein aktives Event';
        elements.eventRemainingTime.textContent = '--:--';
        elements.eventStatus.className = 'event-status';
        elements.eventStatus.textContent = 'Nicht aktiv';
    }
}

// Feuerwerk-Status aktualisieren
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

// Status-Texte übersetzen
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

// Systemnachricht hinzufügen
function addMessage(message, type = 'info') {
    // Prüfe auf [object Object] und wandle sie in einen lesbaren String um
    if (message === '[object Object]' || (typeof message === 'object' && message !== null)) {
        try {
            message = JSON.stringify(message);
        } catch (e) {
            message = 'Nicht anzeigbare Nachricht';
        }
    }
    
    const now = new Date();
    
    // Nachricht zum Zustand hinzufügen
    state.messages.unshift({
        time: now,
        text: message,
        type: type
    });
    
    // Nur die letzten 20 Nachrichten behalten
    if (state.messages.length > 20) {
        state.messages.pop();
    }
    
    // Aktualisiere die Anzeige
    updateMessages();
}

// Nachrichtenliste aktualisieren
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

// WebSocket-Verbindung zu ontime herstellen
function connectWebSocket() {
    if (state.websocket) {
        // Alte Verbindung schließen, falls vorhanden
        state.websocket.close();
    }
    
    try {
        state.websocket = new WebSocket(config.ontimeWsUrl);
        
        state.websocket.onopen = () => {
            console.log('WebSocket-Verbindung hergestellt');
            addMessage('Verbindung zu ontime hergestellt', 'info');
            state.websocketConnected = true;
            
            // Initial-Abfragen senden
            sendWebSocketMessage({ type: 'poll' });
        };
        
        state.websocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('Received message:', data);
                
                // Verschiedene Nachrichtentypen verarbeiten
                if (data.type === 'poll' && data.payload) {
                    processOntimeData(data.payload);
                } else if (data.type === 'ontime-timer' && data.payload) {
                    // Timer-Updates verarbeiten
                    updateTimer(data.payload);
                } else if (data.type === 'ontime-runtime' && data.payload) {
                    // Runtime-Updates verarbeiten
                    updateRuntime(data.payload);
                } else if (data.type === 'message' && data.payload) {
                    // Externe Nachrichten verarbeiten
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
            
            // Versuche, die Verbindung nach einer Weile wiederherzustellen
            setTimeout(connectWebSocket, config.reconnectInterval);
        };
        
        state.websocket.onerror = (error) => {
            console.error('WebSocket-Fehler:', error);
            addMessage('Fehler in der ontime-Verbindung', 'error');
        };
    } catch (error) {
        console.error('Fehler beim Erstellen der WebSocket-Verbindung:', error);
        addMessage('Konnte keine Verbindung zu ontime herstellen', 'error');
        
        // Versuche, die Verbindung nach einer Weile wiederherzustellen
        setTimeout(connectWebSocket, config.reconnectInterval);
    }
}

// WebSocket-Nachricht senden
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

// Timer-Updates verarbeiten
function updateTimer(data) {
    state.ontime.timeRemaining = data.current;
    state.ontime.playbackState = data.playback;
    
    // UI aktualisieren
    updateCurrentEvent();
}

// Runtime-Updates verarbeiten
function updateRuntime(data) {
    if (data.selectedEventIndex !== undefined) {
        state.ontime.currentEventIndex = data.selectedEventIndex;
    }
    
    if (data.numEvents !== undefined && data.numEvents > 0 && state.ontime.events.length === 0) {
        // Wenn wir die Anzahl der Events kennen, aber keine Events haben, versuche sie zu laden
        fetchEventList();
    }
}

// ontime-Daten verarbeiten
function processOntimeData(data) {
    console.log('Processing ontime data:', data);
    
    // Timer-Status und verbleibende Zeit
    if (data.timer) {
        state.ontime.playbackState = data.timer.playback;
        state.ontime.timeRemaining = data.timer.current;
    }
    
    // Aktuelles Event extrahieren
    if (data.eventNow) {
        // Event direkt zur Liste hinzufügen, falls es noch nicht existiert
        const eventExists = state.ontime.events.some(e => e.id === data.eventNow.id);
        if (!eventExists) {
            state.ontime.events.push(data.eventNow);
        }
    }
    
    // Nächstes Event extrahieren
    if (data.eventNext) {
        // Event direkt zur Liste hinzufügen, falls es noch nicht existiert
        const eventExists = state.ontime.events.some(e => e.id === data.eventNext.id);
        if (!eventExists) {
            state.ontime.events.push(data.eventNext);
        }
    }
    
    // Runtime-Daten
    if (data.runtime) {
        // Aktueller Event-Index
        if (data.runtime.selectedEventIndex !== undefined) {
            state.ontime.currentEventIndex = data.runtime.selectedEventIndex;
        }
        
        // Wenn rundown.events fehlt, aber numEvents vorhanden ist, versuche Events abzurufen
        if (state.ontime.events.length < 2 && data.runtime.numEvents > 0) {
            fetchEventList();
        }
    }
    
    // Externe Nachrichten
    if (data.message && data.message.external) {
        const externalMessage = data.message.external;
        if (externalMessage && typeof externalMessage === 'string' &&
            (state.messages.length === 0 || state.messages[0].text !== externalMessage)) {
            
            // Kategorisiere die Nachricht
            const messageType = externalMessage.includes('FEHLER') ? 'error' : 
                                externalMessage.includes('WARNUNG') ? 'warning' : 'info';
            
            addMessage(externalMessage, messageType);
        }
    }
    
    // UI aktualisieren
    updateEventList();
    updateCurrentEvent();
}

// Komplette Event-Liste abrufen
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

// Feuerwerk-Daten über HTTP-API abrufen
async function fetchFireworkStatus() {
    try {
        const response = await fetch(`${config.fireworkApiUrl}/`);
        
        if (!response.ok) {
            throw new Error(`HTTP-Fehler! Status: ${response.status}`);
        }
        
        state.firework.sequences = await response.json();
        updateFireworkStatus();
        
        // Verbindungsstatus zurücksetzen
        if (state.firework.connectionError) {
            state.firework.connectionError = false;
            addMessage('Verbindung zur Feuerwerkssteuerung wiederhergestellt', 'info');
        }
    } catch (error) {
        console.error('Fehler beim Abrufen des Feuerwerk-Status:', error);
        
        // Bei Verbindungsfehlern eine Nachricht anzeigen, aber nur einmal
        if (!state.firework.connectionError) {
            addMessage('Keine Verbindung zur Feuerwerkssteuerung', 'warning');
            state.firework.connectionError = true;
        }
    }
}

// Notaus-Funktion
async function triggerEmergencyStop() {
    // Visuelle Rückmeldung für den Notaus-Button
    elements.emergencyButton.disabled = true;
    elements.emergencyButton.textContent = 'WIRD AUSGEFÜHRT...';
    
    // Timer für Timeout
    const resetButton = () => {
        elements.emergencyButton.disabled = false;
        elements.emergencyButton.textContent = 'NOTAUS';
    };
    setTimeout(resetButton, 3000);
    
    try {
        // 1. Pausiere das aktuelle Event in ontime
        // Versuche zuerst WebSocket
        if (state.websocketConnected) {
            sendWebSocketMessage({ type: 'pause' });
        } else {
            // Fallback auf HTTP
            const ontimeResponse = await fetch(`${config.ontimeWsUrl.replace('ws://', 'http://').replace('/ws', '')}/api/pause`);
            if (!ontimeResponse.ok) {
                throw new Error(`HTTP-Fehler bei ontime! Status: ${ontimeResponse.status}`);
            }
        }
        
        addMessage('Notaus ausgelöst: Event pausiert', 'warning');
        
        // 2. Stoppe alle Feuerwerkssequenzen
        const fireworkResponse = await fetch(`${config.fireworkApiUrl}/stop`, {
            method: 'POST'
        });
        
        if (!fireworkResponse.ok) {
            throw new Error(`HTTP-Fehler bei Feuerwerk! Status: ${fireworkResponse.status}`);
        }
        
        addMessage('Notaus ausgelöst: Feuerwerk gestoppt', 'warning');
        
        // Aktualisiere den Status
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

// Regelmäßiges Polling über WebSocket
function startPolling() {
    // Regelmäßig Daten abfragen
    setInterval(() => {
        if (state.websocketConnected) {
            sendWebSocketMessage({ type: 'poll' });
        }
    }, config.pollInterval);
    
    // Feuerwerk-Status regelmäßig aktualisieren
    setInterval(fetchFireworkStatus, config.pollInterval);
}

// Initialisierung der Anwendung
function init() {
    // Uhr initialisieren
    initClock();
    
    // WebSocket-Verbindung herstellen
    connectWebSocket();
    
    // Polling starten
    startPolling();
    
    // Notaus-Button
    elements.emergencyButton.addEventListener('click', triggerEmergencyStop);
    
    // Willkommensnachricht
    addMessage('Feuerwerk-Monitoring gestartet', 'info');
}

// Starte die Anwendung, wenn das DOM geladen ist
document.addEventListener('DOMContentLoaded', init);