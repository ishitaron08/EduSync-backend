import { Router } from "express";
import { createGoal, getGoals } from "./goals.controller";

const goalsRoute = Router();

goalsRoute.post("/", createGoal);
goalsRoute.get("/", getGoals);

export default goalsRoute;
