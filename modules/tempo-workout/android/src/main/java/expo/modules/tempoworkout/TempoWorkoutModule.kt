package expo.modules.tempoworkout

import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS API (see modules/tempo-workout/index.ts):
 *   sync(cues, status)   start the background session if needed and replace its cue schedule
 *   stop()               end the background session
 *   speak(text, buzz)    say something now (zone coaching), ducking other audio
 *   silence()            stop speaking
 *   getVoices()          every text-to-speech voice on the phone
 *   setVoice(id | null)  voice for all cues (null = phone default)
 *   getTrack(from)       GPS fixes recorded this workout, starting at index `from`
 * Events: onAction { action: "pause" | "resume" | "skip", at }  (notification buttons)
 *         onLocation { t, lat, lon, alt, acc }                   (each GPS fix)
 */
class TempoWorkoutModule : Module() {
  private val context: Context?
    get() = appContext.reactContext?.applicationContext

  override fun definition() = ModuleDefinition {
    Name("TempoWorkout")

    Events("onAction", "onLocation")

    OnCreate {
      context?.let { CueSpeaker.init(it) }
      WorkoutSession.main.post {
        WorkoutSession.emit = { name, body ->
          try {
            sendEvent(name, body)
          } catch (_: Exception) {
            // JS not ready (e.g. app reloading) — the event is simply dropped.
          }
        }
      }
    }

    OnDestroy {
      WorkoutSession.main.post { WorkoutSession.emit = null }
    }

    AsyncFunction("sync") { rawCues: List<Map<String, Any?>>, rawStatus: Map<String, Any?> ->
      val ctx = context ?: return@AsyncFunction false
      val cues = rawCues.mapNotNull { Cue.from(it) }
      val status = Status.from(rawStatus)
      WorkoutSession.main.post { WorkoutSession.replace(cues, status) }
      if (WorkoutSession.service != null) return@AsyncFunction true
      try {
        val intent = Intent(ctx, WorkoutService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(intent) else ctx.startService(intent)
        true
      } catch (e: Exception) {
        Log.w("TempoWorkout", "Could not start the workout service", e)
        false
      }
    }

    AsyncFunction<Unit>("stop") {
      val ctx = context ?: return@AsyncFunction
      WorkoutSession.main.post { WorkoutSession.clear() }
      ctx.stopService(Intent(ctx, WorkoutService::class.java))
    }

    AsyncFunction("speak") { text: String, vibrate: String? ->
      val ctx = context ?: return@AsyncFunction
      vibrate?.let { CueSpeaker.vibrate(ctx, it) }
      CueSpeaker.speak(ctx, text)
    }

    AsyncFunction<Unit>("silence") {
      CueSpeaker.stop()
    }

    AsyncFunction("getVoices") { promise: Promise ->
      val ctx = context
      if (ctx == null) {
        promise.resolve(emptyList<Map<String, Any?>>())
      } else {
        CueSpeaker.getVoices(ctx) { voices -> promise.resolve(voices) }
      }
    }

    AsyncFunction("setVoice") { id: String? ->
      val ctx = context ?: return@AsyncFunction
      CueSpeaker.setVoice(ctx, id)
    }

    AsyncFunction("getTrack") { from: Int, promise: Promise ->
      WorkoutSession.main.post {
        val track = WorkoutSession.track
        val start = from.coerceIn(0, track.size)
        promise.resolve(track.subList(start, track.size).map { it.toMap() })
      }
    }
  }
}
