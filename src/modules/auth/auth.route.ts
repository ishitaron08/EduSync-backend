import { Router } from "express";
import { validateRequest } from "../../middlewares/validateRequest";
import { authenticate } from "../../middlewares/authMiddleware";
import { changePassword, login, logout, me, refresh, register, updateProfile } from "./auth.controller";
import { changePasswordSchema, loginSchema, logoutSchema, refreshSchema, registerSchema, updateProfileSchema } from "./auth.validater";

const authRoute = Router();

authRoute.post("/register", validateRequest(registerSchema), register);
authRoute.post("/login", validateRequest(loginSchema), login);
authRoute.post("/refresh", validateRequest(refreshSchema), refresh);
authRoute.post("/logout", validateRequest(logoutSchema), logout);
authRoute.get("/me", authenticate, me);
authRoute.patch("/profile", authenticate, validateRequest(updateProfileSchema), updateProfile);
authRoute.post("/change-password", authenticate, validateRequest(changePasswordSchema), changePassword);

export default authRoute;
