package app.mindlyte.xr

import android.net.Uri
import com.google.androidbrowserhelper.trusted.LauncherActivity

/**
 * MindLyte for Android XR.
 *
 * Opens the MindLyte web app full screen in Chrome as a Trusted Web Activity,
 * so every scene, journey and WebXR immersive mode work exactly as on the site,
 * and updates to the site reach the app straight away.
 */
class MindLyteActivity : LauncherActivity() {

    // Tell the web app it's running inside the Android app (for Play billing later)
    override fun getLaunchingUrl(): Uri =
        super.getLaunchingUrl().buildUpon()
            .appendQueryParameter("source", "android-app")
            .build()
}
