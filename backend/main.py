"""
Hindi Video Studio — FastAPI backend
Binds to 127.0.0.1:8765
WebSocket progress at /ws/{project_id}
"""
from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Dict, Set

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import get_data_dir, get_projects_dir
from db.models import init_db
from routes.health import router as health_router
from routes.projects import router as projects_router
from routes.pipeline import router as pipeline_router
from routes.settings import router as settings_router

# ── Storage directories ──────────────────────────────────────────────────────
HOME_DIR = get_data_dir()
PROJECTS_DIR = get_projects_dir()


def _ensure_dirs() -> None:
    pass


# ── WebSocket manager ────────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self) -> None:
        self._clients: Dict[str, Set[WebSocket]] = {}

    async def connect(self, project_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._clients.setdefault(project_id, set()).add(ws)

    def disconnect(self, project_id: str, ws: WebSocket) -> None:
        project_clients = self._clients.get(project_id, set())
        project_clients.discard(ws)
        if not project_clients:
            self._clients.pop(project_id, None)

    async def broadcast(self, project_id: str, message: dict) -> None:
        dead: list[WebSocket] = []
        for ws in list(self._clients.get(project_id, set())):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(project_id, ws)


manager = ConnectionManager()


# ── App lifecycle ────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    _ensure_dirs()
    init_db()
    yield


app = FastAPI(title="Hindi Video Studio", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(projects_router)
app.include_router(pipeline_router)
app.include_router(settings_router)

# ── WebSocket endpoint ───────────────────────────────────────────────────────
@app.websocket("/ws/{project_id}")
async def websocket_endpoint(websocket: WebSocket, project_id: str) -> None:
    await manager.connect(project_id, websocket)
    try:
        while True:
            await websocket.receive_text()  # keep-alive; we only send server→client
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        manager.disconnect(project_id, websocket)


# ── Serve Frontend SPA (Mounted last as catch-all) ───────────────────────────
_FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIST), html=True), name="frontend")


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8765,
        reload=False,
        log_level="info",
    )
