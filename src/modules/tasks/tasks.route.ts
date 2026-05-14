import { Router } from "express";
import { completeStudentTask, createTask, listTasks } from "./tasks.controller";

const tasksRoute = Router();

tasksRoute.post("/", createTask);
tasksRoute.get("/", listTasks);
tasksRoute.patch("/:id/complete", completeStudentTask);

export default tasksRoute;
