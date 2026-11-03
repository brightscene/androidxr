package app.mindlyte.xr

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private val Ink = Color(0xFF0A0A1C)
private val Fg = Color(0xFFF3F1EE)
private val Muted = Color(0x99F3F1EE)
private val Line = Color(0x24FFFFFF)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val catalog = Catalog.load(this)
        val prefs = getSharedPreferences("mindlyte", MODE_PRIVATE)
        setContent {
            MaterialTheme(colorScheme = darkColorScheme(background = Ink, surface = Ink, primary = Fg)) {
                Menu(
                    catalog,
                    premiumStart = prefs.getBoolean("premium", false),
                    onPremium = { prefs.edit().putBoolean("premium", it).apply() },
                    onBegin = { j, scene -> begin(j, scene) },
                )
            }
        }
    }

    private fun begin(j: Journey, sceneOverride: String) {
        val scene = if (sceneOverride == "auto") j.scene else sceneOverride
        startActivity(Intent(this, ImmersiveActivity::class.java).apply {
            putExtra("scene", scene)
            putExtra("title", j.title)
            putExtra("audio", j.audio)
            putExtra("freq", j.freq)
            putExtra("palette", j.palette.map { it.value.toLong() }.toLongArray())
        })
    }
}

@Composable
private fun Menu(catalog: Catalog, premiumStart: Boolean, onPremium: (Boolean) -> Unit, onBegin: (Journey, String) -> Unit) {
    var tab by remember { mutableStateOf("Journeys") }
    var selected by remember { mutableStateOf(catalog.free.first()) }
    var scene by remember { mutableStateOf("auto") }
    var premium by remember { mutableStateOf(premiumStart) }
    var unlock by remember { mutableStateOf(false) }
    val locked = !selected.free && !premium

    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF0D0B26), Ink)))) {
        Column(Modifier.fillMaxSize().padding(horizontal = 28.dp, vertical = 22.dp)) {
            Header(
                onToggleTest = { premium = !premium; onPremium(premium) },
            )
            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for (t in listOf("Journeys", "Scene")) Pill(t, tab == t) { tab = t }
            }
            Spacer(Modifier.height(10.dp))
            Box(Modifier.weight(1f)) {
                when (tab) {
                    "Journeys" -> JourneyList(catalog, selected, premium, onSelect = { selected = it }, onUnlock = { unlock = true })
                    else -> SceneGrid(catalog, scene) { scene = it }
                }
            }
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Button(
                    onClick = { if (locked) unlock = true else onBegin(selected, scene) },
                    colors = ButtonDefaults.buttonColors(containerColor = Fg, contentColor = Color(0xFF111111)),
                    contentPadding = PaddingValues(horizontal = 30.dp, vertical = 14.dp),
                ) { Text(if (locked) "Unlock to begin" else "Begin", fontSize = 16.sp, fontWeight = FontWeight.SemiBold) }
                Column {
                    Text(selected.title, color = Fg, fontSize = 17.sp, fontWeight = FontWeight.Medium)
                    val sc = if (scene == "auto") selected.scene else scene
                    Text("${selected.kind} · ${catalog.scenes.firstOrNull { it.id == sc }?.label ?: sc}", color = Muted, fontSize = 13.sp)
                }
            }
        }
        if (unlock) UnlockDialog(premium) { unlock = false }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Header(onToggleTest: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        // long-press the name to unlock Premium for testing (until payments are connected)
        Text(
            buildAnnotatedString {
                withStyle(SpanStyle(color = Color(0xFFE9E4FF), fontWeight = FontWeight.Light)) { append("mind") }
                withStyle(SpanStyle(brush = Brush.horizontalGradient(listOf(Color(0xFF5ED6D0), Color(0xFFA493FF), Color(0xFFF29BD0))), fontWeight = FontWeight.Medium)) { append("lyte") }
            },
            fontSize = 34.sp,
            modifier = Modifier.combinedClickable(onClick = {}, onLongClick = onToggleTest),
        )
    }
}

@Composable
private fun Pill(label: String, on: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.clip(RoundedCornerShape(50)).background(if (on) Fg else Color(0x10FFFFFF))
            .border(1.dp, if (on) Color.Transparent else Line, RoundedCornerShape(50))
            .clickable(onClick = onClick).padding(horizontal = 18.dp, vertical = 8.dp),
    ) { Text(label, color = if (on) Color(0xFF111111) else Fg, fontSize = 14.sp) }
}

@Composable
private fun JourneyList(catalog: Catalog, selected: Journey, premium: Boolean, onSelect: (Journey) -> Unit, onUnlock: () -> Unit) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        contentPadding = PaddingValues(bottom = 12.dp),
    ) {
        item(span = { GridItemSpan(2) }) { SectionHead("Free", null, null) }
        items(catalog.free, key = { it.id }) { JourneyCard(it, it == selected, false) { onSelect(it) } }
        item(span = { GridItemSpan(2) }) {
            SectionHead("Premium", if (premium) "Unlocked · thank you" else "£4.99 / month  ·  £39.99 / year", if (premium) null else onUnlock)
        }
        items(catalog.premium, key = { it.id }) { JourneyCard(it, it == selected, !premium) { onSelect(it) } }
    }
}

@Composable
private fun SectionHead(title: String, sub: String?, onUnlock: (() -> Unit)?) {
    Row(Modifier.fillMaxWidth().padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, color = Fg, fontSize = 21.sp, fontWeight = FontWeight.SemiBold)
        if (sub != null) Text(sub, color = Muted, fontSize = 14.sp, modifier = Modifier.padding(start = 16.dp))
        Spacer(Modifier.weight(1f))
        if (onUnlock != null) Pill("Unlock Premium", false, onUnlock)
    }
}

@Composable
private fun JourneyCard(j: Journey, sel: Boolean, locked: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(18.dp)
    Row(
        Modifier.fillMaxWidth().height(116.dp).clip(shape)
            .background(Brush.linearGradient(listOf(j.palette[0], j.palette[1], j.palette[2])), alpha = if (sel) 1f else 0.7f)
            .border(if (sel) 2.dp else 1.dp, if (sel) Color.White else Line, shape)
            .clickable(onClick = onClick).padding(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Preview(j.scene, j.palette[1], Modifier.fillMaxHeight().aspectRatio(16f / 9f).clip(RoundedCornerShape(11.dp)))
        Column(Modifier.padding(start = 12.dp, end = 4.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(j.title, color = Fg, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(j.intent, color = Fg.copy(alpha = 0.9f), fontSize = 12.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, lineHeight = 16.sp)
            Text(
                (if (locked) "🔒 " else "") + j.kind.uppercase(),
                color = if (j.free) Color(0xFF7FF0C8) else if (locked) Color(0xFFFFD27A) else Color(0xFFD8CCFF),
                fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.6.sp,
            )
        }
    }
}

// The 20-second preview: a 10×10 sheet of frames played at 5 a second
private val sheetCache = HashMap<String, ImageBitmap>()

@Composable
private fun Preview(scene: String, tint: Color, modifier: Modifier) {
    val ctx = LocalContext.current
    var sheet by remember(scene) { mutableStateOf(sheetCache[scene]) }
    LaunchedEffect(scene) {
        if (sheet == null) sheet = withContext(Dispatchers.IO) {
            runCatching {
                ctx.assets.open("previews/$scene.jpg").use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.RGB_565 }) }
                    ?.asImageBitmap()?.also { sheetCache[scene] = it }
            }.getOrNull()
        }
    }
    var frame by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        val start = withFrameNanos { it }
        while (true) withFrameNanos { frame = (((it - start) / 200_000_000L) % 100).toInt() }
    }
    Canvas(modifier.background(tint)) {
        val s = sheet ?: return@Canvas
        val fw = s.width / 10; val fh = s.height / 10
        drawImage(
            s, srcOffset = IntOffset((frame % 10) * fw, (frame / 10) * fh), srcSize = IntSize(fw, fh),
            dstSize = IntSize(size.width.toInt(), size.height.toInt()),
        )
    }
}

@Composable
private fun SceneGrid(catalog: Catalog, current: String, onPick: (String) -> Unit) {
    var group by remember { mutableStateOf(catalog.scenes.firstOrNull { it.id == current }?.group ?: "Simple") }
    Column {
        Row(Modifier.padding(bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for (g in Catalog.GROUPS) Pill(g, g == group) { group = g }
        }
        val auto = SceneInfo("auto", "Auto", "Simple", catalog.scenes.firstOrNull { it.id == "galaxy" }?.palette ?: listOf(Ink, Ink, Ink))
        val list = (listOf(auto) + catalog.scenes).filter { it.group == group }
        LazyVerticalGrid(columns = GridCells.Adaptive(170.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(list, key = { it.id }) { s ->
                val sel = s.id == current
                val shape = RoundedCornerShape(16.dp)
                Column(
                    Modifier.height(84.dp).clip(shape)
                        .background(Brush.linearGradient(s.palette), alpha = if (sel) 1f else 0.66f)
                        .border(if (sel) 2.dp else 1.dp, if (sel) Color.White else Line, shape)
                        .clickable { onPick(s.id) }.padding(14.dp),
                    verticalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(s.label, color = Fg, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 2)
                    Text(if (s.id == "auto") "each journey's own world" else s.group, color = Fg.copy(alpha = 0.85f), fontSize = 12.sp)
                }
            }
        }
    }
}

@Composable
private fun UnlockDialog(premium: Boolean, onClose: () -> Unit) {
    var msg by remember { mutableStateOf("Cancel any time.") }
    AlertDialog(
        onDismissRequest = onClose,
        containerColor = Color(0xF5100E24),
        title = { Text("MindLyte Premium", color = Fg) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Every journey: light & sound tracks, guided sessions, solfeggio soundscapes, image cycling and the affirmation field. New journeys as they arrive.", color = Fg)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Pill("£4.99 / month", true) { msg = "Payments are coming soon. Thank you for your interest!" }
                    Pill("£39.99 / year", true) { msg = "Payments are coming soon. Thank you for your interest!" }
                }
                Text(msg, color = Muted, fontSize = 13.sp)
            }
        },
        confirmButton = { TextButton(onClick = onClose) { Text("Not now", color = Fg) } },
    )
}
