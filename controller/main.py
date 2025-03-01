import os                                                          
import vlc
import httpx
import logging
import threading
<<<<<<< HEAD
import requests
import time
from datetime import datetime

# Logger konfigurieren
logging.basicConfig(level=logging.DEBUG, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("audio-controller")
=======
from pythonosc.dispatcher import Dispatcher
from pythonosc.osc_server import BlockingOSCUDPServer
from pythonosc.udp_client import SimpleUDPClient


### Logger konfigurieren
# Logger Controller
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("controller")
>>>>>>> 7a6ebc35b9b1745ba0854950ed38d6633a6610cf


# Dynamische Pfadkonfiguration
<<<<<<< HEAD
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO_DIR = os.path.join(BASE_DIR, "audio")
MAPPING_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "event_mapping.json")

# Konfiguration für ontime API
ONTIME_API_URL = "http://localhost:4001/api"
POLL_INTERVAL = 0.5  # Abfrageintervall in Sekunden

# Globale Variablen zur Zustandsverwaltung
current_event_index = None  # Statt Event-ID verwenden wir den Index
current_playback_state = None  # 'play', 'pause', 'stop'
player = None
audio_files = {}  # Mapping zwischen Event-Index und Audiodatei

# VLC-Instanz erstellen
def initialize_vlc():
    """Initialisiert die VLC-Instanz und gibt den Player zurück."""
    vlc_instance = vlc.Instance("--verbose=0")
    return vlc_instance.media_player_new()

# Audio-Mapping erstellen
def create_audio_mapping():
    """Erstellt ein Mapping zwischen Event-Indizes und Audiodateien."""
    # In diesem einfachen Beispiel ordnen wir Audiodateien direkt den Indizes zu
    mapping = {
        0: None,  # Countdown (kein Audio)
        1: "Audio1.mp3",
        2: "Audio2.mp3",
        3: "Audio3.mp3",
        4: "Audio4.mp3",
        5: "Audio5.mp3"
    }
    
    logger.info(f"Audio-Mapping erstellt: {mapping}")
    return mapping

# Audio-Funktionen
def play_audio(event_index):
    """Spielt die zum Event passende Audiodatei ab."""
    global current_event_index, player
    
    # Wenn es der Countdown ist (Index 0), spielen wir kein Audio ab
    if event_index == 0:
        logger.info(f"Countdown (Index {event_index}) - kein Audio")
        current_event_index = event_index
=======
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
AUDIO_DIR = os.path.join(BASE_DIR, "../audio")

# API-URL des Simulators
SIMULATOR_URL = "http://127.0.0.1:8000"

# Globale Variablen zur Zustandsverwaltung
current_media = None
paused_time = {}
next_event = None

# VLC-Instanz erstellen
vlc_instance = vlc.Instance("--quiet", "--verbose=0")
player = vlc_instance.media_player_new()


# OSC-Nachricht an OnTime senden
def send_osc_message(address, message):
    """Sendet eine OSC-Nachricht an OnTime."""
    client = SimpleUDPClient("127.0.0.1", 8888)  # Port auf dem OnTime lauscht
    client.send_message(address, message)
    logger.info(f"OSC-Nachricht an OnTime gesendet: {address} -> {message}")


# API-Request senden mit httpx
def send_fireworks_request(endpoint, method="PATCH", sequence_name=None):
    """Sendet eine Anfrage an die Feuerwerkssteuerung."""
    url = f"{SIMULATOR_URL}/{sequence_name}/{endpoint}" if sequence_name else f"{SIMULATOR_URL}/{endpoint}"
    try:
        response = httpx.request(method, url, timeout=5)
        
        # HTTP-Responses nur in die Log-Datei, NICHT in die Konsole
        logger.info(f"{method} {url} - Status: {response.status_code} - Antwort: {response.text}")

        # Falls ein HTTP-Fehler auftritt, zusätzlich als ERROR ins Terminal
        if response.status_code >= 400:
            logger.error(f"Fehler bei Feuerwerkssteuerung: {response.status_code}, {response.text}")
            send_osc_message("/ontime/stop", f"Fehler: HTTP {response.status_code} für {sequence_name}")
            return None  # Fehler, Rückgabe ist None

        return response
    except httpx.RequestError as e:
        logger.error(f"Feuerwerks-API nicht erreichbar: {e}")
        send_osc_message("/ontime/stop", "Feuerwerkssystem nicht erreichbar!")
        return None


# Sequenzen initialisieren
def initialize_sequences():
    """Setzt alle Sequenzen neu auf."""
    logger.info("Setze Sequenzen zurück & initialisiere sie...")
    httpx.delete(f"{SIMULATOR_URL}/")  # Alle Sequenzen zurücksetzen

    for name in ["Audio1", "Audio2", "Audio3", "Audio4"]:
        response = httpx.post(f"{SIMULATOR_URL}/?name={name}")
        if response.status_code == 200:
            logger.info(f"Sequenz '{name}' erfolgreich erstellt.")
        else:
            logger.error(f"Fehler beim Erstellen von '{name}': {response.json()}")


# Audio- & Feuerwerkssteuerung
def play_audio(event_title):
    """Spielt eine Audiodatei ab & startet die Feuerwerkssequenz."""
    global current_media, paused_time

    if event_title == "countdown":
        logger.info("Countdown gestartet (keine Musik, nur Sequenzwechsel).")
        return

    audio_path = os.path.abspath(os.path.join(AUDIO_DIR, f"{event_title}.mp3"))
    if not os.path.exists(audio_path):
        logger.error(f"Datei nicht gefunden: {audio_path}")
>>>>>>> 7a6ebc35b9b1745ba0854950ed38d6633a6610cf
        return
    
    # Audiodatei basierend auf dem Event-Index ermitteln
    audio_file = audio_files.get(event_index)
    
    if not audio_file:
        logger.error(f"Keine Audio-Datei für Event-Index {event_index} gefunden.")
        return
    
    # Pfad zur Audiodatei
    audio_path = os.path.join(AUDIO_DIR, audio_file)
    
    if not os.path.exists(audio_path):
        logger.error(f"Audiodatei nicht gefunden: {audio_path}")
        return
    
    # VLC-Instance erstellen, falls noch nicht vorhanden
    if player is None:
        player = initialize_vlc()
    
    # Neue Media-Instance erstellen
    vlc_instance = vlc.Instance()
    media = vlc_instance.media_new(audio_path)
<<<<<<< HEAD
    player.set_media(media)
    
    # Audio abspielen
    player.play()
    logger.info(f"Starte Audio {audio_file} für Event-Index {event_index}")
    
    current_event_index = event_index

def pause_audio():
    """Pausiert die aktuelle Audiowiedergabe."""
    global player
    
    if player and player.is_playing():
        player.pause()
        logger.info("Audio pausiert")
    else:
        logger.info("Kein Audio zum Pausieren oder bereits pausiert")

def resume_audio():
    """Setzt pausierte Audiowiedergabe fort."""
    global player
    
    if player:
        player.play()
        logger.info("Audio fortgesetzt")
    else:
        logger.info("Kein Audio zum Fortsetzen")

def stop_audio():
    """Stoppt die Audiowiedergabe."""
    global player, current_event_index
    
    if player:
        player.stop()
        logger.info("Audio gestoppt")
    
    current_event_index = None

# Ontime HTTP API-Funktionen
def poll_ontime_status():
    """Fragt den aktuellen Status von ontime ab."""
    try:
        response = requests.get(f"{ONTIME_API_URL}/poll")
        if response.status_code == 200 or response.status_code == 202:
            data = response.json()
            if "payload" in data:
                return data["payload"]
        return None
    except requests.RequestException as e:
        logger.error(f"Fehler beim Abfragen des ontime-Status: {e}")
        return None
=======
    media.add_option(":no-video")
    player.set_media(media)

    current_media = event_title


# OSC-Event-Handler
def handle_start_event(address, *args):
    """Startet das Event. Falls vorheriges Event läuft, wird es gestoppt."""
    global paused_time, current_media
    event_title = str(args[0])
   
    if event_title == "countdown":
        logger.info("Countdown gestartet.")  # Countdown hat keine eigene Sequenz
        return

    # Falls Event pausiert war, fortsetzen
    if current_media == event_title and current_media in paused_time:
        send_fireworks_request("resume", "PATCH", event_title)
        resume_time = paused_time.pop(current_media)
        player.play()
        player.set_time(resume_time)
        logger.info(f"Audio {current_media} wird bei {resume_time} ms fortgesetzt.")
        return

    # Falls ein anderes Event läuft, zuerst stoppen
    if current_media and current_media != event_title:
        logger.info(f"Stoppe Event '{current_media}' bevor '{event_title}' gestartet wird.")
        url = f"{SIMULATOR_URL}/stop"
        httpx.post(url)  # Feuerwerkssequenz stoppen
        response = httpx.get(f"{SIMULATOR_URL}/{current_media}")
        if response.status_code == 200:
            logger.info(f"Feuerwerkssequenz {current_media} gestopt.")
        logger.info(f"Audio {current_media} gestoppt.")
        current_media = None
        

    # Prüfen, ob `second_stage` aktiv ist
    response = httpx.get(f"{SIMULATOR_URL}/{event_title}")
    if response.status_code == 200:
        status = response.json().get("status", "")
        if status in ["second_stage", "paused"]:
            send_fireworks_request("running", "PATCH", event_title)
            logger.info(f"Feuerwerkssequenz {event_title} läuft jetzt.")
            play_audio(event_title)
            player.play()
            logger.info(f"Audio {event_title} gestartet.")  # Audio-Datei abspielen
        else:
            logger.warning(f"Event {event_title} kann nicht gestartet werden, da `second_stage` fehlt.")
            send_osc_message("/ontime/stop", f"Fehler: {event_title} ist nicht `second_stage`.")
    else:
        logger.error(f"Konnte den Status von {event_title} nicht abrufen.")
        send_osc_message("/ontime/stop", f"Fehler beim Abruf von {event_title}.")


def handle_stop_event(address, *args):
    """OSC-Handler für Stop-Events."""
    global current_media

    logger.info("Event gestoppt.")

    if current_media:
        url = f"{SIMULATOR_URL}/stop"
        httpx.post(url) # Feuerwerkssequenz stoppen
        player.stop()
        logger.info(f"Audio {current_media} gestoppt.")
        current_media = None

    httpx.delete(f"{SIMULATOR_URL}/")
    initialize_sequences()


def handle_pause_event(address, *args):
    """OSC-Handler für Pause-Events."""
    global paused_time, current_media
    logger.info("Event pausiert.")

    if current_media:
        paused_time[current_media] = player.get_time()
        player.pause()
        logger.info(f"Audio {current_media} pausiert.")

    send_fireworks_request("pause", "PATCH", current_media)


def handle_next_event(address, *args):
    """Setzt das nächste Event für `first_stage` oder `second_stage`."""
    global next_event
    next_event = str(args[0])
    logger.info(f"Nächstes Event gesetzt: {next_event}")


def handle_first_stage_event(address, *args):
    """Setzt das nächste Event in die First Stage."""
    global next_event
    if next_event:
        logger.info(f"Setze '{next_event}' auf first_stage.")
        send_fireworks_request("first_stage", "PATCH", next_event)
    else:
        logger.warning("Kein `next_event` gesetzt – `/first_stage` wurde ignoriert.")


def handle_second_stage_event(address, *args):
    """Setzt das nächste Event in die Second Stage."""
    global next_event
    if next_event:
        logger.info(f"Setze '{next_event}' auf second_stage.")
        send_fireworks_request("second_stage", "PATCH", next_event)
    else:
        logger.warning("Kein `next_event` gesetzt – `/second_stage` wurde ignoriert.")

def handle_length_event(address, *args):
    """Setzt die Länge der Sequenz."""
    length = int(args[0])
    length = length/1000
    logger.info(f"Setze Länge der Sequenz auf {length} Sekunden.")

def ui_startup():
    """Startet die UI."""
    os.system("python app.py")
    logger.info("UI gestartet.")
        
# OSC-Server starten
def start_osc_server():
    dispatcher = Dispatcher()
    dispatcher.map("/stop", handle_stop_event)
    dispatcher.map("/start", handle_start_event)
    dispatcher.map("/pause", handle_pause_event)
    dispatcher.map("/next_event", handle_next_event)
    dispatcher.map("/first_stage", handle_first_stage_event)
    dispatcher.map("/second_stage", handle_second_stage_event)
    server = BlockingOSCUDPServer(("127.0.0.1", 9999), dispatcher)
    logger.info("OSC-Server läuft...")
    server.serve_forever()
>>>>>>> 7a6ebc35b9b1745ba0854950ed38d6633a6610cf

def check_for_events():
    """Überwacht den ontime-Status und reagiert auf Änderungen."""
    global current_event_index, current_playback_state
    
    while True:
        try:
            status = poll_ontime_status()
            
            if status:
                # Wir verwenden den selectedEventIndex statt einer Event-ID
                new_event_index = status.get("runtime", {}).get("selectedEventIndex")
                new_playback_state = status.get("timer", {}).get("playback")
                
                logger.debug(f"Status: Index={new_event_index}, Playback={new_playback_state}")
                
                # Auf Änderungen im Event-Index reagieren
                if new_event_index is not None and new_event_index != current_event_index:
                    logger.info(f"Neues Event erkannt: Index {new_event_index}")
                    
                    # Altes Audio stoppen, falls eins läuft
                    if current_event_index is not None:
                        stop_audio()
                    
                    # Neues Audio starten, wenn der Playback-Status "play" ist
                    if new_playback_state == "play":
                        play_audio(new_event_index)
                    
                    current_event_index = new_event_index
                
                # Auf Änderungen im Playback-Status reagieren
                if new_playback_state != current_playback_state:
                    logger.info(f"Playback-Status geändert: {current_playback_state} -> {new_playback_state}")
                    
                    if new_playback_state == "play" and current_playback_state == "pause":
                        # Event wurde fortgesetzt
                        resume_audio()
                    elif new_playback_state == "pause":
                        # Event wurde pausiert
                        pause_audio()
                    elif new_playback_state == "stop":
                        # Event wurde gestoppt
                        stop_audio()
                    
                    current_playback_state = new_playback_state
        
        except Exception as e:
            logger.error(f"Fehler beim Überwachen des ontime-Status: {e}")
        
        # Kurze Pause vor der nächsten Abfrage
        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
<<<<<<< HEAD
    # Überprüfe Audio-Verzeichnis
    if not os.path.exists(AUDIO_DIR):
        logger.warning(f"Audio-Verzeichnis nicht gefunden: {AUDIO_DIR}")
        # Versuche, das Verzeichnis zu erstellen
        try:
            os.makedirs(AUDIO_DIR)
            logger.info(f"Audio-Verzeichnis erstellt: {AUDIO_DIR}")
        except Exception as e:
            logger.error(f"Fehler beim Erstellen des Audio-Verzeichnisses: {e}")
    else:
        logger.info(f"Audio-Verzeichnis gefunden: {AUDIO_DIR}")
        # Liste alle MP3-Dateien im Audio-Verzeichnis auf
        found_files = [f for f in os.listdir(AUDIO_DIR) if f.endswith(".mp3")]
        logger.info(f"Gefundene Audiodateien: {found_files}")
    
    # Audio-Mapping erstellen
    audio_files = create_audio_mapping()
    
    # Starte die Überwachung der ontime-Events in einem separaten Thread
    logger.info("Starte Audio-Controller...")
    polling_thread = threading.Thread(target=check_for_events, daemon=True)
    polling_thread.start()
    
    # Hauptprogramm aktiv halten
=======
    logger.info("Initialisiere Sequenzen und starte OSC-Server...")
    ui_startup()
    initialize_sequences()
    osc_thread = threading.Thread(target=start_osc_server, daemon=True)
    osc_thread.start()


>>>>>>> 7a6ebc35b9b1745ba0854950ed38d6633a6610cf
    try:
        print("Audio-Controller läuft! Drücken Sie Strg+C zum Beenden...")
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
<<<<<<< HEAD
        pass
    
    logger.info("Audio-Controller wird beendet.")
    stop_audio()
=======
        logger.info("Programm beendet.")
>>>>>>> 7a6ebc35b9b1745ba0854950ed38d6633a6610cf
