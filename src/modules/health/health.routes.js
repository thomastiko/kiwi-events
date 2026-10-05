import express from "express";

import { getHealth } from "./health.controller.js";

const router = express.Router();

router.get("/", getHealth);

export default router;
