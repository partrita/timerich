<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'

// 설정값 범위 및 기본값 (분 단위)
const MIN_MINUTES = 1
const MAX_MINUTES = 180
const FOCUS_DEFAULT_MINUTES = 25
const BREAK_DEFAULT_MINUTES = 5

// localStorage에서 저장된 설정을 불러옵니다.
const loadMinutes = (key: string, fallback: number) => {
  try {
    const saved = window.localStorage.getItem(key)
    if (saved !== null) {
      const parsed = parseInt(saved, 10)
      if (Number.isFinite(parsed)) return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, parsed))
    }
  } catch (err) {
    console.error('저장된 시간 설정을 불러오지 못했습니다:', err)
  }
  return fallback
}

// 집중/휴식 시간 설정 (분 단위, localStorage에 영속화)
const focusMinutes = ref(loadMinutes('timerich:focusMinutes', FOCUS_DEFAULT_MINUTES))
const breakMinutes = ref(loadMinutes('timerich:breakMinutes', BREAK_DEFAULT_MINUTES))

const saveMinutes = () => {
  try {
    window.localStorage.setItem('timerich:focusMinutes', String(focusMinutes.value))
    window.localStorage.setItem('timerich:breakMinutes', String(breakMinutes.value))
  } catch (err) {
    console.error('시간 설정을 저장하지 못했습니다:', err)
  }
}

// 설정 패널 표시 여부 및 입력 초안값
const showSettings = ref(false)
const focusInput = ref(focusMinutes.value)
const breakInput = ref(breakMinutes.value)

// 퀵 테스트용 모드 지원 (집중 5초, 휴식 3초)
const isTestMode = ref(false)

const focusTime = computed(() => isTestMode.value ? 5 : focusMinutes.value * 60)
const breakTime = computed(() => isTestMode.value ? 3 : breakMinutes.value * 60)

// 탭에 표시할 시간 라벨
const focusTabLabel = computed(() => isTestMode.value ? '5초' : `${focusMinutes.value}분`)
const breakTabLabel = computed(() => isTestMode.value ? '3초' : `${breakMinutes.value}분`)

// --- 날짜별 기록 & 연속일 (localStorage 영속화) ---
interface SessionEntry {
  endTime: number
  seconds: number
}

interface DayRecord {
  date: string
  focusCount: number
  focusSeconds: number
  sessions: SessionEntry[]
}

const HISTORY_KEY = 'timerich:history'
const MAX_HISTORY_DAYS = 30
const MAX_SESSIONS_PER_DAY = 50

// 로컬 날짜 기준 YYYY-MM-DD 키
const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const loadHistory = (): Record<string, DayRecord> => {
  try {
    const saved = window.localStorage.getItem(HISTORY_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as Record<string, DayRecord>
      if (parsed && typeof parsed === 'object') {
        for (const key of Object.keys(parsed)) {
          const day = parsed[key]
          if (!day || typeof day.focusCount !== 'number' || typeof day.focusSeconds !== 'number' || !Array.isArray(day.sessions)) {
            delete parsed[key]
          }
        }
        return parsed
      }
    }
  } catch (err) {
    console.error('집중 기록을 불러오지 못했습니다:', err)
  }
  return {}
}

const history = ref<Record<string, DayRecord>>(loadHistory())

const pruneHistory = () => {
  const keys = Object.keys(history.value).sort()
  while (keys.length > MAX_HISTORY_DAYS) {
    const oldest = keys.shift()
    if (oldest === undefined) break
    delete history.value[oldest]
  }
}

const persistHistory = () => {
  pruneHistory()
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.value))
  } catch (err) {
    console.error('집중 기록을 저장하지 못했습니다:', err)
  }
}

// 오늘 기록 (없으면 생성)
const getTodayRecord = () => {
  const key = dateKey(new Date())
  if (!history.value[key]) {
    history.value[key] = { date: key, focusCount: 0, focusSeconds: 0, sessions: [] }
  }
  return history.value[key]
}

// 실행 중 1초마다 실제 집중 시간 누적
const recordFocusSecond = () => {
  getTodayRecord().focusSeconds++
}

// 화면 표시용 오늘 통계
const todayStats = computed((): DayRecord => history.value[dateKey(new Date())] ?? { date: '', focusCount: 0, focusSeconds: 0, sessions: [] })
const focusCount = computed(() => todayStats.value.focusCount)

const todayFocusLabel = computed(() => {
  const totalMin = Math.floor(todayStats.value.focusSeconds / 60)
  if (totalMin >= 60) return `${Math.floor(totalMin / 60)}시간 ${totalMin % 60}분`
  return `${totalMin}분`
})

// 2026년 최저시급 기준 오늘 번 돈 환산
const MIN_WAGE_PER_HOUR = 10320

const todayEarnings = computed(() =>
  Math.floor(todayStats.value.focusSeconds / 3600 * MIN_WAGE_PER_HOUR)
)

const formattedEarnings = computed(() => `${todayEarnings.value.toLocaleString('ko-KR')}원`)
const minWageLabel = computed(() => `${MIN_WAGE_PER_HOUR.toLocaleString('ko-KR')}원`)

// 연속 집중일 (오늘 기록이 없으면 어제부터 소급)
const streak = computed(() => {
  let days = 0
  const cursor = new Date()
  if ((history.value[dateKey(cursor)]?.focusCount ?? 0) === 0) {
    cursor.setDate(cursor.getDate() - 1)
  }
  while ((history.value[dateKey(cursor)]?.focusCount ?? 0) > 0) {
    days++
    cursor.setDate(cursor.getDate() - 1)
  }
  return days
})

// 최근 완료 세션 (최신순 최대 10개)
const recentSessions = computed(() => {
  const all: (SessionEntry & { date: string })[] = []
  for (const day of Object.values(history.value)) {
    for (const session of day.sessions) {
      all.push({ ...session, date: day.date })
    }
  }
  all.sort((a, b) => b.endTime - a.endTime)
  return all.slice(0, 10)
})

const formatSessionTime = (timestamp: number) => {
  const d = new Date(timestamp)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const formatDuration = (seconds: number) =>
  seconds >= 60 ? `${Math.round(seconds / 60)}분 집중` : `${seconds}초 집중`

// 타이머 상태 관리
const mode = ref<'focus' | 'break'>('focus')
const currentTime = ref(focusTime.value)
const isRunning = ref(false)
const hasNotificationPermission = ref(false)

let timerId: number | null = null

// SVG 원형 프로그레스 바 계산용
const radius = 100
const circumference = 2 * Math.PI * radius
const progressOffset = computed(() => {
  const total = mode.value === 'focus' ? focusTime.value : breakTime.value
  const ratio = currentTime.value / total
  return circumference * (1 - ratio)
})

// 남은 시간 포맷팅 (MM:SS)
const formattedTime = computed(() => {
  const minutes = Math.floor(currentTime.value / 60)
  const seconds = currentTime.value % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})

// 브라우저 탭 타이틀 실시간 업데이트
watch([formattedTime, mode, isRunning], () => {
  const modeText = mode.value === 'focus' ? '집중' : '휴식'
  if (isRunning.value) {
    document.title = `[${formattedTime.value}] ${modeText} 중 | 시간부자`
  } else {
    document.title = `일시정지됨 | 시간부자`
  }
})

// 테스트 모드가 바뀔 때 현재 시간 리셋
watch(isTestMode, () => {
  resetTimer()
})

// Web Audio API를 활용한 효과음 발생기
const playSound = (type: 'focus' | 'break') => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    
    const playNote = (frequency: number, duration: number, startDelay: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      
      osc.type = 'sine'
      osc.frequency.setValueAtTime(frequency, ctx.currentTime + startDelay)
      
      gain.gain.setValueAtTime(0, ctx.currentTime + startDelay)
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + startDelay + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startDelay + duration)
      
      osc.connect(gain)
      gain.connect(ctx.destination)
      
      osc.start(ctx.currentTime + startDelay)
      osc.stop(ctx.currentTime + startDelay + duration)
    }

    if (type === 'focus') {
      // 집중 완료 (높고 경쾌한 차임벨 도-미-솔-도)
      playNote(523.25, 0.15, 0)      // C5
      playNote(659.25, 0.15, 0.12)    // E5
      playNote(783.99, 0.15, 0.24)    // G5
      playNote(1046.50, 0.4, 0.36)   // C6
    } else {
      // 휴식 완료 (차분하고 산뜻한 솔-미-도)
      playNote(783.99, 0.15, 0)      // G5
      playNote(659.25, 0.15, 0.12)    // E5
      playNote(523.25, 0.4, 0.24)     // C5
    }
  } catch (err) {
    console.error('AudioContext 오디오 재생 실패:', err)
  }
}

// 브라우저 알림 전송
const sendNotification = (title: string, body: string) => {
  if (hasNotificationPermission.value && 'Notification' in window) {
    new Notification(title, {
      body,
      icon: '/icons_light.png' // 시간부자 앱 아이콘 (라이트 모드)
    })
  }
}

// 알림 권한 체크 및 요청
const requestNotificationPermission = async () => {
  if (!('Notification' in window)) {
    alert('이 브라우저는 알림 기능을 지원하지 않습니다.')
    return
  }
  
  try {
    const permission = await Notification.requestPermission()
    hasNotificationPermission.value = permission === 'granted'
  } catch (err) {
    console.error('알림 권한 요청 중 오류 발생:', err)
  }
}

// 알림 권한 초기 상태 체크
if ('Notification' in window) {
  hasNotificationPermission.value = Notification.permission === 'granted'
}

// 타이머 작동 로직
const startTimer = () => {
  if (isRunning.value) return
  isRunning.value = true
  
  timerId = window.setInterval(() => {
    if (currentTime.value > 0) {
      currentTime.value--
      if (mode.value === 'focus') recordFocusSecond()
    } else {
      handleTimerComplete()
    }
  }, 1000)
}

const pauseTimer = () => {
  if (timerId) {
    clearInterval(timerId)
    timerId = null
  }
  isRunning.value = false
  persistHistory()
}

const resetTimer = () => {
  pauseTimer()
  currentTime.value = mode.value === 'focus' ? focusTime.value : breakTime.value
}

// 타이머 종료 처리 및 모드 전환
const handleTimerComplete = () => {
  pauseTimer()
  playSound(mode.value)

  // 모바일 진동 알림 (지원 기기만)
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(mode.value === 'focus' ? [200, 100, 200] : [150])
    }
  } catch (err) {
    console.error('진동 알림 실패:', err)
  }

  if (mode.value === 'focus') {
    const record = getTodayRecord()
    record.focusCount++
    record.sessions.push({ endTime: Date.now(), seconds: focusTime.value })
    if (record.sessions.length > MAX_SESSIONS_PER_DAY) {
      record.sessions.splice(0, record.sessions.length - MAX_SESSIONS_PER_DAY)
    }
    persistHistory()
    sendNotification('집중 완료!', `${focusMinutes.value}분 집중 세션이 완료되었습니다! 이제 ${breakMinutes.value}분 동안 휴식을 시작하세요.`)
    
    // 휴식 모드로 자동 전환
    mode.value = 'break'
    currentTime.value = breakTime.value
  } else {
    sendNotification('휴식 끝!', '휴식 시간이 완료되었습니다! 다시 집중 세션을 시작해보세요.')
    
    // 집중 모드로 자동 전환
    mode.value = 'focus'
    currentTime.value = focusTime.value
  }
  
  // 자동으로 다음 타이머 시작
  startTimer()
}

// 수동 모드 토글 (타이머가 멈춘 상태 또는 진행 중인 상태 모두 초기화 후 전환)
const toggleMode = (targetMode: 'focus' | 'break') => {
  if (mode.value === targetMode) return
  mode.value = targetMode
  resetTimer()
}

// 설정 패널 열기/닫기 (열 때 현재값을 입력란에 반영)
const toggleSettings = () => {
  showSettings.value = !showSettings.value
  if (showSettings.value) {
    focusInput.value = focusMinutes.value
    breakInput.value = breakMinutes.value
  }
}

// 입력값을 1~180분 범위로 보정
const clampMinutes = (value: unknown, fallback: number) => {
  const parsed = typeof value === 'number' ? Math.floor(value) : parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, parsed))
}

// 설정 적용 (입력 변경 시 호출)
const applySettings = () => {
  focusMinutes.value = clampMinutes(focusInput.value, focusMinutes.value)
  breakMinutes.value = clampMinutes(breakInput.value, breakMinutes.value)
  focusInput.value = focusMinutes.value
  breakInput.value = breakMinutes.value
  saveMinutes()
  resetTimer()
}

// 기본값(집중 25분 / 휴식 5분)으로 되돌리기
const resetToDefaults = () => {
  focusMinutes.value = FOCUS_DEFAULT_MINUTES
  breakMinutes.value = BREAK_DEFAULT_MINUTES
  focusInput.value = focusMinutes.value
  breakInput.value = breakMinutes.value
  saveMinutes()
  resetTimer()
}

// 탭이 숨겨질 때 기록 저장 (모바일 백그라운드 대응)
const handleVisibilityChange = () => {
  if (document.visibilityState === 'hidden') persistHistory()
}
document.addEventListener('visibilitychange', handleVisibilityChange)

// 언마운트 시 타이머 클리어 및 기록 저장
onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  persistHistory()
  if (timerId) clearInterval(timerId)
})
</script>

<template>
  <div class="pomodoro-container" :class="[mode + '-mode', { 'is-running': isRunning }]">
    <!-- 오늘 번 돈 (최저시급 환산, 상단 표시) -->
    <div class="earnings-banner">
      <span class="earnings-label">💰 오늘 번 돈</span>
      <span class="earnings-amount">{{ formattedEarnings }}</span>
      <span class="earnings-note">2026 최저시급 {{ minWageLabel }} 기준 · 오늘 {{ todayFocusLabel }} 집중</span>
    </div>

    <!-- 앱 상단 알림 허용 배너 -->
    <div v-if="!hasNotificationPermission" class="permission-banner">
      <span>🔔 알림을 허용하면 타이머 종료 시 알림을 받을 수 있습니다.</span>
      <button @click="requestNotificationPermission" class="banner-btn">알림 켜기</button>
    </div>
    
    <div class="timer-card">
      <!-- 탭 메뉴 (집중 / 휴식 선택) -->
      <div class="mode-tabs">
        <button 
          class="tab-btn focus-tab" 
          :class="{ active: mode === 'focus' }" 
          @click="toggleMode('focus')"
        >
          🔥 집중 ({{ focusTabLabel }})
        </button>
        <button 
          class="tab-btn break-tab" 
          :class="{ active: mode === 'break' }" 
          @click="toggleMode('break')"
        >
          🌿 휴식 ({{ breakTabLabel }})
        </button>
      </div>

      <!-- 원형 프로그레스 및 시간 표시 -->
      <div class="timer-display-wrapper">
        <svg class="progress-svg" width="240" height="240" viewBox="0 0 240 240">
          <circle 
            class="progress-bg-circle" 
            cx="120" 
            cy="120" 
            :r="radius" 
            stroke-width="12" 
          />
          <circle 
            class="progress-bar-circle" 
            cx="120" 
            cy="120" 
            :r="radius" 
            stroke-width="12"
            :stroke-dasharray="circumference"
            :stroke-dashoffset="progressOffset"
            stroke-linecap="round"
          />
        </svg>
        
        <!-- 중앙 타이머 텍스트 -->
        <div class="timer-text-container" :class="{ 'animate-pulse-slow': isRunning }">
          <div class="timer-time">{{ formattedTime }}</div>
          <div class="timer-status">
            {{ mode === 'focus' ? '집중하세요' : '숨을 고르세요' }}
          </div>
        </div>
      </div>

      <!-- 제어 컨트롤러 -->
      <div class="controls">
        <button v-if="!isRunning" @click="startTimer" class="btn btn-primary start-btn">
          시작하기
        </button>
        <button v-else @click="pauseTimer" class="btn btn-secondary pause-btn">
          일시정지
        </button>
        <button @click="resetTimer" class="btn btn-tertiary reset-btn">
          초기화
        </button>
      </div>
    </div>

    <!-- 나의 기록 카드 (연속일 / 오늘 집중 / 최근 세션) -->
    <div class="record-card">
      <div class="record-title">📊 나의 기록</div>
      <div class="record-stats">
        <div class="stat">
          <span class="stat-value">🔥 {{ streak }}일</span>
          <span class="stat-label">연속 집중</span>
        </div>
        <div class="stat">
          <span class="stat-value">⏱️ {{ todayFocusLabel }}</span>
          <span class="stat-label">오늘 집중</span>
        </div>
        <div class="stat">
          <span class="stat-value">🏆 {{ focusCount }}회</span>
          <span class="stat-label">오늘 완료</span>
        </div>
      </div>
      <div class="history-title">최근 완료 세션</div>
      <ul v-if="recentSessions.length > 0" class="history-list">
        <li v-for="(session, index) in recentSessions" :key="`${session.endTime}-${index}`" class="history-item">
          <span>{{ formatSessionTime(session.endTime) }}</span>
          <span>{{ formatDuration(session.seconds) }}</span>
        </li>
      </ul>
      <p v-else class="history-empty">아직 완료한 집중 세션이 없어요. 첫 세션을 시작해보세요!</p>
    </div>

    <!-- 시간 설정 메뉴 -->
    <div class="settings-menu">
      <button @click="toggleSettings" class="settings-toggle">
        {{ showSettings ? '✕ 설정 닫기' : '⚙️ 시간 설정' }}
      </button>
      <div v-if="showSettings" class="settings-panel">
        <label class="setting-row">
          <span>🔥 집중 시간</span>
          <span class="setting-input-wrap">
            <input type="number" v-model.number="focusInput" :min="MIN_MINUTES" :max="MAX_MINUTES" @change="applySettings" />
            <span class="unit">분</span>
          </span>
        </label>
        <label class="setting-row">
          <span>🌿 휴식 시간</span>
          <span class="setting-input-wrap">
            <input type="number" v-model.number="breakInput" :min="MIN_MINUTES" :max="MAX_MINUTES" @change="applySettings" />
            <span class="unit">분</span>
          </span>
        </label>
        <button @click="resetToDefaults" class="defaults-btn">기본값으로 되돌리기 (25분 / 5분)</button>
      </div>
    </div>

    <!-- 하단 퀵 설정 옵션 -->
    <div class="timer-settings">
      <label class="switch-container">
        <input type="checkbox" v-model="isTestMode" />
        <span class="slider"></span>
        <span class="switch-label">⚡ 빠른 테스트 모드 활성화 (집중 5초 / 휴식 3초)</span>
      </label>
    </div>
  </div>
</template>

<style scoped>
.pomodoro-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 500px;
  margin: 0 auto;
  padding: 20px;
  box-sizing: border-box;
  transition: var(--transition-smooth);
}

/* 테마 컬러 지정 */
.focus-mode {
  --theme-color: var(--focus-color);
  --theme-bg-soft: var(--focus-bg);
  --theme-border-soft: var(--focus-border);
}

.break-mode {
  --theme-color: var(--break-color);
  --theme-bg-soft: var(--break-bg);
  --theme-border-soft: var(--break-border);
}

/* 오늘 번 돈 배너 (상단) */
.earnings-banner {
  width: 100%;
  padding: 16px 20px;
  background: linear-gradient(135deg, rgba(255, 179, 0, 0.12), rgba(255, 179, 0, 0.05));
  border: 1px solid rgba(255, 179, 0, 0.35);
  border-radius: 20px;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-bottom: 24px;
  box-sizing: border-box;
}

.earnings-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.earnings-amount {
  font-size: 32px;
  font-weight: 800;
  color: var(--text-h);
  font-family: var(--mono);
  line-height: 1.2;
}

.earnings-note {
  font-size: 12px;
  color: var(--text);
}

/* 알림 권한 허용 배너 */
.permission-banner {
  width: 100%;
  padding: 12px 16px;
  background: rgba(255, 179, 0, 0.1);
  border: 1px solid rgba(255, 179, 0, 0.3);
  border-radius: 12px;
  font-size: 14px;
  color: var(--text-h);
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  gap: 12px;
  box-shadow: var(--shadow);
  backdrop-filter: blur(10px);
}

.banner-btn {
  background: var(--text-h);
  color: var(--bg);
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: opacity 0.2s;
}

.banner-btn:hover {
  opacity: 0.9;
}

/* 메인 타이머 카드 */
.timer-card {
  width: 100%;
  padding: 40px 30px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 32px;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: border-color 0.5s ease;
  backdrop-filter: blur(20px);
}

.focus-mode .timer-card {
  border-color: var(--focus-border);
}

.break-mode .timer-card {
  border-color: var(--break-border);
}

/* 모드 전환 탭 버튼 */
.mode-tabs {
  display: flex;
  background: var(--code-bg);
  padding: 6px;
  border-radius: 20px;
  margin-bottom: 32px;
  gap: 4px;
}

.tab-btn {
  border: none;
  background: transparent;
  padding: 10px 20px;
  border-radius: 16px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  color: var(--text);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.tab-btn.active {
  background: var(--bg);
  box-shadow: var(--shadow);
}

.focus-mode .tab-btn.active {
  color: var(--focus-color);
}

.break-mode .tab-btn.active {
  color: var(--break-color);
}

/* 원형 디스플레이 영역 */
.timer-display-wrapper {
  position: relative;
  width: 240px;
  height: 240px;
  margin-bottom: 40px;
}

.progress-svg {
  transform: rotate(-90deg);
}

.progress-bg-circle {
  fill: none;
  stroke: var(--code-bg);
  transition: stroke 0.5s ease;
}

.progress-bar-circle {
  fill: none;
  stroke: var(--theme-color);
  transition: stroke-dashoffset 1s linear, stroke 0.5s ease;
  filter: drop-shadow(0 0 4px var(--theme-color));
}

.is-running .progress-bar-circle {
  animation: progress-glow 3s infinite ease-in-out;
}

/* 시간 텍스트 레이아웃 */
.timer-text-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  user-select: none;
  transition: transform 0.3s;
}

.timer-time {
  font-family: var(--mono);
  font-size: 48px;
  font-weight: 700;
  color: var(--text-h);
  line-height: 1;
  margin-bottom: 8px;
}

.timer-status {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  letter-spacing: 1px;
  text-transform: uppercase;
}

/* 제어용 버튼군 */
.controls {
  display: flex;
  gap: 16px;
  width: 100%;
  justify-content: center;
  margin-bottom: 32px;
}

.btn {
  border: none;
  border-radius: 18px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.btn-primary {
  padding: 16px 36px;
  background: var(--theme-color);
  color: #fff;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  filter: brightness(1.05);
}

.btn-primary:active {
  transform: translateY(0);
}

.btn-secondary {
  padding: 16px 36px;
  background: var(--text-h);
  color: var(--bg);
}

.btn-secondary:hover {
  transform: translateY(-2px);
  filter: opacity(0.9);
}

.btn-tertiary {
  padding: 16px 24px;
  background: var(--code-bg);
  color: var(--text-h);
}

.btn-tertiary:hover {
  background: var(--border);
}

/* 나의 기록 카드 */
.record-card {
  width: 100%;
  margin-top: 24px;
  padding: 24px 20px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 24px;
  box-shadow: var(--shadow);
  box-sizing: border-box;
}

.record-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-h);
  margin-bottom: 16px;
}

.record-stats {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 4px;
  background: var(--code-bg);
  border-radius: 14px;
}

.stat-value {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-h);
  font-family: var(--mono);
}

.stat-label {
  font-size: 12px;
  color: var(--text);
}

.history-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-h);
  text-align: left;
  margin-bottom: 8px;
}

.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.history-item {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text);
  padding: 8px 12px;
  background: var(--code-bg);
  border-radius: 10px;
  font-family: var(--mono);
}

.history-empty {
  font-size: 13px;
  color: var(--text);
  margin: 0;
}

/* 시간 설정 메뉴 */
.settings-menu {
  margin-top: 24px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.settings-toggle {
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-h);
  padding: 10px 20px;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: var(--shadow);
}

.settings-toggle:hover {
  border-color: var(--theme-color);
  color: var(--theme-color);
}

.settings-panel {
  width: 100%;
  margin-top: 12px;
  padding: 20px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 20px;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-h);
}

.setting-input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.setting-input-wrap input {
  width: 80px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 15px;
  font-family: var(--mono);
  text-align: center;
  background: var(--code-bg);
  color: var(--text-h);
}

.setting-input-wrap input:focus {
  outline: none;
  border-color: var(--theme-color);
}

.setting-input-wrap .unit {
  font-size: 14px;
  color: var(--text);
}

.defaults-btn {
  border: none;
  background: var(--code-bg);
  color: var(--text);
  padding: 10px 16px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease;
}

.defaults-btn:hover {
  background: var(--border);
}

/* 퀵 설정 스위치 */
.timer-settings {
  margin-top: 24px;
}

.switch-container {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
  gap: 12px;
}

.switch-container input {
  display: none;
}

.slider {
  position: relative;
  width: 44px;
  height: 24px;
  background-color: var(--border);
  transition: .4s;
  border-radius: 34px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: .4s;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

input:checked + .slider {
  background-color: var(--theme-color);
}

input:checked + .slider:before {
  transform: translateX(20px);
}

.switch-label {
  font-size: 13px;
  color: var(--text);
}
</style>
