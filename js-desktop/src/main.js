const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const { execFile } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs/promises')
const os = require('node:os')
const ffmpegPath = require('ffmpeg-static')
const ffmpegBinary = ffmpegPath ? ffmpegPath.replace('app.asar', 'app.asar.unpacked') : ''

const APP_ID = 'com.secureartifacts.clipchampvoicejs'
const APP_NAME = 'Clipchamp Voice Studio'

app.setName(APP_NAME)
app.setAppUserModelId(APP_ID)

function appIconPath() {
  return path.join(__dirname, '..', 'assets', 'icon.ico')
}

function defaultOutputRoot() {
  return path.join(app.getPath('documents'), 'Clipchamp Voice Output')
}

function safeSegment(value, fallback = 'Project') {
  const cleaned = String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 80)
  return cleaned || fallback
}

function safeFileName(value, fallback = 'voice.mp3') {
  const cleaned = path.basename(String(value || '').trim())
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 140)
  return cleaned || fallback
}

function resolveTaskFolder(baseFolder, taskName) {
  const root = path.resolve(String(baseFolder || defaultOutputRoot()))
  const folder = safeSegment(taskName, 'Default')
  return path.join(root, folder)
}

function withExtension(fileName, extension) {
  return `${path.parse(fileName).name}.${extension}`
}

function toBuffer(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes
  if (bytes instanceof ArrayBuffer) return Buffer.from(bytes)
  if (ArrayBuffer.isView(bytes)) return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (Array.isArray(bytes)) return Buffer.from(bytes)
  throw new Error('Invalid audio bytes.')
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegBinary, args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || stdout || error.message))
        return
      }
      resolve()
    })
  })
}

async function convertMp3ToMp4(mp3Path, mp4Path) {
  if (!ffmpegBinary) throw new Error('FFmpeg 未安装，无法转换 MP4。')
  await runFfmpeg([
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    mp3Path,
    '-vn',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    mp4Path,
  ])
}

const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n += 1) {
  let c = n
  for (let k = 0; k < 8; k += 1) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
  }
  crcTable[n] = c >>> 0
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980)
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { dosTime, dosDate }
}

function createZipBuffer(entries) {
  const chunks = []
  const central = []
  let offset = 0
  const { dosTime, dosDate } = dosDateTime()

  for (const entry of entries) {
    const data = Buffer.from(entry.data)
    const name = Buffer.from(entry.name, 'utf8')
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(dosTime, 10)
    local.writeUInt16LE(dosDate, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    chunks.push(local, name, data)

    const header = Buffer.alloc(46)
    header.writeUInt32LE(0x02014b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(20, 6)
    header.writeUInt16LE(0x0800, 8)
    header.writeUInt16LE(0, 10)
    header.writeUInt16LE(dosTime, 12)
    header.writeUInt16LE(dosDate, 14)
    header.writeUInt32LE(crc, 16)
    header.writeUInt32LE(data.length, 20)
    header.writeUInt32LE(data.length, 24)
    header.writeUInt16LE(name.length, 28)
    header.writeUInt16LE(0, 30)
    header.writeUInt16LE(0, 32)
    header.writeUInt16LE(0, 34)
    header.writeUInt16LE(0, 36)
    header.writeUInt32LE(0, 38)
    header.writeUInt32LE(offset, 42)
    central.push(header, name)

    offset += local.length + name.length + data.length
  }

  const centralStart = offset
  const centralBuffer = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuffer.length, 12)
  end.writeUInt32LE(centralStart, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...chunks, centralBuffer, end])
}

function uniqueName(name, used) {
  if (!used.has(name)) {
    used.add(name)
    return name
  }
  const parsed = path.parse(name)
  let index = 2
  while (used.has(`${parsed.name}_${index}${parsed.ext}`)) index += 1
  const next = `${parsed.name}_${index}${parsed.ext}`
  used.add(next)
  return next
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 660,
    title: APP_NAME,
    backgroundColor: '#070a16',
    icon: appIconPath(),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.once('ready-to-show', () => win.show())
  win.loadFile(path.join(__dirname, 'index.html'))
}

ipcMain.handle('app:default-output-root', () => defaultOutputRoot())

ipcMain.handle('dialog:choose-output-root', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择输出文件夹',
    defaultPath: defaultOutputRoot(),
    properties: ['openDirectory', 'createDirectory'],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('folder:open', async (_event, payload) => {
  const folder = resolveTaskFolder(payload?.baseFolder, payload?.taskName)
  await fs.mkdir(folder, { recursive: true })
  const result = await shell.openPath(folder)
  if (result) throw new Error(result)
  return { folder }
})

ipcMain.handle('file:show', async (_event, filePath) => {
  if (!filePath) return
  shell.showItemInFolder(filePath)
})

ipcMain.handle('file:open', async (_event, filePath) => {
  if (!filePath) return
  const result = await shell.openPath(filePath)
  if (result) throw new Error(result)
})

ipcMain.handle('audio:save', async (_event, payload) => {
  const folder = resolveTaskFolder(payload?.baseFolder, payload?.taskName)
  const requestedName = safeFileName(payload?.fileName, 'voice.mp3')
  const mp3Name = withExtension(requestedName, 'mp3')
  const mp4Name = withExtension(requestedName, 'mp4')
  const audio = toBuffer(payload?.bytes)
  await fs.mkdir(folder, { recursive: true })

  const mp3Path = path.join(folder, mp3Name)
  const mp4Path = path.join(folder, mp4Name)
  await fs.writeFile(mp3Path, audio)
  await convertMp3ToMp4(mp3Path, mp4Path)

  return {
    folder,
    fileName: mp3Name,
    paths: {
      mp3: mp3Path,
      mp4: mp4Path,
    },
  }
})

ipcMain.handle('zip:create', async (_event, payload) => {
  const folder = resolveTaskFolder(payload?.baseFolder, payload?.taskName)
  const formats = Array.isArray(payload?.formats) && payload.formats.length ? payload.formats : ['mp3']
  const files = Array.isArray(payload?.files) ? payload.files : []
  if (!files.length) throw new Error('没有可打包的文件。')

  await fs.mkdir(folder, { recursive: true })
  const used = new Set()
  const entries = []
  for (const file of files) {
    for (const format of formats) {
      const fmt = format === 'mp4' ? 'mp4' : 'mp3'
      const sourcePath = file.paths?.[fmt] || file.paths?.mp3
      if (!sourcePath) continue
      const data = await fs.readFile(sourcePath)
      const baseName = safeSegment(file.baseName || path.parse(file.fileName || 'voice').name, 'voice')
      const name = uniqueName(`${baseName}.${fmt}`, used)
      entries.push({ name, data })
    }
  }
  if (!entries.length) throw new Error('没有可打包的文件。')

  const zipName = safeFileName(payload?.zipName || 'tts_batch.zip', 'tts_batch.zip')
  const finalName = zipName.toLowerCase().endsWith('.zip') ? zipName : `${zipName}.zip`
  const zipPath = path.join(folder, finalName)
  await fs.writeFile(zipPath, createZipBuffer(entries))
  return { zipPath, folder, count: entries.length }
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
