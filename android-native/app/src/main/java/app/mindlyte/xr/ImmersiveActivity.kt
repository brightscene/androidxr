package app.mindlyte.xr

import android.app.NativeActivity
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Bundle

/**
 * A journey, fully immersive. The visuals are drawn by the native renderer
 * (src/main/cpp: OpenXR + OpenGL ES, using the same shaders as the web app);
 * this side looks after the sound.
 */
class ImmersiveActivity : NativeActivity() {
    private var player: MediaPlayer? = null

    // read by the native renderer through JNI
    @Suppress("unused") fun sceneName(): String = intent.getStringExtra("scene") ?: "nebula"
    @Suppress("unused") fun palette(): LongArray = intent.getLongArrayExtra("palette") ?: longArrayOf()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        intent.getStringExtra("audio")?.let { url ->
            player = MediaPlayer().apply {
                setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
                setDataSource(url)
                setOnPreparedListener { it.start() }
                setOnErrorListener { _, _, _ -> true }
                prepareAsync()
            }
        }
    }

    override fun onPause() { super.onPause(); player?.takeIf { it.isPlaying }?.pause() }
    override fun onResume() { super.onResume(); runCatching { player?.start() } }
    override fun onDestroy() { player?.release(); player = null; super.onDestroy() }
}
