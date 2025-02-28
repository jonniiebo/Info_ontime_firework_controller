/**
 * Musikfeuerwerk Webapp
 * TH Mittelhessen - FB MuK - Wintersemester 2024/2025
 * 
 * Diese Webapp dient zur Überwachung und Steuerung des Musikfeuerwerks
 * und kommuniziert mit ontime über WebSockets und mit der Feuerwerkssteuerung über HTTP.
 */

// Konfiguration
const CONFIG = {
    // ontime WebSocket-Verbindung
    ONTIME_WS_URL: 'ws://localhost:4001/ws', // Ontime WebSocket URL
    
    // Feuerwerkssteuerung HTTP-Schnittstelle
    FIREWORKS_API_URL: 'http://localhost:8000/api', // URL zur Feuerwerkssteuerung
    
    // Aktualisierungsintervalle (in ms)
    UPDATE_INTERVAL: 1000, // Interval für Clock-Updates
    FIREWORKS_POLL_INTERVAL: 2000, // Interval für Feuerwerkssequenz-Updates
};

// Globale Variablen
let ontimeWebSocket = null;
let eventsList = [];
let currentEventId = null;
let messagesList = [];
let fireworkSequences = [];

// DOM Elements
const elements = {
    currentTime: document.getElementById('current-time'),
    currentEventName: document.getElementById('current-event-name'),
    currentEventTime: document.getElementById('current-event-time'),
    nextEventName: document.getElementById('next-event-name'),
    eventList: document.getElementById('event-list'),
    sequencesList: document.getElementById('sequences-list'),
    messagesList: document.getElementById('messages-list'),
    emergencyStopBtn: document.getElementById('emergency-stop-btn'),
    // Neue DOM-Elemente (werden in der initUI-Funktion später hinzugefügt)
    sequenceNameInput: null,
    createSequenceBtn: null,
    resetAllBtn: null,
    sequenceActionsContainer: null
};

// ==========================================
// Hilfsfunktionen für Formatierungen
// ==========================================

/**
 * Formatiert eine Zeitangabe in HH:MM:SS
 */
function formatTime(date) {
    return date.toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

/**
 * Formatiert eine Dauer in Minuten und Sekunden (MM:SS)
 */
function formatDuration(durationInMs) {
    if (durationInMs <= 0) return '00:00';
    
    const totalSeconds = Math.floor(durationInMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

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
    elements.eventList.innerHTML = '';
    
    eventsList.forEach(event => {
        const li = document.createElement('li');
        
        // Aktuelles oder nächstes Event markieren
        if (event.id === currentEventId) {
            li.classList.add('current');
        } else if (eventsList.indexOf(event) === eventsList.findIndex(e => e.id === currentEventId) + 1) {
            li.classList.add('next');
        }
        
        li.innerHTML = `
            <span>${event.title || event.id}</span>
            <span>${event.duration ? formatDuration(event.duration) : '--:--'}</span>
        `;
        
        elements.eventList.appendChild(li);
    });
}

/**
 * Sendet eine externe Nachricht an ontime
 */
function sendMessageToOntime(message, level = 'info') {
    if (ontimeWebSocket && ontimeWebSocket.readyState === WebSocket.OPEN) {
        const data = {
            type: 'externalMessage',
            message: message,
            level: level
        };
        
        ontimeWebSocket.send(JSON.stringify(data));
    } else {
        console.error('WebSocket nicht verbunden, kann Nachricht nicht senden');
    }
}

// ==========================================
// Feuerwerkssteuerung API
// ==========================================

/**
 * Ruft die aktuellen Feuerwerkssequenzen von der API ab
 */
async function fetchFireworkSequences() {
    try {
        const response = await fetch(`${CONFIG.FIREWORKS_API_URL}/`);
        
        if (!response.ok) {
            throw new Error(`HTTP Fehler: ${response.status}`);
        }
        
        const sequences = await response.json();
        fireworkSequences = sequences;
        renderSequencesList();
        
    } catch (error) {
        console.error('Fehler beim Abrufen der Feuerwerkssequenzen:', error);
        addMessage('error', `Feuerwerkssteuerung nicht erreichbar: ${error.message}`);
    }
}

/**
 * Erstellt eine neue Feuerwerkssequenz
 */
async function createSequence(name) {
    try {
        const response = await fetch(`${CONFIG.FIREWORKS_API_URL}/?name=${encodeURIComponent(name)}`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP Fehler: ${response.status}`);
        }
        
        const newSequence = await response.json();
        addMessage('info', `Neue Sequenz "${name}" erstellt`);
        fetchFireworkSequences(); // Aktualisiere die Liste
        
        return newSequence;
    } catch (error) {
        console.error('Fehler beim Erstellen der Sequenz:', error);
        addMessage('error', `Sequenzerstellung fehlgeschlagen: ${error.message}`);
        throw error;
    }
}

/**
 * Löscht eine Feuerwerkssequenz
 */
async function deleteSequence(name) {
    try {
        const response = await fetch(`${CONFIG.FIREWORKS_API_URL}/${encodeURIComponent(name)}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP Fehler: ${response.status}`);
        }
        
        addMessage('info', `Sequenz "${name}" gelöscht`);
        fetchFireworkSequences();
    } catch (error) {
        console.error('Fehler beim Löschen der Sequenz:', error);
        addMessage('error', `Sequenzlöschung fehlgeschlagen: ${error.message}`);
    }
}

/**
 * Setzt den Status einer Sequenz auf "first_stage"
 */
async function setSequenceToFirstStage(name) {
    try {
        const response = await fetch(`${CONFIG.FIREWORKS_API_URL}/${encodeURIComponent(name)}/first_stage`, {
            method: 'PATCH'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP Fehler: ${response.status}`);
        }
        
        addMessage('info', `Erste Freigabe für "${name}" aktiviert`);
        fetchFireworkSequences();
        
        // Warnung an ontime senden (30 Sekunden vor Start)
        sendMessageToOntime(`Erste Freigabe für "${name}" aktiviert (30 Sekunden verbleibend)`, 'warning');
    } catch (error) {
        console.error('Fehler bei der ersten Freigabe:', error);
        addMessage('error', `Erste Freigabe fehlgeschlagen: ${error.message}`);
        sendMessageToOntime(`Erste Freigabe für "${name}" fehlgeschlagen: ${error.message}`, 'error');
    }
}

/**
 * Setzt den Status einer Sequenz auf "second_stage"
 */
async function setSequenceToSecondStage(name) {
    try {
        const response = await fetch(`${CONFIG.FIREWORKS_API_URL}/${encodeURIComponent(name)}/second_stage`, {
            method: 'PATCH'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP Fehler: ${response.status}`);
        }
        
        addMessage('warning', `Zweite Freigabe für "${name}" aktiviert`);
        fetchFireworkSequences();
        
        // Warnung an ontime senden (10 Sekunden vor Start)
        sendMessageToOntime(`Zweite Freigabe für "${name}" aktiviert (10 Sekunden verbleibend)`, 'danger');
    } catch (error) {
        console.error('Fehler bei der zweiten Freigabe:', error);
        addMessage('error', `Zweite Freigabe fehlgeschlagen: ${error.message}`);
        sendMessageToOntime(`Zweite Freigabe für "${name}" fehlgeschlagen: ${error.message}`, 'error');
    }
}

/**
 * Startet eine Sequenz (setzt den Status auf "running")
 */
async function startSequence(name) {
    try {
        const response = await fetch(`${CONFIG.FIREWORKS_API_URL}/${encodeURIComponent(name)}/running`, {
            method: 'PATCH'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP Fehler: ${response.status}`);
        }
        
        addMessage('success', `Sequenz "${name}" gestartet`);
        fetchFireworkSequences();
    } catch (error) {
        console.error('Fehler beim Starten der Sequenz:', error);
        addMessage('error', `Sequenzstart fehlgeschlagen: ${error.message}`);
        sendMessageToOntime(`Fehler beim Starten der Sequenz "${name}": ${error.message}`, 'error');
    }
}

/**
 * Pausiert eine Sequenz
 */
async function pauseSequence(name) {
    try {
        const response = await fetch(`${CONFIG.FIREWORKS_API_URL}/${encodeURIComponent(name)}/pause`, {
            method: 'PATCH'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP Fehler: ${response.status}`);
        }
        
        addMessage('info', `Sequenz "${name}" pausiert`);
        fetchFireworkSequences();
    } catch (error) {
        console.error('Fehler beim Pausieren der Sequenz:', error);
        addMessage('error', `Sequenzpause fehlgeschlagen: ${error.message}`);
        sendMessageToOntime(`Fehler beim Pausieren der Sequenz "${name}": ${error.message}`, 'error');
    }
}

/**
 * Setzt eine pausierte Sequenz fort
 */
async function resumeSequence(name) {
    try {
        const response = await fetch(`${CONFIG.FIREWORKS_API_URL}/${encodeURIComponent(name)}/resume`, {
            method: 'PATCH'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP Fehler: ${response.status}`);
        }
        
        addMessage('success', `Sequenz "${name}" fortgesetzt`);
        fetchFireworkSequences();
    } catch (error) {
        console.error('Fehler beim Fortsetzen der Sequenz:', error);
        addMessage('error', `Sequenzfortsetzung fehlgeschlagen: ${error.message}`);
        sendMessageToOntime(`Fehler beim Fortsetzen der Sequenz "${name}": ${error.message}`, 'error');
    }
}

/**
 * Führt einen Notaus aus, indem alle laufenden Feuerwerkssequenzen gestoppt werden
 */
async function executeEmergencyStop() {
    try {
        addMessage('warning', 'NOTAUS ausgelöst!');
        
        // Sende Stopp-Befehl an die Feuerwerkssteuerung
        const response = await fetch(`${CONFIG.FIREWORKS_API_URL}/stop`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP Fehler: ${response.status}`);
        }
        
        // Sende Pause-Signal an ontime
        if (ontimeWebSocket && ontimeWebSocket.readyState === WebSocket.OPEN) {
            const data = {
                type: 'rundownControl',
                action: 'pause'
            };
            
            ontimeWebSocket.send(JSON.stringify(data));
        }
        
        // Aktualisiere die Sequenzliste
        fetchFireworkSequences();
        
        // Benachrichtigung an alle Systeme
        sendMessageToOntime('NOTAUS wurde ausgelöst! Alle Sequenzen wurden gestoppt.', 'danger');
        
    } catch (error) {
        console.error('Fehler beim Ausführen des Notaus:', error);
        addMessage('error', `Notaus fehlgeschlagen: ${error.message}`);
        
        // Sende Fehler an ontime
        sendMessageToOntime(`Notaus fehlgeschlagen: ${error.message}`, 'error');
    }
}

/**
 * Setzt das gesamte System zurück (löscht alle Sequenzen)
 */
async function resetSystem() {
    try {
        const response = await fetch(`${CONFIG.FIREWORKS_API_URL}/`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP Fehler: ${response.status}`);
        }
        
        addMessage('warning', 'System zurückgesetzt - alle Sequenzen gelöscht');
        fetchFireworkSequences();
        
        // Benachrichtigung an alle Systeme
        sendMessageToOntime('Feuerwerkssteuerung wurde zurückgesetzt', 'warning');
    } catch (error) {
        console.error('Fehler beim Zurücksetzen des Systems:', error);
        addMessage('error', `System-Reset fehlgeschlagen: ${error.message}`);
    }
}

/**
 * Rendert die Liste der Feuerwerkssequenzen
 * Fügt für jede Sequenz Aktionsbuttons hinzu, abhängig vom aktuellen Status
 */
function renderSequencesList() {
    elements.sequencesList.innerHTML = '';
    
    if (fireworkSequences.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'Keine Sequenzen verfügbar';
        elements.sequencesList.appendChild(li);
        return;
    }
    
    fireworkSequences.forEach(sequence => {
        const li = document.createElement('li');
        
        // Erstelle den Basiseintrag
        li.innerHTML = `
            <div class="sequence-info">
                <span class="sequence-name">${sequence.name}</span>
                ${createStatusTag(sequence.status)}
            </div>
            <div class="sequence-actions" data-sequence="${sequence.name}">
                <!-- Aktionsbuttons werden dynamisch erstellt -->
            </div>
        `;
        
        elements.sequencesList.appendChild(li);
        
        // Aktionsbuttons basierend auf dem Status hinzufügen
        const actionsContainer = li.querySelector('.sequence-actions');
        addSequenceActionButtons(actionsContainer, sequence);
    });
}

/**
 * Fügt die passenden Aktionsbuttons für eine Sequenz hinzu, abhängig vom Status
 */
function addSequenceActionButtons(container, sequence) {
    // Alle vorherigen Buttons entfernen
    container.innerHTML = '';
    
    const buttons = [];
    
    // Statusabhängige Buttons
    switch (sequence.status) {
        case 'saved':
            buttons.push({
                text: 'Erste Freigabe',
                action: () => setSequenceToFirstStage(sequence.name),
                class: 'btn-warning'
            });
            buttons.push({
                text: 'Löschen',
                action: () => deleteSequence(sequence.name),
                class: 'btn-danger'
            });
            break;
            
        case 'first_stage':
            buttons.push({
                text: 'Zweite Freigabe',
                action: () => setSequenceToSecondStage(sequence.name),
                class: 'btn-warning'
            });
            break;
            
        case 'second_stage':
            buttons.push({
                text: 'Starten',
                action: () => startSequence(sequence.name),
                class: 'btn-success'
            });
            break;
            
        case 'running':
            buttons.push({
                text: 'Pausieren',
                action: () => pauseSequence(sequence.name),
                class: 'btn-info'
            });
            break;
            
        case 'paused':
            buttons.push({
                text: 'Fortsetzen',
                action: () => resumeSequence(sequence.name),
                class: 'btn-success'
            });
            break;
    }
    
    // Buttons erstellen und zum Container hinzufügen
    buttons.forEach(button => {
        const btn = document.createElement('button');
        btn.textContent = button.text;
        btn.className = `btn ${button.class}`;
        btn.addEventListener('click', button.action);
        container.appendChild(btn);
    });
}

// ==========================================
// Nachrichten-System
// ==========================================

/**
 * Fügt eine neue Nachricht zur Liste hinzu
 */
function addMessage(type, text) {
    const timestamp = new Date();
    messagesList.unshift({
        type,
        text,
        timestamp
    });
    
    // Begrenze die Anzahl der Nachrichten auf 50
    if (messagesList.length > 50) {
        messagesList.pop();
    }
    
    renderMessagesList();
}

/**
 * Rendert die Nachrichtenliste
 */
function renderMessagesList() {
    elements.messagesList.innerHTML = '';
    
    messagesList.forEach(message => {
        const li = document.createElement('li');
        li.classList.add(`message-${message.type}`);
        
        li.innerHTML = `
            <span class="message-timestamp">${formatTime(message.timestamp)}</span>
            <span class="message-text">${message.text}</span>
        `;
        
        elements.messagesList.appendChild(li);
    });
}

// ==========================================
// UI-Erweiterungen
// ==========================================

/**
 * Initialisiert zusätzliche UI-Elemente
 */
function initUI() {
    // Erstelle zusätzliche UI-Elemente für die Feuerwerkssteuerung
    const fireworkSection = document.querySelector('.firework-section');
    
    // Sequenzerstellung
    const sequenceCreation = document.createElement('div');
    sequenceCreation.className = 'sequence-creation';
    sequenceCreation.innerHTML = `
        <h4>Neue Sequenz</h4>
        <div class="sequence-form">
            <input type="text" id="sequence-name-input" placeholder="Name der Sequenz">
            <button id="create-sequence-btn" class="btn btn-primary">Erstellen</button>
        </div>
    `;
    
    fireworkSection.insertBefore(sequenceCreation, fireworkSection.firstChild);
    
    // System-Reset Button
    const resetSection = document.createElement('div');
    resetSection.className = 'reset-section';
    resetSection.innerHTML = `
        <button id="reset-all-btn" class="btn btn-secondary">System zurücksetzen</button>
    `;
    
    // Füge das Reset-Element vor dem Notaus ein
    const emergencyStop = document.querySelector('.emergency-stop');
    fireworkSection.insertBefore(resetSection, emergencyStop);
    
    // DOM-Referenzen aktualisieren
    elements.sequenceNameInput = document.getElementById('sequence-name-input');
    elements.createSequenceBtn = document.getElementById('create-sequence-btn');
    elements.resetAllBtn = document.getElementById('reset-all-btn');
    
    // Event-Listener für die neuen Elemente
    elements.createSequenceBtn.addEventListener('click', handleCreateSequence);
    elements.resetAllBtn.addEventListener('click', handleResetSystem);
    
    // Stil-Anpassungen für die neuen Elemente
    const style = document.createElement('style');
    style.textContent = `
        .sequence-creation {
            margin-bottom: 15px;
            padding: 10px;
            background-color: #f8f9fa;
            border-radius: 8px;
        }
        
        .sequence-form {
            display: flex;
            gap: 10px;
            margin-top: 10px;
        }
        
        #sequence-name-input {
            flex-grow: 1;
            padding: 8px;
            border: 1px solid #ced4da;
            border-radius: 4px;
        }
        
        .reset-section {
            margin: 15px 0;
            text-align: center;
        }
        
        .btn {
            padding: 5px 10px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 600;
            font-size: 12px;
        }
        
        .btn-primary {
            background-color: #007bff;
            color: white;
        }
        
        .btn-secondary {
            background-color: #6c757d;
            color: white;
        }
        
        .btn-success {
            background-color: #28a745;
            color: white;
        }
        
        .btn-warning {
            background-color: #ffc107;
            color: #212529;
        }
        
        .btn-danger {
            background-color: #dc3545;
            color: white;
        }
        
        .btn-info {
            background-color: #17a2b8;
            color: white;
        }
        
        .sequence-actions {
            display: flex;
            gap: 5px;
        }
        
        .sequence-info {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .sequences-list li {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
    `;
    
    document.head.appendChild(style);
}

/**
 * Handler für den "Sequenz erstellen"-Button
 */
function handleCreateSequence() {
    const name = elements.sequenceNameInput.value.trim();
    if (name) {
        createSequence(name)
            .then(() => {
                elements.sequenceNameInput.value = ''; // Eingabefeld leeren
            })
            .catch(error => {
                console.error('Fehler beim Erstellen der Sequenz:', error);
            });
    } else {
        addMessage('warning', 'Bitte einen Namen für die Sequenz eingeben');
    }
}

/**
 * Handler für den "System zurücksetzen"-Button
 */
function handleResetSystem() {
    if (confirm('Möchten Sie wirklich das System zurücksetzen und alle Sequenzen löschen?')) {
        resetSystem();
    }
}

// ==========================================
// Uhr-Funktionalität
// ==========================================

/**
 * Aktualisiert die Uhrzeitanzeige
 */
function updateClock() {
    const now = new Date();
    elements.currentTime.textContent = formatTime(now);
}

// ==========================================
// Ereignisbehandlung und Initialisierung
// ==========================================

/**
 * Initialisiert alle Event-Listener
 */
function initEventListeners() {
    // Notaus-Button
    elements.emergencyStopBtn.addEventListener('click', () => {
        if (confirm('ACHTUNG: Notaus auslösen? Dies stoppt alle laufenden Sequenzen!')) {
            executeEmergencyStop();
        }
    });
}

/**
 * Initialisiert die Anwendung
 */
function init() {
    // Initialisiere zusätzliche UI-Elemente
    initUI();
    
    // Aktualisiere die Uhr
    updateClock();
    setInterval(updateClock, CONFIG.UPDATE_INTERVAL);
    
    // Initialisiere Event-Listener
    initEventListeners();
    
    // Verbinde mit ontime
    initOntimeWebSocket();
    
    // Rufe regelmäßig die Feuerwerkssequenzen ab
    fetchFireworkSequences();
    setInterval(fetchFireworkSequences, CONFIG.FIREWORKS_POLL_INTERVAL);
    
    // Initiale Nachricht
    addMessage('info', 'Musikfeuerwerk Webapp gestartet');
}

// Starte die Anwendung
document.addEventListener('DOMContentLoaded', init);