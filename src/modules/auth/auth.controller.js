// Controllers stay thin: pull data out of req, call the service, shape the
// response. No business logic here — that all lives in auth.service.js.

import * as authService from './auth.service.js';

export async function registerHandler(req, res, next) {
  try {
    const { user, token } = await authService.register(req.body);

    res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      },
        token
      });
  } catch (err) {
    next(err);
  }
}

export async function loginHandler(req, res, next) {
  try {
    const { user, token } = await authService.login(req.body);

    res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role },
        token
      });
  } catch (err) {
    next(err);
  }
}

export async function changeRoleHandler(req, res, next) {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const user = await authService.changeUserRole(id, role);
    res.status(200).json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
}