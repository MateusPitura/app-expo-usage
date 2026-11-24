package expo.modules.usagestats

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Process
import android.provider.Settings
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Reads per-app foreground usage from Android's UsageStatsManager.
 *
 * We rebuild foreground "sessions" from the raw usage event stream
 * (ACTIVITY_RESUMED / ACTIVITY_PAUSED / screen-off ...) instead of using the
 * pre-aggregated daily buckets, because that is the only way to know *when*
 * during the day an app was used (hourly breakdown). JS then splits sessions
 * into local-time hour buckets.
 */
class UsageStatsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("UsageStats")

    Function("hasPermission") {
      hasUsageAccess()
    }

    Function("openUsageAccessSettings") {
      openUsageAccessSettings()
    }

    AsyncFunction("getInstalledApps") {
      launchableApps().map { (pkg, label) -> mapOf("packageName" to pkg, "label" to label) }
    }

    AsyncFunction("getSessions") { startMs: Double, endMs: Double ->
      if (!hasUsageAccess()) {
        throw CodedException("ERR_USAGE_ACCESS", "Usage access permission has not been granted.", null)
      }
      querySessions(startMs.toLong(), endMs.toLong())
    }
  }

  // ---------------------------------------------------------------------------
  // Permission
  // ---------------------------------------------------------------------------

  private fun hasUsageAccess(): Boolean {
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    } else {
      @Suppress("DEPRECATION")
      appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    }
    return if (mode == AppOpsManager.MODE_DEFAULT) {
      // Some OEMs report MODE_DEFAULT even when the permission is granted.
      context.checkCallingOrSelfPermission(android.Manifest.permission.PACKAGE_USAGE_STATS) ==
        PackageManager.PERMISSION_GRANTED
    } else {
      mode == AppOpsManager.MODE_ALLOWED
    }
  }

  private fun openUsageAccessSettings() {
    val base = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      // Android 10+: jump straight to this app's toggle.
      context.startActivity(Intent(base).setData(Uri.parse("package:" + context.packageName)))
    } catch (e: Exception) {
      context.startActivity(base)
    }
  }

  // ---------------------------------------------------------------------------
  // Apps
  // ---------------------------------------------------------------------------

  /** package name -> display label, for apps that have a launcher icon. */
  private fun launchableApps(): Map<String, String> {
    val pm = context.packageManager
    val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    val result = LinkedHashMap<String, String>()
    for (ri in pm.queryIntentActivities(intent, 0)) {
      val pkg = ri.activityInfo?.packageName ?: continue
      if (result.containsKey(pkg)) continue
      result[pkg] = try {
        ri.loadLabel(pm).toString()
      } catch (e: Exception) {
        pkg
      }
    }
    return result
  }

  // ---------------------------------------------------------------------------
  // Sessions
  // ---------------------------------------------------------------------------

  private fun querySessions(startMs: Long, endMs: Long): Map<String, Any> {
    val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val apps = launchableApps()
    val to = minOf(endMs, System.currentTimeMillis())
    if (to <= startMs) return mapOf("sessions" to emptyList<Any>(), "labels" to emptyMap<String, String>())

    // Look back a little so an app that was already in the foreground when the
    // window opened (e.g. across midnight) still gets its RESUMED event.
    val events = usm.queryEvents(startMs - LOOKBACK_MS, to)
    val event = UsageEvents.Event()
    val openSince = HashMap<String, Long>()
    val spans = HashMap<String, MutableList<LongArray>>()

    fun close(pkg: String, at: Long) {
      val s = openSince.remove(pkg) ?: return
      val clippedStart = maxOf(s, startMs)
      val clippedEnd = minOf(at, to)
      if (clippedEnd > clippedStart) {
        spans.getOrPut(pkg) { ArrayList() }.add(longArrayOf(clippedStart, clippedEnd))
      }
    }

    while (events != null && events.hasNextEvent()) {
      events.getNextEvent(event)
      when (event.eventType) {
        EVENT_SCREEN_NON_INTERACTIVE, EVENT_DEVICE_SHUTDOWN -> {
          // Screen off / shutdown: nothing can be in the foreground any more.
          for (p in openSince.keys.toList()) close(p, event.timeStamp)
        }
        EVENT_ACTIVITY_RESUMED -> {
          val pkg = event.packageName
          if (pkg != null && apps.containsKey(pkg) && !openSince.containsKey(pkg)) {
            openSince[pkg] = event.timeStamp
          }
        }
        EVENT_ACTIVITY_PAUSED, EVENT_ACTIVITY_STOPPED -> {
          val pkg = event.packageName
          if (pkg != null) close(pkg, event.timeStamp)
        }
      }
    }
    for (p in openSince.keys.toList()) close(p, to)

    val sessions = ArrayList<Map<String, Any>>()
    val labels = HashMap<String, String>()
    for ((pkg, list) in spans) {
      list.sortBy { it[0] }
      // Merge spans separated by a tiny gap (activity -> activity inside one app).
      var curStart = list[0][0]
      var curEnd = list[0][1]
      fun flush() {
        sessions.add(
          mapOf("packageName" to pkg, "start" to curStart.toDouble(), "end" to curEnd.toDouble())
        )
      }
      for (i in 1 until list.size) {
        val s = list[i]
        if (s[0] - curEnd <= MERGE_GAP_MS) {
          if (s[1] > curEnd) curEnd = s[1]
        } else {
          flush()
          curStart = s[0]
          curEnd = s[1]
        }
      }
      flush()
      labels[pkg] = apps[pkg] ?: pkg
    }

    return mapOf("sessions" to sessions, "labels" to labels)
  }

  companion object {
    // Values of UsageEvents.Event.* (hard-coded: some are API 29+ only).
    private const val EVENT_ACTIVITY_RESUMED = 1 // == MOVE_TO_FOREGROUND
    private const val EVENT_ACTIVITY_PAUSED = 2 // == MOVE_TO_BACKGROUND
    private const val EVENT_SCREEN_NON_INTERACTIVE = 16
    private const val EVENT_ACTIVITY_STOPPED = 23
    private const val EVENT_DEVICE_SHUTDOWN = 26

    private const val LOOKBACK_MS = 12L * 60 * 60 * 1000
    private const val MERGE_GAP_MS = 1500L
  }
}
