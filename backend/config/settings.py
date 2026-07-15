"""
Django settings for EZTrack.

Configuration is read from environment variables (via django-environ) so that the
same settings module runs locally and in production. Local defaults live in .env;
production values are set in the host's dashboard. Nothing secret is committed.
"""

from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(
    DEBUG=(bool, False),
    ALLOWED_HOSTS=(list, []),
    CORS_ALLOW_ALL_ORIGINS=(bool, False),
)

# Read .env if present. In production there's no .env file — the host injects real
# environment variables instead, and env() picks those up transparently.
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("SECRET_KEY")
DEBUG = env("DEBUG")
ALLOWED_HOSTS = env("ALLOWED_HOSTS")

if DEBUG:
    # In development the phone reaches Django on the Mac's LAN IP (192.168.x.x),
    # which changes with the network and can't be hardcoded. Django rejects any
    # Host header not in ALLOWED_HOSTS with a bare 400 — so without this, every
    # request from a real device fails, whatever is in .env.
    # Only ever under DEBUG; in production ALLOWED_HOSTS is set explicitly.
    ALLOWED_HOSTS = ["*"]


INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # third-party
    "rest_framework",
    "corsheaders",
    # local
    "accounts",
    "expenses",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",  # must sit above CommonMiddleware
    "whitenoise.middleware.WhiteNoiseMiddleware",  # serves admin CSS in production
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


# Database — Postgres in every environment, so local dev matches production.
# DATABASE_URL format: postgres://user:password@host:port/dbname
DATABASES = {"default": env.db("DATABASE_URL")}

# Reuse connections for 10 minutes instead of opening a new one per request.
# Django's default (CONN_MAX_AGE=0) closes the socket after every request, which is
# fine against localhost and wasteful across the internet to a hosted database.
DATABASES["default"]["CONN_MAX_AGE"] = env.int("CONN_MAX_AGE", default=600)

# Supabase (and any PgBouncer/Supavisor pooler) in TRANSACTION mode hands your
# connection to a different backend process between statements. Server-side cursors
# don't survive that — they live on one backend — so a paginated queryset blows up
# with "cursor does not exist". Turning them off makes Django fetch result sets in
# one go, which is correct behaviour behind a transaction-mode pooler.
#
# Harmless when it's not needed (a local database just materialises results eagerly),
# so it's set from an env var and left on wherever a pooler is in play.
if env.bool("DB_DISABLE_SERVER_SIDE_CURSORS", default=False):
    DATABASES["default"]["DISABLE_SERVER_SIDE_CURSORS"] = True


AUTH_USER_MODEL = "accounts.User"

# Case-insensitive email login. See accounts/backends.py for why the default
# ModelBackend isn't enough.
AUTHENTICATION_BACKENDS = ["accounts.backends.EmailBackend"]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    # Default to locked-down. A view that forgets to declare permissions then fails
    # closed (401) rather than silently exposing another user's data.
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
}

SIMPLE_JWT = {
    # Short-lived access token; the app silently refreshes with the long-lived
    # refresh token, which is what makes "stay logged in" work without storing
    # a password on the device.
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "ROTATE_REFRESH_TOKENS": True,
}


# CORS. The Expo dev client runs on a different origin than Django, so the browser-
# based (web) target needs this. Native builds don't enforce CORS, but Expo Web does.
CORS_ALLOW_ALL_ORIGINS = env("CORS_ALLOW_ALL_ORIGINS")
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])


# Production hardening. Only applied when DEBUG is off, so local development over
# plain HTTP still works — switching these on locally would redirect the Expo dev
# client to https://192.168.x.x:8000, which nothing is listening on.
if not DEBUG:
    # Render (like most hosts) terminates TLS at its proxy and forwards plain HTTP
    # to the app. Without this header Django thinks every request is insecure, and
    # SECURE_SSL_REDIRECT below would bounce it to HTTPS forever — an infinite
    # redirect loop. This tells Django to trust the proxy's protocol header.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

    # Tell browsers to only ever reach us over HTTPS. Start at one hour; once the
    # deploy is proven, raise it (a year, 31536000, is the usual end state).
    # Raising it is hard to undo — browsers honour the old value until it expires.
    SECURE_HSTS_SECONDS = 3600
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True


LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
