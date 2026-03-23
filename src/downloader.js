/**
 * StreamDownloader — downloads HLS, DASH, and direct video/audio streams.
 * Runs exclusively in the main (Node.js) process.
 */

const { EventEmitter } = require('events');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pick http or https based on protocol */
function httpGet(url, opts = {}) {
  const mod = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.get(url, opts, resolve);
    req.on('error', reject);
    return req;
  });
}

/** Fetch a URL as a Buffer */
async function fetchBuffer(url, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Aborted'));
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchBuffer(res.headers.location, signal).then(resolve, reject);
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    if (signal) {
      const onAbort = () => { req.destroy(); reject(new Error('Aborted')); };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

/** Fetch a URL as text */
async function fetchText(url, signal) {
  const buf = await fetchBuffer(url, signal);
  return buf.toString('utf-8');
}

/** Resolve a potentially relative URI against a base URL */
function resolveUri(base, uri) {
  try {
    return new URL(uri, base).toString();
  } catch {
    return uri;
  }
}

/** Format bytes to human readable */
function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ---------------------------------------------------------------------------
// Simple M3U8 parser (avoids importing the full m3u8-parser for reliability)
// ---------------------------------------------------------------------------

function parseM3U8(text, baseUrl) {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const isMaster = lines.some((l) => l.startsWith('#EXT-X-STREAM-INF'));

  if (isMaster) {
    // Master playlist — extract variant streams
    const playlists = [];
    let bandwidth = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
        bandwidth = bwMatch ? parseInt(bwMatch[1], 10) : 0;
      } else if (line && !line.startsWith('#')) {
        playlists.push({ uri: resolveUri(baseUrl, line), bandwidth });
        bandwidth = 0;
      }
    }
    // Sort by bandwidth descending and pick the best
    playlists.sort((a, b) => b.bandwidth - a.bandwidth);
    return { isMaster: true, playlists };
  }

  // Media playlist — extract segments
  const segments = [];
  let currentKey = null;
  let seq = 0;
  const seqMatch = text.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/);
  if (seqMatch) seq = parseInt(seqMatch[1], 10);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#EXT-X-KEY')) {
      const methodMatch = line.match(/METHOD=([^,]+)/i);
      const uriMatch = line.match(/URI="([^"]+)"/i);
      const ivMatch = line.match(/IV=0x([0-9a-fA-F]+)/i);
      const method = methodMatch ? methodMatch[1].toUpperCase() : 'NONE';
      if (method === 'NONE') {
        currentKey = null;
      } else {
        currentKey = {
          method,
          uri: uriMatch ? resolveUri(baseUrl, uriMatch[1]) : null,
          iv: ivMatch ? ivMatch[1] : null,
        };
      }
    } else if (line.startsWith('#EXTINF')) {
      // Next non-comment line is the segment URI
      for (let j = i + 1; j < lines.length; j++) {
        const seg = lines[j];
        if (!seg || seg.startsWith('#')) continue;
        segments.push({
          uri: resolveUri(baseUrl, seg),
          key: currentKey,
          seq: seq++,
        });
        i = j;
        break;
      }
    }
  }

  return { isMaster: false, segments };
}

// ---------------------------------------------------------------------------
// Simple MPD parser
// ---------------------------------------------------------------------------

function parseMPD(xmlText, baseUrl) {
  // Very minimal — extract <Representation> with <BaseURL> or <SegmentTemplate>
  // For fMP4 DASH, segments are usually init + media segments
  const representations = [];

  // Extract <Period> contents (simplified: take first period)
  const periodMatch = xmlText.match(/<Period[^>]*>([\s\S]*?)<\/Period>/i);
  const periodContent = periodMatch ? periodMatch[1] : xmlText;

  // Extract AdaptationSets
  const adaptSets = [...periodContent.matchAll(/<AdaptationSet([^>]*)>([\s\S]*?)<\/AdaptationSet>/gi)];

  for (const [, attrs, content] of adaptSets) {
    const mimeMatch = attrs.match(/mimeType="([^"]+)"/i);
    const mime = mimeMatch ? mimeMatch[1] : '';

    const reps = [...content.matchAll(/<Representation([^>]*)>([\s\S]*?)<\/Representation>/gi)];
    for (const [, repAttrs, repContent] of reps) {
      const bwMatch = repAttrs.match(/bandwidth="(\d+)"/i);
      const bandwidth = bwMatch ? parseInt(bwMatch[1], 10) : 0;
      const idMatch = repAttrs.match(/id="([^"]+)"/i);

      // Check for SegmentList
      const segListMatch = repContent.match(/<SegmentList[^>]*>([\s\S]*?)<\/SegmentList>/i);
      // Check for SegmentTemplate
      const segTplMatch = repContent.match(/<SegmentTemplate([^>]*)(?:\/>|>([\s\S]*?)<\/SegmentTemplate>)/i);
      // Check for BaseURL
      const baseUrlMatch = repContent.match(/<BaseURL>([^<]+)<\/BaseURL>/i);

      const segments = [];
      let initUrl = null;

      if (segTplMatch) {
        const tplAttrs = segTplMatch[1];
        const tplContent = segTplMatch[2] || '';
        const initTpl = tplAttrs.match(/initialization="([^"]+)"/i);
        const mediaTpl = tplAttrs.match(/media="([^"]+)"/i);
        const startNumber = parseInt((tplAttrs.match(/startNumber="(\d+)"/i) || [])[1] || '1', 10);

        if (initTpl) {
          let initPath = initTpl[1].replace(/\$RepresentationID\$/g, idMatch ? idMatch[1] : '');
          initUrl = resolveUri(baseUrl, initPath);
        }

        // Timeline-based
        const timelineMatch = tplContent.match(/<SegmentTimeline>([\s\S]*?)<\/SegmentTimeline>/i);
        if (timelineMatch && mediaTpl) {
          const sEntries = [...timelineMatch[1].matchAll(/<S\s+([^\/]*)\/?>/gi)];
          let time = 0;
          let num = startNumber;
          for (const [, sAttrs] of sEntries) {
            const t = parseInt((sAttrs.match(/t="(\d+)"/i) || [])[1] || String(time), 10);
            const d = parseInt((sAttrs.match(/d="(\d+)"/i) || [])[1] || '0', 10);
            const r = parseInt((sAttrs.match(/r="(\d+)"/i) || [])[1] || '0', 10);
            time = t;
            for (let k = 0; k <= r; k++) {
              let mediaPath = mediaTpl[1]
                .replace(/\$Number(\%\d+d)?\$/g, (_, fmt) => fmt ? String(num).padStart(parseInt(fmt.slice(1)), '0') : String(num))
                .replace(/\$Time\$/g, String(time))
                .replace(/\$RepresentationID\$/g, idMatch ? idMatch[1] : '');
              segments.push(resolveUri(baseUrl, mediaPath));
              time += d;
              num++;
            }
          }
        }
      } else if (segListMatch) {
        const initMatch = segListMatch[1].match(/<Initialization[^>]*sourceURL="([^"]+)"/i);
        if (initMatch) initUrl = resolveUri(baseUrl, initMatch[1]);
        const segUrls = [...segListMatch[1].matchAll(/<SegmentURL[^>]*media="([^"]+)"/gi)];
        for (const [, u] of segUrls) {
          segments.push(resolveUri(baseUrl, u));
        }
      } else if (baseUrlMatch) {
        // Single-file representation
        segments.push(resolveUri(baseUrl, baseUrlMatch[1]));
      }

      representations.push({ mime, bandwidth, initUrl, segments });
    }
  }

  return representations;
}

// ---------------------------------------------------------------------------
// StreamDownloader
// ---------------------------------------------------------------------------

class StreamDownloader extends EventEmitter {
  constructor({ url, type, outputPath, concurrency = 5 }) {
    super();
    this.url = url;
    this.type = type; // 'hls' | 'dash' | 'direct'
    this.outputPath = outputPath;
    this.concurrency = concurrency;
    this.abortController = new AbortController();
    this.tmpDir = null;
    this.startTime = Date.now();
    this.totalBytes = 0;
  }

  get signal() {
    return this.abortController.signal;
  }

  cancel() {
    this.abortController.abort();
    this._cleanup();
  }

  _cleanup() {
    if (this.tmpDir) {
      try { fs.rmSync(this.tmpDir, { recursive: true, force: true }); } catch {}
      this.tmpDir = null;
    }
  }

  async start() {
    try {
      switch (this.type) {
        case 'hls':
          await this._downloadHLS();
          break;
        case 'dash':
          await this._downloadDASH();
          break;
        default:
          await this._downloadDirect();
          break;
      }
      if (!this.signal.aborted) {
        this.emit('complete', { path: this.outputPath });
      }
    } catch (err) {
      if (this.signal.aborted) return;
      this.emit('error', { message: err.message || String(err) });
    } finally {
      this._cleanup();
    }
  }

  // ---- Direct download ----

  async _downloadDirect() {
    const signal = this.signal;
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new Error('Aborted'));

      const mod = this.url.startsWith('https') ? https : http;
      const req = mod.get(this.url, (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          this.url = res.headers.location;
          this._downloadDirect().then(resolve, reject);
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        const total = parseInt(res.headers['content-length'] || '0', 10);
        let downloaded = 0;
        const ws = fs.createWriteStream(this.outputPath);
        res.on('data', (chunk) => {
          downloaded += chunk.length;
          this.totalBytes = downloaded;
          const elapsed = (Date.now() - this.startTime) / 1000 || 1;
          const speed = downloaded / elapsed;
          this.emit('progress', {
            downloaded,
            total: total || undefined,
            percent: total ? Math.round((downloaded / total) * 100) : undefined,
            speed: fmtBytes(Math.round(speed)) + '/s',
            label: total
              ? `${fmtBytes(downloaded)} / ${fmtBytes(total)} (${Math.round((downloaded / total) * 100)}%)`
              : `${fmtBytes(downloaded)}`,
          });
        });
        res.pipe(ws);
        ws.on('finish', resolve);
        ws.on('error', reject);
        res.on('error', reject);
      });
      req.on('error', reject);
      signal.addEventListener('abort', () => { req.destroy(); reject(new Error('Aborted')); }, { once: true });
    });
  }

  // ---- HLS download ----

  async _downloadHLS() {
    const signal = this.signal;

    // 1. Fetch & parse m3u8
    let text = await fetchText(this.url, signal);
    let parsed = parseM3U8(text, this.url);

    // If master playlist, follow best variant
    if (parsed.isMaster && parsed.playlists.length > 0) {
      const best = parsed.playlists[0];
      text = await fetchText(best.uri, signal);
      parsed = parseM3U8(text, best.uri);
    }

    const { segments } = parsed;
    if (!segments || segments.length === 0) {
      throw new Error('No segments found in HLS playlist');
    }

    // 2. Create temp dir
    this.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lnu-dl-'));
    const total = segments.length;

    // 3. Pre-fetch encryption keys (cache by URI)
    const keyCache = new Map();
    async function getKey(keyInfo) {
      if (!keyInfo || keyInfo.method === 'NONE' || !keyInfo.uri) return null;
      if (keyCache.has(keyInfo.uri)) return keyCache.get(keyInfo.uri);
      const keyBuf = await fetchBuffer(keyInfo.uri, signal);
      keyCache.set(keyInfo.uri, keyBuf);
      return keyBuf;
    }

    // 4. Parallel download segments
    let completed = 0;
    const segPaths = new Array(total);

    const downloadOne = async (idx) => {
      if (signal.aborted) return;
      const seg = segments[idx];
      const segPath = path.join(this.tmpDir, `seg_${String(idx).padStart(6, '0')}.ts`);
      let data;

      // Retry up to 3 times
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          data = await fetchBuffer(seg.uri, signal);
          break;
        } catch (err) {
          if (signal.aborted) throw err;
          if (attempt === 2) throw err;
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }

      // Decrypt if needed
      if (seg.key && seg.key.method === 'AES-128') {
        const keyBuf = await getKey(seg.key);
        if (keyBuf) {
          let iv;
          if (seg.key.iv) {
            iv = Buffer.from(seg.key.iv.padStart(32, '0'), 'hex');
          } else {
            // IV = segment sequence number as 16-byte big-endian
            iv = Buffer.alloc(16);
            iv.writeUInt32BE(seg.seq, 12);
          }
          const decipher = crypto.createDecipheriv('aes-128-cbc', keyBuf, iv);
          data = Buffer.concat([decipher.update(data), decipher.final()]);
        }
      }

      fs.writeFileSync(segPath, data);
      segPaths[idx] = segPath;
      completed++;
      this.totalBytes += data.length;
      const elapsed = (Date.now() - this.startTime) / 1000 || 1;
      const speed = this.totalBytes / elapsed;
      this.emit('progress', {
        segmentsDownloaded: completed,
        totalSegments: total,
        percent: Math.round((completed / total) * 100),
        speed: fmtBytes(Math.round(speed)) + '/s',
        label: `${completed}/${total} segments (${Math.round((completed / total) * 100)}%)`,
      });
    };

    // Work queue
    const queue = segments.map((_, i) => i);
    const workers = [];
    for (let w = 0; w < this.concurrency; w++) {
      workers.push(
        (async () => {
          while (queue.length > 0 && !signal.aborted) {
            const idx = queue.shift();
            if (idx === undefined) break;
            await downloadOne(idx);
          }
        })()
      );
    }
    await Promise.all(workers);
    if (signal.aborted) return;

    // 5. Concatenate segments to output
    this.emit('progress', {
      segmentsDownloaded: total,
      totalSegments: total,
      percent: 99,
      speed: '',
      label: 'Merging segments…',
    });

    const ws = fs.createWriteStream(this.outputPath);
    for (let i = 0; i < total; i++) {
      if (signal.aborted) { ws.destroy(); return; }
      const sp = segPaths[i];
      if (!sp) continue;
      await new Promise((resolve, reject) => {
        const rs = fs.createReadStream(sp);
        rs.pipe(ws, { end: false });
        rs.on('end', resolve);
        rs.on('error', reject);
      });
    }
    ws.end();
    await new Promise((resolve) => ws.on('finish', resolve));
  }

  // ---- DASH download ----

  async _downloadDASH() {
    const signal = this.signal;

    const xmlText = await fetchText(this.url, signal);
    const reps = parseMPD(xmlText, this.url);

    if (!reps || reps.length === 0) {
      throw new Error('No representations found in DASH manifest');
    }

    // Pick highest bandwidth video representation
    const videoReps = reps.filter((r) => r.mime.startsWith('video/'));
    const audioReps = reps.filter((r) => r.mime.startsWith('audio/'));
    const chosen = videoReps.length > 0
      ? videoReps.sort((a, b) => b.bandwidth - a.bandwidth)[0]
      : reps.sort((a, b) => b.bandwidth - a.bandwidth)[0];

    const allSegments = [];
    if (chosen.initUrl) allSegments.push(chosen.initUrl);
    allSegments.push(...chosen.segments);

    // If there's a separate audio track and output is mp4, note limitation
    // (we can't mux without FFmpeg, so we download video-only for now)

    if (allSegments.length === 0) {
      throw new Error('No segments found in DASH manifest');
    }

    this.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lnu-dl-'));
    const total = allSegments.length;
    let completed = 0;
    const segPaths = new Array(total);

    const downloadOne = async (idx) => {
      if (signal.aborted) return;
      const segUrl = allSegments[idx];
      const segPath = path.join(this.tmpDir, `seg_${String(idx).padStart(6, '0')}.mp4`);

      let data;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          data = await fetchBuffer(segUrl, signal);
          break;
        } catch (err) {
          if (signal.aborted) throw err;
          if (attempt === 2) throw err;
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }

      fs.writeFileSync(segPath, data);
      segPaths[idx] = segPath;
      completed++;
      this.totalBytes += data.length;
      const elapsed = (Date.now() - this.startTime) / 1000 || 1;
      const speed = this.totalBytes / elapsed;
      this.emit('progress', {
        segmentsDownloaded: completed,
        totalSegments: total,
        percent: Math.round((completed / total) * 100),
        speed: fmtBytes(Math.round(speed)) + '/s',
        label: `${completed}/${total} segments (${Math.round((completed / total) * 100)}%)`,
      });
    };

    const queue = allSegments.map((_, i) => i);
    const workers = [];
    for (let w = 0; w < this.concurrency; w++) {
      workers.push(
        (async () => {
          while (queue.length > 0 && !signal.aborted) {
            const idx = queue.shift();
            if (idx === undefined) break;
            await downloadOne(idx);
          }
        })()
      );
    }
    await Promise.all(workers);
    if (signal.aborted) return;

    this.emit('progress', {
      segmentsDownloaded: total,
      totalSegments: total,
      percent: 99,
      speed: '',
      label: 'Merging segments…',
    });

    const ws = fs.createWriteStream(this.outputPath);
    for (let i = 0; i < total; i++) {
      if (signal.aborted) { ws.destroy(); return; }
      const sp = segPaths[i];
      if (!sp) continue;
      await new Promise((resolve, reject) => {
        const rs = fs.createReadStream(sp);
        rs.pipe(ws, { end: false });
        rs.on('end', resolve);
        rs.on('error', reject);
      });
    }
    ws.end();
    await new Promise((resolve) => ws.on('finish', resolve));
  }
}

module.exports = { StreamDownloader };
