from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class UserManager(BaseUserManager):
    """Django's default manager assumes a `username` field. Ours logs in by email,
    so both creation paths have to be reimplemented."""

    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Users must have an email address")
        # normalize_email only lowercases the domain part (Foo@BAR.com -> Foo@bar.com).
        # Lowercase the whole address so logins aren't case-sensitive.
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra_fields)
        user.set_password(password)  # hashes it; never assign to .password directly
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True")
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """Custom user, email as the login identifier.

    This model MUST exist before the first `makemigrations` runs. Django bakes
    AUTH_USER_MODEL into every migration touching a user FK, and swapping it
    afterwards means unwinding the migration history by hand.
    """

    email = models.EmailField(unique=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)  # gates access to the Django admin
    date_joined = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []  # extra prompts for createsuperuser, beyond USERNAME_FIELD

    def __str__(self):
        return self.email
