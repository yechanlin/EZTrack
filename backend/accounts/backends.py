from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend

User = get_user_model()


class EmailBackend(ModelBackend):
    """Case-insensitive email login.

    Without this, registration and login disagree: we lowercase the email when
    creating a user, but the default backend looks it up with an exact match. A
    user who signs up as `test@x.com` and later types `Test@x.com` gets a 401 and
    no clue why. Matching on iexact keeps the two paths consistent.

    Rows are always stored lowercased (see UserManager.create_user), so iexact can
    never match more than one user.
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        # DRF/simplejwt passes the identifier as `email`; Django's admin passes it
        # as `username`. Accept either.
        email = kwargs.get("email") or username
        if email is None or password is None:
            return None

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            # Run the hasher anyway so a missing user and a wrong password take
            # roughly the same time — otherwise response timing leaks which emails
            # are registered.
            User().set_password(password)
            return None

        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
