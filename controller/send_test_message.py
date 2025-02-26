from pythonosc.udp_client import SimpleUDPClient
import time

# OSC-Server-Adresse und Port
ip = "127.0.0.1"  # Lokaler OSC-Server
port = 9999       # Port des Servers

# OSC-Client erstellen
client = SimpleUDPClient(ip, port)

# Teste alle OSC-Befehle
def test_all_events():
    # Events definieren
    events = ["Audio1", "Audio2", "Audio3", "Audio4"]
    
    # Test: /start für jedes Event
    for event in events:
        client.send_message("/start", [event])
        print(f"Testnachricht '/start' mit Argument '{event}' gesendet.")
        time.sleep(2)  # Kurz warten, damit das Event abgespielt wird

    # Test: /pause
    client.send_message("/pause", [])
    print("Testnachricht '/pause' gesendet.")
    time.sleep(1)

    # Test: /resume
    client.send_message("/resume", [])
    print("Testnachricht '/resume' gesendet.")
    time.sleep(1)

    # Test: /stop
    client.send_message("/stop", [])
    print("Testnachricht '/stop' gesendet.")
    time.sleep(1)

    print("Alle Tests abgeschlossen.")

if __name__ == "__main__":
    test_all_events()