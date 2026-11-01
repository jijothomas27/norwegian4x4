package expo.modules.tempoworkout

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener

/**
 * Text-to-speech + vibration for workout cues.
 *
 * Speech asks for transient, "may duck" audio focus, so music or a podcast in
 * another app dips (or briefly pauses) while the cue plays, then comes back.
 * Everything runs on the main thread.
 */
object CueSpeaker {
  private val main = WorkoutSession.main
  private var tts: TextToSpeech? = null
  private var ready = false
  private var pending: String? = null
  private var outstanding = 0
  private var counter = 0
  private var audioManager: AudioManager? = null
  private var focusRequest: AudioFocusRequest? = null

  private val attributes: AudioAttributes =
    AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
      .build()

  private val releaseFocus = Runnable { abandonFocus() }

  fun init(context: Context) {
    main.post { initOnMain(context.applicationContext) }
  }

  private fun initOnMain(app: Context) {
    if (tts != null) return
    audioManager = app.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    tts = TextToSpeech(app) { status ->
      main.post {
        if (status == TextToSpeech.SUCCESS) {
          ready = true
          tts?.setAudioAttributes(attributes)
          tts?.setSpeechRate(0.96f)
          tts?.setOnUtteranceProgressListener(listener)
          pending?.let { speakNow(it) }
        } else {
          tts?.shutdown()
          tts = null
        }
        pending = null
      }
    }
  }

  fun speak(context: Context, text: String) {
    main.post {
      if (tts == null) initOnMain(context.applicationContext)
      if (!ready) {
        pending = text // only the latest cue matters
        return@post
      }
      speakNow(text)
    }
  }

  private fun speakNow(text: String) {
    val engine = tts ?: return
    main.removeCallbacks(releaseFocus)
    if (outstanding <= 0) requestFocus()
    outstanding++
    engine.speak(text, TextToSpeech.QUEUE_FLUSH, Bundle(), "tempo-${counter++}")
  }

  fun stop() {
    main.post {
      tts?.stop()
      outstanding = 0
      abandonFocus()
    }
  }

  private val listener =
    object : UtteranceProgressListener() {
      override fun onStart(utteranceId: String?) {}

      override fun onDone(utteranceId: String?) = finished()

      @Deprecated("Deprecated in Java")
      override fun onError(utteranceId: String?) = finished()

      override fun onError(utteranceId: String?, errorCode: Int) = finished()

      override fun onStop(utteranceId: String?, interrupted: Boolean) = finished()
    }

  private fun finished() {
    main.post {
      outstanding = (outstanding - 1).coerceAtLeast(0)
      if (outstanding == 0) {
        main.removeCallbacks(releaseFocus)
        main.postDelayed(releaseFocus, 250)
      }
    }
  }

  private fun requestFocus() {
    val am = audioManager ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request =
        AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
          .setAudioAttributes(attributes)
          .build()
      focusRequest = request
      am.requestAudioFocus(request)
    } else {
      @Suppress("DEPRECATION")
      am.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
    }
  }

  private fun abandonFocus() {
    if (outstanding > 0) return
    val am = audioManager ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focusRequest?.let { am.abandonAudioFocusRequest(it) }
      focusRequest = null
    } else {
      @Suppress("DEPRECATION")
      am.abandonAudioFocus(null)
    }
  }

  fun vibrate(context: Context, kind: String) {
    val pattern =
      when (kind) {
        "hard" -> longArrayOf(0, 280, 120, 280, 120, 280)
        "easy" -> longArrayOf(0, 220)
        "tick" -> longArrayOf(0, 45)
        "soft" -> longArrayOf(0, 70)
        "success" -> longArrayOf(0, 120, 90, 120, 90, 260)
        else -> return
      }
    val vibrator = vibratorOf(context.applicationContext) ?: return
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
      } else {
        @Suppress("DEPRECATION")
        vibrator.vibrate(pattern, -1)
      }
    } catch (_: Exception) {
      // Vibration is a nice-to-have.
    }
  }

  private fun vibratorOf(context: Context): Vibrator? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }
}
