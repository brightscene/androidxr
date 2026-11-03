package app.mindlyte.xr

import android.content.Context
import androidx.compose.ui.graphics.Color
import org.json.JSONArray
import org.json.JSONObject

// The journeys and scenes, shared with the website (assets/catalog.json is
// generated from the web app by tools/export-native.mjs).

data class Journey(
    val id: String, val title: String, val intent: String, val scene: String,
    val palette: List<Color>, val free: Boolean, val kind: String, val freq: Int, val audio: String?,
)

data class SceneInfo(val id: String, val label: String, val group: String, val palette: List<Color>)

class Catalog(val free: List<Journey>, val premium: List<Journey>, val scenes: List<SceneInfo>) {
    val all get() = free + premium

    companion object {
        val GROUPS = listOf("Simple", "Space", "Dimensions", "Mind", "Nature", "Sky & water", "Light journeys")

        fun load(ctx: Context): Catalog {
            val o = JSONObject(ctx.assets.open("catalog.json").bufferedReader().readText())
            val j = o.getJSONObject("journeys")
            return Catalog(
                journeys(j.getJSONArray("free")),
                journeys(j.getJSONArray("premium")),
                o.getJSONArray("scenes").objects().map {
                    SceneInfo(it.getString("id"), it.getString("label"), it.getString("group"), colours(it.getJSONArray("palette")))
                },
            )
        }

        private fun journeys(a: JSONArray) = a.objects().map {
            Journey(
                it.getString("id"), it.getString("title"), it.getString("intent"), it.getString("scene"),
                colours(it.getJSONArray("palette")), it.getBoolean("free"), it.getString("kind"),
                it.optInt("freq"), if (it.isNull("audio")) null else it.getString("audio"),
            )
        }

        private fun colours(a: JSONArray) = (0 until a.length()).map { Color(android.graphics.Color.parseColor(a.getString(it))) }
        private fun JSONArray.objects() = (0 until length()).map { getJSONObject(it) }
    }
}
