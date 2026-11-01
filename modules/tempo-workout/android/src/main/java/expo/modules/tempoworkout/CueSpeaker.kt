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
  /** Voice chosen in Tempo's settings (null = the phone's default). */
  private var voiceName: String? = null
  private val waitingForVoices = ArrayList<(List<Map<String, Any?>>) -> Unit>()
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
          applyVoice()
          pending?.let { speakNow(it) }
          val voices = listVoices()
          waitingForVoices.forEach { it(voices) }
        } else {
          tts?.shutdown()
          tts = null
          waitingForVoices.forEach { it(emptyList()) }
        }
        waitingForVoices.clear()
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

  /** Use this voice from now on (null = phone default). */
  fun setVoice(context: Context, name: String?) {
    main.post {
      voiceName = name
      if (tts == null) initOnMain(context.applicationContext)
      if (ready) applyVoice()
    }
  }

  private fun applyVoice() {
    val engine = tts ?: return
    val wanted = voiceName
    try {
      val voice = if (wanted != null) engine.voices?.firstOrNull { it.name == wanted } else null
      if (voice != null) {
        engine.voice = voice
      } else {
        engine.defaultVoice?.let { engine.voice = it }
      }
    } catch (_: Exception) {
      // Some engines throw while still loading voice data; keep the current voice.
    }
  }

  /** Every voice the TTS engine offers, for the voice picker (resolved once TTS is ready). */
  fun getVoices(context: Context, callback: (List<Map<String, Any?>>) -> Unit) {
    main.post {
      if (tts == null) initOnMain(context.applicationContext)
      if (ready) callback(listVoices()) else waitingForVoices.add(callback)
    }
  }

  private fun listVoices(): List<Map<String, Any?>> {
    val engine = tts ?: return emptyList()
    val defaultName = try { engine.defaultVoice?.name } catch (_: Exception) { null }
    return try {
      engine.voices.orEmpty().map { v ->
        val features = v.features.orEmpty()
        mapOf(
          "id" to v.name,
          "language" to v.locale.toLanguageTag(),
          "quality" to v.quality,
          "latency" to v.latency,
          "network" to v.isNetworkConnectionRequired,
          "installed" to !features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED),
          "isDefault" to (v.name == defaultName),
        )
      }
    } catch (_: Exception) {
      emptyList()
    }
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
