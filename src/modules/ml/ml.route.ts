import { Router } from "express";
import { authenticate } from "../../middlewares/authMiddleware";
import { recommendTask, recommendTaskV2 } from "./ml.controller";

const mlRoute = Router();

mlRoute.post("/predict", authenticate, recommendTask);
mlRoute.post("/predict-v2", authenticate, recommendTaskV2);

export default mlRoute;
