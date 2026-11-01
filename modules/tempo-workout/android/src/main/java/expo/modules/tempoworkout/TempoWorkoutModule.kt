package expo.modules.tempoworkout

import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS API (see modules/tempo-workout/index.ts):
 *   sync(cues, status)  start the background session if needed and replace its cue schedule
 *   stop()              end the background session
 *   speak(text, buzz)   say something now (zone coaching), ducking other audio
 *   silence()           stop speaking
 */
class TempoWorkoutModule : Module() {
  private val context: Context?
    get() = appContext.reactContext?.applicationContext

  override fun definition() = ModuleDefinition {
    Name("TempoWorkout")

    OnCreate {
      context?.let { CueSpeaker.init(it) }
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
  }
}
