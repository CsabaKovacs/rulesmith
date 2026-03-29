import 'package:flutter/material.dart';

import 'localization/app_strings.dart';
import 'screens/home_screen.dart';
import 'state/app_state.dart';

class FamilyApp extends StatefulWidget {
  const FamilyApp({super.key});

  @override
  State<FamilyApp> createState() => _FamilyAppState();
}

class _FamilyAppState extends State<FamilyApp> {
  final AppState _state = AppState();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: AppStrings.title,
      home: HomeScreen(state: _state),
    );
  }
}
