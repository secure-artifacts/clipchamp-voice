const storageKeys = {
  outputRoot: 'clipchamp_js_output_root',
  taskName: 'clipchamp_js_task_name',
  language: 'clipchamp_js_language',
  voice: 'clipchamp_js_voice',
  rate: 'clipchamp_js_rate',
  pitch: 'clipchamp_js_pitch',
  zipFormat: 'clipchamp_js_zip_format',
}

const fallbackVoices = [
  { ShortName: 'en-US-AvaMultilingualNeural', Locale: 'en-US', DisplayName: 'Ava Multilingual', LocalName: 'Ava Multilingual', Gender: 'Female' },
  { ShortName: 'en-US-EmmaMultilingualNeural', Locale: 'en-US', DisplayName: 'Emma Multilingual', LocalName: 'Emma Multilingual', Gender: 'Female' },
  { ShortName: 'en-US-AriaNeural', Locale: 'en-US', DisplayName: 'Aria', LocalName: 'Aria', Gender: 'Female' },
  { ShortName: 'en-US-GuyNeural', Locale: 'en-US', DisplayName: 'Guy', LocalName: 'Guy', Gender: 'Male' },
  { ShortName: 'en-GB-SoniaNeural', Locale: 'en-GB', DisplayName: 'Sonia', LocalName: 'Sonia', Gender: 'Female' },
  { ShortName: 'en-GB-RyanNeural', Locale: 'en-GB', DisplayName: 'Ryan', LocalName: 'Ryan', Gender: 'Male' },
  { ShortName: 'it-IT-ElsaNeural', Locale: 'it-IT', DisplayName: 'Elsa', LocalName: 'Elsa', Gender: 'Female' },
  { ShortName: 'it-IT-DiegoNeural', Locale: 'it-IT', DisplayName: 'Diego', LocalName: 'Diego', Gender: 'Male' },
  { ShortName: 'zh-CN-XiaoxiaoNeural', Locale: 'zh-CN', DisplayName: 'Xiaoxiao', LocalName: '晓晓', Gender: 'Female' },
  { ShortName: 'zh-CN-YunjianNeural', Locale: 'zh-CN', DisplayName: 'Yunjian', LocalName: '云健', Gender: 'Male' },
]

const el = {
  outputRoot: document.querySelector('#outputRoot'),
  taskName: document.querySelector('#taskName'),
  chooseRoot: document.querySelector('#chooseRoot'),
  openFolder: document.querySelector('#openFolder'),
  language: document.querySelector('#language'),
  voice: document.querySelector('#voice'),
  rate: document.querySelector('#rate'),
  pitch: document.querySelector('#pitch'),
  addCard: document.querySelector('#addCard'),
  generateAll: document.querySelector('#generateAll'),
  previewAll: document.querySelector('#previewAll'),
  createZip: document.querySelector('#createZip'),
  cards: document.querySelector('#cards'),
  cardCount: document.querySelector('#cardCount'),
  progressFill: document.querySelector('#progressFill'),
  status: document.querySelector('#status'),
  zipFormats: [...document.querySelectorAll('input[name="zipFormat"]')],
}

let voices = []
let voicesByLocale = new Map()
let generatedFiles = []
let currentAudio = null
let currentAudioUrl = ''
let currentButton = null
let isGenerating = false
let previewAbort = null

function setStatus(message) {
  el.status.textContent = message || 'Ready'
}

function setProgress(done, total) {
  const percent = total ? Math.round((done / total) * 100) : 0
  el.progressFill.style.width = `${percent}%`
  el.progressFill.textContent = percent ? `${percent}%` : ''
}

function selectedZipFormats() {
  const selected = el.zipFormats.find((input) => input.checked)?.value || 'mp3'
  return selected === 'both' ? ['mp3', 'mp4'] : [selected]
}

function zipLabel() {
  const formats = selectedZipFormats()
  return formats.length > 1 ? 'MP3+MP4' : formats[0].toUpperCase()
}

function updateZipButton() {
  el.createZip.textContent = `打包 ${zipLabel()} ZIP`
}

function refreshControls() {
  const hasGenerated = generatedFiles.length > 0
  el.previewAll.disabled = !hasGenerated || isGenerating
  el.createZip.disabled = !hasGenerated || isGenerating
  for (const input of el.zipFormats) input.disabled = isGenerating
  updateZipButton()
}

function stopAudio(resetButton = true) {
  if (previewAbort) {
    previewAbort.abort()
    previewAbort = null
  }
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
  }
  if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl)
  currentAudio = null
  currentAudioUrl = ''
  if (resetButton && currentButton) {
    currentButton.disabled = false
    currentButton.textContent = currentButton.dataset.label || '试听'
  }
  currentButton = null
}

function sanitizeFilename(text) {
  return text.trim().slice(0, 12).replace(/[\\/:*?"<>|\r\n]/g, '_') || 'untitled'
}

function fullTaskName() {
  return el.taskName.value.trim() || 'Default'
}

function cardList() {
  return [...el.cards.querySelectorAll('.script-card')]
}

function renumberCards() {
  const cards = cardList()
  cards.forEach((card, index) => {
    card.querySelector('.card-number').textContent = `#${String(index + 1).padStart(2, '0')}`
  })
  el.cardCount.textContent = `${cards.length} 条文案`
}

function setCardStatus(card, message) {
  card.querySelector('.card-status').textContent = message || ''
}

function setResultButtons(card, enabled) {
  for (const button of card.querySelectorAll('[data-result-action]')) {
    button.disabled = !enabled
  }
}

function makeButton(label, className = '') {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.dataset.label = label
  if (className) button.className = className
  return button
}

function addCard(text = '') {
  const card = document.createElement('article')
  card.className = 'script-card'

  const head = document.createElement('div')
  head.className = 'card-head'
  const number = document.createElement('span')
  number.className = 'card-number'
  const status = document.createElement('span')
  status.className = 'card-status'
  status.textContent = '等待'
  head.append(number, status)

  const textarea = document.createElement('textarea')
  textarea.placeholder = '输入或从 Excel 粘贴文案...'
  textarea.value = text
  textarea.spellcheck = false
  textarea.addEventListener('paste', (event) => handlePaste(event, card, textarea))
  textarea.addEventListener('input', () => {
    delete card.dataset.resultIndex
    setResultButtons(card, false)
    setCardStatus(card, '已修改')
  })

  const foot = document.createElement('div')
  foot.className = 'card-foot'
  const preview = makeButton('试听')
  const full = makeButton('试听完整')
  full.dataset.resultAction = 'play'
  full.disabled = true
  const mp3 = makeButton('MP3')
  mp3.dataset.resultAction = 'mp3'
  mp3.disabled = true
  const mp4 = makeButton('MP4')
  mp4.dataset.resultAction = 'mp4'
  mp4.disabled = true
  const show = makeButton('位置')
  show.dataset.resultAction = 'show'
  show.disabled = true
  const remove = makeButton('删除', 'danger')

  preview.addEventListener('click', () => previewCard(card, textarea, preview))
  full.addEventListener('click', () => playGenerated(card, full))
  mp3.addEventListener('click', () => showGenerated(card, 'mp3'))
  mp4.addEventListener('click', () => showGenerated(card, 'mp4'))
  show.addEventListener('click', () => showGenerated(card, 'mp3'))
  remove.addEventListener('click', () => {
    const index = Number(card.dataset.resultIndex)
    if (Number.isInteger(index)) generatedFiles = generatedFiles.filter((_, itemIndex) => itemIndex !== index)
    card.remove()
    if (!cardList().length) addCard()
    syncResultIndexes()
    renumberCards()
    refreshControls()
  })

  foot.append(preview, full, mp3, mp4, show, remove)
  card.append(head, textarea, foot)
  el.cards.append(card)
  renumberCards()
  return card
}

function syncResultIndexes() {
  generatedFiles.forEach((file, index) => {
    if (file.card && document.body.contains(file.card)) file.card.dataset.resultIndex = String(index)
  })
}

function handlePaste(event, card, textarea) {
  const raw = event.clipboardData?.getData('text/plain') || ''
  const rows = raw.split(/\r?\n/).map((row) => row.trim()).filter(Boolean)
  if (rows.length <= 1) return

  event.preventDefault()
  textarea.value = rows[0]
  let insertAfter = card
  for (const row of rows.slice(1)) {
    const next = addCard(row)
    el.cards.insertBefore(next, insertAfter.nextSibling)
    insertAfter = next
  }
  renumberCards()
  setStatus(`已拆分 ${rows.length} 条文案`)
}

async function playBytes(bytes, button, card, label = '播放中') {
  stopAudio()
  currentButton = button
  button.disabled = true
  button.textContent = label
  if (card) setCardStatus(card, label)

  const blob = new Blob([bytes], { type: 'audio/mpeg' })
  currentAudioUrl = URL.createObjectURL(blob)
  currentAudio = new Audio(currentAudioUrl)

  return new Promise((resolve, reject) => {
    currentAudio.onended = () => {
      button.disabled = false
      button.textContent = button.dataset.label || '试听'
      currentButton = null
      if (card) setCardStatus(card, '试听完成')
      resolve()
    }
    currentAudio.onerror = () => {
      button.disabled = false
      button.textContent = button.dataset.label || '试听'
      currentButton = null
      if (card) setCardStatus(card, '播放失败')
      reject(new Error('播放失败。'))
    }
    currentAudio.play().catch(reject)
  })
}

async function previewCard(card, textarea, button) {
  const text = textarea.value.trim()
  if (!text) {
    setCardStatus(card, '文案为空')
    return
  }
  previewAbort = new AbortController()
  try {
    button.disabled = true
    button.textContent = '生成中'
    setCardStatus(card, '试听生成中')
    const bytes = await synthesizeText(text.slice(0, 30), currentVoiceOptions(), {
      signal: previewAbort.signal,
      timeoutMs: 45000,
    })
    await playBytes(bytes, button, card)
  } catch (error) {
    if (error.name !== 'AbortError') {
      setCardStatus(card, '试听失败')
      setStatus(error.message)
      button.disabled = false
      button.textContent = button.dataset.label || '试听'
    }
  } finally {
    previewAbort = null
  }
}

async function synthesizeText(text, options, control = {}) {
  const data = await window.desktop.synthesize({
    text,
    options,
    timeoutMs: control.timeoutMs || 90000,
  })
  return data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data || [])
}
function currentVoiceOptions() {
  return {
    voice: el.voice.value || 'en-US-AvaMultilingualNeural',
    rate: el.rate.value || '+0%',
    pitch: el.pitch.value || '+0Hz',
  }
}

function collectItems() {
  return cardList()
    .map((card) => ({ card, textarea: card.querySelector('textarea'), text: card.querySelector('textarea').value.trim() }))
    .filter((item) => item.text)
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function generateAll() {
  if (isGenerating) return
  const items = collectItems()
  if (!items.length) {
    setStatus('没有可生成的文案')
    return
  }

  isGenerating = true
  generatedFiles = []
  stopAudio()
  refreshControls()
  setProgress(0, items.length)
  el.generateAll.disabled = true
  el.addCard.disabled = true
  el.chooseRoot.disabled = true
  el.openFolder.disabled = true

  for (const item of items) {
    delete item.card.dataset.resultIndex
    item.card.classList.remove('done', 'failed')
    setResultButtons(item.card, false)
  }

  try {
    let index = 1
    for (const item of items) {
      const sequence = String(index).padStart(2, '0')
      const fileName = `${sequence}_${sanitizeFilename(item.text)}.mp3`
      setStatus(`正在生成 ${index}/${items.length}`)
      setCardStatus(item.card, '生成中')

      const bytes = await synthesizeText(item.text, currentVoiceOptions(), { timeoutMs: 90000 })
      const saveResult = await window.desktop.saveAudio({
        baseFolder: el.outputRoot.value,
        taskName: fullTaskName(),
        fileName,
        bytes,
      })

      const result = {
        id: crypto.randomUUID(),
        card: item.card,
        fileName: saveResult.fileName,
        baseName: saveResult.fileName.replace(/\.mp3$/i, ''),
        paths: saveResult.paths,
        bytes,
      }
      generatedFiles.push(result)
      syncResultIndexes()
      item.card.classList.add('done')
      setResultButtons(item.card, true)
      setCardStatus(item.card, saveResult.fileName)
      setProgress(index, items.length)
      index += 1
      await delay(1500)
    }
    setStatus(`全部完成：${fullTaskName()}`)
  } catch (error) {
    setStatus(error.message)
  } finally {
    isGenerating = false
    el.generateAll.disabled = false
    el.addCard.disabled = false
    el.chooseRoot.disabled = false
    el.openFolder.disabled = false
    refreshControls()
  }
}

function resultForCard(card) {
  const index = Number(card.dataset.resultIndex)
  return Number.isInteger(index) ? generatedFiles[index] : null
}

async function playGenerated(card, button) {
  const result = resultForCard(card)
  if (!result) return
  try {
    await playBytes(result.bytes, button, card, '播放中')
  } catch (error) {
    setStatus(error.message)
  }
}

async function previewAll() {
  if (!generatedFiles.length || isGenerating) return
  el.previewAll.disabled = true
  el.createZip.disabled = true
  try {
    let index = 1
    for (const result of generatedFiles) {
      if (!result.card || !document.body.contains(result.card)) continue
      setStatus(`正在试听 ${index}/${generatedFiles.length}`)
      await playBytes(result.bytes, el.previewAll, result.card, '试听全部中')
      index += 1
    }
    setStatus('全部试听完成')
  } catch (error) {
    setStatus(error.message)
  } finally {
    el.previewAll.textContent = '试听全部'
    refreshControls()
  }
}

async function showGenerated(card, format) {
  const result = resultForCard(card)
  const target = result?.paths?.[format]
  if (!target) return
  await window.desktop.showFile(target)
}

async function createZip() {
  if (!generatedFiles.length) return
  const label = zipLabel()
  const zipName = `${sanitizeFilename(fullTaskName())}_${label.replace('+', '_')}.zip`
  el.createZip.disabled = true
  setStatus(`正在打包 ${label} ZIP`)
  try {
    const result = await window.desktop.createZip({
      baseFolder: el.outputRoot.value,
      taskName: fullTaskName(),
      zipName,
      formats: selectedZipFormats(),
      files: generatedFiles.map((file) => ({ fileName: file.fileName, baseName: file.baseName, paths: file.paths })),
    })
    setStatus(`ZIP 已保存：${result.zipPath}`)
    await window.desktop.showFile(result.zipPath)
  } catch (error) {
    setStatus(error.message)
  } finally {
    refreshControls()
  }
}

function localeName(locale) {
  try {
    const [language, region] = locale.split('-')
    const languageName = new Intl.DisplayNames(['zh-CN'], { type: 'language' }).of(language) || language
    const regionName = region ? new Intl.DisplayNames(['zh-CN'], { type: 'region' }).of(region) : ''
    return regionName ? `${languageName} - ${regionName}` : languageName
  } catch {
    return locale
  }
}

function voiceLabel(voice) {
  const name = voice.LocalName || voice.DisplayName || voice.ShortName
  const gender = voice.Gender ? ` · ${voice.Gender}` : ''
  return `${name}${gender}`
}

function indexVoices(list) {
  voices = list.filter((voice) => voice.ShortName && voice.Locale)
  voices.sort((a, b) => `${a.Locale}-${voiceLabel(a)}`.localeCompare(`${b.Locale}-${voiceLabel(b)}`))
  voicesByLocale = new Map()
  for (const voice of voices) {
    if (!voicesByLocale.has(voice.Locale)) voicesByLocale.set(voice.Locale, [])
    voicesByLocale.get(voice.Locale).push(voice)
  }
}

function populateLanguages() {
  const saved = localStorage.getItem(storageKeys.language) || 'en-US'
  const options = [...voicesByLocale.keys()].sort((a, b) => localeName(a).localeCompare(localeName(b)))
  el.language.replaceChildren()
  for (const locale of options) {
    const option = document.createElement('option')
    option.value = locale
    option.textContent = `${localeName(locale)} (${locale})`
    el.language.append(option)
  }
  el.language.value = options.includes(saved) ? saved : (options.includes('en-US') ? 'en-US' : options[0])
}

function preferredVoice(localeVoices) {
  const saved = localStorage.getItem(storageKeys.voice)
  if (localeVoices.some((voice) => voice.ShortName === saved)) return saved
  return localeVoices.find((voice) => /Ava|Emma|Aria/i.test(voice.ShortName))?.ShortName || localeVoices[0]?.ShortName || ''
}

function populateVoices() {
  const list = voicesByLocale.get(el.language.value) || []
  el.voice.replaceChildren()
  for (const voice of list) {
    const option = document.createElement('option')
    option.value = voice.ShortName
    option.textContent = voiceLabel(voice)
    el.voice.append(option)
  }
  el.voice.value = preferredVoice(list)
  localStorage.setItem(storageKeys.voice, el.voice.value)
}

async function loadVoices() {
  setStatus('正在加载语音列表')
  try {
    indexVoices(await window.desktop.listVoices())
    setStatus('语音列表已加载')
  } catch (error) {
    indexVoices(fallbackVoices)
    setStatus('完整语音列表加载失败，已使用内置常用语音')
  }
  populateLanguages()
  populateVoices()
}

async function loadSettings() {
  const defaultRoot = await window.desktop.defaultOutputRoot()
  el.outputRoot.value = localStorage.getItem(storageKeys.outputRoot) || defaultRoot
  el.taskName.value = localStorage.getItem(storageKeys.taskName) || '第一期'
  el.rate.value = localStorage.getItem(storageKeys.rate) || '+0%'
  el.pitch.value = localStorage.getItem(storageKeys.pitch) || '+0Hz'
  const zip = localStorage.getItem(storageKeys.zipFormat) || 'mp3'
  const zipInput = el.zipFormats.find((input) => input.value === zip) || el.zipFormats[0]
  zipInput.checked = true
  updateZipButton()
}

function bindEvents() {
  el.chooseRoot.addEventListener('click', async () => {
    const folder = await window.desktop.chooseOutputRoot()
    if (folder) {
      el.outputRoot.value = folder
      localStorage.setItem(storageKeys.outputRoot, folder)
    }
  })
  el.openFolder.addEventListener('click', async () => {
    try {
      const result = await window.desktop.openFolder({ baseFolder: el.outputRoot.value, taskName: fullTaskName() })
      setStatus(result.folder)
    } catch (error) {
      setStatus(error.message)
    }
  })
  el.addCard.addEventListener('click', () => addCard())
  el.generateAll.addEventListener('click', generateAll)
  el.previewAll.addEventListener('click', previewAll)
  el.createZip.addEventListener('click', createZip)
  el.language.addEventListener('change', () => {
    localStorage.setItem(storageKeys.language, el.language.value)
    populateVoices()
  })
  for (const input of [el.outputRoot, el.taskName, el.voice, el.rate, el.pitch]) {
    input.addEventListener('input', () => localStorage.setItem(storageKeys[input.id] || input.id, input.value))
  }
  el.outputRoot.addEventListener('input', () => localStorage.setItem(storageKeys.outputRoot, el.outputRoot.value))
  el.taskName.addEventListener('input', () => localStorage.setItem(storageKeys.taskName, el.taskName.value))
  el.voice.addEventListener('change', () => localStorage.setItem(storageKeys.voice, el.voice.value))
  el.rate.addEventListener('change', () => localStorage.setItem(storageKeys.rate, el.rate.value))
  el.pitch.addEventListener('change', () => localStorage.setItem(storageKeys.pitch, el.pitch.value))
  for (const input of el.zipFormats) {
    input.addEventListener('change', () => {
      if (input.checked) localStorage.setItem(storageKeys.zipFormat, input.value)
      refreshControls()
    })
  }
}

async function boot() {
  bindEvents()
  await loadSettings()
  addCard()
  await loadVoices()
  refreshControls()
}

boot().catch((error) => setStatus(error.message))
