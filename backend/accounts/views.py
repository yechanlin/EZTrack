from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import RegisterSerializer, UserSerializer


def tokens_for(user):
    """Issue a fresh access/refresh pair. The app stores both in the device keychain."""
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    # Register and login are the only endpoints reachable without a token.
    # Everything else inherits IsAuthenticated from REST_FRAMEWORK settings.
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        # Log the user in immediately after registering, so the app doesn't have to
        # turn around and POST the same credentials to /login.
        return Response({"user": UserSerializer(user).data, **tokens_for(user)}, status=201)


class MeView(generics.RetrieveAPIView):
    """Lets the app check on launch whether a stored token is still valid."""

    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user
