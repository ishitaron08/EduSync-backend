import { Router } from "express";
import { validateRequest } from "../../middlewares/validateRequest";
import { listGoalLibrary, selectOrCreateGoal } from "./controller";
import { selectGoalSchema } from "./validators";

const goalLibraryRoute = Router();

goalLibraryRoute.get("/", listGoalLibrary);
goalLibraryRoute.post("/", validateRequest(selectGoalSchema), selectOrCreateGoal);

export default goalLibraryRoute;
