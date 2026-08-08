"""Domain errors for account and list operations."""


class DomainError(Exception):
    """Base domain error."""


class DuplicateEmailError(DomainError):
    """Raised when signup email is already registered."""


class InvalidSignupError(DomainError):
    """Raised when signup input fails validation."""


class InvalidCredentialsError(DomainError):
    """Raised for any failed sign-in — never distinguish unknown email vs bad password."""

    MESSAGE = "Invalid email or password."

    def __init__(self) -> None:
        super().__init__(self.MESSAGE)


class RateLimitedError(DomainError):
    """Raised when an auth request path exceeds its configured rate limit."""

    MESSAGE = "Too many attempts. Please try again later."
    CODE = "rate_limited"

    def __init__(self) -> None:
        super().__init__(self.MESSAGE)


class InvalidResetTokenError(DomainError):
    """Raised when a password-reset token is missing, expired, or already used."""

    MESSAGE = "This reset link is invalid or has expired. Request a new one."

    def __init__(self) -> None:
        super().__init__(self.MESSAGE)


class InvalidResetPasswordError(DomainError):
    """Raised when the new password fails validation on reset confirm."""

    MESSAGE = "Password must be at least 8 characters."

    def __init__(self, detail: str | None = None) -> None:
        super().__init__(detail or self.MESSAGE)


class SmtpConfigurationError(DomainError):
    """Raised when SMTP is missing or misconfigured (operator-facing)."""

    MESSAGE = "Email delivery is not configured. Check SMTP settings."

    def __init__(self, detail: str | None = None) -> None:
        super().__init__(detail or self.MESSAGE)


class SmtpSendError(DomainError):
    """Raised when SMTP is configured but send fails (no silent success)."""

    MESSAGE = "Could not send email. Check SMTP connectivity and try again."

    def __init__(self, detail: str | None = None) -> None:
        super().__init__(detail or self.MESSAGE)


class EmailNotVerifiedError(DomainError):
    """Raised when a gated flow requires verified email and the user is unverified."""

    MESSAGE = (
        "Verify your email before continuing with this action. "
        "Check your inbox for a verification link, or open /verify to resend one."
    )

    def __init__(self) -> None:
        super().__init__(self.MESSAGE)


class InvalidVerificationTokenError(DomainError):
    """Raised when an email-verification token is missing, expired, or already used."""

    MESSAGE = "This verification link is invalid or has expired. Request a new one."

    def __init__(self) -> None:
        super().__init__(self.MESSAGE)


class VerificationNotRequiredError(DomainError):
    """Raised when verification endpoints are called while the config gate is off."""

    MESSAGE = "Email verification is not required for this deployment."

    def __init__(self) -> None:
        super().__init__(self.MESSAGE)


class PrincipalNotFoundError(DomainError):
    """Raised when an authenticated user_id has no matching account row."""

    MESSAGE = "Not authenticated."

    def __init__(self) -> None:
        super().__init__(self.MESSAGE)


class InvalidPreferencesError(DomainError):
    """Raised when language/theme preference values are invalid."""

    MESSAGE = "Invalid preference value."

    def __init__(self, detail: str | None = None) -> None:
        super().__init__(detail or self.MESSAGE)


class InvalidAliasError(DomainError):
    """Raised when an alias fails length/charset validation."""

    MESSAGE = "Alias must be 3-32 characters using lowercase letters, numbers, and underscores."
    CODE = "invalid_alias"

    def __init__(self, detail: str | None = None) -> None:
        super().__init__(detail or self.MESSAGE)


class AliasTakenError(DomainError):
    """Raised when the requested alias is already claimed (case-insensitive)."""

    MESSAGE = "That alias is taken. Try another one."
    CODE = "alias_taken"

    def __init__(self) -> None:
        super().__init__(self.MESSAGE)


class AliasAlreadySetError(DomainError):
    """Raised when an account with an alias attempts to change it (rename is deferred)."""

    MESSAGE = "Your alias is already set and cannot be changed yet."
    CODE = "alias_already_set"

    def __init__(self) -> None:
        super().__init__(self.MESSAGE)


class AliasRequiredError(DomainError):
    """Raised when an authenticated user without an alias touches list surfaces."""

    MESSAGE = "Choose an alias before using lists."
    CODE = "alias_required"

    def __init__(self) -> None:
        super().__init__(self.MESSAGE)


class InvalidListNameError(DomainError):
    """Raised when a list name is empty or whitespace-only."""

    MESSAGE = "Enter a list name."

    def __init__(self, detail: str | None = None) -> None:
        super().__init__(detail or self.MESSAGE)


class ListNotFoundError(DomainError):
    """Raised when a list id does not exist."""

    MESSAGE = "List not found."

    def __init__(self) -> None:
        super().__init__(self.MESSAGE)


class NotListMemberError(DomainError):
    """Raised when the actor is not a member of the list (ACL)."""

    MESSAGE = "You do not have access to this list."

    def __init__(self) -> None:
        super().__init__(self.MESSAGE)


class NotListOwnerError(DomainError):
    """Raised when a member who is not the owner attempts an owner-only action."""

    MESSAGE = "Only the list owner can perform this action."

    def __init__(self, detail: str | None = None) -> None:
        super().__init__(detail or self.MESSAGE)


class ListWriteError(DomainError):
    """Raised when list persistence fails due to a constraint / integrity error."""

    MESSAGE = "Could not create the list. Try again."

    def __init__(self, detail: str | None = None) -> None:
        super().__init__(detail or self.MESSAGE)


class InvalidDefaultSplitError(DomainError):
    """Raised when standing default-split mode/shares fail validation (FR-9)."""

    MESSAGE = "Default split percentages must sum to exactly 100 across current members."

    def __init__(self, detail: str | None = None) -> None:
        super().__init__(detail or self.MESSAGE)


class InvalidSplitOverrideError(DomainError):
    """Raised when item/receipt split override or allocation input is invalid (FR-10)."""

    MESSAGE = "Split override is invalid."

    def __init__(self, detail: str | None = None) -> None:
        super().__init__(detail or self.MESSAGE)


class InvalidManualExpenseError(DomainError):
    """Raised when manual expense create input fails validation (FR-21)."""

    MESSAGE = "Manual expense is invalid."

    def __init__(self, detail: str | None = None) -> None:
        super().__init__(detail or self.MESSAGE)


class SubjectNotFoundError(DomainError):
    """Raised when an allocatable item/receipt subject does not exist on the list."""

    MESSAGE = "Subject not found."

    def __init__(self) -> None:
        super().__init__(self.MESSAGE)


class SplitOverrideNotFoundError(DomainError):
    """Raised when no override is stored for a subject."""

    MESSAGE = "Split override not found."

    def __init__(self) -> None:
        super().__init__(self.MESSAGE)


class InvalidInviteEmailError(DomainError):
    """Raised when an invite email fails shape validation."""

    MESSAGE = "Enter a valid email address."

    def __init__(self, detail: str | None = None) -> None:
        super().__init__(detail or self.MESSAGE)


class AlreadyListMemberError(DomainError):
    """Raised when inviting an email that already has membership on the list."""

    MESSAGE = "That person is already a member of this list."

    def __init__(self) -> None:
        super().__init__(self.MESSAGE)


class InvalidInviteTokenError(DomainError):
    """Raised when an invite token is missing, expired, or already used."""

    MESSAGE = "This invite link is invalid or has expired. Ask the list owner for a new invite."
    CODE = "invalid_invite_token"

    def __init__(self) -> None:
        super().__init__(self.MESSAGE)


class InviteEmailMismatchError(DomainError):
    """Raised when signup/accept email does not match the invitee on the token."""

    MESSAGE = "Use the email address this invite was sent to."
    CODE = "invite_email_mismatch"

    def __init__(self) -> None:
        super().__init__(self.MESSAGE)
