"""Hash/verificação de senha com bcrypt (custo >= 12). Nunca logar senha/hash."""

from __future__ import annotations

import bcrypt

MIN_ROUNDS = 12
# O bcrypt considera no máximo 72 bytes; truncamos de forma explícita e estável.
BCRYPT_MAX_BYTES = 72


def _encode(password: str) -> bytes:
    return password.encode("utf-8")[:BCRYPT_MAX_BYTES]


class BcryptPasswordHasher:
    """Implementa a porta PasswordHasher com bcrypt."""

    def __init__(self, rounds: int = MIN_ROUNDS) -> None:
        if rounds < MIN_ROUNDS:
            raise ValueError(f"bcrypt exige custo >= {MIN_ROUNDS}.")
        self._rounds = rounds

    @property
    def rounds(self) -> int:
        return self._rounds

    def hash(self, password: str) -> str:
        if not password:
            raise ValueError("Senha vazia não pode ser processada.")
        salt = bcrypt.gensalt(rounds=self._rounds)
        return bcrypt.hashpw(_encode(password), salt).decode("ascii")

    def verify(self, password: str, password_hash: str) -> bool:
        if not password or not password_hash:
            return False
        try:
            return bcrypt.checkpw(_encode(password), password_hash.encode("ascii"))
        except (ValueError, TypeError):
            return False
