from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import jwt

from app.core.config import get_settings

MAX_BCRYPT_BYTES = 72
MIN_PASSWORD_LENGTH = 12


def _to_bytes(value: str) -> bytes:
    return value.encode("utf-8")


def _validate_length(password: str) -> None:
    if len(_to_bytes(password)) > MAX_BCRYPT_BYTES:
        raise ValueError("Senha muito longa para bcrypt (max 72 bytes).")


def validate_password_strength(password: str) -> None:
    _validate_length(password)
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"A senha deve ter pelo menos {MIN_PASSWORD_LENGTH} caracteres.")
    if not any(ch.isalpha() for ch in password):
        raise ValueError("A senha deve conter pelo menos uma letra.")
    if not any(ch.isdigit() or not ch.isalnum() for ch in password):
        raise ValueError("A senha deve conter pelo menos um numero ou caractere especial.")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        _validate_length(plain_password)
        return bcrypt.checkpw(_to_bytes(plain_password), _to_bytes(hashed_password))
    except ValueError:
        return False


def get_password_hash(password: str) -> str:
    validate_password_strength(password)
    return bcrypt.hashpw(_to_bytes(password), bcrypt.gensalt()).decode("utf-8")


def create_access_token(subject: str, role: str, expires_minutes: int | None = None) -> str:
    settings = get_settings()
    issued_at = datetime.now(timezone.utc)
    expire = issued_at + timedelta(minutes=expires_minutes or settings.jwt_expires_minutes)
    to_encode: dict[str, Any] = {
        "sub": subject,
        "role": role,
        "iat": issued_at,
        "exp": expire,
    }
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)
