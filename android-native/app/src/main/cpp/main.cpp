// MindLyte immersive renderer: OpenXR + OpenGL ES 3.
//
// Each scene is a "world shader": for every pixel of each eye it gets the
// direction you're looking in and returns a colour, exactly like the domes in
// the web app. Scenes live in assets/shaders/<scene>.frag and share a prelude
// (noise, stars, colour grading) ported from src/visuals/common.js.

#include <android/asset_manager.h>
#include <android/log.h>
#include <android_native_app_glue.h>
#include <EGL/egl.h>
#include <GLES3/gl32.h>
#include <jni.h>

#define XR_USE_PLATFORM_ANDROID
#define XR_USE_GRAPHICS_API_OPENGL_ES
#include <openxr/openxr.h>
#include <openxr/openxr_platform.h>

#include <chrono>
#include <cmath>
#include <cstring>
#include <string>
#include <vector>

#define LOG(...) __android_log_print(ANDROID_LOG_INFO, "MindLyte", __VA_ARGS__)
#define CHECK(x) do { XrResult r_ = (x); if (XR_FAILED(r_)) { LOG("%s failed: %d", #x, r_); return false; } } while (0)

namespace {

struct Swapchain {
  XrSwapchain handle = XR_NULL_HANDLE;
  int32_t w = 0, h = 0;
  std::vector<XrSwapchainImageOpenGLESKHR> images;
  std::vector<GLuint> fbos;
};

struct App {
  android_app* android = nullptr;
  bool resumed = false;

  // EGL
  EGLDisplay display = EGL_NO_DISPLAY;
  EGLConfig config = nullptr;
  EGLContext context = EGL_NO_CONTEXT;
  EGLSurface surface = EGL_NO_SURFACE;

  // OpenXR
  XrInstance instance = XR_NULL_HANDLE;
  XrSystemId system = XR_NULL_SYSTEM_ID;
  XrSession session = XR_NULL_HANDLE;
  XrSpace space = XR_NULL_HANDLE;
  XrSessionState state = XR_SESSION_STATE_UNKNOWN;
  bool running = false, exit = false;
  std::vector<XrViewConfigurationView> configViews;
  std::vector<Swapchain> swapchains;
  std::vector<XrView> views;

  // input: hold a pinch or trigger for two seconds to leave the journey
  XrActionSet actionSet = XR_NULL_HANDLE;
  XrAction select = XR_NULL_HANDLE;
  float holdTime = 0;

  // scene
  std::string scene = "nebula";
  float pal[3][3] = {{0.04f, 0.1f, 0.2f}, {0.12f, 0.43f, 0.55f}, {0.6f, 0.88f, 0.85f}};
  GLuint program = 0, vao = 0, noiseTex = 0;
  GLint uRot = -1, uTan = -1, uTime = -1, uFade = -1, uTravel = -1, uC0 = -1, uC1 = -1, uC2 = -1;
  double t0 = 0;
};

double now() {
  return std::chrono::duration<double>(std::chrono::steady_clock::now().time_since_epoch()).count();
}

// ---------------------------------------------------------------- JNI: what to show
std::string jstr(JNIEnv* env, jstring s) {
  if (!s) return "";
  const char* c = env->GetStringUTFChars(s, nullptr);
  std::string r(c);
  env->ReleaseStringUTFChars(s, c);
  return r;
}

float srgbToLinear(float c) { return c <= 0.04045f ? c / 12.92f : std::pow((c + 0.055f) / 1.055f, 2.4f); }

void readIntent(App& a) {
  JNIEnv* env = nullptr;
  a.android->activity->vm->AttachCurrentThread(&env, nullptr);
  jobject act = a.android->activity->clazz;
  jclass cls = env->GetObjectClass(act);
  jmethodID mScene = env->GetMethodID(cls, "sceneName", "()Ljava/lang/String;");
  if (mScene) a.scene = jstr(env, (jstring)env->CallObjectMethod(act, mScene));
  jmethodID mPal = env->GetMethodID(cls, "palette", "()[J");
  if (mPal) {
    auto arr = (jlongArray)env->CallObjectMethod(act, mPal);
    if (arr && env->GetArrayLength(arr) >= 3) {
      jlong v[3];
      env->GetLongArrayRegion(arr, 0, 3, v);
      // Compose Color.value: the sRGB ARGB colour sits in the top 32 bits
      for (int i = 0; i < 3; i++) {
        uint32_t argb = (uint32_t)((uint64_t)v[i] >> 32);
        a.pal[i][0] = srgbToLinear(((argb >> 16) & 255) / 255.f);
        a.pal[i][1] = srgbToLinear(((argb >> 8) & 255) / 255.f);
        a.pal[i][2] = srgbToLinear((argb & 255) / 255.f);
      }
    }
  }
  a.android->activity->vm->DetachCurrentThread();
  LOG("scene %s", a.scene.c_str());
}

// ---------------------------------------------------------------- shaders
std::string asset(App& a, const std::string& path) {
  AAsset* f = AAssetManager_open(a.android->activity->assetManager, path.c_str(), AASSET_MODE_BUFFER);
  if (!f) return "";
  std::string s((const char*)AAsset_getBuffer(f), AAsset_getLength(f));
  AAsset_close(f);
  return s;
}

GLuint compile(GLenum type, const std::string& src) {
  GLuint s = glCreateShader(type);
  const char* c = src.c_str();
  glShaderSource(s, 1, &c, nullptr);
  glCompileShader(s);
  GLint ok = 0;
  glGetShaderiv(s, GL_COMPILE_STATUS, &ok);
  if (!ok) {
    char log[2048];
    glGetShaderInfoLog(s, sizeof log, nullptr, log);
    LOG("shader error: %s", log);
    glDeleteShader(s);
    return 0;
  }
  return s;
}

const char* VS = R"(#version 300 es
uniform mat3 uRot;      // head orientation
uniform vec4 uTan;      // eye field of view: tan(left), tan(right), tan(down), tan(up)
out vec3 vDir;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;   // one big triangle
  vec2 uv = p * 0.5 + 0.5;
  vDir = uRot * vec3(mix(uTan.x, uTan.y, uv.x), mix(uTan.z, uTan.w, uv.y), -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}
)";

bool buildScene(App& a) {
  std::string prelude = asset(a, "shaders/prelude.glsl");
  std::string body = asset(a, "shaders/" + a.scene + ".frag");
  if (body.empty()) { LOG("no native shader for %s yet, using nebula", a.scene.c_str()); body = asset(a, "shaders/nebula.frag"); }
  std::string fs = prelude + body + R"(
void main() {
  vec4 c = scene(normalize(vDir));
  outColor = vec4(toLinear(c.rgb * uFade), 1.0);   // the swapchain is sRGB, so this writes the same values as the web app
}
)";
  GLuint v = compile(GL_VERTEX_SHADER, VS), f = compile(GL_FRAGMENT_SHADER, fs);
  if (!v || !f) return false;
  a.program = glCreateProgram();
  glAttachShader(a.program, v);
  glAttachShader(a.program, f);
  glLinkProgram(a.program);
  glDeleteShader(v);
  glDeleteShader(f);
  GLint ok = 0;
  glGetProgramiv(a.program, GL_LINK_STATUS, &ok);
  if (!ok) { LOG("link failed"); return false; }
  glUseProgram(a.program);
  a.uRot = glGetUniformLocation(a.program, "uRot");
  a.uTan = glGetUniformLocation(a.program, "uTan");
  a.uTime = glGetUniformLocation(a.program, "uTime");
  a.uFade = glGetUniformLocation(a.program, "uFade");
  a.uTravel = glGetUniformLocation(a.program, "uTravel");
  a.uC0 = glGetUniformLocation(a.program, "uC0");
  a.uC1 = glGetUniformLocation(a.program, "uC1");
  a.uC2 = glGetUniformLocation(a.program, "uC2");
  glUniform1i(glGetUniformLocation(a.program, "uNoiseTex"), 0);
  glUniform1f(glGetUniformLocation(a.program, "uOct"), 4.f);
  glUniform1f(glGetUniformLocation(a.program, "uEnergy"), 0.4f);
  glGenVertexArrays(1, &a.vao);
  return true;
}

// the same tileable 3D value noise the web app bakes (src/visuals/common.js)
void makeNoise(App& a) {
  const int size = 64, period = 16;
  std::vector<float> lat(period * period * period);
  uint32_t seed = 1234567;
  for (auto& v : lat) { seed = (seed * 1103515245u + 12345u) & 0x7fffffff; v = seed / float(0x7fffffff); }
  auto L = [&](int x, int y, int z) { return lat[((z % period) * period + (y % period)) * period + (x % period)]; };
  auto sm = [](float t) { return t * t * (3 - 2 * t); };
  std::vector<uint8_t> data(size * size * size);
  const float k = float(period) / size;
  for (int z = 0; z < size; z++) for (int y = 0; y < size; y++) for (int x = 0; x < size; x++) {
    float fx = x * k, fy = y * k, fz = z * k;
    int ix = (int)fx, iy = (int)fy, iz = (int)fz;
    float ux = sm(fx - ix), uy = sm(fy - iy), uz = sm(fz - iz);
    float A = L(ix, iy, iz) + (L(ix + 1, iy, iz) - L(ix, iy, iz)) * ux;
    float B = L(ix, iy + 1, iz) + (L(ix + 1, iy + 1, iz) - L(ix, iy + 1, iz)) * ux;
    float C = L(ix, iy, iz + 1) + (L(ix + 1, iy, iz + 1) - L(ix, iy, iz + 1)) * ux;
    float D = L(ix, iy + 1, iz + 1) + (L(ix + 1, iy + 1, iz + 1) - L(ix, iy + 1, iz + 1)) * ux;
    float v = (A + (B - A) * uy) + ((C + (D - C) * uy) - (A + (B - A) * uy)) * uz;
    data[(z * size + y) * size + x] = (uint8_t)std::lround(v * 255);
  }
  glGenTextures(1, &a.noiseTex);
  glBindTexture(GL_TEXTURE_3D, a.noiseTex);
  glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
  glTexImage3D(GL_TEXTURE_3D, 0, GL_R8, size, size, size, 0, GL_RED, GL_UNSIGNED_BYTE, data.data());
  glTexParameteri(GL_TEXTURE_3D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_3D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_3D, GL_TEXTURE_WRAP_S, GL_REPEAT);
  glTexParameteri(GL_TEXTURE_3D, GL_TEXTURE_WRAP_T, GL_REPEAT);
  glTexParameteri(GL_TEXTURE_3D, GL_TEXTURE_WRAP_R, GL_REPEAT);
}

// ---------------------------------------------------------------- EGL
bool initEGL(App& a) {
  a.display = eglGetDisplay(EGL_DEFAULT_DISPLAY);
  eglInitialize(a.display, nullptr, nullptr);
  const EGLint attribs[] = {EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8, EGL_ALPHA_SIZE, 8,
                            EGL_RENDERABLE_TYPE, EGL_OPENGL_ES3_BIT, EGL_SURFACE_TYPE, EGL_PBUFFER_BIT, EGL_NONE};
  EGLint n = 0;
  if (!eglChooseConfig(a.display, attribs, &a.config, 1, &n) || n == 0) { LOG("no EGL config"); return false; }
  const EGLint ctx[] = {EGL_CONTEXT_CLIENT_VERSION, 3, EGL_NONE};
  a.context = eglCreateContext(a.display, a.config, EGL_NO_CONTEXT, ctx);
  const EGLint pb[] = {EGL_WIDTH, 16, EGL_HEIGHT, 16, EGL_NONE};
  a.surface = eglCreatePbufferSurface(a.display, a.config, pb);
  if (!eglMakeCurrent(a.display, a.surface, a.surface, a.context)) { LOG("eglMakeCurrent failed"); return false; }
  return true;
}

// ---------------------------------------------------------------- OpenXR
bool initXR(App& a) {
  PFN_xrInitializeLoaderKHR initLoader = nullptr;
  xrGetInstanceProcAddr(XR_NULL_HANDLE, "xrInitializeLoaderKHR", (PFN_xrVoidFunction*)&initLoader);
  if (initLoader) {
    XrLoaderInitInfoAndroidKHR li{XR_TYPE_LOADER_INIT_INFO_ANDROID_KHR};
    li.applicationVM = a.android->activity->vm;
    li.applicationContext = a.android->activity->clazz;
    initLoader((XrLoaderInitInfoBaseHeaderKHR*)&li);
  }

  const char* exts[] = {XR_KHR_ANDROID_CREATE_INSTANCE_EXTENSION_NAME, XR_KHR_OPENGL_ES_ENABLE_EXTENSION_NAME};
  XrInstanceCreateInfoAndroidKHR android{XR_TYPE_INSTANCE_CREATE_INFO_ANDROID_KHR};
  android.applicationVM = a.android->activity->vm;
  android.applicationActivity = a.android->activity->clazz;
  XrInstanceCreateInfo ci{XR_TYPE_INSTANCE_CREATE_INFO};
  ci.next = &android;
  strcpy(ci.applicationInfo.applicationName, "MindLyte");
  ci.applicationInfo.applicationVersion = 1;
  strcpy(ci.applicationInfo.engineName, "MindLyte");
  ci.applicationInfo.apiVersion = XR_MAKE_VERSION(1, 0, 34);
  ci.enabledExtensionCount = 2;
  ci.enabledExtensionNames = exts;
  CHECK(xrCreateInstance(&ci, &a.instance));

  XrSystemGetInfo si{XR_TYPE_SYSTEM_GET_INFO};
  si.formFactor = XR_FORM_FACTOR_HEAD_MOUNTED_DISPLAY;
  CHECK(xrGetSystem(a.instance, &si, &a.system));

  PFN_xrGetOpenGLESGraphicsRequirementsKHR getReq = nullptr;
  xrGetInstanceProcAddr(a.instance, "xrGetOpenGLESGraphicsRequirementsKHR", (PFN_xrVoidFunction*)&getReq);
  XrGraphicsRequirementsOpenGLESKHR req{XR_TYPE_GRAPHICS_REQUIREMENTS_OPENGL_ES_KHR};
  CHECK(getReq(a.instance, a.system, &req));

  if (!initEGL(a)) return false;

  XrGraphicsBindingOpenGLESAndroidKHR gb{XR_TYPE_GRAPHICS_BINDING_OPENGL_ES_ANDROID_KHR};
  gb.display = a.display;
  gb.config = a.config;
  gb.context = a.context;
  XrSessionCreateInfo sci{XR_TYPE_SESSION_CREATE_INFO};
  sci.next = &gb;
  sci.systemId = a.system;
  CHECK(xrCreateSession(a.instance, &sci, &a.session));

  XrReferenceSpaceCreateInfo rs{XR_TYPE_REFERENCE_SPACE_CREATE_INFO};
  rs.referenceSpaceType = XR_REFERENCE_SPACE_TYPE_LOCAL;
  rs.poseInReferenceSpace.orientation.w = 1;
  CHECK(xrCreateReferenceSpace(a.session, &rs, &a.space));

  // one swapchain per eye
  uint32_t n = 0;
  CHECK(xrEnumerateViewConfigurationViews(a.instance, a.system, XR_VIEW_CONFIGURATION_TYPE_PRIMARY_STEREO, 0, &n, nullptr));
  a.configViews.assign(n, {XR_TYPE_VIEW_CONFIGURATION_VIEW});
  CHECK(xrEnumerateViewConfigurationViews(a.instance, a.system, XR_VIEW_CONFIGURATION_TYPE_PRIMARY_STEREO, n, &n, a.configViews.data()));
  a.views.assign(n, {XR_TYPE_VIEW});

  uint32_t fc = 0;
  xrEnumerateSwapchainFormats(a.session, 0, &fc, nullptr);
  std::vector<int64_t> formats(fc);
  xrEnumerateSwapchainFormats(a.session, fc, &fc, formats.data());
  int64_t format = formats.empty() ? GL_SRGB8_ALPHA8 : formats[0];
  for (auto f : formats) if (f == GL_SRGB8_ALPHA8) format = f;

  for (auto& cv : a.configViews) {
    Swapchain sc;
    // a little under full resolution keeps the shaders smooth on the headset
    sc.w = (int32_t)(cv.recommendedImageRectWidth * 0.8f);
    sc.h = (int32_t)(cv.recommendedImageRectHeight * 0.8f);
    XrSwapchainCreateInfo ci2{XR_TYPE_SWAPCHAIN_CREATE_INFO};
    ci2.usageFlags = XR_SWAPCHAIN_USAGE_COLOR_ATTACHMENT_BIT;
    ci2.format = format;
    ci2.sampleCount = 1;
    ci2.width = sc.w;
    ci2.height = sc.h;
    ci2.faceCount = 1;
    ci2.arraySize = 1;
    ci2.mipCount = 1;
    CHECK(xrCreateSwapchain(a.session, &ci2, &sc.handle));
    uint32_t ic = 0;
    xrEnumerateSwapchainImages(sc.handle, 0, &ic, nullptr);
    sc.images.assign(ic, {XR_TYPE_SWAPCHAIN_IMAGE_OPENGL_ES_KHR});
    xrEnumerateSwapchainImages(sc.handle, ic, &ic, (XrSwapchainImageBaseHeader*)sc.images.data());
    sc.fbos.resize(ic);
    glGenFramebuffers(ic, sc.fbos.data());
    for (uint32_t i = 0; i < ic; i++) {
      glBindFramebuffer(GL_FRAMEBUFFER, sc.fbos[i]);
      glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, sc.images[i].image, 0);
    }
    a.swapchains.push_back(sc);
  }

  // input
  XrActionSetCreateInfo as{XR_TYPE_ACTION_SET_CREATE_INFO};
  strcpy(as.actionSetName, "main");
  strcpy(as.localizedActionSetName, "Main");
  CHECK(xrCreateActionSet(a.instance, &as, &a.actionSet));
  XrActionCreateInfo ac{XR_TYPE_ACTION_CREATE_INFO};
  ac.actionType = XR_ACTION_TYPE_BOOLEAN_INPUT;
  strcpy(ac.actionName, "select");
  strcpy(ac.localizedActionName, "Select");
  CHECK(xrCreateAction(a.actionSet, &ac, &a.select));
  XrPath profile, left, right;
  xrStringToPath(a.instance, "/interaction_profiles/khr/simple_controller", &profile);
  xrStringToPath(a.instance, "/user/hand/left/input/select/click", &left);
  xrStringToPath(a.instance, "/user/hand/right/input/select/click", &right);
  XrActionSuggestedBinding b[] = {{a.select, left}, {a.select, right}};
  XrInteractionProfileSuggestedBinding sb{XR_TYPE_INTERACTION_PROFILE_SUGGESTED_BINDING};
  sb.interactionProfile = profile;
  sb.countSuggestedBindings = 2;
  sb.suggestedBindings = b;
  xrSuggestInteractionProfileBindings(a.instance, &sb);
  XrSessionActionSetsAttachInfo at{XR_TYPE_SESSION_ACTION_SETS_ATTACH_INFO};
  at.countActionSets = 1;
  at.actionSets = &a.actionSet;
  CHECK(xrAttachSessionActionSets(a.session, &at));

  makeNoise(a);
  if (!buildScene(a)) return false;
  a.t0 = now();
  return true;
}

void pollEvents(App& a) {
  XrEventDataBuffer ev{XR_TYPE_EVENT_DATA_BUFFER};
  while (xrPollEvent(a.instance, &ev) == XR_SUCCESS) {
    if (ev.type == XR_TYPE_EVENT_DATA_SESSION_STATE_CHANGED) {
      auto* s = (XrEventDataSessionStateChanged*)&ev;
      a.state = s->state;
      if (a.state == XR_SESSION_STATE_READY) {
        XrSessionBeginInfo bi{XR_TYPE_SESSION_BEGIN_INFO};
        bi.primaryViewConfigurationType = XR_VIEW_CONFIGURATION_TYPE_PRIMARY_STEREO;
        if (XR_SUCCEEDED(xrBeginSession(a.session, &bi))) a.running = true;
      } else if (a.state == XR_SESSION_STATE_STOPPING) {
        xrEndSession(a.session);
        a.running = false;
      } else if (a.state == XR_SESSION_STATE_EXITING || a.state == XR_SESSION_STATE_LOSS_PENDING) {
        a.exit = true;
      }
    } else if (ev.type == XR_TYPE_EVENT_DATA_INSTANCE_LOSS_PENDING) {
      a.exit = true;
    }
    ev = {XR_TYPE_EVENT_DATA_BUFFER};
  }
}

// rotation matrix (column-major) from a quaternion
void quatToMat3(const XrQuaternionf& q, float m[9]) {
  float x = q.x, y = q.y, z = q.z, w = q.w;
  m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y + z * w);     m[2] = 2 * (x * z - y * w);
  m[3] = 2 * (x * y - z * w);     m[4] = 1 - 2 * (x * x + z * z); m[5] = 2 * (y * z + x * w);
  m[6] = 2 * (x * z + y * w);     m[7] = 2 * (y * z - x * w);     m[8] = 1 - 2 * (x * x + y * y);
}

void input(App& a, float dt) {
  XrActiveActionSet aas{a.actionSet, XR_NULL_PATH};
  XrActionsSyncInfo sync{XR_TYPE_ACTIONS_SYNC_INFO};
  sync.countActiveActionSets = 1;
  sync.activeActionSets = &aas;
  if (XR_FAILED(xrSyncActions(a.session, &sync))) return;
  XrActionStateGetInfo gi{XR_TYPE_ACTION_STATE_GET_INFO};
  gi.action = a.select;
  XrActionStateBoolean st{XR_TYPE_ACTION_STATE_BOOLEAN};
  xrGetActionStateBoolean(a.session, &gi, &st);
  a.holdTime = (st.isActive && st.currentState) ? a.holdTime + dt : 0;
  if (a.holdTime > 2.0f) xrRequestExitSession(a.session);
}

void frame(App& a) {
  XrFrameWaitInfo wi{XR_TYPE_FRAME_WAIT_INFO};
  XrFrameState fs{XR_TYPE_FRAME_STATE};
  if (XR_FAILED(xrWaitFrame(a.session, &wi, &fs))) return;
  XrFrameBeginInfo bi{XR_TYPE_FRAME_BEGIN_INFO};
  xrBeginFrame(a.session, &bi);

  static double last = now();
  double tnow = now();
  float dt = (float)std::min(0.1, tnow - last);
  last = tnow;
  input(a, dt);

  std::vector<XrCompositionLayerProjectionView> pviews;
  XrCompositionLayerProjection layer{XR_TYPE_COMPOSITION_LAYER_PROJECTION};
  bool drew = false;
  if (fs.shouldRender) {
    XrViewLocateInfo li{XR_TYPE_VIEW_LOCATE_INFO};
    li.viewConfigurationType = XR_VIEW_CONFIGURATION_TYPE_PRIMARY_STEREO;
    li.displayTime = fs.predictedDisplayTime;
    li.space = a.space;
    XrViewState vs{XR_TYPE_VIEW_STATE};
    uint32_t n = (uint32_t)a.views.size();
    if (XR_SUCCEEDED(xrLocateViews(a.session, &li, &vs, n, &n, a.views.data())) &&
        (vs.viewStateFlags & XR_VIEW_STATE_ORIENTATION_VALID_BIT)) {
      float t = (float)(tnow - a.t0);
      pviews.resize(n);
      glUseProgram(a.program);
      glBindVertexArray(a.vao);
      glActiveTexture(GL_TEXTURE0);
      glBindTexture(GL_TEXTURE_3D, a.noiseTex);
      glUniform1f(a.uTime, t);
      glUniform1f(a.uFade, std::min(1.f, t / 2.5f));      // fade in from black
      glUniform1f(a.uTravel, t * 0.5f);
      glUniform3fv(a.uC0, 1, a.pal[0]);
      glUniform3fv(a.uC1, 1, a.pal[1]);
      glUniform3fv(a.uC2, 1, a.pal[2]);
      for (uint32_t i = 0; i < n; i++) {
        Swapchain& sc = a.swapchains[i];
        uint32_t idx = 0;
        XrSwapchainImageAcquireInfo ai{XR_TYPE_SWAPCHAIN_IMAGE_ACQUIRE_INFO};
        xrAcquireSwapchainImage(sc.handle, &ai, &idx);
        XrSwapchainImageWaitInfo wi2{XR_TYPE_SWAPCHAIN_IMAGE_WAIT_INFO};
        wi2.timeout = XR_INFINITE_DURATION;
        xrWaitSwapchainImage(sc.handle, &wi2);

        glBindFramebuffer(GL_FRAMEBUFFER, sc.fbos[idx]);
        glViewport(0, 0, sc.w, sc.h);
        const XrView& v = a.views[i];
        float rot[9];
        quatToMat3(v.pose.orientation, rot);
        glUniformMatrix3fv(a.uRot, 1, GL_FALSE, rot);
        glUniform4f(a.uTan, std::tan(v.fov.angleLeft), std::tan(v.fov.angleRight), std::tan(v.fov.angleDown), std::tan(v.fov.angleUp));
        glDrawArrays(GL_TRIANGLES, 0, 3);

        XrSwapchainImageReleaseInfo ri{XR_TYPE_SWAPCHAIN_IMAGE_RELEASE_INFO};
        xrReleaseSwapchainImage(sc.handle, &ri);

        pviews[i] = {XR_TYPE_COMPOSITION_LAYER_PROJECTION_VIEW};
        pviews[i].pose = v.pose;
        pviews[i].fov = v.fov;
        pviews[i].subImage.swapchain = sc.handle;
        pviews[i].subImage.imageRect = {{0, 0}, {sc.w, sc.h}};
      }
      glBindFramebuffer(GL_FRAMEBUFFER, 0);
      layer.space = a.space;
      layer.viewCount = n;
      layer.views = pviews.data();
      drew = true;
    }
  }
  const XrCompositionLayerBaseHeader* layers[] = {(XrCompositionLayerBaseHeader*)&layer};
  XrFrameEndInfo ei{XR_TYPE_FRAME_END_INFO};
  ei.displayTime = fs.predictedDisplayTime;
  ei.environmentBlendMode = XR_ENVIRONMENT_BLEND_MODE_OPAQUE;
  ei.layerCount = drew ? 1 : 0;
  ei.layers = drew ? layers : nullptr;
  xrEndFrame(a.session, &ei);
}

void onCmd(android_app* app, int32_t cmd) {
  auto* a = (App*)app->userData;
  if (cmd == APP_CMD_RESUME) a->resumed = true;
  if (cmd == APP_CMD_PAUSE) a->resumed = false;
  if (cmd == APP_CMD_DESTROY) a->exit = true;
}

void cleanup(App& a) {
  for (auto& sc : a.swapchains) if (sc.handle) xrDestroySwapchain(sc.handle);
  if (a.actionSet) xrDestroyActionSet(a.actionSet);
  if (a.space) xrDestroySpace(a.space);
  if (a.session) xrDestroySession(a.session);
  if (a.instance) xrDestroyInstance(a.instance);
  if (a.display != EGL_NO_DISPLAY) {
    eglMakeCurrent(a.display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
    if (a.context != EGL_NO_CONTEXT) eglDestroyContext(a.display, a.context);
    if (a.surface != EGL_NO_SURFACE) eglDestroySurface(a.display, a.surface);
    eglTerminate(a.display);
  }
}

}  // namespace

void android_main(android_app* app) {
  App a;
  a.android = app;
  app->userData = &a;
  app->onAppCmd = onCmd;
  readIntent(a);

  if (!initXR(a)) {
    LOG("OpenXR start failed");
    cleanup(a);
    ANativeActivity_finish(app->activity);
    while (!app->destroyRequested) {
      int events; android_poll_source* src;
      if (ALooper_pollOnce(-1, nullptr, &events, (void**)&src) >= 0 && src) src->process(app, src);
    }
    return;
  }

  while (!app->destroyRequested) {
    for (;;) {
      int events; android_poll_source* src = nullptr;
      int timeout = (!a.resumed && !a.running && !a.exit) ? -1 : 0;
      if (ALooper_pollOnce(timeout, nullptr, &events, (void**)&src) < 0) break;
      if (src) src->process(app, src);
      if (app->destroyRequested) break;
    }
    if (app->destroyRequested) break;
    pollEvents(a);
    if (a.exit) { ANativeActivity_finish(app->activity); a.exit = false; a.running = false; continue; }
    if (a.running) frame(a);
  }
  cleanup(a);
}
