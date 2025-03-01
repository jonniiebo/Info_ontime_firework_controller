import os
import json
import vlc
import logging
import threading
import requests
import time
from datetime import datetime
from pythonosc.dispatcher import Dispatcher
from pythonosc.osc_server import BlockingOSCUDPServer
from pythonosc.udp_client import SimpleUDPClient

# Logger konfigurieren
logging.basicConfig(level=logging.DEBUG, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("feuerwerk-controller")

# Dynamische Pfadkonfiguration
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO_DIR = os.path.join(BASE_DIR, "audio")
MAPPING_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "event_mapping.json")

# Konfiguration für Feuerwerkssteuerung
FIREWORK_API_URL = "http://localhost:8000"  # Anpassen an tatsächliche URL des Simulators
OSC_SERVER_HOST = "127.0.0.1"
OSC_SERVER_PORT = 4001
OSC_CLIENT_HOST = "127.0.0.1"
OSC_CLIENT_PORT = 4001  # Port für ontime OSC-Nachrichten

# Globale Variablen zur Zustandsverwaltung
current_event_id = None
player = None
paused_time = {}
event_to_sequence = {}  # Mapping von Event-IDs zu Feuerwerkssequenzen
warning_events = {}  # Speichert Events, die in der Warnzeit sind
danger_events = {}   # Speichert Events, die in der Gefahrenzeit sind
osc_client = None    # OSC-Client für das Senden von Nachrichten an ontime

# Initialisierung des OSC-Clients
def init_osc_client():
    global osc_client
    osc_client = SimpleUDPClient(OSC_CLIENT_HOST, OSC_CLIENT_PORT)
    logger.info(f"OSC-Client initialisiert: {OSC_CLIENT_HOST}:{OSC_CLIENT_PORT}")

# Event-Mapping laden oder erstellen
def load_event_mapping():
    """Lädt das Event-Mapping aus einer JSON-Datei oder erstellt ein Standard-Mapping."""
    if not os.path.exists(MAPPING_FILE):
        logger.warning("Event-Mapping-Datei nicht gefunden. Erstelle Standard-Mapping.")
        return create_default_mapping()
    
    try:
        with open(MAPPING_FILE, "r") as file:
            mapping = json.load(file)
            logger.info(f"Event-Mapping geladen: {mapping}")
            return mapping
    except Exception as e:
        logger.error(f"Fehler beim Laden des Event-Mappings: {e}")
        return create_default_mapping()

# Standard-Mapping erstellen
def create_default_mapping():
    """Erstellt ein Standard-Mapping für Events und Sequenzen."""
    # Mapping für Audiodateien
    audio_mapping = {
        "fd2c87": "countdown",
        "085ba2": "Audio1",
        "5d9e5a": "Audio2",
        "499c46": "Audio3",
        "5851a5": "Audio4"
    }
    
    # Mapping für Feuerwerkssequenzen
    global event_to_sequence
    event_to_sequence = {
        "fd2c87": "countdown",
        "085ba2": "sequence1",
        "5d9e5a": "sequence2",
        "499c46": "sequence3",
        "5851a5": "sequence4"
    }
    
    # Speichern des Mappings
    try:
        with open(MAPPING_FILE, "w") as file:
            json.dump(audio_mapping, file, indent=2)
        logger.info(f"Standard-Mapping erstellt und in {MAPPING_FILE} gespeichert.")
    except Exception as e:
        logger.error(f"Fehler beim Erstellen des Standard-Mappings: {e}")
    
    return audio_mapping

# Feuerwerk-API-Funktionen
def initialize_firework_system():
    """Initialisiert das Feuerwerksystem durch Löschen aller Sequenzen und Erstellen neuer Sequenzen."""
    try:
        # Reset aller Sequenzen
        requests.delete(f"{FIREWORK_API_URL}/")
        logger.info("Feuerwerksystem zurückgesetzt.")
        
        # Sequenzen für jedes Event erstellen
        for event_id, sequence_name in event_to_sequence.items():
            if sequence_name != "countdown":  # Kein Feuerwerk für Countdown
                response = requests.post(f"{FIREWORK_API_URL}/?name={sequence_name}")
                if response.status_code == 200:
                    logger.info(f"Feuerwerkssequenz '{sequence_name}' erstellt.")
                else:
                    logger.warning(f"Fehler beim Erstellen der Sequenz '{sequence_name}': {response.status_code}")
        
        return True
    except requests.RequestException as e:
        logger.error(f"Fehler bei der Initialisierung des Feuerwerksystems: {e}")
        send_error_to_ontime(f"Fehler bei der Initialisierung des Feuerwerksystems: {str(e)}")
        return False

def start_firework_sequence(sequence_name):
    """Startet eine Feuerwerkssequenz."""
    if sequence_name == "countdown":
        logger.info("Kein Feuerwerk für Countdown.")
        return True
    
    try:
        # Versuche die Sequenz zu starten
        response = requests.patch(f"{FIREWORK_API_URL}/{sequence_name}/running")
        if response.status_code == 200:
            logger.info(f"Feuerwerkssequenz '{sequence_name}' gestartet.")
            return True
        else:
            error_msg = f"Fehler beim Starten der Sequenz '{sequence_name}': Status {response.status_code}"
            logger.error(error_msg)
            if response.status_code >= 500:
                send_error_to_ontime(error_msg)
            return False
    except requests.RequestException as e:
        error_msg = f"Verbindungsfehler beim Starten der Sequenz '{sequence_name}': {str(e)}"
        logger.error(error_msg)
        send_error_to_ontime(error_msg)
        return False

def pause_firework_sequence(sequence_name):
    """Pausiert eine Feuerwerkssequenz."""
    if sequence_name == "countdown":
        return True
    
    try:
        response = requests.patch(f"{FIREWORK_API_URL}/{sequence_name}/pause")
        if response.status_code == 200:
            logger.info(f"Feuerwerkssequenz '{sequence_name}' pausiert.")
            return True
        else:
            error_msg = f"Fehler beim Pausieren der Sequenz '{sequence_name}': Status {response.status_code}"
            logger.error(error_msg)
            if response.status_code >= 500:
                send_error_to_ontime(error_msg)
            return False
    except requests.RequestException as e:
        error_msg = f"Verbindungsfehler beim Pausieren der Sequenz '{sequence_name}': {str(e)}"
        logger.error(error_msg)
        send_error_to_ontime(error_msg)
        return False

def resume_firework_sequence(sequence_name):
    """Setzt eine pausierte Feuerwerkssequenz fort."""
    if sequence_name == "countdown":
        return True
    
    try:
        response = requests.patch(f"{FIREWORK_API_URL}/{sequence_name}/resume")
        if response.status_code == 200:
            logger.info(f"Feuerwerkssequenz '{sequence_name}' fortgesetzt.")
            return True
        else:
            error_msg = f"Fehler beim Fortsetzen der Sequenz '{sequence_name}': Status {response.status_code}"
            logger.error(error_msg)
            if response.status_code >= 500:
                send_error_to_ontime(error_msg)
            return False
    except requests.RequestException as e:
        error_msg = f"Verbindungsfehler beim Fortsetzen der Sequenz '{sequence_name}': {str(e)}"
        logger.error(error_msg)
        send_error_to_ontime(error_msg)
        return False

def stop_firework_sequence():
    """Stoppt alle laufenden Feuerwerkssequenzen."""
    try:
        response = requests.post(f"{FIREWORK_API_URL}/stop")
        if response.status_code == 200:
            logger.info("Feuerwerkssequenz gestoppt.")
            return True
        else:
            error_msg = f"Fehler beim Stoppen der Sequenz: Status {response.status_code}"
            logger.error(error_msg)
            if response.status_code >= 500:
                send_error_to_ontime(error_msg)
            return False
    except requests.RequestException as e:
        error_msg = f"Verbindungsfehler beim Stoppen der Sequenz: {str(e)}"
        logger.error(error_msg)
        send_error_to_ontime(error_msg)
        return False

def first_stage_approval(sequence_name):
    """Erste Freigabestufe für eine Feuerwerkssequenz."""
    if sequence_name == "countdown":
        return True
    
    try:
        response = requests.patch(f"{FIREWORK_API_URL}/{sequence_name}/first_stage")
        if response.status_code == 200:
            logger.info(f"Erste Freigabestufe für Sequenz '{sequence_name}' aktiviert.")
            return True
        else:
            error_msg = f"Fehler bei der ersten Freigabestufe für '{sequence_name}': Status {response.status_code}"
            logger.error(error_msg)
            if response.status_code >= 500:
                send_error_to_ontime(error_msg)
            return False
    except requests.RequestException as e:
        error_msg = f"Verbindungsfehler bei der ersten Freigabestufe für '{sequence_name}': {str(e)}"
        logger.error(error_msg)
        send_error_to_ontime(error_msg)
        return False

def second_stage_approval(sequence_name):
    """Zweite Freigabestufe für eine Feuerwerkssequenz."""
    if sequence_name == "countdown":
        return True
    
    try:
        response = requests.patch(f"{FIREWORK_API_URL}/{sequence_name}/second_stage")
        if response.status_code == 200:
            logger.info(f"Zweite Freigabestufe für Sequenz '{sequence_name}' aktiviert.")
            return True
        else:
            error_msg = f"Fehler bei der zweiten Freigabestufe für '{sequence_name}': Status {response.status_code}"
            logger.error(error_msg)
            if response.status_code >= 500:
                send_error_to_ontime(error_msg)
            return False
    except requests.RequestException as e:
        error_msg = f"Verbindungsfehler bei der zweiten Freigabestufe für '{sequence_name}': {str(e)}"
        logger.error(error_msg)
        send_error_to_ontime(error_msg)
        return False

def send_error_to_ontime(error_message):
    """Sendet eine Fehlermeldung an ontime via OSC."""
    if osc_client:
        try:
            current_time = datetime.now().strftime("%H:%M:%S")
            message = f"[{current_time}] FEHLER: {error_message}"
            osc_client.send_message("/message", message)
            logger.info(f"Fehlermeldung an ontime gesendet: {message}")
        except Exception as e:
            logger.error(f"Fehler beim Senden der Fehlermeldung an ontime: {e}")

# VLC-Instanz erstellen
def initialize_vlc():
    """Initialisiert die VLC-Instanz und gibt den Player zurück."""
    vlc_instance = vlc.Instance("--verbose=0")
    return vlc_instance.media_player_new()

# Audio-Funktionen
def play_audio(event_id):
    """Spielt die zum Event passende Audiodatei ab."""
    global current_event_id, player
    
    event_mapping = load_event_mapping()
    audio_name = event_mapping.get(event_id)
    
    if not audio_name:
        logger.error(f"Keine Audio-Datei für Event-ID {event_id} gefunden.")
        return
    
    # Für Countdown kein Audio abspielen
    if audio_name == "countdown":
        logger.info(f"Countdown gestartet - kein Audio.")
        current_event_id = event_id
        return
    
    # Pfad zur Audiodatei
    audio_path = os.path.join(AUDIO_DIR, f"{audio_name}.mp3")
    
    if not os.path.exists(audio_path):
        logger.error(f"Audiodatei nicht gefunden: {audio_path}")
        return
    
    # VLC-Instance erstellen, falls noch nicht vorhanden
    if player is None:
        player = initialize_vlc()
    
    # Neue Media-Instance erstellen
    vlc_instance = vlc.Instance()
    media = vlc_instance.media_new(audio_path)
    player.set_media(media)
    
    # Wiedergabeposition wiederherstellen, falls Event pausiert war
    if event_id in paused_time:
        time_position = paused_time[event_id]
        player.play()
        player.set_time(time_position)
        logger.info(f"Setze Audio {audio_name} fort von Position {time_position}ms")
        del paused_time[event_id]  # Eintrag aus paused_time entfernen
    else:
        player.play()
        logger.info(f"Starte Audio {audio_name}")
    
    current_event_id = event_id

def pause_audio():
    """Pausiert die aktuelle Audiowiedergabe."""
    global current_event_id, player
    
    if player and current_event_id:
        if player.is_playing():
            current_time = player.get_time()
            paused_time[current_event_id] = current_time
            player.pause()
            logger.info(f"Audio pausiert bei Position {current_time}ms")
        else:
            logger.info("Audio bereits pausiert oder nicht aktiv")

def stop_audio():
    """Stoppt die Audiowiedergabe."""
    global current_event_id, player
    
    if player:
        player.stop()
        logger.info("Audio gestoppt")
        
    # Reset des aktuellen Event-ID und Entfernen aus paused_time
    if current_event_id in paused_time:
        del paused_time[current_event_id]
    
    current_event_id = None

# OSC-Handler
def handle_start_event(address, *args):
    """Behandelt Start-Ereignisse von ontime."""
    if len(args) > 0:
        event_id = args[0]
        logger.info(f"Start-Event empfangen für Event-ID: {event_id}")
        
        # Audio abspielen
        play_audio(event_id)
        
        # Feuerwerk starten
        sequence_name = event_to_sequence.get(event_id)
        if sequence_name:
            start_firework_sequence(sequence_name)
    else:
        logger.warning("Start-Event ohne Event-ID empfangen")

def handle_pause_event(address, *args):
    """Behandelt Pause-Ereignisse von ontime."""
    global current_event_id
    
    logger.info("Pause-Event empfangen")
    
    # Audio pausieren
    pause_audio()
    
    # Feuerwerk pausieren
    if current_event_id:
        sequence_name = event_to_sequence.get(current_event_id)
        if sequence_name:
            pause_firework_sequence(sequence_name)

def handle_stop_event(address, *args):
    """Behandelt Stop-Ereignisse von ontime."""
    logger.info("Stop-Event empfangen")
    
    # Audio stoppen
    stop_audio()
    
    # Feuerwerk stoppen
    stop_firework_sequence()

def handle_resume_event(address, *args):
    """Behandelt Resume-Ereignisse von ontime."""
    global current_event_id
    
    logger.info("Resume-Event empfangen")
    
    # Audio fortsetzen (wird automatisch durch play_audio gemacht)
    if current_event_id:
        play_audio(current_event_id)
        
        # Feuerwerk fortsetzen
        sequence_name = event_to_sequence.get(current_event_id)
        if sequence_name:
            resume_firework_sequence(sequence_name)

def handle_warning_event(address, *args):
    """Behandelt Warning-Ereignisse von ontime für die erste Freigabestufe."""
    if len(args) > 0:
        event_id = args[0]
        logger.info(f"Warning-Event empfangen für Event-ID: {event_id}")
        
        # Erste Freigabestufe aktivieren
        sequence_name = event_to_sequence.get(event_id)
        if sequence_name and sequence_name != "countdown":
            warning_events[event_id] = True
            first_stage_approval(sequence_name)

def handle_danger_event(address, *args):
    """Behandelt Danger-Ereignisse von ontime für die zweite Freigabestufe."""
    if len(args) > 0:
        event_id = args[0]
        logger.info(f"Danger-Event empfangen für Event-ID: {event_id}")
        
        # Zweite Freigabestufe aktivieren, aber nur wenn die erste bereits aktiviert wurde
        if event_id in warning_events:
            sequence_name = event_to_sequence.get(event_id)
            if sequence_name and sequence_name != "countdown":
                danger_events[event_id] = True
                second_stage_approval(sequence_name)

def default_handler(address, *args):
    """Gibt alle empfangenen OSC-Nachrichten aus."""
    logger.debug(f"OSC-Nachricht empfangen: {address} {args}")

# OSC-Server einrichten
def start_osc_server():
    """Startet den OSC-Server zum Empfang von Befehlen von ontime."""
    dispatcher = Dispatcher()
    
    # OSC-Befehle registrieren
    dispatcher.map("/start", handle_start_event)
    dispatcher.map("/pause", handle_pause_event)
    dispatcher.map("/stop", handle_stop_event)
    dispatcher.map("/resume", handle_resume_event)
    dispatcher.map("/warning", handle_warning_event)
    dispatcher.map("/danger", handle_danger_event)
    
    # Default-Handler für alle anderen Nachrichten
    dispatcher.set_default_handler(default_handler)
    
    # Server starten
    server = BlockingOSCUDPServer((OSC_SERVER_HOST, OSC_SERVER_PORT), dispatcher)
    logger.info(f"OSC-Server gestartet und hört auf {OSC_SERVER_HOST}:{OSC_SERVER_PORT}")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("OSC-Server beendet")
    except Exception as e:
        logger.error(f"Fehler im OSC-Server: {e}")

if __name__ == "__main__":
    # Initialisiere OSC-Client
    init_osc_client()
    
    # Überprüfe Audio-Verzeichnis
    if not os.path.exists(AUDIO_DIR):
        logger.warning(f"Audio-Verzeichnis nicht gefunden: {AUDIO_DIR}")
    else:
        logger.info(f"Audio-Verzeichnis gefunden: {AUDIO_DIR}")
        # Liste alle MP3-Dateien im Audio-Verzeichnis auf
        audio_files = [f for f in os.listdir(AUDIO_DIR) if f.endswith(".mp3")]
        logger.info(f"Gefundene Audiodateien: {audio_files}")
    
    # Lade Event-Mapping und Sequenzen
    event_mapping = load_event_mapping()
    
    # Initialisiere Feuerwerksystem
    if not initialize_firework_system():
        logger.error("Fehler bei der Initialisierung des Feuerwerksystems. Programm wird beendet.")
        exit(1)
    
    # Starte OSC-Server in einem separaten Thread
    logger.info("Starte Feuerwerk- und Audio-Controller...")
    osc_thread = threading.Thread(target=start_osc_server, daemon=True)
    osc_thread.start()
    
    # Hauptprogramm aktiv halten
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    
    logger.info("Feuerwerk- und Audio-Controller wird beendet.")
    stop_audio()
    stop_firework_sequence()