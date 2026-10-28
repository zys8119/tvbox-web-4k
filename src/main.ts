import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import "virtual:uno.css";
import "./style.css";
import App from "./App.vue";
import Home from "./views/Home.vue";
import Category from "./views/Category.vue";
import Search from "./views/Search.vue";
import Detail from "./views/Detail.vue";
import Player from "./views/Player.vue";
import History from "./views/History.vue";
import Favorites from "./views/Favorites.vue";

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
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

createApp(App).use(router).mount("#app");
