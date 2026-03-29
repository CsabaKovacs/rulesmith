import express from "express";

const app = express();

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/login/callback", (_req, res) => {
  try {
    res.redirect("/dashboard");
  } catch (error) {
    if (error instanceof SessionError) {
      res.status(401).json({ ok: false });
      return;
    }
    throw error;
  }
});

export default app;

class SessionError extends Error {}
