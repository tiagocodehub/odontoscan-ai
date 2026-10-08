"""Testes do rate limiter de login (janela deslizante em memória)."""

from __future__ import annotations

from app.infrastructure.security.rate_limit import LoginRateLimiter


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def test_bloqueia_na_sexta_tentativa():
    clock = FakeClock()
    limiter = LoginRateLimiter(limit=5, window_seconds=60.0, clock=clock)

    for _ in range(5):
        assert limiter.allow("127.0.0.1", "ana@clinica.com") is True

    assert limiter.allow("127.0.0.1", "ana@clinica.com") is False


def test_janela_deslizante_libera_apos_expirar():
    clock = FakeClock()
    limiter = LoginRateLimiter(limit=2, window_seconds=60.0, clock=clock)

    assert limiter.allow("1.1.1.1", "a@b.com") is True
    assert limiter.allow("1.1.1.1", "a@b.com") is True
    assert limiter.allow("1.1.1.1", "a@b.com") is False

    clock.advance(61.0)
    assert limiter.allow("1.1.1.1", "a@b.com") is True


def test_chaves_diferentes_sao_independentes():
    limiter = LoginRateLimiter(limit=1)

    assert limiter.allow("1.1.1.1", "a@b.com") is True
    assert limiter.allow("1.1.1.1", "a@b.com") is False
    assert limiter.allow("1.1.1.1", "outro@b.com") is True
    assert limiter.allow("2.2.2.2", "a@b.com") is True


def test_email_case_insensitive():
    limiter = LoginRateLimiter(limit=1)

    assert limiter.allow("1.1.1.1", "A@B.com") is True
    assert limiter.allow("1.1.1.1", "a@b.com") is False


def test_reset_limpa_estado():
    limiter = LoginRateLimiter(limit=1)

    assert limiter.allow("1.1.1.1", "a@b.com") is True
    assert limiter.allow("1.1.1.1", "a@b.com") is False
    limiter.reset()
    assert limiter.allow("1.1.1.1", "a@b.com") is True


def test_ip_limit_bloqueia_rotacionando_email():
    clock = FakeClock()
    limiter = LoginRateLimiter(limit=5, ip_limit=3, clock=clock)

    for i in range(3):
        assert limiter.allow("1.1.1.1", f"user{i}@b.com") is True

    assert limiter.allow("1.1.1.1", "user3@b.com") is False


def test_ip_limit_e_isolado_por_ip():
    limiter = LoginRateLimiter(limit=5, ip_limit=1)

    assert limiter.allow("1.1.1.1", "a@b.com") is True
    assert limiter.allow("1.1.1.1", "outro@b.com") is False
    assert limiter.allow("2.2.2.2", "outro@b.com") is True


def test_ambos_limites_precisam_estar_no_limite():
    limiter = LoginRateLimiter(limit=1, ip_limit=10)

    assert limiter.allow("1.1.1.1", "a@b.com") is True
    assert limiter.allow("1.1.1.1", "a@b.com") is False
    assert limiter.allow("1.1.1.1", "b@b.com") is True


def test_ip_limit_ip_limit_invalido_rejeitado():
    import pytest

    with pytest.raises(ValueError):
        LoginRateLimiter(limit=5, ip_limit=0)
