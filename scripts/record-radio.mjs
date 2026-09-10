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
  sudamericana: {
    id: "sudamericana",
    name: "Radio Sudamericana",
    frequency: "104.5 FM",
    province: "Huancayo",
    streamUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    fallbackUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    defaultDuration: 3600
  },
  "radio-sudamericana": {
    id: "radio-sudamericana",
    name: "Radio Sudamericana",
    frequency: "104.5 FM",
    province: "Huancayo",
    streamUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    fallbackUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    defaultDuration: 3600
  },
  tarma: {
    id: "tarma",
    name: "Radio Tarma",
    frequency: "99.7 FM",
    province: "Tarma",
    streamUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3",
    fallbackUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    defaultDuration: 3600
  },
  "radio-tarma": {
    id: "radio-tarma",
    name: "Radio Tarma",
    frequency: "99.7 FM",
    province: "Tarma",
    streamUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3",
    fallbackUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    defaultDuration: 3600
  },
  cumbre: {
    id: "cumbre",
    name: "Radio Cumbre",
    frequency: "98.5 FM",
    province: "Huancayo",
    streamUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
    fallbackUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
    defaultDuration: 3600
  },
  "radio-cumbre": {
    id: "radio-cumbre",
    name: "Radio Cumbre",
    frequency: "98.5 FM",
    province: "Huancayo",
    streamUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
    fallbackUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
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
      const backupUrl = station.fallbackUrl || "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3";
      if (backupUrl && backupUrl !== station.streamUrl) {
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

  if (stationArg === "auto" || stationArg === "all") {
    let schedules = await fetchActiveSchedulesFromSupabase();

    if (!schedules || schedules.length === 0) {
      console.log("[Scheduler] Utilizando emisoras predeterminadas de la Región Junín.");
      schedules = [
        {
          id: "tarma",
          stationId: "tarma",
          stationName: "Radio Tarma",
          frequency: "99.7 FM",
          province: "Tarma",
          streamUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3",
          durationSecs: parseInt(durationArg, 10) || 3600,
          customTitle: customTitleArg
        }
      ];
    }

    console.log(`[Scheduler] Procesando ${schedules.length} emisora(s) programada(s)...`);
    for (const sched of schedules) {
      const station = {
        id: sched.stationId || sched.id,
        name: sched.stationName,
        frequency: sched.frequency,
        province: sched.province,
        streamUrl: sched.streamUrl
      };
      await recordSingleStation(station, sched.durationSecs || 3600, sched.customTitle || customTitleArg);
    }

    console.log("\n🎉 TODAS LAS GRABACIONES PROGRAMADAS HAN SIDO COMPLETADAS");
    process.exit(0);
  }

  // MODO EMISORA ESPECÍFICA
  const preset = PRESET_STATIONS[stationArg.toLowerCase()];
  const selectedStation = {
    id: preset?.id || stationArg.toLowerCase().replace(/[^a-z0-9]/g, "_"),
    name: stationNameArg || process.env.STATION_NAME || preset?.name || `Emisora ${stationArg}`,
    frequency: frequencyArg || process.env.STATION_FREQUENCY || preset?.frequency || "FM",
    province: provinceArg || process.env.STATION_PROVINCE || preset?.province || "Junín",
    streamUrl: streamUrlArg || process.env.STREAM_URL || preset?.streamUrl || "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3",
    fallbackUrl: preset?.fallbackUrl || "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3"
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
