plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.mindlyte.xr"
    compileSdk = 34

    defaultConfig {
        // a separate id from the Chrome-shell test app, so both can be installed side by side
        applicationId = "app.mindlyte.xr.native"
        minSdk = 29
        targetSdk = 34
        versionCode = (System.getenv("BUILD_NUMBER") ?: "1").toInt()
        versionName = "0.2.${System.getenv("BUILD_NUMBER") ?: "0"}"
        ndk { abiFilters += listOf("arm64-v8a", "x86_64") }
        externalNativeBuild { cmake { cppFlags += "-std=c++17" } }
    }

    signingConfigs {
        create("test") {
            // the shared TEST key: public, only for sideloaded test builds
            storeFile = rootProject.file("test-signing.jks")
            storePassword = "mindlyte-test"
            keyAlias = "mindlyte"
            keyPassword = "mindlyte-test"
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("test")
        }
        debug { signingConfig = signingConfigs.getByName("test") }
    }

    externalNativeBuild { cmake { path = file("src/main/cpp/CMakeLists.txt") } }

    buildFeatures {
        compose = true
        prefab = true
    }
    composeOptions { kotlinCompilerExtensionVersion = "1.5.14" }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    // journey previews are shared with the website
    sourceSets["main"].assets.srcDirs("src/main/assets", "build/generated/previewAssets")
}

// copy the website's journey previews into the app
val copyPreviews by tasks.registering(Copy::class) {
    from(rootProject.file("../public/previews"))
    into(layout.buildDirectory.dir("generated/previewAssets/previews"))
}
tasks.named("preBuild") { dependsOn(copyPreviews) }

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.06.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.9.0")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("org.khronos.openxr:openxr_loader_for_android:1.1.38")
}
