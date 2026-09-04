plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.csmeby.pcbviewer"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.csmeby.pcbviewer"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "4.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.8.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.documentfile:documentfile:1.1.0")
}

// Keeps the embedded web build in lockstep with webapp/dist -- mirrors
// ios/Scripts/copy-web-assets.sh. Run `npm run build` in webapp/ first.
tasks.register<Copy>("copyWebAssets") {
    from("$rootDir/../webapp/dist")
    into("$projectDir/src/main/assets")
}

tasks.named("preBuild") {
    dependsOn("copyWebAssets")
}
