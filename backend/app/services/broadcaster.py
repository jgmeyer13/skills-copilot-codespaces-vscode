"""In-process pub/sub for the WebSocket stream.

Keeps things simple for M1 — one process broadcasts to N websocket clients.
When we scale out we'll back this with Redis pub/sub (already in the stack).
"""
from __future__ import annotations

import asyncio
from typing import Any


class Broadcaster:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[Any]] = set()
        self._lock = asyncio.Lock()
        self._last: Any | None = None

    async def subscribe(self) -> asyncio.Queue[Any]:
        q: asyncio.Queue[Any] = asyncio.Queue(maxsize=32)
        async with self._lock:
            self._subscribers.add(q)
        if self._last is not None:
            await q.put(self._last)
        return q

    async def unsubscribe(self, q: asyncio.Queue[Any]) -> None:
        async with self._lock:
            self._subscribers.discard(q)

    async def publish(self, message: Any) -> None:
        self._last = message
        async with self._lock:
            dead: list[asyncio.Queue[Any]] = []
            for q in self._subscribers:
                try:
                    q.put_nowait(message)
                except asyncio.QueueFull:
                    dead.append(q)
            for q in dead:
                self._subscribers.discard(q)


broadcaster = Broadcaster()
