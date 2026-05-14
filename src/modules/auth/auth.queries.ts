import { usersRepository } from "../users/users.queries";

export const authQueries = {
  findByEmail: usersRepository.findByEmail,
  createUser: usersRepository.create
};
