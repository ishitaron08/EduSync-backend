import { Router } from "express";
import { adminUserCrud, setAvailability, studentRewardPoints, teacherPerformance } from "./users.controller";

const usersRoute = Router();

usersRoute.get("/", adminUserCrud);
usersRoute.patch("/availability", setAvailability);
usersRoute.get("/performance", teacherPerformance);
usersRoute.get("/reward-points", studentRewardPoints);

export default usersRoute;
