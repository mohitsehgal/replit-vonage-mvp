<template>
  <div class="waveform-container">
    <canvas ref="waveformCanvas" class="waveform-canvas"></canvas>
    <div class="animation-status" :class="{ 'pulsing': isListening || isPlaying }">
      <v-icon :icon="statusIcon" size="large" :color="statusColor"></v-icon>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue';
import gsap from 'gsap';

export default {
  name: 'SpeechWaveform',
  props: {
    isListening: {
      type: Boolean,
      default: false
    },
    isPlaying: {
      type: Boolean,
      default: false
    },
    audioLevel: {
      type: Number,
      default: 0
    }
  },
  setup(props) {
    const waveformCanvas = ref(null);
    let canvasContext = null;
    let animationFrame = null;
    let bars = [];
    
    // Computed properties for animation status
    const statusIcon = computed(() => {
      if (props.isListening) return 'mdi-microphone';
      if (props.isPlaying) return 'mdi-volume-high';
      return 'mdi-circle-outline';
    });
    
    const statusColor = computed(() => {
      if (props.isListening) return 'error';
      if (props.isPlaying) return 'primary';
      return 'grey';
    });
    
    // Initialize the canvas and animation
    onMounted(() => {
      const canvas = waveformCanvas.value;
      canvasContext = canvas.getContext('2d');
      
      // Set canvas dimensions
      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);
      
      // Initialize bars
      initBars();
      
      // Start animation loop
      startAnimation();
    });
    
    // Clean up resources
    onBeforeUnmount(() => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrame);
    });
    
    // Set canvas dimensions based on container size
    const resizeCanvas = () => {
      const canvas = waveformCanvas.value;
      if (!canvas) return;
      
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      
      // Reinitialize bars when canvas is resized
      initBars();
    };
    
    // Initialize bars for waveform visualization
    const initBars = () => {
      const canvas = waveformCanvas.value;
      if (!canvas) return;
      
      const barCount = Math.floor(canvas.width / 5); // 5px per bar with spacing
      bars = [];
      
      for (let i = 0; i < barCount; i++) {
        bars.push({
          height: Math.random() * 30 + 5, // Random initial height
          speed: Math.random() * 0.1 + 0.05 // Random speed
        });
      }
    };
    
    // Animation loop
    const startAnimation = () => {
      const animate = () => {
        animationFrame = requestAnimationFrame(animate);
        drawWaveform();
      };
      
      animationFrame = requestAnimationFrame(animate);
    };
    
    // Draw waveform on canvas
    const drawWaveform = () => {
      const canvas = waveformCanvas.value;
      if (!canvas || !canvasContext) return;
      
      // Clear canvas
      canvasContext.clearRect(0, 0, canvas.width, canvas.height);
      
      // Set bar style
      canvasContext.fillStyle = props.isListening ? '#FF5252' : 
                               (props.isPlaying ? '#1976D2' : '#BDBDBD');
      
      // Calculate amplitude multiplier based on props
      const amplitudeMultiplier = props.isListening || props.isPlaying ? 
                                (1 + props.audioLevel * 2) : 0.5;
      
      // Draw bars
      const barWidth = 3;
      const spacing = 2;
      const totalWidth = barWidth + spacing;
      const centerY = canvas.height / 2;
      
      for (let i = 0; i < bars.length; i++) {
        const bar = bars[i];
        
        // Update bar height with some randomness
        if (props.isListening || props.isPlaying) {
          // Animate more dramatically when active
          bar.height += Math.sin(Date.now() * bar.speed) * 0.5;
          bar.height = Math.max(5, Math.min(40, bar.height));
        } else {
          // Subtle animation when inactive
          bar.height = 10 + Math.sin(Date.now() * bar.speed) * 5;
        }
        
        // Apply amplitude multiplier
        const height = bar.height * amplitudeMultiplier;
        
        // Draw bar as rounded rectangle
        const x = i * totalWidth;
        const y = centerY - height / 2;
        
        canvasContext.beginPath();
        canvasContext.roundRect(x, y, barWidth, height, 1.5);
        canvasContext.fill();
      }
    };
    
    // Watch for changes in listening/playing state
    watch([() => props.isListening, () => props.isPlaying], () => {
      // Trigger animation changes when state changes
      gsap.to(bars, {
        duration: 0.3,
        height: (i) => props.isListening || props.isPlaying ? 
                      Math.random() * 40 + 10 : 
                      Math.random() * 10 + 5,
        stagger: 0.01,
        ease: "power2.out"
      });
    });
    
    return {
      waveformCanvas,
      statusIcon,
      statusColor
    };
  }
};
</script>

<style scoped>
.waveform-container {
  position: relative;
  width: 100%;
  height: 70px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.waveform-canvas {
  width: 100%;
  height: 100%;
}

.animation-status {
  position: absolute;
  border-radius: 50%;
  padding: 5px;
  background-color: rgba(255, 255, 255, 0.2);
  z-index: 1;
}

.pulsing {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.4);
  }
  70% {
    transform: scale(1.05);
    box-shadow: 0 0 0 10px rgba(255, 255, 255, 0);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0);
  }
}
</style>