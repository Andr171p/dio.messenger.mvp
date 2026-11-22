from enum import IntEnum, StrEnum, auto
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

# ЗАГЛУШКА для Legacy IAM (текущая реализация не поддерживает multi-tenancy)
_STUB_ORGANIZATION_ID = UUID("00000000-0000-0000-0000-000000000000")

ADMIN_ROLE = "admin"

_CUSTOMER_ROLES = frozenset({"customer", "customer_admin"})


class AuthType(IntEnum):
    USER = auto()
    CLIENT = auto()
    ADMIN = auto()


class PrincipalKind(StrEnum):
    STAFF = "staff"
    CUSTOMER = "customer"


def principal_kind_from_roles(roles: frozenset[str] | set[str]) -> PrincipalKind:
    """Staff vs customer по ролям DioDesk IAM (customer / customer_admin)."""

    normalized = {role.lower() for role in roles}
    if normalized and normalized <= _CUSTOMER_ROLES:
        return PrincipalKind.CUSTOMER
    return PrincipalKind.STAFF


class Auth(BaseModel):
    model_config = ConfigDict(frozen=True)

    class User(BaseModel):
        model_config = ConfigDict(frozen=True)

        id: UUID
        email: EmailStr
        organization_id: UUID = _STUB_ORGANIZATION_ID
        roles: frozenset[str] = Field(default_factory=frozenset)
        counterparty_id: UUID | None = None
        principal_kind: PrincipalKind = PrincipalKind.STAFF

        @property
        def is_customer(self) -> bool:
            return self.principal_kind is PrincipalKind.CUSTOMER

        @property
        def is_staff(self) -> bool:
            return self.principal_kind is PrincipalKind.STAFF

    id: UUID
    type: AuthType

    user: User | None = None


class AuthUser(Auth):
    """Аутентифицированный пользователь."""

    user: Auth.User

    @property
    def is_admin(self) -> bool:
        return ADMIN_ROLE in self.user.roles
