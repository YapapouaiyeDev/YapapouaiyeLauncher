plugins { id("com.android.library") }

android {
    namespace = "fr.yapapouaiye.moteur"
    compileSdk = 35
    defaultConfig { minSdk = 26 }
    buildTypes { create("fordebug") { initWith(getByName("debug")) } }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
dependencies { testImplementation("junit:junit:4.13.2") }
