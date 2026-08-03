<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'

// 상수를 정의합니다. (초 단위)
const FOCUS_TIME_DEFAULT = 25 * 60
const BREAK_TIME_DEFAULT = 5 * 60

// 퀵 테스트용 모드 지원 (집중 5초, 휴식 3초)
const isTestMode = ref(false)

const focusTime = computed(() => isTestMode.value ? 5 : FOCUS_TIME_DEFAULT)
const breakTime = computed(() => isTestMode.value ? 3 : BREAK_TIME_DEFAULT)

// 타이머 상태 관리
const mode = ref<'focus' | 'break'>('focus')
const currentTime = ref(focusTime.value)
const isRunning = ref(false)
const focusCount = ref(0)
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
      icon: '/favicon.ico' // 기본 파비콘 혹은 적절한 아이콘 경로 지정
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
}

const resetTimer = () => {
  pauseTimer()
  currentTime.value = mode.value === 'focus' ? focusTime.value : breakTime.value
}

// 타이머 종료 처리 및 모드 전환
const handleTimerComplete = () => {
  pauseTimer()
  playSound(mode.value)
  
  if (mode.value === 'focus') {
    focusCount.value++
    sendNotification('집중 완료!', '25분 집중 세션이 완료되었습니다! 이제 5분 동안 휴식을 시작하세요.')
    
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

// 언마운트 시 타이머 클리어
onUnmounted(() => {
  if (timerId) clearInterval(timerId)
})
</script>

<template>
  <div class="pomodoro-container" :class="[mode + '-mode', { 'is-running': isRunning }]">
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
          🔥 집중 ({{ isTestMode ? '5초' : '25분' }})
        </button>
        <button 
          class="tab-btn break-tab" 
          :class="{ active: mode === 'break' }" 
          @click="toggleMode('break')"
        >
          🌿 휴식 ({{ isTestMode ? '3초' : '5분' }})
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

      <!-- 하단 정보 세션 카운터 -->
      <div class="session-counter">
        🏆 오늘 완료한 집중 횟수: <span class="counter-num">{{ focusCount }}</span>
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

/* 세션 카운터 */
.session-counter {
  font-size: 14px;
  color: var(--text);
  border-top: 1px solid var(--border);
  padding-top: 20px;
  width: 100%;
  text-align: center;
}

.counter-num {
  font-weight: 700;
  color: var(--theme-color);
  font-size: 16px;
  font-family: var(--mono);
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
