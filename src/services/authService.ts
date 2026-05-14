import { authService } from "../modules/auth/auth.service";

export { authService };

export const registerUser = authService.registerUser;
export const loginUser = authService.loginUser;
