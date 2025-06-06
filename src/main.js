import { createApp } from 'vue';
import App from './App.vue';
import { createStore } from './store';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import 'vuetify/styles';

const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'dark'
  }
});

const store = createStore();

const app = createApp(App);
app.use(store);
app.use(vuetify);
app.mount('#app');