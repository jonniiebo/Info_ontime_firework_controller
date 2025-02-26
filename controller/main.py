import os
import json
import vlc
import logging
from pythonosc.dispatcher import Dispatcher
from pythonosc.osc_server import BlockingOSCUDPServer
import threading


# Logger konfigurieren
logging.basicConfig(level=logging.DEBUG, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("controller")

# Dynamische Pfadkonfiguration
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
AUDIO_DIR = os.path.join(BASE_DIR, "../audio")
MAPPING_FILE = os.path.join(BASE_DIR, "event_mapping.json")

# Globale Variablen zur Zustandsverwaltung
current_media = None   # Speichert den Namen der aktuell abgespielten Audiodatei
paused_time = {}     # Speichert den Zeitpunkt (in ms), an dem pausiert wurde

# Event-Mapping laden
def load_event_mapping():
    """Lädt das Event-Mapping aus einer JSON-Datei."""
    if not os.path.exists(MAPPING_FILE):
        logger.error("Event-Mapping-Datei nicht gefunden.")
        return {}
    try:
        with open(MAPPING_FILE, "r") as file:
            return json.load(file)
    except Exception as e:
        logger.error(f"Fehler beim Laden des Event-Mappings: {e}")
        return {}
    
EVENT_MAPPING = load_event_mapping()

# VLC-Instanz erstellen
vlc_instance = vlc.Instance("--verbose=0")
player = vlc_instance.media_player_new()

# Audio-Funktionen
def play_audio(event_id):
    """Spielt die angegebene Audiodatei mit VLC ab."""
    global current_media, paused_time

    event_title = EVENT_MAPPING.get(event_id)
   
    if event_title == "countdown":
        logger.info("Countdown wird gestartet.")
        return

    if not event_title:
        logger.error(f"Event-ID {event_id} nicht gefunden.")
        return 
    
    audio_path = os.path.abspath(os.path.join(AUDIO_DIR, f"{event_title}.mp3"))

    if not os.path.exists(audio_path):
        logger.error(f"Datei nicht gefunden: {audio_path}")
        return

    media = vlc_instance.media_new(audio_path)
    media.add_option(":no-video")  # Deaktiviert Videoverarbeitung
    media.add_option(":demux=mp3")   # Erzwinge MP3-Demuxer
    media.add_option(":file-caching=1000")  # Puffereinstellungen
    media.add_option(":audio-time-stretch")  # Aktiviert Zeitstreckung für eine bessere Synchronisation
    media.add_option(":clock-jitter=0")  # Reduziert Timing-Probleme
    player.set_media(media)

    # Eventuell pausiertes Audio fortsetzen
    if event_id in paused_time:
        resume_time = paused_time.pop(event_id) # Zeitpunkt aus Dictionary entfernen
        player.play()  # Wiedergabe starten
        player.set_time(resume_time)    # Zeitpunkt setzen
        logger.info(f"Fortsetzen von {event_title}.")
    else:
        logger.info(f"Starte {event_title}.")
        player.play()

    current_media = event_id  # Aktuellen Eventnamen speichern


def pause_audio():
    """Pausiert die Wiedergabe und speichert die aktuelle Wiedergabezeit."""
    global paused_time, current_media
    if current_media:
        try:
            paused_time[current_media] = player.get_time() # Zeitpunkt speichern
            player.pause()
            logger.info(f"Audio pausiert.")
        except Exception as e:
            logger.error(f"Fehler beim Pausieren: {e}")


def stop_audio():
    """Stoppt die Wiedergabe."""
    global current_media
    player.stop()
    if current_media in paused_time:
        del paused_time[current_media]  # Pausierte Zeit löschen
    logger.info("Audio gestoppt.")
    current_media = None

# OSC-Handler
def handle_start_event(address, *args):
    """OSC-Handler für Start-Events. Falls Event pausiert war, wird es fortgesetzt."""
    global current_media
    event_id = str(args[0])
    event_title = EVENT_MAPPING.get(event_id)

    if not event_title:
        logger.error(f"Unbekannte Event-ID: {event_id}")
        return

    current_media = event_id

    if event_title == "countdown":
        logger.info("Countdown gestartet.")
    else:
        logger.info(f"Event '{event_title}' gestartet.")
        play_audio(event_id)
    

def handle_stop_event(address, *args):
    """OSC-Handler für Stop-Events."""
    logger.info("Event gestoppt.")
    stop_audio()

def handle_pause_event(address, *args):
    """OSC-Handler für Pause-Events."""
    logger.info("Event pausiert.")
    pause_audio()

def debug_handler(address, *args):
    logger.info(f"Empfangene Nachricht: {address} mit Argumenten {args}")

# OSC-Server einrichten
def start_osc_server():
    """Startet den OSC-Server zum Empfangen von Nachrichten."""
    dispatcher = Dispatcher()
    dispatcher.map("/start", handle_start_event)
    dispatcher.map("/stop", handle_stop_event)
    dispatcher.map("/pause", handle_pause_event)

    # Debugging für alle OSC-Nachrichten
    dispatcher.set_default_handler(debug_handler)

    server = BlockingOSCUDPServer(("127.0.0.1", 9999), dispatcher)
    logger.info("OSC-Server läuft...")
    server.serve_forever()


if __name__ == "__main__":
    # Startet den OSC-Server in einem separaten Thread
    osc_thread = threading.Thread(target=start_osc_server, daemon=True)
    osc_thread.start()

    # Halte das Hauptprogramm aktiv (hier könntest du z.B. threading.Event().wait() verwenden)
    try:
        while True:
            pass
    except KeyboardInterrupt:
        logger.info("Programm beendet.")
        stop_audio()