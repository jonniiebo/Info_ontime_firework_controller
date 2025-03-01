const WebSocket = require('ws');

// Konfiguration
const config = {
    ontimeWsUrl: 'ws://localhost:4001/ws',  // Ändern Sie dies entsprechend
    pollInterval: 2000  // Poll alle 2 Sekunden
};

console.log(`Versuche, eine Verbindung zu ${config.ontimeWsUrl} herzustellen...`);

// WebSocket-Verbindung herstellen
const ws = new WebSocket(config.ontimeWsUrl);

ws.on('open', function open() {
    console.log('Verbindung hergestellt!');
    
    // Version abfragen
    console.log('Sende Versionanfrage...');
    ws.send(JSON.stringify({ type: 'version' }));
    
    // Regelmäßig Daten abfragen
    console.log(`Starte Polling alle ${config.pollInterval}ms...`);
    setInterval(() => {
        console.log('Sende Poll-Anfrage...');
        ws.send(JSON.stringify({ type: 'poll' }));
    }, config.pollInterval);
});

ws.on('message', function incoming(data) {
    console.log('Empfangene Nachricht:');
    
    try {
        const parsedData = JSON.parse(data);
        console.log(JSON.stringify(parsedData, null, 2));
        
        // Spezifische Informationen extrahieren
        if (parsedData.type === 'poll' && parsedData.payload) {
            // Events extrahieren, falls vorhanden
            if (parsedData.payload.rundown && parsedData.payload.rundown.events) {
                console.log(`\nGefundene Events: ${parsedData.payload.rundown.events.length}`);
                parsedData.payload.rundown.events.forEach((event, index) => {
                    console.log(`Event ${index}: ID=${event.id}, Titel=${event.title}`);
                });
            } else {
                console.log('\nKeine Events gefunden in der Antwort');
            }
            
            // Timer-Informationen
            if (parsedData.payload.timer) {
                console.log(`\nTimer-Status: ${parsedData.payload.timer.playback}`);
                console.log(`Aktuelle Zeit: ${parsedData.payload.timer.current}ms`);
            }
        }
    } catch (error) {
        console.error('Fehler beim Parsen der Nachricht:', error);
        console.log('Rohdaten:', data);
    }
});

ws.on('error', function error(err) {
    console.error('WebSocket-Fehler:', err);
});

ws.on('close', function close(code, reason) {
    console.log(`Verbindung geschlossen. Code: ${code}, Grund: ${reason || 'Kein Grund angegeben'}`);
    process.exit(1);
});

// Damit das Skript nicht sofort beendet wird
process.on('SIGINT', function() {
    console.log('Beende Skript...');
    ws.close();
    process.exit(0);
});