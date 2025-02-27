import os
import vlc
import httpx
import logging
import threading
from pythonosc.dispatcher import Dispatcher
from pythonosc.osc_server import BlockingOSCUDPServer
from pythonosc.udp_client import SimpleUDPClient

### Logger konfigurieren
# Logger Controller
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("controller")

# Logger-Simulation
http_logger = logging.getLogger("http_requests")
http_logger.setLevel(logging.INFO)
# Logger-Datei
http_handler = logging.FileHandler("http_requests.log")
http_formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
http_handler.setFormatter(http_formatter)
http_logger.addHandler(http_handler)

# Dynamische Pfadkonfiguration
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
        http_logger.info(f"{method} {url} - Status: {response.status_code} - Antwort: {response.text}")

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
        return

    media = vlc_instance.media_new(audio_path)
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

        
# OSC-Server starten
def start_osc_server():
    dispatcher = Dispatcher()
    dispatcher.map("/start", handle_start_event)
    dispatcher.map("/stop", handle_stop_event)
    dispatcher.map("/pause", handle_pause_event)
    dispatcher.map("/next_event", handle_next_event)
    dispatcher.map("/first_stage", handle_first_stage_event)
    dispatcher.map("/second_stage", handle_second_stage_event)
    server = BlockingOSCUDPServer(("127.0.0.1", 9999), dispatcher)
    logger.info("OSC-Server läuft...")
    server.serve_forever()


if __name__ == "__main__":
    logger.info("Initialisiere Sequenzen und starte OSC-Server...")
    initialize_sequences()
    osc_thread = threading.Thread(target=start_osc_server, daemon=True)
    osc_thread.start()


    try:
        while True:
            pass
    except KeyboardInterrupt:
        logger.info("Programm beendet.")