import 'package:flutter/material.dart';

import '../state/app_state.dart';
import '../widgets/status_card.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({required this.state, super.key});

  final AppState state;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: StatusCard(title: state.title),
    );
  }
}
