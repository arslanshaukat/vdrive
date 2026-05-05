const MAX_WIDTH = 2048
const MAX_HEIGHT = 2048
const QUALITY = 0.82

function isHeic(file: File): boolean {
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    file.name.toLowerCase().endsWith('.heic') ||
    file.name.toLowerCase().endsWith('.heif')
  )
}

async function heicToJpeg(file: File): Promise<File> {
  // Lazy load heic2any only when actually needed
  const { default: heic2any } = await import('heic2any')
  const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: QUALITY })
  const blob = Array.isArray(result) ? result[0] : result
  const name = file.name.replace(/\.(heic|heif)$/i, '.jpg')
  return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })
}

function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > MAX_WIDTH || height > MAX_HEIGHT) {
        const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('No canvas context')); return }

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)

      const outputType = file.type === 'image/png' ? 'image/jpeg' : file.type
      const ext = outputType === 'image/jpeg' ? '.jpg' : (file.name.match(/\.[^.]+$/)?.[0] ?? '')
      const base = file.name.replace(/\.[^.]+$/, '')

      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('toBlob failed')); return }
        resolve(new File([blob], base + ext, { type: outputType, lastModified: Date.now() }))
      }, outputType, QUALITY)
    }

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Load failed')) }
    img.src = url
  })
}

export async function compressFile(file: File): Promise<File> {
  try {
    let working = file

    // Convert HEIC/HEIF first
    if (isHeic(file)) {
      working = await heicToJpeg(file)
      if (working.size < 200 * 1024) return working
    }

    if (!working.type.startsWith('image/')) return file
    if (working.type === 'image/svg+xml' || working.type === 'image/gif') return working
    if (working.size < 200 * 1024) return working

    const compressed = await compressImage(working)
    return compressed.size < working.size ? compressed : working
  } catch (err) {
    console.warn('Compression failed, using original:', err)
    return file
  }
}

export async function compressFiles(
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<File[]> {
  const results: File[] = []
  for (let i = 0; i < files.length; i++) {
    results.push(await compressFile(files[i]))
    onProgress?.(i + 1, files.length)
  }
  return results
}
