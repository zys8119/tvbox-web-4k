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

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: Home },
    { path: "/category/:tid", name: "category", component: Category },
    { path: "/search", name: "search", component: Search },
    { path: "/detail/:id", name: "detail", component: Detail },
    { path: "/play", name: "play", component: Player },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

createApp(App).use(router).mount("#app");
