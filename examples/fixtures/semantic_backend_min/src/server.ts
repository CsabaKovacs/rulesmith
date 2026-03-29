import express, { Router } from "express";

class HealthService {
  status() {
    return { ok: true };
  }
}

const router = Router();
const service = new HealthService();

router.get("/health", (_req, res) => {
  res.json(service.status());
});

export default express().use(router);
