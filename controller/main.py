import os
import json
import vlc
import logging
import threading
import requests
import time
from datetime import datetime

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("audio-controller")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO_DIR = os.path.join(BASE_DIR, "audio")
MAPPING_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "event_mapping.json")

ONTIME_API_URL = "http://localhost:4001/api"
POLL_INTERVAL = 0.5  

current_event_index = None  
current_playback_state = None  
player = None
audio_files = {}  

def initialize_vlc():
    """Initialisiert die VLC-Instanz und gibt den Player zurück."""
    vlc_instance = vlc.Instance("--verbose=0")
    return vlc_instance.media_player_new()

def create_audio_mapping():
    """Erstellt ein Mapping zwischen Event-Indizes und Audiodateien."""
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
        return
    
    # Audiodatei basierend auf dem Event-Index ermitteln
    audio_file = audio_files.get(event_index)
    
    if not audio_file:
        logger.error(f"Keine Audio-Datei für Event-Index {event_index} gefunden.")
        return
    
    audio_path = os.path.join(AUDIO_DIR, audio_file)
    
    if not os.path.exists(audio_path):
        logger.error(f"Audiodatei nicht gefunden: {audio_path}")
        return
    
    if player is None:
        player = initialize_vlc()
    
    vlc_instance = vlc.Instance()
    media = vlc_instance.media_new(audio_path)
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

def check_for_events():
    """Überwacht den ontime-Status und reagiert auf Änderungen."""
    global current_event_index, current_playback_state
    
    while True:
        try:
            status = poll_ontime_status()
            
            if status:
                new_event_index = status.get("runtime", {}).get("selectedEventIndex")
                new_playback_state = status.get("timer", {}).get("playback")
                
                logger.debug(f"Status: Index={new_event_index}, Playback={new_playback_state}")
                
                if new_event_index is not None and new_event_index != current_event_index:
                    logger.info(f"Neues Event erkannt: Index {new_event_index}")
                    
                    if current_event_index is not None:
                        stop_audio()
                    
                    if new_playback_state == "play":
                        play_audio(new_event_index)
                    
                    current_event_index = new_event_index
                
                if new_playback_state != current_playback_state:
                    logger.info(f"Playback-Status geändert: {current_playback_state} -> {new_playback_state}")
                    
                    if new_playback_state == "play" and current_playback_state == "pause":
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
    if not os.path.exists(AUDIO_DIR):
        logger.warning(f"Audio-Verzeichnis nicht gefunden: {AUDIO_DIR}")
        try:
            os.makedirs(AUDIO_DIR)
            logger.info(f"Audio-Verzeichnis erstellt: {AUDIO_DIR}")
        except Exception as e:
            logger.error(f"Fehler beim Erstellen des Audio-Verzeichnisses: {e}")
    else:
        logger.info(f"Audio-Verzeichnis gefunden: {AUDIO_DIR}")
        found_files = [f for f in os.listdir(AUDIO_DIR) if f.endswith(".mp3")]
        logger.info(f"Gefundene Audiodateien: {found_files}")
    
    audio_files = create_audio_mapping()
    
    logger.info("Starte Audio-Controller...")
    polling_thread = threading.Thread(target=check_for_events, daemon=True)
    polling_thread.start()
    
    try:
        print("Audio-Controller läuft! Drücken Sie Strg+C zum Beenden...")
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    
    logger.info("Audio-Controller wird beendet.")
    stop_audio()