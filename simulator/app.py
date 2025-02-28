import os
import httpx
import logging
from typing import Annotated, Literal
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Feuerwerk-Simulator", version="1.0.0")

# Berechne das Verzeichnis der statischen Web‑UI-Dateien:
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEBAPP_STATIC_DIR = os.path.join(BASE_DIR, "../webapp/static")

# Mounte die statischen Dateien unter "/static"
app.mount("/static", StaticFiles(directory=WEBAPP_STATIC_DIR, html = True), name="styles.css")


# Liefere index.html an der Root-URL aus:
@app.get("/api/sequences", response_class=HTMLResponse, summary="Startseite der Web-UI")
def read_index():
    index_path = os.path.join(WEBAPP_STATIC_DIR, "index.html")
    with open(index_path, encoding="utf-8") as f:
        return f.read()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class FireworkSequence(BaseModel):
    name: str
    status: Literal[
        "saved", "first_stage", "second_stage", "running", "paused", "stopped"
    ] = "saved"


sequence_store = {}
next_map = {
    "saved": "first_stage",
    "first_stage": "second_stage",
    "second_stage": "running",
}
current_stages = {
    "running": None,
    "first_stage": None,
    "second_stage": None,
}


def next_stage(sequence: FireworkSequence, stage: str):
    if current_stages[stage] is not None:
        raise HTTPException(
            status_code=403,
            detail=f"A other sequence is already in {stage}.",
        )
    if next_map.get(sequence.status) != stage:
        raise HTTPException(
            status_code=403,
            detail=f"Bad next stage {stage}.",
        )
    current_stages[sequence.status] = None
    sequence.status = stage
    current_stages[sequence.status] = sequence


def _get_sequence(name: str):
    try:
        return sequence_store[name]
    except KeyError:
        raise HTTPException(status_code=404, detail="Sequence not found.") from None


GetSequence = Annotated[FireworkSequence, Depends(_get_sequence)]


@app.get("/api/sequences", summary="Gibt eine Liste aller Feuerwerk-Sequenzen zurück.")
def get_all_sequences() -> list[FireworkSequence]:
    return list(sequence_store.values())


@app.post(
    "/api/sequences",
    summary="Erstellt eine Feuerwerk-Sequenz.",
    description="Der Sequenz-Name muss als Parameter übergeben werden und eindeutig sein.",
    responses={403: {"description": "Sequenz-Name exsistiert bereits."}},
)
def create_sequence(name: str) -> FireworkSequence:
    if name in sequence_store:
        raise HTTPException(status_code=403, detail="Sequence already exists.")
    sequence_store[name] = FireworkSequence(name=name)
    return sequence_store[name]


@app.delete("/api/sequences", summary="Setzt die Steuerung zurück (löscht alle Sequenzen).")
def reset():
    sequence_store.clear()
    current_stages["running"] = None
    current_stages["first_stage"] = None
    current_stages["second_stage"] = None


@app.get(
    "/api/sequences/{name}",
    summary="Gibt eine Sequenz zurück.",
    description="Der Sequenz-Name muss exsistieren.",
    responses={404: {"description": "Sequenz exsistiert nicht."}},
)
def get_sequence(sequence: GetSequence) -> FireworkSequence:
    return sequence


@app.delete(
    "/api/sequences/{name}",
    summary="Löscht eine Sequenz.",
    description="Der Sequenz-Name muss exsistieren.",
    responses={404: {"description": "Sequenz exsistiert nicht."}},
)
def delete_sequence(name: str) -> FireworkSequence:
    try:
        return sequence_store.pop(name)
    except KeyError:
        raise HTTPException(status_code=404, detail="Sequence not found.") from None


@app.patch(
    "/api/sequences/{name}/first_stage",
    summary="Aktiviere die erste Freigabe (Status: 'first_stage').",
    description="Der Sequenz-Name muss exsistieren.\n"
    "Die Sequenz muss im Status 'saved' sein.'\n"
    "Es darf nur eine Sequenz im Status 'first_stage' sein.",
    responses={
        403: {"description": "Der Statuswechsel ist nicht zulässig."},
        404: {"description": "Sequenz exsistiert nicht."},
    },
)
def sequence_to_first_stage(sequence: GetSequence) -> FireworkSequence:
    next_stage(sequence, "first_stage")
    return sequence


@app.patch(
    "/api/sequences/{name}/second_stage",
    summary="Aktiviere die zweite Freigabe (Status: 'second_stage').",
    description="Der Sequenz-Name muss exsistieren.\n"
    "Die Sequenz muss im Status 'first_stage' sein.'\n"
    "Es darf nur eine Sequenz im Status 'second_stage' sein.",
    responses={
        403: {"description": "Der Statuswechsel ist nicht zulässig."},
        404: {"description": "Sequenz exsistiert nicht."},
    },
)
def sequence_to_second_stage(sequence: GetSequence) -> FireworkSequence:
    next_stage(sequence, "second_stage")
    return sequence


@app.patch(
    "/api/sequences/{name}/running",
    summary="Starte die Sequenz (Status: 'running').",
    description="Der Sequenz-Name muss exsistieren.\n"
    "Die Sequenz muss im Status 'second_stage' sein.'\n"
    "Es darf nur eine Sequenz im Status 'running' sein.",
    responses={
        403: {"description": "Der Statuswechsel ist nicht zulässig."},
        404: {"description": "Sequenz exsistiert nicht."},
    },
)
def sequence_to_running(sequence: GetSequence) -> FireworkSequence:
    next_stage(sequence, "running")
    return sequence


@app.patch(
    "/api/sequences/{name}/pause",
    summary="Pausiere die Sequenz (Status: 'paused').",
    description="Der Sequenz-Name muss exsistieren.\n"
    "Die Sequenz muss im Status 'running' sein.'\n"
    "Es darf nur eine Sequenz im Status 'paused' sein.",
    responses={
        403: {"description": "Der Statuswechsel ist nicht zulässig."},
        404: {"description": "Sequenz exsistiert nicht."},
    },
)
def pause_sequence(sequence: GetSequence) -> FireworkSequence:
    if sequence.status in ("paused", "running"):
        sequence.status = "paused"
    else:
        raise HTTPException(status_code=403, detail="Sequence not running.")
    return sequence


@app.patch(
    "/api/sequences/{name}/resume",
    summary="Setzt die Sequenz fort (Status: 'running').",
    description="Der Sequenz-Name muss exsistieren.\n"
    "Die Sequenz muss im Status 'paused' sein.'\n"
    "Es darf nur eine Sequenz im Status 'running' sein.",
    responses={
        403: {"description": "Der Statuswechsel ist nicht zulässig."},
        404: {"description": "Sequenz exsistiert nicht."},
    },
)
def resume_sequence(sequence: GetSequence) -> FireworkSequence:
    if sequence.status == "paused":
        sequence.status = "running"
    else:
        raise HTTPException(status_code=403, detail="Sequence is not paused.")
    return sequence


@app.post(
    "/api/sequences/stop",
    summary="Stop die Sequenz (Status: 'stopped').",
    description="Der Sequenz-Name muss exsistieren.\n"
    "Die Sequenz muss im Status 'running' oder 'paused' sein.'",
    responses={
        403: {"description": "Der Statuswechsel ist nicht zulässig."},
        404: {"description": "Sequenz exsistiert nicht."},
    },
)
def stop_sequence() -> None:
    if current_stages["running"] is not None:
        current_stages["running"].status = "stopped"
        current_stages["running"] = None

