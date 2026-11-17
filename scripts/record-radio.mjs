#!/usr/bin/env node
/**
 * Script Autónomo de Grabación de Radio Digital para GitHub Actions y Servidores en la Nube
 * Soporta grabación individual o automática según programación configurada en el panel de administración
 */
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import crypto from "crypto";

// Emisoras preconfiguradas de respaldo de la Región Junín con URLs activas y de respaldo
const PRESET_STATIONS = {
  rdo_rtarma: {
    id: "rdo_rtarma",
    name: "Radio Tarma",
    frequency: "99.3 FM",
    province: "Tarma",
    streamUrl: "https://cloud9.ldwebstudios.net:7003/;",
    defaultDuration: 3600
  },
  tarma: {
    id: "rdo_rtarma",
    name: "Radio Tarma",
    frequency: "99.3 FM",
    province: "Tarma",
    streamUrl: "https://cloud9.ldwebstudios.net:7003/;",
    defaultDuration: 3600
  },
  "radio-tarma": {
    id: "rdo_rtarma",
    name: "Radio Tarma",
    frequency: "99.3 FM",
    province: "Tarma",
    streamUrl: "https://cloud9.ldwebstudios.net:7003/;",
    defaultDuration: 3600
  },
  rdo_lajota: {
    id: "rdo_lajota",
    name: "La Jota",
    frequency: "105.7 FM",
    province: "Tarma",
    streamUrl: "https://radio.publikarte.com.pe/listen/radio_la_j/jstream",
    defaultDuration: 7200
  },
  lajota: {
    id: "rdo_lajota",
    name: "La Jota",
    frequency: "105.7 FM",
    province: "Tarma",
    streamUrl: "https://radio.publikarte.com.pe/listen/radio_la_j/jstream",
    defaultDuration: 7200
  },
  "la-jota": {
    id: "rdo_lajota",
    name: "La Jota",
    frequency: "105.7 FM",
    province: "Tarma",
    streamUrl: "https://radio.publikarte.com.pe/listen/radio_la_j/jstream",
    defaultDuration: 7200
  },
  "la jota": {
    id: "rdo_lajota",
    name: "La Jota",
    frequency: "105.7 FM",
    province: "Tarma",
    streamUrl: "https://radio.publikarte.com.pe/listen/radio_la_j/jstream",
    defaultDuration: 7200
  },
  sudamericana: {
    id: "sudamericana",
    name: "Radio Sudamericana",
    frequency: "104.5 FM",
    province: "Huancayo",
    streamUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    defaultDuration: 3600
  },
  cumbre: {
    id: "cumbre",
    name: "Radio Cumbre",
    frequency: "98.5 FM",
    province: "Huancayo",
    streamUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
    defaultDuration: 3600
  }
};

const stationArg = process.argv[2] || process.env.STATION_ID || "auto";
const durationArg = process.argv[3] || process.env.RECORD_DURATION_SECS || "3600";
const customTitleArg = process.argv[4] || process.env.CUSTOM_TITLE || "";
const streamUrlArg = process.argv[5] || process.env.STREAM_URL || "";
const stationNameArg = process.argv[6] || process.env.STATION_NAME || "";
const frequencyArg = process.argv[7] || process.env.STATION_FREQUENCY || "";
const provinceArg = process.argv[8] || process.env.STATION_PROVINCE || "";

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "bk9klm2l";
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;
const UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET || "";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

// CDJ-RECORD-SCRIPT-V4 (Preserva timePeru/daysOfWeek/bitrate, limite 100MB Cloudinary y cero falsos positivos)
function formatDuration(secs) {
  const safeSecs = Math.max(0, Math.round(Number(secs) || 0));
  const h = Math.floor(safeSecs / 3600);
  const m = Math.floor((safeSecs % 3600) / 60);
  const s = Math.floor(safeSecs % 60);
  if (h > 0) {
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function resolveSafeBitrate(durationSecs, requestedBitrate) {
  const clean = ["64k", "96k", "128k"].includes(requestedBitrate) ? requestedBitrate : "96k";
  // En Cloudinary plan gratuito el límite por archivo es 100 MB.
  // 2 horas (7200s) a 96k/128k pesa ~86-115 MB; a 64k pesa ~57 MB (seguro < 100 MB).
  if (durationSecs >= 5400 && clean !== "64k") {
    console.log(`[FFmpeg] Duración >= 90 min (${durationSecs}s): ajustando bitrate de ${clean} a 64k para no superar el límite de 100 MB en Cloudinary.`);
    return "64k";
  }
  return clean;
}

async function recordStream(streamUrl, duration, outputPath, requestedBitrate = "96k") {
  const bitrate = resolveSafeBitrate(duration, requestedBitrate);
  return new Promise((resolve, reject) => {
    console.log(`[FFmpeg] Grabando flujo de audio durante ${duration}s (bitrate ${bitrate})...`);
    console.log(`[FFmpeg] URL: ${streamUrl}`);
    
    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-user_agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "-reconnect", "1",
      "-reconnect_at_eof", "1",
      "-reconnect_streamed", "1",
      "-reconnect_delay_max", "5",
      "-timeout", "15000000",
      "-i", streamUrl,
      "-t", duration.toString(),
      "-acodec", "libmp3lame",
      "-b:a", bitrate,
      "-ar", "44100",
      "-f", "mp3",
      outputPath
    ]);

    let stderrLogs = "";
    ffmpeg.stderr.on("data", (data) => {
      stderrLogs = (stderrLogs + data.toString()).slice(-3000);
    });

    ffmpeg.on("close", (code) => {
      const exists = fs.existsSync(outputPath);
      const size = exists ? fs.statSync(outputPath).size : 0;

      // Si el código es 0 o si el archivo tiene audio capturado (> 10KB), consideramos la grabación exitosa
      if ((code === 0 || code === 255) && exists && size > 10000) {
        console.log(`[FFmpeg] Grabación exitosa (${formatBytes(size)} capturados).`);
        resolve(true);
      } else if (exists && size > 25000) {
        console.log(`[FFmpeg] Grabación completada con aviso (código ${code}, ${formatBytes(size)} capturados).`);
        resolve(true);
      } else {
        console.error(`[FFmpeg Error Logs]:\n${stderrLogs}`);
        reject(new Error(`FFmpeg terminó con código ${code} y tamaño insuficiente (${formatBytes(size)})`));
      }
    });

    ffmpeg.on("error", (err) => {
      console.error(`[FFmpeg Process Error]: ${err.message}`);
      reject(err);
    });
  });
}

async function uploadToCloudinary(filePath, stationId) {
  console.log("[Cloudinary] Subiendo grabación MP3 a la nube...");
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = "canal_digital_junin/radio_recordings";
  const safeStationId = String(stationId || "radio").replace(/[^a-zA-Z0-9_-]/g, "_");
  const publicId = `rec_${Date.now()}_${safeStationId}`;

  if (!((API_KEY && API_SECRET) || UPLOAD_PRESET)) {
    console.error(`
================================================================================
❌ ERROR CRÍTICO: FALTAN SECRETOS (SECRETS) EN GITHUB ACTIONS
El workflow no tiene acceso a las credenciales de Cloudinary.
Para solucionarlo:
1. Abre tu repositorio en GitHub
2. Ve a: Settings > Secrets and variables > Actions > New repository secret
3. Agrega:
   - CLOUDINARY_API_KEY
   - CLOUDINARY_API_SECRET
   - CLOUDINARY_CLOUD_NAME
================================================================================
`);
    throw new Error("Faltan Secrets de Cloudinary en GitHub Actions (CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET)");
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`;
  const fileBuffer = fs.readFileSync(filePath);
  const mimeType = filePath.endsWith(".aac") ? "audio/aac" : "audio/mpeg";
  const fileBlob = new Blob([fileBuffer], { type: mimeType });

  const formData = new FormData();
  formData.append("file", fileBlob, path.basename(filePath));
  formData.append("folder", folder);
  formData.append("public_id", publicId);

  if (API_KEY && API_SECRET) {
    const stringToSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${API_SECRET}`;
    const signature = crypto.createHash("sha1").update(stringToSign).digest("hex");
    formData.append("timestamp", String(timestamp));
    formData.append("api_key", API_KEY);
    formData.append("signature", signature);
  } else if (UPLOAD_PRESET) {
    formData.append("upload_preset", UPLOAD_PRESET);
  }

  const response = await fetch(endpoint, {
    method: "POST",
    body: formData
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Cloudinary Error (${response.status}): ${json.error?.message || "Subida rechazada"}`);
  }

  console.log(`[Cloudinary] Subida completada: ${json.secure_url || json.url}`);
  return {
    audioUrl: json.secure_url || json.url,
    publicId: json.public_id,
    duration: Math.round(json.duration || 0)
  };
}

function buildSupabaseHeaders(apiKey, extra = {}) {
  const headers = {
    "apikey": apiKey,
    ...extra
  };
  if (typeof apiKey === "string" && apiKey.startsWith("eyJ")) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
}

async function saveToSupabase(rec) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log("[Supabase] Variables no configuradas. Omitiendo registro en base de datos.");
    return;
  }
  try {
    console.log("[Supabase] Registrando grabación en la tabla 'radio_recordings'...");
    const res = await fetch(`${SUPABASE_URL}/rest/v1/radio_recordings`, {
      method: "POST",
      headers: buildSupabaseHeaders(SUPABASE_KEY, {
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
      }),
      body: JSON.stringify({
        id: rec.id,
        title: rec.title,
        station_name: rec.stationName,
        frequency: rec.frequency,
        province: rec.province,
        audio_url: rec.audioUrl,
        duration_formatted: rec.durationFormatted,
        file_size_formatted: rec.fileSizeFormatted,
        file_size_bytes: rec.fileSizeBytes,
        recorded_at: rec.recordedAt,
        storage_provider: "cloudinary"
      })
    });

    if (res.ok) {
      console.log("[Supabase] Grabación registrada exitosamente en la base de datos.");
    } else {
      const txt = await res.text();
      console.warn("[Supabase] Respuesta del servidor:", txt);
    }
  } catch (e) {
    console.warn("[Supabase] Aviso:", e.message);
  }
}

function normalizeScheduleRow(s) {
  if (!s || typeof s !== "object") return null;
  let parsedDays = [1, 2, 3, 4, 5];
  const rawDays = s.daysOfWeek ?? s.days_of_week;
  if (Array.isArray(rawDays)) {
    parsedDays = rawDays.map(Number);
  } else if (typeof rawDays === "string" && rawDays.trim()) {
    try {
      const p = JSON.parse(rawDays);
      if (Array.isArray(p)) parsedDays = p.map(Number);
    } catch (_) {
      parsedDays = rawDays.split(",").map((v) => parseInt(v.trim(), 10)).filter((n) => !isNaN(n));
    }
  }
  return {
    id: s.id || s.stationId || s.station_id || `sched_${Date.now()}`,
    stationId: s.stationId || s.station_id || s.id || "",
    stationName: s.stationName || s.station_name || s.name || "Radio Regional",
    frequency: s.frequency || "FM",
    province: s.province || "Junín",
    streamUrl: (s.streamUrl || s.stream_url || "").trim(),
    enabled: s.enabled !== false,
    timePeru: (s.timePeru || s.time_peru || "13:00").trim(),
    daysOfWeek: parsedDays,
    durationSecs: Number(s.durationSecs || s.duration_secs || 3600),
    customTitle: (s.customTitle || s.custom_title || "").trim(),
    bitrate: (s.bitrate || "96k").trim()
  };
}

// Función para cargar programaciones guardadas localmente en el repositorio (radio-schedules.json)
function getLocalSchedules() {
  const possiblePaths = [
    path.join(process.cwd(), "radio-schedules.json"),
    path.join(process.cwd(), "scripts", "radio-schedules.json")
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log(`[Scheduler] ${parsed.length} programación(es) cargadas desde archivo local '${p}'`);
          return parsed.map(normalizeScheduleRow).filter(Boolean);
        }
      } catch (err) {
        console.warn(`[Scheduler] Aviso al leer ${p}:`, err.message);
      }
    }
  }
  return null;
}

/**
 * Consulta a Supabase para obtener las emisoras programadas activas
 */
async function fetchActiveSchedulesFromSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/radio_schedules?enabled=eq.true`, {
      headers: buildSupabaseHeaders(SUPABASE_KEY)
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map(normalizeScheduleRow).filter(Boolean);
      }
    }
  } catch (err) {
    console.warn("[Scheduler] No se pudo consultar tabla 'radio_schedules' en Supabase:", err.message);
  }
  return null;
}

async function getActiveSchedules() {
  const local = getLocalSchedules();
  if (local && local.length > 0) return local;
  const fromSupabase = await fetchActiveSchedulesFromSupabase();
  if (fromSupabase && fromSupabase.length > 0) return fromSupabase;
  return [];
}

async function recordSingleStation(station, durationSecs, customTitle, bitrate = "96k") {
  const timestampStr = new Date().toLocaleDateString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });

  const title = customTitle || `Emisión ${station.name} - ${timestampStr}`;
  const tempFile = path.join("/tmp", `recording_${Date.now()}_${station.id}.mp3`);

  console.log("\n=================================================");
  console.log(`📻 GRABANDO: ${station.name} (${station.frequency || "FM"})`);
  console.log(`⏱️ Duración: ${durationSecs}s (~${Math.round(durationSecs / 60)} min)`);
  console.log(`📝 Título: ${title}`);
  console.log("=================================================");

  try {
    let recordedOk = false;
    try {
      await recordStream(station.streamUrl, durationSecs, tempFile, bitrate);
      recordedOk = true;
    } catch (err) {
      console.warn(`⚠️ Primer intento de captura para ${station.name} falló: ${err.message}`);
      const backupUrl = station.fallbackUrl;
      if (backupUrl && backupUrl !== station.streamUrl && !backupUrl.includes("soundhelix.com")) {
        console.log(`🔄 Reintentando con flujo de respaldo: ${backupUrl}`);
        try {
          await recordStream(backupUrl, durationSecs, tempFile, bitrate);
          recordedOk = true;
        } catch (err2) {
          console.error(`❌ Falló también el flujo de respaldo:`, err2.message);
        }
      }
    }

    if (!recordedOk || !fs.existsSync(tempFile)) {
      console.error(`❌ ERROR CRÍTICO: No se pudo conectar a la transmisión en vivo de "${station.name}".`);
      console.error(`🔗 URL intentada: ${station.streamUrl}`);
      console.error(`💡 Por favor verifica que la radio esté emitiendo en vivo y que la URL de streaming esté activa.`);
      throw new Error(`No se pudo obtener el audio de la transmisión para ${station.name}`);
    }

    const fileSize = fs.statSync(tempFile).size;
    const uploadResult = await uploadToCloudinary(tempFile, station.id);

    const recordingRecord = {
      id: `rec_auto_${Date.now()}_${station.id}`,
      title: title,
      stationName: station.name,
      frequency: station.frequency || "FM",
      province: station.province || "Junín",
      audioUrl: uploadResult.audioUrl,
      publicId: uploadResult.publicId,
      durationFormatted: formatDuration(durationSecs),
      fileSizeFormatted: formatBytes(fileSize),
      fileSizeBytes: fileSize,
      recordedAt: new Date().toISOString(),
      storageProvider: "cloudinary"
    };

    await saveToSupabase(recordingRecord);
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    console.log(`[RAW_URL_BASE64]${Buffer.from(uploadResult.audioUrl).toString("base64")}[/RAW_URL_BASE64]`);
    console.log(`[CLOUDINARY_BYTES]${fileSize}[/CLOUDINARY_BYTES]`);
    console.log(`[RECORDING_JSON]${JSON.stringify(recordingRecord)}[/RECORDING_JSON]`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      try {
        const summaryMd = `### 🎙️ Grabación Radial Exitosa\n` +
          `- **Emisora:** ${station.name} (${station.frequency || "FM"})\n` +
          `- **Título:** ${title}\n` +
          `- **Duración:** ${formatDuration(durationSecs)}\n` +
          `- **Archivo:** [Escuchar MP3 en Cloudinary](${uploadResult.audioUrl})\n` +
          `- **Fecha:** ${new Date().toLocaleString("es-PE", { timeZone: "America/Lima" })}\n\n`;
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMd);
      } catch (_) {}
    }
    console.log(`✅ ${station.name}: Finalizado y almacenado con éxito.`);
    return true;
  } catch (err) {
    console.error(`❌ Error grabando ${station.name}:`, err.message);
    console.error(`[ERROR_REASON]${station.name}: ${err.message}[/ERROR_REASON]`);
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    return false;
  }
}

async function main() {
  console.log("=================================================");
  console.log("🎙️ GESTOR AUTÓNOMO DE GRABACIONES - CANAL DIGITAL JUNÍN");
  console.log(`⚙️ Modo solicitado: ${stationArg}`);
  console.log("=================================================");

  // MODO AUTOMÁTICO: Obtener programaciones activas (desde archivo local o Supabase)
  if (stationArg === "auto" || stationArg === "all") {
    const schedules = await getActiveSchedules();

    if (!schedules || schedules.length === 0) {
      const noSchedMsg = "No se encontraron emisoras programadas activas en 'radio-schedules.json' ni en Supabase.";
      console.error(`\n❌ AVISO: ${noSchedMsg}`);
      console.error(`[SKIP_REASON]${noSchedMsg}[/SKIP_REASON]`);
      process.exit(1);
    }

    // Determinar hora y día actual en Perú (UTC-5)
    const nowPeru = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
    const currentHour = nowPeru.getHours();
    const currentMinute = nowPeru.getMinutes();
    const currentDay = nowPeru.getDay(); // 0: Dom, 1: Lun, 2: Mar, 3: Mié, 4: Jue, 5: Vie, 6: Sáb
    const currentTotalMin = currentHour * 60 + currentMinute;
    const pad = (n) => n.toString().padStart(2, "0");
    const currentTimeStr = `${pad(currentHour)}:${pad(currentMinute)}`;

    console.log(`[Scheduler] Hora actual en Perú: ${currentTimeStr} (Día ${currentDay}). Evaluando ${schedules.length} programaciones...`);

    let targetSchedules = schedules;

    if (stationArg === "auto") {
      // Filtrar emisoras programadas para el día de hoy
      const todaySchedules = schedules.filter(s => {
        if (s.enabled === false) return false;
        if (!s.daysOfWeek || !Array.isArray(s.daysOfWeek) || s.daysOfWeek.length === 0) return true;
        return s.daysOfWeek.includes(currentDay);
      });

      if (todaySchedules.length === 0) {
        const noDayMsg = `Hoy (día ${currentDay}) a las ${currentTimeStr} PET no hay emisoras activas programadas.`;
        console.warn(`[Scheduler] ⚠️ ${noDayMsg}`);
        console.warn(`[SKIP_REASON]${noDayMsg}[/SKIP_REASON]`);
        process.exit(1);
      }

      // Calcular diferencia en minutos con la hora de emisión programada
      const withDiff = todaySchedules.map(s => {
        const [hStr, mStr] = (s.timePeru || "13:00").split(":");
        const schedHour = parseInt(hStr, 10) || 0;
        const schedMin = parseInt(mStr, 10) || 0;
        const schedTotalMin = schedHour * 60 + schedMin;
        let diffMin = Math.abs(currentTotalMin - schedTotalMin);
        if (diffMin > 720) diffMin = 1440 - diffMin;
        return { ...s, diffMin, schedHour, schedMin };
      });

      // Ventana de 150 minutos para absorber retrasos moderados de GitHub cron
      const nearSchedules = withDiff.filter(s => s.diffMin <= 150);

      if (nearSchedules.length > 0) {
        console.log(`[Scheduler] Se encontraron ${nearSchedules.length} emisora(s) correspondiente(s) al horario de ${currentTimeStr} PET:`);
        targetSchedules = nearSchedules;
      } else {
        // GitHub Actions 'on: schedule' se retrasó más de 2.5 horas respecto a todas las programaciones de hoy
        withDiff.sort((a, b) => a.diffMin - b.diffMin);
        const closest = withDiff[0];
        const closestTime = closest.timePeru || "hora configurada";
        const skipMsg = `GitHub Actions (schedule) despertó tarde a las ${currentTimeStr} PET (${closest.diffMin} min de desfase respecto a '${closest.stationName}' de las ${closestTime} PET). Activa cron-job.org para grabar puntual.`;
        console.error(`[Scheduler] ❌ ${skipMsg}`);
        console.error(`[SKIP_REASON]${skipMsg}[/SKIP_REASON]`);
        if (process.env.GITHUB_STEP_SUMMARY) {
          try {
            fs.appendFileSync(
              process.env.GITHUB_STEP_SUMMARY,
              `### ⚠️ Grabación omitida por retraso de GitHub cron\n${skipMsg}\n\n💡 **Solución gratis sin retrasos:** Configura el disparador de `cron-job.org` desde el Panel Admin (botón *Hora Exacta*).\n`
            );
          } catch (_) {}
        }
        process.exit(1);
      }
    }

    console.log(`[Scheduler] Grabando ${targetSchedules.length} emisora(s) seleccionada(s)...`);
    let successCount = 0;
    let failCount = 0;
    for (const sched of targetSchedules) {
      const station = {
        id: sched.stationId || sched.id,
        name: sched.stationName,
        frequency: sched.frequency || "FM",
        province: sched.province || "Junín",
        streamUrl: sched.streamUrl
      };
      const ok = await recordSingleStation(
        station,
        sched.durationSecs || 3600,
        sched.customTitle || customTitleArg,
        sched.bitrate || "96k"
      );
      if (ok) successCount++;
      else failCount++;
    }

    if (successCount === 0 && failCount > 0) {
      console.error(`\n❌ Ninguna grabación pudo completarse (${failCount} fallo(s)).`);
      process.exit(1);
    }
    console.log(`\n🎉 GRABACIONES COMPLETADAS: ${successCount} exitosa(s), ${failCount} fallida(s).`);
    process.exit(0);
  }

  // MODO EMISORA ESPECÍFICA (disparo manual o cron-job.org)
  const localSchedules = getLocalSchedules() || [];
  const localMatch = localSchedules.find(
    (s) =>
      s.stationId?.toLowerCase() === stationArg.toLowerCase() ||
      s.id?.toLowerCase() === stationArg.toLowerCase() ||
      s.stationName?.toLowerCase().includes(stationArg.toLowerCase())
  );

  let streamUrl = streamUrlArg || process.env.STREAM_URL;
  let stationName = stationNameArg || process.env.STATION_NAME;
  let stationFreq = frequencyArg || process.env.STATION_FREQUENCY;
  let stationProv = provinceArg || process.env.STATION_PROVINCE;
  let bitrate = localMatch?.bitrate || "96k";

  if (localMatch) {
    console.log(`[Scheduler] Emisora encontrada en radio-schedules.json: ${localMatch.stationName}`);
    streamUrl = streamUrl || localMatch.streamUrl;
    stationName = stationName || localMatch.stationName;
    stationFreq = stationFreq || localMatch.frequency;
    stationProv = stationProv || localMatch.province;
  }

  // 2. Si no hay streamUrl, buscar en Supabase
  if (!streamUrl) {
    try {
      const sbSchedules = await fetchActiveSchedulesFromSupabase();
      const sbMatch = sbSchedules?.find(
        (s) =>
          s.stationId?.toLowerCase() === stationArg.toLowerCase() ||
          s.id?.toLowerCase() === stationArg.toLowerCase() ||
          s.stationName?.toLowerCase().includes(stationArg.toLowerCase())
      );
      if (sbMatch) {
        console.log(`[Database] Emisora encontrada en Supabase: ${sbMatch.stationName}`);
        streamUrl = streamUrl || sbMatch.streamUrl;
        stationName = stationName || sbMatch.stationName;
        stationFreq = stationFreq || sbMatch.frequency;
        stationProv = stationProv || sbMatch.province;
        bitrate = sbMatch.bitrate || bitrate;
      }
    } catch (dbErr) {
      console.warn("[Database] No se pudo consultar Supabase para la emisora:", dbErr.message);
    }
  }

  // 3. Si aún no hay streamUrl, verificar PRESET_STATIONS
  let preset = PRESET_STATIONS[stationArg.toLowerCase()];
  if (preset) {
    streamUrl = streamUrl || preset.streamUrl;
    stationName = stationName || preset.name;
    stationFreq = stationFreq || preset.frequency;
    stationProv = stationProv || preset.province;
  }

  if (!streamUrl) {
    console.error(`\n❌ ERROR: No se encontró una URL de transmisión en vivo (stream_url) para la emisora '${stationArg}'.`);
    console.error(`Ingresa la URL del streaming en el panel o envíala como parámetro de ejecución.`);
    process.exit(1);
  }

  const selectedStation = {
    id: preset?.id || stationArg.toLowerCase().replace(/[^a-z0-9]/g, "_"),
    name: stationName || `Emisora ${stationArg}`,
    frequency: stationFreq || "FM",
    province: stationProv || "Junín",
    streamUrl: streamUrl,
    fallbackUrl: preset?.fallbackUrl || ""
  };

  const durationSecs = parseInt(durationArg, 10) || 3600;
  const success = await recordSingleStation(selectedStation, durationSecs, customTitleArg, bitrate);

  if (success) {
    console.log("\n🎉 GRABACIÓN FINALIZADA Y GUARDADA CON ÉXITO");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main();
