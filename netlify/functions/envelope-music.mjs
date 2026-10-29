import { getStore } from '@netlify/blobs';

const STORE_NAME = 'teddybear-open-when-music';
const MAX_TRACK_BYTES = 3_500_000;
const MAX_TOTAL_BYTES = 22_000_000;
const ID_PATTERN = /^[a-f0-9]{32}$/i;
const TRACK_KEYS = new Set([
  'sad',
  'overthinking',
  'laugh',
  'sleep',
  'proud',
  'justbecause',
]);

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function validId(id) {
  return typeof id === 'string' && ID_PATTERN.test(id);
}

function audioKey(id, track) {
  return `${id}:audio:${track}`;
}

function configKey(id) {
  return `${id}:config`;
}

function cleanContentType(raw) {
  return String(raw || '').split(';', 1)[0].trim().toLowerCase();
}

function safeTrackInfo(info) {
  return {
    contentType: info.contentType,
    size: info.size,
    updatedAt: info.updatedAt,
  };
}

export default async function envelopeMusic(request) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Gift-Id, X-Track-Key',
      },
    });
  }

  if (method !== 'GET' && method !== 'POST') {
    return json(405, { error: 'Method not allowed.' });
  }

  const store = getStore(STORE_NAME);

  if (method === 'GET') {
    const id = url.searchParams.get('id');
    const track = url.searchParams.get('track');

    if (!validId(id)) {
      return json(400, { error: 'A valid gift id is required.' });
    }

    try {
      const config = await store.get(configKey(id), { type: 'json' });
      if (!config || !config.tracks || typeof config.tracks !== 'object') {
        return json(404, { error: 'Music setup was not found for this gift.' });
      }

      if (!track) {
        const tracks = {};
        for (const [key, info] of Object.entries(config.tracks)) {
          if (TRACK_KEYS.has(key) && info && typeof info === 'object') {
            tracks[key] = safeTrackInfo(info);
          }
        }
        return json(200, { id, tracks });
      }

      if (!TRACK_KEYS.has(track)) {
        return json(400, { error: 'Unknown envelope track.' });
      }

      const info = config.tracks[track];
      if (!info || !info.contentType || !String(info.contentType).startsWith('audio/')) {
        return json(404, { error: 'No music was uploaded for this envelope.' });
      }

      const audio = await store.get(audioKey(id, track), { type: 'blob' });
      if (!audio) return json(404, { error: 'Music file was not found.' });

      return new Response(audio, {
        status: 200,
        headers: {
          'Content-Type': info.contentType,
          'Content-Length': String(audio.size),
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Cross-Origin-Resource-Policy': 'same-origin',
        },
      });
    } catch (error) {
      console.error('Envelope music read failed:', error);
      return json(500, {
        error: 'Could not load envelope music. Check the Netlify Function and Blobs logs.',
      });
    }
  }

  const id = request.headers.get('x-gift-id');
  const track = request.headers.get('x-track-key');
  const contentType = cleanContentType(request.headers.get('content-type'));

  if (!validId(id)) {
    return json(400, { error: 'A valid gift id is required.' });
  }
  if (!TRACK_KEYS.has(track)) {
    return json(400, { error: 'Unknown envelope track.' });
  }
  if (!contentType.startsWith('audio/')) {
    return json(415, { error: 'Please upload a supported audio file (MP3, M4A, WAV, OGG, etc.).' });
  }

  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_TRACK_BYTES) {
    return json(413, { error: 'Each audio file must be 3.5 MB or smaller.' });
  }

  try {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength === 0) {
      return json(400, { error: 'The selected audio file is empty.' });
    }
    if (bytes.byteLength > MAX_TRACK_BYTES) {
      return json(413, { error: 'Each audio file must be 3.5 MB or smaller.' });
    }

    const config = (await store.get(configKey(id), { type: 'json' })) || {
      version: 1,
      tracks: {},
    };
    const tracks = config.tracks && typeof config.tracks === 'object'
      ? config.tracks
      : {};
    const previousSize = Number(tracks[track]?.size || 0);
    const currentTotal = Object.values(tracks).reduce(
      (sum, info) => sum + (Number(info?.size) || 0),
      0,
    );
    const nextTotal = currentTotal - previousSize + bytes.byteLength;

    if (nextTotal > MAX_TOTAL_BYTES) {
      return json(413, {
        error: 'The total music size is too large. Use smaller/compressed audio files.',
      });
    }

    await store.set(audioKey(id, track), bytes, {
      metadata: { contentType, size: bytes.byteLength },
    });

    tracks[track] = {
      contentType,
      size: bytes.byteLength,
      updatedAt: new Date().toISOString(),
    };
    config.version = 1;
    config.tracks = tracks;
    config.updatedAt = new Date().toISOString();
    await store.setJSON(configKey(id), config);

    return json(201, {
      success: true,
      id,
      track,
      size: bytes.byteLength,
      contentType,
    });
  } catch (error) {
    console.error('Envelope music upload failed:', error);
    return json(500, {
      error: 'Could not save this music. Check Netlify Blobs configuration and function logs.',
    });
  }
}
