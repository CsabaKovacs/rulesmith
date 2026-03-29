plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

android {
  namespace = "com.example.androidmin"
  compileSdk = 34

  defaultConfig {
    applicationId = "com.example.androidmin"
    minSdk = 24
    targetSdk = 34
  }
}
