// Business logic lives here. This file is the module's "public API" —
// anything another module needs from Auth gets called from here,
// never from auth.model.js directly.

import jwt from 'jsonwebtoken';
import config from '../../config/index.js';
import * as authModel from './auth.model.js';
import { hashPassword, comparePassword } from '../../shared/utils/password.js';

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}
export async function register({ name, email, password}) {
  // check email isn't already taken (authModel.findUserByEmail)
  if (await authModel.findUserByEmail(email)) {
    // throw a generic "email already taken" error
    const err = new Error('Email already taken');
    err.statusCode = 400;
    // throw the error
    throw err;

  }
  const passwordHash = await hashPassword(password);
  // assign default role for public registrations to be chorister
  const user = await authModel.createUser({ name, email, passwordHash, role: 'CHORISTER' });
  const token = signToken(user);
  return { user, token };
}

export async function login({ email, password }) {
  const user = await authModel.findUserByEmail(email);
  // if !user, throw a generic "invalid credentials" error —
  if (!user) {
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    // throw the error
    throw err;
  }
  // never reveal whether it was the email or password that was wrong (AUTH-1)
  const isValid = await comparePassword(password, user.passwordHash);
  // if !isValid, throw the same generic error as above
  if (!isValid) {
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
   //throw the error
    throw err;
  }
  const token = signToken(user);
  return { user, token };
}

// check if user exists before trying to change their role
export async function changeUserRole(id, newRole) {
  const user = await authModel.findUserById(id);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  return authModel.updateUserRole(id, newRole);
}