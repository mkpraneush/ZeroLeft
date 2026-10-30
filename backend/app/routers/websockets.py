from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Set
import json
import asyncio

router = APIRouter(prefix="/ws", tags=["websockets"])

# Connection manager
class ConnectionManager:
    def __init__(self):
        # product_id → set of websocket connections
        self.product_connections: Dict[str, Set[WebSocket]] = {}
        # vendor_id → set of websocket connections
        self.vendor_connections: Dict[str, Set[WebSocket]] = {}

    async def connect_product(self, product_id: str, ws: WebSocket):
        await ws.accept()
        if product_id not in self.product_connections:
            self.product_connections[product_id] = set()
        self.product_connections[product_id].add(ws)

    def disconnect_product(self, product_id: str, ws: WebSocket):
        if product_id in self.product_connections:
            self.product_connections[product_id].discard(ws)

    async def connect_vendor(self, vendor_id: str, ws: WebSocket):
        await ws.accept()
        if vendor_id not in self.vendor_connections:
            self.vendor_connections[vendor_id] = set()
        self.vendor_connections[vendor_id].add(ws)

    def disconnect_vendor(self, vendor_id: str, ws: WebSocket):
        if vendor_id in self.vendor_connections:
            self.vendor_connections[vendor_id].discard(ws)

    async def broadcast_product_update(self, product_id: str, data: dict):
        """Broadcast stock/status update to all watchers of a product."""
        connections = self.product_connections.get(product_id, set()).copy()
        disconnected = set()
        for ws in connections:
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                disconnected.add(ws)
        for ws in disconnected:
            self.product_connections[product_id].discard(ws)

    async def broadcast_vendor_update(self, vendor_id: str, data: dict):
        """Broadcast order update to vendor's dashboard connections."""
        connections = self.vendor_connections.get(vendor_id, set()).copy()
        disconnected = set()
        for ws in connections:
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                disconnected.add(ws)
        for ws in disconnected:
            self.vendor_connections[vendor_id].discard(ws)


manager = ConnectionManager()


@router.websocket("/product/{product_id}")
async def product_socket(websocket: WebSocket, product_id: str):
    """Customers connect here to receive live stock updates for a product."""
    await manager.connect_product(product_id, websocket)
    try:
        while True:
            # Keep connection alive; actual updates pushed from reservation endpoints
            await asyncio.sleep(30)
            await websocket.send_text(json.dumps({"type": "ping"}))
    except WebSocketDisconnect:
        manager.disconnect_product(product_id, websocket)


@router.websocket("/vendor/{vendor_id}")
async def vendor_socket(websocket: WebSocket, vendor_id: str):
    """Vendor dashboard connects here to receive live order updates."""
    await manager.connect_vendor(vendor_id, websocket)
    try:
        while True:
            await asyncio.sleep(30)
            await websocket.send_text(json.dumps({"type": "ping"}))
    except WebSocketDisconnect:
        manager.disconnect_vendor(vendor_id, websocket)
