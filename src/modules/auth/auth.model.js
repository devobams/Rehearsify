// This is the ONLY file in this module allowed to import prisma and query
// the User table directly. auth.service.js calls these functions —
// it never imports prisma itself. Other MODULES never import this file at all;
// they call auth.service.js if they ever need something from here.

import prisma from '../../shared/db.js';

export async function findUserByEmail(email) {
  return prisma.user.findUnique({ where: { email } });
}

export async function createUser({ name, email, passwordHash, role }) {
  return prisma.user.create({
    data: { name, email, passwordHash, role },
  });
}

export async function findUserById(id) {
  return prisma.user.findUnique({ where: { id } });
}

export async function updateUserRole(id, role) {
  return prisma.user.update({ where: { id }, data: { role } });
}