import 'package:flutter/material.dart';

import '../auth/family_auth_service.dart';
import '../state/app_state.dart';
import '../widgets/status_card.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({required this.state, super.key});

  final AppState state;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          StatusCard(title: state.title),
          TextButton(
            onPressed: () async {
              try {
                await FamilyAuthService.instance.finishOnboarding();
                if (!context.mounted) return;
                Navigator.of(context).popUntil((route) => route.isFirst);
              } on AuthException {
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Auth failed')),
                );
              } on PostgrestException {
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Backend failed')),
                );
              } catch (_) {
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Unknown failure')),
                );
              }
            },
            child: const Text('Finish'),
          ),
        ],
      ),
    );
  }
}
