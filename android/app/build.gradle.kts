plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The site the app opens. Change this when MindBoss moves to its own domain.
val siteUrl = "https://brightscene.github.io/androidxr/"
val siteHost = "brightscene.github.io"

android {
    namespace = "app.mindlyte.xr"
    compileSdk = 34

    defaultConfig {
        applicationId = "app.mindlyte.xr"
        minSdk = 24
        targetSdk = 34
        // CI passes the run number so every build installs over the last one
        versionCode = (System.getenv("BUILD_NUMBER") ?: "1").toInt()
        versionName = "0.1.${System.getenv("BUILD_NUMBER") ?: "0"}"
        manifestPlaceholders["siteUrl"] = siteUrl
        manifestPlaceholders["siteHost"] = siteHost
    }

    // Signing. With an upload key provided (ANDROID_KEYSTORE_FILE, for the Play
    // Store) that's used; otherwise the shared TEST key in android/test-signing.jks,
    // which is public and only for sideloaded test builds.
    val ks = System.getenv("ANDROID_KEYSTORE_FILE")
    signingConfigs {
        create("mindlyte") {
            if (ks != null) {
                storeFile = file(ks)
                storePassword = System.getenv("ANDROID_KEY_PASSWORD")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            } else {
                storeFile = rootProject.file("test-signing.jks")
                storePassword = "mindlyte-test"
                keyPassword = "mindlyte-test"
            }
            keyAlias = "mindlyte"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            signingConfig = signingConfigs.getByName("mindlyte")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.5.0")
}
