import 'package:flutter/material.dart';

class StatusCard extends StatelessWidget {
  const StatusCard({required this.title, super.key});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Card(child: Text(title));
  }
}
