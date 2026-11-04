package app.mindlyte.xr

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.os.Bundle
import android.provider.Settings

/**
 * "Share to TV" from the MindLyte web app (it opens mindlyte://cast).
 *
 * Opens Android's Cast screen, where you pick an Android TV, Chromecast or
 * other cast-ready display to mirror MindLyte to, then steps out of the way.
 * Older devices without that screen get the wireless display settings, or
 * Settings itself.
 */
class CastActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val tries = listOf(
            Intent(Settings.ACTION_CAST_SETTINGS),
            Intent("android.settings.WIFI_DISPLAY_SETTINGS"),
            Intent(Settings.ACTION_SETTINGS),
        )
        for (intent in tries) {
            try {
                startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                break
            } catch (_: ActivityNotFoundException) {
            } catch (_: SecurityException) {
            }
        }
        finish()
    }
}
