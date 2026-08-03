"""Domain errors for account and list operations."""


class DomainError(Exception):
    """Base domain error."""


class DuplicateEmailError(DomainError):
    """Raised when signup email is already registered."""


class InvalidSignupError(DomainError):
    """Raised when signup input fails validation."""
