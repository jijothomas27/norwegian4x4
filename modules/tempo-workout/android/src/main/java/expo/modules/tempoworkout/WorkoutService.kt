package expo.modules.tempoworkout

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.PowerManager
import android.util.Log

/**
 * Foreground service that runs for the length of a workout.
 *
 * Android stops a backgrounded app's JavaScript timers (and may freeze the app
 * entirely), so stage changes would only be announced when you come back to
 * Tempo. This service owns the cue schedule instead: it checks the wall clock
 * a few times a second and speaks / vibrates natively, whatever app is in
 * front and whether or not the screen is on. Being a foreground service also
 * keeps the process alive, so the Bluetooth heart-rate stream keeps flowing.
 *
 * It also records GPS (when location permission was granted) and offers
 * Pause / Resume / Skip buttons in the notification.
 */
class WorkoutService : Service() {
  private val handler = WorkoutSession.main
  private var wakeLock: PowerManager.WakeLock? = null
  private var stopAt: Long? = null
  private var inForeground = false
  private var locationManager: LocationManager? = null
  private var tracking = false

  private val locationListener =
    object : LocationListener {
      override fun onLocationChanged(location: Location) = onLocation(location)

      override fun onProviderEnabled(provider: String) {}

      override fun onProviderDisabled(provider: String) {}

      @Deprecated("Deprecated in Java")
      override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
    }

  private val tick =
    object : Runnable {
      override fun run() {
        onTick()
        handler.postDelayed(this, TICK_MS)
      }
    }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    WorkoutSession.track.clear()
    CueSpeaker.init(this)
    createChannel()
    wakeLock =
      (getSystemService(Context.POWER_SERVICE) as? PowerManager)
        ?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Tempo:workout")
        ?.apply {
          setReferenceCounted(false)
          acquire(MAX_WORKOUT_MS)
        }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_PAUSE, ACTION_RESUME, ACTION_SKIP -> {
        // A button on a leftover notification after the workout ended — nothing to control.
        if (inForeground) handleAction(intent.action!!) else stopSelf()
        return START_NOT_STICKY
      }
    }
    if (!inForeground) {
      val notification = buildNotification()
      val withGps = hasLocationPermission()
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          var types = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
          if (withGps) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
          startForeground(NOTIFICATION_ID, notification, types)
        } else {
          startForeground(NOTIFICATION_ID, notification)
        }
        inForeground = true
        if (withGps) startTracking()
      } catch (e: Exception) {
        Log.w(TAG, "Could not start the workout service in the foreground", e)
        stopSelf()
        return START_NOT_STICKY
      }
    }
    WorkoutSession.service = this
    stopAt = null
    refreshNotification()
    handler.removeCallbacks(tick)
    handler.post(tick)
    return START_NOT_STICKY
  }

  /** JS sent a new schedule (start, pause, resume, skip). */
  fun onScheduleChanged() {
    stopAt = null
    refreshNotification()
  }

  private fun onTick() {
    val now = System.currentTimeMillis()
    for (cue in WorkoutSession.takeDue(now)) fire(cue, now)
    stopAt?.let { if (now >= it) stopSelf() }
  }

  private fun fire(cue: Cue, now: Long) {
    cue.status?.let {
      WorkoutSession.status = it
      refreshNotification()
    }
    if (cue.isFinal) {
      stopAt = now + LINGER_AFTER_FINISH_MS
      stopTracking()
      refreshNotification()
    }
    if (cue.skipIfLateMs > 0 && now - cue.at > cue.skipIfLateMs) return
    cue.vibrate?.let { CueSpeaker.vibrate(this, it) }
    cue.text?.let { CueSpeaker.speak(this, it) }
  }

  // ── Notification buttons ───────────────────────────────────────────────────

  private fun handleAction(action: String) {
    val now = System.currentTimeMillis()
    when (action) {
      ACTION_PAUSE -> {
        WorkoutSession.pause(now)
        CueSpeaker.speak(this, "Paused.")
        WorkoutSession.emit?.invoke("onAction", mapOf("action" to "pause", "at" to now.toDouble()))
      }
      ACTION_RESUME -> {
        WorkoutSession.resume(now)
        CueSpeaker.speak(this, "Resuming.")
        WorkoutSession.emit?.invoke("onAction", mapOf("action" to "resume", "at" to now.toDouble()))
      }
      ACTION_SKIP -> {
        // The app works out the next stage and sends a fresh schedule.
        CueSpeaker.stop()
        WorkoutSession.emit?.invoke("onAction", mapOf("action" to "skip", "at" to now.toDouble()))
      }
    }
    refreshNotification()
  }

  private fun actionIntent(action: String, requestCode: Int): PendingIntent =
    PendingIntent.getService(
      this,
      requestCode,
      Intent(this, WorkoutService::class.java).setAction(action),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

  private fun action(icon: Int, label: String, intent: PendingIntent): Notification.Action =
    Notification.Action.Builder(Icon.createWithResource(this, icon), label, intent).build()

  // ── GPS ────────────────────────────────────────────────────────────────────

  private fun hasLocationPermission(): Boolean =
    checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

  private fun startTracking() {
    if (tracking) return
    val lm = getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return
    try {
      if (!lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) return
      lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, GPS_INTERVAL_MS, 0f, locationListener, mainLooper)
      locationManager = lm
      tracking = true
    } catch (e: SecurityException) {
      Log.w(TAG, "Location permission missing", e)
    } catch (e: Exception) {
      Log.w(TAG, "Could not start GPS", e)
    }
  }

  private fun stopTracking() {
    if (!tracking) return
    try {
      locationManager?.removeUpdates(locationListener)
    } catch (_: Exception) {
      // ignore
    }
    tracking = false
  }

  private fun onLocation(location: Location) {
    val point =
      TrackPoint(
        t = location.time.takeIf { it > 0 } ?: System.currentTimeMillis(),
        lat = location.latitude,
        lon = location.longitude,
        alt = if (location.hasAltitude()) location.altitude else Double.NaN,
        acc = if (location.hasAccuracy()) location.accuracy.toDouble() else Double.NaN,
      )
    val track = WorkoutSession.track
    if (track.size >= MAX_TRACK_POINTS) return
    track.add(point)
    WorkoutSession.emit?.invoke("onLocation", point.toMap())
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    // The app was swiped away from Recents — end the session with it.
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    handler.removeCallbacks(tick)
    stopTracking()
    if (WorkoutSession.service === this) WorkoutSession.service = null
    WorkoutSession.clear()
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
    super.onDestroy()
  }

  // ── Notification ─────────────────────────────────────────────────────────

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel =
      NotificationChannel(CHANNEL_ID, "Workout in progress", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Shows the current stage while a workout is running"
        setShowBadge(false)
        setSound(null, null)
        enableVibration(false)
      }
    (getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager)?.createNotificationChannel(channel)
  }

  private fun refreshNotification() {
    if (!inForeground) return
    try {
      (getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager)?.notify(NOTIFICATION_ID, buildNotification())
    } catch (_: Exception) {
      // Missing notification permission just hides the notification; the service keeps running.
    }
  }

  private fun buildNotification(): Notification {
    val status = WorkoutSession.status
    val builder =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Notification.Builder(this, CHANNEL_ID)
      } else {
        @Suppress("DEPRECATION")
        Notification.Builder(this)
      }
    builder
      .setSmallIcon(R.drawable.tempo_workout_notification)
      .setContentTitle(status.title)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
    status.body?.let { builder.setContentText(it) }
    val endsAt = status.endsAt
    if (endsAt != null && endsAt > System.currentTimeMillis() && !status.paused) {
      builder.setShowWhen(true).setWhen(endsAt).setUsesChronometer(true)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) builder.setChronometerCountDown(true)
    } else {
      builder.setShowWhen(false).setUsesChronometer(false)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
    }
    if (stopAt == null && !status.title.startsWith("Workout complete")) {
      if (status.paused) {
        builder.addAction(action(R.drawable.tempo_action_play, "Resume", actionIntent(ACTION_RESUME, 2)))
      } else {
        builder.addAction(action(R.drawable.tempo_action_pause, "Pause", actionIntent(ACTION_PAUSE, 1)))
        if (status.canSkip) builder.addAction(action(R.drawable.tempo_action_skip, "Skip", actionIntent(ACTION_SKIP, 3)))
      }
    }
    packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
      launch.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
      builder.setContentIntent(
        PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT),
      )
    }
    return builder.build()
  }

  companion object {
    private const val TAG = "TempoWorkout"
    private const val CHANNEL_ID = "tempo-workout"
    private const val NOTIFICATION_ID = 4404
    private const val TICK_MS = 250L
    private const val MAX_WORKOUT_MS = 3L * 60 * 60 * 1000
    private const val LINGER_AFTER_FINISH_MS = 15_000L
    private const val GPS_INTERVAL_MS = 1000L
    /** ~5 hours at one fix per second. */
    private const val MAX_TRACK_POINTS = 18_000
    const val ACTION_PAUSE = "expo.modules.tempoworkout.PAUSE"
    const val ACTION_RESUME = "expo.modules.tempoworkout.RESUME"
    const val ACTION_SKIP = "expo.modules.tempoworkout.SKIP"
  }
}
