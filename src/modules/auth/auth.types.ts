export type RegisterPayload = {
  name: string;
  email: string;
  password: string;
  role: "admin" | "teacher" | "student";
};

export type LoginPayload = {
  email: string;
  password: string;
};
