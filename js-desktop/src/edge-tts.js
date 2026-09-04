(() => {
  'use strict'

  const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
  const BASE_URL = 'speech.platform.bing.com/consumer/speech/synthesize/readaloud'
  const WSS_URL = `wss://${BASE_URL}/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`
  const VOICES_URL = `https://${BASE_URL}/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`
  const SEC_MS_GEC_VERSION = '1-143.0.3650.75'
  const WIN_EPOCH_SECONDS = 11644473600n
  function connectId() {
    return crypto.randomUUID().replaceAll('-', '')
  }

  function edgeDateString() {
    const date = new Date()
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${days[date.getUTCDay()]} ${months[date.getUTCMonth()]} ${String(date.getUTCDate()).padStart(2, '0')} ${date.getUTCFullYear()} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')} GMT+0000 (Coordinated Universal Time)`
  }

  function escapeXml(value) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  function removeIncompatibleCharacters(value) {
    return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  }

  async function sha256HexUpper(value) {
    const data = new TextEncoder().encode(value)
    const hash = await crypto.subtle.digest('SHA-256', data)
    return [...new Uint8Array(hash)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  }

  async function generateSecMsGec() {
    let seconds = BigInt(Math.floor(Date.now() / 1000))
    seconds += WIN_EPOCH_SECONDS
    seconds -= seconds % 300n
    const ticks = seconds * 10000000n
    return sha256HexUpper(`${ticks}${TRUSTED_CLIENT_TOKEN}`)
  }

  function normalizeLocale(voice) {
    const parts = voice.split('-')
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
              sentenceBoundaryEnabled: 'false',
              wordBoundaryEnabled: 'true',
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
    for (const line of text.split(/\r\n|\n|\r/)) {
      const index = line.indexOf(':')
      if (index > -1) headers[line.slice(0, index)] = line.slice(index + 1)
    }
    return headers
  }

  function parseTextMessage(text) {
    const splitAt = text.indexOf('\r\n\r\n')
    if (splitAt === -1) return [parseHeaders(text), '']
    return [parseHeaders(text.slice(0, splitAt)), text.slice(splitAt + 4)]
  }

  function parseBinaryMessage(buffer) {
    const bytes = new Uint8Array(buffer)
    if (bytes.length < 2) throw new Error('收到的音频包不完整。')

    const headerLength = (bytes[0] << 8) | bytes[1]
    const headerEnd = 2 + headerLength
    if (headerEnd > bytes.length) throw new Error('收到的音频包头部异常。')

    const headerText = new TextDecoder().decode(bytes.slice(2, headerEnd))
    return [parseHeaders(headerText), bytes.slice(headerEnd)]
  }

  function concatChunks(chunks) {
    let total = 0
    for (const chunk of chunks) total += chunk.byteLength

    const output = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      output.set(chunk, offset)
      offset += chunk.byteLength
    }
    return output
  }

  async function synthesize(text, options = {}, control = {}) {
    const cleanText = text.trim()
    if (!cleanText) throw new Error('文案为空。')

    const requestId = connectId()
    const secMsGec = await generateSecMsGec()
    const url = `${WSS_URL}&ConnectionId=${requestId}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`
    const ssml = buildSsml(cleanText, options)

    return new Promise((resolve, reject) => {
      const chunks = []
      let audioReceived = false
      let settled = false
      let inactivityTimer = 0
      const ws = new WebSocket(url)
      ws.binaryType = 'arraybuffer'

      function finish(error, data) {
        if (settled) return
        settled = true
        clearTimeout(inactivityTimer)
        if (control.signal) control.signal.removeEventListener('abort', abort)
        if (error) reject(error)
        else resolve(data)
      }

      function resetTimer() {
        clearTimeout(inactivityTimer)
        inactivityTimer = setTimeout(() => {
          try { ws.close() } catch {}
          finish(new Error('生成超时，请稍后重试。'))
        }, control.timeoutMs || 45000)
      }

      function abort() {
        try { ws.close() } catch {}
        finish(new DOMException('Aborted', 'AbortError'))
      }

      if (control.signal) {
        if (control.signal.aborted) {
          abort()
          return
        }
        control.signal.addEventListener('abort', abort, { once: true })
      }

      ws.onopen = () => {
        resetTimer()
        ws.send(buildConfigMessage())
        ws.send(buildSsmlMessage(requestId, ssml))
      }

      ws.onerror = () => {
        finish(new Error('连接 Edge-TTS 服务失败：可能是 Microsoft 403、网络/VPN、系统时间不准，或短时间请求过快。请稍后重试。'))
      }

      ws.onclose = () => {
        if (settled) return
        if (!audioReceived) {
          finish(new Error(`没有收到音频数据，连接已关闭。Code: ${ws.closeCode || 'unknown'}`))
          return
        }
        finish(null, concatChunks(chunks))
      }

      ws.onmessage = async (event) => {
        try {
          resetTimer()
          if (typeof event.data === 'string') {
            const [headers] = parseTextMessage(event.data)
            if (headers.Path === 'turn.end') ws.close()
            return
          }

          const buffer = event.data instanceof Blob ? await event.data.arrayBuffer() : event.data
          const [headers, audioData] = parseBinaryMessage(buffer)
          if (headers.Path === 'audio' && headers['Content-Type'] === 'audio/mpeg' && audioData.byteLength > 0) {
            chunks.push(audioData)
            audioReceived = true
          }
        } catch (error) {
          finish(error)
        }
      }
    })
  }

  async function listVoices() {
    const response = await fetch(VOICES_URL)
    if (!response.ok) throw new Error(`语音列表加载失败：HTTP ${response.status}`)
    return response.json()
  }

  window.EdgeTTS = { listVoices, synthesize }
})()
