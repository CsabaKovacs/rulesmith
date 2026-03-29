package com.example.demo

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

@RestController
class DemoController {
  @GetMapping("/health")
  fun health(): Map<String, Boolean> = mapOf("ok" to true)
}
