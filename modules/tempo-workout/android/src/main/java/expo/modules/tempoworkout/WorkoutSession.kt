package expo.modules.tempoworkout

import android.os.Handler
import android.os.Looper

/** One scheduled moment in the workout: speak, buzz, and/or update the notification. */
data class Cue(
  /** Wall-clock time (epoch ms) the cue is due. */
  val at: Long,
  val text: String?,
  /** "hard" | "easy" | "tick" | "soft" | "success" */
  val vibrate: String?,
  /** Drop the cue if it would fire later than this (0 = always fire). */
  val skipIfLateMs: Long,
  /** Last cue of the workout — the service shuts itself down shortly after. */
  val isFinal: Boolean,
  /** When set, the ongoing notification switches to this stage. */
  val status: Status?,
) {
  fun shiftedBy(ms: Long): Cue = copy(at = at + ms, status = status?.shiftedBy(ms))

  companion object {
    fun from(map: Map<String, Any?>): Cue? {
      val at = (map["at"] as? Number)?.toLong() ?: return null
      return Cue(
        at = at,
        text = map["text"] as? String,
        vibrate = map["vibrate"] as? String,
        skipIfLateMs = (map["skipIfLateMs"] as? Number)?.toLong() ?: 0L,
        isFinal = map["final"] as? Boolean ?: false,
        status = (map["status"] as? Map<*, *>)?.let { Status.from(it) },
      )
    }
  }
}

/** What the ongoing notification shows: current stage and (optionally) a live countdown. */
data class Status(
  val title: String,
  val body: String?,
  val endsAt: Long?,
  val paused: Boolean = false,
  /** Whether a "Skip" button makes sense (not on the last stage). */
  val canSkip: Boolean = true,
) {
  fun shiftedBy(ms: Long): Status = copy(endsAt = endsAt?.plus(ms))

  companion object {
    fun from(map: Map<*, *>): Status =
      Status(
        title = map["title"] as? String ?: "Workout in progress",
        body = map["body"] as? String,
        endsAt = (map["endsAt"] as? Number)?.toLong(),
        paused = map["paused"] as? Boolean ?: false,
        canSkip = map["canSkip"] as? Boolean ?: true,
      )
  }
}

/** One GPS fix. */
data class TrackPoint(
  val t: Long,
  val lat: Double,
  val lon: Double,
  /** Metres above sea level, or NaN when unknown. */
  val alt: Double,
  /** Horizontal accuracy in metres, or NaN when unknown. */
  val acc: Double,
) {
  fun toMap(): Map<String, Any?> =
    mapOf(
      "t" to t.toDouble(),
      "lat" to lat,
      "lon" to lon,
      "alt" to if (alt.isNaN()) null else alt,
      "acc" to if (acc.isNaN()) null else acc,
    )
}

/**
 * In-process state shared by the module (called from JS) and the service.
 * Only touched on the main thread.
 */
object WorkoutSession {
  val main = Handler(Looper.getMainLooper())

  var cues: List<Cue> = emptyList()
    private set
  var status: Status = Status("Workout in progress", null, null)
  var service: WorkoutService? = null

  /** GPS fixes for the current (or last) workout; cleared when a new one starts. */
  val track: MutableList<TrackPoint> = ArrayList()

  /** Paused from the notification; the wall-clock time it happened. */
  var pausedAt: Long? = null

  /** Set by the module so the service can notify JS ("onAction", "onLocation"). */
  var emit: ((String, Map<String, Any?>) -> Unit)? = null

  fun replace(newCues: List<Cue>, newStatus: Status) {
    cues = newCues.sortedBy { it.at }
    status = newStatus
    pausedAt = if (newStatus.paused) (pausedAt ?: System.currentTimeMillis()) else null
    service?.onScheduleChanged()
  }

  /** Removes and returns every cue due at or before [now] (nothing while paused). */
  fun takeDue(now: Long): List<Cue> {
    if (pausedAt != null || cues.isEmpty() || cues[0].at > now) return emptyList()
    val due = cues.takeWhile { it.at <= now }
    cues = cues.drop(due.size)
    return due
  }

  /** Pause from the notification: hold every pending cue. */
  fun pause(now: Long) {
    if (pausedAt != null) return
    pausedAt = now
    status = status.copy(title = pausedTitle(status.title), paused = true)
  }

  /** Resume from the notification: shift pending cues by the time spent paused. */
  fun resume(now: Long) {
    val since = pausedAt ?: return
    val delta = (now - since).coerceAtLeast(0)
    cues = cues.map { it.shiftedBy(delta) }
    status = status.shiftedBy(delta).copy(title = status.title.removePrefix(PAUSED_PREFIX), paused = false)
    pausedAt = null
  }

  fun clear() {
    cues = emptyList()
    pausedAt = null
  }

  private const val PAUSED_PREFIX = "Paused · "

  private fun pausedTitle(title: String) = if (title.startsWith(PAUSED_PREFIX)) title else PAUSED_PREFIX + title
}
