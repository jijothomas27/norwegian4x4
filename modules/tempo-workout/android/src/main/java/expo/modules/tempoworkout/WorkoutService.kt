package expo.modules.tempoworkout

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
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
 */
class WorkoutService : Service() {
  private val handler = WorkoutSession.main
  private var wakeLock: PowerManager.WakeLock? = null
  private var stopAt: Long? = null
  private var inForeground = false

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
    if (!inForeground) {
      val notification = buildNotification()
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        } else {
          startForeground(NOTIFICATION_ID, notification)
        }
        inForeground = true
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
    if (cue.isFinal) stopAt = now + LINGER_AFTER_FINISH_MS
    if (cue.skipIfLateMs > 0 && now - cue.at > cue.skipIfLateMs) return
    cue.vibrate?.let { CueSpeaker.vibrate(this, it) }
    cue.text?.let { CueSpeaker.speak(this, it) }
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    // The app was swiped away from Recents — end the session with it.
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    handler.removeCallbacks(tick)
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
    if (endsAt != null && endsAt > System.currentTimeMillis()) {
      builder.setShowWhen(true).setWhen(endsAt).setUsesChronometer(true)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) builder.setChronometerCountDown(true)
    } else {
      builder.setShowWhen(false).setUsesChronometer(false)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
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
  }
}
