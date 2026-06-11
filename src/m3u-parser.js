export function parseM3U(content) {
  const channels = []
  const lines = content.split('\n')

  let current = null

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith('#EXTM3U')) continue

    if (trimmed.startsWith('#EXTINF:')) {
      current = { name: '', logo: '', group: '', url: '' }

      const logoMatch = trimmed.match(/tvg-logo="([^"]*)"/)
      if (logoMatch) current.logo = logoMatch[1]

      const groupMatch = trimmed.match(/group-title="([^"]*)"/)
      if (groupMatch) current.group = groupMatch[1] || 'Uncategorized'

      const nameMatch = trimmed.match(/,(.+)$/)
      if (nameMatch) current.name = nameMatch[1].trim()

      continue
    }

    if (current && trimmed && !trimmed.startsWith('#')) {
      current.url = trimmed
      if (current.name && current.url) {
        channels.push(current)
      }
      current = null
    }
  }

  return channels
}
