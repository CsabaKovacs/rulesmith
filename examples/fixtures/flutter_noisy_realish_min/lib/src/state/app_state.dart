import 'package:flutter/foundation.dart';

import '../data/family_service.dart';

class AppState extends ChangeNotifier {
  final FamilyService _service = FamilyService();

  String get title => _service.title();
}
