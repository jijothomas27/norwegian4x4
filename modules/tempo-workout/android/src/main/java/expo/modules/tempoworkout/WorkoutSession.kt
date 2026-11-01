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
data class Status(val title: String, val body: String?, val endsAt: Long?) {
  companion object {
    fun from(map: Map<*, *>): Status =
      Status(
        title = map["title"] as? String ?: "Workout in progress",
        body = map["body"] as? String,
        endsAt = (map["endsAt"] as? Number)?.toLong(),
      )
  }
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

  fun replace(newCues: List<Cue>, newStatus: Status) {
    cues = newCues.sortedBy { it.at }
    status = newStatus
    service?.onScheduleChanged()
  }

  /** Removes and returns every cue due at or before [now]. */
  fun takeDue(now: Long): List<Cue> {
    if (cues.isEmpty() || cues[0].at > now) return emptyList()
    val due = cues.takeWhile { it.at <= now }
    cues = cues.drop(due.size)
    return due
  }

  fun clear() {
    cues = emptyList()
  }
}
