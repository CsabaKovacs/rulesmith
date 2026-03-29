class AuthException implements Exception {}

class PostgrestException implements Exception {}

class FamilyAuthService {
  FamilyAuthService._();

  static final FamilyAuthService instance = FamilyAuthService._();

  Future<void> finishOnboarding() async {}
}
