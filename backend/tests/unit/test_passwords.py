"""Testes de hash/verificação de senha (bcrypt)."""

from __future__ import annotations

import pytest

from app.infrastructure.security.passwords import BcryptPasswordHasher


def test_hash_e_verify_ok():
    hasher = BcryptPasswordHasher()

    hashed = hasher.hash("segredo-forte")

    assert hashed != "segredo-forte"
    assert hashed.startswith("$2b$")
    assert hasher.verify("segredo-forte", hashed) is True


def test_verify_senha_errada():
    hasher = BcryptPasswordHasher()
    hashed = hasher.hash("segredo-forte")

    assert hasher.verify("outra-senha", hashed) is False


def test_salt_gera_hashes_distintos():
    hasher = BcryptPasswordHasher()

    assert hasher.hash("segredo-forte") != hasher.hash("segredo-forte")


def test_custo_minimo_12():
    hasher = BcryptPasswordHasher()

    assert hasher.rounds == 12
    assert hasher.hash("segredo-forte").startswith("$2b$12$")


def test_custo_abaixo_do_minimo_rejeitado():
    with pytest.raises(ValueError):
        BcryptPasswordHasher(rounds=10)


def test_verify_hash_invalido_retorna_false():
    hasher = BcryptPasswordHasher()

    assert hasher.verify("segredo-forte", "nao-e-um-hash") is False
    assert hasher.verify("", "nao-e-um-hash") is False


def test_hash_de_senha_vazia_rejeitado():
    hasher = BcryptPasswordHasher()

    with pytest.raises(ValueError):
        hasher.hash("")
