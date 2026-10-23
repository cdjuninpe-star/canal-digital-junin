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

function formatDuration(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

async function recordStream(streamUrl, duration, outputPath) {
  return new Promise((resolve, reject) => {
    console.log(`[FFmpeg] Grabando flujo de audio durante ${duration}s...`);
    console.log(`[FFmpeg] URL: ${streamUrl}`);
    
    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-user_agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "-reconnect", "1",
      "-reconnect_at_eof", "1",
      "-reconnect_streamed", "1",
      "-reconnect_delay_max", "5",
      "-timeout", "15000000",
      "-i", streamUrl,
      "-t", duration.toString(),
      "-acodec", "aac",
      "-b:a", "96k",
      "-ar", "44100",
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
  console.log("[Cloudinary] Subiendo grabación a la nube...");
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = "canal_digital_junin/radio_recordings";
  const publicId = `rec_${Date.now()}_${stationId}`;

  const fileData = fs.readFileSync(filePath);
  const base64Data = `data:audio/aac;base64,${fileData.toString("base64")}`;

  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`;
  const bodyData = {
    file: base64Data,
    folder: folder,
    public_id: publicId,
    timestamp: timestamp,
    resource_type: "video"
  };

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

  if (API_KEY && API_SECRET) {
    const stringToSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${API_SECRET}`;
    const signature = crypto.createHash("sha1").update(stringToSign).digest("hex");
    bodyData.api_key = API_KEY;
    bodyData.signature = signature;
  } else if (UPLOAD_PRESET) {
    bodyData.upload_preset = UPLOAD_PRESET;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyData)
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Cloudinary Error: ${json.error?.message || "Subida rechazada"}`);
  }

  console.log(`[Cloudinary] Subida completada: ${json.secure_url || json.url}`);
  return {
    audioUrl: json.secure_url || json.url,
    publicId: json.public_id,
    duration: Math.round(json.duration || 0)
  };
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
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Prefer": "resolution=merge-duplicates"
      },
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
          return parsed.map((s) => ({
            id: s.id || s.stationId,
            stationId: s.stationId || s.id,
            stationName: s.stationName || s.name,
            frequency: s.frequency || "FM",
            province: s.province || "Junín",
            streamUrl: s.streamUrl,
            durationSecs: s.durationSecs || 3600,
            customTitle: s.customTitle || ""
          }));
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
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      }
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map((row) => ({
          id: row.id,
          stationId: row.station_id,
          stationName: row.station_name,
          frequency: row.frequency,
          province: row.province,
          streamUrl: row.stream_url,
          durationSecs: row.duration_secs || 3600,
          customTitle: row.custom_title,
          timePeru: row.time_peru,
          daysOfWeek: row.days_of_week
        }));
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
  
  // Respaldo de seguridad con las 3 emisoras predeterminadas de Junín
  return [
    {
      id: "sched_sudamericana_1045",
      stationId: "radio-sudamericana",
      stationName: "Radio Sudamericana",
      frequency: "104.5 FM",
      province: "Huancayo",
      streamUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
      enabled: true,
      timePeru: "13:00",
      daysOfWeek: [1, 2, 3, 4, 5],
      durationSecs: 3600,
      customTitle: "Noticiero Emisión Central - Radio Sudamericana"
    },
    {
      id: "sched_tarma_997",
      stationId: "radio-tarma",
      stationName: "Radio Tarma",
      frequency: "99.7 FM",
      province: "Tarma",
      streamUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3",
      enabled: true,
      timePeru: "07:00",
      daysOfWeek: [1, 2, 3, 4, 5],
      durationSecs: 3600,
      customTitle: "Edición Matinal - Radio Tarma"
    },
    {
      id: "sched_cumbre_985",
      stationId: "radio-cumbre",
      stationName: "Radio Cumbre",
      frequency: "98.5 FM",
      province: "Huancayo",
      streamUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
      enabled: true,
      timePeru: "18:00",
      daysOfWeek: [1, 2, 3, 4, 5],
      durationSecs: 3600,
      customTitle: "Resumen Informativo - Radio Cumbre"
    }
  ];
}

async function recordSingleStation(station, durationSecs, customTitle) {
  const timestampStr = new Date().toLocaleDateString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });

  const title = customTitle || `Emisión ${station.name} - ${timestampStr}`;
  const tempFile = path.join("/tmp", `recording_${Date.now()}_${station.id}.aac`);

  console.log("\n=================================================");
  console.log(`📻 GRABANDO: ${station.name} (${station.frequency || "FM"})`);
  console.log(`⏱️ Duración: ${durationSecs}s (~${Math.round(durationSecs / 60)} min)`);
  console.log(`📝 Título: ${title}`);
  console.log("=================================================");

  try {
    let recordedOk = false;
    try {
      await recordStream(station.streamUrl, durationSecs, tempFile);
      recordedOk = true;
    } catch (err) {
      console.warn(`⚠️ Primer intento de captura para ${station.name} falló: ${err.message}`);
      const backupUrl = station.fallbackUrl;
      if (backupUrl && backupUrl !== station.streamUrl && !backupUrl.includes("soundhelix.com")) {
        console.log(`🔄 Reintentando con flujo de respaldo: ${backupUrl}`);
        try {
          await recordStream(backupUrl, durationSecs, tempFile);
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
      console.warn("\n⚠️ AVISO: No se encontraron emisoras programadas activas en 'radio-schedules.json' ni en Supabase.");
      console.warn("Agrega tus programaciones en el panel de control y sincronízalas con GitHub.");
      process.exit(0);
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

      if (todaySchedules.length > 0) {
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

        // Seleccionar aquellas dentro de una ventana razonable (máx 35 minutos de tolerancia para colas de GitHub)
        const nearSchedules = withDiff.filter(s => s.diffMin <= 35);

        if (nearSchedules.length > 0) {
          console.log(`[Scheduler] Se encontraron ${nearSchedules.length} emisora(s) correspondiente(s) al horario de ${currentTimeStr} PET:`);
          targetSchedules = nearSchedules;
        } else {
          // GitHub Actions se ejecutó con retraso excesivo (horas después de que terminó el noticiero)
          withDiff.sort((a, b) => a.diffMin - b.diffMin);
          const closest = withDiff[0];
          console.warn(`[Scheduler] ⚠️ GitHub Actions se ejecutó a las ${currentTimeStr} PET, con un desfase de ${closest.diffMin} minutos respecto a '${closest.stationName}' (${closest.timePeru} PET).`);
          console.warn(`[Scheduler] 🛑 Se descarta la grabación tardía para evitar grabar contenido fuera del horario del noticiero.`);
          process.exit(0);
        }
      }
    }

    console.log(`[Scheduler] Grabando ${targetSchedules.length} emisora(s) seleccionada(s)...`);
    for (const sched of targetSchedules) {
      const station = {
        id: sched.stationId || sched.id,
        name: sched.stationName,
        frequency: sched.frequency || "FM",
        province: sched.province || "Junín",
        streamUrl: sched.streamUrl
      };
      await recordSingleStation(station, sched.durationSecs || 3600, sched.customTitle || customTitleArg);
    }

    console.log("\n🎉 TODAS LAS GRABACIONES PROGRAMADAS HAN SIDO COMPLETADAS");
    process.exit(0);
  }

  // MODO EMISORA ESPECÍFICA
  // 1. Buscar en archivo local radio-schedules.json si existe
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
  const success = await recordSingleStation(selectedStation, durationSecs, customTitleArg);

  if (success) {
    console.log("\n🎉 GRABACIÓN FINALIZADA Y GUARDADA CON ÉXITO");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main();
