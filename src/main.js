import './style.css'
import { parseM3U } from './m3u-parser.js'

const M3U_URL = 'https://raw.githubusercontent.com/obaidhossain/livetv/refs/heads/main/src/FiFa-2026.m3u8'

let channels = []
let filteredChannels = []
let currentChannel = null
let hls = null
let liveOnly = false

const channelStatus = new Map()
const probeQueue = []
let activeProbes = 0
const MAX_PROBES = 3
const probeVids = []

const $ = (sel) => document.querySelector(sel)

const channelList = $('#channel-list')
const loading = $('#loading')
const searchInput = $('#search-input')
const categoryFilter = $('#category-filter')
const videoPlayer = $('#video-player')
const noChannel = $('#no-channel')
const streamError = $('#stream-error')
const channelInfo = $('#channel-info')
const channelLogo = $('#channel-logo')
const channelName = $('#channel-name')
const channelGroup = $('#channel-group')
const channelCount = $('#channel-count')
const liveToggle = $('#live-toggle')
const menuToggle = $('#menu-toggle')
const closeSidebar = $('#close-sidebar')
const sidebar = $('#sidebar')
const sidebarOverlay = $('#sidebar-overlay')
const openChannelListBtn = $('#open-channel-list')

let isSidebarOpen = false

function toggleSidebar(open) {
  isSidebarOpen = open !== undefined ? open : !isSidebarOpen
  sidebar.classList.toggle('-translate-x-full', !isSidebarOpen)
  sidebar.classList.toggle('translate-x-0', isSidebarOpen)
  sidebarOverlay.classList.toggle('hidden', !isSidebarOpen)
  document.body.classList.toggle('overflow-hidden', isSidebarOpen)
}

menuToggle?.addEventListener('click', () => toggleSidebar(true))
closeSidebar?.addEventListener('click', () => toggleSidebar(false))
sidebarOverlay?.addEventListener('click', () => toggleSidebar(false))
openChannelListBtn?.addEventListener('click', () => toggleSidebar(true))

function destroyHLS() {
  if (hls) {
    hls.destroy()
    hls = null
  }
}

function playStream(url) {
  destroyHLS()
  streamError.classList.add('hidden')
  noChannel.classList.add('hidden')

  if (url.includes('.m3u8')) {
    if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
      videoPlayer.src = url
    } else if (window.Hls) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: true })
      hls.loadSource(url)
      hls.attachMedia(videoPlayer)
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          streamError.classList.remove('hidden')
          channelStatus.set(url, 'error')
          updateChannelUI(url, 'error')
        }
      })
    } else {
      streamError.classList.remove('hidden')
      return
    }
  } else {
    videoPlayer.src = url
  }

  videoPlayer.play().catch(() => {
    streamError.classList.remove('hidden')
  })
}

function updateChannelUI(url, status) {
  const el = document.querySelector(`.channel-item[data-url="${CSS.escape(url)}"]`)
  if (!el) return

  const dot = el.querySelector('.status-dot')
  if (!dot) return

  dot.className = 'status-dot shrink-0 w-2 h-2 rounded-full'

  if (status === 'live') {
    dot.classList.add('bg-green-500')
    el.classList.remove('opacity-50', 'pointer-events-none', 'cursor-not-allowed')
    el.classList.add('cursor-pointer')
  } else if (status === 'error') {
    dot.classList.add('bg-red-500')
    el.classList.add('opacity-50', 'pointer-events-none', 'cursor-not-allowed')
    el.classList.remove('cursor-pointer')
  } else if (status === 'checking') {
    dot.classList.add('bg-yellow-500', 'animate-pulse')
    el.classList.remove('opacity-50', 'pointer-events-none', 'cursor-not-allowed')
    el.classList.add('cursor-pointer')
  } else {
    dot.classList.add('bg-gray-600')
  }
}

async function probeStream(url) {
  if (channelStatus.has(url) && channelStatus.get(url) !== 'checking') {
    return channelStatus.get(url)
  }

  channelStatus.set(url, 'checking')
  updateChannelUI(url, 'checking')

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup()
      channelStatus.set(url, 'error')
      updateChannelUI(url, 'error')
      resolve('error')
    }, 10000)

    const vid = document.createElement('video')
    vid.muted = true
    vid.preload = 'auto'
    vid.style.display = 'none'
    document.body.appendChild(vid)
    probeVids.push(vid)

    let done = false

    function finish(status) {
      if (done) return
      done = true
      clearTimeout(timeout)
      channelStatus.set(url, status)
      updateChannelUI(url, status)
      resolve(status)
      cleanup()
    }

    function cleanup() {
      const idx = probeVids.indexOf(vid)
      if (idx !== -1) probeVids.splice(idx, 1)
      vid.removeAttribute('src')
      vid.load()
      document.body.removeChild(vid)
    }

    const isM3U8 = url.includes('.m3u8')

    if (isM3U8 && !vid.canPlayType('application/vnd.apple.mpegurl') && window.Hls) {
      const hlsProbe = new Hls()
      hlsProbe.loadSource(url)
      hlsProbe.attachMedia(vid)

      hlsProbe.on(Hls.Events.MANIFEST_PARSED, () => {
        finish('live')
        hlsProbe.destroy()
      })

      hlsProbe.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          finish('error')
          hlsProbe.destroy()
        }
      })
    } else {
      vid.addEventListener('loadedmetadata', () => finish('live'), { once: true })
      vid.addEventListener('error', () => finish('error'), { once: true })
      vid.src = url
    }
  })
}

function processProbeQueue() {
  while (activeProbes < MAX_PROBES && probeQueue.length > 0) {
    const url = probeQueue.shift()
    if (!url) continue
    activeProbes++
    probeStream(url).finally(() => {
      activeProbes--
      processProbeQueue()
    })
  }
}

function queueProbe(url) {
  if (channelStatus.has(url) && channelStatus.get(url) !== 'checking') return
  if (probeQueue.includes(url)) return
  probeQueue.push(url)
  processProbeQueue()
}

function selectChannel(channel) {
  const status = channelStatus.get(channel.url)
  if (status === 'error') return

  currentChannel = channel

  channelName.textContent = channel.name
  channelGroup.textContent = channel.group
  channelLogo.src = channel.logo || ''
  channelLogo.onerror = () => { channelLogo.src = '' }
  channelInfo.classList.remove('hidden')

  document.querySelectorAll('.channel-item').forEach(el => {
    el.classList.remove('bg-blue-500/10', 'border-l-2', 'border-l-blue-500')
  })

  const activeItem = document.querySelector(`.channel-item[data-url="${CSS.escape(channel.url)}"]`)
  if (activeItem) {
    activeItem.classList.add('bg-blue-500/10', 'border-l-2', 'border-l-blue-500')
    activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  if (window.innerWidth < 1024) {
    toggleSidebar(false)
  }

  playStream(channel.url)
}

function createChannelItem(channel) {
  const div = document.createElement('div')
  div.className = 'channel-item flex items-center gap-3 px-3 md:px-4 py-3 md:py-2.5 border-l-2 border-l-transparent hover:bg-gray-800/50 active:bg-gray-800/80 transition-colors cursor-pointer touch-manipulation'
  div.dataset.url = channel.url

  const status = channelStatus.get(channel.url)

  const dot = document.createElement('span')
  dot.className = 'status-dot shrink-0 w-2 h-2 rounded-full'
  if (status === 'live') dot.classList.add('bg-green-500')
  else if (status === 'error') dot.classList.add('bg-red-500')
  else if (status === 'checking') dot.classList.add('bg-yellow-500', 'animate-pulse')
  else dot.classList.add('bg-gray-600')

  const img = document.createElement('img')
  img.className = 'w-9 h-9 rounded-lg object-cover bg-gray-800 shrink-0'
  img.src = channel.logo || ''
  img.alt = ''
  img.loading = 'lazy'
  img.onerror = () => { img.src = '' }

  const info = document.createElement('div')
  info.className = 'min-w-0 flex-1'

  const name = document.createElement('p')
  name.className = 'text-sm font-medium text-gray-200 truncate'
  name.textContent = channel.name

  const group = document.createElement('p')
  group.className = 'text-xs text-gray-500 truncate'
  group.textContent = channel.group

  info.appendChild(name)
  info.appendChild(group)
  div.appendChild(dot)
  div.appendChild(img)
  div.appendChild(info)

  if (status === 'error') {
    div.classList.add('opacity-50', 'pointer-events-none', 'cursor-not-allowed')
    div.classList.remove('cursor-pointer')
  }

  div.addEventListener('click', () => selectChannel(channel))

  return div
}

function renderChannels(list) {
  const existing = channelList.querySelectorAll('.channel-item, .category-header')
  existing.forEach(el => el.remove())

  if (!list.length) {
    const empty = document.createElement('div')
    empty.className = 'flex flex-col items-center justify-center h-full text-gray-500 px-4 py-8'
    empty.innerHTML = '<p class="text-sm">No channels found</p><p class="text-xs mt-1 text-gray-600">Try adjusting your search or filters</p>'
    channelList.appendChild(empty)
    return
  }

  const grouped = {}
  for (const ch of list) {
    const g = ch.group || 'Uncategorized'
    if (!grouped[g]) grouped[g] = []
    grouped[g].push(ch)
  }

  const sortedGroups = Object.keys(grouped).sort()

  for (const group of sortedGroups) {
    const header = document.createElement('div')
    header.className = 'category-header flex items-center gap-2 px-3 md:px-4 py-2 md:py-1.5 mt-2 first:mt-0 sticky top-0 bg-gray-900 z-10'
    header.innerHTML = `<span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">${group}</span><span class="text-xs text-gray-700">${grouped[group].length}</span>`
    channelList.appendChild(header)

    for (const ch of grouped[group]) {
      channelList.appendChild(createChannelItem(ch))
      queueProbe(ch.url)
    }
  }
}

function filterChannels() {
  const query = searchInput.value.toLowerCase().trim()
  const category = categoryFilter.value

  filteredChannels = channels.filter(ch => {
    const matchesSearch = !query || ch.name.toLowerCase().includes(query) || (ch.group && ch.group.toLowerCase().includes(query))
    const matchesCategory = !category || ch.group === category
    const status = channelStatus.get(ch.url)
    const matchesLive = !liveOnly || status === 'live' || !status
    return matchesSearch && matchesCategory && matchesLive
  })

  renderChannels(filteredChannels)
}

function populateCategories() {
  const cats = new Set(channels.map(ch => ch.group).filter(Boolean))
  const sorted = [...cats].sort()

  categoryFilter.innerHTML = '<option value="">All Categories</option>'
  for (const cat of sorted) {
    const opt = document.createElement('option')
    opt.value = cat
    opt.textContent = cat
    categoryFilter.appendChild(opt)
  }
}

async function loadPlaylist() {
  try {
    loading.classList.remove('hidden')

    const resp = await fetch(M3U_URL, { signal: AbortSignal.timeout(30000) })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

    const text = await resp.text()
    channels = parseM3U(text)

    loading.classList.add('hidden')

    channelCount.textContent = `${channels.length.toLocaleString()} channels`

    populateCategories()
    filterChannels()

    if (channels.length > 0) {
      selectChannel(channels[0])
    }
  } catch (err) {
    loading.innerHTML = `
      <div class="flex flex-col items-center gap-3 px-4 py-8 text-center">
        <svg class="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/>
        </svg>
        <p class="text-sm text-gray-400">Failed to load playlist</p>
        <p class="text-xs text-gray-600 break-words max-w-[200px]">${err.message}</p>
        <button onclick="location.reload()" class="mt-2 px-4 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">Retry</button>
      </div>`
  }
}

liveToggle.addEventListener('click', () => {
  liveOnly = !liveOnly
  liveToggle.classList.toggle('text-green-400', liveOnly)
  liveToggle.classList.toggle('border-green-500/50', liveOnly)
  liveToggle.classList.toggle('text-gray-400', !liveOnly)
  liveToggle.classList.toggle('border-gray-700', !liveOnly)
  filterChannels()
})

searchInput.addEventListener('input', filterChannels)
categoryFilter.addEventListener('change', filterChannels)

videoPlayer.addEventListener('error', () => {
  streamError.classList.remove('hidden')
  if (currentChannel) {
    channelStatus.set(currentChannel.url, 'error')
    updateChannelUI(currentChannel.url, 'error')
  }
})

videoPlayer.addEventListener('loadeddata', () => {
  streamError.classList.add('hidden')
  if (currentChannel) {
    channelStatus.set(currentChannel.url, 'live')
    updateChannelUI(currentChannel.url, 'live')
  }
})

videoPlayer.addEventListener('playing', () => {
  streamError.classList.add('hidden')
})

loadPlaylist()
