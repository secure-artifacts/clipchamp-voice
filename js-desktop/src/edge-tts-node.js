'use strict'

const crypto = require('node:crypto')
const WebSocket = require('ws')

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const BASE_URL = 'speech.platform.bing.com/consumer/speech/synthesize/readaloud'
const WSS_URL = `wss://${BASE_URL}/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`
const VOICES_URL = `https://${BASE_URL}/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`
const CHROMIUM_FULL_VERSION = '143.0.3650.75'
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split('.', 1)[0]
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`
const WIN_EPOCH_SECONDS = 11644473600
const TICKS_PER_SECOND = 10000000

let clockSkewSeconds = 0

const BASE_HEADERS = {
  'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'Accept-Language': 'en-US,en;q=0.9',
}

const WSS_HEADERS = {
  Pragma: 'no-cache',
  'Cache-Control': 'no-cache',
  Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
  ...BASE_HEADERS,
}

const VOICE_HEADERS = {
  Authority: 'speech.platform.bing.com',
  'Sec-CH-UA': `" Not;A Brand";v="99", "Microsoft Edge";v="${CHROMIUM_MAJOR_VERSION}", "Chromium";v="${CHROMIUM_MAJOR_VERSION}"`,
  'Sec-CH-UA-Mobile': '?0',
  Accept: '*/*',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Dest': 'empty',
  ...BASE_HEADERS,
}

function connectId() {
  return crypto.randomUUID().replaceAll('-', '')
}

function generateMuid() {
  return crypto.randomBytes(16).toString('hex').toUpperCase()
}

function edgeDateString() {
  const date = new Date()
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${days[date.getUTCDay()]} ${months[date.getUTCMonth()]} ${String(date.getUTCDate()).padStart(2, '0')} ${date.getUTCFullYear()} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')} GMT+0000 (Coordinated Universal Time)`
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function removeIncompatibleCharacters(value) {
  return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
}

function sha256HexUpper(value) {
  return crypto.createHash('sha256').update(value, 'ascii').digest('hex').toUpperCase()
}

function getUnixTimestamp() {
  return Date.now() / 1000 + clockSkewSeconds
}

function generateSecMsGec() {
  let seconds = Math.floor(getUnixTimestamp() + WIN_EPOCH_SECONDS)
  seconds -= seconds % 300
  const ticks = seconds * TICKS_PER_SECOND
  return sha256HexUpper(`${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`)
}

function adjustClockSkewFromDateHeader(dateHeader) {
  if (!dateHeader) return false
  const parsed = Date.parse(dateHeader)
  if (!Number.isFinite(parsed)) return false
  const serverSeconds = parsed / 1000
  const localSeconds = Date.now() / 1000 + clockSkewSeconds
  clockSkewSeconds += serverSeconds - localSeconds
  return true
}

function normalizeLocale(voice) {
  const parts = String(voice || '').split('-')
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : 'en-US'
}

function buildSsml(text, options) {
  const voice = options.voice || 'en-US-AvaMultilingualNeural'
  const rate = options.rate || '+0%'
  const pitch = options.pitch || '+0Hz'
  const locale = normalizeLocale(voice)
  const escapedText = escapeXml(removeIncompatibleCharacters(text))
  return [
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}">`,
    `<voice name="${voice}">`,
    `<prosody rate="${rate}" pitch="${pitch}">${escapedText}</prosody>`,
    '</voice>',
    '</speak>',
  ].join('')
}

function buildConfigMessage() {
  const payload = {
    context: {
      synthesis: {
        audio: {
          metadataoptions: {
            sentenceBoundaryEnabled: 'true',
            wordBoundaryEnabled: 'false',
          },
          outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
        },
      },
    },
  }
  return [
    `X-Timestamp:${edgeDateString()}`,
    'Content-Type:application/json; charset=utf-8',
    'Path:speech.config',
    '',
    JSON.stringify(payload),
    '',
  ].join('\r\n')
}

function buildSsmlMessage(requestId, ssml) {
  return [
    `X-RequestId:${requestId}`,
    'Content-Type:application/ssml+xml',
    `X-Timestamp:${edgeDateString()}Z`,
    'Path:ssml',
    '',
    ssml,
  ].join('\r\n')
}

function parseHeaders(text) {
  const headers = {}
  for (const line of String(text).split(/\r\n|\n|\r/)) {
    const index = line.indexOf(':')
    if (index > -1) headers[line.slice(0, index)] = line.slice(index + 1)
  }
  return headers
}

function parseTextMessage(text) {
  const splitAt = String(text).indexOf('\r\n\r\n')
  if (splitAt === -1) return [parseHeaders(text), '']
  return [parseHeaders(String(text).slice(0, splitAt)), String(text).slice(splitAt + 4)]
}

function parseBinaryMessage(data) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data)
  if (bytes.length < 2) throw new Error('收到的音频包不完整。')
  const headerLength = bytes.readUInt16BE(0)
  const headerEnd = 2 + headerLength
  if (headerEnd > bytes.length) throw new Error('收到的音频包头部异常。')
  const headerText = bytes.subarray(2, headerEnd).toString('utf8')
  return [parseHeaders(headerText), bytes.subarray(headerEnd)]
}

function buildWebSocketUrl(requestId) {
  return `${WSS_URL}&ConnectionId=${requestId}&Sec-MS-GEC=${generateSecMsGec()}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`
}

function friendlyError(error) {
  if (error.statusCode === 403) {
    return new Error('连接 Edge-TTS 服务失败：Microsoft 返回 403。通常是系统时间偏差、VPN/网络策略、或短时间请求过快；已按服务器时间自动校正一次，请稍后再试或换网络。')
  }
  if (/403|Forbidden/i.test(error.message || '')) {
    return new Error('连接 Edge-TTS 服务失败：Microsoft 403 Forbidden。请检查系统时间、VPN/网络，或稍后再试。')
  }
  return error
}

async function synthesizeOnce(text, options = {}, control = {}) {
  const cleanText = String(text || '').trim()
  if (!cleanText) throw new Error('文案为空。')

  const requestId = connectId()
  const url = buildWebSocketUrl(requestId)
  const ssml = buildSsml(cleanText, options)
  const timeoutMs = control.timeoutMs || 90000

  return new Promise((resolve, reject) => {
    const chunks = []
    let audioReceived = false
    let settled = false
    let inactivityTimer = null
    const ws = new WebSocket(url, {
      headers: {
        ...WSS_HEADERS,
        Cookie: `muid=${generateMuid()};`,
      },
      perMessageDeflate: true,
      handshakeTimeout: Math.min(timeoutMs, 30000),
    })

    function finish(error, data) {
      if (settled) return
      settled = true
      if (inactivityTimer) clearTimeout(inactivityTimer)
      try { ws.close() } catch {}
      if (error) reject(error)
      else resolve(data)
    }

    function resetTimer() {
      if (inactivityTimer) clearTimeout(inactivityTimer)
      inactivityTimer = setTimeout(() => {
        finish(new Error('生成超时，请稍后重试。'))
      }, timeoutMs)
    }

    ws.on('open', () => {
      resetTimer()
      ws.send(buildConfigMessage())
      ws.send(buildSsmlMessage(requestId, ssml))
    })

    ws.on('unexpected-response', (_request, response) => {
      const statusCode = response.statusCode || 0
      const serverDate = response.headers?.date
      response.resume()
      const error = new Error(`Edge-TTS WebSocket unexpected response: HTTP ${statusCode}`)
      error.statusCode = statusCode
      error.serverDate = serverDate
      finish(error)
    })

    ws.on('error', (error) => {
      finish(error)
    })

    ws.on('close', (code) => {
      if (settled) return
      if (!audioReceived) {
        finish(new Error(`没有收到音频数据，连接已关闭。Code: ${code || 'unknown'}`))
        return
      }
      finish(null, Buffer.concat(chunks))
    })

    ws.on('message', (data, isBinary) => {
      try {
        resetTimer()
        if (!isBinary) {
          const [headers] = parseTextMessage(data.toString('utf8'))
          if (headers.Path === 'turn.end') ws.close()
          return
        }

        const [headers, audioData] = parseBinaryMessage(data)
        if (headers.Path === 'audio' && audioData.byteLength > 0) {
          chunks.push(Buffer.from(audioData))
          audioReceived = true
        }
      } catch (error) {
        finish(error)
      }
    })
  })
}

async function synthesize(text, options = {}, control = {}) {
  let lastError = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await synthesizeOnce(text, options, control)
    } catch (error) {
      lastError = error
      if (error.statusCode === 403 && adjustClockSkewFromDateHeader(error.serverDate) && attempt === 0) {
        continue
      }
      throw friendlyError(error)
    }
  }
  throw friendlyError(lastError || new Error('连接 Edge-TTS 服务失败。'))
}

async function listVoices() {
  const response = await fetch(VOICES_URL, { headers: VOICE_HEADERS })
  if (!response.ok) throw new Error(`语音列表加载失败：HTTP ${response.status}`)
  return response.json()
}

module.exports = {
  listVoices,
  synthesize,
}
