"""Rate limit de login em memória (janela deslizante).

Aplica DOIS limites independentes:
  * por (IP, e-mail) — combate brute force direcionado a uma conta;
  * por IP isolado — impede burlar o primeiro rotacionando o e-mail no mesmo IP.

O login só é permitido se AMBOS estiverem dentro do limite.

PENDÊNCIA (ADR-0007): é por processo. Em produção precisa ser distribuído
(Redis/gateway), senão cada réplica tem seu próprio contador.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from collections.abc import Callable


class LoginRateLimiter:
    """Permite no máximo `limit` tentativas por (IP, e-mail) e `ip_limit` por IP."""

    def __init__(
        self,
        limit: int,
        window_seconds: float = 60.0,
        clock: Callable[[], float] = time.monotonic,
        ip_limit: int | None = None,
    ) -> None:
        if limit < 1:
            raise ValueError("limit deve ser >= 1.")
        if ip_limit is not None and ip_limit < 1:
            raise ValueError("ip_limit deve ser >= 1 ou None.")
        self._limit = limit
        self._ip_limit = ip_limit
        self._window = window_seconds
        self._clock = clock
        self._events: dict[tuple[str, str], deque[float]] = {}
        self._ip_events: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _consume(
        events: deque[float], now: float, window: float, limit: int | None
    ) -> bool:
        """Descarta eventos antigos e registra a tentativa se ainda houver folga."""
        if limit is None:
            return True
        cutoff = now - window
        while events and events[0] <= cutoff:
            events.popleft()
        if len(events) >= limit:
            return False
        events.append(now)
        return True

    def allow(self, ip: str, email: str) -> bool:
        """Registra a tentativa e diz se ela é permitida (False = 429)."""
        now = self._clock()
        ip_key = ip or "unknown"
        email_key = (ip_key, (email or "").strip().lower())

        with self._lock:
            ip_events = self._ip_events.setdefault(ip_key, deque())
            ip_ok = self._consume(ip_events, now, self._window, self._ip_limit)

            events = self._events.setdefault(email_key, deque())
            email_ok = self._consume(events, now, self._window, self._limit)

            return ip_ok and email_ok

    def reset(self) -> None:
        """Limpa o estado (usado em testes)."""
        with self._lock:
            self._events.clear()
            self._ip_events.clear()
