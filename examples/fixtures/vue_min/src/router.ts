import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory(),
  routes: []
});

router.beforeEach((to) => {
  if (to.path === "/private") {
    return "/login";
  }
  return true;
});

export default router;
