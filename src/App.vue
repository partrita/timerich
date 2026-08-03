<script setup lang="ts">
import PomodoroTimer from './components/PomodoroTimer.vue'
</script>

<template>
  <main id="center">
    <div class="hero">
      <h1 class="app-title">시간부자 ⏱️</h1>
      <p class="subtitle">집중과 휴식을 통한 완벽한 시간 관리</p>
    </div>
    
    <PomodoroTimer />
    
    <div id="spacer"></div>
  </main>
</template>

<style scoped>
.hero {
  margin-bottom: 8px;
}
.app-title {
  margin: 16px 0 8px;
  background: linear-gradient(135deg, var(--text-h) 0%, var(--text) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.subtitle {
  font-size: 16px;
  color: var(--text);
  opacity: 0.8;
}
</style>
