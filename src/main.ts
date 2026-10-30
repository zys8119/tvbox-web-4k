import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import "virtual:uno.css";
import "./style.css";
import { startEmbeddedBackend, useEmbeddedBackend } from "./capacitor";
import App from "./App.vue";
import Home from "./views/Home.vue";
import Category from "./views/Category.vue";
import Search from "./views/Search.vue";
import Detail from "./views/Detail.vue";
import Player from "./views/Player.vue";
import History from "./views/History.vue";
import Favorites from "./views/Favorites.vue";
import Settings from "./views/Settings.vue";
import Sites from "./views/Sites.vue";
import SiteDetail from "./views/SiteDetail.vue";
import SitePlayer from "./views/SitePlayer.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: Home },
    { path: "/category/:tid", name: "category", component: Category },
    { path: "/search", name: "search", component: Search },
    { path: "/detail/:id", name: "detail", component: Detail },
    { path: "/play", name: "play", component: Player },
    { path: "/history", name: "history", component: History },
    { path: "/favorites", name: "favorites", component: Favorites },
    { path: "/settings", name: "settings", component: Settings },
    { path: "/sites", name: "sites", component: Sites },
    { path: "/site/detail", name: "site-detail", component: SiteDetail },
    { path: "/site/play", name: "site-play", component: SitePlayer },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

async function bootstrap(): Promise<void> {
  if (useEmbeddedBackend()) {
    await startEmbeddedBackend();
  }
  createApp(App).use(router).mount("#app");
}

void bootstrap();
